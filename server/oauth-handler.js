const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const { getConfig } = require("./oauth-configs");
const { encryptToken } = require("./oauth-token-manager");
const { enqueueIngestion } = require("./ingestion-queue");

// Réutiliser le client supabase du server principal si possible,
// sinon créer une instance. Pour l'instant, on suppose qu'il est passé ou recréé.
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function getBearerToken(req) {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token) {
        return token;
    }
    return null;
}

function getSafeRedirectBase() {
    return String(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

// POST /api/auth/:tool/start
router.post("/:tool/start", async (req, res) => {
    const { tool } = req.params;
    const config = getConfig(tool);

    if (!config) {
        return res.status(400).json({ error: "Outil non supporté" });
    }

    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: "Utilisateur non identifié" });
    }

    try {
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: "Utilisateur non identifié" });
        }

        const state = crypto.randomBytes(16).toString("hex");
        const { error: stateError } = await supabase
            .from("oauth_states")
            .insert({ user_id: user.id, state, tool });

        if (stateError) {
            console.error("[OAuth] state insert error:", stateError);
            return res.status(500).json({ error: "Impossible de démarrer la connexion OAuth" });
        }

        const redirectUri = `${getSafeRedirectBase()}/api/auth/${tool}/callback`;
        const authUrl = `${config.authUrl}?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(config.scope)}&state=${encodeURIComponent(state)}&response_type=code`;
        return res.json({ authUrl });
    } catch (error) {
        console.error("[OAuth] start error:", error);
        return res.status(500).json({ error: "Impossible de démarrer la connexion OAuth" });
    }
});

router.get("/status", async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: "Utilisateur non identifié" });
    }

    try {
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: "Utilisateur non identifié" });
        }

        const { data, error: statusError } = await supabase
            .from("user_oauth_tokens")
            .select("tool,status,expires_at,updated_at")
            .eq("user_id", user.id);

        if (statusError) {
            return res
                .status(500)
                .json({ error: "Impossible de lire le statut de connexion" });
        }

        return res.json({ connections: data || [] });
    } catch (error) {
        console.error("[OAuth] status error:", error);
        return res.status(500).json({ error: "Impossible de lire le statut de connexion" });
    }
});

// GET /api/auth/:tool/callback
router.get("/:tool/callback", async (req, res) => {
    const { tool } = req.params;
    const { code, state } = req.query;
    const config = getConfig(tool);

    if (!config || !code || !state) {
        return res.status(400).json({ error: "Paramètres invalides" });
    }

    try {
        const { data: storedState, error: stateError } = await supabase
            .from("oauth_states")
            .select("user_id")
            .eq("state", state)
            .eq("tool", tool)
            .maybeSingle();

        if (stateError || !storedState) {
            return res.status(400).json({ error: "State invalide" });
        }

        const redirectUri = `${getSafeRedirectBase()}/api/auth/${tool}/callback`;
        const tokenParams = new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
        });

        const tokenResponse = await fetch(config.tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: tokenParams.toString(),
        });

        if (!tokenResponse.ok) {
            console.error("[OAuth] token exchange failed:", tokenResponse.status);
            return res.status(502).json({ error: "Impossible de récupérer le token OAuth" });
        }

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            console.error("[OAuth] Échec échange token:", tokenData);
            return res
                .status(500)
                .json({ error: "Impossible de récupérer le token OAuth" });
        }

        const { error: tokenUpsertError } = await supabase
            .from("user_oauth_tokens")
            .upsert(
                {
                    user_id: storedState.user_id,
                    tool,
                    access_token_encrypted: encryptToken(tokenData.access_token),
                    refresh_token_encrypted: tokenData.refresh_token
                        ? encryptToken(tokenData.refresh_token)
                        : null,
                    expires_at: tokenData.expires_in
                        ? new Date(
                              Date.now() + Number(tokenData.expires_in) * 1000,
                          ).toISOString()
                        : null,
                    status: "active",
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,tool" },
            );

        if (tokenUpsertError) {
            console.error("[OAuth] token save error:", tokenUpsertError);
            return res.status(500).json({ error: "Impossible de sauvegarder le token OAuth" });
        }

        const { error: clearStateError } = await supabase
            .from("oauth_states")
            .delete()
            .eq("state", state)
            .eq("tool", tool);

        if (clearStateError) {
            console.warn("[OAuth] state cleanup warning:", clearStateError);
        }

        try {
            await enqueueIngestion(storedState.user_id, tool, {
                source: "oauth_connect",
            });
        } catch (ingestionError) {
            console.warn("[OAuth] ingestion enqueue warning:", ingestionError);
        }

        return res.redirect(`${getSafeRedirectBase()}/profile?connection=success`);
    } catch (error) {
        console.error("[OAuth] callback error:", error);
        return res.status(500).json({ error: "Erreur pendant le callback OAuth" });
    }
});

module.exports = router;
