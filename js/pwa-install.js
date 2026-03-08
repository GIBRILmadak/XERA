// PWA install helper: shows a pinned mini-banner on mobile to install XERA as a PWA.
// Keeps footprint tiny and avoids interfering with existing flows.
(function () {
    const DISMISS_KEY = "xera_pwa_install_dismissed_ts";
    const INSTALLED_KEY = "xera_pwa_installed";
    const IOS_HINT_KEY = "xera_pwa_ios_hint_seen";

    let deferredPrompt = null;
    let bannerEl = null;
    let iosHintEl = null;
    let mobileHintEl = null;

    const isIos = () => /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    const isStandalone = () =>
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        window.navigator.standalone === true;

    function ensureServiceWorker() {
        if (!("serviceWorker" in navigator)) return;
        navigator.serviceWorker
            .register("/sw.js")
            .catch((err) => console.warn("SW registration failed", err));
    }

    function injectStyles() {
        if (document.getElementById("pwa-install-style")) return;
        const style = document.createElement("style");
        style.id = "pwa-install-style";
        style.textContent = `
            #pwa-install-banner { position: fixed; inset: auto 12px 14px 12px; z-index: 1400; display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: rgba(16,16,16,0.94); color: #f7f7f7; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; box-shadow: 0 18px 46px rgba(0,0,0,0.35); backdrop-filter: blur(10px); max-width: 520px; margin: 0 auto; } 
            #pwa-install-banner .pwa-icon { width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: inline-flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
            #pwa-install-banner .pwa-copy { flex: 1; min-width: 0; }
            #pwa-install-banner .pwa-title { font-weight: 700; font-size: 0.98rem; margin-bottom: 4px; }
            #pwa-install-banner .pwa-desc { color: rgba(247,247,247,0.75); font-size: 0.9rem; line-height: 1.25; }
            #pwa-install-banner .pwa-actions { display: flex; gap: 8px; flex-shrink: 0; }
            #pwa-install-banner button { cursor: pointer; border: none; border-radius: 12px; padding: 9px 12px; font-weight: 700; font-size: 0.9rem; }
            #pwa-install-banner .pwa-primary { background: #10b981; color: #0b1612; }
            #pwa-install-banner .pwa-ghost { background: rgba(255,255,255,0.08); color: #f7f7f7; border: 1px solid rgba(255,255,255,0.12); }
            @media (min-width: 769px) { #pwa-install-banner { right: 18px; left: auto; width: 360px; } }
            #pwa-ios-hint { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1401; display: none; align-items: flex-end; justify-content: center; padding: 18px; }
            #pwa-ios-hint.show { display: flex; }
            #pwa-ios-hint .pwa-card { background: #0f1115; color: #f8fafc; width: min(520px, 100%); border-radius: 16px; padding: 16px 18px; box-shadow: 0 24px 60px rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); }
            #pwa-ios-hint h4 { margin: 0 0 8px 0; font-size: 1.05rem; }
            #pwa-ios-hint ol { margin: 0 0 12px 18px; padding: 0; color: rgba(248,250,252,0.85); }
            #pwa-ios-hint button { border: none; background: #10b981; color: #0b1612; padding: 10px 12px; border-radius: 12px; font-weight: 700; cursor: pointer; width: 100%; }
        `;
        document.head.appendChild(style);
    }

    function shouldShowBanner() {
        if (isStandalone()) return false;
        if (localStorage.getItem(INSTALLED_KEY) === "1") return false;
        const dismissedAt = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
        const cooldownMs = 12 * 60 * 60 * 1000; // 12h cooldown after dismissal
        if (dismissedAt && Date.now() - dismissedAt < cooldownMs) return false;
        return true;
    }

    function removeBanner() {
        if (bannerEl) {
            bannerEl.remove();
            bannerEl = null;
        }
    }

    function showIosHint() {
        if (iosHintEl) {
            iosHintEl.classList.add("show");
            return;
        }

        injectStyles();
        iosHintEl = document.createElement("div");
        iosHintEl.id = "pwa-ios-hint";
        iosHintEl.innerHTML = `
            <div class="pwa-card">
                <h4>Installer XERA sur iOS</h4>
                <ol>
                    <li>Appuyez sur le bouton <strong>Partager</strong> (icône carré + flèche).</li>
                    <li>Sélectionnez <strong>"Ajouter à l'écran d'accueil"</strong>.</li>
                    <li>Validez pour épingler XERA parmi vos applications.</li>
                </ol>
                <button type="button" data-action="close-hint">Compris</button>
            </div>
        `;

        iosHintEl.addEventListener("click", (e) => {
            if (e.target === iosHintEl || e.target.closest('[data-action="close-hint"]')) {
                iosHintEl.classList.remove("show");
                setTimeout(() => iosHintEl?.remove(), 180);
            }
        });

        document.body.appendChild(iosHintEl);
        requestAnimationFrame(() => iosHintEl.classList.add("show"));
        localStorage.setItem(IOS_HINT_KEY, "1");
    }

    function showMobileHint() {
        if (mobileHintEl) {
            mobileHintEl.classList.add("show");
            return;
        }

        injectStyles();
        mobileHintEl = document.createElement("div");
        mobileHintEl.id = "pwa-ios-hint";

        const ua = navigator.userAgent.toLowerCase();
        const isAndroid = ua.includes("android");
        const title = isAndroid
            ? "Installer XERA sur Android"
            : "Installer XERA sur mobile";
        const steps = isAndroid
            ? `
                <ol>
                    <li>Ouvrez le menu du navigateur (<strong>⋮</strong> ou <strong>•••</strong>).</li>
                    <li>Appuyez sur <strong>"Installer l'application"</strong> ou <strong>"Ajouter à l'écran d'accueil"</strong>.</li>
                    <li>Validez pour épingler XERA parmi vos applications.</li>
                </ol>
            `
            : `
                <ol>
                    <li>Ouvrez le menu du navigateur.</li>
                    <li>Choisissez <strong>"Ajouter à l'écran d'accueil"</strong> (ou équivalent).</li>
                    <li>Validez l'installation.</li>
                </ol>
            `;

        mobileHintEl.innerHTML = `
            <div class="pwa-card">
                <h4>${title}</h4>
                ${steps}
                <button type="button" data-action="close-hint">Compris</button>
            </div>
        `;

        mobileHintEl.addEventListener("click", (e) => {
            if (
                e.target === mobileHintEl ||
                e.target.closest('[data-action="close-hint"]')
            ) {
                mobileHintEl.classList.remove("show");
                setTimeout(() => mobileHintEl?.remove(), 180);
            }
        });

        document.body.appendChild(mobileHintEl);
        requestAnimationFrame(() => mobileHintEl.classList.add("show"));
    }

    function buildBanner(options = {}) {
        if (!shouldShowBanner()) return;
        injectStyles();
        removeBanner();

        const iosMode = options.iosFallback && isIos() && !deferredPrompt;

        bannerEl = document.createElement("div");
        bannerEl.id = "pwa-install-banner";
        bannerEl.setAttribute("role", "status");
        bannerEl.innerHTML = `
            <div class="pwa-icon">📲</div>
            <div class="pwa-copy">
                <div class="pwa-title">Installer XERA</div>
                <div class="pwa-desc">${iosMode
                    ? "Ajoutez XERA à votre écran d'accueil pour l'avoir comme une app."
                    : "Téléchargez XERA pour un accès rapide depuis votre écran d'accueil."}</div>
            </div>
            <div class="pwa-actions">
                <button class="pwa-primary" data-action="install">Installer</button>
                <button class="pwa-ghost" data-action="close" aria-label="Plus tard">✕</button>
            </div>
        `;

        bannerEl.querySelector('[data-action="install"]').addEventListener("click", async () => {
            if (isStandalone()) {
                localStorage.setItem(INSTALLED_KEY, "1");
                removeBanner();
                return;
            }

            if (isIos()) {
                showIosHint();
                return;
            }

            if (!deferredPrompt) {
                showMobileHint();
                return;
            }

            try {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === "accepted") {
                    localStorage.setItem(INSTALLED_KEY, "1");
                    ToastManager?.success?.("XERA installé", "Retrouvez-la comme une application.");
                    removeBanner();
                } else {
                    localStorage.setItem(DISMISS_KEY, Date.now().toString());
                }
            } catch (err) {
                console.warn("Install prompt failed", err);
            } finally {
                deferredPrompt = null;
            }
        });

        bannerEl.querySelector('[data-action="close"]').addEventListener("click", () => {
            localStorage.setItem(DISMISS_KEY, Date.now().toString());
            removeBanner();
        });

        document.body.appendChild(bannerEl);
    }

    // Capture install availability
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredPrompt = event;
        if (shouldShowBanner()) {
            buildBanner();
        }
    });

    // Mark installed
    window.addEventListener("appinstalled", () => {
        localStorage.setItem(INSTALLED_KEY, "1");
        removeBanner();
        ToastManager?.success?.("XERA installé", "Ouvez-la depuis votre écran d'accueil.");
    });

    // React when display-mode changes (desktop Chrome after install)
    if (window.matchMedia) {
        const mq = window.matchMedia("(display-mode: standalone)");
        mq.addEventListener?.("change", (evt) => {
            if (evt.matches) {
                localStorage.setItem(INSTALLED_KEY, "1");
                removeBanner();
            }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        ensureServiceWorker();

        if (isStandalone()) {
            localStorage.setItem(INSTALLED_KEY, "1");
            return;
        }

        // iOS & browsers without beforeinstallprompt: show gentle banner with fallback steps
        setTimeout(() => {
            if (!deferredPrompt && shouldShowBanner()) {
                buildBanner({ iosFallback: true });
                if (isIos() && localStorage.getItem(IOS_HINT_KEY) !== "1") {
                    // Pre-open the hint the first time for iOS users
                    showIosHint();
                }
            }
        }, 800);
    });
})();
