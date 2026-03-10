/* ========================================
   APP.JS - VERSION SUPABASE INTÉGRÉE
   Remplace les données mockées par des appels API réels
   ======================================== */

// État global de l'application
window.currentUser = null;
window.currentUserId = null;
window.currentViewerId = null;
window.allUsers = [];
window.userContents = {};
window.userProjects = {};
window.adminAnnouncements = [];
window.hasLoadedUsers = false;
window.userLoadError = null;
window.arcCollaboratorsCache = new Map();
window.arcCollaboratorsPending = new Set();
window.pendingCreatePostAfterArc = null;
let firstPostOnboardingHandled = false;
const CONTENT_PREFETCH_BATCH_SIZE = 10;
const CONTENT_FETCH_BATCH_SIZE = 50;
const FOLLOWED_IDS_CACHE_TTL_MS = 15000;
let followedUserIdsCache = new Set();
let followedUserIdsCacheOwner = null;
let followedUserIdsCacheUpdatedAt = 0;
let discoverVideoObserver = null;

function isMobileDevice() {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
}

function getInitialProfileUserId() {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get("user") || params.get("u");
    } catch (error) {
        return null;
    }
}

function safeFormatDate(date, options = { day: "numeric", month: "short" }) {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(d.getTime())) return "";
    try {
        return new Intl.DateTimeFormat("fr-FR", options).format(d);
    } catch (e) {
        return "";
    }
}

function hasDiscoverPage() {
    return !!document.getElementById("discover");
}

function hasProfilePage() {
    return !!document.getElementById("profile");
}

function isProfileOnlyPage() {
    return hasProfilePage() && !hasDiscoverPage();
}

function buildProfileUrl(userId) {
    const base = "profile.html";
    if (!userId) return base;
    return `${base}?user=${encodeURIComponent(userId)}`;
}

function buildProfileShareUrl(userId) {
    const relative = buildProfileUrl(userId);
    try {
        return new URL(relative, window.location.href).toString();
    } catch (error) {
        return relative;
    }
}

async function shareProfileLink(userId) {
    if (!userId) return;
    const user = getUser(userId);
    const url = buildProfileShareUrl(userId);
    const title = user ? `Profil de ${user.name} | XERA` : "Profil XERA";
    const text = user
        ? `Découvre le profil de ${user.name} sur XERA.`
        : "Découvre ce profil sur XERA.";

    if (navigator.share) {
        try {
            await navigator.share({ title, text, url });
            return;
        } catch (error) {
            console.warn("Share cancelled or failed:", error);
        }
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
            if (window.ToastManager) {
                ToastManager.success(
                    "Lien copié",
                    "Le lien du profil est dans le presse-papiers.",
                );
            } else {
                alert("Lien du profil copié.");
            }
            return;
        }
    } catch (error) {
        console.error("Clipboard error:", error);
    }

    prompt("Copiez ce lien pour partager le profil :", url);
}

window.shareProfileLink = shareProfileLink;

function injectVerificationNavButton() {
    try {
        // Bouton uniquement sur la page profil (profile.html)
        if (!isProfileOnlyPage()) return;
        const navLinks = document.querySelector("nav .nav-links");
        if (!navLinks || navLinks.querySelector(".nav-verify-btn")) return;
        const btn = document.createElement("a");
        btn.href = "verification.html";
        btn.className = "nav-verify-btn";
        btn.innerHTML = `
            Obtenir une vérification
            <img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="Badge" class="nav-verify-icon">
        `;
        navLinks.appendChild(btn);
    } catch (error) {
        console.warn("Nav verification CTA not injected:", error);
    }
}

/* ========================================
   COLLABORATIONS D'ARC
   ======================================== */

function getArcCollaboratorsCached(arcId) {
    if (!arcId) return [];
    if (!window.arcCollaboratorsCache) window.arcCollaboratorsCache = new Map();
    return window.arcCollaboratorsCache.get(arcId) || [];
}

function invalidateArcCollaboratorCache(arcId) {
    if (!arcId || !window.arcCollaboratorsCache) return;
    window.arcCollaboratorsCache.delete(arcId);
}

async function preloadArcCollaborators(arcIds) {
    if (!Array.isArray(arcIds) || arcIds.length === 0 || !window.supabase)
        return;
    if (!window.arcCollaboratorsCache) window.arcCollaboratorsCache = new Map();
    if (!window.arcCollaboratorsPending)
        window.arcCollaboratorsPending = new Set();

    const uniqueIds = Array.from(new Set(arcIds.filter(Boolean)));
    const idsToFetch = uniqueIds.filter(
        (id) =>
            !window.arcCollaboratorsCache.has(id) &&
            !window.arcCollaboratorsPending.has(id),
    );
    if (idsToFetch.length === 0) return;

    idsToFetch.forEach((id) => window.arcCollaboratorsPending.add(id));

    try {
        const { data, error } = await supabase
            .from("arc_collaborations")
            .select("arc_id, collaborator_id, status")
            .in("arc_id", idsToFetch)
            .eq("status", "accepted");

        if (error) throw error;

        const rows = data || [];
        const collaboratorIds = Array.from(
            new Set(rows.map((r) => r.collaborator_id).filter(Boolean)),
        );

        let usersById = new Map();
        if (collaboratorIds.length > 0) {
            const { data: usersData, error: usersError } = await supabase
                .from("users")
                .select("id, name, avatar")
                .in("id", collaboratorIds);
            if (usersError) throw usersError;
            (usersData || []).forEach((u) => usersById.set(u.id, u));
        }

        const map = new Map();
        rows.forEach((row) => {
            const user = usersById.get(row.collaborator_id);
            if (!user) return;
            if (!map.has(row.arc_id)) map.set(row.arc_id, []);
            map.get(row.arc_id).push(user);
        });

        idsToFetch.forEach((id) => {
            window.arcCollaboratorsCache.set(id, map.get(id) || []);
        });
    } catch (error) {
        console.error("Erreur chargement collaborateurs ARC:", error);
        idsToFetch.forEach((id) => {
            if (!window.arcCollaboratorsCache.has(id)) {
                window.arcCollaboratorsCache.set(id, []);
            }
        });
    } finally {
        idsToFetch.forEach((id) => window.arcCollaboratorsPending.delete(id));
    }
}

async function fetchArcCollabStatusMap(arcIds, viewerId) {
    const statusMap = new Map();
    if (
        !viewerId ||
        !Array.isArray(arcIds) ||
        arcIds.length === 0 ||
        !window.supabase
    )
        return statusMap;
    const uniqueIds = Array.from(new Set(arcIds.filter(Boolean)));
    if (uniqueIds.length === 0) return statusMap;

    try {
        const { data, error } = await supabase
            .from("arc_collaborations")
            .select("arc_id, status")
            .eq("collaborator_id", viewerId)
            .in("arc_id", uniqueIds);
        if (error) throw error;
        (data || []).forEach((row) => {
            if (row?.arc_id) statusMap.set(row.arc_id, row.status);
        });
    } catch (error) {
        console.error("Erreur récupération statut collaboration ARC:", error);
    }
    return statusMap;
}

async function fetchPendingArcCollabRequests(ownerId) {
    if (!ownerId || !window.supabase) return [];
    try {
        const { data, error } = await supabase
            .from("arc_collaborations")
            .select("id, arc_id, collaborator_id, created_at")
            .eq("owner_id", ownerId)
            .eq("status", "pending")
            .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = data || [];
        if (rows.length === 0) return [];

        const arcIds = Array.from(
            new Set(rows.map((r) => r.arc_id).filter(Boolean)),
        );
        const collaboratorIds = Array.from(
            new Set(rows.map((r) => r.collaborator_id).filter(Boolean)),
        );

        const [arcRes, userRes] = await Promise.all([
            arcIds.length > 0
                ? supabase.from("arcs").select("id, title").in("id", arcIds)
                : Promise.resolve({ data: [] }),
            collaboratorIds.length > 0
                ? supabase
                      .from("users")
                      .select("id, name, avatar")
                      .in("id", collaboratorIds)
                : Promise.resolve({ data: [] }),
        ]);

        const arcMap = new Map((arcRes.data || []).map((a) => [a.id, a]));
        const userMap = new Map((userRes.data || []).map((u) => [u.id, u]));

        return rows.map((row) => ({
            id: row.id,
            arcId: row.arc_id,
            collaboratorId: row.collaborator_id,
            createdAt: row.created_at,
            arc: arcMap.get(row.arc_id) || null,
            collaborator: userMap.get(row.collaborator_id) || null,
        }));
    } catch (error) {
        console.error("Erreur récupération demandes collaboration ARC:", error);
        return [];
    }
}

async function fetchCollaboratorArcs(userId) {
    if (!userId || !window.supabase) return [];
    try {
        const { data, error } = await supabase
            .from("arc_collaborations")
            .select("arc_id")
            .eq("collaborator_id", userId)
            .eq("status", "accepted");
        if (error) throw error;
        const arcIds = Array.from(
            new Set((data || []).map((r) => r.arc_id).filter(Boolean)),
        );
        if (arcIds.length === 0) return [];

        const { data: arcsData, error: arcsError } = await supabase
            .from("arcs")
            .select("*, users(id, name, avatar)")
            .in("id", arcIds)
            .order("created_at", { ascending: false });
        if (arcsError) throw arcsError;

        return arcsData || [];
    } catch (error) {
        console.error("Erreur récupération ARCs collaboratifs:", error);
        return [];
    }
}

async function requestArcCollaboration(arcId, ownerId) {
    if (!window.currentUser) {
        if (window.ToastManager) {
            ToastManager.info(
                "Login required",
                "Log in to request a collaboration",
            );
        } else {
            alert("Log in to request a collaboration.");
        }
        setTimeout(() => (window.location.href = "login.html"), 1200);
        return;
    }

    if (!arcId || !ownerId) return;
    if (window.currentUser.id === ownerId) {
        ToastManager?.info(
            "Déjà propriétaire",
            "Vous êtes déjà propriétaire de cet ARC.",
        );
        return;
    }

    const profile = getCurrentUserProfile();
    if (isUserBanned(profile)) {
        const remaining = getBanRemainingLabel(profile);
        ToastManager?.error(
            "Compte temporairement banni",
            remaining
                ? `Vous pourrez réessayer dans ${remaining}.`
                : "Vous ne pouvez pas collaborer pour le moment.",
        );
        return;
    }

    try {
        const { error } = await supabase.from("arc_collaborations").upsert(
            {
                arc_id: arcId,
                owner_id: ownerId,
                collaborator_id: window.currentUser.id,
                status: "pending",
            },
            { onConflict: "arc_id,collaborator_id" },
        );
        if (error) throw error;

        invalidateArcCollaboratorCache(arcId);
        ToastManager?.success(
            "Demande envoyée",
            "Votre demande de collaboration a été envoyée.",
        );
        await renderProfileIntoContainer(
            window.currentProfileViewed || ownerId,
        );
    } catch (error) {
        console.error("Erreur demande collaboration:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible d'envoyer la demande.",
        );
    }
}

async function acceptArcCollaboration(requestId, arcId, collaboratorId) {
    if (!requestId || !window.currentUser) return;
    try {
        const { error } = await supabase
            .from("arc_collaborations")
            .update({ status: "accepted" })
            .eq("id", requestId);
        if (error) throw error;
        invalidateArcCollaboratorCache(arcId);
        ToastManager?.success(
            "Collaboration acceptée",
            "Le collaborateur a été ajouté.",
        );
        await renderProfileIntoContainer(window.currentUser.id);
        if (typeof renderDiscoverGrid === "function") renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur acceptation collaboration:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible d'accepter.",
        );
    }
}

async function declineArcCollaboration(requestId, arcId) {
    if (!requestId || !window.currentUser) return;
    try {
        const { error } = await supabase
            .from("arc_collaborations")
            .update({ status: "declined" })
            .eq("id", requestId);
        if (error) throw error;
        invalidateArcCollaboratorCache(arcId);
        ToastManager?.info("Demande refusée", "La demande a été refusée.");
        await renderProfileIntoContainer(window.currentUser.id);
    } catch (error) {
        console.error("Erreur refus collaboration:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de refuser.",
        );
    }
}

async function leaveArcCollaboration(arcId) {
    if (!arcId || !window.currentUser) return;
    try {
        const { error } = await supabase
            .from("arc_collaborations")
            .update({ status: "left" })
            .eq("arc_id", arcId)
            .eq("collaborator_id", window.currentUser.id);
        if (error) throw error;
        if (window.selectedArcId === arcId) {
            window.selectedArcId = null;
        }
        invalidateArcCollaboratorCache(arcId);
        ToastManager?.info(
            "Collaboration quittée",
            "Vous ne collaborez plus sur cet ARC.",
        );
        await renderProfileIntoContainer(
            window.currentProfileViewed || window.currentUser.id,
        );
        if (typeof renderDiscoverGrid === "function") renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur quitter collaboration:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de quitter la collaboration.",
        );
    }
}

function buildArcCollaboratorAvatars(content, options = {}) {
    if (!content || !content.arc || !content.arc.id) return "";
    const collaborators = getArcCollaboratorsCached(content.arc.id);
    if (!collaborators || collaborators.length === 0) return "";

    const ownerId = content.arc.ownerId || content.arc.user_id || null;
    const ownerUser = ownerId
        ? getUser(ownerId) || {
              id: ownerId,
              name: content.arc.ownerName,
              avatar: content.arc.ownerAvatar,
          }
        : null;
    if (!ownerUser) return "";

    let collaborator = null;
    if (content.userId && content.userId !== ownerId) {
        collaborator =
            collaborators.find((u) => u.id === content.userId) ||
            collaborators.find((u) => u.id !== ownerId);
    } else {
        collaborator = collaborators.find((u) => u.id !== ownerId);
    }
    if (!collaborator) return "";

    const size = options.size || 22;
    const className = options.className || "";
    const label = options.label || "Collaboration";

    return `
        <div class="arc-collab-avatars ${className}" title="${label}">
            <img src="${ownerUser.avatar || "https://placehold.co/32"}" alt="Avatar créateur" style="width:${size}px; height:${size}px;">
            <img src="${collaborator.avatar || "https://placehold.co/32"}" alt="Avatar collaborateur" style="width:${size}px; height:${size}px;">
        </div>
    `;
}

function buildArcCollaboratorCornerAvatars(content, options = {}) {
    if (!content || !content.arc || !content.arc.id) return "";
    const collaborators = getArcCollaboratorsCached(content.arc.id) || [];
    if (collaborators.length === 0) return "";

    const ownerId = content.arc.ownerId || content.arc.user_id || null;
    const ownerUser = ownerId
        ? getUser(ownerId) || {
              id: ownerId,
              name: content.arc.ownerName || "Créateur",
              avatar: content.arc.ownerAvatar || "https://placehold.co/32",
          }
        : null;

    const participants = new Map();
    if (ownerUser?.id) participants.set(ownerUser.id, ownerUser);
    collaborators.forEach((user) => {
        if (user?.id) participants.set(user.id, user);
    });

    const authorId = content.userId || null;
    const others = Array.from(participants.values()).filter(
        (user) => user && user.id && user.id !== authorId,
    );
    if (others.length === 0) return "";

    const size = options.size || 18;
    const className = options.className || "";
    const max = Math.max(1, options.max || 3);
    const visible = others.slice(0, max);
    const hiddenCount = Math.max(0, others.length - visible.length);
    const label = options.label || "Autres collaborateurs";

    const avatarsHtml = visible
        .map(
            (user) =>
                `<img src="${user.avatar || "https://placehold.co/32"}" alt="Collaborateur" style="width:${size}px; height:${size}px;">`,
        )
        .join("");

    const moreHtml =
        hiddenCount > 0
            ? `<span class="arc-collab-more" aria-label="+${hiddenCount} collaborateurs">+${hiddenCount}</span>`
            : "";

    return `
        <div class="arc-collab-avatars arc-collab-avatars--corner ${className}" title="${label}">
            ${avatarsHtml}
            ${moreHtml}
        </div>
    `;
}

window.requestArcCollaboration = requestArcCollaboration;
window.acceptArcCollaboration = acceptArcCollaboration;
window.declineArcCollaboration = declineArcCollaboration;
window.leaveArcCollaboration = leaveArcCollaboration;
window.fetchArcCollabStatusMap = fetchArcCollabStatusMap;
window.fetchCollaboratorArcs = fetchCollaboratorArcs;
window.preloadArcCollaborators = preloadArcCollaborators;
/* ========================================
   INITIALISATION ET AUTHENTIFICATION
   ======================================== */
const LIVE_ORPHAN_TIMEOUT_MS = 45000;

async function closeOwnOrphanLiveSessions(userId, options = {}) {
    if (!userId || typeof supabase === "undefined" || !supabase) {
        return { closed: 0, checked: 0 };
    }

    const staleMs =
        Number(options.staleMs) > 0
            ? Number(options.staleMs)
            : LIVE_ORPHAN_TIMEOUT_MS;
    const nowMs = Date.now();

    try {
        const { data: liveSessions, error: sessionError } = await supabase
            .from("streaming_sessions")
            .select("id, started_at")
            .eq("user_id", userId)
            .eq("status", "live");

        if (sessionError) throw sessionError;
        if (!Array.isArray(liveSessions) || liveSessions.length === 0) {
            return { closed: 0, checked: 0 };
        }

        const streamIds = liveSessions
            .map((session) => session?.id)
            .filter(Boolean);

        if (streamIds.length === 0) {
            return { closed: 0, checked: 0 };
        }

        const { data: presenceRows, error: presenceError } = await supabase
            .from("stream_viewers")
            .select("stream_id, last_seen")
            .eq("user_id", userId)
            .in("stream_id", streamIds);

        if (presenceError) throw presenceError;

        const lastSeenByStreamId = new Map();
        (presenceRows || []).forEach((row) => {
            if (!row?.stream_id || !row?.last_seen) return;
            const ts = new Date(row.last_seen).getTime();
            if (!Number.isFinite(ts)) return;
            const prev = lastSeenByStreamId.get(row.stream_id) || 0;
            if (ts > prev) lastSeenByStreamId.set(row.stream_id, ts);
        });

        let closed = 0;
        for (const session of liveSessions) {
            const startedMs = session?.started_at
                ? new Date(session.started_at).getTime()
                : 0;
            const fallbackSeenMs =
                Number.isFinite(startedMs) && startedMs > 0
                    ? startedMs
                    : nowMs;
            const lastSeenMs =
                lastSeenByStreamId.get(session.id) || fallbackSeenMs;
            if (!lastSeenMs || nowMs - lastSeenMs <= staleMs) continue;

            const endedAtIso = new Date(lastSeenMs).toISOString();
            const { error: closeError } = await supabase
                .from("streaming_sessions")
                .update({ status: "ended", ended_at: endedAtIso })
                .eq("id", session.id)
                .eq("user_id", userId)
                .eq("status", "live");

            if (!closeError) closed += 1;
        }

        return { closed, checked: liveSessions.length };
    } catch (error) {
        console.warn("Fermeture auto des lives orphelins échouée:", error);
        return { closed: 0, checked: 0, error: error?.message || String(error) };
    }
}

// Vérifier l'authentification au chargement
async function initializeApp() {
    const grid = document.querySelector(".discover-grid");
    const waitMessage = document.querySelector(".wait");
    const initialProfileId = getInitialProfileUserId();
    const profileOnlyPage = isProfileOnlyPage();
    const discoverAvailable = hasDiscoverPage();

    const hydratedDiscover = hydrateDiscoverFromCache();
    if (hydratedDiscover) {
        if (initialProfileId) {
            hydrateProfileContentsFromCache(initialProfileId);
        } else if (window.currentUserId) {
            hydrateProfileContentsFromCache(window.currentUserId);
        }
        // Render immediately from cache to feel instant on slow networks.
        Promise.resolve().then(async () => {
            try {
                await renderDiscoverGrid();
                if (initialProfileId) {
                    window.currentProfileViewed = initialProfileId;
                    await renderProfileIntoContainer(initialProfileId);
                } else if (window.currentUserId) {
                    await renderProfileIntoContainer(window.currentUserId);
                }
            } catch (e) {
                // ignore cache render failures
            }
        });
    }

    // Timeout de sécurité : si rien ne se passe après 1 minute
    const safetyTimeout = setTimeout(() => {
        if (document.querySelector(".loading-state-container")) {
            console.warn("Initialization timed out");
            if (grid)
                LoadingStateManager.showEmptyState(
                    grid,
                    "⚠️",
                    "Délai dépassé",
                    "Le serveur met trop de temps à répondre.",
                    { text: "Réessayer", action: "location.reload()" },
                );
            if (waitMessage) waitMessage.classList.add("is-hidden");
        }
    }, 60000);

    try {
        if (
            grid &&
            window.LoadingStateManager &&
            typeof LoadingStateManager.showSpinner === "function"
        ) {
            LoadingStateManager.showSpinner(grid);
        }

        // Vérifier si Supabase est chargé
        if (typeof supabase === "undefined" || !supabase) {
            window.userLoadError = "Supabase client introuvable";
            window.hasLoadedUsers = true;
            await renderDiscoverGrid();
            if (waitMessage) waitMessage.classList.add("is-hidden");
            clearTimeout(safetyTimeout);
            return;
        }

        const skipLanding = isMobileDevice();
        const savedSession =
            typeof SessionManager !== "undefined"
                ? SessionManager.loadSession()
                : null;

        // Vérifier la session avec Supabase
        const user = await checkAuth();
        if (!user && profileOnlyPage && !initialProfileId) {
            clearTimeout(safetyTimeout);
            window.location.href = "login.html";
            return;
        }

        const heroVisibilityPromise = updateHeroVisibilityForUser(
            user ? user.id : null,
        );

        if (user) {
            window.currentUser = user;
            window.currentUserId = user.id;
            window.currentViewerId = user.id;
            if (typeof SessionManager !== "undefined") {
                SessionManager.saveSession(user);
            }
            const orphanCleanupResult = await closeOwnOrphanLiveSessions(user.id);
            if (orphanCleanupResult.closed > 0) {
                console.info(
                    `[live] ${orphanCleanupResult.closed} live(s) orphelin(s) fermé(s) automatiquement.`,
                );
            }
            updateNavigation(true);
            // Démarrer les notifications maintenant que l'utilisateur est connu
            if (typeof initializeNotifications === "function") {
                initializeNotifications();
                const notifBtn = document.getElementById("notification-btn");
                if (notifBtn) notifBtn.style.display = "flex";
            }
            if (discoverAvailable) {
                navigateTo("discover");
            }
            await Promise.all([loadAllData(), heroVisibilityPromise]);
        } else if (savedSession) {
            if (typeof ToastManager !== "undefined") {
                ToastManager.info(
                    "Session expirée",
                    "Veuillez vous reconnecter",
                );
            }
            if (typeof SessionManager !== "undefined") {
                SessionManager.clearSession();
            }
            updateNavigation(false);
            await Promise.all([loadPublicData(), heroVisibilityPromise]);
        } else {
            updateNavigation(false);
            await Promise.all([loadPublicData(), heroVisibilityPromise]);
        }

        if (skipLanding && discoverAvailable) {
            navigateTo("discover");
        }

        initTheme();
        subscribeToRealtime();

        await renderDiscoverGrid();

        if (initialProfileId) {
            window.currentProfileViewed = initialProfileId;
            await renderProfileIntoContainer(initialProfileId);
        } else if (window.currentUserId) {
            await renderProfileIntoContainer(window.currentUserId);
        }

        handleLoginPromptContext();
        await maybeStartFirstPostFlow();
        if (typeof initializeMessaging === "function" && window.currentUserId) {
            await initializeMessaging();
        }
        clearTimeout(safetyTimeout);
    } catch (error) {
        console.error("Initialization error:", error);
        clearTimeout(safetyTimeout);
        window.userLoadError = error?.message || "Erreur de chargement";
        window.hasLoadedUsers = true;
        await renderDiscoverGrid();
        if (waitMessage) waitMessage.classList.add("is-hidden");
    }
}

// Mettre à jour la navigation selon l'état de connexion
function updateNavigation(isLoggedIn) {
    const navAuth = document.getElementById("nav-auth");
    const navProfile = document.getElementById("nav-profile");
    const navMessages = document.getElementById("messages-nav-btn");

        if (navAuth) {
            if (isLoggedIn) {
                navAuth.style.display = "none";
            } else {
                navAuth.style.display = "block";
                navAuth.textContent = "Login / Register";
                navAuth.onclick = () => (window.location.href = "login.html");
            }
        }

    if (navProfile) {
        if (!isLoggedIn) {
            navProfile.style.display = "none";
        } else {
            navProfile.style.display = "block";
        }
    }

    if (navMessages) {
        navMessages.style.display = isLoggedIn ? "flex" : "none";
    }

    if (!isLoggedIn && typeof window.cleanupMessaging === "function") {
        window.cleanupMessaging();
    }

    // Retirer le bouton réglages de la nav s'il existait
    const navSettings = document.getElementById("nav-settings-btn");
    if (navSettings) navSettings.remove();

    handleLoginPromptContext();
}

/* ========================================
   HERO VISIBILITY (Landing)
   ======================================== */
const HERO_STATE = {
    LOADING: "loading",
    HIDDEN: "hidden",
    VISIBLE: "visible",
};
const ARC_COUNT_CACHE_KEY_PREFIX = "rize:arc-count:";
const ARC_COUNT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const userArcCounts = new Map();
let heroStateSafetyTimeout = null;

function setHeroState(state) {
    const hero = document.getElementById("hero");
    if (!hero) return;
    hero.dataset.state = state;
    hero.setAttribute("aria-busy", state === HERO_STATE.LOADING ? "true" : "false");
    hero.style.display = state === HERO_STATE.HIDDEN ? "none" : "";

    if (state === HERO_STATE.LOADING) {
        clearTimeout(heroStateSafetyTimeout);
        heroStateSafetyTimeout = setTimeout(() => {
            // Fail-safe: avoid leaving the user with an empty viewport on very slow connections
            if (hero.dataset.state === HERO_STATE.LOADING) {
                hero.dataset.state = HERO_STATE.VISIBLE;
                hero.style.display = "";
                hero.setAttribute("aria-busy", "false");
            }
        }, 4000);
    } else {
        clearTimeout(heroStateSafetyTimeout);
        heroStateSafetyTimeout = null;
    }
}

function cacheArcCount(userId, count) {
    userArcCounts.set(userId, count);
    try {
        sessionStorage.setItem(
            `${ARC_COUNT_CACHE_KEY_PREFIX}${userId}`,
            JSON.stringify({ count, ts: Date.now() }),
        );
    } catch (e) {
        // sessionStorage can fail in some environments (Safari private mode)
    }
}

function readArcCountFromCache(userId) {
    if (userArcCounts.has(userId)) return userArcCounts.get(userId);
    try {
        const raw = sessionStorage.getItem(`${ARC_COUNT_CACHE_KEY_PREFIX}${userId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
            typeof parsed?.count === "number" &&
            typeof parsed?.ts === "number" &&
            Date.now() - parsed.ts < ARC_COUNT_CACHE_TTL_MS
        ) {
            userArcCounts.set(userId, parsed.count);
            return parsed.count;
        }
    } catch (e) {
        return null;
    }
    return null;
}

async function getUserArcCount(userId) {
    if (!userId) return 0;
    const cached = readArcCountFromCache(userId);
    if (cached !== null) return cached;
    try {
        const { count, error } = await supabase
            .from("arcs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .limit(1);
        if (error) throw error;
        const c = count || 0;
        cacheArcCount(userId, c);
        return c;
    } catch (e) {
        console.error("Error fetching arc count:", e);
        return null;
    }
}

async function updateHeroVisibilityForUser(userId) {
    const hero = document.getElementById("hero");
    if (!hero) return;
    // Not logged in -> show hero
    if (!userId) {
        setHeroState(HERO_STATE.VISIBLE);
        return;
    }

    const cached = readArcCountFromCache(userId);
    if (cached !== null) {
        setHeroState(cached > 0 ? HERO_STATE.HIDDEN : HERO_STATE.VISIBLE);
        return cached;
    }

    setHeroState(HERO_STATE.LOADING);
    const count = await getUserArcCount(userId);

    if (count === null) {
        // Keep content visible rather than flashing black if the count fails to load
        setHeroState(HERO_STATE.VISIBLE);
        return null;
    }

    setHeroState(count > 0 ? HERO_STATE.HIDDEN : HERO_STATE.VISIBLE);
    return count;
}

/* ========================================
   POPUP CONNEXION (DISCOVER / IMMERSIVE)
   ======================================== */

const LOGIN_PROMPT_VIEW_THRESHOLD = 5;
const LOGIN_PROMPT_REPEAT_INCREMENT = 10;
let loginPromptTimerId = null;
let loginPromptShown = false;
let loginPromptImmersiveViews = 0;
let loginPromptNextThreshold = LOGIN_PROMPT_VIEW_THRESHOLD;

function isDiscoverOrImmersiveActive() {
    const discoverActive =
        document.getElementById("discover")?.classList.contains("active") ||
        false;
    const immersiveOpen =
        document.getElementById("immersive-overlay")?.style.display === "block";
    return discoverActive || immersiveOpen;
}

function ensureLoginPromptElements() {
    if (document.getElementById("login-prompt-overlay")) return;

    const style = document.createElement("style");
    style.id = "login-prompt-style";
    style.textContent = `
        .login-prompt-overlay {
            position: fixed;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.65);
            z-index: 2000;
            padding: 24px;
        }
        .login-prompt-overlay.active {
            display: flex;
        }
        .login-prompt-card {
            width: min(420px, 92vw);
            background: #0f1115;
            color: #fff;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.08);
            position: relative;
        }
        .login-prompt-title {
            font-size: 1.25rem;
            font-weight: 700;
            margin: 0 0 8px 0;
        }
        .login-prompt-text {
            margin: 0 0 16px 0;
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.95rem;
        }
        .login-prompt-cta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            padding: 12px 16px;
            border: none;
            border-radius: 10px;
            background: #ffffff;
            color: #0f1115;
            font-weight: 700;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .login-prompt-cta:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        }
        .login-prompt-close {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.04);
            color: #fff;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.12s ease, background 0.12s ease;
        }
        .login-prompt-close:hover {
            transform: scale(1.05);
            background: rgba(255,255,255,0.08);
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "login-prompt-overlay";
    overlay.className = "login-prompt-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
        <div class="login-prompt-card">
            <button class="login-prompt-close" aria-label="Fermer">✕</button>
            <h3 class="login-prompt-title">Vous aimez XERA ?</h3>
            <p class="login-prompt-text">
                Connectez-vous et profitez sans interruption.
            </p>
            <button class="login-prompt-cta" data-login-action="true">
                Se connecter / Créer un compte
            </button>
        </div>
    `;
    overlay.addEventListener("click", () => {
        window.location.href = "login.html";
    });
    overlay
        .querySelector("[data-login-action]")
        ?.addEventListener("click", (event) => {
            event.stopPropagation();
            window.location.href = "login.html";
        });
    overlay
        .querySelector(".login-prompt-card")
        ?.addEventListener("click", (event) => event.stopPropagation());
    overlay
        .querySelector(".login-prompt-close")
        ?.addEventListener("click", (event) => {
            event.stopPropagation();
            dismissLoginPrompt();
        });
    document.body.appendChild(overlay);
}

function showLoginPrompt() {
    if (loginPromptShown || window.currentUser) return;
    ensureLoginPromptElements();
    const overlay = document.getElementById("login-prompt-overlay");
    if (!overlay) return;
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    loginPromptShown = true;
    stopLoginPromptTimer();
}

function dismissLoginPrompt() {
    const overlay = document.getElementById("login-prompt-overlay");
    if (overlay) {
        overlay.classList.remove("active");
        overlay.setAttribute("aria-hidden", "true");
    }
    loginPromptShown = false;
    // reprogrammer après 10 vues supplémentaires
    loginPromptNextThreshold =
        loginPromptImmersiveViews + LOGIN_PROMPT_REPEAT_INCREMENT;
}

function startLoginPromptTimer() {
    if (loginPromptTimerId || loginPromptShown || window.currentUser) return;
    loginPromptTimerId = setTimeout(() => {
        loginPromptTimerId = null;
        if (!window.currentUser && isDiscoverOrImmersiveActive()) {
            showLoginPrompt();
        }
    }, LOGIN_PROMPT_DELAY_MS);
}

function stopLoginPromptTimer() {
    if (!loginPromptTimerId) return;
    clearTimeout(loginPromptTimerId);
    loginPromptTimerId = null;
}

function handleLoginPromptContext() {
    if (window.currentUser) {
        stopLoginPromptTimer();
        return;
    }
    stopLoginPromptTimer();
}

function recordImmersiveViewForLoginPrompt() {
    if (loginPromptShown || window.currentUser) return;
    loginPromptImmersiveViews += 1;
    if (
        loginPromptImmersiveViews >= loginPromptNextThreshold &&
        isDiscoverOrImmersiveActive()
    ) {
        showLoginPrompt();
    }
}

// Gérer la déconnexion
async function handleSignOut() {
    const result = await signOut();
    if (result.success) {
        SessionManager.clearSession();
        ToastManager.success("Déconnexion", "À bientôt !");
        setTimeout(() => {
            window.location.href = "login.html";
        }, 1500);
    }
}

function getAccountDeleteReasonLabel(reason) {
    const map = {
        inactive: "Je n'utilise plus XERA",
        technical: "J'ai des problèmes techniques",
        privacy: "Confidentialité / sécurité",
        experience: "L'expérience ne me convient pas",
        other: "Autre",
    };
    return map[reason] || map.other;
}

async function requestAccountDeletion(userId) {
    if (!currentUser || currentUser.id !== userId) {
        alert("Vous devez être connecté pour supprimer votre compte.");
        return;
    }

    const modal = document.getElementById("settings-modal");
    if (!modal) return;

    const selectedReason = modal.querySelector(
        'input[name="delete-account-reason"]:checked',
    );
    if (!selectedReason) {
        alert("Choisissez une raison avant de continuer.");
        return;
    }

    const reason = selectedReason.value;
    const otherInput = modal.querySelector("#delete-account-other");
    const otherDetail = (otherInput?.value || "").trim();

    if (reason === "other" && otherDetail.length < 3) {
        alert("Merci de préciser la raison dans le champ texte.");
        return;
    }

    const reasonLabel = getAccountDeleteReasonLabel(reason);
    const confirmation = confirm(
        `Supprimer définitivement votre compte ?\n\nRaison: ${reasonLabel}\n\nCette action est irréversible.`,
    );
    if (!confirmation) return;

    const okOnline = await ensureOnlineOrNotify();
    if (!okOnline) return;
    const sessionCheck = await ensureFreshSupabaseSession();
    if (!sessionCheck.ok) {
        console.warn("Session refresh failed", sessionCheck.error);
    }

    const btn = modal.querySelector(".btn-delete-account");
    const originalText = btn ? btn.textContent : "";
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Suppression...";
    }

    try {
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) {
            throw new Error("Session invalide. Reconnectez-vous.");
        }

        const response = await fetch("/api/account/delete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                userId,
                reason,
                detail: reason === "other" ? otherDetail : "",
            }),
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch (e) {
            payload = {};
        }
        if (!response.ok) {
            throw new Error(
                payload?.error || "Impossible de supprimer le compte.",
            );
        }

        try {
            await supabase.auth.signOut();
        } catch (e) {
            // ignore
        }
        try {
            SessionManager.clearSession();
        } catch (e) {
            // ignore
        }

        ToastManager?.success(
            "Compte supprimé",
            "Votre compte a été supprimé définitivement.",
        );
        setTimeout(() => {
            window.location.href = "login.html";
        }, 900);
    } catch (error) {
        console.error("Erreur suppression compte:", error);
        alert(error?.message || "Impossible de supprimer le compte.");
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText || "Supprimer mon compte";
        }
    }
}

/* ========================================
   GESTION DU PROFIL UTILISATEUR
   ======================================== */

// S'assurer qu'un utilisateur a un profil valide
async function ensureUserProfile(user) {
    try {
        // Vérifier si le profil existe
        const profileResult = await getUserProfile(user.id);

        if (!profileResult.success) {
            const errCode = profileResult.code || "";
            const errMsg = (profileResult.error || "").toLowerCase();
            const isNotFound =
                errCode === "PGRST116" ||
                errCode === "PGRST302" ||
                errMsg.includes("no rows") ||
                errMsg.includes("row") ||
                errMsg.includes("not found");
            // Si c'est un autre type d'erreur (ex: RLS, réseau), ne pas écraser le profil existant
            if (!isNotFound) {
                const cached =
                    (window.allUsers || []).find(
                        (u) => u && u.id === user.id,
                    ) || null;
                if (cached) return cached;
                console.warn(
                    "Profil non chargé (erreur non critique), on conserve l'état local.",
                );
                return null;
            }
            // Créer un nouveau profil
            const username =
                user.user_metadata?.username || user.email.split("@")[0];
            const accountType = user.user_metadata?.account_type || null;
            const accountSubtypeRaw = user.user_metadata?.account_subtype || null;
            const accountSubtype = normalizeDiscoveryAccountRole(
                accountSubtypeRaw,
            );
            const badge = user.user_metadata?.badge || null;

            const profileData = {
                name: username,
                title: "Nouveau membre",
                bio: "",
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
                banner: "https://placehold.co/1200x300/1a1a2e/00ff88?text=Ma+Trajectoire",
                account_type: accountType,
                account_subtype: accountSubtype,
                badge: badge,
                socialLinks: {},
            };

            const createResult = await upsertUserProfile(user.id, profileData);

            if (createResult.success) {
                console.log("Profil utilisateur créé avec succès");
                try {
                    sessionStorage.setItem(
                        `xera:last-profile:${user.id}`,
                        JSON.stringify(createResult.data),
                    );
                } catch (e) {
                    /* ignore */
                }
                return createResult.data;
            } else {
                console.error("Erreur création profil:", createResult.error);
                return null;
            }
        } else {
            console.log("Profil utilisateur trouvé");
            try {
                sessionStorage.setItem(
                    `xera:last-profile:${user.id}`,
                    JSON.stringify(profileResult.data),
                );
            } catch (e) {
                /* ignore */
            }
            return profileResult.data;
        }
    } catch (error) {
        console.error("Erreur ensureUserProfile:", error);
        try {
            const cached = sessionStorage.getItem(
                `xera:last-profile:${user.id}`,
            );
            if (cached) return JSON.parse(cached);
        } catch (e) {
            /* ignore */
        }
        return null;
    }
}

/* ========================================
   CHARGEMENT DES DONNÉES
   ======================================== */

function resetLoadedCollections() {
    Object.keys(userContents || {}).forEach((key) => delete userContents[key]);
    Object.keys(userProjects || {}).forEach((key) => delete userProjects[key]);
}

const XERA_CACHE_USERS_KEY = "xera:cache:users";
const XERA_CACHE_DISCOVER_LATEST_KEY = "xera:cache:discover:latest";
const XERA_CACHE_DISCOVER_TS_KEY = "xera:cache:discover:ts";
const XERA_CACHE_PROFILE_CONTENT_PREFIX = "xera:cache:profile:contents:";

async function ensureOnlineOrNotify() {
    try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            if (window.ToastManager) {
                ToastManager.error(
                    "Hors connexion",
                    "Vous êtes hors connexion. Réessayez quand la connexion revient.",
                );
            } else {
                alert(
                    "Vous êtes hors connexion. Réessayez quand la connexion revient.",
                );
            }
            return false;
        }
    } catch (e) {
        /* ignore */
    }
    return true;
}

async function ensureFreshSupabaseSession() {
    if (!supabase?.auth?.getSession) return { ok: true };
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return { ok: false, error };
        const session = data?.session;
        if (!session) return { ok: false, error: new Error("No session") };
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        const needsRefresh = expiresAt && expiresAt - Date.now() < 2 * 60 * 1000;
        if (!needsRefresh) return { ok: true };
        if (supabase.auth.refreshSession) {
            const refreshed = await supabase.auth.refreshSession();
            if (refreshed?.error) return { ok: false, error: refreshed.error };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e };
    }
}

function setupPwaSwUpdateReload() {
    try {
        if (!("serviceWorker" in navigator)) return;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            try {
                if (window.__xeraSwReloading) return;
                window.__xeraSwReloading = true;
                setTimeout(() => window.location.reload(), 150);
            } catch (e) {
                /* ignore */
            }
        });
    } catch (e) {
        /* ignore */
    }
}
const XERA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function safeJsonParse(raw, fallback) {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function withCacheBust(url, version) {
    if (!url) return url;
    try {
        const v = version ? String(version) : String(Date.now());
        const u = new URL(url, window.location.origin);
        u.searchParams.set("v", v);
        return u.toString();
    } catch (e) {
        const sep = url.includes("?") ? "&" : "?";
        const v = version ? String(version) : String(Date.now());
        return `${url}${sep}v=${encodeURIComponent(v)}`;
    }
}

function persistDiscoverCache() {
    try {
        if (!Array.isArray(allUsers) || allUsers.length === 0) return;
        localStorage.setItem(XERA_CACHE_USERS_KEY, JSON.stringify(allUsers));

        const latestByUser = {};
        allUsers.forEach((u) => {
            const list = userContents?.[u.id];
            if (Array.isArray(list) && list.length > 0) {
                latestByUser[u.id] = list[0];
            }
        });
        localStorage.setItem(
            XERA_CACHE_DISCOVER_LATEST_KEY,
            JSON.stringify(latestByUser),
        );
        localStorage.setItem(XERA_CACHE_DISCOVER_TS_KEY, Date.now().toString());
    } catch (e) {
        // ignore quota / privacy errors
    }
}

function hydrateDiscoverFromCache() {
    try {
        const ts = parseInt(localStorage.getItem(XERA_CACHE_DISCOVER_TS_KEY) || "0", 10);
        if (!ts || Date.now() - ts > XERA_CACHE_TTL_MS) return false;

        const cachedUsers = safeJsonParse(
            localStorage.getItem(XERA_CACHE_USERS_KEY),
            null,
        );
        const cachedLatest = safeJsonParse(
            localStorage.getItem(XERA_CACHE_DISCOVER_LATEST_KEY),
            null,
        );
        if (!Array.isArray(cachedUsers) || cachedUsers.length === 0) return false;
        if (!cachedLatest || typeof cachedLatest !== "object") return false;

        allUsers = cachedUsers;
        Object.keys(cachedLatest).forEach((uid) => {
            const latest = cachedLatest[uid];
            userContents[uid] = latest ? [latest] : [];
        });
        window.userLoadError = null;
        window.hasLoadedUsers = true;
        computeAmbassadors();
        return true;
    } catch (e) {
        return false;
    }
}

function hydrateProfileContentsFromCache(userId) {
    if (!userId) return false;
    if (Array.isArray(userContents?.[userId]) && userContents[userId].length > 0) {
        return true;
    }
    try {
        const raw = localStorage.getItem(`${XERA_CACHE_PROFILE_CONTENT_PREFIX}${userId}`);
        const cached = safeJsonParse(raw, null);
        if (!Array.isArray(cached) || cached.length === 0) return false;
        userContents[userId] = cached;
        return true;
    } catch (e) {
        return false;
    }
}

function persistProfileContentsCache(userId) {
    if (!userId) return;
    try {
        const list = userContents?.[userId];
        if (!Array.isArray(list) || list.length === 0) return;
        // Limit size to reduce quota pressure
        const trimmed = list.slice(0, 80);
        localStorage.setItem(
            `${XERA_CACHE_PROFILE_CONTENT_PREFIX}${userId}`,
            JSON.stringify(trimmed),
        );
    } catch (e) {
        // ignore
    }
}

async function preloadUserContents(users, { publicOnly = false } = {}) {
    const safeUsers = Array.isArray(users) ? users : [];
    if (safeUsers.length === 0) return;

    const columns = publicOnly
        ? `
            *,
            arcs (
                id,
                title,
                status,
                user_id
            )
        `
        : `
            *,
            arcs (
                id,
                title,
                status,
                user_id
            ),
            projects (
                id,
                name
            )
        `;

    // Traitement par batch sur user_id pour limiter les requêtes.
    for (let i = 0; i < safeUsers.length; i += CONTENT_FETCH_BATCH_SIZE) {
        const chunk = safeUsers.slice(i, i + CONTENT_FETCH_BATCH_SIZE);
        const userIds = chunk.map((u) => u.id);
        try {
            const { data, error } = await supabase
                .from("content")
                .select(columns)
                .in("user_id", userIds)
                .order("day_number", { ascending: false });

            if (error) throw error;

            // Indexer par user_id
            const grouped = new Map();
            (data || []).forEach((row) => {
                const uid = row.user_id;
                if (!grouped.has(uid)) grouped.set(uid, []);
                grouped.get(uid).push(convertSupabaseContent(row));
            });

            chunk.forEach((user) => {
                userContents[user.id] = grouped.get(user.id) || [];
            });
        } catch (error) {
            console.error("Erreur préchargement contenu batch:", error);
            chunk.forEach((user) => {
                userContents[user.id] = [];
            });
        }
    }

    // Keep a lightweight cache for instant discover/profile boot
    persistDiscoverCache();
}

async function ensureUserProjectsLoaded(userId) {
    if (!userId) return [];
    if (Array.isArray(userProjects[userId])) {
        return userProjects[userId];
    }

    const projectsResult = await getUserProjects(userId);
    userProjects[userId] = projectsResult.success ? projectsResult.data || [] : [];
    return userProjects[userId];
}

// Charger toutes les données pour un utilisateur connecté
async function loadAllData() {
    try {
        window.hasLoadedUsers = false;
        window.userLoadError = null;
        resetLoadedCollections();

        // S'assurer que l'utilisateur connecté a un profil
        if (window.currentUser) {
            await ensureUserProfile(window.currentUser);
        }

        // Charger tous les utilisateurs
        const usersResult = await getAllUsers();
        if (!usersResult.success) {
            allUsers = [];
            window.userLoadError =
                usersResult.error || "Erreur de chargement des utilisateurs";
            window.hasLoadedUsers = true;
            return;
        }

        allUsers = usersResult.data || [];

        // S'assurer que l'utilisateur connecté est dans la liste
        if (
            window.currentUser &&
            !allUsers.find((u) => u.id === window.currentUser.id)
        ) {
            const userProfileResult = await getUserProfile(window.currentUser.id);
            if (userProfileResult.success) {
                allUsers.push(userProfileResult.data);
            }
        }

        computeAmbassadors();

        // Charger les badges vérifiés avant de rendre les annonces pour que le badge apparaisse
        await fetchVerifiedBadges();
        await Promise.all([
            preloadUserContents(allUsers, { publicOnly: false }),
            fetchAdminAnnouncements(),
        ]);

        window.hasLoadedUsers = true;
    } catch (error) {
        console.error("Erreur chargement données:", error);
        window.userLoadError =
            error.message || "Erreur de chargement des données";
        window.hasLoadedUsers = true;
    }
}

// Charger uniquement les données publiques
async function loadPublicData() {
    try {
        window.hasLoadedUsers = false;
        window.userLoadError = null;
        resetLoadedCollections();

        const usersResult = await getAllUsers();
        if (!usersResult.success) {
            allUsers = [];
            window.userLoadError =
                usersResult.error || "Erreur de chargement des utilisateurs";
            window.hasLoadedUsers = true;
            return;
        }

        allUsers = usersResult.data || [];
        computeAmbassadors();

        // Même ordre côté public pour assurer l'affichage correct des badges dans les annonces
        await fetchVerifiedBadges();
        await Promise.all([
            preloadUserContents(allUsers, { publicOnly: true }),
            fetchAdminAnnouncements(),
        ]);

        window.hasLoadedUsers = true;
    } catch (error) {
        console.error("Erreur chargement données publiques:", error);
        window.userLoadError =
            error.message || "Erreur de chargement des données";
        window.hasLoadedUsers = true;
    }
}

/* ========================================
   FONCTIONS UTILITAIRES
   ======================================== */

// Récupérer un utilisateur par ID
function getUser(userId) {
    const found = allUsers.find((u) => u.id === userId);
    if (found) return found;
    if (window.currentUser && window.currentUser.id === userId) {
        return window.currentUser;
    }
    return null;
}

// --- Gestion hashtags ---
function normalizeTag(tag) {
    return tag.replace(/^#/, "").trim().toLowerCase();
}

function parseTagsInput(inputValue) {
    if (!inputValue) return [];
    return Array.from(
        new Set(
            inputValue
                .split(/[,\s]+/)
                .map(normalizeTag)
                .filter(Boolean),
        ),
    ).slice(0, 12); // hard cap to avoid spam
}

function extractTagsFromDescription(rawDescription = "") {
    const pattern = /#hashtags:\s*([\w\-\#,\s]+)/i;
    const match = rawDescription.match(pattern);
    const tags = match
        ? match[1]
              .split(/[,\s]+/)
              .map(normalizeTag)
              .filter(Boolean)
        : [];
    const cleanDescription = match
        ? rawDescription.replace(match[0], "").trim()
        : rawDescription;
    return { tags, cleanDescription };
}

function encodeDescriptionWithTags(description, tags = []) {
    const unique = Array.from(new Set((tags || []).map(normalizeTag).filter(Boolean)));
    if (unique.length === 0) return description;
    const base = (description || "").trim();
    return `${base}${base ? "\n\n" : ""}#hashtags: ${unique.join(",")}`;
}

// Annonces : helpers
function isAnnouncementContent(content) {
    return (
        content &&
        content.type === "text" &&
        Array.isArray(content.tags) &&
        content.tags.includes("annonce")
    );
}

function loadAnnouncementReplies() {
    try {
        return JSON.parse(localStorage.getItem("rize_annonce_replies")) || {};
    } catch (e) {
        return {};
    }
}

function saveAnnouncementReplies(store) {
    try {
        localStorage.setItem("rize_annonce_replies", JSON.stringify(store));
    } catch (e) {
        // ignore
    }
}

function getReplyCount(contentId) {
    const store = loadAnnouncementReplies();
    const list = store[contentId] || [];
    return list.length;
}

function renderAnnouncementReplies(contentId) {
    const store = loadAnnouncementReplies();
    const list = store[contentId] || [];
    if (list.length === 0) {
        return `<div class="reply-empty">Aucune réponse pour le moment.</div>`;
    }
    return `
        <div class="reply-list">
            ${list
                .slice(-20)
                .map((r) => {
                    const user = getUser(r.userId);
                    const name = user ? user.name : "Utilisateur";
                    const avatar =
                        user?.avatar ||
                        "https://api.dicebear.com/7.x/identicon/svg?seed=anon";
                    const timeLabel = timeAgo(r.createdAt);
                    return `
                        <div class="reply-item">
                            <img src="${avatar}" class="reply-avatar" alt="${name}">
                            <div class="reply-body">
                                <div class="reply-meta">
                                    <span class="reply-name">${name}</span>
                                    <span class="reply-time">${timeLabel}</span>
                                </div>
                                <p>${r.body}</p>
                            </div>
                        </div>
                    `;
                })
                .join("")}
        </div>
    `;
}

function refreshRepliesUI(contentId) {
    document
        .querySelectorAll(`[data-replies-container="${contentId}"]`)
        .forEach((el) => {
            el.innerHTML = renderAnnouncementReplies(contentId);
        });
    const count = getReplyCount(contentId);
    document
        .querySelectorAll(`[data-reply-count="${contentId}"]`)
        .forEach((el) => (el.textContent = count));
}

function submitAnnouncementReply(contentId, inputId) {
    if (!contentId) return;
    if (!currentUser) {
        alert("Connectez-vous pour répondre à une annonce.");
        return;
    }
    const textarea = document.getElementById(inputId);
    const reply =
        textarea && textarea.value ? textarea.value.trim() : prompt("Votre réponse :");
    if (!reply) return;
    const store = loadAnnouncementReplies();
    const list = store[contentId] || [];
    list.push({
        userId: currentUser.id,
        body: reply,
        createdAt: new Date().toISOString(),
    });
    store[contentId] = list.slice(-100);
    saveAnnouncementReplies(store);
    if (textarea) textarea.value = "";
    refreshRepliesUI(contentId);
    ToastManager?.success?.("Réponse envoyée", "Merci pour votre retour !");
}

function openReplyPrompt(contentId) {
    submitAnnouncementReply(contentId);
}

// Récupérer le contenu d'un utilisateur
function getUserContentLocal(userId) {
    const contents = userContents[userId] || [];
    const visibleContents = isSuperAdmin()
        ? contents
        : contents.filter((c) => !c.isDeleted);
    // Sort by createdAt descending (newest first) instead of day_number
    // This ensures cards show the actual latest upload
    return visibleContents.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
}

// Récupérer le dernier contenu
function getLatestContent(userId) {
    const contents = getUserContentLocal(userId);
    return contents.length > 0 ? contents[0] : null;
}

function hasUserPublishedContent(userId) {
    if (!userId) return false;
    return getUserContentLocal(userId).length > 0;
}

function setPendingCreatePostAfterArc(userId, options = {}) {
    if (!userId) return;
    window.pendingCreatePostAfterArc = {
        userId,
        reason: options.reason || "arc-required",
        createdAt: Date.now(),
    };
}

function clearPendingCreatePostAfterArc() {
    window.pendingCreatePostAfterArc = null;
}

function isMobileOrPwaMobileContext() {
    const isMobileViewport =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 768px)").matches;
    if (!isMobileViewport) return false;

    const isStandalonePwa =
        (typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(display-mode: standalone)").matches) ||
        (typeof navigator !== "undefined" && navigator.standalone === true);

    // Mobile browser OR mobile PWA
    return isMobileViewport || isStandalonePwa;
}

function removeMobileArcOnboardingNotification() {
    const existing = document.getElementById("mobile-arc-onboarding-notice");
    if (existing) existing.remove();
}

function showMobileArcOnboardingNotification(userId) {
    removeMobileArcOnboardingNotification();
    const host = document.createElement("div");
    host.id = "mobile-arc-onboarding-notice";
    host.setAttribute("role", "status");
    host.style.cssText = [
        "position:fixed",
        "left:12px",
        "right:12px",
        "bottom:calc(env(safe-area-inset-bottom, 0px) + 12px)",
        "z-index:3000",
        "background:rgba(10,10,10,0.94)",
        "border:1px solid rgba(255,255,255,0.14)",
        "border-radius:14px",
        "padding:12px",
        "backdrop-filter:blur(10px)",
        "box-shadow:0 14px 40px rgba(0,0,0,0.45)",
        "color:#f5f5f5",
    ].join(";");

    host.innerHTML = `
        <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="font-size:1.1rem; line-height:1;">🚀</div>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px;">Démarrez votre premier ARC</div>
                <div style="font-size:0.84rem; color:rgba(245,245,245,0.82); line-height:1.35;">
                    Sur XERA, un ARC est votre trajectoire. Créez-le pour publier vos traces et suivre votre progression.
                </div>
            </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
            <button type="button" data-action="create" style="flex:1; border:none; border-radius:10px; padding:9px 10px; font-weight:700; font-size:0.86rem; background:#10b981; color:#072018; cursor:pointer;">
                Créer un ARC
            </button>
            <button type="button" data-action="close" style="border:1px solid rgba(255,255,255,0.16); border-radius:10px; padding:9px 12px; font-weight:700; font-size:0.84rem; background:transparent; color:#f5f5f5; cursor:pointer;">
                Fermer
            </button>
        </div>
    `;

    host
        .querySelector('[data-action="create"]')
        ?.addEventListener("click", () => {
            setPendingCreatePostAfterArc(userId, {
                reason: "first-post-onboarding-mobile",
            });
            if (typeof window.openCreateModal === "function") {
                window.openCreateModal();
            }
            removeMobileArcOnboardingNotification();
        });

    host
        .querySelector('[data-action="close"]')
        ?.addEventListener("click", () => {
            removeMobileArcOnboardingNotification();
        });

    document.body.appendChild(host);
}

async function maybeStartFirstPostFlow() {
    if (!window.currentUser || firstPostOnboardingHandled) return;
    if (!document.getElementById("create-modal")) return;
    const isMobileContext = isMobileOrPwaMobileContext();
    // N'afficher l'onboarding ARC que sur Discover
    const isOnDiscover =
        !!document.querySelector("#discover.active") ||
        !!document.querySelector(".discover-grid");
    if (!isOnDiscover) return;
    firstPostOnboardingHandled = true;

    const userId = window.currentUser.id;
    if (hasUserPublishedContent(userId)) return;

    let firstArcId = null;
    try {
        const { data, error } = await supabase
            .from("arcs")
            .select("id")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })
            .limit(1);
        if (error) throw error;
        firstArcId = data && data[0] ? data[0].id : null;
    } catch (error) {
        console.error("Erreur vérification ARC pour onboarding:", error);
        // En cas d'erreur réseau/RLS, ne pas afficher de faux onboarding.
        return;
    }

    if (firstArcId) {
        if (isMobileContext) return;
        const shouldOpenCreate =
            confirm(
                "Bienvenue sur XERA. Voulez-vous publier votre première trace maintenant ?",
            ) === true;
        if (shouldOpenCreate) {
            openCreateMenu(userId, firstArcId);
        }
        return;
    }

    const shouldStartArc =
        isMobileContext
            ? true
            : confirm(
                  "Bienvenue sur XERA. Pour publier votre première trace, commencez par créer votre premier ARC. Lancer la création maintenant ?",
              ) === true;
    if (isMobileContext) {
        showMobileArcOnboardingNotification(userId);
        return;
    }
    if (!shouldStartArc) return;

    setPendingCreatePostAfterArc(userId, { reason: "first-post-onboarding" });
    if (typeof window.openCreateModal === "function") {
        window.openCreateModal();
    }
}

// Récupérer l'état dominant
function getDominantState(userId) {
    const contents = getUserContentLocal(userId);
    if (contents.length === 0) return "empty";
    return contents[0].state;
}

// Formater le temps écoulé (il y a X temps)
function timeAgo(date) {
    if (!date) return "";

    const now = new Date();
    const past = new Date(date);
    if (!Number.isFinite(past.getTime())) return "";
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) {
        return "à l'instant";
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `il y a ${diffInMinutes} min`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `il y a ${diffInHours}h`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `il y a ${diffInDays}j`;
    }

    try {
        return new Intl.DateTimeFormat("fr-FR", {
            day: "numeric",
            month: "short",
        }).format(past);
    } catch (e) {
        return "";
    }
}

function initXeraCarousels(root = document) {
    const scope = root || document;
    const carousels = Array.from(scope.querySelectorAll("[data-carousel]"));
    carousels.forEach((carousel) => {
        if (carousel.dataset.carouselInit === "1") return;
        carousel.dataset.carouselInit = "1";

        const track = carousel.querySelector(".xera-carousel-track");
        if (!track) return;
        const dots = Array.from(carousel.querySelectorAll(".xera-dot"));
        const slideCount = Math.max(dots.length, track.children.length || 0);
        const countCurrent = carousel.querySelector("[data-carousel-current]");
        const countTotal = carousel.querySelector("[data-carousel-total]");
        const prevBtn = carousel.querySelector(".xera-carousel-arrow--prev");
        const nextBtn = carousel.querySelector(".xera-carousel-arrow--next");

        if (countTotal) countTotal.textContent = String(slideCount || 0);

        const setActive = (index) => {
            dots.forEach((d, i) => d.classList.toggle("active", i === index));
            if (countCurrent) countCurrent.textContent = String(index + 1);
            if (prevBtn) prevBtn.disabled = index <= 0;
            if (nextBtn) nextBtn.disabled = index >= slideCount - 1;
        };

        let ticking = false;
        const updateFromScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const width = track.clientWidth || 1;
                const idx = Math.max(
                    0,
                    Math.min(
                        Math.max(slideCount - 1, 0),
                        Math.round(track.scrollLeft / width),
                    ),
                );
                setActive(idx);
                ticking = false;
            });
        };
        const goToIndex = (index) => {
            if (slideCount <= 0) return;
            const safeIndex = Math.max(0, Math.min(slideCount - 1, index));
            const width = track.clientWidth || 0;
            track.scrollTo({ left: width * safeIndex, behavior: "smooth" });
            setActive(safeIndex);
        };

        track.addEventListener("scroll", updateFromScroll, { passive: true });
        if (dots.length > 0) {
            dots.forEach((dot) => {
                dot.addEventListener("click", () => {
                    const index = parseInt(dot.dataset.index || "0", 10);
                    goToIndex(index);
                });
            });
        }
        if (prevBtn) {
            prevBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const width = track.clientWidth || 1;
                const currentIndex = Math.round(track.scrollLeft / width);
                goToIndex(currentIndex - 1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const width = track.clientWidth || 1;
                const currentIndex = Math.round(track.scrollLeft / width);
                goToIndex(currentIndex + 1);
            });
        }
        updateFromScroll();
    });
}

// Convertir les données Supabase en format compatible avec le code existant
function convertSupabaseUser(supabaseUser) {
    return {
        userId: supabaseUser.id,
        name: supabaseUser.name,
        title: supabaseUser.title || "",
        avatar: supabaseUser.avatar,
        banner: supabaseUser.banner,
        bio: supabaseUser.bio || "",
        socialLinks: supabaseUser.social_links || {},
        projects: userProjects[supabaseUser.id] || [],
    };
}

function convertSupabaseContent(supabaseContent) {
    const arcOwner = supabaseContent.arcs?.user_id
        ? getUser(supabaseContent.arcs.user_id)
        : null;
    const rawDescription = supabaseContent.description || "";
    const { tags, cleanDescription } = extractTagsFromDescription(rawDescription);

    let mediaUrls = [];
    if (Array.isArray(supabaseContent.media_urls)) {
        mediaUrls = supabaseContent.media_urls.filter(Boolean);
    } else if (typeof supabaseContent.media_urls === "string") {
        try {
            const parsed = JSON.parse(supabaseContent.media_urls);
            if (Array.isArray(parsed)) mediaUrls = parsed.filter(Boolean);
        } catch (e) {
            mediaUrls = [];
        }
    }
    const mediaUrl = supabaseContent.media_url;
    if ((!mediaUrls || mediaUrls.length === 0) && mediaUrl) {
        mediaUrls = [mediaUrl];
    }
    return {
        contentId: supabaseContent.id,
        userId: supabaseContent.user_id,
        projectId: supabaseContent.project_id,
        arcId: supabaseContent.arc_id,
        dayNumber: supabaseContent.day_number,
        type: supabaseContent.type,
        state: supabaseContent.state,
        title: supabaseContent.title,
        description: cleanDescription,
        rawDescription,
        tags,
        mediaUrl: mediaUrl,
        mediaUrls: mediaUrls,
        views: supabaseContent.views || 0,
        encouragementsCount: supabaseContent.encouragements_count || 0,
        createdAt: new Date(supabaseContent.created_at),
        isDeleted: !!supabaseContent.is_deleted,
        deletedAt: supabaseContent.deleted_at
            ? new Date(supabaseContent.deleted_at)
            : null,
        deletedReason: supabaseContent.deleted_reason || "",
        arc: supabaseContent.arcs
            ? {
                  id: supabaseContent.arcs.id,
                  title: supabaseContent.arcs.title,
                  status: supabaseContent.arcs.status,
                  stageLevel: supabaseContent.arcs.stage_level || "idee",
                  opportunityIntents: Array.isArray(
                      supabaseContent.arcs.opportunity_intents,
                  )
                      ? supabaseContent.arcs.opportunity_intents
                      : [],
                  ownerId: supabaseContent.arcs.user_id || null,
                  ownerName: arcOwner?.name || null,
                  ownerAvatar: arcOwner?.avatar || null,
              }
            : null,
        project: supabaseContent.projects
            ? {
                  id: supabaseContent.projects.id,
                  name: supabaseContent.projects.name,
              }
            : null,
    };
}

/* ========================================
   SYSTÈME DE FOLLOWERS (SUPABASE)
   ======================================== */

async function toggleFollow(viewerId, targetUserId) {
    if (!window.currentUser) {
        ToastManager.info(
            "Login required",
            "Vous devez être connecté pour suivre des utilisateurs",
        );
        setTimeout(() => (window.location.href = "login.html"), 1500);
        return;
    }

    const profile = getCurrentUserProfile();
    if (isUserBanned(profile)) {
        const remaining = getBanRemainingLabel(profile);
        ToastManager.error(
            "Compte temporairement banni",
            remaining
                ? `Vous pourrez réessayer dans ${remaining}.`
                : "Vous ne pouvez pas suivre des utilisateurs pour le moment.",
        );
        return;
    }

    const profileBtn = document.getElementById(`follow-btn-${targetUserId}`);
    const cardBtns = Array.from(
        document.querySelectorAll(
            `[data-follow-card-user="${targetUserId}"]`,
        ),
    );
    const immersiveBtn = document.getElementById(
        `follow-immersive-btn-${targetUserId}`,
    );
    const immersivePostBtns = document.querySelectorAll(
        `[data-follow-user="${targetUserId}"]`,
    );

    // Use the button that triggered the action for loading state, or profile button as default
    const activeBtn =
        document.activeElement &&
        (document.activeElement === profileBtn ||
            cardBtns.includes(document.activeElement) ||
            document.activeElement === immersiveBtn)
            ? document.activeElement
            : profileBtn || cardBtns[0] || immersiveBtn;

    await LoadingManager.withLoading(activeBtn, async () => {
        const isCurrentlyFollowing = await isFollowing(viewerId, targetUserId);
        const followResult = isCurrentlyFollowing
            ? await unfollowUser(viewerId, targetUserId)
            : await followUser(viewerId, targetUserId);

        if (!followResult || !followResult.success) {
            ToastManager.error(
                "Erreur",
                followResult?.error ||
                    "Impossible de mettre a jour l'abonnement",
            );
            return;
        }

        const isNowFollowing = !isCurrentlyFollowing;

        // Garder un cache local cohérent pour éviter les requêtes répétées.
        followedUserIdsCacheOwner = viewerId;
        if (isNowFollowing) {
            followedUserIdsCache.add(targetUserId);
        } else {
            followedUserIdsCache.delete(targetUserId);
        }
        followedUserIdsCacheUpdatedAt = Date.now();

        // Update Profile Button
        if (profileBtn) {
            profileBtn.classList.toggle("unfollow", isNowFollowing);
            profileBtn.innerHTML = `<img src="${isNowFollowing ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 24px; height: 24px;">`;
        }

        // Update Card Button
        cardBtns.forEach((cardBtn) => {
            cardBtn.classList.toggle("unfollow", isNowFollowing);
            cardBtn.title = isNowFollowing ? "Se désabonner" : "S'abonner";
            // Reset styles that might have been inline
            cardBtn.style.background = "transparent";
            cardBtn.style.border = "none";
            cardBtn.innerHTML = `<img src="${isNowFollowing ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 24px; height: 24px;">`;
        });

        // Update Immersive Button
        if (immersiveBtn) {
            immersiveBtn.classList.toggle("unfollow", isNowFollowing);
            immersiveBtn.innerHTML = `<img src="${isNowFollowing ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 24px; height: 24px;">`;
        }

        if (immersivePostBtns && immersivePostBtns.length > 0) {
            immersivePostBtns.forEach((btn) => {
                btn.classList.toggle("unfollow", isNowFollowing);
                btn.innerHTML = `<img src="${isNowFollowing ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 20px; height: 20px;">`;
            });
        }

        // Toast notification
        if (isNowFollowing) {
            ToastManager.success(
                "Abonnement confirmé",
                "Vous suivez maintenant cet utilisateur",
            );
            if (profileBtn) AnimationManager.bounceIn(profileBtn);
            cardBtns.forEach((cardBtn) => AnimationManager.bounceIn(cardBtn));
            if (immersiveBtn) AnimationManager.bounceIn(immersiveBtn);
            // Notification au suivi pour le propriétaire du profil
            if (typeof notifyNewFollower === "function") {
                notifyNewFollower(viewerId, targetUserId).catch((e) =>
                    console.warn("Notify follower failed:", e),
                );
            }
        } else {
            ToastManager.info(
                "Désabonnement",
                "Vous ne suivez plus cet utilisateur",
            );
        }

        // Update follower counts
        if (window.currentProfileViewed === targetUserId) {
            const followerCount = await getFollowerCount(targetUserId);
            const followerStats = document.querySelectorAll(
                ".follower-stat-count",
            );
            if (followerStats[0]) {
                followerStats[0].textContent = followerCount;
            } else if (followerStats.length > 0) {
                followerStats.forEach(
                    (stat) => (stat.textContent = followerCount),
                );
            }
        }

        if (window.currentProfileViewed === viewerId) {
            const followingCount = await getFollowingCount(viewerId);
            const followerStats = document.querySelectorAll(
                ".follower-stat-count",
            );
            if (followerStats[1]) {
                followerStats[1].textContent = followingCount;
            }
        }

        // If we are in "Following" filter mode on Discover, we might need to remove the card if we unfollowed
        if (
            window.discoverFilter === "following" &&
            !isNowFollowing
        ) {
            const cards = Array.from(
                document.querySelectorAll(
                    `.discover-grid .user-card[data-user="${targetUserId}"]`,
                ),
            );
            if (cards.length > 0) {
                cards.forEach((card) => {
                    card.style.opacity = "0";
                    card.style.transition = "opacity 0.25s ease";
                });
                setTimeout(() => {
                    cards.forEach((card) => card.remove());
                    // Check if grid is empty
                    if (
                        document.querySelectorAll(".discover-grid .user-card")
                            .length === 0
                    ) {
                        renderDiscoverGrid(); // Will show empty state
                    }
                }, 280);
            } else {
                renderDiscoverGrid();
            }
        }
    });
}

/* ========================================
   NOTIFICATIONS SUIVEURS
   ======================================== */

function getCurrentUserDisplayName() {
    const profile = getCurrentUserProfile();
    return (
        profile?.name ||
        profile?.username ||
        window.currentUser?.email ||
        "Un membre XERA"
    );
}

function safeProfileLink(userId) {
    return userId ? buildProfileUrl(userId) : "profile.html";
}

async function notifyNewFollower(followerId, targetUserId) {
    if (
        typeof createNotification !== "function" ||
        typeof getFollowerIds !== "function"
    )
        return;
    try {
        const followerName =
            getCurrentUserDisplayName() || "Un nouveau membre";
        await createNotification(
            targetUserId,
            "follow",
            `${followerName} s'est abonné(e) à vous`,
            safeProfileLink(followerId),
        );
    } catch (e) {
        console.warn("notifyNewFollower error", e);
    }
}

async function notifyFollowersOfTrace(contentRow) {
    if (
        !contentRow ||
        typeof getFollowerIds !== "function" ||
        typeof createNotification !== "function"
    )
        return;
    const userId = contentRow.user_id || contentRow.userId;
    if (!userId) return;
    try {
        const followerIds = await getFollowerIds(userId);
        if (!followerIds.length) return;
        const actorName = getCurrentUserDisplayName();
        const message = `${actorName} a publié une nouvelle trace : ${contentRow.title || "Nouvelle mise à jour"}`;
        const link = safeProfileLink(userId);
        await Promise.allSettled(
            followerIds
                .filter((fid) => fid && fid !== userId)
                .map((fid) =>
                    createNotification(fid, "new_trace", message, link),
                ),
        );
    } catch (e) {
        console.warn("notifyFollowersOfTrace error", e);
    }
}

async function notifyFollowersOfArcStart(arcRow) {
    if (
        !arcRow ||
        typeof getFollowerIds !== "function" ||
        typeof createNotification !== "function"
    )
        return;
    const userId = arcRow.user_id;
    if (!userId) return;
    try {
        const followerIds = await getFollowerIds(userId);
        if (!followerIds.length) return;
        const actorName = getCurrentUserDisplayName();
        const message = `${actorName} a lancé un nouvel ARC : ${arcRow.title || "Nouvel ARC"}`;
        const link = safeProfileLink(userId);
        await Promise.allSettled(
            followerIds
                .filter((fid) => fid && fid !== userId)
                .map((fid) =>
                    createNotification(fid, "new_arc", message, link),
                ),
        );
    } catch (e) {
        console.warn("notifyFollowersOfArcStart error", e);
    }
}

async function notifyFollowersOfLiveStart(contentRow, title) {
    if (
        !contentRow ||
        typeof getFollowerIds !== "function" ||
        typeof createNotification !== "function"
    )
        return;
    const userId = contentRow.user_id || contentRow.userId;
    if (!userId) return;
    try {
        const followerIds = await getFollowerIds(userId);
        if (!followerIds.length) return;
        const actorName = getCurrentUserDisplayName();
        const liveTitle = title || contentRow.title || "Live en cours";
        const link = contentRow.id
            ? `stream.html?id=${contentRow.id}&host=${userId}`
            : safeProfileLink(userId);
        const message = `${actorName} a démarré un live : ${liveTitle}`;
        await Promise.allSettled(
            followerIds
                .filter((fid) => fid && fid !== userId)
                .map((fid) =>
                    createNotification(fid, "live_start", message, link),
                ),
        );
    } catch (e) {
        console.warn("notifyFollowersOfLiveStart error", e);
    }
}

async function fetchContentOwner(contentId) {
    if (!contentId) return null;
    // Try local cache first
    const cached = findContentById(contentId);
    if (cached) {
        return {
            user_id: cached.userId || cached.user_id,
            title: cached.title,
        };
    }
    try {
        const { data, error } = await supabase
            .from("content")
            .select("id, user_id, title")
            .eq("id", contentId)
            .maybeSingle();
        if (error) throw error;
        return data || null;
    } catch (e) {
        console.warn("fetchContentOwner error", e);
        return null;
    }
}

async function notifyEncouragement(contentId) {
    if (
        !contentId ||
        typeof createNotification !== "function" ||
        typeof fetchContentOwner !== "function"
    )
        return;
    const owner = await fetchContentOwner(contentId);
    if (!owner || !owner.user_id) return;
    const ownerId = owner.user_id;
    if (ownerId === currentUser?.id) return; // Pas de notif pour soi-même
    const actorName = getCurrentUserDisplayName();
    const message = `${actorName} t'a encouragé sur "${owner.title || "ta trace"}"`;
    const link = safeProfileLink(ownerId);
    try {
        await createNotification(ownerId, "encouragement", message, link);
    } catch (e) {
        console.warn("notifyEncouragement createNotification error", e);
    }
}

/* ========================================
   INTERACTIONS (VUES & ENCOURAGEMENTS)
   ======================================== */

async function incrementViews(contentId) {
    try {
        await supabase.rpc("increment_views", { row_id: contentId });
    } catch (error) {
        console.error("Erreur incrementViews:", error);
    }
}

const immersiveViewTimers = new Map();

function clearImmersiveViewTracker(postEl) {
    if (!postEl) return;
    const key = postEl.dataset.contentId || postEl;
    const tracker = immersiveViewTimers.get(key);
    if (!tracker) return;
    if (tracker.intervalId) clearInterval(tracker.intervalId);
    if (tracker.timeoutId) clearTimeout(tracker.timeoutId);
    immersiveViewTimers.delete(key);
}

function bumpImmersiveViewCount(postEl, amount = 1) {
    const viewCountSpan = postEl?.querySelector(".stat-pill span");
    if (!viewCountSpan) return;
    const current = parseInt(viewCountSpan.textContent, 10) || 0;
    viewCountSpan.textContent = current + amount;
}

function scheduleImmersiveViewCount(postEl, videoEl) {
    if (!postEl) return;
    const contentId = postEl.dataset.contentId;
    if (!contentId || postEl.dataset.viewed === "true") return;
    const key = contentId;
    if (immersiveViewTimers.has(key)) return;

    const content = findContentById(contentId);
    const contentType = content?.type || (videoEl ? "video" : "image");

    if (contentType === "video" && videoEl) {
        const tracker = {
            watchedMs: 0,
            lastTick: Date.now(),
            intervalId: null,
            timeoutId: null,
        };
        tracker.intervalId = setInterval(() => {
            const now = Date.now();
            const delta = Math.max(0, now - tracker.lastTick);
            tracker.lastTick = now;

            if (!videoEl.paused && !videoEl.ended && videoEl.readyState >= 2) {
                tracker.watchedMs += delta;
            }

            if (tracker.watchedMs >= 4000) {
                postEl.dataset.viewed = "true";
                clearImmersiveViewTracker(postEl);
                incrementViews(contentId);
                updateImmersivePrefs(content, "view");
                recordImmersiveViewForLoginPrompt();
                bumpImmersiveViewCount(postEl, 1);
            }
        }, 250);
        immersiveViewTimers.set(key, tracker);
        return;
    }

    const timeoutId = setTimeout(() => {
        postEl.dataset.viewed = "true";
        clearImmersiveViewTracker(postEl);
        incrementViews(contentId);
        updateImmersivePrefs(content, "view");
        recordImmersiveViewForLoginPrompt();
        bumpImmersiveViewCount(postEl, 1);
    }, 2000);
    immersiveViewTimers.set(key, {
        watchedMs: 0,
        lastTick: Date.now(),
        intervalId: null,
        timeoutId,
    });
}

async function toggleCourage(contentId, btnElement) {
    if (!currentUser) {
        ToastManager.info(
            "Login required",
            "Connectez-vous pour encourager",
        );
        return;
    }
    if (!btnElement) return;

    const allCourageButtons = Array.from(
        document.querySelectorAll(
            `.courage-btn[data-content-id="${contentId}"]`,
        ),
    );
    if (btnElement && !allCourageButtons.includes(btnElement)) {
        allCourageButtons.push(btnElement);
    }

    const updateButtonUI = (btn, encouraged, count) => {
        if (!btn) return;
        const img = btn.querySelector("img");
        const countSpan = btn.querySelector(".courage-count");

        if (encouraged) {
            btn.classList.add("encouraged");
            if (img) {
                img.src = "icons/courage-green.svg";
            }
            if (img && window.AnimationManager) {
                AnimationManager.bounceIn(img);
            }
        } else {
            btn.classList.remove("encouraged");
            if (img) {
                img.src = "icons/courage-blue.svg";
            }
        }
        if (countSpan) {
            countSpan.textContent = String(Math.max(0, Number(count) || 0));
        }
    };

    const syncLocalContentCount = (count) => {
        const content = findContentById(contentId);
        if (content) {
            content.encouragementsCount = Math.max(0, Number(count) || 0);
        }
    };

    const currentCount = Number.parseInt(
        btnElement?.querySelector(".courage-count")?.textContent || "0",
        10,
    );
    const safeCurrentCount = Number.isFinite(currentCount) ? currentCount : 0;
    const isCurrentlyEncouraged = btnElement.classList.contains("encouraged");

    // Comportement demandé: une fois encouragé, le bouton reste vert.
    if (isCurrentlyEncouraged) {
        allCourageButtons.forEach((btn) => {
            const btnCount = Number.parseInt(
                btn.querySelector(".courage-count")?.textContent || "0",
                10,
            );
            updateButtonUI(
                btn,
                true,
                Number.isFinite(btnCount) ? btnCount : safeCurrentCount,
            );
        });
        return;
    }

    const optimisticCount = safeCurrentCount + 1;
    allCourageButtons.forEach((btn) => updateButtonUI(btn, true, optimisticCount));
    syncLocalContentCount(optimisticCount);

    try {
        const { data, error } = await supabase.rpc("toggle_courage", {
            row_id: contentId,
            user_id_param: currentUser.id,
        });

        if (error) throw error;

        // Sync with server truth
        if (data) {
            const serverCount = Number(data.count);
            const safeServerCount = Number.isFinite(serverCount)
                ? Math.max(0, serverCount)
                : optimisticCount;
            allCourageButtons.forEach((btn) => {
                updateButtonUI(btn, true, safeServerCount);
            });
            syncLocalContentCount(safeServerCount);
        }

        const content = findContentById(contentId);
        updateImmersivePrefs(content, "like");
        // Notifier l'auteur de la trace (sauf auto-encouragement)
        notifyEncouragement(contentId).catch((e) =>
            console.warn("notifyEncouragement error", e),
        );
    } catch (error) {
        console.error("Erreur toggleCourage:", error);
        // Revert on error
        allCourageButtons.forEach((btn) => {
            updateButtonUI(btn, false, safeCurrentCount);
        });
        syncLocalContentCount(safeCurrentCount);

        ToastManager.error(
            "Erreur",
            "Impossible de mettre à jour l'encouragement",
        );
    }
}

/* ========================================
   SYSTÈME DE BADGES (CONSERVÉ)
   ======================================== */

const AMBASSADOR_LIMIT = 150;
const BADGE_ASSET_VERSION = "2";
let ambassadorUserIds = new Set();

const SUPER_ADMIN_ID = "b0f9f893-1706-4721-899c-d26ad79afc86";
const VERIFICATION_ADMIN_IDS = new Set([SUPER_ADMIN_ID]);

let verifiedCreatorUserIds = new Set();
let verifiedStaffUserIds = new Set();
let verificationRequests = [];

function isSuperAdmin() {
    return !!window.currentUser && window.currentUser.id === SUPER_ADMIN_ID;
}

function getCurrentUserProfile() {
    if (!window.currentUser) return null;
    return (
        (window.allUsers || []).find((u) => u.id === window.currentUser.id) ||
        null
    );
}

function isUserBanned(userProfile) {
    if (!userProfile || !userProfile.banned_until) return false;
    const now = new Date();
    const bannedUntil = new Date(userProfile.banned_until);
    return bannedUntil > now;
}

function getBanRemainingLabel(userProfile) {
    if (!userProfile || !userProfile.banned_until) return "";
    const now = new Date();
    const bannedUntil = new Date(userProfile.banned_until);
    const diffMs = bannedUntil - now;
    if (diffMs <= 0) return "";
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    if (diffMinutes < 60) return `${diffMinutes} min`;
    const diffHours = Math.ceil(diffMinutes / 60);
    if (diffHours < 48) return `${diffHours} h`;
    const diffDays = Math.ceil(diffHours / 24);
    return `${diffDays} j`;
}

function computeAmbassadors() {
    if (!Array.isArray(allUsers) || allUsers.length === 0) {
        ambassadorUserIds = new Set();
        return;
    }

    const sortedByCreation = [...allUsers]
        .filter((user) => user && user.created_at)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    ambassadorUserIds = new Set(
        sortedByCreation.slice(0, AMBASSADOR_LIMIT).map((user) => user.id),
    );
}

async function fetchVerifiedBadges() {
    try {
        const { data, error } = await supabase
            .from("verified_badges")
            .select("user_id, type");

        if (error) throw error;

        const creators = new Set();
        const staff = new Set();
        (data || []).forEach((item) => {
            if (item.type === "staff") staff.add(item.user_id);
            if (item.type === "creator") creators.add(item.user_id);
        });

        verifiedCreatorUserIds = creators;
        verifiedStaffUserIds = staff;

        // Fallback local: le super admin est toujours staff vérifié côté UI
        if (SUPER_ADMIN_ID) {
            verifiedStaffUserIds.add(SUPER_ADMIN_ID);
        }
    } catch (error) {
        console.error("Erreur récupération badges vérifiés:", error);
        verifiedCreatorUserIds = new Set();
        verifiedStaffUserIds = new Set();
        if (SUPER_ADMIN_ID) {
            verifiedStaffUserIds.add(SUPER_ADMIN_ID);
        }
    }
}

function getVerifiedBadgeSets() {
    return {
        creators: new Set(verifiedCreatorUserIds || []),
        staff: new Set(verifiedStaffUserIds || []),
    };
}

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function fetchAdminAnnouncements() {
    try {
        const { data, error } = await supabase
            .from("admin_announcements")
            .select("*, users(id, name, avatar)")
            .is("deleted_at", null)
            .order("is_pinned", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(10);

        if (error) throw error;
        window.adminAnnouncements = data || [];
        renderAnnouncements();
        renderAdminAnnouncementsList();
    } catch (error) {
        console.error("Erreur récupération annonces admin:", error);
        window.adminAnnouncements = [];
        renderAnnouncements();
        renderAdminAnnouncementsList();
    }
}

function renderAnnouncements() {
    const container = document.getElementById("announcements-container");
    if (!container) return;
    const announcements = window.adminAnnouncements || [];
    if (announcements.length === 0) {
        container.innerHTML = "";
        container.style.display = "none";
        return;
    }

    container.style.display = "grid";
    container.innerHTML = announcements
        .map((item) => {
            const title = escapeHtml(item.title || "Annonce");
            const body = escapeHtml(item.body || "");
            const author = item.users || {};
            const authorId = item.author_id || author.id || SUPER_ADMIN_ID || null;
            const authorName = escapeHtml(author.name || "Administration");
            const authorAvatar =
                author.avatar &&
                (String(author.avatar).startsWith("http") ||
                    String(author.avatar).startsWith("data:"))
                    ? author.avatar
                    : "https://placehold.co/48";
            const authorNameHtml =
                authorId && typeof renderUsernameWithBadge === "function"
                    ? renderUsernameWithBadge(authorName, authorId)
                    : authorName;
            const createdAt = item.created_at
                ? new Date(item.created_at)
                : null;
            const timeLabel = safeFormatDate(createdAt, {
                day: "numeric",
                month: "short",
            });
            return `
            <div class="announcement-card ${item.is_pinned ? "pinned" : ""}">
                <div class="announcement-header">
                    <span class="announcement-title">${title}</span>
                    ${item.is_pinned ? '<span class="announcement-pin">Épinglé</span>' : ""}
                </div>
                <div class="announcement-author">
                    <img class="announcement-avatar" src="${authorAvatar}" alt="${authorName}">
                    <div class="announcement-author-meta">
                        <div class="announcement-author-name">${authorNameHtml}</div>
                        <span class="announcement-chip">Annonce officielle</span>
                    </div>
                </div>
                <p class="announcement-body">${body}</p>
                <div class="announcement-meta">${timeLabel}</div>
            </div>
        `;
        })
        .join("");
}

async function createAdminAnnouncement(payload) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return { success: false };
    }
    const title = String(payload?.title || "").trim();
    const body = String(payload?.body || "").trim();
    const isPinned = !!payload?.isPinned;

    if (!title || !body) {
        ToastManager?.info("Champs requis", "Ajoutez un titre et un contenu.");
        return { success: false };
    }

    try {
        const { error } = await supabase.from("admin_announcements").insert({
            author_id: window.currentUser?.id || null,
            title,
            body,
            is_pinned: isPinned,
        });
        if (error) throw error;
        ToastManager?.success("Annonce publiée", "Votre message est en ligne.");
        await fetchAdminAnnouncements();
        return { success: true };
    } catch (error) {
        console.error("Erreur publication annonce:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de publier.",
        );
        return { success: false, error };
    }
}

async function updateAdminAnnouncement(payload) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return { success: false };
    }
    const id = String(payload?.id || "").trim();
    const title = String(payload?.title || "").trim();
    const body = String(payload?.body || "").trim();
    const isPinned = !!payload?.isPinned;

    if (!id) {
        ToastManager?.error("Erreur", "Annonce introuvable.");
        return { success: false };
    }
    if (!title || !body) {
        ToastManager?.info("Champs requis", "Ajoutez un titre et un contenu.");
        return { success: false };
    }

    try {
        const { error } = await supabase
            .from("admin_announcements")
            .update({
                title,
                body,
                is_pinned: isPinned,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id);
        if (error) throw error;
        ToastManager?.success("Annonce mise à jour", "Modifications enregistrées.");
        await fetchAdminAnnouncements();
        return { success: true };
    } catch (error) {
        console.error("Erreur modification annonce:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de modifier l'annonce.",
        );
        return { success: false, error };
    }
}

async function deleteAdminAnnouncement(announcementId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return { success: false };
    }
    const id = String(announcementId || "").trim();
    if (!id) return { success: false };
    if (!confirm("Supprimer cette annonce officielle ?")) {
        return { success: false };
    }

    try {
        const { error } = await supabase
            .from("admin_announcements")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id);
        if (error) throw error;
        ToastManager?.success("Annonce supprimée", "Elle n'est plus visible.");
        await fetchAdminAnnouncements();
        return { success: true };
    } catch (error) {
        console.error("Erreur suppression annonce:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de supprimer l'annonce.",
        );
        return { success: false, error };
    }
}

function resetAdminAnnouncementForm() {
    const idInput = document.getElementById("admin-announcement-id");
    const titleInput = document.getElementById("admin-announcement-title");
    const bodyInput = document.getElementById("admin-announcement-body");
    const pinInput = document.getElementById("admin-announcement-pin");
    const submitBtn = document.getElementById("admin-announcement-submit");
    const cancelBtn = document.getElementById("admin-announcement-cancel");

    if (idInput) idInput.value = "";
    if (titleInput) titleInput.value = "";
    if (bodyInput) bodyInput.value = "";
    if (pinInput) pinInput.checked = false;
    if (submitBtn) submitBtn.textContent = "Publier";
    if (cancelBtn) cancelBtn.style.display = "none";
}

async function submitAdminAnnouncement() {
    const idInput = document.getElementById("admin-announcement-id");
    const titleInput = document.getElementById("admin-announcement-title");
    const bodyInput = document.getElementById("admin-announcement-body");
    const pinInput = document.getElementById("admin-announcement-pin");
    if (!titleInput || !bodyInput || !pinInput) return;

    const id = idInput ? idInput.value : "";
    const payload = {
        id,
        title: titleInput.value,
        body: bodyInput.value,
        isPinned: pinInput.checked,
    };
    const result = id
        ? await updateAdminAnnouncement(payload)
        : await createAdminAnnouncement(payload);
    if (result?.success) {
        resetAdminAnnouncementForm();
    }
}

function editAdminAnnouncement(announcementId) {
    if (!isSuperAdmin()) return;
    const id = String(announcementId || "");
    const announcements = window.adminAnnouncements || [];
    const item = announcements.find((a) => String(a.id) === id);
    if (!item) return;

    const idInput = document.getElementById("admin-announcement-id");
    const titleInput = document.getElementById("admin-announcement-title");
    const bodyInput = document.getElementById("admin-announcement-body");
    const pinInput = document.getElementById("admin-announcement-pin");
    const submitBtn = document.getElementById("admin-announcement-submit");
    const cancelBtn = document.getElementById("admin-announcement-cancel");

    if (idInput) idInput.value = id;
    if (titleInput) titleInput.value = item.title || "";
    if (bodyInput) bodyInput.value = item.body || "";
    if (pinInput) pinInput.checked = !!item.is_pinned;
    if (submitBtn) submitBtn.textContent = "Mettre à jour";
    if (cancelBtn) cancelBtn.style.display = "inline-flex";
}

function cancelAdminAnnouncementEdit() {
    resetAdminAnnouncementForm();
}

function renderAdminAnnouncementsList() {
    const container = document.getElementById("admin-announcements-list");
    if (!container) return;
    const announcements = window.adminAnnouncements || [];
    if (announcements.length === 0) {
        container.innerHTML =
            '<div class="verification-empty">Aucune annonce officielle.</div>';
        return;
    }
    container.innerHTML = announcements
        .map((item) => {
            const title = escapeHtml(item.title || "Annonce");
            const body = escapeHtml(item.body || "");
            const safeId = String(item.id || "").replace(/"/g, "&quot;");
            const createdAt = item.created_at
                ? new Date(item.created_at)
                : null;
            const timeLabel = safeFormatDate(createdAt, {
                day: "numeric",
                month: "short",
            });
            return `
            <div class="announcement-card ${item.is_pinned ? "pinned" : ""}">
                <div class="announcement-header">
                    <span class="announcement-title">${title}</span>
                    ${item.is_pinned ? '<span class="announcement-pin">Épinglé</span>' : ""}
                </div>
                <p class="announcement-body">${body}</p>
                <div class="announcement-meta">${timeLabel}</div>
                <div class="announcement-actions">
                    <button type="button" class="btn-verify" onclick="editAdminAnnouncement('${safeId}')">Modifier</button>
                    <button type="button" class="btn-cancel" onclick="deleteAdminAnnouncement('${safeId}')">Supprimer</button>
                </div>
            </div>
        `;
        })
        .join("");
}

function getSuperAdminPanelHtml() {
    if (!isSuperAdmin()) return "";
    return `
        <div class="settings-section">
            <h3>Super admin</h3>
            <p style="color: var(--text-secondary); margin-bottom: 1rem;">Section dédiée aux annonces officielles.</p>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Annonce officielle</h4>
                <div class="verification-input-row" style="flex-direction: column; align-items: stretch;">
                    <input type="hidden" id="admin-announcement-id">
                    <input type="text" id="admin-announcement-title" class="form-input" placeholder="Titre de l'annonce">
                    <textarea id="admin-announcement-body" class="form-input" rows="3" placeholder="Contenu de l'annonce"></textarea>
                    <label style="display:flex; align-items:center; gap:0.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                        <input type="checkbox" id="admin-announcement-pin"> Épingler
                    </label>
                    <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap: wrap;">
                        <button type="button" class="btn-verify" id="admin-announcement-submit" onclick="submitAdminAnnouncement()">Publier</button>
                        <button type="button" class="btn-cancel" id="admin-announcement-cancel" onclick="cancelAdminAnnouncementEdit()" style="display:none;">Annuler modification</button>
                    </div>
                </div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Gérer les annonces</h4>
                <div id="admin-announcements-list"></div>
            </div>
            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Badges (page dédiée)</h4>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">
                    Gérer les badges vérifiés sur la page dédiée.
                </p>
                <a href="badges-admin.html" class="btn-verify" style="display:inline-flex; align-items:center; gap:0.5rem; width:auto;">
                    Ouvrir la page Badges
                    <img src="icons/verify-personal.svg?v=2" alt="Badge" style="width:18px;height:18px;">
                </a>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    <h4 style="margin:0;">Pulse temps réel</h4>
                    <button class="btn-verify" type="button" id="admin-stats-refresh" onclick="refreshAppPulse()">Mettre à jour</button>
                </div>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0.35rem 0 0.9rem;">
                    Comptes, visites (proxy via vues de contenu) et actifs estimés, en direct depuis Supabase.
                </p>
                <div id="admin-stats-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:0.75rem;">
                    <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem;">
                        <div style="font-size:0.9rem; color:var(--text-secondary);">Utilisateurs</div>
                        <div id="admin-stats-users" style="font-size:1.8rem; font-weight:700; margin:0.3rem 0;">—</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary);">Total comptes créés</div>
                    </div>
                    <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem;">
                        <div style="font-size:0.9rem; color:var(--text-secondary);">Visites (proxy)</div>
                        <div id="admin-stats-visits" style="font-size:1.8rem; font-weight:700; margin:0.3rem 0;">—</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary);">Somme des vues de contenu</div>
                    </div>
                    <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem;">
                        <div style="font-size:0.9rem; color:var(--text-secondary);">Actifs quotidiens (24h)</div>
                        <div id="admin-stats-dau" style="font-size:1.8rem; font-weight:700; margin:0.3rem 0;">—</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary);">Utilisateurs ayant posté aujourd'hui</div>
                    </div>
                    <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem;">
                        <div style="font-size:0.9rem; color:var(--text-secondary);">MAU estimés (30j)</div>
                        <div id="admin-stats-mau" style="font-size:1.8rem; font-weight:700; margin:0.3rem 0;">—</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary);">Utilisateurs uniques actifs sur 30 jours</div>
                    </div>
                </div>
                <div id="admin-stats-meta" style="color: var(--text-secondary); font-size:0.9rem; margin-top:0.35rem;">Clique sur « Mettre à jour » pour rafraîchir.</div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    <h4 style="margin:0;">Feedback utilisateurs</h4>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <button class="btn-verify" type="button" onclick="fetchFeedbackInbox()">Rafraîchir</button>
                        <span style="color: var(--text-secondary); font-size: 0.85rem;">Flux anonyme → super admin</span>
                    </div>
                </div>
                <div id="admin-feedback-list" class="admin-feedback-list" style="margin-top: 0.75rem; display:flex; flex-direction:column; gap:0.75rem;"></div>
            </div>
        </div>
    `;
}

function formatStatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return "—";
    }
    const n = Number(value);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${Math.round(n / 1000)}k`;
    return n.toLocaleString("fr-FR");
}

async function fetchTotalContentViews() {
    // Essaie d'abord une agrégation côté BDD (views.sum), sinon fallback en local
    try {
        const { data, error } = await supabase
            .from("content")
            .select("views.sum")
            .single();
        if (!error && data) {
            const sum =
                data.sum ??
                data["views.sum"] ??
                (data.views && data.views.sum) ??
                0;
            if (typeof sum === "number") return sum;
        }
    } catch (err) {
        console.warn("Aggregation views.sum failed, fallback to client sum", err);
    }

    try {
        const { data, error } = await supabase.from("content").select("views");
        if (error) throw error;
        return (data || []).reduce(
            (acc, row) => acc + (Number(row.views) || 0),
            0,
        );
    } catch (err) {
        console.error("Unable to compute total content views:", err);
        return 0;
    }
}

let appPulseRefreshing = false;

async function refreshAppPulse() {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Réservé au super-admin.");
        return;
    }
    if (appPulseRefreshing) return;
    appPulseRefreshing = true;

    const btn = document.getElementById("admin-stats-refresh");
    const meta = document.getElementById("admin-stats-meta");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Mise à jour…";
    }
    if (meta) meta.textContent = "Récupération des données en cours…";

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const thirtyAgo = new Date(today);
    thirtyAgo.setDate(today.getDate() - 30);
    const thirtyStr = thirtyAgo.toISOString().slice(0, 10);

    try {
        const [{ count: totalUsers, error: userError }, totalViews, dauPayload] =
            await Promise.all([
                supabase
                    .from("users")
                    .select("id", { count: "exact", head: true }),
                fetchTotalContentViews(),
                supabase
                    .from("daily_metrics")
                    .select("user_id, date")
                    .gte("date", thirtyStr),
            ]);

        if (userError) throw userError;
        const dailyRows = Array.isArray(dauPayload?.data)
            ? dauPayload.data
            : [];
        const mauSet = new Set();
        const dauSet = new Set();
        dailyRows.forEach((row) => {
            if (row?.user_id) {
                mauSet.add(row.user_id);
                if (row.date === todayStr) {
                    dauSet.add(row.user_id);
                }
            }
        });

        const stats = {
            totalUsers: totalUsers ?? 0,
            totalViews: typeof totalViews === "number" ? totalViews : 0,
            dau: dauSet.size,
            mau: mauSet.size,
        };
        updateAppPulseUI(stats);
    } catch (error) {
        console.error("Erreur récupération stats admin:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de récupérer les stats.",
        );
        if (meta) meta.textContent = "Erreur lors de la récupération.";
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Mettre à jour";
        }
        appPulseRefreshing = false;
    }
}

function updateAppPulseUI(stats) {
    const { totalUsers, totalViews, dau, mau } = stats || {};
    const usersEl = document.getElementById("admin-stats-users");
    const visitsEl = document.getElementById("admin-stats-visits");
    const dauEl = document.getElementById("admin-stats-dau");
    const mauEl = document.getElementById("admin-stats-mau");
    const meta = document.getElementById("admin-stats-meta");

    if (usersEl) usersEl.textContent = formatStatNumber(totalUsers || 0);
    if (visitsEl) visitsEl.textContent = formatStatNumber(totalViews || 0);
    if (dauEl) dauEl.textContent = formatStatNumber(dau || 0);
    if (mauEl) mauEl.textContent = formatStatNumber(mau || 0);
    if (meta) {
        const now = new Date();
        meta.textContent = `Mis à jour à ${now.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
        })} — MAU estimés via daily_metrics (30 jours glissants).`;
    }
}

function renderSuperAdminPage() {
    const container = document.getElementById("admin-dashboard");
    if (!container) return;
    container.innerHTML = `
        <div class="settings-section">
            <div class="settings-header" style="border:none; margin-bottom:1rem; padding-bottom:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 1rem; flex-wrap: wrap;">
                    <div style="display:flex; align-items:center; gap: 0.75rem;">
                        <h2>Administration</h2>
                        <span class="admin-badge">Super admin</span>
                    </div>
                </div>
                <p>Gestion complète du compte et des annonces officielles.</p>
            </div>
        </div>
        ${getSuperAdminPanelHtml()}
    `;
    // Précharge les stats temps réel si visible
    setTimeout(() => refreshAppPulse(), 150);
}

async function fetchFeedbackInbox() {
    const container = document.getElementById("admin-feedback-list");
    if (!container) return;

    if (!isSuperAdmin()) {
        container.innerHTML = `<p style="color: var(--text-secondary);">Accès refusé.</p>`;
        return;
    }

    container.innerHTML = `<div class="loading-spinner"></div>`;
    try {
        const { data, error } = await supabase
            .from("feedback_inbox")
            .select("id, created_at, mood, comment, sender_user_id")
            .eq("receiver_id", SUPER_ADMIN_ID)
            .order("created_at", { ascending: false })
            .limit(200);
        if (error) throw error;
        renderFeedbackInboxList(data || []);
    } catch (err) {
        console.error("Erreur chargement feedback:", err);
        container.innerHTML = `<p style="color: var(--text-secondary);">Impossible de charger les feedbacks.</p>`;
    }
}

function renderFeedbackInboxList(items) {
    const container = document.getElementById("admin-feedback-list");
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<p style="color: var(--text-secondary);">Aucun feedback pour le moment.</p>`;
        return;
    }
    container.innerHTML = items
        .map((fb) => {
            const mood = typeof fb.mood === "number" ? fb.mood : null;
            const moodLabel =
                mood === null
                    ? "—"
                    : mood >= 2
                        ? "🤩"
                        : mood === 1
                            ? "🙂"
                            : mood === 0
                                ? "😐"
                                : mood === -1
                                    ? "😕"
                                    : "😡";
            const safeComment = fb.comment
                ? fb.comment.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))
                : "<i>—</i>";
            const date = fb.created_at
                ? new Date(fb.created_at).toLocaleString()
                : "";
            const sender = fb.sender_user_id || "Anonyme";
            return `
                <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem; background: var(--surface-color); display:flex; flex-direction:column; gap:0.35rem;">
                    <div style="display:flex; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
                        <span style="font-weight:700; display:flex; align-items:center; gap:0.4rem;">${moodLabel}<span style="color:var(--text-secondary); font-weight:500;">Satisfaction</span></span>
                        <span style="color:var(--text-secondary); font-size:0.9rem;">${date}</span>
                    </div>
                    <div style="color:var(--text-primary); line-height:1.45;">${safeComment}</div>
                    <div style="color:var(--text-secondary); font-size:0.9rem;">Sender: ${sender}</div>
                </div>
            `;
        })
        .join("");
}

async function fetchVerificationRequests() {
    if (!isVerificationAdmin()) {
        verificationRequests = [];
        return [];
    }

    try {
        const { data, error } = await supabase
            .from("verification_requests")
            .select("id, user_id, type, status, created_at, users(id, name, avatar)")
            .eq("status", "pending")
            .order("created_at", { ascending: false });

        if (error) throw error;
        verificationRequests = data || [];
        return verificationRequests;
    } catch (error) {
        console.error("Erreur récupération demandes vérification:", error);
        verificationRequests = [];
        return [];
    }
}

async function fetchUserPendingRequests(userId) {
    try {
        const { data, error } = await supabase
            .from("verification_requests")
            .select("type")
            .eq("user_id", userId)
            .eq("status", "pending");

        if (error) throw error;
        const types = new Set();
        (data || []).forEach((item) => types.add(item.type));
        return types;
    } catch (error) {
        console.error("Erreur récupération demandes utilisateur:", error);
        return new Set();
    }
}

function isVerificationAdmin() {
    return (
        !!window.currentUser &&
        (VERIFICATION_ADMIN_IDS.has(window.currentUser.id) || isSuperAdmin())
    );
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "").trim(),
    );
}

async function resolveUserIdFlexible(input) {
    const raw = String(input || "").trim();
    if (!raw) {
            ToastManager?.error("User not found", "Empty field.");
            return null;
        }
    if (isUuid(raw)) return raw;

    // D'abord tenter localement (allUsers) pour éviter un échec RLS ou réseau
    const localMatch =
        (window.allUsers || []).find(
            (u) => (u.name || "").toLowerCase().includes(raw.toLowerCase()),
        ) || null;
    if (localMatch?.id) return localMatch.id;

    try {
        const { data, error } = await supabase
            .from("users")
            .select("id, name")
            .ilike("name", `%${raw}%`)
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        if (data?.id) return data.id;
        ToastManager?.error("User not found", `No profile for "${raw}"`);
        return null;
    } catch (error) {
        console.error("Erreur résolution utilisateur:", error);
        ToastManager?.error("Erreur", "Recherche utilisateur impossible");
        return null;
    }
}

function isVerifiedCreatorUserId(userId) {
    return verifiedCreatorUserIds.has(userId);
}

function isVerifiedStaffUserId(userId) {
    return verifiedStaffUserIds.has(userId);
}

function isCurrentUserVerified() {
    const userId = window.currentUser && window.currentUser.id;
    if (!userId) return false;
    return isVerifiedCreatorUserId(userId) || isVerifiedStaffUserId(userId);
}

function isAmbassadorUserId(userId) {
    return ambassadorUserIds.has(userId);
}

function renderAmbassadorBadgeById(userId) {
    if (!isAmbassadorUserId(userId)) return "";
    return `<img src="icons/embassadeur.svg?v=${BADGE_ASSET_VERSION}" alt="Ambassadeur" class="username-badge">`;
}

function normalizeDiscoveryAccountRole(value) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    if (raw === "recruiter" || raw === "recruteur") return "recruiter";
    if (raw === "investor" || raw === "investisseur") return "investor";
    return "fan";
}

function isManagedDiscoveryAccountRole(value) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    return (
        !raw ||
        raw === "fan" ||
        raw === "recruiter" ||
        raw === "recruteur" ||
        raw === "investor" ||
        raw === "investisseur"
    );
}

function getDiscoveryAccountRoleMeta(value) {
    const role = normalizeDiscoveryAccountRole(value);
    if (role === "recruiter") {
        return {
            role,
            label: "Recruteur",
            icon: "icons/recruteur.svg",
        };
    }
    if (role === "investor") {
        return {
            role,
            label: "Investisseur",
            icon: "icons/investisseur.svg",
        };
    }
    return {
        role: "fan",
        label: "Fan",
        icon: null,
    };
}

function renderProfileRoleBadgeByUser(user) {
    const roleMeta = getDiscoveryAccountRoleMeta(
        user?.account_subtype ||
            user?.accountSubtype ||
            user?.user_metadata?.account_subtype ||
            "fan",
    );
    if (!roleMeta.icon) return "";
    return `
        <div class="profile-role-badge profile-role-badge--${roleMeta.role}" title="Type de compte: ${roleMeta.label}">
            <img src="${roleMeta.icon}?v=${BADGE_ASSET_VERSION}" alt="${roleMeta.label}">
            <span>${roleMeta.label}</span>
        </div>
    `;
}

function renderVerificationBadgeById(userId) {
    const user = getUser(userId) || {};

    const badgeValue = user.badge ? String(user.badge).toLowerCase() : "";
    const accountTypeValue = String(
        user.account_type || user.user_metadata?.account_type || "personal",
    ).toLowerCase();

    const isPersonalAccount = accountTypeValue === "personal";
    const isOrgAccount =
        accountTypeValue === "team" ||
        accountTypeValue === "enterprise" ||
        accountTypeValue === "company" ||
        accountTypeValue === "community" ||
        accountTypeValue === "organization" ||
        accountTypeValue === "organisation" ||
        accountTypeValue === "org";

    const orgRequested =
        badgeValue === "staff" ||
        badgeValue === "team" ||
        badgeValue === "community" ||
        badgeValue === "company" ||
        badgeValue === "enterprise";

    const personalRequested =
        badgeValue === "creator" ||
        badgeValue === "personal" ||
        badgeValue === "verified" ||
        accountTypeValue === "creator" ||
        accountTypeValue === "verified";

    const isStaffListed = isVerifiedStaffUserId(userId);
    const isCreatorListed = isVerifiedCreatorUserId(userId);

    // Priorité : type de compte personal bloque les badges d'équipe même si listé staff
    if (isPersonalAccount) {
        if (isCreatorListed || personalRequested) {
            return `<img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="Créateur vérifié" class="verification-badge">`;
        }
        // Compte perso sans vérification => pas de badge
        return "";
    }

    // Comptes non personnels
    if (isStaffListed || orgRequested || isOrgAccount) {
        return `<img src="icons/verify-com.svg?v=${BADGE_ASSET_VERSION}" alt="Équipe vérifiée" class="verification-badge">`;
    }
    if (isCreatorListed || personalRequested) {
        return `<img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="Créateur vérifié" class="verification-badge">`;
    }
    if (badgeValue === "ambassador") {
        return renderAmbassadorBadgeById(userId);
    }

    return "";
}

function renderVerificationBadgeOnly(userId) {
    const verificationHtml = renderVerificationBadgeById(userId);
    if (!verificationHtml) return "";
    return `<div class="badge-container">${verificationHtml}</div>`;
}

function renderUsernameForProfile(nameHtml, userId) {
    if (!nameHtml) return "";
    const labelHtml = wrapUsernameLabel(nameHtml);
    const verificationHtml = renderVerificationBadgeById(userId);
    if (verificationHtml) {
        return `<span class="username-with-badge">${labelHtml}${verificationHtml}</span>`;
    }
    return renderUsernameWithBadge(nameHtml, userId);
}

function wrapUsernameLabel(nameHtml) {
    if (!nameHtml) return "";
    const normalizedName = String(nameHtml);
    if (normalizedName.includes('class="username-label"')) {
        return normalizedName;
    }
    return `<span class="username-label">${normalizedName}</span>`;
}

function renderUsernameWithBadge(nameHtml, userId) {
    if (!nameHtml) return "";
    const labelHtml = wrapUsernameLabel(nameHtml);
    const verificationHtml = renderVerificationBadgeById(userId);
    if (verificationHtml) {
        return `<span class="username-with-badge">${labelHtml}${verificationHtml}</span>`;
    }
    const badgeHtml = renderAmbassadorBadgeById(userId);
    if (!badgeHtml) return nameHtml;
    return `<span class="username-with-badge">${labelHtml}${badgeHtml}</span>`;
}

function maybeShowAmbassadorWelcome(userId) {
    if (!window.currentUser || !window.ToastManager) return;
    if (window.currentUserId !== userId) return;
    if (!isAmbassadorUserId(userId)) return;

    const storageKey = `rize_ambassador_welcome_${userId}`;
    if (localStorage.getItem(storageKey)) return;

    ToastManager.success(
        "Félicitations",
        "Vous êtes l'un des premiers bêta testeurs. En guise de récompense, vous avez reçu un badge ambassadeur.",
        7000,
    );
    localStorage.setItem(storageKey, "1");
}

async function requestVerification(type) {
    if (!window.currentUser || !window.ToastManager) return;
    const userId = window.currentUser.id;
    window._verificationRequestLocks =
        window._verificationRequestLocks || new Set();
    if (window._verificationRequestLocks.has(type)) {
        ToastManager.info(
            "Demande en cours",
            "Nous traitons déjà votre demande de vérification.",
        );
        return;
    }

    const pendingTypes = await fetchUserPendingRequests(userId);
    if (pendingTypes.has(type)) {
        ToastManager.info(
            "Demande déjà envoyée",
            "Nous avons bien reçu votre demande.",
        );
        return;
    }

    window._verificationRequestLocks.add(type);
    const disableButtons = (state) => {
        const btn = document.getElementById(`btn-verify-${type}`);
        if (btn) {
            btn.disabled = state;
            btn.classList.toggle("is-pending", state);
        }
        const generic = document.querySelector(
            `.btn-verify[data-type="${type}"]`,
        );
        if (generic) {
            generic.disabled = state;
            generic.classList.toggle("is-pending", state);
        }
    };
    disableButtons(true);

    try {
        const { error } = await supabase.from("verification_requests").insert({
            user_id: userId,
            type: type,
            status: "pending",
        });

        if (error) throw error;
        ToastManager.success(
            "Demande envoyée",
            "Votre demande de vérification a été enregistrée.",
        );
    } catch (error) {
        console.error("Erreur demande vérification:", error);
        ToastManager.error(
            "Erreur",
            error?.message || "Impossible d'envoyer la demande.",
        );
        window._verificationRequestLocks.delete(type);
        disableButtons(false);
        return;
    }

    if (
        document.getElementById("settings-modal")?.classList.contains("active")
    ) {
        openSettings(userId);
    }

    // Rester verrouillé (une seule demande) tant que l'admin n'a pas répondu
    // Rien à faire ici : le lock reste en mémoire jusqu'au refresh.
}

async function addVerifiedUserId(type, userId) {
    if (!userId) return;
    const cleanId = await resolveUserIdFlexible(userId);
    if (!cleanId) return;

    try {
        const { error } = await supabase.from("verified_badges").upsert(
            {
                user_id: cleanId,
                type: type,
            },
            { onConflict: "user_id,type" },
        );

        if (error) throw error;

        await supabase
            .from("verification_requests")
            .update({ status: "approved" })
            .eq("user_id", cleanId)
            .eq("type", type)
            .eq("status", "pending");

        await fetchVerifiedBadges();
        if (window.currentProfileViewed === cleanId && typeof renderProfileIntoContainer === "function") {
            renderProfileIntoContainer(cleanId);
        }

        if (window.ToastManager) {
            ToastManager.success(
                "Badge appliqué",
                "La vérification a été accordée.",
            );
        }
    } catch (error) {
        console.error("Erreur validation badge:", error);
        if (window.ToastManager) {
            ToastManager.error(
                "Erreur",
                error?.message || "Impossible d'appliquer la vérification.",
            );
        }
    }

    if (
        document
            .getElementById("settings-modal")
            ?.classList.contains("active") &&
        window.currentUser
    ) {
        openSettings(window.currentUser.id);
    }
}

async function removeVerifiedUserId(type, userId) {
    if (!userId) return;
    const cleanId = await resolveUserIdFlexible(userId);
    if (!cleanId) return;

    try {
        const { error } = await supabase
            .from("verified_badges")
            .delete()
            .eq("user_id", cleanId)
            .eq("type", type);

        if (error) throw error;

        await fetchVerifiedBadges();
        if (window.currentProfileViewed === cleanId && typeof renderProfileIntoContainer === "function") {
            renderProfileIntoContainer(cleanId);
        }

        if (window.ToastManager) {
            ToastManager.success("Badge retiré", "La vérification a été retirée.");
        }
    } catch (error) {
        console.error("Erreur retrait badge:", error);
        if (window.ToastManager) {
            ToastManager.error(
                "Erreur",
                error?.message || "Impossible de retirer la vérification.",
            );
        }
    }
}

async function handleVerificationSelection(action) {
    const modal = document.getElementById("settings-modal");
    if (!modal) return;

    const checked = modal.querySelectorAll(
        ".verification-request-check:checked",
    );
    if (!checked.length) return;

    const toProcess = Array.from(checked).map((input) => ({
        userId: input.dataset.userId,
        type: input.dataset.type,
    }));

    try {
        if (action === "approve") {
            await Promise.all(
                toProcess.map((item) => {
                    return supabase
                        .from("verified_badges")
                        .upsert(
                            { user_id: item.userId, type: item.type },
                            { onConflict: "user_id,type" },
                        );
                }),
            );
        }

        await Promise.all(
            toProcess.map((item) => {
                return supabase
                    .from("verification_requests")
                    .update({
                        status: action === "approve" ? "approved" : "rejected",
                    })
                    .eq("user_id", item.userId)
                    .eq("type", item.type)
                    .eq("status", "pending");
            }),
        );

        await fetchVerifiedBadges();
        await fetchVerificationRequests();

        if (window.ToastManager) {
            ToastManager.success(
                "Mise à jour",
                action === "approve"
                    ? "Vérifications accordées."
                    : "Demandes refusées.",
            );
        }
    } catch (error) {
        console.error("Erreur mise à jour vérifications:", error);
        if (window.ToastManager) {
            ToastManager.error(
                "Erreur",
                error?.message ||
                    "Impossible de mettre à jour les vérifications.",
            );
        }
    }

    if (window.currentUser) {
        openSettings(window.currentUser.id);
    }
}

/* ========================================
   SUPER ADMIN - MODÉRATION
   ======================================== */

async function banUserByAdmin(targetUserId, durationHours, reason) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = await resolveUserIdFlexible(targetUserId);
    if (!cleanId) return;

    const hours = Math.max(1, parseInt(durationHours, 10) || 0);
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const cleanReason = String(reason || "").trim();

    try {
        const { error } = await supabase
            .from("users")
            .update({
                banned_until: until,
                banned_reason: cleanReason || null,
                banned_by: window.currentUser?.id || null,
                banned_at: new Date().toISOString(),
            })
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Utilisateur banni",
            `Bannissement actif pour ${hours}h.`,
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur bannissement:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de bannir.",
        );
    }
}

async function unbanUserByAdmin(targetUserId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(targetUserId || "").trim();
    if (!cleanId) return;

    try {
        const { error } = await supabase
            .from("users")
            .update({
                banned_until: null,
                banned_reason: null,
                banned_by: null,
                banned_at: null,
            })
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Utilisateur rétabli",
            "Le bannissement est levé.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur unban:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de lever le ban.",
        );
    }
}

async function softDeleteContentByAdmin(contentId, reason) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(contentId || "").trim();
    if (!cleanId) return;

    try {
        const { error } = await supabase
            .from("content")
            .update({
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_reason: String(reason || "").trim() || null,
                deleted_by: window.currentUser?.id || null,
            })
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Contenu masqué",
            "Le contenu est supprimé côté public.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur suppression contenu:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de supprimer.",
        );
    }
}

async function restoreContentByAdmin(contentId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(contentId || "").trim();
    if (!cleanId) return;

    try {
        const { error } = await supabase
            .from("content")
            .update({
                is_deleted: false,
                deleted_at: null,
                deleted_reason: null,
                deleted_by: null,
            })
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Contenu restauré",
            "Le contenu est à nouveau visible.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur restauration contenu:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de restaurer.",
        );
    }
}

async function hardDeleteContentByAdmin(contentId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(contentId || "").trim();
    if (!cleanId) return;

    if (!confirm("Supprimer définitivement ce contenu ?")) return;

    try {
        const { error } = await supabase
            .from("content")
            .delete()
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Contenu supprimé",
            "Suppression définitive effectuée.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur suppression définitive:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de supprimer.",
        );
    }
}

async function hardDeleteUserByAdmin(userId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(userId || "").trim();
    if (!cleanId) return;

    if (!confirm("Supprimer définitivement cet utilisateur et son contenu ?"))
        return;

    try {
        const { error } = await supabase
            .from("users")
            .delete()
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Utilisateur supprimé",
            "Suppression définitive effectuée.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur suppression utilisateur:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de supprimer.",
        );
    }
}

// Actions rapides depuis la page profil (admin)
async function banUserFromProfile(userId) {
    const durationInput = document.getElementById(
        `profile-ban-duration-${userId}`,
    );
    const unitInput = document.getElementById(`profile-ban-unit-${userId}`);
    const reasonInput = document.getElementById(
        `profile-admin-reason-${userId}`,
    );
    const value = parseInt(durationInput?.value, 10) || 24;
    const unit = unitInput?.value === "days" ? "days" : "hours";
    const hours = unit === "days" ? value * 24 : value;
    const reason = reasonInput?.value || "";
    await banUserByAdmin(userId, hours, reason);
    renderProfileIntoContainer(userId);
}

async function unbanUserFromProfile(userId) {
    await unbanUserByAdmin(userId);
    renderProfileIntoContainer(userId);
}

async function moderateContentFromProfile(contentId, action, userId) {
    const reasonInput = document.getElementById(
        `profile-admin-reason-${userId}`,
    );
    const reason = reasonInput?.value || "";
    if (action === "hide") {
        await softDeleteContentByAdmin(contentId, reason);
    } else if (action === "restore") {
        await restoreContentByAdmin(contentId);
    } else if (action === "hard") {
        await hardDeleteContentByAdmin(contentId);
    }
    renderProfileIntoContainer(userId);
}

const badgeSVGs = {
    success:
        '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>',
    failure:
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 8l8 8M16 8l-8 8"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="3" height="16"/><rect x="15" y="4" width="3" height="16"/></svg>',
    empty: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
    consistency7:
        '<svg viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="18" font-weight="bold">7</text></svg>',
    consistency30:
        '<svg viewBox="0 0 24 24"><path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2m0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8z"/></svg>',
    consistency100:
        '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    consistency365:
        '<svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>',
    solo: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M12 14c-4 0-6 2-6 2v4h12v-4s-2-2-6-2z"/></svg>',
    team: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M8 11c-2 0-3 1-3 1v3h10v-3s-1-1-3-1z"/><path d="M16 11c-2 0-3 1-3 1v3h6v-3s-1-1-3-1z"/></svg>',
    enterprise:
        '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    creative:
        '<svg viewBox="0 0 24 24"><circle cx="15.5" cy="9.5" r="1.5"/><path d="M3 17.25V21h4v-3.75L3 17.25z"/><path d="M15 8.75h.01M21 19V9c0-1.1-.9-2-2-2h-4l-4-5-4 5H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2z"/></svg>',
    tech: '<svg viewBox="0 0 24 24"><path d="M9 5H7.12A2.12 2.12 0 0 0 5 7.12v9.76A2.12 2.12 0 0 0 7.12 19h9.76A2.12 2.12 0 0 0 19 16.88V15m-6-9h6V5h-6v1z"/><path d="M9 9h6v6H9z"/></svg>',
    transparent:
        '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>',
};

function calculateConsistency(userId) {
    const contents = getUserContentLocal(userId);
    if (!contents || contents.length === 0) return null;

    const sorted = [...contents].sort((a, b) => {
        const dateA =
            new Date(a.created_at || a.createdAt || 0).getTime() ||
            (a.dayNumber ?? a.day_number ?? 0);
        const dateB =
            new Date(b.created_at || b.createdAt || 0).getTime() ||
            (b.dayNumber ?? b.day_number ?? 0);
        return dateA - dateB;
    });

    const getDate = (item) => {
        const d = item.created_at || item.createdAt;
        const parsed = d ? new Date(d) : null;
        return parsed && !isNaN(parsed) ? parsed : null;
    };

    const MAX_GAP_MS = 36 * 60 * 60 * 1000; // tolérance 1,5 jour pour l'enchaînement

    const isConsecutive = (current, previous) => {
        const dCur = getDate(current);
        const dPrev = getDate(previous);
        if (dCur && dPrev) {
            const delta = dCur.getTime() - dPrev.getTime();
            return delta > 0 && delta <= MAX_GAP_MS;
        }
        // fallback dayNumber s'il n'y a pas de dates fiables
        const dayCur =
            current.dayNumber ?? current.day_number ?? Number.NaN;
        const dayPrev =
            previous.dayNumber ?? previous.day_number ?? Number.NaN;
        if (Number.isInteger(dayCur) && Number.isInteger(dayPrev)) {
            return dayCur - dayPrev === 1;
        }
        return false;
    };

    // Calculer la streak courante (doit se terminer sur le dernier post)
    let streak = 1;
    for (let i = sorted.length - 1; i > 0; i--) {
        if (isConsecutive(sorted[i], sorted[i - 1])) {
            streak++;
        } else {
            break;
        }
    }

    const lastDate = getDate(sorted[sorted.length - 1]);
    const daysSinceLast = lastDate
        ? (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

    // Règles de réinitialisation : le badge disparaît si on n'a pas posté depuis plus que sa fenêtre
    const isFresh = (limitDays) => daysSinceLast <= limitDays;

    if (streak >= 365 && isFresh(7)) return "consistency365";
    if (streak >= 100 && isFresh(7)) return "consistency100";
    if (streak >= 30 && isFresh(30)) return "consistency30";
    if (streak >= 7 && isFresh(7)) return "consistency7";
    return null;
}

function determineTrajectoryType(userId) {
    const user = getUser(userId);
    const contents = getUserContentLocal(userId);

    if (!user || contents.length === 0) return null;

    const userTitle = (user.title || "").toLowerCase();
    const userName = (user.name || "").toLowerCase();

    // Comptes officiels / équipes / entreprises
    if (
        userTitle.includes("official") ||
        userTitle.includes("officiel") ||
        userTitle.includes("team") ||
        userTitle.includes("équipe") ||
        userTitle.includes("owner") ||
        userName === "rize" ||
        userName.includes("rize team")
    ) {
        return "enterprise";
    }

    const textContent =
        contents
            .map((c) => (c.title + " " + c.description).toLowerCase())
            .join(" ") +
        " " +
        userTitle;

    if (
        textContent.includes("unreal") ||
        userTitle.includes("designer") ||
        textContent.includes("motion")
    )
        return "creative";
    if (
        textContent.includes("boss") ||
        textContent.includes("game") ||
        textContent.includes("indie")
    )
        return "creative";
    if (textContent.includes("ceo") || textContent.includes("entreprise"))
        return "enterprise";
    if (
        textContent.includes("refonte") ||
        textContent.includes("ui") ||
        textContent.includes("mobile")
    )
        return "tech";
    if (
        textContent.includes("architecture") ||
        textContent.includes("api") ||
        textContent.includes("database")
    )
        return "tech";

    return "solo";
}

function evaluateTransparency(userId) {
    const contents = getUserContentLocal(userId);
    if (contents.length === 0) return false;

    const failureCount = contents.filter((c) => c.state === "failure").length;
    const ratio = failureCount / contents.length;

    return ratio >= 0.3;
}

function generateBadge(badgeType, label) {
    const iconTypes = new Set([
        "team",
        "enterprise",
        "creative",
        "tech",
        "solo",
    ]);
    if (iconTypes.has(badgeType)) {
        const iconPath = `./icons/${badgeType}.svg`;
        return `
            <div class="badge" title="${label}">
                <img src="${iconPath}" alt="${label}" class="badge-icon" />
            </div>
        `;
    }

    const svg = badgeSVGs[badgeType];
    if (!svg) return "";

    let cssClass = "badge";
    if (badgeType.startsWith("consistency")) cssClass += "";
    else if (badgeType === "success") cssClass += " badge-success badge-filled";
    else if (badgeType === "failure") cssClass += " badge-failure badge-filled";
    else if (badgeType === "pause") cssClass += " badge-pause badge-filled";
    else if (badgeType === "empty") cssClass += "";
    else if (badgeType === "transparent") cssClass += " badge-success";
    else cssClass += "";

    return `
        <div class="${cssClass}" title="${label}">
            <div class="badge-icon">${svg}</div>
            <span>${label}</span>
        </div>
    `;
}

function getUserBadges(userId) {
    const badges = [];

    const trajectoryType = determineTrajectoryType(userId);
    if (trajectoryType && trajectoryType !== "solo") {
        const labels = {
            team: "Collectif",
            enterprise: "Entreprise",
            creative: "Créatif",
            tech: "Tech",
        };
        badges.push({ type: trajectoryType, label: labels[trajectoryType] });
    }

    const consistency = calculateConsistency(userId);
    const isPersonalAccount =
        !trajectoryType || trajectoryType === "solo"; // badges de constance réservés aux comptes perso
    if (consistency && isPersonalAccount) {
        const labels = {
            consistency7: "7j consécutifs (hebdo)",
            consistency30: "30j consécutifs (1 mois)",
            consistency100: "100j consécutifs",
            consistency365: "365j consécutifs",
        };
        badges.push({ type: consistency, label: labels[consistency] });
    }

    if (evaluateTransparency(userId)) {
        badges.push({ type: "transparent", label: "Transparent" });
    }

    return badges;
}

function getContentBadges(content) {
    const badges = [];

    const stateLabels = {
        success: "Victoire",
        failure: "Bloqué",
        pause: "Pause",
        empty: "Vide",
    };

    badges.push({ type: content.state, label: stateLabels[content.state] });

    return badges;
}

function renderBadges(badgesList) {
    if (badgesList.length === 0) return "";

    return `
        <div class="badge-container">
            ${badgesList.map((b) => generateBadge(b.type, b.label)).join("")}
        </div>
    `;
}

function renderUserBadges(userId) {
    const verificationHtml = renderVerificationBadgeById(userId);
    const userBadges = getUserBadges(userId);
    if (!verificationHtml && userBadges.length === 0) return "";
    return `
        <div class="badge-container">
            ${verificationHtml || ""}
            ${userBadges.map((b) => generateBadge(b.type, b.label)).join("")}
        </div>
    `;
}

function normalizeExternalUrl(raw) {
    if (!raw) return "";
    let url = String(raw).trim();

    url = url.replace(/^https\.[/\\]*/i, "https://");
    url = url.replace(/^http\.[/\\]*/i, "http://");

    if (url.startsWith("//")) return "https:" + url;
    if (/^https?:\/\//i.test(url)) return url;
    return "https://" + url;
}

function renderProfileSocialLinks(userId) {
    const user = getUser(userId);
    // Support both snake_case (DB) and camelCase (local update)
    const socialLinks = user ? user.social_links || user.socialLinks : null;

    if (!user || !socialLinks || Object.keys(socialLinks).length === 0) {
        return "";
    }

    const platformLabels = {
        email: "Email",
        github: "GitHub",
        instagram: "Instagram",
        snapchat: "Snapchat",
        youtube: "YouTube",
        twitter: "X",
        tiktok: "TikTok",
        linkedin: "LinkedIn",
        twitch: "Twitch",
        spotify: "Spotify",
        discord: "Discord",
        reddit: "Reddit",
        pinterest: "Pinterest",
        facebook: "Facebook",
        site: "Site",
    };

    const platformIcons = {
        email: "icons/email.svg",
        github: "icons/github.svg",
        instagram: "icons/instagram.svg",
        snapchat: "icons/snapchat.svg",
        youtube: "icons/youtube.svg",
        twitter: "icons/twitter.svg",
        tiktok: "icons/tiktok.svg",
        linkedin: "icons/linkedin.svg",
        twitch: "icons/twitch.svg",
        spotify: "icons/spotify.svg",
        discord: "icons/discord.svg",
        reddit: "icons/reddit.svg",
        pinterest: "icons/pinterest.svg",
        facebook: "icons/facebook.svg",
        site: "icons/link.svg",
    };

    const socialHtml = Object.entries(socialLinks)
        .filter(([_, url]) => url)
        .map(([platform, url]) => {
            const label = platformLabels[platform] || platform;
            const iconPath = platformIcons[platform] || "icons/link.svg";
            if (platform === "email") {
                const email = String(url).trim();
                const safeEmail = email.replace(/"/g, "&quot;");
                return `
                    <button type="button"
                        class="social-badge"
                        title="Afficher et copier l'email"
                        onclick="handleEmailBadgeClick('${safeEmail}', this)">
                        <img src="${iconPath}" alt="email" class="social-badge-icon" />
                        <span class="email-reveal" style="display:none; margin-left:6px; font-size:0.85rem;"></span>
                    </button>
                `;
            }
            const safeUrl = normalizeExternalUrl(url);
            return `
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" 
                   class="social-badge" 
                   title="Visiter ${label}">
                    <img src="${iconPath}" alt="${platform}" class="social-badge-icon" />
                </a>
            `;
        })
        .join("");

    return socialHtml
        ? `<div class="profile-social-badges">${socialHtml}</div>`
        : "";
}

function handleEmailBadgeClick(email, el) {
    const badge = el;
    if (!badge) return;
    const span = badge.querySelector(".email-reveal");
    if (!span) return;

    if (span.textContent !== email) {
        span.textContent = email;
    }
    span.style.display = "inline";

    const doToast = (msg) => {
        if (
            window.ToastManager &&
            typeof window.ToastManager.success === "function"
        ) {
            window.ToastManager.success("Email", msg);
        }
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
            .writeText(email)
            .then(() => {
                doToast("Copié dans le presse-papiers");
            })
            .catch(() => {});
    } else {
        const textarea = document.createElement("textarea");
        textarea.value = email;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
            doToast("Copié dans le presse-papiers");
        } catch (e) {}
        document.body.removeChild(textarea);
    }
}

/* ========================================
   RENDERING - DISCOVER GRID
   ======================================== */

window.discoverFilter = "all";

window.toggleDiscoverFilter = function (filter) {
    window.discoverFilter = filter;

    // Update UI buttons
    document.querySelectorAll(".filter-btn").forEach((btn) => {
        // Reset styles
        btn.classList.toggle("active", btn.dataset.filter === filter);

        if (btn.dataset.filter === filter) {
            btn.style.color = "var(--text-primary)";
            btn.style.borderBottomColor = "var(--accent-color)";
            btn.style.opacity = "1";
        } else {
            btn.style.color = "var(--text-secondary)";
            btn.style.borderBottomColor = "transparent";
            btn.style.opacity = "0.7";
        }
    });

    renderDiscoverGrid();
};

const DISCOVER_VERIFIED_MIX_PATTERNS = [
    [
        { kind: "verified", count: 1 },
        { kind: "non_verified", count: 2 },
        { kind: "verified", count: 3 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
    ],
    [
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
    ],
    [
        { kind: "verified", count: 3 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 1 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
    ],
    [
        { kind: "verified", count: 1 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 3 },
        { kind: "non_verified", count: 1 },
    ],
    [
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 2 },
        { kind: "verified", count: 3 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 1 },
    ],
];

let discoverMixChaosSeed = Math.max(
    1,
    Math.floor(Math.random() * 2147483646),
);

function nextDiscoverMixRandom() {
    discoverMixChaosSeed = (discoverMixChaosSeed * 48271) % 2147483647;
    return (discoverMixChaosSeed - 1) / 2147483646;
}

function isVerifiedDiscoverUser(user) {
    if (!user || !user.id) return false;
    return isVerifiedCreatorUserId(user.id) || isVerifiedStaffUserId(user.id);
}

function getDiscoverLatestTime(user) {
    if (!user || !user.id) return 0;
    const latest = getLatestContent(user.id);
    if (!latest || !latest.createdAt) return 0;
    const t = new Date(latest.createdAt).getTime();
    return Number.isFinite(t) ? t : 0;
}

function sortUsersByLatestRecency(users) {
    return [...(users || [])].sort(
        (a, b) => getDiscoverLatestTime(b) - getDiscoverLatestTime(a),
    );
}

function getDiscoverContentTime(content) {
    if (!content) return 0;
    const rawDate =
        content.createdAt || content.created_at || content.started_at || null;
    if (!rawDate) return 0;
    const t = new Date(rawDate).getTime();
    return Number.isFinite(t) ? t : 0;
}

function buildDiscoverArcCardEntries(users) {
    const entries = [];

    (users || []).forEach((user) => {
        if (!user || !user.id) return;
        const contents = getUserContentLocal(user.id);
        if (!contents || contents.length === 0) return;

        const latestByArc = new Map();
        contents.forEach((content) => {
            if (!content || !content.contentId) return;
            const arcId = content.arcId || content.arc?.id || null;
            const arcKey = arcId ? `arc-${arcId}` : "no-arc";
            const existing = latestByArc.get(arcKey);
            if (
                !existing ||
                getDiscoverContentTime(content) >
                    getDiscoverContentTime(existing)
            ) {
                latestByArc.set(arcKey, content);
            }
        });

        latestByArc.forEach((content, arcKey) => {
            entries.push({
                type: "arc",
                user,
                content,
                arcId: content.arcId || content.arc?.id || null,
                arcKey,
                verified: isVerifiedDiscoverUser(user),
                tags: Array.isArray(content.tags) ? content.tags : [],
            });
        });
    });

    return entries.sort(
        (a, b) => getDiscoverContentTime(b.content) - getDiscoverContentTime(a.content),
    );
}

function shuffleWithChaos(input) {
    const arr = [...input];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(nextDiscoverMixRandom() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function consumeUsersFromPool(pool, count, target) {
    let taken = 0;
    while (taken < count && pool.length > 0) {
        target.push(pool.shift());
        taken += 1;
    }
    return taken;
}

/* ========================================
   MOOD ENGINE (Discover)
   ======================================== */

const MOOD_STORAGE_KEY_PREFIX = "rize:mood:v1:";
const MOOD_MAX_TAGS = 160;

function sanitizeTag(tag) {
    if (!tag) return null;
    return tag.toString().trim().toLowerCase();
}

function loadMoodProfile(userId) {
    if (!userId) return { tags: {}, updatedAt: Date.now() };
    try {
        const raw = localStorage.getItem(`${MOOD_STORAGE_KEY_PREFIX}${userId}`);
        if (!raw) return { tags: {}, updatedAt: Date.now() };
        const parsed = JSON.parse(raw);
        return {
            tags: parsed?.tags || {},
            updatedAt: parsed?.updatedAt || Date.now(),
        };
    } catch (e) {
        return { tags: {}, updatedAt: Date.now() };
    }
}

function saveMoodProfile(userId, profile) {
    if (!userId || !profile) return;
    try {
        localStorage.setItem(
            `${MOOD_STORAGE_KEY_PREFIX}${userId}`,
            JSON.stringify(profile),
        );
    } catch (e) {
        // ignore quota errors
    }
}

function adjustMoodScores(tags = [], delta = 1) {
    if (!currentUser || !Array.isArray(tags)) return;
    const userId = currentUser.id;
    const profile = loadMoodProfile(userId);
    tags.map(sanitizeTag).filter(Boolean).forEach((tag) => {
        profile.tags[tag] = (profile.tags[tag] || 0) + delta;
    });
    // trim to top tags only
    const entries = Object.entries(profile.tags).sort(
        (a, b) => (b[1] || 0) - (a[1] || 0),
    );
    const trimmed = entries.slice(0, MOOD_MAX_TAGS);
    profile.tags = Object.fromEntries(trimmed);
    profile.updatedAt = Date.now();
    saveMoodProfile(userId, profile);
}

function getMoodTopTags(userId, limit = 3) {
    const profile = loadMoodProfile(userId);
    return Object.entries(profile.tags)
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))
        .slice(0, limit)
        .map(([tag, score]) => ({ tag, score }));
}

function getMoodTagScoreMap(userId) {
    const profile = loadMoodProfile(userId);
    return profile.tags || {};
}

function hasMoodMatch(itemTags = [], moodSet) {
    if (!moodSet || moodSet.size === 0) return false;
    return itemTags.some((t) => moodSet.has(sanitizeTag(t)));
}

function normalizeDiscoverItemForImmersiveScore(item) {
    const content = item?.content || item?.stream || {};
    const arcStageLevel =
        content.arcStageLevel ||
        content.arc_stage_level ||
        content.arc?.stageLevel ||
        content.arc?.stage_level ||
        content.arc?.level ||
        null;
    const arcOpportunityIntents =
        content.opportunityIntents ||
        content.opportunity_intents ||
        content.arcOpportunityIntents ||
        content.arc_opportunity_intents ||
        content.arc?.opportunityIntents ||
        content.arc?.opportunity_intents ||
        [];
    return {
        contentId:
            content.contentId ||
            content.id ||
            (item?.type === "live" && item?.stream?.id
                ? `live-${item.stream.id}`
                : null),
        userId: item?.user?.id || content.user_id || content.userId || null,
        type: item?.type === "live" ? "live" : content.type || item?.type || "text",
        state: content.state || "success",
        tags: Array.isArray(content.tags)
            ? content.tags.map(sanitizeTag).filter(Boolean)
            : [],
        title: content.title || "",
        description: content.description || "",
        createdAt:
            content.createdAt ||
            content.created_at ||
            content.started_at ||
            Date.now(),
        arcId: content.arcId || content.arc_id || content.arc?.id || null,
        arcStageLevel: arcStageLevel,
        arcOpportunityIntents: Array.isArray(arcOpportunityIntents)
            ? arcOpportunityIntents
            : typeof arcOpportunityIntents === "string"
              ? arcOpportunityIntents
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
              : [],
        encouragementsCount: content.encouragementsCount || 0,
        views: content.views || 0,
        viewer_count: content.viewer_count || 0,
    };
}

function interleaveDiscoverByCreator(scoredItems) {
    const buckets = new Map();
    scoredItems.forEach((entry) => {
        const creatorId = entry?.normalized?.userId || "unknown";
        if (!buckets.has(creatorId)) buckets.set(creatorId, []);
        buckets.get(creatorId).push(entry);
    });

    const result = [];
    let added = true;
    while (added) {
        added = false;
        for (const [, list] of buckets.entries()) {
            if (list.length > 0) {
                result.push(list.shift());
                added = true;
            }
        }
    }
    return result;
}

function handleDiscoverInterest(contentId, action) {
    const content = findContentById(contentId);
    if (!content) return;
    const tags = Array.isArray(content.tags) ? content.tags : [];
    const delta = action === "dislike" ? -1.5 : 2.2;
    adjustMoodScores(tags, delta);
    if (action === "dislike") {
        ToastManager?.info("Flux ajusté", "Nous vous montrerons moins ce sujet.");
    } else {
        ToastManager?.success("Noté", "Nous priorisons davantage ce sujet.");
    }
}
window.handleDiscoverInterest = handleDiscoverInterest;

function buildMoodDiscoverMix(
    discoverArcCards,
    liveStreams = [],
    followedSet = new Set(),
) {
    const arcCards = (discoverArcCards || []).filter(
        (entry) => entry?.content && entry?.user?.id,
    );

    const liveItems = (liveStreams || [])
        .map((stream) => {
            const user = getUser(stream.user_id);
            if (!user) return null;
            return {
                type: "live",
                stream,
                user,
                verified: isVerifiedDiscoverUser(user),
                tags: stream.tags || [],
                content: {
                    ...stream,
                    createdAt: stream.created_at || stream.started_at || Date.now(),
                    tags: stream.tags || [],
                },
            };
        })
        .filter(Boolean);

    const allItems = arcCards.map((entry) => ({
        type: "arc",
        user: entry.user,
        content: entry.content,
        arcId: entry.arcId || null,
        arcKey: entry.arcKey || null,
        verified: isVerifiedDiscoverUser(entry.user),
        tags: Array.isArray(entry.content.tags) ? entry.content.tags : [],
    }));

    allItems.push(...liveItems);

    if (!currentUser || allItems.length < 3) return allItems;

    const prefs = loadImmersivePrefs();
    const authorScoreMap = buildAuthorScoreMapFromContents();
    const now = Date.now();
    const viewerRole = getCurrentViewerDiscoveryRole();
    const topQueries = Object.entries(prefs.queries || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([token, score]) => ({ token, score }));

    const scored = allItems.map((item) => {
        const normalized = normalizeDiscoverItemForImmersiveScore(item);
        const { score, preferenceScore } = scoreImmersiveContent(normalized, {
            prefs,
            followedSet,
            authorScoreMap,
            isVerifiedUserId: (userId) =>
                isVerifiedCreatorUserId(userId) ||
                isVerifiedStaffUserId(userId),
            now,
            topQueries,
            viewerRole,
        });
        return {
            item,
            normalized,
            score,
            preferenceScore,
        };
    });

    scored.sort((a, b) => b.score - a.score);
    const interleaved = interleaveDiscoverByCreator(scored);
    return interleaved.map((entry) => entry.item);
}

function renderUserCard(
    userId,
    isFollowing = false,
    isEncouraged = false,
    latestContentOverride = null,
) {
    const user = getUser(userId);
    if (!user) return "";

    const latestContent = latestContentOverride || getLatestContent(userId);
    const dominantState = getDominantState(userId);

    if (!latestContent) return "";

    const stateColor =
        dominantState === "success"
            ? "#10b981"
            : dominantState === "failure"
              ? "#ef4444"
              : "#6366f1";

    const badgesHtml = renderUserBadges(userId);

    const tags = Array.isArray(latestContent.tags) ? latestContent.tags : [];
    const collabCornerHtml = buildArcCollaboratorCornerAvatars(latestContent, {
        size: 18,
        max: 3,
        className: "arc-collab-avatars--card-corner",
    });
    const mediaList = Array.isArray(latestContent.mediaUrls)
        ? latestContent.mediaUrls.filter(Boolean)
        : [];
    if (mediaList.length === 0 && latestContent.mediaUrl) {
        mediaList.push(latestContent.mediaUrl);
    }
    const hasMedia = mediaList.length > 0;
    const hasMultiImages =
        mediaList.length > 1 && latestContent.type !== "video";
    const primaryMediaUrl = hasMedia ? mediaList[0] : "";

    let mediaHtml = "";
    if (hasMedia) {
        if (latestContent.type === "video") {
            mediaHtml = `
                <div class="card-media-wrap">
                    <video id="video-${userId}" class="card-media" src="${primaryMediaUrl}" muted playsinline webkit-playsinline autoplay preload="metadata" tabindex="-1" data-user-id="${userId}" data-content-id="${latestContent.contentId}" disablePictureInPicture></video>
                    <div class="video-fallback">
                        <img src="icons/play.svg" alt="Play" width="40" height="40">
                        <span>Vidéo</span>
                    </div>
                    ${collabCornerHtml}
                    <div class="card-stats-overlay">
                        <div class="stat-pill">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span>${latestContent.views || 0}</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (latestContent.type === "image" || latestContent.type === "text") {
            if (hasMultiImages) {
                const slides = mediaList
                    .map(
                        (url) =>
                            `<div class="xera-carousel-slide"><img class="card-media" src="${url}" alt="${latestContent.title || "Preview"}" loading="lazy" decoding="async" data-content-id="${latestContent.contentId}"></div>`,
                    )
                    .join("");
                const dots = `<div class="xera-carousel-dots">${mediaList
                    .map(
                        (_, i) =>
                            `<span class="xera-dot ${i === 0 ? "active" : ""}" data-index="${i}"></span>`,
                    )
                    .join("")}</div>`;
                mediaHtml = `
                    <div class="card-media-wrap has-multi-media">
                        <div class="xera-carousel" data-carousel>
                            <div class="xera-carousel-track">${slides}</div>
                            <button type="button" class="xera-carousel-arrow xera-carousel-arrow--prev" aria-label="Image précédente">&lsaquo;</button>
                            <button type="button" class="xera-carousel-arrow xera-carousel-arrow--next" aria-label="Image suivante">&rsaquo;</button>
                            <div class="card-media-count" aria-label="${mediaList.length} images dans ce post">
                                <span data-carousel-current>1</span>/<span data-carousel-total>${mediaList.length}</span>
                            </div>
                            ${dots}
                        </div>
                        ${collabCornerHtml}
                        <div class="card-stats-overlay">
                            <div class="stat-pill">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8  -4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <span>${latestContent.views || 0}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                mediaHtml = `
                    <div class="card-media-wrap">
                        <img class="card-media" src="${primaryMediaUrl}" alt="${latestContent.title || "Preview"}" loading="lazy" decoding="async" data-content-id="${latestContent.contentId}">
                        ${collabCornerHtml}
                        <div class="card-stats-overlay">
                            <div class="stat-pill">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8  -4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <span>${latestContent.views || 0}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    }

    const isAnnouncement = isAnnouncementContent(latestContent);
    const replyCount = isAnnouncement
        ? getReplyCount(latestContent.contentId)
        : 0;

    const isVerifiedUser =
        isVerifiedCreatorUserId(userId) || isVerifiedStaffUserId(userId);

    const isTextContent =
        latestContent && (!hasMedia || latestContent.type === "text");

    let textHtml = "";
    if (isTextContent) {
        const textBody =
            latestContent.description ||
            latestContent.title ||
            "Nouveau post texte";
        textHtml = `
            <div class="card-text">
                <p class="card-text-body">${textBody}</p>
            </div>
        `;
    }

    // Déterminer la classe CSS selon le type de média pour l'adaptation
    const cardClass =
        hasMedia
            ? `user-card has-media ${latestContent.type}`
            : `user-card ${isTextContent ? "text-card" : ""}${
                  isVerifiedUser ? " verified-card" : ""
              }`;

    // Ajout information ARC
    let arcInfo = "";
    if (latestContent && latestContent.arc) {
        arcInfo = `
            <div class="card-arc-info" style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.3rem;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
                    ${latestContent.arc.title}
                </span>
            </div>
        `;
    }

    // Subscribe Button
    let subscribeBtn = "";
    if (currentUser && currentUser.id !== userId) {
        const btnClass = isFollowing
            ? "btn-follow-card unfollow"
            : "btn-follow-card";
        // const btnText = isFollowing ? 'Abonné' : 'S\'abonner'; // REMOVED
        const btnTitle = isFollowing ? "Se désabonner" : "S'abonner";
        const iconSrc = isFollowing
            ? "icons/subscribed.svg"
            : "icons/subscribe.svg";

        subscribeBtn = `
            <button class="${btnClass}" onclick="event.stopPropagation(); toggleFollow('${currentUser.id}', '${userId}')" title="${btnTitle}" data-follow-card-user="${userId}" data-follow-card-content="${latestContent.contentId}" style="
                background: transparent; 
                border: none;
                padding: 0;
                display: flex; 
                align-items: center; 
                justify-content: center; 
                cursor: pointer;
                margin-left: auto;
                transition: all 0.2s;
            ">
                <img src="${iconSrc}" class="btn-icon" style="width: 24px; height: 24px;">
            </button>
        `;
    }

    // Courage Button
    const courageIcon = isEncouraged
        ? "icons/courage-green.svg"
        : "icons/courage-blue.svg";
    const courageClass = isEncouraged
        ? "courage-btn encouraged"
        : "courage-btn";

    const collabAvatarsHtml = buildArcCollaboratorAvatars(latestContent, {
        size: 20,
        className: "arc-collab-avatars--card",
    });

    // User Info (Name, Avatar, Subscribe) - Moved to bottom
    const userInfoHtml = `
        <div class="card-user-bottom" style="display: flex; align-items: center; gap: 0.75rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05);">
            <button class="profile-link" onclick="event.stopPropagation(); handleProfileClick('${userId}', this)">
                <img src="${user.avatar || "https://placehold.co/40"}" class="card-avatar" style="width: 32px; height: 32px;" loading="lazy" decoding="async">
                <div class="profile-link-text" style="flex: 1; min-width: 0;">
                    <h3 class="discover-user-name" style="margin:0; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${renderUsernameWithBadge(user.name, user.id)}</h3>
                    <div style="font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.title || ""}</div>
                </div>
            </button>
            ${collabAvatarsHtml}
            ${subscribeBtn}
        </div>
    `;

    // Add stats overlay CSS if needed (inline for now)
    const statsStyles = `
        <style>
        .card-stats-overlay {
            position: absolute;
            top: 10px;
            right: 10px;
            display: flex;
            gap: 5px;
            pointer-events: none;
        }
        .stat-pill {
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            padding: 4px 8px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 0.75rem;
            color: white;
            font-weight: 600;
        }
        .courage-btn {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 20px;
            padding: 4px 10px;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: all 0.2s;
            color: var(--text-secondary);
            font-size: 0.8rem;
            margin-top: 0.5rem;
        }
        .courage-btn:hover {
            background: rgba(255,255,255,0.1);
        }
        .courage-btn.encouraged {
            background: rgba(16, 185, 129, 0.1);
            border-color: rgba(16, 185, 129, 0.3);
            color: #10b981;
        }
        </style>
    `;

    // Only inject style once
    if (!document.getElementById("card-stats-style")) {
        document.head.insertAdjacentHTML(
            "beforeend",
            statsStyles.replace("<style>", '<style id="card-stats-style">'),
        );
    }

    const dayBadge =
        !isAnnouncement &&
        latestContent &&
        typeof latestContent.dayNumber === "number" &&
        latestContent.dayNumber > 0
            ? `<span class="status-day">J-${latestContent.dayNumber}</span>`
            : "";

    const tagDataset =
        tags.length > 0
            ? tags
                  .map(sanitizeTag)
                  .filter(Boolean)
                  .join(",")
            : "";

    const liveCta =
        latestContent?.type === "live"
            ? `<button class="btn-live-join" onclick="event.stopPropagation(); openLiveStreamForUser('${userId}', '${escapeHtml(latestContent.title || "Live en cours")}')">
                    🔴 Rejoindre le live
               </button>`
            : "";

    return `
        <div class="${cardClass}" data-user="${userId}" data-content-id="${latestContent.contentId}" data-tags="${tagDataset}" onclick="openImmersive('${userId}', '${latestContent.contentId}')">
            ${mediaHtml}
            <div class="card-content">
                ${arcInfo}
                ${isAnnouncement ? '<span class="announcement-chip">Annonce</span>' : ""}
                <div class="card-status" style="border-color: ${stateColor}20; color: ${stateColor};">
                    ${dayBadge}
                    <span class="status-title">${latestContent ? latestContent.title : "Aucune activité"}</span>
                </div>
                
                ${textHtml}
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    ${badgesHtml}
                    <button class="${courageClass}" data-content-id="${latestContent.contentId}" onclick="event.stopPropagation(); toggleCourage('${latestContent.contentId}', this)">
                        <img src="${courageIcon}" width="16" height="16">
                        <span class="courage-count">${latestContent.encouragementsCount || 0}</span>
                    </button>
                </div>
                ${liveCta}
                ${userInfoHtml}
            </div>
        </div>
    `;

    // Plus de recherche ici (panneau réduit aux annonces)
}

// Page badges dédiée (ancienne API, gardé pour compatibilité)
function renderBadgeAdminPage() {
    // La page badges-admin.html utilise maintenant js/badges-admin.js (module).
    // Cette fonction est laissée vide pour éviter les erreurs de référence.
}

// Recherche live pour l'attribution manuelle de badge (super admin)
function setupAdminVerifySearch() {
    setupAdminUserSearch(
        "admin-verify-target",
        "admin-verify-suggestions",
        (user) => selectAdminVerifyTarget(user.id, user.name),
    );
}

function selectAdminVerifyTarget(userId, userName) {
    const input = document.getElementById("admin-verify-target");
    const suggestions = document.getElementById("admin-verify-suggestions");
    if (input) input.value = userId;
    if (suggestions) {
        suggestions.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; padding:0.65rem 0.75rem; border:1px solid var(--border-color); border-radius:10px; background: rgba(59,130,246,0.08);">
                <div>
                    <div style="font-weight:700;">${escapeHtml(userName || "")}</div>
                    <div style="color: var(--text-secondary); font-size:0.85rem;">${escapeHtml(userId || "")}</div>
                </div>
                <span style="color: var(--accent-color); font-weight:600;">Sélectionné</span>
            </div>
        `;
    }
}

// Recherche live pour bannissement
function setupAdminBanSearch() {
    setupAdminUserSearch(
        "admin-ban-user-id",
        "admin-ban-suggestions",
        (user) => selectAdminBanTarget(user.id, user.name),
    );
}

function selectAdminBanTarget(userId, userName) {
    const input = document.getElementById("admin-ban-user-id");
    const suggestions = document.getElementById("admin-ban-suggestions");
    if (input) input.value = userId;
    if (suggestions) {
        suggestions.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; padding:0.65rem 0.75rem; border:1px solid var(--border-color); border-radius:10px; background: rgba(239,68,68,0.08);">
                <div>
                    <div style="font-weight:700;">${escapeHtml(userName || "")}</div>
                    <div style="color: var(--text-secondary); font-size:0.85rem;">${escapeHtml(userId || "")}</div>
                </div>
                <span style="color: #ef4444; font-weight:600;">Sélectionné</span>
            </div>
        `;
    }
}

// Recherche live pour modération contenu (par utilisateur)
function setupAdminContentSearch() {
    setupAdminUserSearch(
        "admin-content-user-search",
        "admin-content-user-suggestions",
        (user) => {
            selectAdminContentUser(user.id, user.name);
            loadAdminUserContents(user.id);
        },
    );
}

function selectAdminContentUser(userId, userName) {
    const input = document.getElementById("admin-content-user-search");
    const suggestions = document.getElementById("admin-content-user-suggestions");
    if (input) input.value = userName || userId;
    if (suggestions) {
        suggestions.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; padding:0.65rem 0.75rem; border:1px solid var(--border-color); border-radius:10px; background: rgba(245,158,11,0.08);">
                <div>
                    <div style="font-weight:700;">${escapeHtml(userName || "")}</div>
                    <div style="color: var(--text-secondary); font-size:0.85rem;">${escapeHtml(userId || "")}</div>
                </div>
                <span style="color: #f59e0b; font-weight:600;">Sélectionné</span>
            </div>
        `;
    }
}

async function loadAdminUserContents(userId) {
    const container = document.getElementById("admin-content-user-contents");
    if (!container || !userId || !supabase) return;
    container.innerHTML = '<div class="verification-empty">Chargement...</div>';
    try {
        const { data, error } = await supabase
            .from("content")
            .select("id, title, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(10);

        if (error) throw error;
        const items = data || [];
        if (!items.length) {
            container.innerHTML =
                '<div class="verification-empty">Aucun contenu récent.</div>';
            return;
        }
        container.innerHTML = items
            .map((c) => {
                const title = escapeHtml(c.title || "Sans titre");
                const cid = escapeHtml(c.id || "");
                const dateLabel = safeFormatDate(c.created_at, {
                    day: "2-digit",
                    month: "2-digit",
                });
                return `
                <button type="button"
                    class="btn-ghost"
                    style="display:flex; justify-content:space-between; align-items:center; width:100%; border:1px solid var(--border-color); padding:0.55rem 0.75rem; border-radius:10px; background: rgba(255,255,255,0.02); color: var(--text-primary); cursor:pointer;"
                    onclick="document.getElementById('admin-content-id').value='${cid}'">
                    <span style="font-weight:600;">${title}</span>
                    <span style="color: var(--text-secondary); font-size:0.85rem;">${cid}${dateLabel ? " · " + dateLabel : ""}</span>
                </button>`;
            })
            .join("");
    } catch (error) {
        console.error("Erreur récupération contenus utilisateur:", error);
        container.innerHTML =
            '<div class="verification-empty">Erreur chargement contenus.</div>';
    }
}

// Utilitaire partagé pour recherches utilisateur live
function setupAdminUserSearch(inputId, suggestionsId, onSelect, options = {}) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);
    if (!input || !suggestions || !supabase) return;

    let debounceTimer = null;

    let lastQuery = "";

    const search = async (query) => {
        suggestions.innerHTML = "";
        const q = (query || "").trim();
        if (q.length === 0) return;
        lastQuery = q;

        // 1) Essayer localement (allUsers) pour éviter les latences/RLS
        const localResults = (window.allUsers || [])
            .filter(
                (u) =>
                    (u.name || "").toLowerCase().includes(q.toLowerCase()) ||
                    String(u.id || "").startsWith(q),
            )
            .slice(0, 8);

        const renderList = (list) => {
            if (!list.length) {
                suggestions.innerHTML =
                    '<div class="verification-empty">Aucun résultat</div>';
                return;
            }
            suggestions.innerHTML = list
                .map((u) => {
                    const safeName = escapeHtml(u.name || "Utilisateur");
                    const safeId = escapeHtml(u.id || "");
                    const avatarUrl =
                        u.avatar && u.avatar.startsWith("http")
                            ? u.avatar
                            : "https://placehold.co/48x48?text=👤";
                    const avatar = options.showAvatar
                        ? `<img src="${escapeHtml(
                              avatarUrl,
                          )}" alt="${safeName}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);">`
                        : "";
                    return `
                    <button type="button"
                        class="btn-ghost"
                        style="display:flex; justify-content:space-between; align-items:center; width:100%; border:1px solid var(--border-color); padding:0.55rem 0.75rem; border-radius:10px; background: rgba(255,255,255,0.03); color: var(--text-primary); cursor:pointer; gap:0.6rem;"
                        onclick="window.__adminUserSearchSelect('${inputId}','${suggestionsId}','${safeId}','${safeName}')">
                        <span style="display:flex; align-items:center; gap:0.5rem;">
                            ${avatar}
                            <span style="font-weight:600;">${safeName}</span>
                        </span>
                        <span style="color: var(--text-secondary); font-size:0.85rem;">${safeId}</span>
                    </button>`;
                })
                .join("");
        };

        if (localResults.length) {
            renderList(localResults);
        } else {
            try {
                const { data, error } = await supabase
                    .from("users")
                    .select("id, name, avatar")
                    .ilike("name", `%${q}%`)
                    .order("name", { ascending: true })
                    .limit(8);

                if (error) throw error;
                // Éviter d'afficher une réponse obsolète si l'utilisateur tape vite
                if (lastQuery !== q) return;
                renderList(data || []);
            } catch (error) {
                console.error("Erreur recherche utilisateur admin:", error);
                suggestions.innerHTML =
                    '<div class="verification-empty">Erreur de recherche</div>';
            }
        }

        // Stock callback (même si aucun résultat, pour cohérence)
        window.__adminUserSearchCallbacks =
            window.__adminUserSearchCallbacks || {};
        window.__adminUserSearchCallbacks[inputId] = onSelect;
    };

    input.addEventListener("input", () => {
        const query = String(input.value || "").trim();
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => search(query), 200);
    });
}

// Pont global pour gérer les boutons inline
window.__adminUserSearchSelect = (inputId, suggestionsId, userId, userName) => {
    const cb =
        (window.__adminUserSearchCallbacks &&
            window.__adminUserSearchCallbacks[inputId]) ||
        null;
    if (typeof cb === "function") {
        cb({ id: userId, name: userName });
    } else {
        // Fallback: juste remplir le champ
        const input = document.getElementById(inputId);
        if (input) input.value = userId;
    }
    // Nettoie la liste
    const suggestions = document.getElementById(suggestionsId);
    if (suggestions) suggestions.innerHTML = "";
};

async function getLiveStreamsForDiscover() {
    try {
        const { data, error } = await supabase
            .from("streaming_sessions")
            .select(
                "id, title, description, thumbnail_url, viewer_count, started_at, user_id, users(name, avatar)",
            )
            .eq("status", "live")
            .order("started_at", { ascending: false });

        if (error) throw error;
        const streams = data || [];
        if (streams.length === 0) return [];

        // Filtrer les streams dont l'hôte est encore actif (heartbeat < 90s)
        const streamIds = streams.map((s) => s.id);
        const hostKeySet = new Set(streams.map((s) => `${s.id}:${s.user_id}`));
        const cutoff = Date.now() - 90000;
        const recentStartCutoff = Date.now() - 10 * 60 * 1000;

        const { data: viewerData, error: viewerError } = await supabase
            .from("stream_viewers")
            .select("stream_id, user_id, last_seen")
            .in("stream_id", streamIds);

        if (viewerError) {
            console.error("Erreur récupération présence host:", viewerError);
            return streams;
        }
        if (!viewerData || viewerData.length === 0) {
            return streams;
        }

        const hostLastSeenMap = new Map();
        (viewerData || []).forEach((row) => {
            if (!row?.stream_id || !row?.user_id) return;
            const key = `${row.stream_id}:${row.user_id}`;
            if (!hostKeySet.has(key)) return;
            hostLastSeenMap.set(row.stream_id, row.last_seen);
        });

        const filtered = streams.filter((stream) => {
            const lastSeen = hostLastSeenMap.get(stream.id);
            if (lastSeen) {
                return new Date(lastSeen).getTime() >= cutoff;
            }
            // Fallback: afficher un live tout juste démarré même si le heartbeat n'est pas encore visible
            if (stream.started_at) {
                return (
                    new Date(stream.started_at).getTime() >= recentStartCutoff
                );
            }
            return true;
        });

        // Priorité aux hôtes vérifiés, puis nombre de viewers, puis récence
        filtered.sort((a, b) => {
            const aVerified =
                isVerifiedCreatorUserId(a.user_id) ||
                isVerifiedStaffUserId(a.user_id);
            const bVerified =
                isVerifiedCreatorUserId(b.user_id) ||
                isVerifiedStaffUserId(b.user_id);
            if (aVerified !== bVerified) return aVerified ? -1 : 1;

            const viewersDiff =
                (b.viewer_count || 0) - (a.viewer_count || 0);
            if (viewersDiff !== 0) return viewersDiff;

            const aStart = a.started_at ? new Date(a.started_at).getTime() : 0;
            const bStart = b.started_at ? new Date(b.started_at).getTime() : 0;
            return bStart - aStart;
        });

        return filtered;
    } catch (error) {
        console.error("Erreur récupération lives:", error);
        return [];
    }
}

function renderLiveStreamCard(stream) {
    if (!document.getElementById("card-stats-style")) {
        const statsStyles = `
            <style>
            .card-stats-overlay {
                position: absolute;
                top: 10px;
                right: 10px;
                display: flex;
                gap: 5px;
                pointer-events: none;
            }
            .stat-pill {
                background: rgba(0,0,0,0.6);
                backdrop-filter: blur(4px);
                padding: 4px 8px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 0.75rem;
                color: white;
                font-weight: 600;
            }
            .card-meta {
                display: flex;
                gap: 8px;
                margin: 0.35rem 0 0.5rem;
                align-items: center;
                flex-wrap: wrap;
            }
            .pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                border-radius: 999px;
                font-size: 0.8rem;
                font-weight: 600;
                background: rgba(239, 68, 68, 0.12);
                color: #ef4444;
            }
            .pill svg {
                width: 16px;
                height: 16px;
            }
            .pill.verified {
                background: rgba(14, 165, 233, 0.14);
                color: #0ea5e9;
            }
            </style>
        `;
        document.head.insertAdjacentHTML(
            "beforeend",
            statsStyles.replace("<style>", '<style id="card-stats-style">'),
        );
    }

    const hostName = stream.users?.name || "Hôte";
    const hostId = stream.user_id || null;
    const hostAvatar = stream.users?.avatar || "https://placehold.co/40";
    const title = stream.title || "Live Stream";
    const description = stream.description || "Rejoignez le live en cours";
    const viewers = stream.viewer_count || 0;
    const thumbnail = stream.thumbnail_url || "";
    const isVerifiedHost =
        (hostId && isVerifiedCreatorUserId(hostId)) ||
        (hostId && isVerifiedStaffUserId(hostId));

    const hostNameHtml =
        hostId && typeof window.renderUsernameWithBadge === "function"
            ? window.renderUsernameWithBadge(hostName, hostId)
            : hostName;

    const viewerPill = `
        <div class="card-meta">
            <span class="pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                ${viewers} en direct
            </span>
        </div>
    `;

    const mediaHtml = thumbnail
        ? `
            <div class="card-media-wrap">
                <img class="card-media" src="${thumbnail}" alt="${title}" loading="lazy" decoding="async">
                <div class="card-stats-overlay">
                    <div class="stat-pill">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>${viewers}</span>
                    </div>
                </div>
            </div>
        `
        : `
            <div class="card-media-wrap">
                <div class="video-fallback" style="opacity:1;">
                    <img src="icons/live.svg" alt="Live" width="36" height="36">
                    <span>Live en cours</span>
                </div>
                <div class="card-stats-overlay">
                    <div class="stat-pill">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>${viewers}</span>
                    </div>
                </div>
            </div>
        `;

    return `
        <div class="user-card has-media live" data-stream="${stream.id}" onclick="window.location.href='stream.html?id=${stream.id}&title=${encodeURIComponent(title)}&host=${stream.user_id}'">
            ${mediaHtml}
            <div class="card-content">
                <div class="card-status" style="border-color: #ef444420; color: #ef4444;">
                    <span class="status-title">🔴 En direct • ${title}</span>
                </div>
                ${viewerPill}
                <div style="font-size: 0.85rem; color: var(--text-secondary);">${description}</div>
                <div class="card-user-bottom" style="display: flex; align-items: center; gap: 0.75rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05);">
                    <img src="${hostAvatar}" class="card-avatar" style="width: 32px; height: 32px;" loading="lazy" decoding="async">
                    <div class="profile-link-text" style="flex: 1; min-width: 0;">
                        <h3 class="discover-user-name" style="margin:0; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${hostNameHtml}</h3>
                        <div style="font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Streamer</div>
                    </div>
                    <button class="btn-follow-card" onclick="event.stopPropagation(); window.location.href='stream.html?id=${stream.id}&title=${encodeURIComponent(title)}&host=${stream.user_id}'" title="Rejoindre le live" style="
                        background: transparent; 
                        border: none;
                        padding: 0;
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        cursor: pointer;
                        margin-left: auto;
                        transition: all 0.2s;
                    ">
                        <img src="icons/live.svg" class="btn-icon" style="width: 24px; height: 24px;">
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Helpers to keep Discover refreshes incremental (avoid full reflows)
function getDiscoverItemKey(item) {
    if (!item) return null;
    if (item.type === "live" && item.stream?.id) return `live-${item.stream.id}`;
    if (item.type === "arc" && item.user?.id) {
        const arcSegment = item.arcId || item.arcKey || "no-arc";
        return `arc-${item.user.id}-${arcSegment}`;
    }
    if (item.type === "user" && item.user?.id) return `user-${item.user.id}`;
    return null;
}

function getDiscoverItemContentId(item, userContentMap) {
    if (!item) return null;
    if (item.type === "live" && item.stream?.id) return `live-${item.stream.id}`;
    if (item.type === "arc") {
        return item.content?.contentId || null;
    }
    if (item.type === "user" && item.user?.id) {
        if (!userContentMap || typeof userContentMap.get !== "function") {
            return item.content?.contentId || null;
        }
        const latest = userContentMap.get(item.user.id);
        return latest?.contentId || null;
    }
    return null;
}

function deriveDiscoverKeyFromElement(el) {
    if (!el) return null;
    if (el.dataset.discoverKey) return el.dataset.discoverKey;
    if (el.dataset.stream) return `live-${el.dataset.stream}`;
    if (el.dataset.user) return `user-${el.dataset.user}`;
    return null;
}

function createDiscoverElement(html, key, contentId, options = {}) {
    const { markAsNew = true } = options;
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const node = template.content.firstElementChild;
    if (!node) return null;
    node.dataset.discoverKey = key;
    if (contentId) node.dataset.contentId = contentId;
    if (markAsNew) node.classList.add("discover-card-new");
    return node;
}

function reconcileDiscoverGrid(grid, renderedItems, waitMessage) {
    const existingMap = new Map();
    Array.from(grid.children).forEach((child) => {
        const key = deriveDiscoverKeyFromElement(child);
        if (key) {
            child.dataset.discoverKey = key;
            existingMap.set(key, child);
        }
    });

    const fragment = document.createDocumentFragment();
    renderedItems.forEach(({ key, html, contentId, type }) => {
        if (!key || !html) return;
        const existing = existingMap.get(key);
        const shouldReplace =
            !existing ||
            (typeof contentId === "string" &&
                existing.dataset.contentId &&
                existing.dataset.contentId !== contentId) ||
            type === "live"; // live cards change often (viewers, status)

        const node = shouldReplace
            ? createDiscoverElement(html, key, contentId, {
                  markAsNew: !existing,
              })
            : existing;

        if (existing && !shouldReplace && contentId && !existing.dataset.contentId) {
            existing.dataset.contentId = contentId;
        }

        if (node) {
            fragment.appendChild(node);
        }
    });

    grid.replaceChildren(fragment);
    try {
        initXeraCarousels(grid);
    } catch (e) {
        /* ignore */
    }

    if (waitMessage) {
        const hasCard = grid.querySelector(".user-card, .discover-card");
        if (hasCard) {
            waitMessage.classList.add("is-hidden");
        }
    }

    if (window.AnimationManager) {
        AnimationManager.fadeInElements(".discover-card-new", 120);
        setTimeout(() => {
            grid.querySelectorAll(".discover-card-new").forEach((el) => {
                el.classList.remove("discover-card-new");
            });
        }, 800);
    }
}

async function renderDiscoverGrid() {
    const grid = document.querySelector(".discover-grid");
    if (!grid) return;
    const waitMessage = document.querySelector(".wait");
    const allowReactDiscoverGrid = window.__enableReactDiscoverGrid === true;

    if (
        allowReactDiscoverGrid &&
        typeof window.renderDiscoverGridReact === "function" &&
        window.React &&
        window.ReactDOM
    ) {
        try {
            const didReactRender = window.renderDiscoverGridReact(grid);
            if (didReactRender) {
                if (waitMessage) {
                    waitMessage.classList.add("is-hidden");
                }
                if (typeof window.setupDiscoverVideoInteractions === "function") {
                    window.setupDiscoverVideoInteractions();
                }
                return;
            }
        } catch (e) {
            // fallback to vanilla rendering below
        }
    }

    let liveStreams = [];
    try {
        liveStreams = await getLiveStreamsForDiscover();
    } catch (error) {
        console.error("Erreur chargement lives discover:", error);
    }

    // Afficher un état de chargement si les données ne sont pas encore là
    if (!window.hasLoadedUsers) {
        if (
            window.LoadingStateManager &&
            typeof LoadingStateManager.showSpinner === "function"
        ) {
            LoadingStateManager.showSpinner(grid);
        }
        return;
    }
    if (window.userLoadError) {
        if (
            window.LoadingStateManager &&
            typeof LoadingStateManager.showEmptyState === "function"
        ) {
            LoadingStateManager.showEmptyState(
                grid,
                "⚠️",
                "Impossible de charger le contenu",
                window.userLoadError,
                { text: "Réessayer", action: "location.reload()" },
            );
        } else {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <h3>Impossible de charger le contenu</h3>
                    <p>${window.userLoadError}</p>
                </div>
            `;
        }
        return;
    }
    if (allUsers.length === 0) {
        if (
            window.LoadingStateManager &&
            typeof LoadingStateManager.showEmptyState === "function"
        ) {
            LoadingStateManager.showEmptyState(
                grid,
                "👥",
                "Aucune trajectoire à explorer",
                "Revenez plus tard pour découvrir de nouvelles trajectoires.",
                { text: "Actualiser", action: "location.reload()" },
            );
        } else {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <h3>Aucune trajectoire à explorer</h3>
                    <p>Revenez plus tard pour découvrir de nouvelles trajectoires.</p>
                </div>
            `;
        }
        return;
    }

    let usersToDisplay = [...allUsers];
    const currentFilter = window.discoverFilter || "all";

    // Tri de base par récence puis mélange pondéré vérifiés/non-vérifiés
    usersToDisplay = sortUsersByLatestRecency(usersToDisplay);

    const discoverArcCards = buildDiscoverArcCardEntries(usersToDisplay);
    const arcIdsForDiscover = discoverArcCards
        .map((entry) => entry.arcId)
        .filter(Boolean);
    if (arcIdsForDiscover.length > 0) {
        await preloadArcCollaborators(arcIdsForDiscover);
    }

    // Personalized encouragement/follow status
    const contentIds = discoverArcCards
        .map((entry) => entry.content?.contentId)
        .filter(Boolean);

    let encouragedContentIds = new Set();
    let followedSet = new Set();
    if (currentUser) {
        followedSet = await getFollowedUserIdSet();
        if (contentIds.length > 0) {
            const { data } = await supabase
                .from("content_encouragements")
                .select("content_id")
                .eq("user_id", currentUser.id)
                .in("content_id", contentIds);
            if (data) {
                data.forEach((row) => encouragedContentIds.add(row.content_id));
            }
        }
    }

    // Mood-based mix (includes lives)
    const mixedItems = buildMoodDiscoverMix(discoverArcCards, liveStreams, followedSet);
    const renderItem = (item) => {
        if (item.type === "live") {
            return renderLiveStreamCard(item.stream);
        }
        const userId = item.user?.id || item.content?.userId;
        const content = item.content || null;
        if (!userId || !content) return "";
        const isFollowed = followedSet.has(userId);
        const isEncouraged = content
            ? encouragedContentIds.has(content.contentId)
            : false;
        const respectFilter =
            currentFilter === "following" ? isFollowed : true;
        if (!respectFilter) return "";
        return renderUserCard(userId, isFollowed, isEncouraged, content);
    };

    const renderedItems = [];
    mixedItems.forEach((item) => {
        const html = renderItem(item);
        if (!html) return;
        const key = getDiscoverItemKey(item);
        const contentId = getDiscoverItemContentId(item);
        if (!key) return;
        renderedItems.push({
            key,
            html,
            contentId,
            type: item.type,
        });
    });

    if (renderedItems.length > 0) {
        reconcileDiscoverGrid(grid, renderedItems, waitMessage);
        setupDiscoverVideoInteractions();
        initDiscoverMoodTracking();
        return;
    }

    if (
        window.LoadingStateManager &&
        typeof LoadingStateManager.showEmptyState === "function"
    ) {
        LoadingStateManager.showEmptyState(
            grid,
            "👥",
            "Aucune trajectoire à explorer",
            "Revenez plus tard pour découvrir de nouvelles trajectoires.",
            { text: "Actualiser", action: "location.reload()" },
        );
    } else {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <h3>Aucune trajectoire à explorer</h3>
                <p>Revenez plus tard pour découvrir de nouvelles trajectoires.</p>
            </div>
        `;
    }
    if (waitMessage) waitMessage.classList.add("is-hidden");
}

/* ========================================
   RENDERING - IMMERSIVE VIEW
   ======================================== */

// Helper to gather all content for the feed
function getAllFeedContent() {
    let allContent = [];
    if (typeof userContents !== "undefined") {
        Object.values(userContents).forEach((userContentList) => {
            if (Array.isArray(userContentList)) {
                allContent = allContent.concat(userContentList);
            }
        });
    }
    // Sort by createdAt descending (newest first)
    return allContent.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
}

function loadImmersivePrefs() {
    try {
        const raw = localStorage.getItem("immersive_prefs_v1");
        if (!raw)
            return {
                types: {},
                states: {},
                users: {},
                tags: {},
                queries: {},
                seen: {},
            };
        const parsed = JSON.parse(raw);
        return {
            types: parsed.types || {},
            states: parsed.states || {},
            users: parsed.users || {},
            tags: parsed.tags || {},
            queries: parsed.queries || {},
            seen: parsed.seen || {},
        };
    } catch (e) {
        return { types: {}, states: {}, users: {}, tags: {}, queries: {}, seen: {} };
    }
}

function saveImmersivePrefs(prefs) {
    try {
        localStorage.setItem("immersive_prefs_v1", JSON.stringify(prefs));
    } catch (e) {
        // Ignore storage errors
    }
}

function bumpPref(map, key, amount) {
    if (!key) return;
    map[key] = (map[key] || 0) + amount;
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function buildAuthorScoreMapFromContents() {
    const statsByUser = new Map();
    const buckets = userContents || {};

    Object.entries(buckets).forEach(([userId, list]) => {
        if (!Array.isArray(list) || list.length === 0) return;
        let views = 0;
        let encouragements = 0;
        let posts = 0;

        list.forEach((item) => {
            if (!item) return;
            posts += 1;
            views += Number(item.views) || 0;
            encouragements += Number(item.encouragementsCount) || 0;
        });

        const scoreRaw =
            Math.log1p(views) * 0.55 +
            Math.log1p(encouragements) * 1.25 +
            Math.log1p(posts) * 0.35;
        const score = clampNumber(scoreRaw, 0, 5);
        statsByUser.set(userId, score);
    });

    return statsByUser;
}

function prunePrefsObject(obj, maxEntries = 200) {
    const keys = Object.keys(obj || {});
    if (keys.length <= maxEntries) return obj;
    keys.sort((a, b) => (obj[b] || 0) - (obj[a] || 0));
    const trimmed = {};
    keys.slice(0, maxEntries).forEach((k) => {
        trimmed[k] = obj[k];
    });
    return trimmed;
}

function pruneSeen(seenMap, maxEntries = 600) {
    const entries = Object.entries(seenMap || {});
    if (entries.length <= maxEntries) return seenMap;
    entries.sort((a, b) => (a[1] || 0) - (b[1] || 0));
    const trimmed = {};
    entries.slice(entries.length - maxEntries).forEach(([k, v]) => {
        trimmed[k] = v;
    });
    return trimmed;
}

function updateImmersivePrefs(content, action) {
    if (!content) return;
    const prefs = loadImmersivePrefs();
    const weight = action === "like" ? 2.4 : action === "view" ? 0.35 : 0.6;
    bumpPref(prefs.types, content.type, weight);
    bumpPref(prefs.states, content.state, weight * 0.6);
    bumpPref(prefs.users, content.userId, weight * 0.9);
    if (Array.isArray(content.tags)) {
        content.tags.forEach((tag) => bumpPref(prefs.tags, tag, weight * 0.75));
    }
    prefs.seen[content.contentId] = Date.now();
    prefs.types = prunePrefsObject(prefs.types, 80);
    prefs.states = prunePrefsObject(prefs.states, 30);
    prefs.users = prunePrefsObject(prefs.users, 120);
    prefs.tags = prunePrefsObject(prefs.tags, 120);
    prefs.queries = prunePrefsObject(prefs.queries, 120);
    prefs.seen = pruneSeen(prefs.seen, 600);
    saveImmersivePrefs(prefs);
}

function extractSearchTokens(query) {
    if (!query) return [];
    return query
        .toLowerCase()
        .split(/[^a-z0-9À-ÿ]+/i)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3)
        .slice(0, 8);
}

function recordSearchPreference(query) {
    const tokens = extractSearchTokens(query);
    if (tokens.length === 0) return;
    const prefs = loadImmersivePrefs();
    tokens.forEach((token) => {
        bumpPref(prefs.tags, token, 0.9);
        bumpPref(prefs.queries, token, 1.1);
    });
    prefs.tags = prunePrefsObject(prefs.tags, 120);
    prefs.queries = prunePrefsObject(prefs.queries, 120);
    saveImmersivePrefs(prefs);
}
window.recordSearchPreference = recordSearchPreference;

function findContentById(contentId) {
    if (!contentId || typeof userContents === "undefined") return null;
    for (const list of Object.values(userContents)) {
        if (!Array.isArray(list)) continue;
        const hit = list.find((item) => item.contentId === contentId);
        if (hit) return hit;
    }
    return null;
}

async function getFollowedUserIdSet(forceRefresh = false) {
    if (!currentUser) return new Set();
    const viewerId = currentUser.id;
    const now = Date.now();
    const cacheIsFresh =
        followedUserIdsCacheOwner === viewerId &&
        now - followedUserIdsCacheUpdatedAt < FOLLOWED_IDS_CACHE_TTL_MS;
    if (!forceRefresh && cacheIsFresh) {
        return new Set(followedUserIdsCache);
    }

    try {
        const { data, error } = await supabase
            .from("followers")
            .select("following_id")
            .eq("follower_id", viewerId);
        if (error) throw error;
        followedUserIdsCacheOwner = viewerId;
        followedUserIdsCache = new Set(
            (data || []).map((row) => row.following_id),
        );
        followedUserIdsCacheUpdatedAt = Date.now();
        return new Set(followedUserIdsCache);
    } catch (e) {
        console.error("Error fetching followed users for personalization:", e);
        return new Set();
    }
}

const IMMERSIVE_EXPLORATION_RATIO = 0.12; // ~12% of feed used for off-preference probing
const IMMERSIVE_PREF_ALIGNMENT_THRESHOLD = 0.45; // below this, content is considered non-preference

function normalizeArcStageLevelForScore(value) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    if (raw === "idea" || raw === "idée") return "idee";
    if (raw === "prototype") return "prototype";
    if (raw === "demo" || raw === "démo") return "demo";
    if (raw === "beta" || raw === "bêta") return "beta";
    if (raw === "release") return "release";
    return "idee";
}

function normalizeArcOpportunityIntent(value) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    if (raw === "cherche_collab" || raw === "collab")
        return "cherche_collab";
    if (
        raw === "cherche_investissement" ||
        raw === "investissement" ||
        raw === "investor"
    )
        return "cherche_investissement";
    if (
        raw === "open_to_recruit" ||
        raw === "recruit" ||
        raw === "recruiter"
    )
        return "open_to_recruit";
    return null;
}

function normalizeArcOpportunityIntentList(values) {
    const asArray = Array.isArray(values)
        ? values
        : typeof values === "string" && values.trim()
          ? values
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
          : [];

    return Array.from(
        new Set(asArray.map(normalizeArcOpportunityIntent).filter(Boolean)),
    );
}

function getCurrentViewerDiscoveryRole() {
    if (!currentUser) return "fan";
    const profile = getCurrentUserProfile();
    const profileRole =
        profile?.account_subtype || profile?.accountSubtype || null;
    const metadataRole = currentUser?.user_metadata?.account_subtype || null;
    return normalizeDiscoveryAccountRole(profileRole || metadataRole || "fan");
}

function computeOpportunityRoleBoost(content, context) {
    const viewerRole = context?.viewerRole || "fan";
    const intents = normalizeArcOpportunityIntentList(
        content?.arcOpportunityIntents,
    );
    const stage = normalizeArcStageLevelForScore(content?.arcStageLevel);
    const hasArc = !!content?.arcId;
    const hasRecruitSignal = intents.includes("open_to_recruit");
    const hasInvestSignal = intents.includes("cherche_investissement");
    const hasCollabSignal = intents.includes("cherche_collab");

    let boost = 0;
    if (hasArc) {
        // Un arc sans ciblage reste "public"
        boost += intents.length === 0 ? 0.18 : 0.06;
    }

    if (viewerRole === "recruiter") {
        if (hasRecruitSignal) boost += 2.35;
        if (hasCollabSignal) boost += 0.7;
        if (hasInvestSignal) boost += 0.25;
        if (
            stage === "prototype" ||
            stage === "demo" ||
            stage === "beta" ||
            stage === "release"
        ) {
            boost += 0.42;
        }
        return boost;
    }

    if (viewerRole === "investor") {
        if (hasInvestSignal) boost += 2.45;
        if (hasCollabSignal) boost += 0.25;
        if (hasRecruitSignal) boost += 0.2;
        if (stage === "prototype") boost += 0.4;
        if (stage === "demo" || stage === "beta" || stage === "release") {
            boost += 0.72;
        }
        return boost;
    }

    // fan / default viewer
    if (hasCollabSignal) boost += 0.22;
    if (hasRecruitSignal) boost += 0.12;
    if (hasInvestSignal) boost += 0.08;
    if (stage === "demo" || stage === "release") boost += 0.2;
    return boost;
}

function scoreImmersiveContent(content, context) {
    const now = context.now || Date.now();
    const createdAt = content.createdAt
        ? new Date(content.createdAt).getTime()
        : now;
    const ageHours = Math.max(0, (now - createdAt) / (1000 * 60 * 60));
    const recency = Math.exp(-ageHours / 72); // 3 days half-ish
    const engagement =
        Math.log1p(content.encouragementsCount || 0) * 1.2 +
        Math.log1p(content.views || 0) * 0.5;
    const followBoost =
        context.followedSet && context.followedSet.has(content.userId)
            ? 2.0
            : 0;
    const isVerifiedAuthor =
        typeof context.isVerifiedUserId === "function"
            ? !!context.isVerifiedUserId(content.userId)
            : false;
    const verifiedBoost = isVerifiedAuthor ? 1.6 : 0;
    const authorScore =
        context.authorScoreMap && content.userId
            ? context.authorScoreMap.get(content.userId) || 0
            : 0;
    const authorBoost = authorScore * 0.85;
    const typePref = (context.prefs.types[content.type] || 0) * 0.45;
    const statePref = (context.prefs.states[content.state] || 0) * 0.25;
    const userPref = (context.prefs.users[content.userId] || 0) * 0.7;
    const tagPref = Array.isArray(content.tags)
        ? content.tags.reduce(
              (sum, tag) => sum + (context.prefs.tags[tag] || 0) * 0.55,
              0,
          )
        : 0;
    let queryPref = 0;
    if (context.topQueries && context.topQueries.length > 0) {
        const text = `${(content.title || "").toString().toLowerCase()} ${(content.description || "")
            .toString()
            .toLowerCase()}`;
        const tagSet = new Set(
            Array.isArray(content.tags)
                ? content.tags.map((t) => t.toLowerCase())
                : [],
        );
        context.topQueries.forEach(({ token, score }) => {
            if (!token) return;
            if (text.includes(token) || tagSet.has(token)) {
                queryPref += score * 0.35;
            }
        });
    }
    const seenPenalty =
        context.prefs.seen && context.prefs.seen[content.contentId] ? 0.8 : 0;
    const preferenceScore =
        typePref + statePref + userPref + tagPref + queryPref;
    const roleOpportunityBoost = computeOpportunityRoleBoost(content, context);
    const base =
        recency * 2.2 +
        engagement +
        followBoost +
        verifiedBoost +
        authorBoost +
        roleOpportunityBoost +
        preferenceScore -
        seenPenalty;
    const score = base + Math.random() * 0.08;
    return { score, preferenceScore };
}

function interleaveByUser(contents) {
    const buckets = new Map();
    contents.forEach((item) => {
        if (!buckets.has(item.userId)) buckets.set(item.userId, []);
        buckets.get(item.userId).push(item);
    });
    const result = [];
    let added = true;
    while (added) {
        added = false;
        for (const [userId, list] of buckets.entries()) {
            if (list.length > 0) {
                result.push(list.shift());
                added = true;
            }
        }
    }
    return result;
}

async function getPersonalizedFeed(contents) {
    if (!currentUser || !Array.isArray(contents) || contents.length < 3)
        return contents;
    const prefs = loadImmersivePrefs();
    const followedSet = await getFollowedUserIdSet();
    const authorScoreMap = buildAuthorScoreMapFromContents();
    const now = Date.now();
    const viewerRole = getCurrentViewerDiscoveryRole();
    const topQueries = Object.entries(prefs.queries || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([token, score]) => ({ token, score }));
    const scored = contents.map((item) => {
        const { score, preferenceScore } = scoreImmersiveContent(item, {
            prefs,
            followedSet,
            authorScoreMap,
            isVerifiedUserId: (userId) =>
                isVerifiedCreatorUserId(userId) ||
                isVerifiedStaffUserId(userId),
            now,
            topQueries,
            viewerRole,
        });
        return { item: { ...item }, score, preferenceScore };
    });

    scored.sort((a, b) => b.score - a.score);
    markExplorationInterest(scored);

    const ranked = scored.map((s) => s.item);
    return interleaveByUser(ranked);
}

function markExplorationInterest(scoredItems) {
    if (!Array.isArray(scoredItems) || scoredItems.length === 0) return;

    const targetRaw = Math.round(scoredItems.length * IMMERSIVE_EXPLORATION_RATIO);
    const targetCount = Math.max(1, targetRaw);

    const candidates = scoredItems.filter(
        ({ preferenceScore }) =>
            (preferenceScore || 0) <= IMMERSIVE_PREF_ALIGNMENT_THRESHOLD,
    );

    if (candidates.length === 0) return;

    const cappedTarget = Math.min(targetCount, candidates.length);
    const step = Math.max(1, Math.floor(candidates.length / cappedTarget));

    let picked = 0;
    for (let i = 0; i < candidates.length && picked < cappedTarget; i += step) {
        candidates[i].item.__askInterest = true;
        picked += 1;
    }

    // If rounding left us short, fill sequentially
    let idx = 0;
    while (picked < cappedTarget && idx < candidates.length) {
        if (!candidates[idx].item.__askInterest) {
            candidates[idx].item.__askInterest = true;
            picked += 1;
        }
        idx += 1;
    }
}

// Helper to render header
async function renderImmersiveHeader(user) {
    let subscribeBtnHtml = "";

    if (user && currentUser && currentUser.id !== user.id) {
        try {
            const isFollowingUser = await isFollowing(currentUser.id, user.id);
            const btnClass = isFollowingUser
                ? "btn-follow-immersive unfollow"
                : "btn-follow-immersive";
            const iconSrc = isFollowingUser
                ? "icons/subscribed.svg"
                : "icons/subscribe.svg";

            subscribeBtnHtml = `
                <button id="follow-immersive-btn-${user.id}" class="${btnClass}" onclick="event.stopPropagation(); toggleFollow('${currentUser.id}', '${user.id}')" style="background: transparent; border: none; padding: 0;">
                    <img src="${iconSrc}" class="btn-icon" style="width: 24px; height: 24px;">
                </button>
            `;
        } catch (e) {
            console.error(e);
        }
    } else if (!user) {
        return "";
    }

    return `
        <div class="immersive-header" id="immersive-header-content">
            <button class="profile-link immersive-profile-link" onclick="event.stopPropagation(); handleProfileClick('${user.id}', this, true)">
                <img src="${user.avatar || "https://placehold.co/40"}" class="immersive-user-avatar">
                <span class="immersive-user-name">${renderUsernameWithBadge(user.name, user.id)}</span>
            </button>
            ${subscribeBtnHtml}
        </div>
    `;
}

async function renderImmersiveFeed(contents) {
    let encouragedContentIds = new Set();
    const followMap = new Map();
    const liveStreamMap = new Map(); // userId -> live row

    const arcIdsForImmersive = (contents || [])
        .filter((c) => c && c.arcId)
        .map((c) => c.arcId);
    if (arcIdsForImmersive.length > 0) {
        await preloadArcCollaborators(arcIdsForImmersive);
    }

    // Pré-charger les lives actifs des auteurs présents dans le feed
    try {
        const userIds = Array.from(
            new Set((contents || []).map((c) => c && c.userId).filter(Boolean)),
        );
        if (userIds.length > 0) {
            const { data: liveRows } = await supabase
                .from("streaming_sessions")
                .select("id, user_id, title, status")
                .eq("status", "live")
                .in("user_id", userIds);
            (liveRows || []).forEach((row) => {
                if (!row?.user_id || !row?.id) return;
                liveStreamMap.set(row.user_id, row);
            });
        }
    } catch (e) {
        console.warn("Impossible de précharger les lives pour l'immersive feed", e);
    }

    // Fetch user encouragements if logged in
    if (currentUser && contents.length > 0) {
        try {
            const contentIds = contents.map((c) => c.contentId);
            // Limit request size if too many items
            const batchIds = contentIds.slice(0, 500);

            const { data } = await supabase
                .from("content_encouragements")
                .select("content_id")
                .eq("user_id", currentUser.id)
                .in("content_id", batchIds);

            if (data) {
                data.forEach((row) => encouragedContentIds.add(row.content_id));
            }
        } catch (e) {
            console.error("Error fetching encouragements:", e);
        }

        try {
            const uniqueUserIds = Array.from(
                new Set(contents.map((c) => c.userId)),
            );
            if (uniqueUserIds.length > 0) {
                const { data: followData } = await supabase
                    .from("followers")
                    .select("following_id")
                    .eq("follower_id", currentUser.id)
                    .in("following_id", uniqueUserIds);
                if (followData) {
                    followData.forEach((row) =>
                        followMap.set(row.following_id, true),
                    );
                }
            }
        } catch (e) {
            console.error(
                "Error fetching follow status for immersive feed:",
                e,
            );
        }
    }

    return contents
        .map((content) => {
            const stateLabel =
                content.state === "success"
                    ? "#Victoire"
                    : content.state === "failure"
                      ? "#Bloqué"
                      : "#Pause";
            const liveRow =
                content.type === "live"
                    ? liveStreamMap.get(content.userId) || null
                    : null;
            const isAnnouncement = isAnnouncementContent(content);
            const timeLabel = timeAgo(content.createdAt || content.created_at);
            const replyCount = isAnnouncement
                ? getReplyCount(content.contentId)
                : 0;
            // Defensive: some cached/local items may still carry the tag payload inside
            // `description` (e.g. "\n\n#hashtags: ..."). Keep immersive copy clean.
            const immersiveDescription = extractTagsFromDescription(
                content.rawDescription || content.description || "",
            ).cleanDescription;

            const contentBadges = getContentBadges(content);
            // Include user badges as well (consistent with Discover cards)
            const contentBadgesHtml = renderBadges(contentBadges);
            const userBadgesHtml = renderUserBadges(content.userId);
            const badgesHtml = contentBadgesHtml + userBadgesHtml;
            const contentUser = getUser(content.userId);
            const contentUserName = contentUser
                ? contentUser.name
                : "Utilisateur";
            const contentUserNameHtml = contentUser
                ? renderUsernameWithBadge(contentUserName, contentUser.id)
                : contentUserName;
            const contentUserAvatar =
                contentUser && contentUser.avatar
                    ? contentUser.avatar
                    : "https://placehold.co/40";
            const isFollowingUser = currentUser
                ? followMap.get(content.userId) === true
                : false;
            const followIconSrc = isFollowingUser
                ? "icons/subscribed.svg"
                : "icons/subscribe.svg";
            const followBtnClass = isFollowingUser
                ? "btn-follow-immersive inline unfollow"
                : "btn-follow-immersive inline";
            const collabAvatarsHtml = buildArcCollaboratorAvatars(content, {
                size: 22,
                className: "arc-collab-avatars--immersive",
            });
            const collabCornerHtml = buildArcCollaboratorCornerAvatars(content, {
                size: 20,
                max: 4,
                className: "arc-collab-avatars--immersive-corner",
            });

            let mediaHtml = "";
            const mediaList = Array.isArray(content.mediaUrls)
                ? content.mediaUrls.filter(Boolean)
                : content.mediaUrl
                  ? [content.mediaUrl]
                  : [];
            if (mediaList.length > 0) {
                if (content.type === "video") {
                    mediaHtml = `
                    <div class="immersive-video-wrap" style="position: relative; width: 100%; height: 100%;">
                        <video
                            id="immersive-video-${content.contentId}"
                            class="immersive-video"
                            data-src="${mediaList[0]}"
                            playsinline
                            webkit-playsinline
                            autoplay
                            muted
                            loop
                            preload="metadata"
                            style="width: 100%; height: 100%; object-fit: contain;"
                            data-content-id="${content.contentId}"
                            disablePictureInPicture
                        ></video>
                        <div class="video-buffering-spinner" aria-hidden="true">
                            <div class="spinner-ring"></div>
                        </div>
                        <div class="video-fallback">
                            <img src="icons/play.svg" alt="Play" width="56" height="56">
                            <span>Vidéo</span>
                        </div>
                        ${collabCornerHtml}
                        <img class="immersive-video-play" src="icons/play.svg" alt="Play" style="position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:64px; height:64px; opacity:0.9; display:none; pointer-events:none;" />
                    </div>
                `;
                } else {
                    if (mediaList.length > 1) {
                        const slides = mediaList
                            .map(
                                (u) =>
                                    `<div class="xera-carousel-slide"><img src="${u}" class="immersive-image" alt="${content.title || "Media"}" loading="lazy" decoding="async"></div>`,
                            )
                            .join("");
                        const dots = `<div class="xera-carousel-dots">${mediaList
                            .map(
                                (_, i) =>
                                    `<span class="xera-dot ${i === 0 ? "active" : ""}" data-index="${i}"></span>`,
                            )
                            .join("")}</div>`;
                        mediaHtml = `
                            <div class="immersive-image-wrap">
                                <div class="xera-carousel xera-carousel--immersive" data-carousel>
                                    <div class="xera-carousel-track">${slides}</div>
                                    <button type="button" class="xera-carousel-arrow xera-carousel-arrow--prev" aria-label="Image précédente">&lsaquo;</button>
                                    <button type="button" class="xera-carousel-arrow xera-carousel-arrow--next" aria-label="Image suivante">&rsaquo;</button>
                                    <div class="xera-carousel-counter" aria-label="Collection de ${mediaList.length} images">
                                        Collection <span data-carousel-current>1</span>/<span data-carousel-total>${mediaList.length}</span>
                                    </div>
                                    ${dots}
                                </div>
                                ${collabCornerHtml}
                            </div>
                        `;
                    } else {
                        mediaHtml = `<div class="immersive-image-wrap"><img src="${mediaList[0]}" class="immersive-image" alt="${content.title || "Media"}">${collabCornerHtml}</div>`;
                    }
                }
            } else {
                const textBody =
                    immersiveDescription || content.title || "Nouveau post texte";
                mediaHtml = `<div class="immersive-text-card">${collabCornerHtml}<p>${textBody}</p></div>`;
            }

            const isEncouraged = encouragedContentIds.has(content.contentId);
            const courageIcon = isEncouraged
                ? "icons/courage-green.svg"
                : "icons/courage-blue.svg";
            const courageClass = isEncouraged
                ? "courage-btn encouraged"
                : "courage-btn";

            const dayPill =
                !isAnnouncement && typeof content.dayNumber === "number"
                    ? `<span class="step-indicator">Jour ${content.dayNumber}</span>`
                    : "";

            const isLiveContent = content.type === "live";
            const liveJoinHtml =
                isLiveContent && liveRow
                    ? `<button class="mood-btn live-join-btn" onclick="event.stopPropagation(); openLiveStreamById('${liveRow.id}', '${content.userId}', '${escapeHtml(liveRow.title || content.title || "Live en cours")}')">🔴 Rejoindre le live</button>`
                    : isLiveContent
                        ? `<button class="mood-btn live-join-btn" onclick="event.stopPropagation(); openLiveStreamForUser('${content.userId}', '${escapeHtml(content.title || "Live en cours")}')">🔴 Rejoindre le live</button>`
                        : "";

            const moodActionsHtml = content.__askInterest
                ? `
                <div class="mood-actions">
                    <button class="mood-btn" onclick="event.stopPropagation(); handleDiscoverInterest('${content.contentId}', 'like')">Intéressé</button>
                    <button class="mood-btn" onclick="event.stopPropagation(); handleDiscoverInterest('${content.contentId}', 'dislike')">Pas intéressé</button>
                    ${liveJoinHtml}
                </div>
            `
                : liveJoinHtml;

            return `
            <div class="immersive-post" data-content-id="${content.contentId}" data-user-id="${content.userId}">
                <div class="post-content-wrap">
                    ${mediaHtml}
                    <div class="post-info">
                        <div class="immersive-meta-row">
                            ${dayPill}
                            <span class="state-tag">${stateLabel}</span>
                            ${isAnnouncement ? '<span class="announcement-chip">Annonce</span>' : ""}
                            ${
                                timeLabel
                                    ? `<span class="time-ago-label">${timeLabel}</span>`
                                    : ""
                            }
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <h2>${content.title}</h2>
                            <div class="post-stats" style="display:flex; gap:1rem;">
                                <div class="stat-pill" title="Vues">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    <span>${content.views || 0}</span>
                                </div>
                                <button class="${courageClass}" data-content-id="${content.contentId}" onclick="event.stopPropagation(); toggleCourage('${content.contentId}', this)" title="Encourager">
                                    <img src="${courageIcon}" width="16" height="16">
                                    <span class="courage-count">${content.encouragementsCount || 0}</span>
                                </button>
                            </div>
                        </div>
                        
                        <p>${immersiveDescription}</p>
                        ${moodActionsHtml}
                        <div class="immersive-post-user">
                            <button class="profile-link immersive-profile-link" onclick="event.stopPropagation(); handleProfileClick('${content.userId}', this, true)">
                                <img src="${contentUserAvatar}" alt="Avatar de ${contentUserName}" class="immersive-post-user-avatar">
                                <span class="immersive-post-user-name">${contentUserNameHtml}</span>
                            </button>
                            ${collabAvatarsHtml}
                            ${
                                currentUser && currentUser.id !== content.userId
                                    ? `
                                <button class="${followBtnClass}" data-follow-user="${content.userId}" onclick="event.stopPropagation(); toggleFollow('${currentUser.id}', '${content.userId}')">
                                    <img src="${followIconSrc}" class="btn-icon" style="width: 20px; height: 20px;">
                                </button>
                            `
                                    : ""
                            }
                        </div>
                        <div class="badges-immersive">
                            ${badgesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
        })
        .join("");
}

// Squelettes de chargement pour le feed immersif
function renderImmersiveSkeleton(count = 3) {
    const items = [];
    for (let i = 0; i < count; i++) {
        items.push(`
            <div class="immersive-post skeleton">
                <div class="immersive-video-wrap skeleton-block"></div>
                <div class="immersive-meta skeleton-meta">
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                </div>
            </div>
        `);
    }
    return items.join("");
}

// Backward compatibility
async function renderImmersiveContent(userId) {
    const contents = getUserContentLocal(userId);
    return renderImmersiveFeed(contents);
}

async function openImmersive(startUserId, startContentId = null) {
    console.log("Opening immersive for user:", startUserId);

    // Vérifier si les données sont chargées
    if (!allUsers || allUsers.length === 0) {
        console.error("Users data not loaded");
        alert("Chargement des données en cours, veuillez réessayer...");
        return;
    }

    if (!userContents || Object.keys(userContents).length === 0) {
        console.error("Content data not loaded");
        alert("Aucun contenu disponible pour le moment");
        return;
    }

    const overlay = document.getElementById("immersive-overlay");

    if (!overlay) {
        console.error("Immersive overlay not found");
        return;
    }

    // Initial loading state
    overlay.innerHTML = `
        <div class="close-immersive" onclick="closeImmersive()">✕</div>
        <div id="immersive-content-container" class="immersive-skeleton-container">
            ${renderImmersiveSkeleton(4)}
        </div>
    `;
    overlay.style.display = "block";
    document.body.style.overflow = "hidden";
    handleLoginPromptContext();

    try {
        initXeraCarousels(overlay);
    } catch (e) {
        /* ignore */
    }

    try {
        // Get ALL content sorted by date, then personalize
        let allContents = await getPersonalizedFeed(getAllFeedContent());
        console.log("All contents found:", allContents.length);

        if (allContents.length === 0) {
            overlay.innerHTML = `
                <div class="close-immersive" onclick="closeImmersive()">✕</div>
                <div style="display:flex;justify-content:center;align-items:center;height:100vh;color:white;">
                    <div style="text-align:center;">
                        <h3>Aucun contenu disponible</h3>
                        <p>Les utilisateurs n'ont pas encore publié de contenu</p>
                    </div>
                </div>
            `;
            return;
        }

        // Ensure the clicked content is first in the personalized feed
        let startIndex = -1;
        if (startContentId) {
            startIndex = allContents.findIndex(
                (c) => c.contentId === startContentId,
            );
        } else {
            const latest = getLatestContent(startUserId);
            startIndex = latest
                ? allContents.findIndex((c) => c.contentId === latest.contentId)
                : -1;
        }
        if (startIndex > 0) {
            const [pinned] = allContents.splice(startIndex, 1);
            allContents.unshift(pinned);
            startIndex = 0;
            if (pinned && pinned.userId) {
                startUserId = pinned.userId;
            }
        }
        console.log(
            "Start index:",
            startIndex,
            "Start content:",
            startContentId || "(latest)",
        );

        // Render all content
        const contentHtml = await renderImmersiveFeed(allContents);

        // Initial header for the starting user
        const user = getUser(startUserId);
        if (!user) {
            console.error("User not found:", startUserId);
            alert("Utilisateur non trouvé");
            closeImmersive();
            return;
        }

        const headerHtml = await renderImmersiveHeader(user);

        // Header Styles & HTML
        const headerStyle = `
            <style>
                .immersive-header {
                    position: absolute;
                    top: 20px;
                    left: 20px;
                    z-index: 100;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    pointer-events: none;
                    transition: opacity 0.3s;
                }
                .immersive-header > * {
                    pointer-events: auto;
                }
                .immersive-user-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.8);
                    object-fit: cover;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                }
                .immersive-user-name {
                    color: white;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 1.1rem;
                }
                .btn-follow-immersive {
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 20px;
                    padding: 6px 12px;
                    color: white;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-follow-immersive:hover {
                    background: rgba(255,255,255,0.3);
                }
                .btn-follow-immersive.unfollow {
                    background: rgba(16,185,129,0.8);
                    border-color: rgba(16,185,129,0.9);
                }
                .close-immersive {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 1001;
                    width: 40px;
                    height: 40px;
                    background: rgba(0,0,0,0.8);
                    border: none;
                    border-radius: 50%;
                    color: white;
                    font-size: 1.2rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .close-immersive:hover {
                    background: rgba(0,0,0,0.9);
                }
            </style>
        `;

        // Assemble final HTML
        overlay.innerHTML = `
            ${headerStyle}
            <div class="close-immersive" onclick="closeImmersive()">✕</div>
            <div id="immersive-header-container">
                ${headerHtml}
            </div>
            <div id="immersive-content-container">
                ${contentHtml}
            </div>
            <div class="immersive-nav-arrows" id="immersive-nav-arrows">
                <button class="immersive-arrow" id="immersive-arrow-up" aria-label="Post précédent">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>
                </button>
                <button class="immersive-arrow" id="immersive-arrow-down" aria-label="Post suivant">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9l-6 6-6-6"/></svg>
                </button>
            </div>
        `;

        try {
            initXeraCarousels(overlay);
        } catch (e) {
            /* ignore */
        }

        // Scroll to the starting content
        if (startIndex >= 0) {
            setTimeout(() => {
                const startElement = document.querySelector(
                    `[data-content-id="${allContents[startIndex].contentId}"]`,
                );
                if (startElement) {
                    startElement.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                    });
                }
            }, 100);
        }

        // Setup immersive interactions
        // setupImmersiveInteractions(); // Commenté pour l'instant

        // Setup video play/pause on scroll
        setTimeout(() => {
            setupImmersiveLazyLoad();
            setupImmersiveObserver();
            setupImmersiveVideoUI();
            setupImmersiveSnapNav();
            setupImmersiveKeyboardNav();
            setupImmersiveArrowNav();
        }, 100);
    } catch (error) {
        console.error("Error opening immersive:", error);
        overlay.innerHTML = `
            <div class="close-immersive" onclick="closeImmersive()">✕</div>
            <div style="display:flex;justify-content:center;align-items:center;height:100vh;color:white;">
                <div style="text-align:center;">
                    <h3>Erreur de chargement</h3>
                    <p>${error.message}</p>
                    <button onclick="closeImmersive()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #333; border: none; border-radius: 4px; color: white; cursor: pointer;">Fermer</button>
                </div>
            </div>
        `;
    }
}

function closeImmersive() {
    document.getElementById("immersive-overlay").style.display = "none";
    document.body.style.overflow = "auto";
    loginPromptImmersiveViews = 0;
    handleLoginPromptContext();
}

let currentImmersiveUser = null;

// Désactive le son et met en pause toutes les vidéos immersives sauf celle passée
function muteOtherImmersiveVideos(activeVideo) {
    const videos = document.querySelectorAll("video.immersive-video");
    videos.forEach((vid) => {
        if (vid === activeVideo) return;
        vid.pause();
        vid.muted = true;
    });
}

// Renvoie la vidéo immersive la plus visible à l'écran
function getActiveImmersiveVideo() {
    const videos = Array.from(document.querySelectorAll("video.immersive-video"));
    let best = null;
    let bestScore = 0;
    videos.forEach((vid) => {
        const rect = vid.getBoundingClientRect();
        const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
        const visibleArea = Math.max(0, visibleHeight) * Math.max(0, visibleWidth);
        const totalArea = Math.max(1, rect.width * rect.height);
        const ratio = visibleArea / totalArea;
        if (ratio > bestScore) {
            bestScore = ratio;
            best = vid;
        }
    });
    return bestScore >= 0.4 ? best : null; // au moins 40% visible
}

// Assure que la vidéo immersive est chargée (lazy) avant lecture
function ensureImmersiveVideoLoaded(video, autoplay = false) {
    if (!video) return;
    if (video.dataset.loaded === "1") return;
    const src = video.dataset.src;
    if (!src) return;
    video.src = src;
    video.dataset.loaded = "1";
    // On garde preload metadata (déjà dans le markup)
    if (autoplay) {
        video.play().catch(() => {});
    }
}

function setupImmersiveObserver() {
    const posts = document.querySelectorAll(".immersive-post");
    const headerContainer = document.getElementById(
        "immersive-header-container",
    );

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                const video = entry.target.querySelector(
                    "video.immersive-video",
                );

                if (entry.isIntersecting) {
                    // La vidéo est visible - la jouer
                    if (video) {
                        ensureImmersiveVideoLoaded(video, true);
                        muteOtherImmersiveVideos(video);
                        video.muted = !window.__immersiveSoundUnlocked;
                        video.play().catch((error) => {
                            console.log(
                                "Autoplay bloqué, attente interaction:",
                                error,
                            );
                        });
                    }

                    const contentId = entry.target.dataset.contentId;
                    const userId = entry.target.dataset.userId;

                    // View counting with dwell thresholds:
                    // video => 4s of effective playback, image/text => 2s visible
                    if (contentId && entry.target.dataset.viewed !== "true") {
                        scheduleImmersiveViewCount(entry.target, video);
                    }

                    // Update Header if user changed
                    if (userId && userId !== currentImmersiveUser) {
                        currentImmersiveUser = userId;
                        const user = getUser(userId);
                        renderImmersiveHeader(user).then((html) => {
                            if (headerContainer)
                                headerContainer.innerHTML = html;
                        });
                    }
                } else {
                    // La vidéo n'est plus visible - l'arrêter
                    if (video) {
                        video.pause();
                        video.muted = true;
                    }
                    clearImmersiveViewTracker(entry.target);
                }
            });
        },
        {
            threshold: 0.5, // Trigger when 50% visible
        },
    );

    posts.forEach((post) => observer.observe(post));
}

function setupImmersiveVideoUI() {
    const container = document.getElementById("immersive-content-container");
    if (!container) return;

    const wraps = container.querySelectorAll(".immersive-video-wrap");
    wraps.forEach((wrap) => {
        const video = wrap.querySelector("video.immersive-video");
        const playIcon = wrap.querySelector(".immersive-video-play");
        const spinner = wrap.querySelector(".video-buffering-spinner");
        if (!video || !playIcon) return;
        video.loop = true;

        const updateOverlay = () => {
            playIcon.style.display = video.paused ? "block" : "none";
            if (spinner) spinner.style.display = video.paused ? "flex" : "none";
        };

        updateOverlay();

        video.addEventListener("play", updateOverlay);
        video.addEventListener("pause", updateOverlay);
        video.addEventListener("ended", updateOverlay);
        video.addEventListener(
            "loadeddata",
            () => {
                wrap.classList.add("is-ready");
                if (spinner) spinner.style.display = "none";
            },
            { once: true },
        );
        video.addEventListener(
            "error",
            () => {
                wrap.classList.add("has-error");
                if (spinner) spinner.style.display = "none";
            },
            { once: true },
        );
        video.addEventListener("waiting", () => {
            if (spinner) spinner.style.display = "flex";
        });
        video.addEventListener("canplay", () => {
            if (spinner) spinner.style.display = "none";
        });
        // Si la lecture reprend après un buffering, rétablir le son si l'utilisateur l'avait autorisé
        video.addEventListener("playing", () => {
            if (window.__immersiveSoundUnlocked) {
                muteOtherImmersiveVideos(video);
                video.muted = false;
            }
            updateOverlay();
        });

        wrap.addEventListener("click", () => {
            if (video.paused) {
                if (!window.__immersiveSoundUnlocked) {
                    window.__immersiveSoundUnlocked = true;
                }
                ensureImmersiveVideoLoaded(video, true);
                muteOtherImmersiveVideos(video);
                video.muted = false;
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });

        // Précharger légèrement au scroll; la lecture/son est gérée par setupImmersiveObserver
        setupVideoAutoplay(video, wrap);
    });

    // Initialiser l'activation globale du son
    initGlobalSoundActivation();

    // Activer le lazy-load avec préchargement progressif
    setupImmersiveLazyLoad();
}

// Précharge localement une vidéo immersive quand son conteneur approche de l'écran.
// La logique de lecture et de son doit rester centralisée dans setupImmersiveObserver.
function setupVideoAutoplay(video, container) {
    if (!video || !container) return;

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    ensureImmersiveVideoLoaded(video, false);
                    observer.unobserve(container);
                }
            });
        },
        {
            threshold: 0.2,
            rootMargin: "120px 0px",
        },
    );

    observer.observe(container);
}

// Lazy-load + préchargement progressif des vidéos immersives
function setupImmersiveLazyLoad() {
    const videos = document.querySelectorAll("video.immersive-video");
    if (!videos.length || typeof IntersectionObserver === "undefined") return;

    videos.forEach((video, idx) => {
        video.dataset.index = idx;
        // si première vidéo, charger immédiatement pour une première frame rapide
        if (idx === 0) {
            ensureImmersiveVideoLoaded(video, false);
        }
    });

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    ensureImmersiveVideoLoaded(video, false);

                    // Précharger la vidéo suivante pour la fluidité
                    const nextIdx = Number(video.dataset.index || 0) + 1;
                    const next = document.querySelector(
                        `video.immersive-video[data-index="${nextIdx}"]`,
                    );
                    if (next) ensureImmersiveVideoLoaded(next, false);

                    observer.unobserve(video);
                }
            });
        },
        {
            root: null,
            rootMargin: "280px 0px", // charger avant d'entrer à l'écran
            threshold: 0.2,
        },
    );

    videos.forEach((video) => observer.observe(video));
}

// Activation globale du son pour toutes les vidéos
function initGlobalSoundActivation() {
    let soundActivated = false;

    const activateAllSounds = () => {
        if (soundActivated) return;
        soundActivated = true;
        window.__immersiveSoundUnlocked = true;

        // Activer le son uniquement pour la vidéo immersive la plus visible
        const active = getActiveImmersiveVideo();
        if (active) {
            ensureImmersiveVideoLoaded(active, true);
            muteOtherImmersiveVideos(active);
            active.muted = false;
            active.play().catch(() => {});
        }

        console.log("Son activé (une seule vidéo immersive à la fois)");

        // Retirer tous les écouteurs
        document.removeEventListener("click", activateAllSounds, true);
        document.removeEventListener("keydown", activateAllSounds, true);
        document.removeEventListener("touchstart", activateAllSounds, true);
        document.removeEventListener("scroll", activateAllSounds, true);
        document.removeEventListener("mousemove", activateAllSounds, true);
    };

    // Écouter TOUTES les interactions possibles
    document.addEventListener("click", activateAllSounds, {
        once: true,
        capture: true,
    });
    document.addEventListener("keydown", activateAllSounds, {
        once: true,
        capture: true,
    });
    document.addEventListener("touchstart", activateAllSounds, {
        once: true,
        capture: true,
    });
    document.addEventListener("scroll", activateAllSounds, {
        once: true,
        capture: true,
    });
    document.addEventListener("mousemove", activateAllSounds, {
        once: true,
        capture: true,
    });

    // Ne pas forcer l'activation sans interaction utilisateur
}

function setupImmersiveSnapNav() {
    const overlay = document.getElementById("immersive-overlay");
    if (!overlay) return;

    // Rebind safely when the immersive overlay is rebuilt
    if (typeof overlay.__snapCleanup === "function") {
        overlay.__snapCleanup();
        overlay.__snapCleanup = null;
    }

    overlay.dataset.snapNavBound = "true";

    const SWIPE_THRESHOLD_PX = 52;
    const AXIS_LOCK_THRESHOLD_PX = 10;
    const NAV_COOLDOWN_MS = 420;
    const WHEEL_THRESHOLD = 10;

    let startX = 0;
    let startY = 0;
    let isTouching = false;
    let ignoreCurrentGesture = false;
    let lockUntilTs = 0;
    let lockTimer = null;

    const isOverlayOpen = () => overlay.style.display === "block";

    const isInteractiveTarget = (target) =>
        !!target?.closest(
            "input, textarea, select, button, a, [contenteditable='true'], .xera-carousel, .xera-carousel-track, .xera-carousel-arrow",
        );

    const getPosts = () =>
        Array.from(overlay.querySelectorAll(".immersive-post")).filter(
            (el) => el.offsetParent !== null,
        );

    const getActiveIndex = (posts) => {
        if (!posts.length) return 0;
        let closestIndex = 0;
        let minDistance = Infinity;
        const viewportMid = window.innerHeight * 0.4;
        posts.forEach((post, index) => {
            const rect = post.getBoundingClientRect();
            const distance = Math.abs(rect.top - viewportMid);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });
        return closestIndex;
    };

    const clearNavLockTimer = () => {
        if (!lockTimer) return;
        clearTimeout(lockTimer);
        lockTimer = null;
    };

    const engageNavLock = () => {
        lockUntilTs = Date.now() + NAV_COOLDOWN_MS;
        clearNavLockTimer();
        lockTimer = setTimeout(() => {
            lockUntilTs = 0;
            lockTimer = null;
        }, NAV_COOLDOWN_MS);
    };

    const isNavLocked = () => Date.now() < lockUntilTs;

    const scrollToIndex = (posts, index) => {
        if (!posts[index]) return;
        engageNavLock();
        posts[index].scrollIntoView({
            behavior: "smooth",
            block: "start",
            inline: "nearest",
        });
    };

    const navigateStep = (direction) => {
        if (!isOverlayOpen()) return;
        if (isNavLocked()) return;
        const posts = getPosts();
        if (posts.length === 0) return;
        const currentIndex = getActiveIndex(posts);
        const nextIndex = Math.max(
            0,
            Math.min(posts.length - 1, currentIndex + direction),
        );
        if (nextIndex === currentIndex) return;
        scrollToIndex(posts, nextIndex);
    };

    const onTouchStart = (e) => {
        if (!isOverlayOpen()) return;
        if (!e.touches || e.touches.length !== 1) {
            isTouching = false;
            return;
        }

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isTouching = true;
        ignoreCurrentGesture = isInteractiveTarget(e.target);
    };

    const onTouchMove = (e) => {
        if (!isTouching || ignoreCurrentGesture) return;
        if (!e.touches || e.touches.length !== 1) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // Bloquer le scroll natif vertical pour imposer 1 swipe = 1 post.
        if (absY > AXIS_LOCK_THRESHOLD_PX && absY > absX) {
            e.preventDefault();
        }
    };

    const onTouchEnd = (e) => {
        if (!isTouching) return;
        isTouching = false;
        if (ignoreCurrentGesture) {
            ignoreCurrentGesture = false;
            return;
        }

        const touch =
            (e.changedTouches && e.changedTouches[0]) ||
            (e.touches && e.touches[0]) ||
            null;
        if (!touch) return;

        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absY < SWIPE_THRESHOLD_PX || absY <= absX) return;

        e.preventDefault();
        const direction = deltaY < 0 ? 1 : -1;
        navigateStep(direction);
    };

    const onTouchCancel = () => {
        isTouching = false;
        ignoreCurrentGesture = false;
    };

    const onWheel = (e) => {
        if (!isOverlayOpen()) return;
        if (isInteractiveTarget(e.target)) return;
        if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;

        e.preventDefault();
        const direction = e.deltaY > 0 ? 1 : -1;
        navigateStep(direction);
    };

    overlay.addEventListener("touchstart", onTouchStart, { passive: true });
    overlay.addEventListener("touchmove", onTouchMove, { passive: false });
    overlay.addEventListener("touchend", onTouchEnd, { passive: false });
    overlay.addEventListener("touchcancel", onTouchCancel, { passive: true });
    overlay.addEventListener("wheel", onWheel, { passive: false });

    overlay.__snapCleanup = () => {
        overlay.removeEventListener("touchstart", onTouchStart);
        overlay.removeEventListener("touchmove", onTouchMove);
        overlay.removeEventListener("touchend", onTouchEnd);
        overlay.removeEventListener("touchcancel", onTouchCancel);
        overlay.removeEventListener("wheel", onWheel);
        clearNavLockTimer();
        lockUntilTs = 0;
        isTouching = false;
        ignoreCurrentGesture = false;
    };
}

function setupImmersiveKeyboardNav() {
    const overlay = document.getElementById("immersive-overlay");
    if (!overlay) return;
    if (window.__immersiveKeyboardNavBound) return;
    window.__immersiveKeyboardNavBound = true;

    const handler = (e) => {
        if (overlay.style.display !== "block") return;
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const posts = Array.from(document.querySelectorAll(".immersive-post"));
        if (posts.length === 0) return;
        const currentIndex = (() => {
            let closestIndex = 0;
            let minDistance = Infinity;
            posts.forEach((post, index) => {
                const rect = post.getBoundingClientRect();
                const distance = Math.abs(rect.top);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestIndex = index;
                }
            });
            return closestIndex;
        })();
        const nextIndex =
            e.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
        const clamped = Math.max(0, Math.min(posts.length - 1, nextIndex));
        posts[clamped].scrollIntoView({ behavior: "smooth", block: "start" });
        e.preventDefault();
    };

    document.addEventListener("keydown", handler);
}

function setupImmersiveArrowNav() {
    const overlay = document.getElementById("immersive-overlay");
    const arrows = document.getElementById("immersive-nav-arrows");
    const btnUp = document.getElementById("immersive-arrow-up");
    const btnDown = document.getElementById("immersive-arrow-down");

    if (!overlay || !arrows || !btnUp || !btnDown) return;

    // Rebind safely when the immersive overlay is rebuilt
    if (typeof overlay.__arrowCleanup === "function") {
        overlay.__arrowCleanup();
        overlay.__arrowCleanup = null;
    }

    const getPosts = () =>
        Array.from(
            document.querySelectorAll(
                ".immersive-post",
            ),
        ).filter((el) => el.offsetParent !== null); // skip hidden

    const getActiveIndex = (posts) => {
        let closestIndex = 0;
        let minDistance = Infinity;
        posts.forEach((post, index) => {
            const rect = post.getBoundingClientRect();
            const distance = Math.abs(rect.top);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });
        return closestIndex;
    };

    const scrollToIndex = (posts, index) => {
        if (!posts[index]) return;
        posts[index].scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const updateDisabled = () => {
        const posts = getPosts();
        if (posts.length === 0) {
            btnUp.disabled = true;
            btnDown.disabled = true;
            return;
        }
        const idx = getActiveIndex(posts);
        btnUp.disabled = idx <= 0;
        btnDown.disabled = idx >= posts.length - 1;
    };

    btnUp.addEventListener("click", (e) => {
        e.stopPropagation();
        const posts = getPosts();
        const idx = getActiveIndex(posts);
        scrollToIndex(posts, Math.max(0, idx - 1));
        setTimeout(updateDisabled, 350);
    });

    btnDown.addEventListener("click", (e) => {
        e.stopPropagation();
        const posts = getPosts();
        const idx = getActiveIndex(posts);
        scrollToIndex(posts, Math.min(posts.length - 1, idx + 1));
        setTimeout(updateDisabled, 350);
    });

    let ticking = false;
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            updateDisabled();
            ticking = false;
        });
    };

    overlay.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateDisabled);

    updateDisabled();

    overlay.__arrowCleanup = () => {
        overlay.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", updateDisabled);
    };
}

/* ========================================
   RENDERING - PROFILE TIMELINE
   ======================================== */

async function renderProfileTimeline(userId) {
    console.log("renderProfileTimeline appelé pour userId:", userId);
    console.log("allUsers contient:", allUsers.length, "utilisateurs");

    let user = getUser(userId);
    if (!user) {
        // Tentative de récupération ponctuelle du profil
        try {
            const res = await getUserProfile(userId);
            if (res.success && res.data) {
                allUsers.push(res.data);
                user = res.data;
            }
        } catch (e) {
            console.error("Fetch profil échec:", e);
        }
    }
    if (!user && window.currentUser && window.currentUser.id === userId) {
        user = window.currentUser;
    }
    if (!user) {
        console.error("Utilisateur non trouvé dans allUsers:", userId);
        console.log(
            "Liste des IDs dans allUsers:",
            allUsers.map((u) => u.id),
        );
        return "<p>Utilisateur introuvable</p>";
    }

    console.log("Utilisateur trouvé:", user.name);
    const currentUserId = window.currentUserId;
    const isOwnProfile = userId === currentUserId;
    const isAdminViewer = isSuperAdmin();
    const adminReasonInputId = `profile-admin-reason-${userId}`;
    // Récupérer les contenus
    const contents = getUserContentLocal(userId);
    const userBadgesHtml = renderUserBadges(userId);
    const projectsPromise = ensureUserProjectsLoaded(userId);

    // Récupérer les ARCs
    let userArcs = [];
    try {
        const { data } = await supabase
            .from("arcs")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
        userArcs = data || [];
    } catch (e) {
        console.error("Erreur chargement ARCs:", e);
    }

    let collaboratorArcs = [];
    try {
        collaboratorArcs = await fetchCollaboratorArcs(userId);
    } catch (e) {
        console.error("Erreur chargement ARCs collaboratifs:", e);
    }

    const arcMap = new Map();
    userArcs.forEach((arc) => {
        arcMap.set(arc.id, { ...arc, _collabRole: "owner" });
    });
    (collaboratorArcs || []).forEach((arc) => {
        if (!arcMap.has(arc.id)) {
            arcMap.set(arc.id, { ...arc, _collabRole: "collaborator" });
        }
    });
    const allArcs = Array.from(arcMap.values());

    // Filtrer les contenus si un ARC est sélectionné
    let displayContents = contents;
    let selectedArc = null;

    if (window.selectedArcId) {
        selectedArc =
            allArcs.find((a) => a.id === window.selectedArcId) ||
            userArcs.find((a) => a.id === window.selectedArcId);
        try {
            const { data: arcContentsData, error: arcContentsError } =
                await supabase
                    .from("content")
                    .select(
                        `
                    *,
                    arcs (
                        id,
                        title,
                        status,
                        user_id
                    ),
                    projects (
                        id,
                        name
                    )
                `,
                    )
                    .eq("arc_id", window.selectedArcId)
                    .order("created_at", { ascending: false });
            if (arcContentsError) throw arcContentsError;
            if (arcContentsData) {
                const converted = arcContentsData.map(convertSupabaseContent);
                displayContents = isSuperAdmin()
                    ? converted
                    : converted.filter((c) => !c.isDeleted);
            } else {
                displayContents = contents.filter(
                    (c) => c.arcId === window.selectedArcId,
                );
            }
        } catch (error) {
            console.error("Erreur chargement contenus ARC:", error);
            displayContents = contents.filter(
                (c) => c.arcId === window.selectedArcId,
            );
        }
    }

    const viewerCollabStatusMap = await fetchArcCollabStatusMap(
        allArcs.map((a) => a.id),
        currentUserId,
    );
    const pendingRequests = isOwnProfile
        ? await fetchPendingArcCollabRequests(userId)
        : [];

    // Générer HTML des ARCs
    let arcsHtml = "";
    if (allArcs.length > 0) {
        const arcItems = allArcs
            .map((arc) => {
                const isActive = window.selectedArcId === arc.id;
                const progress = 0; // Calculer progression si possible
                const viewerStatus = viewerCollabStatusMap.get(arc.id);
                const canCollaborate =
                    currentUserId && currentUserId !== arc.user_id;
                const collabBadgeHtml =
                    arc._collabRole === "collaborator"
                        ? `<div style="margin-top:0.35rem; font-size:0.7rem; color: var(--text-secondary);">Collaboration</div>`
                        : "";
                const ownerLabelHtml =
                    arc._collabRole === "collaborator" && arc.users?.name
                        ? `<div style="margin-top:0.25rem; font-size:0.7rem; color: var(--text-secondary);">Par ${renderUsernameWithBadge(arc.users.name, arc.users.id || arc.user_id)}</div>`
                        : "";
                let collabActionHtml = "";
                if (canCollaborate) {
                    if (viewerStatus === "pending") {
                        collabActionHtml = `<div style="margin-top:0.5rem; font-size:0.7rem; color: var(--text-secondary);">Demande envoyée</div>`;
                    } else if (viewerStatus === "accepted") {
                        collabActionHtml = `
                        <div style="margin-top:0.5rem;">
                            <button onclick="event.stopPropagation(); leaveArcCollaboration('${arc.id}')" style="background: transparent; border: 1px solid #ef4444; color: #ef4444; padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.7rem; cursor: pointer;">
                                Quitter
                            </button>
                        </div>
                    `;
                    } else {
                        collabActionHtml = `
                        <div style="margin-top:0.5rem;">
                            <button class="btn-collaborate" onclick="event.stopPropagation(); requestArcCollaboration('${arc.id}', '${arc.user_id}')" style="background: rgba(255,255,255,0.06); color: var(--text-primary); padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.7rem; cursor: pointer;">
                                Collaborer
                            </button>
                        </div>
                    `;
                    }
                }
                return `
                <div class="arc-card ${isActive ? "active" : ""}" onclick="selectArc('${arc.id}', '${userId}')" style="min-width: 200px; padding: 1rem; border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; background: ${isActive ? "rgba(255,255,255,0.05)" : "transparent"}; transition: all 0.2s;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem; color: ${isActive ? "var(--accent-color)" : "inherit"}; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; word-break:break-word; overflow-wrap:anywhere;">${arc.title}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${arc.status === "completed" ? "Terminé" : "En cours"}</div>
                    ${collabBadgeHtml}
                    ${ownerLabelHtml}
                    ${isActive ? '<div style="margin-top:0.5rem; font-size:0.75rem; color:var(--accent-color);">Voir les traces</div>' : ""}
                    ${collabActionHtml}
                </div>
            `;
            })
            .join("");

        arcsHtml = `
            <div class="arcs-section" style="margin: 2rem 0;">
                <h3 style="margin-bottom: 1rem; display:flex; align-items:center; justify-content:space-between;">
                    ARCs
                    ${window.selectedArcId ? `<button onclick="selectArc(null, '${userId}')" style="background:none; border:none; color:var(--text-secondary); font-size:0.8rem; cursor:pointer;">Voir tout</button>` : ""}
                </h3>
                <div class="arcs-scroller" style="display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 1rem;">
                    ${arcItems}
                </div>
            </div>
        `;
    }

    const collabRequestsHtml =
        pendingRequests.length > 0
            ? `
        <div class="collab-requests" style="margin: 1.5rem 0; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 12px;">
            <h3 style="margin-bottom: 1rem;">Demandes de collaboration</h3>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                ${pendingRequests
                    .map((req) => {
                        const collaborator = req.collaborator;
                        const arc = req.arc;
                        const avatar =
                            collaborator?.avatar || "https://placehold.co/36";
                        const name = escapeHtml(
                            collaborator?.name || "Utilisateur",
                        );
                        const arcTitle = escapeHtml(arc?.title || "ARC");
                        return `
                        <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 10px;">
                            <img src="${avatar}" alt="Avatar ${name}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Souhaite collaborer sur ${arcTitle}</div>
                            </div>
                            <div style="display:flex; gap:0.4rem;">
                                <button onclick="acceptArcCollaboration('${req.id}', '${req.arcId}', '${req.collaboratorId}')" style="background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.4); color: #10b981; padding: 0.35rem 0.6rem; border-radius: 8px; font-size: 0.75rem; cursor: pointer;">
                                    Accepter
                                </button>
                                <button onclick="declineArcCollaboration('${req.id}', '${req.arcId}')" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.4); color: #ef4444; padding: 0.35rem 0.6rem; border-radius: 8px; font-size: 0.75rem; cursor: pointer;">
                                    Refuser
                                </button>
                            </div>
                        </div>
                    `;
                    })
                    .join("")}
            </div>
        </div>
    `
            : "";

    const isFollowingThisUser =
        currentUserId && !isOwnProfile
            ? await isFollowing(currentUserId, userId)
            : false;

    // ... Boutons existants ...
    const settingsButtonHtml = isOwnProfile
        ? `
        <button class="badge settings-badge" onclick="window.launchLive('${userId}')" title="Lancer un live">
            <div class="badge-icon"><img src="icons/live.svg" alt="Live" style="width:100%;height:100%;"></div>
            <span>Live</span>
        </button>
        <button class="badge settings-badge" onclick="window.location.href='analytics.html'" title="Analytics">
            <div class="badge-icon"><img src="icons/analytics.svg" alt="Analytics" style="width:100%;height:100%;"></div>
            <span>Analytics</span>
        </button>
        ${
            isSuperAdmin()
                ? `
        <button class="badge settings-badge" onclick="window.location.href='admin.html'" title="Administration">
            <div class="badge-icon"><img src="icons/team.svg" alt="Administration" style="width:100%;height:100%;"></div>
            <span>Admin</span>
        </button>
        `
                : ""
        }
        <button class="badge settings-badge" onclick="openSettings('${userId}')" title="Réglages">
            <div class="badge-icon"><img src="icons/reglages.svg" alt="Réglages" style="width:100%;height:100%;"></div>
            <span>Réglages</span>
        </button>
    `
        : "";

    const shareButtonHtml = `  <button class="btn-share-profile" onclick="shareProfileLink('${userId}')" title="Partager le profil" aria-label="Partager le profil">
            <img src="icons/share.svg" alt="Partager">
        </button>
    `;

    let followButtonHtml = "";
    if (!isOwnProfile && currentUserId) {
        const isCommunity = user.account_subtype === 'community' || user.accountSubtype === 'community';
        if (isCommunity) {
             followButtonHtml = `
                <button 
                    class="btn btn-community-join"
                    onclick="toggleFollow('${currentUserId}', '${userId}')"
                    id="follow-btn-${userId}"
                    style="padding: 0.5rem 1.2rem; border-radius: 99px; font-weight: 600; font-size: 0.9rem; color: ${isFollowingThisUser ? "var(--text-primary)" : "var(--bg-color)"}; background: ${isFollowingThisUser ? "rgba(255,255,255,0.1)" : "var(--text-primary)"}; border: 1px solid ${isFollowingThisUser ? "var(--border-color)" : "transparent"};"
                >
                    ${isFollowingThisUser ? "Membre" : "Rejoindre"}
                </button>
            `;
        } else {
            followButtonHtml = `
                <button 
                    class="btn btn-follow ${isFollowingThisUser ? "unfollow" : ""}"
                    onclick="toggleFollow('${currentUserId}', '${userId}')"
                    id="follow-btn-${userId}"
                    style="background: transparent; border: none; padding: 0;"
                >
                    <img src="${isFollowingThisUser ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 24px; height: 24px;">
                </button>
            `;
        }
    }

    const messageButtonHtml =
        !isOwnProfile && currentUserId
            ? `
                <button
                    class="btn-secondary profile-message-btn"
                    onclick="window.openMessagesWithUser && window.openMessagesWithUser('${userId}')"
                    title="Envoyer un message"
                    style="padding: 0.5rem 1rem; border-radius: 12px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.45rem;"
                >
                    <img src="icons/message.svg" alt="Message" style="width:16px;height:16px;">
                    Message
                </button>
            `
            : "";

    const followerCount = await getFollowerCount(userId);
    const followingCount = await getFollowingCount(userId);
    const engagementTotals = await getUserEngagementTotals(userId);
    const userTraces = getUserContentLocal(userId) || [];
    const showVerificationCta = isOwnProfile && !isCurrentUserVerified();
    const verificationCtaHtml = showVerificationCta
        ? `
        <div class="profile-verify-block">
            <div class="verify-copy">
                <strong>Envie du badge vérifié ?</strong>
                <span>Pré-requis créateur : 1000 abonnés (actuel : ${followerCount}).</span>
            </div>
            <button class="profile-verify-cta" onclick="window.location.href='verification.html'">
                Obtenir une vérification
                <img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="Badge" />
            </button>
        </div>
        `
        : "";
    const accountTypeValue = String(user.account_type || "").toLowerCase();
    const accountSubtypeValue = String(user.account_subtype || user.accountSubtype || "").toLowerCase();
    const isCommunityAccount =
        accountSubtypeValue === "community" ||
        accountSubtypeValue === "enterprise" ||
        accountSubtypeValue === "company" ||
        accountTypeValue === "community" ||
        accountTypeValue === "enterprise" ||
        accountTypeValue === "company";
    const engagementStatsHtml = `
        <div class="follow-section" style="margin-top: 0.5rem;">
            <div class="follower-stat">
                <div class="follower-stat-count">${followerCount}</div>
                <div class="follower-stat-label">Abonnés</div>
            </div>
            <div class="follower-stat">
                <div class="follower-stat-count">${engagementTotals.totalViews}</div>
                <div class="follower-stat-label">Vues totales</div>
            </div>
            <div class="follower-stat">
                <div class="follower-stat-count">${userTraces.length}</div>
                <div class="follower-stat-label">Traces</div>
            </div>
        </div>
    `;

    // Générer la timeline (avec displayContents filtré)
    const getDayNumberValue = (c) => {
        if (!c) return 0;
        return typeof c.dayNumber === "number"
            ? c.dayNumber
            : typeof c.day_number === "number"
              ? c.day_number
              : 0;
    };
    const timeline = [];

    if (window.selectedArcId && displayContents.length === 0) {
        // Si ARC sélectionné mais vide
        timeline.push({
            dayNumber: 0,
            content: null,
            state: "empty-arc",
            message: "Aucune trace dans cet ARC pour le moment.",
        });
    } else if (window.selectedArcId) {
        // ARC sélectionné: afficher TOUT le contenu de l'ARC, trié par jour décroissant
        const uniqueArcUsers = new Set(
            displayContents.map((c) => c.userId).filter(Boolean),
        );
        const isMultiUserArc = uniqueArcUsers.size > 1;
        const arcItems = [...displayContents].sort((a, b) => {
            if (isMultiUserArc)
                return new Date(b.createdAt) - new Date(a.createdAt);
            return getDayNumberValue(b) - getDayNumberValue(a);
        });
        arcItems.forEach((content) => {
            timeline.push({
                dayNumber: getDayNumberValue(content),
                content,
                state: content.state,
            });
        });
    } else {
        // Logique normale: timeline complète par jour avec trous
        const maxDay = displayContents.reduce(
            (max, c) => Math.max(max, getDayNumberValue(c)),
            0,
        );
        for (let day = maxDay; day >= 1; day--) {
            const dayContent = displayContents.find(
                (c) => getDayNumberValue(c) === day,
            );
            timeline.push({
                dayNumber: day,
                content: dayContent || null,
                state: dayContent ? dayContent.state : "empty",
            });
        }
    }

    const timelineItems = timeline
        .map((item) => {
            if (item.state === "empty-arc") {
                return `<div style="text-align:center; padding:2rem; color:var(--text-secondary);">${item.message}</div>`;
            }
            if (item.state === "empty") {
                const emptyBadgeSvg = `
                <div class="timeline-dot-badge">
                    ${badgeSVGs.empty}
                </div>
            `;

                return `
                <div class="timeline-item item-empty">
                    ${emptyBadgeSvg}
                    <div class="timeline-date">Jour ${item.dayNumber}</div>
                    <div class="timeline-card" style="opacity: 0.5;">
                        <span class="empty-indicator">Aucune trace aujourd'hui.</span>
                    </div>
                </div>
            `;
            }

            const content = item.content;
            const itemClass = `item-${content.state}`;
            const dateFormatted = safeFormatDate(content.createdAt, {
                month: "long",
                day: "numeric",
            });

            const timeAgoStr = timeAgo(content.createdAt);
            const dateDisplay = `${dateFormatted} - Jour ${content.dayNumber} <span style="opacity: 0.5; font-size: 0.85em; margin-left: 8px;">(${timeAgoStr})</span>`;

            let stateBadgeSvg = "";
            if (content.state === "success") {
                stateBadgeSvg = badgeSVGs.success;
            } else if (content.state === "failure") {
                stateBadgeSvg = badgeSVGs.failure;
            } else if (content.state === "pause") {
                stateBadgeSvg = badgeSVGs.pause;
            }

            let authorHtml = "";
            if (
                window.selectedArcId &&
                content.userId &&
                content.userId !== userId
            ) {
                const author = getUser(content.userId);
                const authorName = author
                    ? renderUsernameWithBadge(author.name, author.id)
                    : "Collaborateur";
                authorHtml = `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">par ${authorName}</div>`;
            }

            // Ajouter le média s'il existe
            let mediaHtml = "";
            if (content.mediaUrl) {
                if (content.type === "video") {
                    mediaHtml = `<div class="timeline-media"><video src="${content.mediaUrl}" controls style="max-width: 100%; border-radius: 8px; margin-top: 1rem;"></video></div>`;
                } else if (content.type === "image") {
                    mediaHtml = `<div class="timeline-media"><img src="${content.mediaUrl}" alt="${content.title}" style="max-width: 100%; border-radius: 8px; margin-top: 1rem;"></div>`;
                } else if (content.type === "live" || content.type === "gif") {
                    mediaHtml = `<div class="timeline-media"><a href="${content.mediaUrl}" target="_blank" style="color: var(--accent-color); text-decoration: underline; margin-top: 1rem; display: block;">Voir le média</a></div>`;
                }
            }

            // Ajouter les références ARC/Projet
            let contextHtml = "";
            const contextItems = [];

            if (content.arc) {
                const arcStatusColor =
                    content.arc.status === "completed"
                        ? "#10b981"
                        : content.arc.status === "abandoned"
                          ? "#ef4444"
                          : "#f59e0b";
                contextItems.push(
                    `<span class="context-tag arc-tag" style="background: ${arcStatusColor}20; color: ${arcStatusColor}; border: 1px solid ${arcStatusColor}30;" onclick="openArcDetails('${content.arc.id}')">🎯 ${content.arc.title}</span>`,
                );
            }

            if (content.project) {
                contextItems.push(
                    `<span class="context-tag project-tag" style="background: var(--accent-color)20; color: var(--accent-color); border: 1px solid var(--accent-color)30;">📁 ${content.project.name}</span>`,
                );
            }

            if (contextItems.length > 0) {
                contextHtml = `<div class="timeline-context" style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">${contextItems.join("")}</div>`;
            }

            // Ajouter boutons de modification/suppression si c'est le profil de l'utilisateur connecté
            let actionsHtml = "";
            if (currentUser && currentUser.id === userId) {
                // Log de débogage pour vérifier l'ID
                console.log(
                    "Content ID pour les boutons:",
                    content.contentId,
                    "Content complet:",
                    content,
                );

                actionsHtml = `
                <div class="timeline-actions" style="margin-top: 0.5rem; display: flex; gap: 0.5rem; opacity: 0.7;">
                    <button class="btn-action" onclick="editContent('${content.contentId || content.id}')" style="background: none; border: 1px solid var(--border-color); color: var(--text-secondary); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">
                        ✏️ Modifier
                    </button>
                    <button class="btn-action" onclick="deleteContent('${content.contentId || content.id}')" style="background: none; border: 1px solid #ef4444; color: #ef4444; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">
                        🗑️ Supprimer
                    </button>
                </div>
            `;
            }
            if (isAdminViewer && currentUserId !== userId) {
                actionsHtml += `
                <div class="timeline-actions" style="margin-top: 0.5rem; display: flex; gap: 0.35rem; flex-wrap: wrap;">
                    <button class="btn-action" style="background:none; border:1px solid #f59e0b; color:#f59e0b; padding:0.25rem 0.5rem; border-radius:4px; font-size:0.75rem; cursor:pointer;"
                        onclick="moderateContentFromProfile('${content.contentId || content.id}', 'hide', '${userId}')">
                        🛑 Masquer
                    </button>
                    <button class="btn-action" style="background:none; border:1px solid var(--border-color); color:var(--text-secondary); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.75rem; cursor:pointer;"
                        onclick="moderateContentFromProfile('${content.contentId || content.id}', 'restore', '${userId}')">
                        ↩️ Restaurer
                    </button>
                    <button class="btn-action" style="background:none; border:1px solid #ef4444; color:#ef4444; padding:0.25rem 0.5rem; border-radius:4px; font-size:0.75rem; cursor:pointer;"
                        onclick="moderateContentFromProfile('${content.contentId || content.id}', 'hard', '${userId}')">
                        ❌ Supprimer définitivement
                    </button>
                </div>
            `;
            }

            return `
            <div class="timeline-item ${itemClass}">
                <div class="timeline-dot-badge filled">
                    ${stateBadgeSvg}
                </div>
                <div class="timeline-date">${dateDisplay}</div>
                <div class="timeline-card">
                    <h4>${content.title}</h4>
                    ${authorHtml}
                    <p>${content.description}</p>
                    ${contextHtml}
                    ${mediaHtml}
                    ${actionsHtml}
                </div>
            </div>
        `;
        })
        .join("");

    const timelineCollapsedHtml =
        timeline.length > 0
            ? `
        <div class="timeline-latest">
            <div class="timeline-item-latest">
                ${(() => {
                    const lastItem = timeline[0];
                    if (
                        lastItem.state === "empty" ||
                        lastItem.state === "empty-arc"
                    ) {
                        const message =
                            lastItem.state === "empty-arc"
                                ? lastItem.message
                                : "Aucune trace aujourd'hui.";
                        return `
                            <div class="timeline-dot-badge">
                                ${badgeSVGs.empty}
                            </div>
                            <div class="timeline-date">Jour ${lastItem.dayNumber}</div>
                            <div class="timeline-card" style="opacity: 0.5;">
                                <span class="empty-indicator">${message}</span>
                            </div>
                        `;
                    } else {
                        const content = lastItem.content;
                        let stateBadgeSvg = "";
                        if (content.state === "success") {
                            stateBadgeSvg = badgeSVGs.success;
                        } else if (content.state === "failure") {
                            stateBadgeSvg = badgeSVGs.failure;
                        } else if (content.state === "pause") {
                            stateBadgeSvg = badgeSVGs.pause;
                        }
                        const dateFormatted = safeFormatDate(content.createdAt, {
                            month: "long",
                            day: "numeric",
                        });

                        const timeAgoStr = timeAgo(content.createdAt);
                        const dateDisplay = `${dateFormatted} - Jour ${content.dayNumber} <span style="opacity: 0.5; font-size: 0.85em; margin-left: 8px;">(${timeAgoStr})</span>`;

                        // Ajouter le média s'il existe pour la vue condensée
                        let mediaHtmlLatest = "";
                        if (content.mediaUrl) {
                            if (content.type === "video") {
                                mediaHtmlLatest = `<div class="timeline-media"><video src="${content.mediaUrl}" controls style="max-width: 100%; border-radius: 8px; margin-top: 1rem;"></video></div>`;
                            } else if (content.type === "image") {
                                mediaHtmlLatest = `<div class="timeline-media"><img src="${content.mediaUrl}" alt="${content.title}" style="max-width: 100%; border-radius: 8px; margin-top: 1rem;"></div>`;
                            } else if (
                                content.type === "live" ||
                                content.type === "gif"
                            ) {
                                mediaHtmlLatest = `<div class="timeline-media"><a href="${content.mediaUrl}" target="_blank" style="color: var(--accent-color); text-decoration: underline; margin-top: 1rem; display: block;">Voir le média</a></div>`;
                            }
                        }

                        // Ajouter les références ARC/Projet pour la vue condensée
                        let contextHtmlLatest = "";
                        const contextItemsLatest = [];

                        if (content.arc) {
                            const arcStatusColor =
                                content.arc.status === "completed"
                                    ? "#10b981"
                                    : content.arc.status === "abandoned"
                                      ? "#ef4444"
                                      : "#f59e0b";
                            contextItemsLatest.push(
                                `<span class="context-tag arc-tag" style="background: ${arcStatusColor}20; color: ${arcStatusColor}; border: 1px solid ${arcStatusColor}30;" onclick="openArcDetails('${content.arc.id}')">🎯 ${content.arc.title}</span>`,
                            );
                        }

                        if (content.project) {
                            contextItemsLatest.push(
                                `<span class="context-tag project-tag" style="background: var(--accent-color)20; color: var(--accent-color); border: 1px solid var(--accent-color)30;">📁 ${content.project.name}</span>`,
                            );
                        }

                        if (contextItemsLatest.length > 0) {
                            contextHtmlLatest = `<div class="timeline-context" style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">${contextItemsLatest.join("")}</div>`;
                        }

                        let authorHtmlLatest = "";
                        if (
                            window.selectedArcId &&
                            content.userId &&
                            content.userId !== userId
                        ) {
                            const author = getUser(content.userId);
                            const authorName = author
                                ? renderUsernameWithBadge(
                                      author.name,
                                      author.id,
                                  )
                                : "Collaborateur";
                            authorHtmlLatest = `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">par ${authorName}</div>`;
                        }

                        return `
                            <div class="timeline-dot-badge filled">
                                ${stateBadgeSvg}
                            </div>
                            <div class="timeline-date">${dateDisplay}</div>
                            <div class="timeline-card">
                                <h4>${content.title}</h4>
                                ${authorHtmlLatest}
                                <p>${content.description}</p>
                                ${contextHtmlLatest}
                                ${mediaHtmlLatest}
                            </div>
                        `;
                    }
                })()}
            </div>
            <button class="btn-toggle-timeline" onclick="toggleTimelineExpand(this)">
                <span class="toggle-text">Afficher l'historique complet</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>
            <div class="timeline-full hidden" id="timeline-full-${userId}">
                ${timelineItems}
            </div>
        </div>
    `
            : "";

    const timelinesHtml = timelineCollapsedHtml;

    const imageVersion = encodeURIComponent(
        user.updated_at || user.updatedAt || Date.now(),
    );
    const withCacheBust = (url) => {
        if (!url) return url;
        if (typeof url !== "string") return url;
        if (url.startsWith("data:")) return url;
        const joiner = url.includes("?") ? "&" : "?";
        return `${url}${joiner}v=${imageVersion}`;
    };

    const safeBanner =
        user.banner &&
        (user.banner.startsWith("http") || user.banner.startsWith("data:"))
            ? user.banner
            : null;
    const bannerHtml = safeBanner
        ? `<img src="${withCacheBust(safeBanner)}" class="profile-banner" alt="Bannière de ${user.name}" onerror="this.style.display='none'">`
        : "";

    const projects = await projectsPromise;
    const projectsHtml = projects.length
        ? `
        <div class="projects-grid">
            ${projects
                .map(
                    (p) => `
                <div class="project-card">
                    <img src="${p.cover || user.banner || user.avatar}" class="project-cover" alt="Cover">
                    <div class="project-meta">
                        <h4>${p.name}</h4>
                        <p>${p.description || ""}</p>
                    </div>
                </div>
            `,
                )
                .join("")}
        </div>
    `
        : "";

    const banStateLabel = isUserBanned(user)
        ? `<span style="color:#ef4444; font-weight:600;">Banni (reste ${getBanRemainingLabel(user) || "en cours"})</span>`
        : `<span style="color: var(--text-secondary);">Statut : actif</span>`;

    const adminInlineHtml =
        isAdminViewer && !isOwnProfile
            ? `
        <div class="admin-inline-box" style="margin: 1rem auto 0; max-width: 760px; border: 1px solid var(--border-color); border-radius: 12px; padding: 0.9rem 1rem; background: rgba(255,255,255,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                <div style="display:flex; flex-direction:column; gap:0.25rem;">
                    <strong style="font-size:0.95rem;">Modération rapide (admin)</strong>
                    ${banStateLabel}
                </div>
                <div style="display:flex; gap:0.45rem; align-items:center; flex-wrap:wrap;">
                    <input type="number" id="profile-ban-duration-${userId}" class="form-input" value="24" min="1" style="width:90px;" aria-label="Durée">
                    <select id="profile-ban-unit-${userId}" class="form-input" style="width:110px;">
                        <option value="hours">heures</option>
                        <option value="days">jours</option>
                    </select>
                    <input type="text" id="${adminReasonInputId}" class="form-input" placeholder="Raison (optionnel)" style="min-width:160px;">
                    <button class="btn-verify" style="white-space:nowrap;" onclick="banUserFromProfile('${userId}')">Bannir</button>
                    <button class="btn-cancel" style="white-space:nowrap;" onclick="unbanUserFromProfile('${userId}')">Lever le ban</button>
                </div>
            </div>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top:0.35rem;">Les actions s'appliquent immédiatement sur ce profil. La raison est enregistrée avec le ban ou la suppression douce.</p>
        </div>
        `
            : "";

    const hasArcs = Array.isArray(userArcs) && userArcs.length > 0;
    const profileRoleBadgeHtml = renderProfileRoleBadgeByUser(user);

    const weeklyChartHtml = `
        <div class="weekly-progress-card" style="margin: 1.5rem 0; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 14px; padding: 1.25rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                <div>
                    <h4 style="margin:0;">Progression hebdomadaire</h4>
                    <p style="margin:0; color: var(--text-secondary); font-size:0.9rem;">Survolez pour voir les traces par jour.</p>
                </div>
                ${hasArcs ? "" : `<button class="btn-secondary" onclick="window.openCreateModal && window.openCreateModal()" style="padding:0.45rem 0.8rem; border-radius:10px;">Créer un ARC</button>`}
            </div>
            <div style="margin-top:1rem; min-height:220px;">
                ${hasArcs || userTraces.length > 0
                    ? `<canvas id="weekly-progress-chart-${userId}" aria-label="Progression hebdomadaire" role="img"></canvas>`
                    : `<div style="padding:1rem; color: var(--text-secondary);">Pas encore d'ARC ? <a href="#" onclick="window.openCreateModal && window.openCreateModal(); return false;">Créez-en un</a> pour débloquer votre trajectoire.</div>`
                }
            </div>
        </div>
    `;

    const profileHtml = `
        ${bannerHtml}
        <div class="profile-hero">
            <div class="profile-avatar-wrapper">
                <img src="${user.avatar && (user.avatar.startsWith("http") || user.avatar.startsWith("data:")) ? withCacheBust(user.avatar) : "https://placehold.co/150"}" class="profile-avatar-img" alt="Avatar de ${user.name}" onclick="navigateToUserProfile('${userId}')" style="cursor: pointer;">
            </div>
            <h2>${renderUsernameForProfile(user.name, user.id)}</h2>
            ${profileRoleBadgeHtml}
            <p style="color: var(--text-secondary);"><strong>${user.title}</strong></p>
            <p class="profile-bio" style="max-width: 600px; margin: 0.5rem auto; line-height: 1.5;">${user.bio || ""}</p>
            ${userBadgesHtml}
            ${renderProfileSocialLinks(userId)}
            
            ${
                !isOwnProfile
                    ? `
                <div class="follow-section">
                    <div class="follower-stat">
                        <div class="follower-stat-count">${followerCount}</div>
                        <div class="follower-stat-label">Abonnés</div>
                    </div>
                    <div class="follower-stat">
                        <div class="follower-stat-count">${followingCount}</div>
                        <div class="follower-stat-label">Abonnements</div>
                    </div>
                </div>
                ${engagementStatsHtml}
                <div class="profile-actions" style="margin-top:6px; display:flex; gap:8px; align-items:center; justify-content:center;">
                    ${followButtonHtml}
                    ${messageButtonHtml}
                    ${shareButtonHtml}
                </div>
                ${adminInlineHtml}
            `
                    : `
                <div class="follow-section">
                    <div class="follower-stat">
                        <div class="follower-stat-count">${followerCount}</div>
                        <div class="follower-stat-label">Abonnés</div>
                    </div>
                    <div class="follower-stat">
                        <div class="follower-stat-count">${followingCount}</div>
                        <div class="follower-stat-label">Abonnements</div>
                    </div>
                </div>
                ${engagementStatsHtml}
                ${verificationCtaHtml}
                <div class="profile-actions" style="margin-top:6px; display:flex; gap:8px; align-items:center;"> 
                    <button class="btn-add" onclick="openCreateMenu('${userId}')" title="Ajouter une trace">
                        <img src="icons/plus.svg" alt="Ajouter" style="width:18px;height:18px">
                    </button>
                    ${shareButtonHtml}
                    <button class="btn-secondary profile-arc-btn" onclick="window.openCreateModal ? window.openCreateModal() : console.error('openCreateModal function not found')" title="Démarrer un ARC" style="padding: 0.5rem 1rem; border-radius: 12px; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                        Nouvel ARC
                    </button>
                    ${settingsButtonHtml}
                </div>
            `
            }
        </div>
        ${arcsHtml}
        ${collabRequestsHtml}
        ${projectsHtml}
        ${weeklyChartHtml}
        <section class="influence-section">
            <h3 class="section-title">Influence & Reach</h3>
            <div class="influence-grid">
                <div class="influence-card" id="yt-card">
                    <h4>YouTube</h4>
                    <div class="stat-block">
                        <div>
                            <div class="stat-value subs">--</div>
                            <div class="stat-label subs">Subscribers</div>
                        </div>
                        <div>
                            <div class="stat-value views">--</div>
                            <div class="stat-label views">Views</div>
                        </div>
                    </div>
                    <button class="connect-btn" data-connect="yt">Connect YouTube</button>
                </div>
                <div class="influence-card" id="sp-card">
                    <h4>Spotify</h4>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        <img class="sp-avatar" alt="Spotify avatar">
                        <div>
                            <div class="stat-value followers">--</div>
                            <div class="stat-label followers">Followers</div>
                        </div>
                    </div>
                    <button class="connect-btn" data-connect="spotify">Connect Spotify</button>
                </div>
            </div>
        </section>
        <div class="profile-analytics-section ${!isOwnProfile ? "compact" : ""}" style="margin: 2.5rem 0;">
            <h3 class="section-title">Analytics mensuelles</h3>
            <div id="profile-analytics" class="analytics-dashboard ${!isOwnProfile ? "analytics-dashboard-compact" : ""}" style="padding: 0; margin: 0; max-width: 100%;"></div>
        </div>
        <div class="timeline">
            ${window.selectedArcId && selectedArc ? `<div style="padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 1rem; text-align: center;">Affichage des traces pour l'ARC : <strong>${selectedArc.title}</strong></div>` : ""}
            ${timelinesHtml}
        </div>
        
        <!-- Footer uniquement sur la page profil -->
        <footer style="background: var(--bg-secondary); border-top: 1px solid var(--border-color); padding: 2rem; margin-top: 4rem; text-align: center;">
            <div style="max-width: 1200px; margin: 0 auto;">
                <div style="display: flex; justify-content: center; align-items: center; gap: 2rem; margin-bottom: 1rem; flex-wrap: wrap;">
                    <a href="index.html" style="color: var(--text-secondary); text-decoration: none; transition: color 0.3s;">Accueil</a>
                    <a href="credits.html" style="color: var(--text-secondary); text-decoration: none; transition: color 0.3s;">Crédits</a>
                </div>
                <p style="color: var(--text-muted); font-size: 0.9rem;">© 2026 XERA - Documentez l'effort</p>
            </div>
        </footer>
    `;

    const settingsButtonContainer = document.getElementById(
        "settings-button-container",
    );
    if (settingsButtonContainer) {
        settingsButtonContainer.innerHTML = "";
    }

    return profileHtml;
}

async function renderProfileIntoContainer(userId) {
    window.currentProfileViewed = userId;
    const profileContainer = document.querySelector(".profile-container");
    if (!profileContainer) return;

    const finalizeProfileRender = () => {
        try {
            persistProfileContentsCache(userId);
        } catch (e) {
            /* ignore */
        }

        try {
            initXeraCarousels(profileContainer);
        } catch (e) {
            /* ignore */
        }

        // Community Account Visuals
        const user = getUser(userId);
        if (
            user &&
            (user.account_subtype === "community" ||
                user.accountSubtype === "community")
        ) {
            profileContainer.classList.add("is-community");
        } else {
            profileContainer.classList.remove("is-community");
        }

        profileContainer.classList.toggle("arc-view", !!window.selectedArcId);
        if (window.loadUserArcs) window.loadUserArcs(userId);
        if (window.renderProfileAnalytics) window.renderProfileAnalytics(userId);
        if (window.renderWeeklyProgressChart)
            window.renderWeeklyProgressChart(userId);
        if (window.renderInfluenceReach) window.renderInfluenceReach(userId);
        maybeShowAmbassadorWelcome(userId);
    };

    if (
        typeof window.renderProfileReact === "function" &&
        window.React &&
        window.ReactDOM
    ) {
        try {
            const didReactRender = window.renderProfileReact(
                profileContainer,
                userId,
                finalizeProfileRender,
            );
            if (didReactRender) {
                return;
            }
        } catch (e) {
            // fallback to vanilla
        }
    }

    profileContainer.innerHTML = getProfileLoadingMarkup();
    profileContainer.classList.remove("arc-view");
    try {
        profileContainer.innerHTML = await renderProfileTimeline(userId);
        finalizeProfileRender();
    } catch (error) {
        console.error("Erreur renderProfileTimeline:", error);
        profileContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h3>Impossible de charger le profil</h3>
                <p>${error?.message || "Une erreur est survenue pendant le rendu."}</p>
            </div>
        `;
    }
}

function getProfileLoadingMarkup() {
    return getProfileSkeletonMarkup();
}

function getProfileSkeletonMarkup() {
    const timelineItem = (key) => `
        <div class="profile-skeleton-item" data-index="${key}">
            <div class="skeleton skeleton-dot"></div>
            <div class="profile-skeleton-card">
                <div class="skeleton skeleton-text" style="width: 32%; height: 0.8rem;"></div>
                <div class="skeleton skeleton-text" style="width: 68%; height: 0.9rem;"></div>
                <div class="skeleton skeleton-card-sm"></div>
            </div>
        </div>
    `;

    return `
        <div class="loading-state-container profile-skeleton" role="status" aria-busy="true" aria-live="polite">
            <div class="skeleton skeleton-banner" aria-hidden="true"></div>

            <div class="profile-skeleton-header">
                <div class="skeleton skeleton-avatar-lg" aria-hidden="true"></div>
                <div class="profile-skeleton-meta">
                    <div class="skeleton skeleton-text" style="width: 50%; height: 1.1rem;"></div>
                    <div class="skeleton skeleton-text" style="width: 35%; height: 0.95rem;"></div>
                    <div class="profile-skeleton-actions">
                        <div class="skeleton skeleton-pill" aria-hidden="true"></div>
                        <div class="skeleton skeleton-pill" aria-hidden="true"></div>
                        <div class="skeleton skeleton-pill skeleton-pill-short" aria-hidden="true"></div>
                    </div>
                </div>
            </div>

            <div class="profile-skeleton-stats">
                <div class="skeleton skeleton-chip"></div>
                <div class="skeleton skeleton-chip"></div>
                <div class="skeleton skeleton-chip"></div>
            </div>

            <div class="profile-skeleton-timeline" aria-hidden="true">
                ${timelineItem(1)}
                ${timelineItem(2)}
                ${timelineItem(3)}
            </div>
        </div>
    `;
}

window.getProfileSkeletonMarkup = getProfileSkeletonMarkup;

// Weekly progress chart (simple client-side aggregation)
window.renderWeeklyProgressChart = async function (userId) {
    try {
        const canvas = document.getElementById(`weekly-progress-chart-${userId}`);
        if (!canvas || typeof Chart === "undefined") return;

        // Destroy existing chart instance if any
        if (!window._weeklyCharts) window._weeklyCharts = new Map();
        const existing = window._weeklyCharts.get(userId);
        if (existing) {
            existing.destroy();
            window._weeklyCharts.delete(userId);
        }

        const traces = getUserContentLocal(userId) || [];
        if (traces.length === 0) return;

        // Build last 7 day labels using created_at when available, else fallback to dayNumber
        const now = new Date();
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            days.push(key);
        }

        const counts = Object.fromEntries(days.map((d) => [d, 0]));
        traces.forEach((t) => {
            const raw = t.created_at || t.createdAt || null;
            let key = null;
            if (raw) {
                const d = new Date(raw);
                if (!isNaN(d)) key = d.toISOString().slice(0, 10);
            }
            if (!key && typeof t.dayNumber === "number") {
                // Map dayNumber to recent days: assume dayNumber 1 = today - (maxDay-1)
                const maxDay = Math.max(...traces.map((c) => c.dayNumber || 0));
                const offset = maxDay - t.dayNumber;
                const d = new Date(now);
                d.setDate(now.getDate() - offset);
                key = d.toISOString().slice(0, 10);
            }
            if (key && counts[key] !== undefined) counts[key] += 1;
        });

        const labels = days.map((d) => {
            const dt = new Date(d);
            if (!Number.isFinite(dt.getTime())) return "";
            try {
                return dt.toLocaleDateString(undefined, { weekday: "short" });
            } catch (e) {
                return "";
            }
        });
        const data = days.map((d) => counts[d]);

        const chart = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Traces / jour",
                        data,
                        backgroundColor: "rgba(255,255,255,0.2)",
                        borderColor: "rgba(255,255,255,0.6)",
                        borderWidth: 1.5,
                        borderRadius: 6,
                        hoverBackgroundColor: "rgba(255,255,255,0.35)",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        grid: { color: "rgba(255,255,255,0.05)" },
                    },
                    x: { grid: { display: false } },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.parsed.y || 0} trace(s)`,
                        },
                    },
                },
            },
        });

        window._weeklyCharts.set(userId, chart);
    } catch (error) {
        console.error("Weekly progress chart error:", error);
    }
};

/* ========================================
   NAVIGATION
   ======================================== */

function navigateTo(pageId) {
    // Vérifier si l'utilisateur essaie d'accéder à son profil sans être connecté
    if (pageId === "profile" && !currentUser && !window.currentProfileViewed) {
        window.location.href = "login.html";
        return;
    }

    if (pageId === "profile") {
        const profilePage = document.getElementById("profile");
        if (!profilePage) {
            const targetUserId =
                window.currentProfileViewed || window.currentUserId || null;
            window.location.href = buildProfileUrl(targetUserId);
            return;
        }
    }

    if (pageId === "discover") {
        const discoverPage = document.getElementById("discover");
        if (!discoverPage) {
            window.location.href = "index.html";
            return;
        }
    }

    if (pageId === "messages") {
        if (!currentUser) {
            window.location.href = "login.html";
            return;
        }
        const messagesPage = document.getElementById("messages");
        if (!messagesPage) {
            const url = new URL("index.html", window.location.href);
            url.searchParams.set("messages", "1");
            window.location.href = url.toString();
            return;
        }
    }

    const pages = document.querySelectorAll(".page");
    pages.forEach((p) => p.classList.remove("active"));
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add("active");
    }
    window.scrollTo(0, 0);
    document.body.classList.toggle("profile-open", pageId === "profile");
    handleLoginPromptContext();
}

// Make sure handleProfileNavigation is defined as an async function
async function handleProfileNavigation() {
    if (!window.currentUser) {
        // Rediriger vers la page de connexion
        window.location.href = "login.html";
        return;
    }

    const targetUserId = window.currentUserId || window.currentUser?.id;
    window.currentProfileViewed = targetUserId || null;

    if (!document.getElementById("profile")) {
        window.location.href = buildProfileUrl(targetUserId);
        return;
    }

    // Si connecté, naviguer vers le profil
    navigateTo("profile");

    // S'assurer que le profil est rendu avec l'utilisateur courant
    if (window.currentUserId) {
        await renderProfileIntoContainer(window.currentUserId);
    }
}

// Expose the function globally to ensure accessibility
window.handleProfileNavigation = handleProfileNavigation;

// Select ARC function
window.selectedArcId = null;
async function selectArc(arcId, userId) {
    window.selectedArcId = arcId;
    await renderProfileIntoContainer(userId);
}
window.selectArc = selectArc;

async function navigateToUserProfile(userId) {
    window.currentProfileViewed = userId;
    if (!document.getElementById("profile")) {
        window.location.href = buildProfileUrl(userId);
        return;
    }

    const profileContainer = document.querySelector(".profile-container");
    if (profileContainer) {
        profileContainer.innerHTML = getProfileLoadingMarkup();
        profileContainer.classList.remove("arc-view");
    }
    navigateTo("profile");
    await renderProfileIntoContainer(userId);
}

async function handleProfileClick(userId, triggerEl, fromImmersive = false) {
    if (!userId) return;

    if (triggerEl) {
        triggerEl.classList.add("click-loading", "click-loading-indicator");
    }

    if (
        fromImmersive &&
        document.getElementById("immersive-overlay")?.style.display === "block"
    ) {
        closeImmersive();
        await new Promise((resolve) => setTimeout(resolve, 60));
    }

    await navigateToUserProfile(userId);

    if (triggerEl && triggerEl.isConnected) {
        triggerEl.classList.remove("click-loading", "click-loading-indicator");
    }
}

/* ========================================
   UTILITAIRES UI
   ======================================== */

function toggleTimelineExpand(button) {
    const timelineLatest = button.closest(".timeline-latest");
    const timelineFull = timelineLatest.querySelector(".timeline-full");
    const toggleText = button.querySelector(".toggle-text");
    const isExpanded = !timelineFull.classList.contains("hidden");

    if (isExpanded) {
        timelineFull.classList.add("hidden");
        toggleText.textContent = "Afficher l'historique complet";
        button.classList.remove("expanded");
    } else {
        timelineFull.classList.remove("hidden");
        toggleText.textContent = "Masquer l'historique";
        button.classList.add("expanded");
    }
}

function toggleVideoPlay(video) {
    if (video.paused) {
        video.play().catch(() => {});
    } else {
        video.pause();
    }
}

function setupDiscoverVideoInteractions() {
    const videos = document.querySelectorAll("video.card-media");

    // Intersection Observer for Auto-play (shared to avoid stacking observers)
    if (!discoverVideoObserver) {
        const observerOptions = {
            root: null,
            rootMargin: "0px",
            threshold: 0.6, // Play when 60% visible
        };
        discoverVideoObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const video = entry.target;

                if (entry.isIntersecting) {
                    // Play if visible - keep muted for cards
                    video.muted = true;
                    video.play().catch(() => {
                        console.log("Autoplay blocked for card video");
                    });
                } else {
                    // Pause if not visible
                    video.pause();
                }
            });
        }, observerOptions);
    }

    videos.forEach((video) => {
        if (video.dataset.discoverVideoSetup === "1") return;
        video.dataset.discoverVideoSetup = "1";

        const wrap = video.closest(".card-media-wrap");
        // Initial setup - ensure muted for cards
        video.muted = true;
        video.playsInline = true;

        // Mark as ready when metadata is loaded
        const markReady = () => {
            if (wrap) wrap.classList.add("is-ready");
        };
        video.addEventListener("loadeddata", markReady, { once: true });
        video.addEventListener(
            "error",
            () => {
                if (wrap) wrap.classList.add("has-error");
            },
            { once: true },
        );

        // Start observing
        discoverVideoObserver.observe(video);

        // Autoplay on hover for discover cards
        video.addEventListener("mouseenter", function () {
            this.muted = true;
            this.play().catch(() => {});
        });
        video.addEventListener("mouseleave", function () {
            this.pause();
        });

        // Let clicks bubble to the card to open immersive
        video.addEventListener("click", function () {});
        video.addEventListener("touchstart", function () {});

        // Prevent default video controls from interfering
        video.addEventListener("contextmenu", (e) => e.preventDefault());

        // Force muted state on any volume change attempts
        video.addEventListener("volumechange", () => {
            if (!video.muted) {
                video.muted = true;
                console.log("Forced card video to stay muted");
            }
        });
    });
}

// Mood tracking - attention sensors (single observer for perf)
let discoverAttentionObserver = null;
const discoverAttentionTimers = new Map();

function clearDiscoverAttentionTimers() {
    discoverAttentionTimers.forEach((timer) => clearTimeout(timer));
    discoverAttentionTimers.clear();
}

function markContentAppreciated(el) {
    const contentId =
        el?.dataset?.contentId ||
        el?.closest(".user-card")?.dataset?.contentId ||
        null;
    if (!contentId) return;
    if (el.dataset.moodRecorded === "true") return;
    const content = findContentById(contentId);
    if (!content) return;
    el.dataset.moodRecorded = "true";
    adjustMoodScores(content.tags || [], 1.4);
}

function initDiscoverMoodTracking() {
    const discoverPage = document.getElementById("discover");
    if (!discoverPage || !discoverPage.classList.contains("active")) return;

    if (discoverAttentionObserver) {
        discoverAttentionObserver.disconnect();
        clearDiscoverAttentionTimers();
    }

    const options = {
        root: null,
        rootMargin: "0px 0px -30% 0px",
        threshold: 0.55,
    };

    discoverAttentionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const target = entry.target;
            const isVideo = target.tagName === "VIDEO";
            const delay = isVideo ? 10000 : 4000; // 10s video, 4s image

            if (entry.isIntersecting) {
                if (!discoverAttentionTimers.has(target)) {
                    const timer = setTimeout(() => {
                        markContentAppreciated(target);
                        discoverAttentionTimers.delete(target);
                    }, delay);
                    discoverAttentionTimers.set(target, timer);
                }
            } else {
                const timer = discoverAttentionTimers.get(target);
                if (timer) {
                    clearTimeout(timer);
                    discoverAttentionTimers.delete(target);
                }
            }
        });
    }, options);

    const targets = document.querySelectorAll(
        ".user-card video.card-media, .user-card img.card-media",
    );
    targets.forEach((el) => {
        if (!el.dataset.contentId) return;
        discoverAttentionObserver.observe(el);
    });
}

/* ========================================
   SYSTÈME DE THÈME
   ======================================== */

function initTheme() {
    const savedTheme = localStorage.getItem("rize-theme");
    if (savedTheme === "light") {
        document.documentElement.classList.add("light-mode");
    }
}

function toggleTheme() {
    const htmlElement = document.documentElement;
    htmlElement.classList.toggle("light-mode");

    if (htmlElement.classList.contains("light-mode")) {
        localStorage.setItem("rize-theme", "light");
    } else {
        localStorage.setItem("rize-theme", "dark");
    }
}

function isLightMode() {
    return document.documentElement.classList.contains("light-mode");
}

/* ========================================
   RÉGLAGES
   ======================================== */

function closeSettings() {
    const modal = document.getElementById("settings-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 300);
}

function ensureSettingsModal() {
    if (document.getElementById("settings-modal")) return;
    const modal = document.createElement("div");
    modal.id = "settings-modal";
    modal.innerHTML = `<div class="settings-container"></div>`;
    document.body.appendChild(modal);
}

async function openSettings(userId) {
    if (!currentUser || currentUser.id !== userId) return;
    ensureSettingsModal();

    const user = getUser(userId);
    const modal = document.getElementById("settings-modal");
    const container = modal.querySelector(".settings-container");

    const followerCount = await getFollowerCount(userId);
    const accountType = user.account_type || "personal";
    const accountRole = normalizeDiscoveryAccountRole(
        user.account_subtype ||
            user.accountSubtype ||
            user.user_metadata?.account_subtype ||
            "fan",
    );
    const isCreatorVerified = isVerifiedCreatorUserId(userId);
    const isStaffVerified = isVerifiedStaffUserId(userId);
    const isCreatorEligible = followerCount >= 1000;
    const pendingTypes = await fetchUserPendingRequests(userId);
    const creatorRequestPending = pendingTypes.has("creator");
    const staffRequestPending = pendingTypes.has("staff");
    const pendingRequests = isVerificationAdmin()
        ? await fetchVerificationRequests()
        : [];

    const verificationStatusHtml = isStaffVerified
        ? `<div class="verification-status verified">Entreprise vérifiée</div>`
        : isCreatorVerified
          ? `<div class="verification-status verified">Utilisateur vérifié</div>`
          : "";

    const verificationCtaHtml = `
        <div class="verification-status info">
            Les demandes se font désormais sur la page Vérification.
        </div>
        <button type="button" class="btn-verify" onclick="window.location.href='verification.html'">
            Obtenir une vérification
            <img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="Badge" style="width:18px;height:18px;margin-left:8px;">
        </button>
    `;

    const adminRequestsHtml = pendingRequests.length
        ? pendingRequests
              .map((req) => {
                  const reqUser =
                      getUser(req.userId) ||
                      (req.users
                          ? {
                                id: req.users.id,
                                name: req.users.name,
                                avatar: req.users.avatar,
                            }
                          : null);
                  const label =
                      req.type === "staff" ? "Équipe/Entreprise" : "Créateur";
                  const avatar = reqUser?.avatar || "https://placehold.co/40";
                  const name = reqUser?.name || "Utilisateur";
                  const nameHtml = renderUsernameWithBadge(name, req.userId);
                  return `
                <label class="verification-request-item">
                    <input type="checkbox" class="verification-request-check" data-user-id="${req.userId}" data-type="${req.type}">
                    <img src="${avatar}" alt="${name}">
                    <span class="verification-request-name">${nameHtml}</span>
                    <span class="verification-request-type">${label}</span>
                    <span class="verification-request-id">${req.userId}</span>
                </label>
            `;
              })
              .join("")
        : `<div class="verification-empty">Aucune demande en attente.</div>`;

    const verificationAdminHtml = isVerificationAdmin()
        ? `
        <div class="settings-section">
            <h3>Administration vérification</h3>
            <div class="verification-admin-block">
                <div class="verification-requests">
                    ${adminRequestsHtml}
                </div>
                <div class="verification-actions">
                    <button type="button" class="btn-verify" onclick="handleVerificationSelection('approve')">Valider la sélection</button>
                    <button type="button" class="btn-cancel" onclick="handleVerificationSelection('reject')">Refuser la sélection</button>
                </div>
            </div>

            <div class="verification-manual">
                <h4>Ajouter un créateur vérifié</h4>
                <div class="verification-input-row">
                    <input type="text" id="verify-creator-id" class="form-input" placeholder="ID utilisateur">
                    <button type="button" class="btn-verify" onclick="addVerifiedUserId('creator', document.getElementById('verify-creator-id').value)">Ajouter</button>
                </div>
            </div>

            <div class="verification-manual">
                <h4>Ajouter une équipe vérifiée</h4>
                <div class="verification-input-row">
                    <input type="text" id="verify-staff-id" class="form-input" placeholder="ID utilisateur">
                    <button type="button" class="btn-verify" onclick="addVerifiedUserId('staff', document.getElementById('verify-staff-id').value)">Ajouter</button>
                </div>
            </div>
        </div>
    `
        : "";

    const superAdminHtml = "";

    // Social links preparation
    const socialLinks = user.social_links || user.socialLinks || {};

    container.innerHTML = `
        <div class="settings-shell">
            <div class="settings-header" style="border:none; margin-bottom:1rem; padding-bottom:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 1rem; flex-wrap: wrap;">
                    <div style="display:flex; align-items:center; gap: 0.75rem;">
                        <h2>Réglages</h2>
                        ${isSuperAdmin() ? `<span class="admin-badge">Super admin</span>` : isVerificationAdmin() ? `<span class="admin-badge">Admin mode</span>` : ""}
                    </div>
                </div>
                <p>Gérez votre compte, votre profil et vos préférences.</p>
            </div>

            <form id="settings-form" novalidate class="settings-form-layout">
                <div class="settings-section">
                    <h3>Préférences de l'application</h3>
                    <div class="settings-preferences-grid">
                        <div class="form-group">
                            <label for="lang-select">Langue</label>
                            <select id="lang-select" class="lang-select">
                                <option value="en">English (US)</option>
                                <option value="fr">Français</option>
                            </select>
                            <div class="form-hint">La langue est aussi détectée automatiquement selon votre localisation.</div>
                        </div>
                        <div class="form-group">
                            <label>Thème</label>
                            <button type="button" class="btn-theme-toggle settings-theme-control" onclick="toggleTheme()">
                                ${isLightMode() ? "🌙 Mode Sombre" : "☀️ Mode Clair"}
                            </button>
                            <div class="form-hint">Choisissez l'affichage qui vous convient.</div>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Identité</h3>

            <div class="upload-section" style="display: flex; flex-direction: column; gap: 2rem; margin-bottom: 2rem;">
                <!-- Avatar Section -->
                <div style="display: flex; flex-direction: column; align-items: center;">
                    <label class="form-hint" style="margin-bottom:0.5rem; display:block;">Avatar</label>
                    <div style="position: relative; cursor: pointer;" onclick="document.getElementById('setting-avatar-file').click()">
                        <img src="${user.avatar && user.avatar.startsWith("http") ? user.avatar : "https://placehold.co/150"}" class="preview-avatar-circle" id="preview-avatar" alt="Avatar" style="object-fit: cover;">
                        <div style="position: absolute; bottom: 0; right: 0; background: #fff; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0,0,0,0.5);">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#000" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        </div>
                    </div>
                    <input type="file" id="setting-avatar-file" accept="image/*" style="display: none;">
                    <input type="hidden" id="setting-avatar" value="${user.avatar || ""}">
                    <p style="font-size: 0.8rem; color: #666; margin-top: 0.5rem;">Cliquez pour changer</p>
                </div>

                <!-- Banner Section -->
                <div>
                    <label class="form-hint" style="margin-bottom:0.5rem; display:block;">Bannière</label>
                    <div style="position: relative; cursor: pointer;" onclick="document.getElementById('setting-banner-file').click()">
                        <img src="${user.banner && user.banner.startsWith("http") ? user.banner : "https://placehold.co/1200x300/1a1a2e/00ff88?text=Ma+Trajectoire"}" class="preview-banner-rect" id="preview-banner" alt="Bannière" style="object-fit: cover;">
                        <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; border-radius: 14px;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
                            <span style="background: rgba(0,0,0,0.6); color: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem;">Changer la bannière</span>
                        </div>
                    </div>
                    <input type="file" id="setting-banner-file" accept="image/*" style="display: none;">
                    <input type="hidden" id="setting-banner" value="${user.banner || ""}">
                </div>
            </div>

                <div class="form-group">
                    <label>Nom d'affichage</label>
                    <input type="text" id="setting-name" class="form-input" value="${user.name}" required>
                </div>

                <div class="form-group">
                    <label>Titre / Rôle</label>
                    <input type="text" id="setting-title" class="form-input" value="${user.title}" required>
                </div>

                <div class="form-group">
                    <label>Bio</label>
                    <textarea id="setting-bio" class="form-input" rows="4">${user.bio || ""}</textarea>
                </div>
                </div>

                <div class="settings-section">
                    <h3>Type de compte</h3>
                    <p class="form-hint">Par défaut votre compte reste <strong>fan</strong>. Vous pouvez passer à recruteur ou investisseur à tout moment.</p>
                    <div class="account-type-toggle account-role-toggle">
                        <button type="button" class="account-type-btn account-role-btn ${accountRole === "fan" ? "active" : ""}" data-role="fan">Fan</button>
                        <button type="button" class="account-type-btn account-role-btn ${accountRole === "recruiter" ? "active" : ""}" data-role="recruiter">Recruteur</button>
                        <button type="button" class="account-type-btn account-role-btn ${accountRole === "investor" ? "active" : ""}" data-role="investor">Investisseur</button>
                    </div>
                    <input type="hidden" id="setting-account-role" value="${accountRole}">
                </div>

                <div class="settings-section">
                    <h3>Vérification</h3>
                    <div class="verification-section">
                        ${verificationStatusHtml}
                        ${verificationCtaHtml}
                    </div>
                </div>

                <details class="settings-collapsible" open>
                    <summary>Réseaux Sociaux</summary>
                    <div class="settings-collapsible-body">
                        <div class="form-group">
                            <div class="social-link-item">
                                <img src="icons/email.svg" alt="Email">
                                <input type="email" class="form-input" data-social="email" placeholder="email@exemple.com" value="${socialLinks.email || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/github.svg" alt="GitHub">
                                <input type="text" class="form-input" data-social="github" placeholder="github.com/username" value="${socialLinks.github || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/instagram.svg" alt="Instagram">
                                <input type="text" class="form-input" data-social="instagram" placeholder="instagram.com/username" value="${socialLinks.instagram || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/snapchat.svg" alt="Snapchat">
                                <input type="text" class="form-input" data-social="snapchat" placeholder="snapchat.com/username" value="${socialLinks.snapchat || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/twitter.svg" alt="X">
                                <input type="text" class="form-input" data-social="twitter" placeholder="x (twitter).com/username" value="${socialLinks.twitter || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/youtube.svg" alt="YouTube">
                                <input type="text" class="form-input" data-social="youtube" placeholder="https://youtube.com" value="${socialLinks.youtube || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/twitch.svg" alt="Twitch">
                                <input type="text" class="form-input" data-social="twitch" placeholder="twitch.com/username" value="${socialLinks.twitch || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/spotify.svg" alt="Spotify">
                                <input type="text" class="form-input" data-social="spotify" placeholder="spotify.com/username" value="${socialLinks.spotify || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/tiktok.svg" alt="TikTok">
                                <input type="text" class="form-input" data-social="tiktok" placeholder="tiktok.com/username" value="${socialLinks.tiktok || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/discord.svg" alt="Discord">
                                <input type="text" class="form-input" data-social="discord" placeholder="discord.com/username" value="${socialLinks.discord || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/reddit.svg" alt="Reddit">
                                <input type="text" class="form-input" data-social="reddit" placeholder="reddit.com/username" value="${socialLinks.reddit || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/pinterest.svg" alt="Pinterest">
                                <input type="text" class="form-input" data-social="pinterest" placeholder="pinterest.com/username" value="${socialLinks.pinterest || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/linkedin.svg" alt="LinkedIn">
                                <input type="text" class="form-input" data-social="linkedin" placeholder="linkedin.com/username" value="${socialLinks.linkedin || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/facebook.svg" alt="Facebook">
                                <input type="text" class="form-input" data-social="facebook" placeholder="facebook.com/username" value="${socialLinks.facebook || ""}">
                            </div>
                            <div class="social-link-item">
                                <img src="icons/link.svg" alt="Site">
                                <input type="text" class="form-input" data-social="site" placeholder="https://example.com" value="${socialLinks.site || ""}">
                            </div>
                        </div>
                    </div>
                </details>

                <div class="settings-section settings-danger-zone">
                    <h3>Session</h3>
                    <p>Déconnectez cet appareil si besoin.</p>
                    <button type="button" class="btn-signout-settings" onclick="handleSignOut()">
                        Se déconnecter
                    </button>

                    <div class="delete-account-box">
                        <h4>Supprimer mon compte</h4>
                        <p>Cette action est irréversible. Toutes vos données seront supprimées.</p>
                        <div class="delete-account-reasons">
                            <label class="delete-account-reason-item">
                                <input type="radio" name="delete-account-reason" value="inactive">
                                <span>Je n'utilise plus XERA</span>
                            </label>
                            <label class="delete-account-reason-item">
                                <input type="radio" name="delete-account-reason" value="technical">
                                <span>J'ai des problèmes techniques</span>
                            </label>
                            <label class="delete-account-reason-item">
                                <input type="radio" name="delete-account-reason" value="privacy">
                                <span>Confidentialité / sécurité</span>
                            </label>
                            <label class="delete-account-reason-item">
                                <input type="radio" name="delete-account-reason" value="experience">
                                <span>L'expérience ne me convient pas</span>
                            </label>
                            <label class="delete-account-reason-item">
                                <input type="radio" name="delete-account-reason" value="other">
                                <span>Autre</span>
                            </label>
                        </div>
                        <div class="delete-account-other-wrap" style="display:none;">
                            <label for="delete-account-other">Précisez la raison</label>
                            <textarea id="delete-account-other" class="form-input" rows="3" placeholder="Expliquez brièvement..." disabled></textarea>
                        </div>
                        <button type="button" class="btn-delete-account" onclick="requestAccountDeletion('${userId}')">
                            Supprimer définitivement mon compte
                        </button>
                    </div>
                </div>

                <div class="actions-bar">
                    <button type="button" class="btn-cancel" onclick="closeSettings()">Annuler</button>
                    <button type="submit" class="btn-save">Enregistrer</button>
                </div>
            </form>
            ${verificationAdminHtml}
        </div>
    `;

    modal.style.display = "block";
    // Force reflow
    modal.offsetHeight;
    modal.classList.add("active");

    if (window.refreshLanguageControl) {
        window.refreshLanguageControl();
    }

    container.dataset.accountRoleTouched = "0";
    const accountRoleButtons = container.querySelectorAll(".account-role-btn");
    accountRoleButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            accountRoleButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("setting-account-role").value =
                btn.dataset.role;
            container.dataset.accountRoleTouched = "1";
        });
    });

    const deleteReasonInputs = container.querySelectorAll(
        'input[name="delete-account-reason"]',
    );
    const deleteOtherWrap = container.querySelector(".delete-account-other-wrap");
    const deleteOtherInput = container.querySelector("#delete-account-other");
    const syncDeleteReasonVisibility = () => {
        const selected = container.querySelector(
            'input[name="delete-account-reason"]:checked',
        );
        const isOther = selected?.value === "other";
        if (deleteOtherWrap) {
            deleteOtherWrap.style.display = isOther ? "block" : "none";
        }
        if (deleteOtherInput) {
            deleteOtherInput.disabled = !isOther;
            if (!isOther) deleteOtherInput.value = "";
        }
    };
    deleteReasonInputs.forEach((input) =>
        input.addEventListener("change", syncDeleteReasonVisibility),
    );
    syncDeleteReasonVisibility();

    let pendingProfileMediaUploads = 0;
    const updateSaveButtonUploadState = () => {
        const btn = document.querySelector("#settings-form .btn-save");
        if (!btn) return;
        if (pendingProfileMediaUploads > 0) {
            btn.disabled = true;
            btn.textContent = "Upload image...";
        } else if (btn.textContent === "Upload image...") {
            btn.disabled = false;
            btn.textContent = "Enregistrer";
        }
    };

    // Handle form submission
    document
        .getElementById("settings-form")
        .addEventListener("submit", async (e) => {
            e.preventDefault();

            if (pendingProfileMediaUploads > 0) {
                alert(
                    "Un upload d'image est encore en cours. Attendez la fin puis réessayez.",
                );
                return;
            }

            const btnSave = e.target.querySelector(".btn-save");
            const originalText = btnSave.textContent;
            btnSave.disabled = true;
            btnSave.textContent = "Enregistrement...";

            const socialInputs = e.target.querySelectorAll("[data-social]");
            const newSocialLinks = {};
            socialInputs.forEach((input) => {
                if (input.value.trim()) {
                    newSocialLinks[input.dataset.social] = normalizeExternalUrl(
                        input.value,
                    );
                }
            });

            const isGifCandidate = (file) =>
                typeof isGifFile === "function"
                    ? isGifFile(file)
                    : file?.type === "image/gif" ||
                      String(file?.name || "")
                          .toLowerCase()
                          .endsWith(".gif");

            const uploadPendingProfileImage = async (
                inputId,
                hiddenId,
                label,
            ) => {
                const input = document.getElementById(inputId);
                const file = input?.files?.[0];
                if (!file) return;

                const isGif = isGifCandidate(file);
                if (isGif && !isCurrentUserVerified()) {
                    throw new Error(
                        "Vous devez être vérifié pour utiliser un GIF en profil.",
                    );
                }

                let fileToUpload = file;
                if (!isGif && typeof compressImage === "function") {
                    try {
                        fileToUpload = await compressImage(file);
                    } catch (err) {
                        console.warn(`Compression ${label} échouée:`, err);
                    }
                }

                btnSave.textContent = `Upload ${label}...`;
                const uploadResult = await uploadFile(fileToUpload, "profile");
                if (!uploadResult?.success || !uploadResult?.url) {
                    throw new Error(
                        uploadResult?.error ||
                            `Échec upload ${label.toLowerCase()}.`,
                    );
                }

                const hidden = document.getElementById(hiddenId);
                if (hidden) hidden.value = uploadResult.url;
                if (input) input.value = "";
            };

            try {
                // Fallback safety: si un fichier est encore présent au submit,
                // on l'upload avant la sauvegarde profil.
                await uploadPendingProfileImage(
                    "setting-avatar-file",
                    "setting-avatar",
                    "avatar",
                );
                await uploadPendingProfileImage(
                    "setting-banner-file",
                    "setting-banner",
                    "bannière",
                );
            } catch (uploadErr) {
                alert("Erreur upload: " + (uploadErr?.message || uploadErr));
                btnSave.disabled = false;
                btnSave.textContent = originalText;
                return;
            }

            btnSave.textContent = "Enregistrement...";

            const selectedRoleValue =
                document.getElementById("setting-account-role")?.value || "fan";
            const existingSubtypeRaw = String(
                user.account_subtype || user.accountSubtype || "",
            ).trim();
            const roleTouched = container.dataset.accountRoleTouched === "1";
            const shouldOverwriteSubtype =
                roleTouched ||
                !existingSubtypeRaw ||
                isManagedDiscoveryAccountRole(existingSubtypeRaw);
            const subtypeToSave = shouldOverwriteSubtype
                ? normalizeDiscoveryAccountRole(selectedRoleValue)
                : existingSubtypeRaw;

            const profileData = {
                name: document.getElementById("setting-name").value,
                title: document.getElementById("setting-title").value,
                bio: document.getElementById("setting-bio").value,
                avatar: document.getElementById("setting-avatar").value,
                banner: document.getElementById("setting-banner").value,
                socialLinks: newSocialLinks,
                account_type: accountType || "personal",
                account_subtype: subtypeToSave,
            };

            const okOnline = await ensureOnlineOrNotify();
            if (!okOnline) {
                btnSave.disabled = false;
                btnSave.textContent = originalText;
                return;
            }
            const sessionCheck = await ensureFreshSupabaseSession();
            if (!sessionCheck.ok) {
                console.warn("Session refresh failed", sessionCheck.error);
            }

            const result = await upsertUserProfile(userId, profileData);

            if (result.success) {
                const updatedAt = result.data?.updated_at || new Date().toISOString();
                try {
                    if (result.data?.avatar) {
                        result.data.avatar = withCacheBust(result.data.avatar, updatedAt);
                    }
                    if (result.data?.banner) {
                        result.data.banner = withCacheBust(result.data.banner, updatedAt);
                    }
                } catch (e) {
                    /* ignore */
                }

                // Update local state
                const userIndex = allUsers.findIndex((u) => u.id === userId);
                if (userIndex !== -1) {
                    // Merge new data
                    allUsers[userIndex] = {
                        ...allUsers[userIndex],
                        ...result.data,
                    };
                }

                // Keep current session user fresh (important for PWA cache-first flows)
                try {
                    if (window.currentUser && window.currentUser.id === userId) {
                        window.currentUser = {
                            ...window.currentUser,
                            ...result.data,
                        };
                        currentUser = window.currentUser;
                    }
                } catch (e) {
                    /* ignore */
                }

                // Persist users cache so the PWA doesn't keep stale data after restart
                try {
                    if (Array.isArray(allUsers) && allUsers.length > 0) {
                        localStorage.setItem(
                            XERA_CACHE_USERS_KEY,
                            JSON.stringify(allUsers),
                        );
                    }
                } catch (e) {
                    /* ignore */
                }

                // Also refresh derived discover cache if used
                try {
                    if (typeof persistDiscoverCache === "function") {
                        persistDiscoverCache();
                    }
                } catch (e) {
                    /* ignore */
                }

                // Reload profile view
                if (document.querySelector("#profile.active")) {
                    await renderProfileIntoContainer(userId);
                }

                // Refresh Discover cards (multiple cards can exist per user/arc)
                if (document.querySelector(".discover-grid")) {
                    await renderDiscoverGrid();
                }

                // Refresh discover React island if present
                try {
                    if (window.ReactIslands?.renderDiscover) {
                        window.ReactIslands.renderDiscover();
                    }
                } catch (e) {
                    /* ignore */
                }

                closeSettings();
            } else {
                alert("Erreur: " + result.error);
            }

            btnSave.disabled = false;
            btnSave.textContent = originalText;
        });

    // Initialize file uploads
    if (typeof initializeFileInput === "function") {
        // Avatar upload
        initializeFileInput("setting-avatar-file", {
            preview: "preview-avatar",
            compress: true,
            onBeforeUpload: () => {
                pendingProfileMediaUploads += 1;
                updateSaveButtonUploadState();
            },
            onAfterUpload: () => {
                pendingProfileMediaUploads = Math.max(
                    0,
                    pendingProfileMediaUploads - 1,
                );
                updateSaveButtonUploadState();
            },
            validate: (file) => {
                const isGif =
                    typeof isGifFile === "function"
                        ? isGifFile(file)
                        : file?.type === "image/gif" ||
                          String(file?.name || "")
                              .toLowerCase()
                              .endsWith(".gif");
                if (!isGif) return { valid: true };
                if (isCurrentUserVerified()) return { valid: true };
                return {
                    valid: false,
                    error: "Vous devez être vérifié pour utiliser un GIF en profil.",
                };
            },
            onUpload: (result) => {
                if (result.success) {
                    document.getElementById("setting-avatar").value =
                        result.url;
                } else {
                    alert("Erreur upload: " + result.error);
                }
            },
        });

        // Banner upload
        initializeFileInput("setting-banner-file", {
            preview: "preview-banner",
            compress: true,
            onBeforeUpload: () => {
                pendingProfileMediaUploads += 1;
                updateSaveButtonUploadState();
            },
            onAfterUpload: () => {
                pendingProfileMediaUploads = Math.max(
                    0,
                    pendingProfileMediaUploads - 1,
                );
                updateSaveButtonUploadState();
            },
            validate: (file) => {
                const isGif =
                    typeof isGifFile === "function"
                        ? isGifFile(file)
                        : file?.type === "image/gif" ||
                          String(file?.name || "")
                              .toLowerCase()
                              .endsWith(".gif");
                if (!isGif) return { valid: true };
                if (isCurrentUserVerified()) return { valid: true };
                return {
                    valid: false,
                    error: "Vous devez être vérifié pour utiliser un GIF en profil.",
                };
            },
            onUpload: (result) => {
                if (result.success) {
                    document.getElementById("setting-banner").value =
                        result.url;
                } else {
                    alert("Erreur upload: " + result.error);
                }
            },
        });
    }
}

/* ========================================
   LIVE STREAMING
   ======================================== */

let currentStream = null;
let screenStream = null;
let cameraStream = null;
let isLive = false;

// Polyfill pour roundRect si non supporté
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        this.beginPath();
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        this.closePath();
        return this;
    };
}

function launchLive(userId) {
    if (!window.currentUser) {
        if (window.ToastManager) {
            ToastManager.error(
            "Login required",
                "Vous devez être connecté pour lancer un live",
            );
        }
        return;
    }

    if (window.currentUser.id !== userId) {
        if (window.ToastManager) {
            ToastManager.error(
                "Erreur",
                "Vous ne pouvez lancer un live que pour votre propre profil",
            );
        }
        return;
    }

    // Redirection vers la page de création de stream
    if (window.ToastManager) {
        ToastManager.success(
            "Lancement Live",
            "Redirection vers la configuration du live...",
        );
    }

    setTimeout(() => {
        window.location.href = "create-stream.html";
    }, 500);
}

// Exposer les fonctions globalement pour les onclick
window.launchLive = launchLive;
window.createLiveModal = createLiveModal;
window.closeLiveModal = closeLiveModal;
window.toggleCamera = toggleCamera;
window.toggleScreenShare = toggleScreenShare;
window.setLayout = setLayout;
window.updateCameraSize = updateCameraSize;
window.updateCameraPosition = updateCameraPosition;
window.startLiveStream = startLiveStream;
window.stopLiveStream = stopLiveStream;

function createLiveModal() {
    const modal = document.createElement("div");
    modal.id = "live-modal";
    modal.className = "modal";
    modal.innerHTML = `
        <div class="modal-content live-modal-content">
            <div class="modal-header">
                <h2><img src="icons/live.svg" alt="Live" style="width:20px;height:20px;vertical-align:middle;margin-right:8px;filter:invert(0.2);"> Configuration Live Stream</h2>
                <button class="close-btn" onclick="closeLiveModal()">&times;</button>
            </div>
            <div class="live-controls">
                <div class="stream-preview">
                    <video id="live-preview" autoplay muted playsinline></video>
                    <div class="stream-status" id="stream-status">
                        <span class="status-indicator offline">● Hors ligne</span>
                    </div>
                </div>
                
                <div class="control-panel">
                    <div class="source-controls">
                        <h3>Sources de streaming</h3>
                        <div class="source-buttons">
                            <button class="source-btn" id="camera-btn" onclick="toggleCamera()">
                                📹 Caméra
                            </button>
                            <button class="source-btn" id="screen-btn" onclick="toggleScreenShare()">
                                🖥️ Écran
                            </button>
                        </div>
                    </div>
                    
                    <div class="layout-controls" id="layout-controls" style="display: none;">
                        <h3>Mise en page</h3>
                        <div class="layout-options">
                            <button class="layout-btn active" onclick="setLayout('single')">Simple</button>
                            <button class="layout-btn" onclick="setLayout('pip')">Incrustation</button>
                            <button class="layout-btn" onclick="setLayout('side')">Côte à côte</button>
                        </div>
                        
                        <div class="size-controls" id="size-controls">
                            <div class="size-control">
                                <label>Taille caméra (%)</label>
                                <input type="range" id="camera-size" min="20" max="80" value="30" onchange="updateCameraSize(this.value)">
                                <span id="camera-size-value">30%</span>
                            </div>
                            <div class="size-control">
                                <label>Position caméra</label>
                                <select id="camera-position" onchange="updateCameraPosition(this.value)">
                                    <option value="bottom-right">Bas droite</option>
                                    <option value="bottom-left">Bas gauche</option>
                                    <option value="top-right">Haut droite</option>
                                    <option value="top-left">Haut gauche</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="stream-actions">
                        <button class="btn-start-stream" id="start-stream-btn" onclick="startLiveStream()" disabled>
                            ▶️ Démarrer le live
                        </button>
                        <button class="btn-stop-stream" id="stop-stream-btn" onclick="stopLiveStream()" style="display: none;">
                            ⏹️ Arrêter le live
                        </button>
                    </div>
                    
                    <div class="stream-info">
                        <div class="info-item">
                            <label>Titre du live</label>
                            <input type="text" id="stream-title" placeholder="Mon super live stream!" maxlength="100">
                        </div>
                        <div class="info-item">
                            <label>Description</label>
                            <textarea id="stream-description" placeholder="Décrivez votre live..." maxlength="500"></textarea>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function closeLiveModal() {
    const modal = document.getElementById("live-modal");
    modal.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(() => {
        modal.style.display = "none";
        // Nettoyer les streams si en cours
        if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
            cameraStream = null;
        }
        if (screenStream) {
            screenStream.getTracks().forEach((track) => track.stop());
            screenStream = null;
        }
    }, 300);
}

async function toggleCamera() {
    const btn = document.getElementById("camera-btn");
    const preview = document.getElementById("live-preview");

    if (cameraStream) {
        // Arrêter la caméra
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
        btn.classList.remove("active");
        btn.textContent = "📹 Caméra";
        updatePreview();
    } else {
        // Démarrer la caméra
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: "user",
                },
                audio: true,
            });
            btn.classList.add("active");
            btn.textContent = "📹 Caméra (ON)";
            updatePreview();
            checkStreamReady();
        } catch (error) {
            console.error("Erreur caméra:", error);
            alert(
                "Impossible d'accéder à la caméra. Vérifiez les permissions.",
            );
        }
    }
}

async function toggleScreenShare() {
    const btn = document.getElementById("screen-btn");
    const preview = document.getElementById("live-preview");

    if (screenStream) {
        // Arrêter le partage d'écran
        screenStream.getTracks().forEach((track) => track.stop());
        screenStream = null;
        btn.classList.remove("active");
        btn.textContent = "🖥️ Écran";
        updatePreview();
    } else {
        // Démarrer le partage d'écran
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: true,
            });

            // Écouter l'arrêt du partage d'écran par l'utilisateur
            screenStream.getVideoTracks()[0].onended = () => {
                screenStream = null;
                btn.classList.remove("active");
                btn.textContent = "🖥️ Écran";
                updatePreview();
                checkStreamReady();
            };

            btn.classList.add("active");
            btn.textContent = "🖥️ Écran (ON)";
            updatePreview();
            checkStreamReady();
        } catch (error) {
            console.error("Erreur partage d'écran:", error);
            alert(
                "Impossible de partager l'écran. Opération annulée par l'utilisateur.",
            );
        }
    }
}

function updatePreview() {
    const preview = document.getElementById("live-preview");
    const layoutControls = document.getElementById("layout-controls");

    if (screenStream && cameraStream) {
        // Mode mixte - afficher les contrôles de layout
        layoutControls.style.display = "block";
        setLayout(
            document
                .querySelector(".layout-btn.active")
                ?.onclick?.toString()
                .match(/setLayout\('(.+)'\)/)?.[1] || "pip",
        );
    } else if (screenStream) {
        // Écran seulement
        preview.srcObject = screenStream;
        layoutControls.style.display = "none";
    } else if (cameraStream) {
        // Caméra seulement
        preview.srcObject = cameraStream;
        layoutControls.style.display = "none";
    } else {
        // Aucun stream
        preview.srcObject = null;
        layoutControls.style.display = "none";
    }
}

function setLayout(layout) {
    // Retirer la classe active de tous les boutons
    document
        .querySelectorAll(".layout-btn")
        .forEach((btn) => btn.classList.remove("active"));
    // Ajouter la classe active au bouton sélectionné
    event.target.classList.add("active");

    const preview = document.getElementById("live-preview");
    const sizeControls = document.getElementById("size-controls");

    if (!screenStream || !cameraStream) return;

    // Créer un canvas pour mixer les streams
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");

    const screenVideo = document.createElement("video");
    const cameraVideo = document.createElement("video");

    screenVideo.srcObject = screenStream;
    cameraVideo.srcObject = cameraStream;

    screenVideo.muted = true;
    cameraVideo.muted = true;

    Promise.all([
        new Promise((resolve) => (screenVideo.onloadedmetadata = resolve)),
        new Promise((resolve) => (cameraVideo.onloadedmetadata = resolve)),
    ]).then(() => {
        screenVideo.play();
        cameraVideo.play();

        function drawFrame() {
            if (layout === "single") {
                // Écran seulement
                ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
                sizeControls.style.display = "none";
            } else if (layout === "pip") {
                // Picture-in-picture
                const cameraSize = parseInt(
                    document.getElementById("camera-size").value,
                );
                const cameraWidth = (canvas.width * cameraSize) / 100;
                const cameraHeight = (cameraWidth * 9) / 16; // Ratio 16:9

                const position =
                    document.getElementById("camera-position").value;
                let x, y;

                switch (position) {
                    case "bottom-right":
                        x = canvas.width - cameraWidth - 20;
                        y = canvas.height - cameraHeight - 20;
                        break;
                    case "bottom-left":
                        x = 20;
                        y = canvas.height - cameraHeight - 20;
                        break;
                    case "top-right":
                        x = canvas.width - cameraWidth - 20;
                        y = 20;
                        break;
                    case "top-left":
                        x = 20;
                        y = 20;
                        break;
                }

                // Dessiner l'écran en arrière-plan
                ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

                // Dessiner la caméra par-dessus
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, y, cameraWidth, cameraHeight, 10);
                ctx.clip();
                ctx.drawImage(cameraVideo, x, y, cameraWidth, cameraHeight);
                ctx.restore();

                sizeControls.style.display = "block";
            } else if (layout === "side") {
                // Côte à côte
                const screenWidth = canvas.width * 0.7;
                const cameraWidth = canvas.width * 0.3;

                ctx.drawImage(screenVideo, 0, 0, screenWidth, canvas.height);
                ctx.drawImage(
                    cameraVideo,
                    screenWidth,
                    0,
                    cameraWidth,
                    canvas.height,
                );

                sizeControls.style.display = "none";
            }

            if (currentStream) {
                requestAnimationFrame(drawFrame);
            }
        }

        // Créer un stream à partir du canvas
        currentStream = canvas.captureStream(30);

        // Ajouter l'audio du stream principal (écran ou caméra)
        if (screenStream.getAudioTracks().length > 0) {
            currentStream.addTrack(screenStream.getAudioTracks()[0]);
        } else if (cameraStream.getAudioTracks().length > 0) {
            currentStream.addTrack(cameraStream.getAudioTracks()[0]);
        }

        preview.srcObject = currentStream;
        drawFrame();
    });
}

function updateCameraSize(value) {
    document.getElementById("camera-size-value").textContent = value + "%";
    if (
        currentStream &&
        document.querySelector(".layout-btn.active")?.textContent ===
            "Incrustation"
    ) {
        setLayout("pip");
    }
}

function updateCameraPosition(position) {
    if (
        currentStream &&
        document.querySelector(".layout-btn.active")?.textContent ===
            "Incrustation"
    ) {
        setLayout("pip");
    }
}

function checkStreamReady() {
    const startBtn = document.getElementById("start-stream-btn");
    startBtn.disabled = !(screenStream || cameraStream);
}

async function startLiveStream() {
    const title =
        document.getElementById("stream-title").value || "Live Stream";
    const description =
        document.getElementById("stream-description").value || "";

    if (!currentStream && !screenStream && !cameraStream) {
        alert("Veuillez sélectionner au moins une source (caméra ou écran)");
        return;
    }

    try {
        // Si pas de stream mixte, utiliser le stream principal
        if (!currentStream) {
            currentStream = screenStream || cameraStream;
        }

        // Mettre à jour l'interface
        isLive = true;
        document.getElementById("start-stream-btn").style.display = "none";
        document.getElementById("stop-stream-btn").style.display =
            "inline-block";
        document.getElementById("stream-status").innerHTML =
            '<span class="status-indicator live">● En direct</span>';

        // Créer une entrée de contenu live dans la base de données
        const liveResult = await createLiveContent(title, description);
        if (liveResult?.success && liveResult.data) {
            notifyFollowersOfLiveStart(liveResult.data, title).catch((e) =>
                console.warn("notifyFollowersOfLiveStart error", e),
            );
            alert("✅ Live démarré ! Votre stream est maintenant en direct.");
        } else {
            throw new Error(liveResult?.error || "Création live échouée");
        }
    } catch (error) {
        console.error("Erreur démarrage live:", error);
        alert("Erreur lors du démarrage du live: " + error.message);
    }
}

async function stopLiveStream() {
    try {
        // Arrêter tous les streams
        if (currentStream) {
            currentStream.getTracks().forEach((track) => track.stop());
            currentStream = null;
        }

        isLive = false;
        document.getElementById("start-stream-btn").style.display =
            "inline-block";
        document.getElementById("stop-stream-btn").style.display = "none";
        document.getElementById("stream-status").innerHTML =
            '<span class="status-indicator offline">● Hors ligne</span>';

        alert("⏹️ Live arrêté.");
    } catch (error) {
        console.error("Erreur arrêt live:", error);
        alert("Erreur lors de l'arrêt du live: " + error.message);
    }
}

async function getNextDayNumber(userId) {
    const contents = getUserContentLocal(userId);
    const dayNumbers = (contents || [])
        .map((item) =>
            Number.parseInt(item?.dayNumber ?? item?.day_number, 10),
        )
        .filter((day) => Number.isFinite(day) && day >= 0);
    const maxDay = dayNumbers.length > 0 ? Math.max(...dayNumbers) : 0;
    return maxDay + 1;
}

async function createLiveContent(title, description) {
    // Créer une entrée de contenu live
    const contentData = {
        userId: currentUser.id,
        type: "live",
        state: "success",
        title: title,
        description: description,
        mediaUrl: null, // Pour un live, pas d'URL statique
        dayNumber: await getNextDayNumber(currentUser.id),
    };

    try {
        const result = await createContent(contentData);
        console.log("Contenu live créé:", result);
        return result;
    } catch (error) {
        console.error("Erreur création contenu live:", error);
        return { success: false, error: error.message };
    }
}

// Naviguer vers le live actif d'un utilisateur (si disponible)
async function openLiveStreamForUser(userId, fallbackTitle = "Live") {
    try {
        if (!userId || typeof supabase === "undefined") return;
        const { data, error } = await supabase
            .from("streaming_sessions")
            .select("id, title, user_id, status")
            .eq("user_id", userId)
            .eq("status", "live")
            .order("started_at", { ascending: false })
            .limit(1)
            .single();
        if (error || !data) {
            ToastManager?.info("Live indisponible", "Aucun live actif trouvé.");
            const safeTitle = encodeURIComponent(
                (fallbackTitle || "Live").trim(),
            );
            window.location.href = `stream.html?host=${userId}&title=${safeTitle}&live=1`;
            return;
        }
        const liveTitle = encodeURIComponent(
            (data.title || fallbackTitle || "Live").trim(),
        );
        window.location.href = `stream.html?id=${data.id}&host=${data.user_id}&title=${liveTitle}`;
    } catch (e) {
        console.error("openLiveStreamForUser error", e);
        ToastManager?.error("Impossible d'ouvrir le live", e.message || "");
    }
}
window.openLiveStreamForUser = openLiveStreamForUser;

function openLiveStreamById(streamId, hostId = null, fallbackTitle = "Live") {
    if (!streamId) {
        if (hostId) {
            openLiveStreamForUser(hostId, fallbackTitle);
        }
        return;
    }
    const title = encodeURIComponent((fallbackTitle || "Live").trim());
    const hostPart = hostId ? `&host=${hostId}` : "";
    window.location.href = `stream.html?id=${streamId}${hostPart}&title=${title}`;
}
window.openLiveStreamById = openLiveStreamById;

/* ========================================
   CRÉATION DE CONTENU
   ======================================== */

function closeCreateMenu() {
    const modal = document.getElementById("create-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 300);
}

async function openCreateMenu(
    userId,
    preSelectedArcId = null,
    existingContent = null,
) {
    if (!currentUser || currentUser.id !== userId) return;
    const profile = getCurrentUserProfile();
    if (isUserBanned(profile)) {
        const remaining = getBanRemainingLabel(profile);
        const reason = profile?.banned_reason
            ? `Raison: ${profile.banned_reason}`
            : "";
        alert(
            `Votre compte est temporairement banni. ${remaining ? `Fin dans ${remaining}.` : ""} ${reason}`.trim(),
        );
        return;
    }

    // Get user ARCs for selection
    let arcs = [];
    try {
        const { data: ownedArcs } = await supabase
            .from("arcs")
            .select("id, title, user_id")
            .eq("user_id", userId)
            .eq("status", "in_progress");
        let collabArcs = [];
        try {
            const { data: collabRows } = await supabase
                .from("arc_collaborations")
                .select("arc_id")
                .eq("collaborator_id", userId)
                .eq("status", "accepted");
            const collabArcIds = Array.from(
                new Set(
                    (collabRows || []).map((r) => r.arc_id).filter(Boolean),
                ),
            );
            if (collabArcIds.length > 0) {
                const { data: collabData } = await supabase
                    .from("arcs")
                    .select("id, title, user_id")
                    .in("id", collabArcIds)
                    .eq("status", "in_progress");
                collabArcs = collabData || [];
            }
        } catch (e) {
            console.error(
                "Error fetching collaborative arcs for create menu",
                e,
            );
        }

        const arcMap = new Map();
        (ownedArcs || []).forEach((arc) =>
            arcMap.set(arc.id, { ...arc, _collabRole: "owner" }),
        );
        (collabArcs || []).forEach((arc) => {
            if (!arcMap.has(arc.id))
                arcMap.set(arc.id, { ...arc, _collabRole: "collaborator" });
        });
        arcs = Array.from(arcMap.values());
    } catch (e) {
        console.error("Error fetching arcs for create menu", e);
    }

    // BLOCKAGE: Si l'utilisateur n'a pas d'ARC en cours, le forcer à en créer un
    if (arcs.length === 0 && !existingContent) {
        if (
            confirm(
                "Vous devez créer un ARC avant de pouvoir poster une trace. Voulez-vous créer votre premier ARC maintenant ?",
            )
        ) {
            setPendingCreatePostAfterArc(userId, { reason: "arc-required" });
            closeCreateMenu();
            if (window.openCreateModal) {
                window.openCreateModal();
            } else {
                alert(
                    "Erreur: Impossible d'ouvrir la fenêtre de création d'ARC.",
                );
            }
        }
        return;
    }

    const modal = document.getElementById("create-modal");
    const container = modal.querySelector(".create-container");

    // Calculate next day ou utiliser jour existant si édition
    const contents = getUserContentLocal(userId);
    const getNumericDay = (item) =>
        Number.parseInt(item?.dayNumber ?? item?.day_number, 10);
    const dayNumbers = (contents || [])
        .map(getNumericDay)
        .filter((day) => Number.isFinite(day) && day >= 0);
    const maxDay = dayNumbers.length > 0 ? Math.max(...dayNumbers) : 0;
    const existingDay = existingContent ? getNumericDay(existingContent) : Number.NaN;
    const nextDay =
        Number.isFinite(existingDay) && existingDay >= 0
            ? existingDay
            : maxDay + 1;
    const isFirstPost = !existingContent && (!contents || contents.length === 0);
    const defaultTraceType = isFirstPost ? "text" : "image";

    // Generate ARC Options (Mandatory)
    let arcOptions = "";
    // Si on édite une trace existante qui n'a pas d'arc (legacy), on laisse l'option vide ou on force ?
    // Le user veut "chaque trace publiée doit faire partie d'un arc".
    // On va forcer la sélection.

    arcOptions = arcs
        .map((a) => {
            const selected =
                (preSelectedArcId && a.id === preSelectedArcId) ||
                (existingContent &&
                    (existingContent.arcId === a.id ||
                        existingContent.arc_id === a.id))
                    ? "selected"
                    : "";
            const label =
                a._collabRole === "collaborator"
                    ? `${a.title} · collaboration`
                    : a.title;
            return `<option value="${a.id}" ${selected}>${label}</option>`;
        })
        .join("");

    const isEdit = !!existingContent;
    const title = isEdit ? "Modifier la Trace" : "Nouvelle Trace";
    const subtitle = isEdit
        ? `Modifier la trace du jour ${nextDay}`
        : `Trace = mise à jour rapide (texte + photo optionnelle). Annonce = étape majeure partagée publiquement.`;

    const existingRawDesc =
        (existingContent && (existingContent.rawDescription || existingContent.description)) ||
        "";
    const { tags: existingTags, cleanDescription: existingCleanDesc } =
        extractTagsFromDescription(existingRawDesc);
    const tagsPrefill =
        existingTags.length > 0 ? existingTags.map((t) => `#${t}`).join(" ") : "";
    const isAnnouncementEdit =
        existingTags && existingTags.includes("annonce") ? true : false;
    let currentMode = isAnnouncementEdit ? "announcement" : "trace";

    container.innerHTML = `
        <div class="settings-section">
            <button type="button" class="create-close" onclick="closeCreateMenu()">✕</button>
            <div class="settings-header" style="border:none; margin-bottom:1rem; padding-bottom:0;">
                <h2>${title}</h2>
                <p>${subtitle}</p>
            </div>

            <form id="create-form">
                ${isEdit ? `<input type="hidden" id="content-id" value="${existingContent.contentId || existingContent.id}">` : ""}
                <div class="form-group">
                    <label>Mode de publication</label>
                    <div class="mode-switch">
                        <button type="button" class="${isAnnouncementEdit ? "" : "active"}" data-mode="trace">Trace</button>
                        <button type="button" class="${isAnnouncementEdit ? "active" : ""}" data-mode="announcement">Annonce</button>
                    </div>
                    <p class="form-hint">Trace : mise à jour rapide (texte + photo optionnelle). Annonce : étape majeure partagée publiquement.</p>
                </div>
                
                <div class="form-group form-group-day">
                    <label>Jour #</label>
                    <input type="number" id="create-day" class="form-input" value="${nextDay}" required>
                </div>

                <div class="form-group form-group-title">
                    <label>Titre de l'accomplissement</label>
                    <input type="text" id="create-title" class="form-input" placeholder="Ex: Intégration de l'API terminée" value="${isEdit ? existingContent.title : ""}" required>
                </div>

                <div class="form-group form-group-desc">
                    <label>Description</label>
                    <textarea id="create-desc" class="form-input" rows="4" placeholder="Détaillez ce que vous avez fait, appris ou surmonté...">${isEdit ? existingCleanDesc : ""}</textarea>
                </div>

                <div class="form-group form-group-tags">
                    <label>Hashtags (séparés par espaces ou virgules)</label>
                    <input type="text" id="create-tags" class="form-input" placeholder="#build #vlog #code" value="${tagsPrefill}">
                    <p class="form-hint">Servez-vous de 3 à 8 tags max pour personnaliser le feed.</p>
                </div>

                <div class="form-group form-group-state">
                    <label>État</label>
                    <select id="create-state" class="form-input">
                        <option value="success" ${isEdit && existingContent.state === "success" ? "selected" : ""}>Victoire (Vert)</option>
                        <option value="failure" ${isEdit && existingContent.state === "failure" ? "selected" : ""}>Bloqué / Échec (Rouge)</option>
                        <option value="pause" ${isEdit && existingContent.state === "pause" ? "selected" : ""}>Pause / Réflexion (Violet)</option>
                    </select>
                </div>

                <div class="form-group form-group-arc">
                    <label>ARC (Requis)</label>
                    <select id="create-arc" class="form-input" required>
                        <option value="" disabled ${!isEdit && !preSelectedArcId ? "selected" : ""}>Choisir un ARC...</option>
                        ${arcOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label>Type de publication</label>
                    <select id="create-type" class="form-input">
                        <option value="text" ${isEdit && existingContent.type === "text" ? "selected" : !isEdit && defaultTraceType === "text" ? "selected" : ""}>Texte</option>
                        <option value="image" ${isEdit && existingContent.type === "image" ? "selected" : !isEdit && defaultTraceType === "image" ? "selected" : ""}>Image</option>
                        <option value="video" ${isEdit && existingContent.type === "video" ? "selected" : ""}>Vidéo</option>
                        <option value="live" ${isEdit && existingContent.type === "live" ? "selected" : ""}>Live / Stream</option>
                    </select>
                    <div class="type-quick">
                        <button type="button" data-type="text">Texte</button>
                        <button type="button" data-type="image">Image</button>
                        <button type="button" data-type="video">Vidéo</button>
                        <button type="button" data-type="live">Live</button>
                    </div>
                </div>

                <div class="form-group">
                    <label>Média</label>
                    
                    <!-- Upload Zone for Image/Video -->
	                    <div id="media-upload-container">
	                        <div class="upload-zone" id="create-media-dropzone" style="border: 2px dashed var(--border-color); padding: 2rem; border-radius: 12px; text-align: center; cursor: pointer; transition: all 0.3s ease; background: rgba(255,255,255,0.02);">
	                            <div id="create-media-preview-container" style="display: none; margin-bottom: 1rem;">
	                                <!-- Preview will be inserted here -->
	                            </div>
	                            <div id="create-media-loader" style="display: none; margin-bottom: 1rem;">
	                                <div style="display: inline-block; width: 24px; height: 24px; border: 2px solid var(--accent-color); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
	                                <p style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">Upload en cours...</p>
	                                <div class="xera-upload-progress">
	                                    <div id="create-media-progress-bar" class="xera-upload-progress-bar is-indeterminate"></div>
	                                </div>
	                                <div id="create-media-progress-label" class="xera-upload-progress-label"></div>
	                            </div>
	                            <div id="create-media-placeholder">
	                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-secondary); margin-bottom: 0.5rem;">
	                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
	                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                <p style="color: var(--text-secondary); font-size: 0.9rem;">Cliquez ou glissez un fichier ici</p>
                                <p style="color: var(--text-secondary); font-size: 0.75rem; opacity: 0.7;">JPG, PNG, GIF, MP4</p>
                            </div>
                        </div>
                        <input type="file" id="create-media-file" accept="image/*,video/*" style="display: none;">
                    </div>

                    <!-- URL Input for Live -->
                    <div id="media-url-container" style="display: none;">
                        <input type="text" id="create-live-url" class="form-input" placeholder="Lien du Live (ex: Twitch, YouTube...)" style="margin-bottom: 0.5rem;">
                        <p class="form-hint">Le lien sera affiché comme une trace active.</p>
                    </div>

                    <input type="hidden" id="create-media-url" value="${isEdit && (existingContent.media_url || existingContent.mediaUrl) ? existingContent.media_url || existingContent.mediaUrl : ""}">
                    <input type="hidden" id="create-media-urls" value="">
                    <input type="hidden" id="create-media-type" value="${isEdit && existingContent.type ? existingContent.type : defaultTraceType}">
                </div>

                <div class="actions-bar">
                    <button type="button" class="btn-cancel" onclick="closeCreateMenu()">Annuler</button>
                    <button type="submit" class="btn-save">${isEdit ? "Mettre à jour" : "Publier la trace"}</button>
                </div>
            </form>
        </div>
    `;

    modal.style.display = "block";
    // Force reflow
    modal.offsetHeight;
    modal.classList.add("active");

    // Select elements globally for this function scope
    const previewContainer = document.getElementById(
        "create-media-preview-container",
    );
    const placeholder = document.getElementById("create-media-placeholder");
    const uploadContainer = document.getElementById("media-upload-container");
    const urlContainer = document.getElementById("media-url-container");
    const liveInput = document.getElementById("create-live-url");
    const fileInput = document.getElementById("create-media-file");
    const mediaUrlsInput = document.getElementById("create-media-urls");
	    const dayGroup = container.querySelector(".form-group-day");
	    const stateGroup = container.querySelector(".form-group-state");
	    const arcGroup = container.querySelector(".form-group-arc");
	    const descGroup = container.querySelector(".form-group-desc");
	    const tagsGroup = container.querySelector(".form-group-tags");
	    let isMediaUploadInProgress = false;
	    let mediaUploadUiArmed = false;

    // Initialize file upload
    if (typeof initializeFileInput === "function") {
        const typeSelect = document.getElementById("create-type");
        const mediaUrlInput = document.getElementById("create-media-url");
        const mediaTypeInput = document.getElementById("create-media-type");

	        const dropZone = document.getElementById("create-media-dropzone");
	        const loader = document.getElementById("create-media-loader");
	        const progressBar = document.getElementById("create-media-progress-bar");
	        const progressLabel = document.getElementById(
	            "create-media-progress-label",
	        );

	        const setUploadProgressIndeterminate = () => {
	            if (progressBar) {
	                progressBar.classList.add("is-indeterminate");
	                progressBar.style.width = "";
	            }
	            if (progressLabel) progressLabel.textContent = "";
	        };

	        const setUploadProgress = (percent) => {
	            if (!progressBar) return;
	            const safePercent =
	                typeof percent === "number" && Number.isFinite(percent)
	                    ? Math.max(0, Math.min(100, Math.round(percent)))
	                    : 0;
	            progressBar.classList.remove("is-indeterminate");
	            progressBar.style.width = `${safePercent}%`;
	            if (progressLabel) progressLabel.textContent = `${safePercent}%`;
	        };

        const typeButtons = Array.from(
            container.querySelectorAll(".type-quick button"),
        );
        const modeButtons = Array.from(
            container.querySelectorAll(".mode-switch button"),
        );
        const syncTypeButtons = (value) => {
            typeButtons.forEach((btn) =>
                btn.classList.toggle(
                    "active",
                    btn.dataset.type === value,
                ),
            );
        };
        const syncModeButtons = (value) => {
            modeButtons.forEach((btn) =>
                btn.classList.toggle("active", btn.dataset.mode === value),
            );
        };

        const applyMode = (mode) => {
            currentMode = mode;
            syncModeButtons(mode);
            if (mode === "announcement") {
                typeSelect.value = "text";
                typeSelect.disabled = true;
                mediaTypeInput.value = "text";
                fileInput.accept = "image/*";
                fileInput.multiple = true;
                uploadContainer.style.display = "block";
                urlContainer.style.display = "none";
                if (dayGroup) {
                    dayGroup.style.display = "none";
                    const dayInput = dayGroup.querySelector("input");
                    if (dayInput) dayInput.required = false;
                }
                if (stateGroup) {
                    stateGroup.style.display = "none";
                    const stateSelect = stateGroup.querySelector("select");
                    if (stateSelect) stateSelect.required = false;
                }
                if (arcGroup) {
                    arcGroup.style.display = "none";
                    const arcSelect = arcGroup.querySelector("select");
                    if (arcSelect) arcSelect.required = false;
                }
                if (tagsGroup) tagsGroup.style.display = "none";
                if (descGroup) {
                    descGroup.style.display = "none";
                    const descTextarea = descGroup.querySelector("textarea");
                    if (descTextarea) descTextarea.required = false;
                }
            } else {
                typeSelect.disabled = false;
                fileInput.multiple = false;
                if (dayGroup) {
                    dayGroup.style.display = "";
                    const dayInput = dayGroup.querySelector("input");
                    if (dayInput) dayInput.required = true;
                }
                if (stateGroup) {
                    stateGroup.style.display = "";
                    const stateSelect = stateGroup.querySelector("select");
                    if (stateSelect) stateSelect.required = true;
                }
                if (arcGroup) {
                    arcGroup.style.display = "";
                    const arcSelect = arcGroup.querySelector("select");
                    if (arcSelect) arcSelect.required = true;
                }
                if (tagsGroup) tagsGroup.style.display = "";
                if (descGroup) {
                    descGroup.style.display = "";
                    const descTextarea = descGroup.querySelector("textarea");
                    if (descTextarea) descTextarea.required = true;
                }
            }
            typeSelect.dispatchEvent(new Event("change"));
        };

        modeButtons.forEach((btn) =>
            btn.addEventListener("click", () => applyMode(btn.dataset.mode)),
        );

        // Toggle logic
        typeSelect.addEventListener("change", () => {
            const type = typeSelect.value;
            mediaTypeInput.value = type;
            syncTypeButtons(type);

            if (type === "live") {
                uploadContainer.style.display = "none";
                urlContainer.style.display = "block";
                mediaUrlInput.value = liveInput.value;
            } else if (type === "text") {
                uploadContainer.style.display = "block";
                urlContainer.style.display = "none";
                fileInput.accept = "image/*";
                fileInput.multiple = currentMode === "announcement";
                mediaTypeInput.value = "text";
                if (placeholder) placeholder.style.display = "block";
            } else {
                uploadContainer.style.display = "block";
                urlContainer.style.display = "none";
                if (type === "image") {
                    fileInput.accept = "image/*";
                    fileInput.multiple = true;
                } else if (type === "video") {
                    fileInput.accept = "video/*";
                    fileInput.multiple = false;
                }
            }
        });
        typeButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const t = btn.dataset.type;
                typeSelect.value = t;
                typeSelect.dispatchEvent(new Event("change"));
            });
        });
        // initial sync
        syncTypeButtons(typeSelect.value);
        syncModeButtons(currentMode);
        if (currentMode === "announcement") {
            applyMode("announcement");
        } else {
            // Appliquer immédiatement le bon mode de sélection (single/multiple)
            // selon le type courant, sans attendre une action utilisateur.
            typeSelect.dispatchEvent(new Event("change"));
        }

        // Live URL handler
        liveInput.addEventListener("input", () => {
            if (typeSelect.value === "live") {
                mediaUrlInput.value = liveInput.value;
            }
        });

        // Handle click on dropzone (prevent double click if clicking preview)
        dropZone.addEventListener("click", (e) => {
            if (e.target.tagName !== "IMG" && e.target.tagName !== "VIDEO") {
                fileInput.click();
            }
        });

        // Add spinning animation style if not exists
        if (!document.getElementById("spin-style")) {
            const style = document.createElement("style");
            style.id = "spin-style";
            style.innerHTML =
                "@keyframes spin { to { transform: rotate(360deg); } }";
            document.head.appendChild(style);
        }

	        // Custom handler to show loader
	        fileInput.addEventListener("change", () => {
	            if (fileInput.files.length > 0) {
	                isMediaUploadInProgress = true;
	                mediaUploadUiArmed = true;
	                placeholder.style.display = "none";
	                previewContainer.style.display = "none";
	                loader.style.display = "block";
	                setUploadProgressIndeterminate();
	            }
	        });

	        const updateMultiPreview = (urls = []) => {
            const clean = (urls || []).filter(Boolean);
            if (clean.length === 0) {
                previewContainer.style.display = "none";
                return;
            }
            const slides = clean
                .map(
                    (u) =>
                        `<div class="xera-carousel-slide"><img src="${u}" alt="Media" loading="lazy" decoding="async"></div>`,
                )
                .join("");
            const dots =
                clean.length > 1
                    ? `<div class="xera-carousel-dots">${clean
                          .map(
                              (_, i) =>
                                  `<span class="xera-dot ${i === 0 ? "active" : ""}" data-index="${i}"></span>`,
                          )
                          .join("")}</div>`
                    : "";
            previewContainer.innerHTML = `
                <div class="xera-carousel" data-carousel>
                    <div class="xera-carousel-track">${slides}</div>
                    ${dots}
                </div>
            `;
        };

	        initializeFileInput("create-media-file", {
	            dropZone: dropZone,
	            compress: true,
	            multiple: () => !!fileInput.multiple,
	            onBeforeUpload: () => {
	                isMediaUploadInProgress = true;
	                if (!mediaUploadUiArmed) {
	                    mediaUploadUiArmed = true;
	                    placeholder.style.display = "none";
	                    previewContainer.style.display = "none";
	                    loader.style.display = "block";
	                    setUploadProgressIndeterminate();
	                }
	            },
	            onProgress: (percent) => setUploadProgress(percent),
	            onUpload: (result) => {
	                if (!result?.success) {
	                    alert("Erreur upload: " + (result?.error || "inconnue"));
	                }
	            },
	            onUploadBatch: (results) => {
	                isMediaUploadInProgress = false;
	                mediaUploadUiArmed = false;
	                loader.style.display = "none";
	                setUploadProgressIndeterminate();
	                const successful = (results || []).filter(
	                    (r) => r && r.success && r.url,
	                );
	                const successUrls = successful.map((r) => r.url);

                if (successUrls.length === 0) {
                    placeholder.style.display = "block";
                    previewContainer.style.display = "none";
                    mediaUrlsInput.value = "";
                    return;
                }

                // Keep backward compatibility: first URL in create-media-url
                document.getElementById("create-media-url").value = successUrls[0];
                document.getElementById("create-media-type").value =
                    successful[0]?.type || mediaTypeInput.value;
                mediaUrlsInput.value = JSON.stringify(successUrls);
                previewContainer.style.display = "block";
                placeholder.style.display = "none";

                if (successful[0]?.type === "video") {
                    previewContainer.innerHTML = `<video src="${successUrls[0]}" controls style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"></video>`;
                    return;
                }

                if (successUrls.length > 1) {
                    updateMultiPreview(successUrls);
                    try {
                        initXeraCarousels(previewContainer);
                    } catch (e) {
                        /* ignore */
                    }
                    return;
                }

                previewContainer.innerHTML = `<img src="${successUrls[0]}" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">`;
            },
        });
    }

    // Préremplir les champs existants si édition
    if (isEdit && existingContent) {
        const mediaUrl = existingContent.media_url || existingContent.mediaUrl;
        const existingMediaUrls = Array.isArray(existingContent.mediaUrls)
            ? existingContent.mediaUrls.filter(Boolean)
            : mediaUrl
              ? [mediaUrl]
              : [];
        if (existingContent.type === "text") {
            uploadContainer.style.display = "block";
            urlContainer.style.display = "none";
            if (mediaUrl) {
                placeholder.style.display = "none";
                previewContainer.style.display = "block";
                if (existingMediaUrls.length > 1) {
                    mediaUrlsInput.value = JSON.stringify(existingMediaUrls);
                    updateMultiPreview(existingMediaUrls);
                    try {
                        initXeraCarousels(previewContainer);
                    } catch (e) {
                        /* ignore */
                    }
                } else {
                    previewContainer.innerHTML = `<img src="${mediaUrl}" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">`;
                }
            }
        } else if (existingContent.type === "image") {
            uploadContainer.style.display = "block";
            urlContainer.style.display = "none";
            fileInput.accept = "image/*";
            fileInput.multiple = true;
            if (mediaUrl) {
                placeholder.style.display = "none";
                previewContainer.style.display = "block";
                if (existingMediaUrls.length > 1) {
                    mediaUrlsInput.value = JSON.stringify(existingMediaUrls);
                    updateMultiPreview(existingMediaUrls);
                    try {
                        initXeraCarousels(previewContainer);
                    } catch (e) {
                        /* ignore */
                    }
                } else {
                    previewContainer.innerHTML = `<img src="${mediaUrl}" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">`;
                }
            }
        } else if (existingContent.type === "video") {
            uploadContainer.style.display = "block";
            urlContainer.style.display = "none";
            fileInput.accept = "video/*";
            fileInput.multiple = false;
            if (mediaUrl) {
                placeholder.style.display = "none";
                previewContainer.style.display = "block";
                previewContainer.innerHTML = `<video src="${mediaUrl}" controls style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"></video>`;
            }
        } else if (existingContent.type === "live") {
            uploadContainer.style.display = "none";
            urlContainer.style.display = "block";
            liveInput.value = mediaUrl;
        }
    }

    // Handle form submission
    document
        .getElementById("create-form")
        .addEventListener("submit", async (e) => {
            e.preventDefault();
            if (isMediaUploadInProgress) {
                alert(
                    "Upload en cours. Attendez la fin de l'upload avant de publier.",
                );
                return;
            }

            const okOnline = await ensureOnlineOrNotify();
            if (!okOnline) return;
            const sessionCheck = await ensureFreshSupabaseSession();
            if (!sessionCheck.ok) {
                console.warn("Session refresh failed", sessionCheck.error);
            }

            let mediaUrl = document.getElementById("create-media-url").value;
            const mediaUrlsRaw = document.getElementById("create-media-urls")?.value || "";
            let mediaUrls = [];
            try {
                const parsed = mediaUrlsRaw ? JSON.parse(mediaUrlsRaw) : [];
                if (Array.isArray(parsed)) mediaUrls = parsed.filter(Boolean);
            } catch (err) {
                mediaUrls = [];
            }
            if (!mediaUrl && mediaUrls.length > 0) {
                mediaUrl = mediaUrls[0];
            }
            if (mediaUrls.length === 0 && mediaUrl) {
                mediaUrls = [mediaUrl];
            }
            const selectedType =
                document.getElementById("create-media-type").value ||
                document.getElementById("create-type").value;
            if (selectedType !== "text" && !mediaUrl) {
                alert("Ajoutez un média ou sélectionnez \"Post texte\".");
                return;
            }

            const tagsInput = document.getElementById("create-tags").value;
            let parsedTags = parseTagsInput(tagsInput);
            if (currentMode === "announcement" && !parsedTags.includes("annonce")) {
                parsedTags = ["annonce", ...parsedTags];
            }
            const baseDescription =
                currentMode === "announcement"
                    ? document.getElementById("create-desc").value || ""
                    : document.getElementById("create-desc").value;
            const descriptionWithTags = encodeDescriptionWithTags(
                baseDescription,
                parsedTags,
            );

            const btnSave = e.target.querySelector(".btn-save");
            const originalText = btnSave.textContent;
            btnSave.disabled = true;
            btnSave.textContent = isEdit ? "Mise à jour..." : "Publication...";

            const contentData = {
                userId: userId,
                dayNumber:
                    currentMode === "announcement"
                        ? 0
                        : parseInt(document.getElementById("create-day").value),
                title: document.getElementById("create-title").value,
                description: descriptionWithTags,
                state:
                    currentMode === "announcement"
                        ? "pause"
                        : document.getElementById("create-state").value,
                type: currentMode === "announcement" ? "text" : selectedType,
                mediaUrl: mediaUrl || null,
                mediaUrls: mediaUrls,
                arcId:
                    currentMode === "announcement"
                        ? null
                        : document.getElementById("create-arc").value || null,
            };

            let result;
            if (isEdit) {
                // Mise à jour
                const contentId = document.getElementById("content-id").value;
                result = await updateContent(contentId, contentData);
            } else {
                // Création
                result = await createContent(contentData);
            }

            if (result.success) {
                if (!isEdit && result.data) {
                    notifyFollowersOfTrace(result.data).catch((e) =>
                        console.warn("notifyFollowersOfTrace error", e),
                    );
                }
                clearPendingCreatePostAfterArc();
                // Recharger les données locales et rafraîchir l'interface
                const contentResult = await getUserContent(userId);
                if (contentResult.success) {
                    userContents[userId] = contentResult.data.map(
                        convertSupabaseContent,
                    );
                }

                // Reload profile view
                if (document.querySelector("#profile.active")) {
                    await renderProfileIntoContainer(userId);
                }

                // Refresh Discover cards (multiple cards can exist per user/arc)
                if (document.querySelector(".discover-grid")) {
                    await renderDiscoverGrid();
                }

                // Refresh Arc details if open
                if (
                    document.getElementById("immersive-overlay") &&
                    document.getElementById("immersive-overlay").style
                        .display === "block" &&
                    window.currentArc
                ) {
                    if (window.openArcDetails) {
                        window.openArcDetails(window.currentArc.id);
                    }
                }

                closeCreateMenu();
            } else {
                alert("Erreur: " + result.error);
            }

            btnSave.disabled = false;
            btnSave.textContent = originalText;
        });
}

/* ========================================
   GESTION DU CONTENU - MODIFICATION/SUPPRESSION
   ======================================== */

async function editContent(contentId) {
    try {
        // Récupérer les détails du contenu SANS JOINTS pour éviter les erreurs de relations
        // Les noms des arcs et projets sont de toute façon chargés dans le menu via userContents/userProjects
        const { data: content, error } = await supabase
            .from("content")
            .select("*")
            .eq("id", contentId)
            .single();

        if (error) throw error;

        // Vérifier que c'est bien le contenu de l'utilisateur connecté
        if (!currentUser || content.user_id !== currentUser.id) {
            alert("Vous ne pouvez modifier que votre propre contenu.");
            return;
        }

        // Pré-remplir le formulaire d'édition
        // content contient arc_id et project_id en snake_case, que openCreateMenu gère maintenant
        await openCreateMenu(currentUser.id, content.arc_id, content);
    } catch (error) {
        console.error("Erreur lors de la récupération du contenu:", error);
        alert(
            "Erreur lors du chargement du contenu: " + (error.message || error),
        );
    }
}

async function deleteContent(contentId) {
    if (
        !confirm(
            "Êtes-vous sûr de vouloir supprimer cette trace ? Cette action est irréversible.",
        )
    ) {
        return;
    }

    console.log("Tentative de suppression du contenu ID:", contentId);
    console.log("Utilisateur actuel:", currentUser);

    if (!window.currentUser) {
        alert("Vous devez être connecté pour supprimer une trace.");
        return;
    }

    try {
        // Vérifier d'abord que le contenu existe et appartient à l'utilisateur
        const { data: contentToDelete, error: fetchError } = await supabase
            .from("content")
            .select("id, user_id, title")
            .eq("id", contentId)
            .single();

        if (fetchError) {
            console.error(
                "Erreur lors de la récupération du contenu:",
                fetchError,
            );
            throw new Error("Contenu introuvable: " + fetchError.message);
        }

        if (contentToDelete.user_id !== currentUser.id) {
            alert("Vous ne pouvez supprimer que votre propre contenu.");
            return;
        }

        console.log("Contenu à supprimer:", contentToDelete);

        // Procéder à la suppression
        const { error } = await supabase
            .from("content")
            .delete()
            .eq("id", contentId);

        if (error) {
            console.error("Erreur Supabase lors de la suppression:", error);
            throw error;
        }

        console.log("Suppression réussie, rechargement du profil...");

        // Recharger le contenu de l'utilisateur
        const contentResult = await getUserContent(currentUser.id);
        if (contentResult.success) {
            userContents[currentUser.id] = contentResult.data.map(
                convertSupabaseContent,
            );
        }

        // Recharger le profil
        if (document.querySelector("#profile.active")) {
            await renderProfileIntoContainer(currentUser.id);
        }

        // Refresh Discover cards (multiple cards can exist per user/arc)
        if (document.querySelector(".discover-grid")) {
            await renderDiscoverGrid();
        }

        // Refresh Arc details if open
        if (
            document.getElementById("immersive-overlay") &&
            document.getElementById("immersive-overlay").style.display ===
                "block" &&
            window.currentArc
        ) {
            if (window.openArcDetails) {
                window.openArcDetails(window.currentArc.id);
            }
        }

        alert("Trace supprimée avec succès.");
    } catch (error) {
        console.error("Erreur lors de la suppression:", error);
        alert("Erreur lors de la suppression de la trace: " + error.message);
    }
}

// Rendre les fonctions disponibles globalement
window.editContent = editContent;
window.deleteContent = deleteContent;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.openCreateMenu = openCreateMenu;
window.closeCreateMenu = closeCreateMenu;
window.setPendingCreatePostAfterArc = setPendingCreatePostAfterArc;
window.clearPendingCreatePostAfterArc = clearPendingCreatePostAfterArc;
window.toggleTimelineExpand = toggleTimelineExpand;
window.openImmersive = openImmersive;
window.closeImmersive = closeImmersive;
window.navigateToUserProfile = navigateToUserProfile;
window.renderUsernameWithBadge = renderUsernameWithBadge;
window.renderAmbassadorBadgeById = renderAmbassadorBadgeById;
window.isAmbassadorUserId = isAmbassadorUserId;
window.requestVerification = requestVerification;
window.addVerifiedUserId = addVerifiedUserId;
window.removeVerifiedUserId = removeVerifiedUserId;
window.handleVerificationSelection = handleVerificationSelection;
window.isSuperAdmin = isSuperAdmin;
window.createAdminAnnouncement = createAdminAnnouncement;
window.updateAdminAnnouncement = updateAdminAnnouncement;
window.deleteAdminAnnouncement = deleteAdminAnnouncement;
window.submitAdminAnnouncement = submitAdminAnnouncement;
window.editAdminAnnouncement = editAdminAnnouncement;
window.cancelAdminAnnouncementEdit = cancelAdminAnnouncementEdit;
window.renderSuperAdminPage = renderSuperAdminPage;
window.refreshAppPulse = refreshAppPulse;
window.fetchAdminAnnouncements = fetchAdminAnnouncements;
window.fetchFeedbackInbox = fetchFeedbackInbox;
window.fetchVerifiedBadges = fetchVerifiedBadges;
window.fetchVerificationRequests = fetchVerificationRequests;
window.getVerifiedBadgeSets = getVerifiedBadgeSets;
window.banUserByAdmin = banUserByAdmin;
window.unbanUserByAdmin = unbanUserByAdmin;
window.banUserFromProfile = banUserFromProfile;
window.unbanUserFromProfile = unbanUserFromProfile;
window.softDeleteContentByAdmin = softDeleteContentByAdmin;
window.restoreContentByAdmin = restoreContentByAdmin;
window.hardDeleteContentByAdmin = hardDeleteContentByAdmin;
window.moderateContentFromProfile = moderateContentFromProfile;
window.hardDeleteUserByAdmin = hardDeleteUserByAdmin;
window.renderBadgeAdminPage = renderBadgeAdminPage;
window.toggleFollow = toggleFollow;
window.openReplyPrompt = openReplyPrompt;
window.setupAdminUserSearch = setupAdminUserSearch;
if (typeof openArcDetails !== "undefined") {
    window.openArcDetails = openArcDetails;
}
window.toggleTheme = toggleTheme;
window.handleSignOut = handleSignOut;
window.requestAccountDeletion = requestAccountDeletion;

/* ========================================
   INITIALISATION AU CHARGEMENT
   ======================================== */

document.addEventListener("DOMContentLoaded", function () {
    setupPwaSwUpdateReload();
    initializeApp();
});
window.openCreateMenu = openCreateMenu;

// Rafraîchissement périodique du feed (inclut les lives) pour compenser toute latence realtime
const LIVE_REFRESH_MS = 20000;
let liveRefreshTimer = null;

function startLiveAutoRefresh() {
    if (liveRefreshTimer) clearInterval(liveRefreshTimer);
    liveRefreshTimer = setInterval(() => {
        if (document.hidden) return; // éviter du travail inutile en arrière-plan
        if (typeof renderDiscoverGrid === "function") {
            renderDiscoverGrid();
        }
    }, LIVE_REFRESH_MS);
}

/* ========================================
   REALTIME SUBSCRIPTIONS
   ======================================== */

function subscribeToRealtime() {
    console.log("Initialisation des souscriptions Realtime...");

    const scheduleDiscoverRefresh = (() => {
        let timer = null;
        return () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                if (typeof renderDiscoverGrid === "function") {
                    renderDiscoverGrid();
                }
            }, 300);
        };
    })();

    // Souscription aux changements de la table 'content'
    supabase
        .channel("public:content")
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "content" },
            async (payload) => {
                console.log("Changement détecté dans content:", payload);

                const { eventType, new: newRecord } = payload;

                if (eventType === "INSERT" || eventType === "UPDATE") {
                    const userId = newRecord.user_id;

                    // Recharger le contenu de l'utilisateur concerné
                    const contentResult = await getUserContent(userId);
                    if (contentResult.success) {
                        userContents[userId] = contentResult.data.map(
                            convertSupabaseContent,
                        );

                        // Si on affiche le profil de cet utilisateur, rafraîchir
                        if (window.currentProfileViewed === userId) {
                            console.log("Mise à jour automatique du profil...");
                            await renderProfileIntoContainer(userId);
                        }

                        // Refresh Discover cards (multiple cards can exist per user/arc)
                        if (document.querySelector(".discover-grid")) {
                            scheduleDiscoverRefresh();
                        }
                    }
                }
            },
        )
        .subscribe();

    // Souscription aux changements de la table 'streaming_sessions'
    supabase
        .channel("public:streaming_sessions")
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "streaming_sessions" },
            (payload) => {
                console.log(
                    "Changement détecté dans streaming_sessions:",
                    payload,
                );
                scheduleDiscoverRefresh();
            },
        )
        .subscribe();

    // Démarrer un rafraîchissement de secours pour le feed (lives inclus)
    startLiveAutoRefresh();
}

/* ========================================
   GESTION DE LA LECTURE VIDÉO SYNCHRONISÉE
   ======================================== */

// Stocker l'état des vidéos
window.videoStates = new Map();

// Gérer la visibilité de la page pour contrôler les vidéos
document.addEventListener("visibilitychange", () => {
    const videos = document.querySelectorAll(
        "video.card-media, video.immersive-video",
    );

    if (document.hidden) {
        // Page cachée : mettre en pause toutes les vidéos et sauvegarder l'état
        videos.forEach((video) => {
            if (!video.paused) {
                const videoId = video.id || `video-${Date.now()}`;
                window.videoStates.set(videoId, {
                    currentTime: video.currentTime,
                    wasPlaying: true,
                });
                video.pause();
            }
        });
    } else {
        // Page visible : reprendre les vidéos qui étaient en lecture
        videos.forEach((video) => {
            const videoId = video.id || `video-${Date.now()}`;
            const savedState = window.videoStates.get(videoId);

            if (savedState && savedState.wasPlaying) {
                video.currentTime = savedState.currentTime;
                video
                    .play()
                    .catch((e) => console.log("Reprise vidéo bloquée:", e));
                window.videoStates.delete(videoId);
            }
        });
    }
});

// Gérer le focus/défocus de la fenêtre
window.addEventListener("blur", () => {
    const videos = document.querySelectorAll(
        "video.card-media, video.immersive-video",
    );
    videos.forEach((video) => {
        if (!video.paused) {
            const videoId = video.id || `video-${Date.now()}`;
            window.videoStates.set(videoId, {
                currentTime: video.currentTime,
                wasPlaying: true,
            });
            video.pause();
        }
    });
});

window.addEventListener("focus", () => {
    const videos = document.querySelectorAll(
        "video.card-media, video.immersive-video",
    );
    videos.forEach((video) => {
        const videoId = video.id || `video-${Date.now()}`;
        const savedState = window.videoStates.get(videoId);

        if (savedState && savedState.wasPlaying) {
            video.currentTime = savedState.currentTime;
            video.play().catch((e) => console.log("Reprise vidéo bloquée:", e));
            window.videoStates.delete(videoId);
        }
    });
});

// Initialiser les gestionnaires d'événements pour les nouvelles vidéos
function initializeVideoControls(root = document) {
    if (!root) return;

    let videos = [];
    if (
        root.matches &&
        root.matches("video.card-media, video.immersive-video")
    ) {
        videos = [root];
    } else if (root.querySelectorAll) {
        videos = root.querySelectorAll("video.card-media, video.immersive-video");
    }

    videos.forEach((video) => {
        // Éviter les doubles bindings et les remises à zéro d'état audio.
        if (video.dataset.controlsInitialized === "1") return;
        video.dataset.controlsInitialized = "1";

        // S'assurer que la vidéo a un ID unique
        if (!video.id) {
            video.id = `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        // Garder les vidéos des cartes muettes, permettre le son pour les vidéos immersives
        if (video.classList.contains("card-media")) {
            video.muted = true; // Forcer muted pour les cartes
        } else if (video.classList.contains("immersive-video")) {
            video.muted = true; // Démarrer muet, sera démuté uniquement pour la vidéo active
            video.loop = true; // Toujours en boucle
            if (
                video.dataset.src &&
                video.dataset.loaded !== "1" &&
                !video.currentSrc
            ) {
                video.removeAttribute("src"); // sera renseigné en lazy-load
            }
        }

        // Ajouter des gestionnaires pour les interactions utilisateur
        video.addEventListener("mouseenter", () => {
            if (video.paused && video.readyState >= 2) {
                video
                    .play()
                    .catch((e) => console.log("Lecture vidéo bloquée:", e));
            }
        });

        video.addEventListener("mouseleave", () => {
            // Optionnel : mettre en pause quand la souris quitte
            // video.pause();
        });

        // Si une vidéo immersive commence à jouer, muter les autres
        if (video.classList.contains("immersive-video")) {
            video.addEventListener("play", () => muteOtherImmersiveVideos(video));
        }
    });
}

// Appeler l'initialisation après le chargement du DOM
document.addEventListener("DOMContentLoaded", () => initializeVideoControls());

// Observer les changements dans le DOM pour les nouvelles vidéos
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const hasTargetVideo =
                        (node.matches &&
                            node.matches(
                                "video.card-media, video.immersive-video",
                            )) ||
                        (node.querySelector &&
                            node.querySelector(
                                "video.card-media, video.immersive-video",
                            ));
                    if (hasTargetVideo) {
                        initializeVideoControls(node);
                    }
                }
            });
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
});
