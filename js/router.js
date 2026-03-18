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
    const CLEAN_TO_HTML_PATH = Object.fromEntries(
        Object.entries(HTML_TO_CLEAN_PATH).map(([htmlPath, cleanPath]) => [
            cleanPath,
            `/${htmlPath}`,
        ]),
    );

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

    function shouldNormalizeToCleanPath() {
        const { protocol, hostname } = window.location;
        if (protocol === "file:") return false;
        return hostname !== "localhost" && hostname !== "127.0.0.1";
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

    function mapCleanPathToHtml(pathname) {
        const normalized = normalizePathname(pathname);
        if (CLEAN_TO_HTML_PATH[normalized]) {
            return CLEAN_TO_HTML_PATH[normalized];
        }
        return pathname;
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

    function toHtmlUrl(target, options = {}) {
        const base = options.base || window.location.href;

        try {
            const url = new URL(target, base);
            if (!isSameOrigin(url)) {
                return url.toString();
            }

            url.pathname = mapCleanPathToHtml(url.pathname);
            const relative =
                url.pathname +
                (url.search || "") +
                (url.hash || "");

            return relative || "/index.html";
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

    function buildHtmlUrl(routeName, options = {}) {
        return toHtmlUrl(buildUrl(routeName, options));
    }

    function navigate(target, options = {}) {
        const { replace = false, query, hash } = options;
        const destination =
            query || hash || ROUTE_NAMES[target]
                ? buildHtmlUrl(target, { query, hash })
                : toHtmlUrl(target);

        if (replace) {
            window.location.replace(destination);
            return;
        }

        window.location.assign(destination);
    }

    function normalizeCurrentLocation() {
        if (!shouldNormalizeToCleanPath()) return;
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
            anchor.setAttribute("href", toHtmlUrl(href));
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        normalizeCurrentLocation();
        updateLinks();
    });

    window.XeraRouter = {
        buildUrl,
        buildHtmlUrl,
        navigate,
        normalizeCurrentLocation,
        toHtmlUrl,
        toCleanUrl,
        updateLinks,
    };
})();
