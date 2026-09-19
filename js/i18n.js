// Lightweight i18n shared by every page.
(() => {
  const STORAGE_KEY = "rize_lang";
  const PREFERENCE_KEY = "rize_lang_preference";
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

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
        "XERA1 is a progression infrastructure where builders document their work, attract the right audiences (investors, collaborators, community) and transform their progress into real reputation.",
      heroBullet1: "Create a project or goal",
      heroBullet2:
        "Publish your track record with evidence, target those who see your progress, attract collaborators, investors, or financial support",
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
      heroPartners: "Our partners",
    },
    fr: {
      navDiscover: "Découvrir",
      navProfile: "Ma Trajectoire",
      navAuth: "Connexion / Inscription",
      heroEyebrow: "SUIVEZ VOS OBJECTIFS AVEC LES PROJETS",
      heroTitle: "Transformez votre progression en opportunités.",
      heroLede:
        "XERA1 est une infrastructure de progression où les builders documentent leur travail, attirent les bonnes audiences (investisseurs, collaborateurs, communauté) et transforment leurs avancées en réputation réelle.",
      heroBullet1: "Créez des projets (plans du début à la fin)",
      heroBullet2:
        "Publiez vos traces avec preuves,Ciblez qui voit votre progression",
      heroBullet3:
        "Attirez collaborateurs, investisseurs ou soutien financier, et Construisez une réputation basée sur l’exécution",
      heroCTA: "Lancez votre premier projet",
      heroWatch: "Voir la démo 60s",
      heroMeta:
        "Création de projet → mise à jour quotidienne → tableau de bord.",
      heroBadge: "Aperçu démo 60s",
      heroFootnote: "Essentiels : création projet → mise à jour → dashboard.",
      discoverTitle: "En mouvement",
      discoverSub: "Trajectoires en direct, preuves d'abord.",
      searchPlaceholder: "Recherchez des créateurs ou des projets",
      heroPartners: "Nos partenaires",
    },
  };

  let currentLang = null;

  function detectInitialLang() {
    // Keep an explicit choice, otherwise follow the browser on every page.
    const cookieLang = getCookie(PREFERENCE_KEY);
    if (cookieLang) return cookieLang;
    const stored = localStorage.getItem(PREFERENCE_KEY);
    if (stored) return stored;

    const browserLanguages = navigator.languages || [navigator.language];
    return browserLanguages.some((language) =>
      /^fr(?:-|$)/i.test(language || ""),
    )
      ? "fr"
      : "en";
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

  function setLanguage(lang, persist = true) {
    currentLang = lang === "fr" ? "fr" : "en";
    if (persist) {
      localStorage.setItem(STORAGE_KEY, currentLang);
      localStorage.setItem(PREFERENCE_KEY, currentLang);
      setCookie(STORAGE_KEY, currentLang, COOKIE_MAX_AGE);
      setCookie(PREFERENCE_KEY, currentLang, COOKIE_MAX_AGE);
    }
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
    setLanguage(currentLang, false);
    setupLanguageControl();

    const observer = new MutationObserver(() => {
      observer.disconnect();
      applyTranslations();
      setupLanguageControl();
      observer.observe(document.body, { childList: true, subtree: true });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Expose
  window.initI18n = init;
  window.refreshLanguageControl = setupLanguageControl;
  window.getCurrentLanguage = () => currentLang || detectInitialLang();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
