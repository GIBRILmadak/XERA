import { createClient } from "@supabase/supabase-js";

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    // Headers CORS pour autoriser les requêtes depuis le frontend
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
    );

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    try {
        // 1. Authentification
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: "Token manquant" });
        }

        const token = authHeader.replace("Bearer ", "");
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: "Session invalide" });
        }

        const userId = user.id;

        // 2. Récupération des données
        const [profileRes, settingsRes, transactionsRes, withdrawalsRes] =
            await Promise.all([
                supabase.from("users").select("*").eq("id", userId).single(),
                supabase
                    .from("creator_payout_settings")
                    .select("*")
                    .eq("user_id", userId)
                    .maybeSingle(),
                supabase
                    .from("transactions")
                    .select("*")
                    .eq("to_user_id", userId)
                    .in("status", ["succeeded", "pending"]),
                supabase
                    .from("withdrawal_requests")
                    .select("*")
                    .eq("creator_id", userId)
                    .order("created_at", { ascending: false }),
            ]);

        const profile = profileRes.data || {};
        const payoutSettings = settingsRes.data || {};
        const transactions = transactionsRes.data || [];
        const withdrawals = withdrawalsRes.data || [];

        // 3. Calcul du portefeuille (Wallet Logic)
        let supportAvailable = 0;
        let supportPending = 0;
        let videoAvailable = 0;
        let videoPending = 0;

        transactions.forEach((tx) => {
            const net = Number(tx.amount_net_creator || 0);
            if (tx.type === "support") {
                if (tx.status === "succeeded") supportAvailable += net;
                else if (tx.status === "pending") supportPending += net;
            } else if (tx.type === "video_rpm") {
                if (tx.status === "succeeded") videoAvailable += net;
                else if (tx.status === "pending") videoPending += net;
            }
        });

        let pendingWithdrawals = 0;
        let paidWithdrawals = 0;
        withdrawals.forEach((wd) => {
            const amount = Number(wd.amount_usd || 0);
            if (["pending", "processing"].includes(wd.status))
                pendingWithdrawals += amount;
            if (wd.status === "paid") paidWithdrawals += amount;
        });

        const creditedTotal = supportAvailable + videoAvailable;
        const availableBalance = Math.max(
            0,
            creditedTotal - pendingWithdrawals - paidWithdrawals,
        );

        // 4. Réponse JSON
        res.status(200).json({
            success: true,
            profile,
            payoutSettings,
            withdrawals,
            wallet: {
                currency: "USD",
                availableBalance: Number(availableBalance.toFixed(2)),
                pendingIncoming: Number(
                    (supportPending + videoPending).toFixed(2),
                ),
                pendingWithdrawals: Number(pendingWithdrawals.toFixed(2)),
                paidWithdrawals: Number(paidWithdrawals.toFixed(2)),
                lifetimeNetRevenue: Number(
                    (creditedTotal + paidWithdrawals).toFixed(2),
                ),
                minimumWithdrawalUsd: 5,
                canRequestWithdrawal:
                    availableBalance >= 5 && payoutSettings.status === "active",
            },
        });
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message || "Erreur serveur" });
    }
}
