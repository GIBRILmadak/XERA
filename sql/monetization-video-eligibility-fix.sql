-- ========================================
-- CORRECTIF MONETISATION VIDEO > 60 SECONDES
-- A executer apres monetization-schema.sql
-- ========================================

CREATE OR REPLACE FUNCTION sync_video_view_eligibility()
RETURNS TRIGGER AS $$
BEGIN
    NEW.period_date = COALESCE(NEW.period_date, CURRENT_DATE);
    NEW.period_month = DATE_TRUNC('month', NEW.period_date)::DATE;
    NEW.eligible = COALESCE(NEW.video_duration, 0) > 60;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_video_view_eligibility ON video_views;
CREATE TRIGGER trigger_sync_video_view_eligibility
    BEFORE INSERT OR UPDATE ON video_views
    FOR EACH ROW
    EXECUTE FUNCTION sync_video_view_eligibility();

UPDATE video_views
SET
    period_date = COALESCE(period_date, CURRENT_DATE),
    period_month = DATE_TRUNC('month', COALESCE(period_date, CURRENT_DATE))::DATE,
    eligible = COALESCE(video_duration, 0) > 60,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION create_monthly_video_payout(
    p_creator_id UUID,
    p_period_month DATE
)
RETURNS UUID AS $$
DECLARE
    v_total_views BIGINT;
    v_amount_gross DECIMAL;
    v_payout_id UUID;
BEGIN
    SELECT COALESCE(SUM(view_count), 0)
    INTO v_total_views
    FROM video_views
    WHERE creator_id = p_creator_id
        AND period_month = p_period_month
        AND eligible = true
        AND COALESCE(video_duration, 0) > 60;

    v_amount_gross := (v_total_views / 1000.0) * 0.40;

    INSERT INTO video_payouts (
        creator_id,
        period_month,
        views,
        rpm_rate,
        amount_gross,
        amount_net_creator,
        amount_commission_xera,
        status
    )
    VALUES (
        p_creator_id,
        p_period_month,
        v_total_views,
        0.40,
        v_amount_gross,
        v_amount_gross * 0.80,
        v_amount_gross * 0.20,
        'pending'
    )
    ON CONFLICT (creator_id, period_month)
    DO UPDATE SET
        views = EXCLUDED.views,
        amount_gross = EXCLUDED.amount_gross,
        amount_net_creator = EXCLUDED.amount_net_creator,
        amount_commission_xera = EXCLUDED.amount_commission_xera,
        updated_at = NOW()
    RETURNING id INTO v_payout_id;

    RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql;

WITH open_payout_totals AS (
    SELECT
        vp.id,
        COALESCE(SUM(vv.view_count), 0) AS eligible_views
    FROM video_payouts vp
    LEFT JOIN video_views vv
        ON vv.creator_id = vp.creator_id
        AND vv.period_month = vp.period_month
        AND vv.eligible = true
        AND COALESCE(vv.video_duration, 0) > 60
    WHERE vp.status IN ('pending', 'processing')
    GROUP BY vp.id
)
UPDATE video_payouts vp
SET
    views = totals.eligible_views,
    amount_gross = ROUND(((totals.eligible_views / 1000.0) * vp.rpm_rate)::numeric, 2),
    amount_commission_xera = ROUND((((totals.eligible_views / 1000.0) * vp.rpm_rate) * 0.20)::numeric, 2),
    amount_net_creator = ROUND((((totals.eligible_views / 1000.0) * vp.rpm_rate) * 0.80)::numeric, 2),
    updated_at = NOW()
FROM open_payout_totals totals
WHERE vp.id = totals.id;
