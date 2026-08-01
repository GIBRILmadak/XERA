function normalizeBrowserRoutePath(pathname) {
    const normalizedPath = String(pathname || "/").trim();
    const cleanPath = normalizedPath === "" ? "/" : normalizedPath;

    const htmlRouteMap = {
        "/": "/index.html",
        "/login": "/login.html",
        "/profile": "/profile.html",
        "/analytics": "/analytics.html",
        "/admin": "/admin.html",
        "/badges-admin": "/badges-admin.html",
        "/create-stream": "/create-stream.html",
        "/creator-dashboard": "/creator-dashboard.html",
        "/credits": "/credits.html",
        "/stream": "/stream.html",
        "/subscription-plans": "/subscription-plans.html",
        "/verification": "/verification.html",
        "/404": "/404.html",
        "/pagepro": "/profile.html",
    };

    return htmlRouteMap[cleanPath] || cleanPath;
}

function normalizeReturnPathForBrowser(value, fallbackPath = "/", baseOrigin = "http://localhost:3000") {
    const fallback = String(fallbackPath || "/").trim() || "/";
    const raw = String(value || "").trim();
    if (!raw) return fallback;

    try {
        const baseUrl = new URL(baseOrigin || "http://localhost:3000");
        const url = new URL(raw, baseUrl);
        if (url.origin !== baseUrl.origin) {
            return fallback;
        }

        const normalizedPath = normalizeBrowserRoutePath(url.pathname);
        return `${normalizedPath}${url.search}${url.hash}` || "/";
    } catch (error) {
        return fallback;
    }
}

module.exports = {
    normalizeReturnPathForBrowser,
    normalizeBrowserRoutePath,
};
