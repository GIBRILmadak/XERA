(function () {
    const WEB_APP_HEAD_ENTRIES = [
        {
            selector: 'link[rel="manifest"]',
            tagName: "link",
            attributes: {
                rel: "manifest",
                href: "/manifest.json",
            },
        },
        {
            selector: 'link[rel="icon"][sizes="192x192"]',
            tagName: "link",
            attributes: {
                rel: "icon",
                type: "image/png",
                sizes: "192x192",
                href: "/icons/logo-192x192.png",
            },
        },
        {
            selector: 'link[rel="icon"][sizes="512x512"]',
            tagName: "link",
            attributes: {
                rel: "icon",
                type: "image/png",
                sizes: "512x512",
                href: "/icons/logo-512x512.png",
            },
        },
        {
            selector: 'link[rel="shortcut icon"]',
            tagName: "link",
            attributes: {
                rel: "shortcut icon",
                href: "/icons/logo-192x192.png",
            },
        },
        {
            selector: 'link[rel="apple-touch-icon"]',
            tagName: "link",
            attributes: {
                rel: "apple-touch-icon",
                href: "/icons/logo-192x192.png",
            },
        },
        {
            selector: 'meta[name="theme-color"]',
            tagName: "meta",
            attributes: {
                name: "theme-color",
                content: "#050505",
            },
        },
        {
            selector: 'meta[name="mobile-web-app-capable"]',
            tagName: "meta",
            attributes: {
                name: "mobile-web-app-capable",
                content: "yes",
            },
        },
        {
            selector: 'meta[name="apple-mobile-web-app-capable"]',
            tagName: "meta",
            attributes: {
                name: "apple-mobile-web-app-capable",
                content: "yes",
            },
        },
        {
            selector: 'meta[name="apple-mobile-web-app-status-bar-style"]',
            tagName: "meta",
            attributes: {
                name: "apple-mobile-web-app-status-bar-style",
                content: "black",
            },
        },
    ];
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
        "404.html": "/404",
    };
    const CLEAN_TO_HTML_PATH = Object.fromEntries(
        Object.entries(HTML_TO_CLEAN_PATH).map(([htmlPath, cleanPath]) => [
            cleanPath,
            `/${htmlPath}`,
        ]),
    );
    CLEAN_TO_HTML_PATH["/pagepro"] = "/profile.html";

    const ROUTE_NAMES = {
        discover: "/",
        login: "/login",
        profile: "/profile",
        pagepro: "/pagepro",
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
        notFound: "/404",
    };

    const ROUTE_ALIASES = {
        home: "discover",
        index: "discover",
        discover: "discover",
        login: "login",
        profile: "profile",
        pagepro: "pagepro",
        analytics: "analytics",
        admin: "admin",
        badgesadmin: "badgesAdmin",
        createstream: "createStream",
        creatordashboard: "creatorDashboard",
        credits: "credits",
        stream: "stream",
        subscriptionplans: "subscriptionPlans",
        subscriptionpayment: "subscriptionPayment",
        verification: "verification",
        notfound: "notFound",
        404: "notFound",
    };

    function isSameOrigin(url) {
        return url.origin === window.location.origin;
    }

    function shouldNormalizeToCleanPath() {
        const { protocol, hostname } = window.location;
        if (protocol === "file:") return false;

        // Ne pas nettoyer le chemin (garder .html) en local pour éviter les 404 au refresh
        const isLocal =
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "0.0.0.0" ||
            hostname === "0" ||
            hostname.startsWith("192.168.") ||
            hostname.endsWith(".local");

        return !isLocal;
    }

    function normalizePathname(pathname) {
        return pathname === "/index.html" ? "/" : pathname;
    }

    function ensureHeadEntry({ selector, tagName, attributes }) {
        if (!document.head) return;

        let element = document.head.querySelector(selector);
        if (!element) {
            element = document.createElement(tagName);
            document.head.appendChild(element);
        }

        Object.entries(attributes).forEach(([name, value]) => {
            if (element.getAttribute(name) !== value) {
                element.setAttribute(name, value);
            }
        });
    }

    function ensureWebAppHead() {
        WEB_APP_HEAD_ENTRIES.forEach(ensureHeadEntry);
    }

    function mapHtmlPathToClean(pathname) {
        const normalized = pathname.startsWith("/")
            ? pathname.slice(1)
            : pathname;
        if (HTML_TO_CLEAN_PATH[normalized]) {
            return HTML_TO_CLEAN_PATH[normalized];
        }
        return normalizePathname(pathname);
    }

    function mapCleanPathToHtml(pathname) {
        const normalized = normalizePathname(pathname);
        if (normalized === "/pagepro" && shouldNormalizeToCleanPath()) {
            return normalized;
        }
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
                url.pathname + (url.search || "") + (url.hash || "");

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
                url.pathname + (url.search || "") + (url.hash || "");

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
                if (value === null || value === undefined || value === "")
                    return;
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

    function resolveRouteName(target) {
        if (typeof target !== "string") return null;
        if (ROUTE_NAMES[target]) return target;

        const normalized = target
            .trim()
            .replace(/^\//, "")
            .replace(/\.html$/i, "")
            .replace(/[^a-z0-9]+/gi, "")
            .toLowerCase();

        return ROUTE_ALIASES[normalized] || null;
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

    function isProAccountType(accountType, accountSubtype) {
        const values = [accountType, accountSubtype]
            .filter(
                (value) =>
                    value !== undefined && value !== null && value !== "",
            )
            .map((value) => String(value).trim().toLowerCase());

        return values.some((value) =>
            [
                "community",
                "enterprise",
                "company",
                "pro",
                "communauté",
                "entreprise",
                "institution",
                "organization",
                "organisation",
                "org",
                "team",
                "professional",
                "recruiter",
                "investor",
                "partner",
            ].includes(value),
        );
    }

    function buildProfileUrl(userId, accountType, accountSubtype) {
        const isPro = isProAccountType(accountType, accountSubtype);
        const route = isPro ? "pagepro" : "profile";
        return buildHtmlUrl(route, {
            query: userId ? { user: userId } : {},
        });
    }

    async function resolveCurrentUser() {
        if (window.currentUser?.id) {
            return window.currentUser;
        }

        if (window.currentUserId) {
            return { id: window.currentUserId };
        }

        if (typeof window.checkAuth === "function") {
            try {
                const user = await window.checkAuth();
                if (user?.id) {
                    return user;
                }
            } catch (error) {
                console.warn("[router] checkAuth fallback failed", error);
            }
        }

        const client = window.supabaseClient || window.supabase;
        if (client?.auth?.getUser) {
            try {
                const result = await client.auth.getUser();
                const user = result?.data?.user || null;
                if (user?.id) {
                    // Enrich with metadata if possible
                    const type =
                        user.user_metadata?.account_type || user.account_type;
                    user.account_type = type;

                    window.currentUser = window.currentUser || user;
                    window.currentUserId = window.currentUserId || user.id;
                    return user;
                }
            } catch (error) {
                console.warn("[router] Supabase user lookup failed", error);
            }
        }

        return null;
    }

    function fallbackNavigate(target, options = {}) {
        if (typeof target !== "string" || !target) return;

        if (target === "messages") {
            navigate("discover", {
                ...options,
                query: {
                    ...(options.query || {}),
                    messages: "1",
                },
            });
            return;
        }

        const routeName = resolveRouteName(target);
        if (routeName) {
            navigate(routeName, options);
            return;
        }

        const destination = toHtmlUrl(target);
        if (options.replace) {
            window.location.replace(destination);
            return;
        }

        window.location.assign(destination);
    }

    async function fallbackHandleProfileNavigation() {
        const user = await resolveCurrentUser();
        if (!user?.id) {
            navigate("login");
            return;
        }

        const type =
            user.user_metadata?.account_type || user.account_type || "personal";
        const subtype =
            user.user_metadata?.account_subtype ||
            user.account_subtype ||
            user.accountSubtype ||
            "personal";
        const isPro = isProAccountType(type, subtype);

        navigate(isPro ? "pagepro" : "profile", {
            query: { user: user.id },
        });
    }

    async function fallbackOpenMessagesPage() {
        const user = await resolveCurrentUser();
        if (!user?.id) {
            navigate("login");
            return;
        }

        navigate("discover", {
            query: { messages: "1" },
        });
    }

    function fallbackToggleNotificationPanel() {
        const panel = document.getElementById("notification-panel");
        if (panel) {
            panel.classList.toggle("show");
            return;
        }

        void fallbackOpenMessagesPage();
    }

    function normalizeLegacyProfileRoute(pathname, search) {
        const normalized = pathname.replace(/\/+/g, "/").replace(/\/$/, "");
        const pageProMatch = normalized.match(/^\/pagepro\/([\w-]{8,})$/i);
        if (pageProMatch) {
            return toHtmlUrl(
                `/pagepro?user=${encodeURIComponent(pageProMatch[1])}${search || ""}`,
            );
        }
        const profileMatch = normalized.match(/^\/profile\/([\w-]{8,})$/i);
        if (profileMatch) {
            return toHtmlUrl(
                `/profile?user=${encodeURIComponent(profileMatch[1])}${search || ""}`,
            );
        }
        return null;
    }

    function normalizeCurrentLocation() {
        const isLocal = !shouldNormalizeToCleanPath();
        const currentPath = normalizePathname(window.location.pathname);
        const legacyRedirect = normalizeLegacyProfileRoute(
            currentPath,
            window.location.search,
        );

        if (legacyRedirect) {
            window.history.replaceState({}, document.title, legacyRedirect);
            return;
        }

        if (isLocal) {
            // En local, on s'assure d'avoir le .html pour éviter les 404 au refresh
            const htmlPath = mapCleanPathToHtml(currentPath);
            if (htmlPath !== currentPath) {
                const nextUrl = `${htmlPath}${window.location.search}${window.location.hash}`;
                window.history.replaceState({}, document.title, nextUrl);
            }
            return;
        }

        const cleanPath = mapHtmlPathToClean(currentPath);
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

    function ensureRouteHelpers() {
        if (typeof window.navigateTo !== "function") {
            window.navigateTo = fallbackNavigate;
        }

        if (typeof window.buildProfileUrl !== "function") {
            window.buildProfileUrl = buildProfileUrl;
        }

        if (typeof window.handleProfileNavigation !== "function") {
            window.handleProfileNavigation = fallbackHandleProfileNavigation;
        }

        if (typeof window.openMessagesPage !== "function") {
            window.openMessagesPage = fallbackOpenMessagesPage;
        }

        if (typeof window.toggleNotificationPanel !== "function") {
            window.toggleNotificationPanel = fallbackToggleNotificationPanel;
        }
    }

    ensureWebAppHead();
    ensureRouteHelpers();

    document.addEventListener("DOMContentLoaded", () => {
        ensureWebAppHead();
        ensureRouteHelpers();
        normalizeCurrentLocation();
        updateLinks();
    });

    window.XeraRouter = {
        buildUrl,
        buildHtmlUrl,
        buildProfileUrl,
        ensureWebAppHead,
        navigate,
        normalizeCurrentLocation,
        resolveRouteName,
        toHtmlUrl,
        toCleanUrl,
        updateLinks,
    };
})();
