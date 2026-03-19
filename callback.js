import {
    supabase,
    verifySignedState,
    confirmSupportPayment,
    activateSubscription,
    failPendingTransaction,
    buildProfileReturnPath,
    PRIMARY_ORIGIN,
    escapeHtmlAttr,
} from "../lib/monetization";

export default async function handler(req, res) {
    // MaishaPay peut appeler en GET ou POST selon la config
    const params = req.method === "POST" ? req.body : req.query;
    const { status, description, transactionRefId, operatorRefId, state } =
        params;

    const payload = verifySignedState(state);
    if (!payload) {
        return res.status(400).send("Callback invalide");
    }

    try {
        const paymentKind = String(
            payload.payment_kind || "subscription",
        ).toLowerCase();
        const isSuccess =
            String(status) === "202" ||
            String(status).toLowerCase() === "success";

        if (isSuccess) {
            if (paymentKind === "support") {
                await confirmSupportPayment({
                    fromUserId: payload.from_user_id,
                    toUserId: payload.to_user_id,
                    amountUsd: payload.amount_usd,
                    checkoutCurrency: payload.checkout_currency,
                    checkoutAmount: payload.checkout_amount,
                    method: payload.method,
                    provider: payload.provider,
                    walletId: payload.wallet_id,
                    description: payload.description,
                    pendingTransactionId: payload.pending_transaction_id,
                    transactionRefId,
                    operatorRefId,
                    confirmationSource: "maishapay_callback",
                });
            } else {
                await activateSubscription({
                    userId: payload.user_id,
                    plan: payload.plan,
                    billingCycle: payload.billing_cycle,
                    currency: payload.currency,
                    amount: payload.amount,
                    transactionRefId,
                    operatorRefId,
                    method: payload.method,
                    provider: payload.provider,
                    walletId: payload.wallet_id,
                    pendingTransactionId: payload.pending_transaction_id,
                    confirmationSource: "maishapay_callback",
                });
            }
        } else {
            await failPendingTransaction({
                pendingTransactionId: payload.pending_transaction_id,
                transactionRefId,
                operatorRefId,
                reason:
                    description || String(status || "Paiement non confirme"),
                confirmationSource: "maishapay_callback",
            });
        }

        const successTitle =
            paymentKind === "support"
                ? "Soutien confirmé"
                : "Paiement confirmé";
        const successDescription =
            paymentKind === "support"
                ? "Le soutien a bien ete confirme et sera visible dans le dashboard du createur."
                : "Votre abonnement est activé.";
        const failureDescription =
            paymentKind === "support"
                ? "Le soutien n'a pas ete confirme. Veuillez reessayer ou changer de moyen de paiement."
                : "Veuillez réessayer ou changer de moyen de paiement.";
        const returnPath =
            paymentKind === "support"
                ? payload.return_path || "/"
                : payload.return_path ||
                  buildProfileReturnPath(payload.user_id);
        const returnHref = String(returnPath || "").startsWith("http")
            ? String(returnPath)
            : `${PRIMARY_ORIGIN}/${String(returnPath || "/").replace(/^\//, "")}`;
        const returnLabel =
            paymentKind === "support"
                ? "Retour a la page precedente"
                : "Retour au profil";
        const autoRedirectDelayMs = isSuccess ? 1400 : 2200;

        res.set("Content-Type", "text/html");
        res.send(`
      <!doctype html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Paiement ${isSuccess ? "réussi" : "échoué"}</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0b0b0b; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { max-width: 480px; padding: 32px; border-radius: 18px; background: #141414; border: 1px solid #2a2a2a; text-align: center; }
          .status { font-size: 22px; margin-bottom: 12px; }
          .desc { color: #9ca3af; margin-bottom: 20px; }
          a { color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 999px; border: 1px solid #2a2a2a; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="status">${isSuccess ? successTitle : "Paiement non confirmé"}</div>
          <div class="desc">${description || (isSuccess ? successDescription : failureDescription)}</div>
          <a href="${escapeHtmlAttr(returnHref)}">${returnLabel}</a>
        </div>
        <script>
          setTimeout(function () {
            window.location.replace(${JSON.stringify(returnHref)});
          }, ${autoRedirectDelayMs});
        </script>
      </body>
      </html>
    `);
    } catch (error) {
        console.error("Callback Error:", error);
        res.status(500).send("Erreur callback");
    }
}
