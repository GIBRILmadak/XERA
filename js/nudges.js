/**
 * XERA1 Smart Nudge System
 * Intelligent prompts to encourage user activity and retention.
 */

const NUDGE_COOLDOWN_KEY = "xera1-nudge-cooldown";

class XeraNudgeManager {
    constructor() {
        this.container = null;
        // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }

    init() {
        if (!window.currentUser) return;
        // The check is now explicitly called from app-supabase.js after data load
        // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }

    async checkActivity() {
        if (!window.currentUser || !window.currentUser.id) {
            console.warn("NudgeManager: Cannot check activity without a logged-in user.");
            return;
            // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }
        const userId = window.currentUser.id;
        const contents = window.userContents[userId] || [];

        // 1. Check for Project Creation (Intelligent Nudge)
        const arcs = await this.fetchUserArcsCount(userId);
        const workItems = await fetchWorkItems(userId); // Utilise la fonction de app-supabase.js

        if (arcs === 0) {
            if (workItems.length > 0) {
                const topTool = workItems[0].source;
                this.showNudge({
                    id: "nudge-first-project-from-work",
                    title: "Donnez du sens à votre travail",
                    message: `Votre activité sur ${topTool} est détectée. Regroupez ces preuves dans un projet pour rendre votre exécution visible.`,
                    actionLabel: "Créer un projet",
                    onAction: () => window.openCreateModal()
                });
                return; // One nudge at a time
            } else {
                this.showNudge({
                    id: "nudge-first-project-generic",
                    title: "Documentez votre effort",
                    message: "XERA1 est conçu pour transformer votre progression en preuve. Lancez votre premier ARC pour commencer.",
                    actionLabel: "Lancer un projet",
                    onAction: () => window.openCreateModal()
                });
                return;
            }
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }
            // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }

        // 2. Inactivity check for existing contents
        if (contents.length === 0) return;

        const latest = contents[0];
        const lastPostDate = new Date(latest.createdAt || latest.created_at);
        const now = new Date();
        const diffHours = (now - lastPostDate) / (1000 * 60 * 60);

        if (diffHours > 72) {
            this.showNudge({
                id: "inactivity-72h",
                title: "Trajectoire en pause",
                message: "Trois jours sans mise à jour. Ne laissez pas votre effort devenir invisible. Une simple trace suffit.",
                actionLabel: "Ajouter une mise à jour",
                onAction: () => window.openCreateMenu(userId)
            });
        } else if (diffHours > 48) {
            this.showNudge({
                id: "inactivity-48h",
                title: "Maintenez le rythme",
                message: "Votre trajectoire s'essouffle. Publiez une mise à jour pour maintenir votre momentum.",
                actionLabel: "Publier maintenant",
                onAction: () => window.openCreateMenu(userId)
            });
        }
            // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }
        // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }

    async fetchUserArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId);
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
            // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }
        // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }

    showNudge(nudge) {
        // Check cooldown to not spam
        const cooldown = localStorage.getItem(`${NUDGE_COOLDOWN_KEY}-${nudge.id}`);
        if (cooldown && (new Date() - new Date(cooldown)) < 24 * 60 * 60 * 1000) {
            return;
            // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
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
        // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }

    dismiss(id) {
        if (this.container) {
            this.container.classList.add("dismiss");
            setTimeout(() => this.container.remove(), 500);
            localStorage.setItem(`${NUDGE_COOLDOWN_KEY}-${id}`, new Date().toISOString());
            // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }
        // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }

    // Triggered after Arc creation in arcs.js
    triggerAfterArcCreation(userId, arcTitle) {
        setTimeout(() => {
            this.showNudge({
                id: "after-arc-creation",
                title: "Projet initialisé",
                message: `Le projet "${arcTitle}" est créé. Publiez votre première preuve pour marquer ce début.`,
                actionLabel: "Ajouter une trace",
                onAction: () => window.openCreateMenu(userId)
            });
        }, 1000);
    }
        // 3. New Project check (Intelligent Nudge for active users)
        // 3. New Project check (Intelligent Nudge for active users)
        const activeArcsCount = await this.fetchActiveArcsCount(userId);
        if (activeArcsCount === 0 && arcs > 0) {
            this.showNudge({
                id: "nudge-new-project",
                title: "Maintenez le momentum",
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
                message: "Vos projets précédents sont terminés. C'est le moment idéal pour lancer un nouveau défi et garder votre élan visible.",
                actionLabel: "Nouveau projet",
                onAction: () => window.openCreateModal()
            });
        }
    }

    async fetchActiveArcsCount(userId) {
        try {
            const { count, error } = await window.supabase
                .from("arcs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("status", "in_progress");
            if (error) throw error;
            return count || 0;
        } catch (e) {
            return 0;
        }
    }
}

window.XeraNudgeManager = new XeraNudgeManager();
document.addEventListener("DOMContentLoaded", () => window.XeraNudgeManager.init());
