const app = require("../../../server/monetization-server");

module.exports = function handler(req, res) {
    const rawUrl = String(req?.url || "");
    const queryIndex = rawUrl.indexOf("?");
    const querySuffix = queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";
    const state = String(req?.query?.state || "").trim();
    const targetPath = state
        ? `/api/maishapay/callback/${encodeURIComponent(state)}`
        : "/api/maishapay/callback";
    const nextUrl = `${targetPath}${querySuffix}`;

    req.url = nextUrl;
    req.originalUrl = nextUrl;

    return app(req, res);
};
