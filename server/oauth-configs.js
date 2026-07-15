const OAUTH_CONFIGS = {
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
};

function getConfig(tool) {
    return OAUTH_CONFIGS[tool];
}

module.exports = {
    OAUTH_CONFIGS,
    getConfig,
};
