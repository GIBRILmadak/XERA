import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    try {
        const {
            amount,
            creator_id,
            user_id,
            currency,
            return_path,
            description,
        } = req.body;

        if (!creator_id || !amount)
            return res.status(400).send("Missing parameters");

        const amountNum = parseFloat(amount);
        // Commission 20%
        const commission = amountNum * 0.2;
        const netCreator = amountNum - commission;

        // 1. Création transaction
        const orderRef = `SUP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const { error } = await supabase.from("transactions").insert({
            user_id: user_id, // Celui qui paie
            to_user_id: creator_id, // Celui qui reçoit
            type: "support",
            status: "pending",
            amount_gross: amountNum,
            amount_commission_xera: commission,
            amount_net_creator: netCreator,
            currency: currency || "USD",
            metadata: { orderRef, description },
        });

        if (error) throw error;

        // 2. Redirection MaishaPay
        const params = new URLSearchParams({
            api_key: process.env.MAISHAPAY_PUBLIC_KEY,
            amount: amountNum,
            currency: currency || "USD",
            reference: orderRef,
            description: description || "Soutien créateur XERA",
            return_url: `${process.env.VERCEL_URL || "https://xera.vercel.app"}${return_path || "/profile.html"}`,
            callback_url: `${process.env.VERCEL_URL || "https://xera.vercel.app"}/api/maishapay/callback`,
        });

        res.redirect(303, `https://maishapay.com/pay?${params.toString()}`);
    } catch (err) {
        console.error("Support Checkout Error:", err);
        res.status(500).send("Erreur lors du don.");
    }
}
