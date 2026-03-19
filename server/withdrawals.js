import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
    );

    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) return res.status(401).json({ error: "Unauthorized" });

        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser(token);
        if (authError || !user)
            return res.status(401).json({ error: "Invalid token" });

        if (req.method === "GET") {
            const { data } = await supabase
                .from("withdrawal_requests")
                .select("*")
                .eq("creator_id", user.id)
                .order("created_at", { ascending: false })
                .limit(20);
            return res
                .status(200)
                .json({ success: true, withdrawals: data || [] });
        }

        if (req.method === "POST") {
            const amount = Number(req.body.amount);
            if (!amount || amount < 5)
                return res
                    .status(400)
                    .json({ error: "Montant invalide (min 5$)" });

            const { data, error } = await supabase.rpc(
                "request_automatic_withdrawal",
                {
                    p_user_id: user.id,
                    p_amount: amount,
                },
            );

            if (error) {
                console.error("RPC Error:", error);
                return res
                    .status(400)
                    .json({
                        error:
                            error.message || "Impossible de créer le retrait",
                    });
            }

            const withdrawalId = data?.withdrawal_id || data;
            const { data: withdrawal } = await supabase
                .from("withdrawal_requests")
                .select("*")
                .eq("id", withdrawalId)
                .single();

            return res.status(200).json({ success: true, withdrawal });
        }

        res.status(405).json({ error: "Method not allowed" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}
