const { getConfig } = require("./oauth-configs");
const { resolveChallengeConfig } = require("./fata-contract");

let cachedToken = null;
let tokenExpiresAt = 0;

async function getTechnicalToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    const config = getConfig("fata");
    if (!config) throw new Error("Fata OAuth config missing");

    const params = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "action-completions:write",
    });

    const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("[Fata API] Token error:", err);
        throw new Error(
            `Failed to get Fata technical token: ${response.status}`,
        );
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}

/**
 * Send action completion to Fata
 * @param {Object} payload { subject, challengeId, requirementId, occurredAt }
 * @param {string} idempotencyKey
 */
async function sendActionCompletion(payload, idempotencyKey) {
    const config = getConfig("fata");
    if (!config) {
        throw new Error("Fata OAuth config missing");
    }

    const challenge = resolveChallengeConfig(payload.challengeId);
    if (challenge.is_test) {
        throw new Error(
            "Test challenge cannot be submitted to Fata real endpoint",
        );
    }

    const token = await getTechnicalToken();
    const body = {
        subject: payload.subject,
        challengeId: payload.challengeId,
        requirementId: payload.requirementId,
        occurredAt: payload.occurredAt,
    };

    const apiBase = String(config.apiBase || process.env.FATA_API_BASE_URL || "https://fata.app/api").replace(/\/$/, "");
    const response = await fetch(`${apiBase}/v1/action-completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
    });

    return response;
}

module.exports = {
    sendActionCompletion,
};
