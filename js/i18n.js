// Lightweight i18n + language toggle for landing
(() => {
    const STORAGE_KEY = "rize_lang";
    const AUTO_CACHE_KEY = "rize_lang_auto";
    const GEO_TIMEOUT_MS = 1800;
    const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

    function setCookie(name, value, maxAgeSeconds) {
        document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
            value,
        )}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
    }

    function getCookie(name) {
        const match = document.cookie
            .split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith(`${encodeURIComponent(name)}=`));
        if (!match) return null;
        return decodeURIComponent(match.split("=")[1]);
    }
    const translations = {
        en: {
            navDiscover: "Discover",
            navProfile: "My Trajectory",
            navAuth: "Login / Register",
            heroEyebrow: "TRACK YOUR GOALS WITH PROJECTS",
            heroTitle: "Turn your progress into opportunities.",
            heroLede:
                "XERA is a progression infrastructure where builders document their work, attract the right audiences (investors, collaborators, community) and transform their progress into real reputation.",
            heroBullet1: "Create a project or goal",
            heroBullet2: "Publish your track record with evidence, target those who see your progress, attract collaborators, investors, or financial support",
            heroBullet3: "Build a reputation based on execution",
            heroCTA: "Start your first project",
            heroWatch: "Watch 60s demo",
            heroMeta: "Project creation → update logging → dashboard.",
            heroBadge: "60s demo preview",
            heroFootnote:
                "Trimmed to the essentials: Project creation → update logging → dashboard.",
            discoverTitle: "In motion",
            discoverSub: "Live trajectories, proof first.",
            searchPlaceholder: "Search creators or projects",
        },
        fr: {
            navDiscover: "Découvrir",
            navProfile: "Ma Trajectoire",
            navAuth: "Connexion / Inscription",
            heroEyebrow: "SUIVEZ VOS OBJECTIFS AVEC LES PROJETS",
            heroTitle: "Transformez votre progression en opportunités.",
            heroLede:
                "XERA est une infrastructure de progression où les builders documentent leur travail, attirent les bonnes audiences (investisseurs, collaborateurs, communauté) et transforment leurs avancées en réputation réelle.",
            heroBullet1: "Créez des projets (plans du début à la fin)",
            heroBullet2:
                "Publiez vos traces avec preuves,Ciblez qui voit votre progression",
            heroBullet3: "Attirez collaborateurs, investisseurs ou soutien financier, et Construisez une réputation basée sur l’exécution",
            heroCTA: "Lancez votre premier projet",
            heroWatch: "Voir la démo 60s",
            heroMeta:
                "Création de projet → mise à jour quotidienne → tableau de bord.",
            heroBadge: "Aperçu démo 60s",
            heroFootnote:
                "Essentiels : création projet → mise à jour → dashboard.",
            discoverTitle: "En mouvement",
            discoverSub: "Trajectoires en direct, preuves d'abord.",
            searchPlaceholder: "Recherchez des créateurs ou des projets",
        },
    };

    let currentLang = null;

    function mapCountryToLang(countryCode, region) {
        const cc = (countryCode || "").toUpperCase();
        const reg = (region || "").toUpperCase();
        const frCountries = [
            "FR",
            "BE",
            "CH",
            "LU",
            "MC",
            "CI",
            "CM",
            "SN",
            "BF",
            "ML",
            "NE",
            "BJ",
            "TG",
            "CD",
            "CG",
            "GA",
            "GQ",
            "HT",
        ];
        if (cc === "CA") {
            // Rough heuristic: Quebec -> FR, else EN
            if (reg === "QC") return "fr";
            return "en";
        }
        if (frCountries.includes(cc)) return "fr";
        return "en";
    }

    async function fetchGeoLang() {
        // Use public IP API with short timeout; silently fail on CORS/offline
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
        try {
            const res = await fetch("https://ipapi.co/json/", {
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) return null;
            const data = await res.json();
            return mapCountryToLang(data.country, data.region);
        } catch (_e) {
            clearTimeout(timer);
            return null;
        }
    }

    function detectInitialLang() {
        // 1) User choice (cookie or storage)
        const cookieLang = getCookie(STORAGE_KEY);
        if (cookieLang) return cookieLang;
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return stored;

        // 2) Cached auto detection to avoid repeated geo lookups
        const cached =
            getCookie(AUTO_CACHE_KEY) || localStorage.getItem(AUTO_CACHE_KEY);
        if (cached) return cached;

        // 3) Browser language
        const navLang = (navigator.language || "").toLowerCase();
        if (navLang.includes("en") || navLang.endsWith("us")) return "en";
        if (navLang.startsWith("fr")) return "fr";

        // 4) Default English
        return "en";
    }

    function applyTranslations() {
        const dict = translations[currentLang] || translations.en;
        document.documentElement.setAttribute(
            "lang",
            currentLang === "fr" ? "fr" : "en",
        );

        // Inner text translations
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            if (dict[key]) el.textContent = dict[key];
        });

        // Placeholder translations
        document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
            const key = el.getAttribute("data-i18n-placeholder");
            if (dict[key]) el.setAttribute("placeholder", dict[key]);
        });
    }

    function setLanguage(lang) {
        currentLang = lang === "fr" ? "fr" : "en";
        localStorage.setItem(STORAGE_KEY, currentLang);
        setCookie(STORAGE_KEY, currentLang, COOKIE_MAX_AGE);
        applyTranslations();
        // Sync dropdown if present
        const select = document.getElementById("lang-select");
        if (select && select.value !== currentLang) {
            select.value = currentLang;
        }
    }

    function setupLanguageControl() {
        const select = document.getElementById("lang-select");
        if (!select) return;
        select.value = currentLang;
        select.onchange = (e) => setLanguage(e.target.value);
    }

    async function init() {
        currentLang = detectInitialLang();
        setLanguage(currentLang);
        setupLanguageControl();

        // If user has not explicitly chosen, try geo-based override once
        const userChose = !!localStorage.getItem(STORAGE_KEY);
        if (!userChose) {
            const geoLang = await fetchGeoLang();
            if (geoLang && geoLang !== currentLang) {
                currentLang = geoLang;
                localStorage.setItem(AUTO_CACHE_KEY, geoLang);
                setCookie(AUTO_CACHE_KEY, geoLang, COOKIE_MAX_AGE);
                setLanguage(geoLang);
            } else if (geoLang) {
                localStorage.setItem(AUTO_CACHE_KEY, geoLang);
                setCookie(AUTO_CACHE_KEY, geoLang, COOKIE_MAX_AGE);
            }
        }
    }

    // Expose
    window.initI18n = init;
    window.refreshLanguageControl = setupLanguageControl;
})();
