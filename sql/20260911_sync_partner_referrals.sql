-- XERA1: Sync partner_referrals from partner_affiliations
-- This ensures that the partner dashboard correctly displays all affiliated users.

CREATE OR REPLACE FUNCTION public.sync_partner_referrals()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.partner_referrals (partner_id, user_id)
  VALUES (NEW.partner_id, NEW.user_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_referrals ON public.partner_affiliations;
CREATE TRIGGER trg_sync_referrals
AFTER INSERT ON public.partner_affiliations
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_referrals();
