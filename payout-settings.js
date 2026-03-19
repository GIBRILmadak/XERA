import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
    if (req.method !== "POST")
        return res.status(405).send("Method Not Allowed");

    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const {
        data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: "Invalid User" });

    const { provider, account_name, wallet_number, country_code, notes } =
        req.body;

    const { data, error } = await supabase
        .from("creator_payout_settings")
        .upsert({
            user_id: user.id,
            provider,
            account_name,
            wallet_number,
            country_code,
            notes,
            updated_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json({
        payoutSettings: {
            ...data,
            accountName: data.account_name,
            walletNumber: data.wallet_number,
        },
    });
}
