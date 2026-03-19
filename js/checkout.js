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
        const { plan, billing, userId, user_id, currency, return_path } =
            req.body;
        const customerId = userId || user_id;

        if (!customerId) return res.status(400).send("User ID required");

        // 1. Calcul du prix côté serveur (Sécurité)
        let amount = 0;
        if (plan === "standard") amount = 2.5;
        else if (plan === "medium") amount = 6.0;
        else if (plan === "pro") amount = 10.0;

        if (billing === "annual") {
            amount = amount * 12 * 0.8; // -20%
        }

        // 2. Création de la transaction "pending"
        const orderRef = `SUB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const { error } = await supabase.from("transactions").insert({
            user_id: customerId,
            type: "subscription",
            status: "pending",
            amount_gross: amount,
            amount_net_creator: 0,
            amount_commission_xera: amount,
            currency: currency || "USD",
            metadata: { plan, billing, orderRef },
        });

        if (error) {
            console.error("DB Error:", error);
            throw new Error("Erreur base de données");
        }

        // 3. Construction de l'URL MaishaPay
        // Note: Ceci est une intégration standard. Si MaishaPay utilise une API POST backend-to-backend,
        // il faudrait faire un fetch() ici. Pour l'instant, on redirige vers le gateway avec les clés.
        const params = new URLSearchParams({
            api_key: process.env.MAISHAPAY_PUBLIC_KEY,
            amount: amount,
            currency: currency || "USD",
            reference: orderRef,
            description: `Abonnement XERA ${plan}`,
            return_url: `${process.env.VERCEL_URL || "https://xera.vercel.app"}${return_path || "/profile.html"}`,
            callback_url: `${process.env.VERCEL_URL || "https://xera.vercel.app"}/api/maishapay/callback`,
        });

        // Redirection vers MaishaPay
        res.redirect(303, `https://maishapay.com/pay?${params.toString()}`);
    } catch (err) {
        console.error("Checkout Error:", err);
        res.status(500).send("Erreur lors de l'initialisation du paiement.");
    }
}
