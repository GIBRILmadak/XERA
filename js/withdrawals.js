import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
    if (req.method !== "POST")
        return res.status(405).send("Method Not Allowed");

    // Vérification Token
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const {
        data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: "Invalid User" });

    const { amount, note } = req.body;
    const amountNum = parseFloat(amount);

    if (!amountNum || amountNum <= 0) {
        return res.status(400).json({ error: "Montant invalide" });
    }

    try {
        // 1. Récupérer les infos de paiement enregistrées
        const { data: settings } = await supabase
            .from("creator_payout_settings")
            .select("*")
            .eq("user_id", user.id)
            .single();

        if (!settings || !settings.wallet_number) {
            return res
                .status(400)
                .json({ error: "Aucun compte de paiement configuré" });
        }

        // 2. Insérer la demande (Le trigger SQL vérifiera si le solde est suffisant)
        const { data, error } = await supabase
            .from("withdrawal_requests")
            .insert({
                creator_id: user.id,
                amount: amountNum,
                amount_usd: amountNum,
                provider: settings.provider,
                wallet_number: settings.wallet_number,
                account_name: settings.account_name,
                status: "pending",
                note: note,
            })
            .select()
            .single();

        if (error) {
            console.error("Withdrawal DB Error:", error);
            // Message d'erreur user-friendly si trigger échoue (solde insuffisant)
            if (error.message.includes("insufficient")) {
                return res.status(400).json({ error: "Solde insuffisant" });
            }
            throw error;
        }

        res.status(200).json({ success: true, withdrawal: data });
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la demande de retrait" });
    }
}
