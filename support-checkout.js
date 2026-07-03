import {
    supabase,
    resolveUserId,
    roundMoney,
    canUserReceiveSupport,
    computeSupportCheckoutAmount,
    createPendingSupportPayment,
    createSignedState,
    renderMaishaPayCheckoutPage,
    sanitizeReturnPath,
    buildProfileReturnPath,
    sanitizePayoutText,
    MAISHAPAY_CALLBACK_ENABLED,
    CALLBACK_ORIGIN,
    MAISHAPAY_PUBLIC_KEY,
    MAISHAPAY_SECRET_KEY,
    MAISHAPAY_GATEWAY_MODE,
    inferMaishaPayKeyMode,
    maskKey,
    SUPPORT_MIN_USD,
    SUPPORT_MAX_USD,
    sendCheckoutErrorResponse,
} from "../lib/monetization";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    try {
        const {
            to_user_id: toUserId,
            amount_usd: rawAmountUsd,
            currency: currencyRaw,
            method = "card",
            provider,
            wallet_id: walletId,
            access_token: accessToken,
            user_id: fallbackUserId,
            description: rawDescription,
            return_path: rawReturnPath,
        } = req.body;

        if (!MAISHAPAY_PUBLIC_KEY || !MAISHAPAY_SECRET_KEY) {
            return res.status(500).send("MaishaPay keys not configured");
        }

        const fromUserId = await resolveUserId(accessToken, fallbackUserId);
        if (!fromUserId) {
            return res.status(401).send("Utilisateur non authentifié");
        }

        if (!toUserId) {
            return res.status(400).send("Destinataire manquant");
        }
        if (fromUserId === toUserId) {
            return res.status(400).send("Auto-soutien interdit");
        }

        const amountUsd = roundMoney(rawAmountUsd);
        if (
            !Number.isFinite(amountUsd) ||
            amountUsd < SUPPORT_MIN_USD ||
            amountUsd > SUPPORT_MAX_USD
        ) {
            return res
                .status(400)
                .send(
                    `Le soutien doit etre entre ${SUPPORT_MIN_USD} et ${SUPPORT_MAX_USD} USD`,
                );
        }
        if (!Number.isInteger(amountUsd)) {
            return res
                .status(400)
                .send("Le soutien doit etre un montant entier en USD.");
        }

        const currency = String(currencyRaw || "USD").toUpperCase();
        if (!["USD", "CDF"].includes(currency)) {
            return res.status(400).send("Devise invalide");
        }

        const [senderResult, recipientResult] = await Promise.all([
            supabase
                .from("users")
                .select("id, name")
                .eq("id", fromUserId)
                .maybeSingle(),
            supabase
                .from("users")
                .select(
                    "id, name, followers_count, plan, plan_status, plan_ends_at, is_monetized",
                )
                .eq("id", toUserId)
                .maybeSingle(),
        ]);
        if (senderResult.error) throw senderResult.error;
        if (recipientResult.error) throw recipientResult.error;

        const senderProfile = senderResult.data || null;
        const recipientProfile = recipientResult.data || null;
        if (!senderProfile) {
            return res
                .status(400)
                .send(
                    "Profil expediteur introuvable. Rechargez votre session.",
                );
        }
        if (!recipientProfile) {
            return res.status(404).send("Createur introuvable");
        }
        if (!canUserReceiveSupport(recipientProfile)) {
            return res
                .status(400)
                .send("Ce createur n'est pas eligible aux soutiens.");
        }

        const checkoutAmount = computeSupportCheckoutAmount(
            amountUsd,
            currency,
        );
        if (!checkoutAmount) {
            return res.status(400).send("Montant invalide");
        }

        const description = sanitizePayoutText(rawDescription, 160);
        const returnPath = sanitizeReturnPath(
            rawReturnPath,
            buildProfileReturnPath(toUserId),
        );
        const pendingPayment = await createPendingSupportPayment({
            fromUserId,
            toUserId,
            amountUsd,
            checkoutAmount,
            checkoutCurrency: currency,
            method,
            provider,
            walletId,
            description:
                description ||
                `Soutien pour ${recipientProfile.name || "un createur"}`,
            senderName: senderProfile.name || "Utilisateur",
            recipientName: recipientProfile.name || "Createur",
        });

        let callbackUrl = null;
        if (MAISHAPAY_CALLBACK_ENABLED) {
            const statePayload = {
                payment_kind: "support",
                from_user_id: fromUserId,
                to_user_id: toUserId,
                pending_transaction_id: pendingPayment.id,
                checkout_ref_id: pendingPayment.checkoutRefId,
                amount_usd: amountUsd,
                checkout_amount: checkoutAmount,
                checkout_currency: currency,
                method: String(method || "card").toLowerCase(),
                provider: provider || null,
                wallet_id: walletId || null,
                description:
                    description ||
                    `Soutien pour ${recipientProfile.name || "un createur"}`,
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

        console.info("[MaishaPay support checkout]", {
            gatewayMode: String(MAISHAPAY_GATEWAY_MODE),
            publicKey: maskKey(MAISHAPAY_PUBLIC_KEY),
            secretKey: maskKey(MAISHAPAY_SECRET_KEY),
            callbackEnabled: MAISHAPAY_CALLBACK_ENABLED,
            callbackOrigin: CALLBACK_ORIGIN,
            pendingTransactionId: pendingPayment.id,
            checkoutRefId: pendingPayment.checkoutRefId,
            fromUserId,
            toUserId,
            amountUsd,
            checkoutAmount,
            currency,
            method: String(method || "card").toLowerCase(),
        });

        res.set("Content-Type", "text/html");
        res.send(
            renderMaishaPayCheckoutPage({
                amount: checkoutAmount,
                currency,
                callbackUrl,
            }),
        );
    } catch (err) {
        console.error("Support Checkout Error:", err);
        return sendCheckoutErrorResponse(res, err, "Erreur MaishaPay");
    }
}
