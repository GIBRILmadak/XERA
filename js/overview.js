import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
    // Vérification basique du token (Header Authorization)
    // Dans un vrai projet, utilisez supabase.auth.getUser(token)
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user)
        return res.status(401).json({ error: "Invalid token" });

    const userId = user.id;

    // Récupération Données
    const [settingsRes, txRes, withdrawalsRes] = await Promise.all([
        supabase
            .from("creator_payout_settings")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle(),
        supabase
            .from("transactions")
            .select("amount_net_creator, status")
            .eq("to_user_id", userId)
            .eq("status", "succeeded"),
        supabase
            .from("withdrawal_requests")
            .select("*")
            .eq("creator_id", userId)
            .order("created_at", { ascending: false }),
    ]);

    const rawSettings = settingsRes.data || {};
    const payoutSettings = {
        provider: rawSettings.provider,
        accountName: rawSettings.account_name,
        walletNumber: rawSettings.wallet_number,
        countryCode: rawSettings.country_code,
        notes: rawSettings.notes,
        status:
            rawSettings.status ||
            (rawSettings.wallet_number ? "active" : "inactive"),
    };

    // Calculs
    const totalNet = (txRes.data || []).reduce(
        (sum, t) => sum + (Number(t.amount_net_creator) || 0),
        0,
    );
    const withdrawals = withdrawalsRes.data || [];
    const paidW = withdrawals
        .filter((w) => w.status === "paid")
        .reduce((sum, w) => sum + (Number(w.amount_usd || w.amount) || 0), 0);
    const pendingW = withdrawals
        .filter((w) => ["pending", "processing"].includes(w.status))
        .reduce((sum, w) => sum + (Number(w.amount_usd || w.amount) || 0), 0);

    const available = totalNet - paidW - pendingW;

    res.status(200).json({
        wallet: {
            availableBalance: Math.max(0, available),
            pendingIncoming: 0,
            pendingWithdrawals: pendingW,
            paidWithdrawals: paidW,
            minimumWithdrawalUsd: 5,
            canRequestWithdrawal: available >= 5,
        },
        payoutSettings,
        withdrawals: withdrawals.map((w) => ({
            ...w,
            amountUsd: w.amount_usd || w.amount,
        })),
    });
}
