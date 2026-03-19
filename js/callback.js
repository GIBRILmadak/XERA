import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
    // MaishaPay peut appeler en GET ou POST selon la config
    const params = req.method === "POST" ? req.body : req.query;
    const { reference, status } = params;

    // Si pas de référence, on ignore
    if (!reference) {
        return res.status(400).json({ error: "No reference provided" });
    }

    try {
        // 1. Récupérer la transaction en attente
        const { data: transaction, error: fetchError } = await supabase
            .from("transactions")
            .select("*")
            .eq("metadata->>orderRef", reference)
            .single();

        if (fetchError || !transaction) {
            return res.status(404).json({ error: "Transaction not found" });
        }

        // Si déjà traité, on arrête
        if (transaction.status === "succeeded") {
            return res.status(200).json({ message: "Already processed" });
        }

        // 2. Vérifier le succès (Selon MaishaPay, success/paid/00)
        // On accepte "success", "SUCCESS", "paid" ou "00"
        const isSuccess = ["success", "paid", "00"].includes(
            String(status).toLowerCase(),
        );

        if (isSuccess) {
            // A. Marquer la transaction comme réussie
            await supabase
                .from("transactions")
                .update({
                    status: "succeeded",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", transaction.id);

            // B. Si c'est un ABONNEMENT, activer le plan de l'utilisateur
            if (transaction.type === "subscription") {
                const plan = transaction.metadata?.plan || "standard";
                await supabase
                    .from("users")
                    .update({
                        plan: plan,
                        plan_status: "active",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", transaction.user_id);
            }

            // C. Si c'est un DON (Support), créer une notification pour le créateur
            if (transaction.type === "support") {
                await supabase.from("notifications").insert({
                    user_id: transaction.to_user_id,
                    type: "support",
                    title: "Nouveau soutien !",
                    message: `Vous avez reçu un soutien de ${transaction.amount_gross} ${transaction.currency}.`,
                    metadata: { transaction_id: transaction.id },
                });
            }

            return res.status(200).json({ success: true });
        } else {
            // Paiement échoué
            await supabase
                .from("transactions")
                .update({ status: "failed" })
                .eq("id", transaction.id);
            return res
                .status(200)
                .json({ success: false, reason: "Payment failed" });
        }
    } catch (error) {
        console.error("Callback Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
