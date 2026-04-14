const app = require("../server/monetization-server");

function normalizeApiCatchAllUrl(req) {
    const rawUrl = String(req?.url || "/");
    const queryIndex = rawUrl.indexOf("?");
    const querySuffix = queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";
    const rawSegments = req?.query?.path;
    const pathSegments = (Array.isArray(rawSegments)
        ? rawSegments
        : rawSegments
          ? [rawSegments]
          : []
    )
        .map((segment) => String(segment || "").trim().replace(/^\/+|\/+$/g, ""))
        .filter(Boolean);

    if (pathSegments.length === 0) return;

    const normalizedPath =
        pathSegments[0] === "api"
            ? `/${pathSegments.join("/")}`
            : `/api/${pathSegments.join("/")}`;
    const nextUrl = `${normalizedPath}${querySuffix}`;

    if (rawUrl === nextUrl) return;

    req.url = nextUrl;
    req.originalUrl = nextUrl;
}

module.exports = function handler(req, res) {
    normalizeApiCatchAllUrl(req);
    return app(req, res);
};
