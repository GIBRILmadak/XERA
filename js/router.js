(function () {
    const HTML_TO_CLEAN_PATH = {
        "index.html": "/",
        "login.html": "/login",
        "profile.html": "/profile",
        "analytics.html": "/analytics",
        "admin.html": "/admin",
        "badges-admin.html": "/badges-admin",
        "create-stream.html": "/create-stream",
        "creator-dashboard.html": "/creator-dashboard",
        "credits.html": "/credits",
        "stream.html": "/stream",
        "subscription-plans.html": "/subscription-plans",
        "subscription-payment.html": "/subscription-payment",
        "verification.html": "/verification",
    };

    const ROUTE_NAMES = {
        discover: "/",
        login: "/login",
        profile: "/profile",
        analytics: "/analytics",
        admin: "/admin",
        badgesAdmin: "/badges-admin",
        createStream: "/create-stream",
        creatorDashboard: "/creator-dashboard",
        credits: "/credits",
        stream: "/stream",
        subscriptionPlans: "/subscription-plans",
        subscriptionPayment: "/subscription-payment",
        verification: "/verification",
    };

    function isSameOrigin(url) {
        return url.origin === window.location.origin;
    }

    function normalizePathname(pathname) {
        return pathname === "/index.html" ? "/" : pathname;
    }

    function mapHtmlPathToClean(pathname) {
        const normalized = pathname.startsWith("/") ? pathname.slice(1) : pathname;
        if (HTML_TO_CLEAN_PATH[normalized]) {
            return HTML_TO_CLEAN_PATH[normalized];
        }
        return normalizePathname(pathname);
    }

    function toCleanUrl(target, options = {}) {
        const base = options.base || window.location.href;

        try {
            const url = new URL(target, base);
            if (!isSameOrigin(url)) {
                return url.toString();
            }

            url.pathname = mapHtmlPathToClean(url.pathname);
            const relative =
                url.pathname +
                (url.search || "") +
                (url.hash || "");

            return relative || "/";
        } catch (error) {
            return target;
        }
    }

    function buildUrl(routeName, options = {}) {
        const { query, hash } = options;
        const basePath = ROUTE_NAMES[routeName] || toCleanUrl(routeName);
        const url = new URL(basePath, window.location.origin);

        if (query && typeof query === "object") {
            Object.entries(query).forEach(([key, value]) => {
                if (value === null || value === undefined || value === "") return;
                url.searchParams.set(key, String(value));
            });
        }

        if (hash) {
            url.hash = hash.startsWith("#") ? hash : `#${hash}`;
        }

        return `${url.pathname}${url.search}${url.hash}`;
    }

    function navigate(target, options = {}) {
        const { replace = false, query, hash } = options;
        const destination =
            query || hash || ROUTE_NAMES[target]
                ? buildUrl(target, { query, hash })
                : toCleanUrl(target);

        if (replace) {
            window.location.replace(destination);
            return;
        }

        window.location.assign(destination);
    }

    function normalizeCurrentLocation() {
        const cleanPath = mapHtmlPathToClean(window.location.pathname);
        const currentPath = normalizePathname(window.location.pathname);
        if (cleanPath === currentPath) return;

        const nextUrl = `${cleanPath}${window.location.search}${window.location.hash}`;
        window.history.replaceState({}, document.title, nextUrl);
    }

    function updateLinks(root = document) {
        root.querySelectorAll("a[href]").forEach((anchor) => {
            const href = anchor.getAttribute("href");
            if (!href || href.startsWith("#")) return;
            anchor.setAttribute("href", toCleanUrl(href));
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        normalizeCurrentLocation();
        updateLinks();
    });

    window.XeraRouter = {
        buildUrl,
        navigate,
        normalizeCurrentLocation,
        toCleanUrl,
        updateLinks,
    };
})();
