function readEnv(...keys) {
    for (const key of keys) {
        const value = process.env[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            return String(value).trim();
        }
    }
    return "";
}

const FATA_ISSUER = readEnv(
    "FATA_OIDC_ISSUER",
    "FATA_ISSUER",
    "https://fata.app/oidc",
).replace(/\/$/, "");
const FATA_API_BASE = readEnv(
    "FATA_API_BASE_URL",
    "FATA_API_BASE",
    "https://fata.app/api",
).replace(/\/$/, "");
const FATA_DISCOVERY_URL = readEnv(
    "FATA_OIDC_DISCOVERY_URL",
    `${FATA_ISSUER}/.well-known/openid-configuration`,
);

function buildOauthConfigs() {
    const FATA_ISSUER = readEnv(
        "FATA_OIDC_ISSUER",
        "FATA_ISSUER",
        "https://fata.app/oidc",
    ).replace(/\/$/, "");
    const FATA_API_BASE = readEnv(
        "FATA_API_BASE_URL",
        "FATA_API_BASE",
        "https://fata.app/api",
    ).replace(/\/$/, "");
    const FATA_DISCOVERY_URL = readEnv(
        "FATA_OIDC_DISCOVERY_URL",
        `${FATA_ISSUER}/.well-known/openid-configuration`,
    );

    return {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            authUrl: "https://github.com/login/oauth/authorize",
            tokenUrl: "https://github.com/login/oauth/access_token",
            scope: "repo,user",
        },
        figma: {
            clientId: process.env.FIGMA_CLIENT_ID,
            clientSecret: process.env.FIGMA_CLIENT_SECRET,
            authUrl: "https://www.figma.com/oauth",
            tokenUrl: "https://www.figma.com/api/oauth/token",
            scope: "files:read",
        },
        notion: {
            clientId: process.env.NOTION_CLIENT_ID,
            clientSecret: process.env.NOTION_CLIENT_SECRET,
            authUrl: "https://api.notion.com/v1/oauth/authorize",
            tokenUrl: "https://api.notion.com/v1/oauth/token",
            scope: "offline_access openid profile email read:content",
        },
        "google-cloud": {
            clientId: process.env.GOOGLE_CLOUD_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLOUD_CLIENT_SECRET,
            authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
            tokenUrl: "https://oauth2.googleapis.com/token",
            scope: "https://www.googleapis.com/auth/cloud-platform.read-only",
        },
        fata: {
            clientId: readEnv("FATA_CLIENT_ID", "CLIENT_ID"),
            clientSecret: readEnv(
                "FATA_CLIENT_SECRET",
                "CLIENT_SECRET",
                "fata_client_secret",
            ),
            issuer: FATA_ISSUER,
            discoveryUrl: FATA_DISCOVERY_URL,
            authUrl: readEnv("FATA_OIDC_AUTH_URL", "https://fata.app/oidc/auth"),
            tokenUrl: readEnv("FATA_OIDC_TOKEN_URL", "https://fata.app/oidc/token"),
            jwksUrl: readEnv("FATA_OIDC_JWKS_URL", "https://fata.app/oidc/jwks"),
            apiBase: FATA_API_BASE,
            scope: "openid profile action-completions:connect",
        },
    };
}

const OAUTH_CONFIGS = buildOauthConfigs();

function getConfig(tool) {
    return buildOauthConfigs()[tool];
}

module.exports = {
    OAUTH_CONFIGS,
    getConfig,
    readEnv,
    buildOauthConfigs,
};
