/**
 * XERA1 Navigation Hub & Profile Popover System
 * Streamlines the top navigation bar into a modern, minimalist header with a Profile Hub.
 */

(() => {
    function initNavigationHub() {
        const profileTrigger = document.getElementById("nav-profile-hub-trigger") || document.getElementById("nav-profile");
        const profilePopover = document.getElementById("profile-hub-popover");

        if (!profileTrigger || !profilePopover) return;

        // Toggle popover on profile click
        profileTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = profilePopover.classList.contains("is-open");
            closeAllNavPanels();
            if (!isOpen) {
                profilePopover.classList.add("is-open");
                profileTrigger.setAttribute("aria-expanded", "true");
                syncProfileHubData();
            }
        });

        // Close on click outside or Escape
        document.addEventListener("click", (e) => {
            if (!profilePopover.contains(e.target) && !profileTrigger.contains(e.target)) {
                profilePopover.classList.remove("is-open");
                profileTrigger.setAttribute("aria-expanded", "false");
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                profilePopover.classList.remove("is-open");
                profileTrigger.setAttribute("aria-expanded", "false");
            }
        });

        // Close popover when any link inside it is clicked
        profilePopover.querySelectorAll("a, button, [role='button']").forEach((el) => {
            el.addEventListener("click", () => {
                profilePopover.classList.remove("is-open");
                profileTrigger.setAttribute("aria-expanded", "false");
            });
        });
    }

    function closeAllNavPanels() {
        const profilePopover = document.getElementById("profile-hub-popover");
        const notificationPanel = document.getElementById("notification-panel");
        const fataPanel = document.getElementById("fata-challenge-panel");

        if (profilePopover) profilePopover.classList.remove("is-open");
        if (notificationPanel) notificationPanel.classList.remove("active", "is-open");
        if (fataPanel) fataPanel.classList.remove("is-open");
    }

    function syncProfileHubData() {
        try {
            const userStr = localStorage.getItem("xera_user") || localStorage.getItem("rize_user");
            if (userStr) {
                const user = JSON.parse(userStr);
                const nameEl = document.getElementById("hub-user-name");
                const handleEl = document.getElementById("hub-user-handle");
                const avatarEl = document.getElementById("hub-user-avatar");
                const proBadge = document.getElementById("hub-pro-badge");

                if (nameEl) nameEl.textContent = user.name || user.username || "Bâtisseur XERA1";
                if (handleEl) handleEl.textContent = `@${user.username || user.id || "builder"}`;
                if (avatarEl && (user.avatar || user.avatar_url)) {
                    avatarEl.src = user.avatar || user.avatar_url;
                }
                if (proBadge) {
                    const isPro = user.is_pro || user.role === "pro" || user.subscription_tier === "pro";
                    proBadge.style.display = isPro ? "inline-flex" : "none";
                }
            }
        } catch (_) {
            /* no-op */
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initNavigationHub);
    } else {
        initNavigationHub();
    }

    window.XeraNavHub = {
        initNavigationHub,
        closeAllNavPanels,
        syncProfileHubData
    };
})();
