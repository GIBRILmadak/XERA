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

// POST /api/auth/:tool/start
router.post("/:tool/start", async (req, res) => {
    const { tool } = req.params;
    const config = getConfig(tool);

    if (!config) {
        return res.status(400).json({ error: "Outil non supporté" });
    }

    // Vérifier le type de compte (doit être PERSONAL)
    // (Note: l'authentification de l'utilisateur doit être faite en amont)
    const authHeader = req.headers.authorization;
    const {
        data: { user },
    } = await supabase.auth.getUser(authHeader?.split(" ")[1]);

    if (!user || user.user_metadata.account_type !== "PERSONAL") {
        return res
            .status(403)
            .json({ error: "Accès restreint aux comptes personnels" });
    }

    const state = crypto.randomBytes(16).toString("hex");
    // Sauvegarder le state pour vérification au callback
    await supabase
        .from("oauth_states")
        .insert({ user_id: user.id, state, tool });

    const redirectUri = `${process.env.APP_BASE_URL}/api/auth/${tool}/callback`;
    const authUrl = `${config.authUrl}?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(config.scope)}&state=${encodeURIComponent(state)}&response_type=code`;
    res.json({ authUrl });
});

router.get("/status", async (req, res) => {
    const authHeader = req.headers.authorization;
    const {
        data: { user },
    } = await supabase.auth.getUser(authHeader?.split(" ")[1]);
    if (!user) {
        return res.status(401).json({ error: "Utilisateur non identifié" });
    }

    const { data, error } = await supabase
        .from("user_oauth_tokens")
        .select("tool,status,expires_at,updated_at")
        .eq("user_id", user.id);

    if (error) {
        return res
            .status(500)
            .json({ error: "Impossible de lire le statut de connexion" });
    }

    return res.json({ connections: data || [] });
});

// GET /api/auth/:tool/callback
router.get("/:tool/callback", async (req, res) => {
    const { tool } = req.params;
    const { code, state } = req.query;
    const config = getConfig(tool);

    if (!config || !code || !state) {
        return res.status(400).json({ error: "Paramètres invalides" });
    }

    // 1. Vérifier le state
    const { data: storedState } = await supabase
        .from("oauth_states")
        .select("user_id")
        .eq("state", state)
        .eq("tool", tool)
        .single();

    if (!storedState) {
        return res.status(400).json({ error: "State invalide" });
    }

    // 2. Échanger le code contre un token
    const redirectUri = `${process.env.APP_BASE_URL}/api/auth/${tool}/callback`;
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
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
        console.error("[OAuth] Échec échange token:", tokenData);
        return res
            .status(500)
            .json({ error: "Impossible de récupérer le token OAuth" });
    }

    // 3. Sauvegarder le token chiffré
    await supabase.from("user_oauth_tokens").insert({
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
        inserted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });

    // 4. Enqueue l'ingestion, ne pas bloquer le callback OAuth
    await enqueueIngestion(storedState.user_id, tool, {
        source: "oauth_connect",
    });

    res.redirect(`${process.env.APP_BASE_URL}/profile?connection=success`);
});

module.exports = router;
