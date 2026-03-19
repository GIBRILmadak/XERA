-- =================================================================
-- AUTOMATIC WITHDRAWALS & WALLET
-- Création de la table portefeuille et fonctions de retrait auto.
-- =================================================================

-- 1. Créer la table des portefeuilles si elle n'existe pas
CREATE TABLE IF NOT EXISTS creator_wallets (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    available_balance NUMERIC(10, 2) DEFAULT 0.00,
    pending_withdrawals NUMERIC(10, 2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Fonction pour recalculer le solde exact à partir de l'historique (Synchronisation)
CREATE OR REPLACE FUNCTION sync_creator_wallet(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_income NUMERIC(10, 2) := 0;
    v_withdrawn NUMERIC(10, 2) := 0;
    v_pending NUMERIC(10, 2) := 0;
BEGIN
    -- Somme des revenus validés (Soutiens + Revenus Vidéo)
    SELECT COALESCE(SUM(amount_net_creator), 0) INTO v_income
    FROM transactions
    WHERE to_user_id = p_user_id AND status = 'succeeded' AND type IN ('support', 'video_rpm');

    -- Somme des retraits déjà payés
    SELECT COALESCE(SUM(amount_usd), 0) INTO v_withdrawn
    FROM withdrawal_requests
    WHERE creator_id = p_user_id AND status = 'paid';

    -- Somme des retraits en attente
    SELECT COALESCE(SUM(amount_usd), 0) INTO v_pending
    FROM withdrawal_requests
    WHERE creator_id = p_user_id AND status IN ('pending', 'processing');

    -- Mise à jour ou création du portefeuille
    INSERT INTO creator_wallets (user_id, available_balance, pending_withdrawals, updated_at)
    VALUES (p_user_id, (v_income - v_withdrawn - v_pending), v_pending, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        available_balance = EXCLUDED.available_balance,
        pending_withdrawals = EXCLUDED.pending_withdrawals,
        updated_at = NOW();
END;
$$;

-- 3. Fonction pour initier le retrait automatique
CREATE OR REPLACE FUNCTION request_automatic_withdrawal(p_user_id UUID, p_amount NUMERIC)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet creator_wallets%ROWTYPE;
    v_payout_settings creator_payout_settings%ROWTYPE;
    v_withdrawal_request withdrawal_requests%ROWTYPE;
    v_min_withdrawal_amount NUMERIC := 5.00;
    v_payout_details json;
BEGIN
    -- S'assurer que le portefeuille est à jour avant de vérifier le solde
    PERFORM sync_creator_wallet(p_user_id);

    -- Récupérer les infos
    SELECT * INTO v_wallet FROM creator_wallets WHERE user_id = p_user_id;
    SELECT * INTO v_payout_settings FROM creator_payout_settings WHERE user_id = p_user_id;

    -- Validations
    IF v_payout_settings IS NULL OR v_payout_settings.status != 'active' THEN
        RAISE EXCEPTION 'Paramètres de paiement non configurés ou inactifs.';
    END IF;

    IF p_amount < v_min_withdrawal_amount THEN
        RAISE EXCEPTION 'Le montant minimum est de % USD.', v_min_withdrawal_amount;
    END IF;

    IF v_wallet.available_balance < p_amount THEN
        RAISE EXCEPTION 'Solde insuffisant (% USD disponible).', v_wallet.available_balance;
    END IF;

    -- Débiter le portefeuille (passage en pending)
    UPDATE creator_wallets
    SET available_balance = available_balance - p_amount,
        pending_withdrawals = pending_withdrawals + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Créer la demande de retrait
    INSERT INTO withdrawal_requests (
        creator_id, payout_setting_id, amount_usd, requested_amount, requested_currency,
        channel, provider, wallet_number, account_name, country_code, note, status
    ) VALUES (
        p_user_id, v_payout_settings.id, p_amount, p_amount, 'USD',
        v_payout_settings.channel, v_payout_settings.provider, v_payout_settings.wallet_number, v_payout_settings.account_name, v_payout_settings.country_code, 'Retrait automatique initié', 'processing'
    ) RETURNING * INTO v_withdrawal_request;

    -- Retourner les infos pour l'API
    RETURN json_build_object(
        'withdrawal_id', v_withdrawal_request.id,
        'amount', v_withdrawal_request.amount_usd,
        'wallet_number', v_payout_settings.wallet_number,
        'provider', v_payout_settings.provider
    );
END;
$$;