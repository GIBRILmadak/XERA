const { getConfig } = require("./oauth-configs");
const { resolveChallengeConfig } = require("./fata-contract");

let cachedToken = null;
let tokenExpiresAt = 0;

function invalidateTechnicalToken() {
    cachedToken = null;
    tokenExpiresAt = 0;
}

async function getTechnicalToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    const config = getConfig("fata");
    if (!config || !config.clientId || !config.clientSecret) {
        throw new Error("Fata OAuth configuration or credentials missing");
    }

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
        console.error("[Fata API] Token request error:", response.status, err);
        throw new Error(
            `Failed to get Fata technical token: HTTP ${response.status}`,
        );
    }

    const data = await response.json();
    if (!data || !data.access_token) {
        throw new Error("Invalid token response from Fata");
    }

    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + Math.max(10, (data.expires_in || 3600) - 60) * 1000;
    return cachedToken;
}

/**
 * Send action completion to Fata with 401 single-retry mechanism
 * @param {Object} payload { subject, challengeId, requirementId, occurredAt }
 * @param {string} idempotencyKey
 */
async function sendActionCompletion(payload, idempotencyKey) {
    const config = getConfig("fata");
    if (!config) {
        throw new Error("Fata OAuth config missing");
    }

    // Validate that the challenge configuration exists
    resolveChallengeConfig(payload.challengeId);

    const body = {
        subject: payload.subject,
        challengeId: payload.challengeId,
        requirementId: payload.requirementId,
        occurredAt: payload.occurredAt,
    };

    const apiBase = String(
        config.apiBase || process.env.FATA_API_BASE_URL || "https://fata.app/api",
    ).replace(/\/$/, "");

    let token = await getTechnicalToken();

    const executeRequest = async (currentToken) => {
        return fetch(`${apiBase}/v1/action-completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${currentToken}`,
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify(body),
        });
    };

    let response = await executeRequest(token);

    // Contract rule: 401 -> invalidate token -> refresh -> retry ONCE immediately
    if (response.status === 401) {
        console.warn("[Fata API] 401 Unauthorized received. Refreshing technical token and retrying once...");
        invalidateTechnicalToken();
        token = await getTechnicalToken();
        response = await executeRequest(token);
    }

    return response;
}

module.exports = {
    getTechnicalToken,
    invalidateTechnicalToken,
    sendActionCompletion,
};
