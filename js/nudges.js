/**
 * XERA Smart Nudge System
 * Intelligent prompts to encourage user activity and retention.
 */

const NUDGE_COOLDOWN_KEY = "xera-nudge-cooldown";

class XeraNudgeManager {
    constructor() {
        this.container = null;
    }

    init() {
        if (!window.currentUser) return;
        // The check is now explicitly called from app-supabase.js after data load
    }

    async checkActivity() {
        if (!window.currentUser || !window.currentUser.id) {
            console.warn("NudgeManager: Cannot check activity without a logged-in user.");
            return;
        }
        const userId = window.currentUser.id;
        const contents = window.userContents[userId] || [];

        if (contents.length === 0) return;

        const latest = contents[0];
        const lastPostDate = new Date(latest.createdAt || latest.created_at);
        const now = new Date();
        const diffHours = (now - lastPostDate) / (1000 * 60 * 60);

        if (diffHours > 72) {
            this.showNudge({
                id: "inactivity-72h",
                title: "Trajectoire en pause ? 💎",
                message: "Ça fait 3 jours ! Ne laisse pas ton effort devenir invisible. Une simple photo suffit pour relancer la machine.",
                actionLabel: "Poster une Trace",
                onAction: () => window.openCreateMenu(userId)
            });
        } else if (diffHours > 48) {
            this.showNudge({
                id: "inactivity-48h",
                title: "On perd le rythme ? ⚡",
                message: "Ta trajectoire s'essouffle un peu. Poste une petite mise à jour pour maintenir ton momentum.",
                actionLabel: "Relancer maintenant",
                onAction: () => window.openCreateMenu(userId)
            });
        }
    }

    showNudge(nudge) {
        // Check cooldown to not spam
        const cooldown = localStorage.getItem(`${NUDGE_COOLDOWN_KEY}-${nudge.id}`);
        if (cooldown && (new Date() - new Date(cooldown)) < 24 * 60 * 60 * 1000) {
            return;
        }

        this.container = document.createElement("div");
        this.container.className = "smart-nudge";
        this.container.innerHTML = `
            <div class="smart-nudge-content">
                <strong>${nudge.title}</strong>
                <p>${nudge.message}</p>
                <div class="smart-nudge-actions">
                    <button class="btn-nudge-action">${nudge.actionLabel}</button>
                    <button class="btn-nudge-close">Plus tard</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        this.container.querySelector(".btn-nudge-action").onclick = () => {
            nudge.onAction();
            this.dismiss(nudge.id);
        };

        this.container.querySelector(".btn-nudge-close").onclick = () => {
            this.dismiss(nudge.id);
        };

        // Auto-dismiss after 15s
        setTimeout(() => this.dismiss(nudge.id), 15000);
    }

    dismiss(id) {
        if (this.container) {
            this.container.classList.add("dismiss");
            setTimeout(() => this.container.remove(), 500);
            localStorage.setItem(`${NUDGE_COOLDOWN_KEY}-${id}`, new Date().toISOString());
        }
    }

    // Triggered after Arc creation in arcs.js
    triggerAfterArcCreation(userId, arcTitle) {
        setTimeout(() => {
            this.showNudge({
                id: "after-arc-creation",
                title: "Projet lancé ! 🚀",
                message: `"${arcTitle}" est prêt. Et si tu postais ta toute première Trace pour marquer le début ?`,
                actionLabel: "Poster ma 1ère Trace",
                onAction: () => window.openCreateMenu(userId)
            });
        }, 1000);
    }
}

window.XeraNudgeManager = new XeraNudgeManager();
document.addEventListener("DOMContentLoaded", () => window.XeraNudgeManager.init());
