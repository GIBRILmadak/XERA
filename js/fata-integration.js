// FATA × XERA1 Frontend OIDC PKCE & UI Integration Module

(function (window) {
    "use strict";

    const FATA_STORAGE_KEY_VERIFIER = "xera1_fata_code_verifier";
    const FATA_STORAGE_KEY_NONCE = "xera1_fata_nonce";
    const FATA_STORAGE_KEY_CHALLENGE = "xera1_fata_challenge_id";

    function generateRandomString(length) {
        const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        const randomValues = new Uint8Array(length);
        window.crypto.getRandomValues(randomValues);
        let result = "";
        for (let i = 0; i < length; i++) {
            result += charset[randomValues[i] % charset.length];
        }
        return result;
    }

    async function sha256(plain) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return window.crypto.subtle.digest("SHA-256", data);
    }

    function base64UrlEncode(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    async function generatePkceChallenge(codeVerifier) {
        const buffer = await sha256(codeVerifier);
        return base64UrlEncode(buffer);
    }

    function parseUrlParams() {
        const search = window.location.search;
        const params = new URLSearchParams(search);
        return {
            fata: params.get("fata"),
            challengeId: params.get("challengeId"),
            connection: params.get("connection"),
        };
    }

    async function getAuthToken() {
        if (window.supabase) {
            try {
                const { data: { session } } = await window.supabase.auth.getSession();
                if (session && session.access_token) {
                    return session.access_token;
                }
            } catch (_) {}
        }
        return localStorage.getItem("sb-ssbuagqwjptyhavinkxg-auth-token") || "";
    }

    async function startFataOidcFlow(overrideChallengeId) {
        const urlParams = parseUrlParams();
        const challengeId = overrideChallengeId || urlParams.challengeId || sessionStorage.getItem(FATA_STORAGE_KEY_CHALLENGE) || "xera1-test";

        const codeVerifier = generateRandomString(64);
        const codeChallenge = await generatePkceChallenge(codeVerifier);
        const nonce = generateRandomString(32);

        sessionStorage.setItem(FATA_STORAGE_KEY_VERIFIER, codeVerifier);
        sessionStorage.setItem(FATA_STORAGE_KEY_NONCE, nonce);
        sessionStorage.setItem(FATA_STORAGE_KEY_CHALLENGE, challengeId);

        const token = await getAuthToken();
        if (!token) {
            alert("Veuillez vous connecter à XERA1 avant de lier votre compte Fata.");
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
            return;
        }

        try {
            const response = await fetch("/api/auth/fata/start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    challengeId,
                    codeChallenge,
                    codeVerifier,
                    nonce,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            if (data && data.authUrl) {
                window.location.href = data.authUrl;
            } else {
                throw new Error("URL d'autorisation Fata invalide");
            }
        } catch (error) {
            console.error("[Fata OIDC Error]:", error);
            alert(`Échec de démarrage de la connexion Fata: ${error.message}`);
        }
    }

    async function checkFataStatus() {
        const token = await getAuthToken();
        if (!token) return null;

        try {
            const response = await fetch("/api/fata/status", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn("[Fata Status Error]:", error);
        }
        return null;
    }

    async function initFataUI() {
        const trigger = document.getElementById("nav-fata-btn");
        const panel = document.getElementById("fata-challenge-panel");
        const closeBtn = document.querySelector(".fata-close-btn");
        const connectBtn = document.querySelector(".fata-connect-btn");
        const authStatus = document.querySelector(".fata-auth-status");
        const authId = document.querySelector(".fata-auth-id");
        const authIcon = document.querySelector(".fata-auth-icon");
        const connectionNote = document.querySelector(".fata-connection-note");

        const urlParams = parseUrlParams();

        if (urlParams.fata === "success" || urlParams.challengeId) {
            if (panel) {
                panel.classList.add("is-open");
                if (trigger) trigger.setAttribute("aria-expanded", "true");
            }
        }

        if (trigger && panel) {
            trigger.addEventListener("click", function () {
                const isOpen = panel.classList.toggle("is-open");
                trigger.setAttribute("aria-expanded", String(isOpen));
            });
        }

        if (closeBtn && panel) {
            closeBtn.addEventListener("click", function () {
                panel.classList.remove("is-open");
                if (trigger) trigger.setAttribute("aria-expanded", "false");
            });
        }

        if (connectBtn) {
            connectBtn.addEventListener("click", function (e) {
                e.preventDefault();
                connectBtn.disabled = true;
                connectBtn.textContent = "Redirection vers Fata…";
                startFataOidcFlow();
            });
        }

        const statusData = await checkFataStatus();
        if (statusData && statusData.connected && statusData.linkage) {
            const username = statusData.linkage.preferred_username || "(compte lié)";
            const sub = statusData.linkage.fata_sub;

            if (authStatus) {
                authStatus.textContent = "Compte Fata connecté";
                authStatus.style.color = "var(--color-success, #10b981)";
            }
            if (authId) {
                authId.textContent = `@${username} (sub: ${sub.slice(0, 12)}…)`;
            }
            if (authIcon) {
                authIcon.classList.remove("is-pending");
                authIcon.classList.add("is-connected");
            }
            if (connectBtn) {
                connectBtn.textContent = "Relier mon compte Fata";
            }
            if (connectionNote) {
                connectionNote.hidden = false;
                connectionNote.textContent = "✓ Votre compte Fata est associé à XERA1. Vos preuves et jalons sont synchronisés.";
            }
        }
    }

    document.addEventListener("DOMContentLoaded", initFataUI);

    window.FataIntegration = {
        startFlow: startFataOidcFlow,
        checkStatus: checkFataStatus,
        initUI: initFataUI,
    };
})(window);
