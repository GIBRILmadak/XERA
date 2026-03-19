import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
    );

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
        return res.status(405).json({ error: "Method not allowed" });

    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) return res.status(401).json({ error: "Unauthorized" });

        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser(token);
        if (authError || !user)
            return res.status(401).json({ error: "Invalid token" });

        const { provider, account_name, wallet_number, country_code, notes } =
            req.body;

        if (!provider || !account_name || !wallet_number) {
            return res
                .status(400)
                .json({ error: "Champs obligatoires manquants" });
        }

        const { data, error } = await supabase
            .from("creator_payout_settings")
            .upsert(
                {
                    user_id: user.id,
                    channel: "mobile_money",
                    provider,
                    account_name,
                    wallet_number,
                    country_code: country_code || "CD",
                    status: "active",
                    notes,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" },
            )
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({ success: true, payoutSettings: data });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}
