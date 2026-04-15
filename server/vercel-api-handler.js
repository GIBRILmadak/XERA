const app = require("./monetization-server");

function normalizeApiCatchAllUrl(req, prefixSegments = []) {
    const rawUrl = String(req?.url || "/");
    const queryIndex = rawUrl.indexOf("?");
    const querySuffix = queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";
    const rawSegments = req?.query?.path;
    const pathValue = Array.isArray(rawSegments)
        ? rawSegments.join("/")
        : String(rawSegments || "");
    const normalizedPathValue = pathValue.trim().replace(/^\/+|\/+$/g, "");
    const allSegments = [...prefixSegments, normalizedPathValue].filter(Boolean);

    if (allSegments.length === 0) return;

    const nextUrl = `/api/${allSegments.join("/")}${querySuffix}`;
    if (rawUrl === nextUrl) return;

    req.url = nextUrl;
    req.originalUrl = nextUrl;
}

function createApiHandler(prefixSegments = []) {
    return function handler(req, res) {
        normalizeApiCatchAllUrl(req, prefixSegments);
        return app(req, res);
    };
}

module.exports = {
    createApiHandler,
    normalizeApiCatchAllUrl,
};
