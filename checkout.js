import {
    supabase,
    resolveUserId,
    isValidPlanId,
    computeMaishaPayAmount,
    createPendingSubscriptionPayment,
    createSignedState,
    renderMaishaPayCheckoutPage,
    sanitizeReturnPath,
    buildProfileReturnPath,
    MAISHAPAY_CALLBACK_ENABLED,
    CALLBACK_ORIGIN,
    MAISHAPAY_PUBLIC_KEY,
    MAISHAPAY_SECRET_KEY,
    MAISHAPAY_GATEWAY_MODE,
    inferMaishaPayKeyMode,
    maskKey,
    sendCheckoutErrorResponse,
} from "../lib/monetization";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    try {
        if (!MAISHAPAY_PUBLIC_KEY || !MAISHAPAY_SECRET_KEY) {
            return res.status(500).send("MaishaPay keys not configured");
        }

        const {
            plan,
            billing_cycle: billingCycleRaw,
            currency: currencyRaw,
            method = "card",
            provider,
            wallet_id: walletId,
            access_token: accessToken,
            user_id: fallbackUserId,
            return_path: rawReturnPath,
        } = req.body || {};

        const planId = String(plan || "").toLowerCase();
        const billingCycle =
            String(billingCycleRaw || "monthly").toLowerCase() === "annual"
                ? "annual"
                : "monthly";
        const currency = String(currencyRaw || "USD").toUpperCase();
        const allowedCurrencies = new Set(["USD", "CDF"]);

        if (!isValidPlanId(planId)) {
            return res.status(400).send("Plan invalide");
        }
        if (!allowedCurrencies.has(currency)) {
            return res.status(400).send("Devise invalide");
        }

        const userId = await resolveUserId(accessToken, fallbackUserId);
        if (!userId) {
            return res.status(401).send("Utilisateur non authentifié");
        }

        const returnPath = sanitizeReturnPath(
            rawReturnPath,
            buildProfileReturnPath(userId),
        );

        const amount = computeMaishaPayAmount(planId, billingCycle, currency);
        if (!amount) {
            return res.status(400).send("Montant invalide");
        }

        const pendingPayment = await createPendingSubscriptionPayment({
            userId,
            plan: planId,
            billingCycle,
            currency,
            amount,
            method,
            provider,
            walletId,
        });

        let callbackUrl = null;
        if (MAISHAPAY_CALLBACK_ENABLED) {
            const statePayload = {
                user_id: userId,
                pending_transaction_id: pendingPayment.id,
                checkout_ref_id: pendingPayment.checkoutRefId,
                plan: planId,
                billing_cycle: billingCycle,
                currency,
                amount,
                method: String(method || "card").toLowerCase(),
                provider: provider || null,
                wallet_id: walletId || null,
                return_path: returnPath,
                issued_at: Date.now(),
                expires_at: Date.now() + 2 * 60 * 60 * 1000,
            };
            const state = createSignedState(statePayload);
            if (!state) {
                return res.status(500).send("Callback secret manquant");
            }
            callbackUrl = `${CALLBACK_ORIGIN}/api/maishapay/callback/${encodeURIComponent(state)}`;
        }

        console.info("[MaishaPay checkout]", {
            gatewayMode: String(MAISHAPAY_GATEWAY_MODE),
            publicKey: maskKey(MAISHAPAY_PUBLIC_KEY),
            secretKey: maskKey(MAISHAPAY_SECRET_KEY),
            publicKeyMode: inferMaishaPayKeyMode(MAISHAPAY_PUBLIC_KEY),
            secretKeyMode: inferMaishaPayKeyMode(MAISHAPAY_SECRET_KEY),
            callbackEnabled: MAISHAPAY_CALLBACK_ENABLED,
            callbackOrigin: CALLBACK_ORIGIN,
            pendingTransactionId: pendingPayment.id,
            checkoutRefId: pendingPayment.checkoutRefId,
            plan: planId,
            billingCycle,
            currency,
            method: String(method || "card").toLowerCase(),
        });

        res.set("Content-Type", "text/html");
        res.send(
            renderMaishaPayCheckoutPage({
                amount,
                currency,
                callbackUrl,
            }),
        );
    } catch (err) {
        console.error("Checkout Error:", err);
        return sendCheckoutErrorResponse(res, err, "Erreur MaishaPay");
    }
}
