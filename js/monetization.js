/* ========================================
   MONÉTISATION XERA - Gestion des abonnements, paiements et revenus
   ======================================== */

// Configuration des plans
const PLANS = {
    STANDARD: {
        id: "PLAN_STANDARD",
        name: "Standard",
        price: 2.99,
        currency: "USD",
        features: [
            "Badge de vérification bleu",
            "Historique complet et public",
            "Priorité dans le feed Discover",
            "Avatar/Bannière GIF autorisés",
            "Notifications automatiques aux followers",
        ],
        canReceiveTips: false,
        canMonetizeVideos: false,
    },
    MEDIUM: {
        id: "PLAN_MEDIUM",
        name: "Medium",
        price: 7.99,
        currency: "USD",
        features: [
            "Tous les avantages Standard",
            "Badge Medium",
            "Fonctionnalités de monétisation",
            "Soutiens de la communauté (dons)",
            "Avatar/Bannière GIF autorisés",
            "Notifications automatiques aux followers",
        ],
        canReceiveTips: true,
        canMonetizeVideos: false,
        minFollowers: 1000,
    },
    PRO: {
        id: "PLAN_PRO",
        name: "Pro",
        price: 14.99,
        currency: "USD",
        features: [
            "Tous les avantages Medium",
            "Badge Gold",
            "Analytics avancés",
            "Lives en HD",
            "Lives privés réservés aux followers",
        ],
        canReceiveTips: true,
        canMonetizeVideos: true,
        minFollowers: 1000,
        rpmRate: 0.4,
    },
};

// Règles de paiement (MaishaPay uniquement)
const PAYMENT_RULES = {
    commissionRate: 0.2,
    minTipAmount: 1.0,
    maxTipAmount: 1000.0,
};

const VIDEO_MONETIZATION_MIN_DURATION_SECONDS = 60;

function normalizeVideoDurationSeconds(value) {
    const duration = Number.parseFloat(value);
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return duration;
}

function isEligibleVideoDuration(value) {
    return (
        normalizeVideoDurationSeconds(value) >
        VIDEO_MONETIZATION_MIN_DURATION_SECONDS
    );
}

/* ========================================
   FONCTIONS UTILITAIRES
   ======================================== */

function isPlanActiveForUser(user) {
    if (!user) return false;
    const status = String(user.plan_status || "").toLowerCase();
    if (status !== "active") return false;
    const planEnd = user.plan_ends_at || user.planEndsAt || null;
    if (!planEnd) return true;
    const endMs = Date.parse(planEnd);
    if (!Number.isFinite(endMs)) return true;
    return endMs > Date.now();
}

function getNormalizedUserPlan(user) {
    return String(user?.plan || "").toLowerCase();
}

function getFollowerCount(user) {
    const rawCount = user?.followers_count ?? user?.followersCount ?? 0;
    const count = Number.parseInt(rawCount, 10);
    return Number.isFinite(count) ? count : 0;
}

function hasMonetizationFlag(user) {
    return user?.is_monetized === true || user?.isMonetized === true;
}

function hasActiveMonetizationPlan(user) {
    const plan = getNormalizedUserPlan(user);
    return ["medium", "pro"].includes(plan) && isPlanActiveForUser(user);
}

function getMonetizationFollowerGap(user) {
    return Math.max(0, 1000 - getFollowerCount(user));
}

// Vérifier si un créateur peut recevoir des soutiens
function canReceiveSupport(user) {
    if (!user) return false;
    if (!hasActiveMonetizationPlan(user)) return false;
    if (isGiftedPro(user)) return true;
    return hasMonetizationFlag(user) || getFollowerCount(user) >= 1000;
}

// Vérifier si un créateur a un plan Pro offert par un admin
function isGiftedPro(user) {
    if (!user) return false;
    const plan = String(user.plan || "").toLowerCase();
    const status = String(user.plan_status || "").toLowerCase();
    const planEnd = user.plan_ends_at || user.planEndsAt || null;
    return plan === "pro" && status === "active" && !planEnd;
}

// Vérifier si un créateur peut monétiser ses vidéos
function canMonetizeVideos(user) {
    if (!user) return false;
    if (getNormalizedUserPlan(user) !== "pro") return false;
    if (!isPlanActiveForUser(user)) return false;
    if (isGiftedPro(user)) return true;
    return hasMonetizationFlag(user) || getFollowerCount(user) >= 1000;
}

// Obtenir le plan actuel de l'utilisateur
function getUserPlan(user) {
    if (!user || !user.plan) return PLANS.FREE;
    return PLANS[user.plan.toUpperCase()] || PLANS.FREE;
}

// Formater un montant en devise
function formatCurrency(amount, currency = "USD") {
    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: currency,
    }).format(amount);
}

/* ========================================
   FONCTIONS SUPABASE - ABONNEMENTS
   ======================================== */

// Récupérer l'abonnement actif d'un utilisateur
async function getUserActiveSubscription(userId) {
    try {
        const { data, error } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", userId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("Erreur récupération abonnement:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data };
    } catch (error) {
        console.error("Exception récupération abonnement:", error);
        return { success: false, error: error.message };
    }
}

// Récupérer l'historique des abonnements
async function getUserSubscriptionHistory(userId) {
    try {
        const { data, error } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Erreur récupération historique:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data || [] };
    } catch (error) {
        console.error("Exception historique abonnements:", error);
        return { success: false, error: error.message };
    }
}

// Mettre à jour le plan d'un utilisateur
async function updateUserPlan(userId, plan, status = "active") {
    try {
        const { data, error } = await supabase
            .from("users")
            .update({
                plan: plan,
                plan_status: status,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select()
            .single();

        if (error) {
            console.error("Erreur mise à jour plan:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data };
    } catch (error) {
        console.error("Exception mise à jour plan:", error);
        return { success: false, error: error.message };
    }
}

// Mettre à jour le compteur de followers et recalculer le statut de monétisation
async function updateFollowersCount(userId, count) {
    try {
        const { data, error } = await supabase
            .from("users")
            .update({
                followers_count: count,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select()
            .single();

        if (error) {
            console.error("Erreur mise à jour followers:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data };
    } catch (error) {
        console.error("Exception mise à jour followers:", error);
        return { success: false, error: error.message };
    }
}

/* ========================================
   FONCTIONS SUPABASE - TRANSACTIONS
   ======================================== */

// Créer une transaction (soutien)
async function createSupportTransaction(
    fromUserId,
    toUserId,
    amount,
    description = "",
) {
    try {
        // Vérifier que le créateur peut recevoir des soutiens
        const { data: creator } = await getUserProfile(toUserId);
        if (!canReceiveSupport(creator.data)) {
            return {
                success: false,
                error: "Ce créateur ne peut pas recevoir de soutiens. Il doit avoir un plan Medium ou Pro actif.",
            };
        }

        // Vérifier les limites de montant
        if (
            amount < PAYMENT_RULES.minTipAmount ||
            amount > PAYMENT_RULES.maxTipAmount
        ) {
            return {
                success: false,
                error: `Le montant doit être entre ${PAYMENT_RULES.minTipAmount} et ${PAYMENT_RULES.maxTipAmount} USD`,
            };
        }

        const { data, error } = await supabase
            .from("transactions")
            .insert({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                type: "support",
                amount_gross: amount,
                status: "pending",
                description: description,
                currency: "USD",
            })
            .select()
            .single();

        if (error) {
            console.error("Erreur création transaction:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data };
    } catch (error) {
        console.error("Exception création transaction:", error);
        return { success: false, error: error.message };
    }
}

// Récupérer les transactions reçues par un créateur
async function getCreatorTransactions(creatorId, options = {}) {
    try {
        let query = supabase
            .from("transactions")
            .select("*")
            .eq("to_user_id", creatorId)
            .eq("status", "succeeded");

        // Filtrer par type
        if (options.type) {
            query = query.eq("type", options.type);
        }

        // Filtrer par période
        if (options.startDate) {
            query = query.gte("created_at", options.startDate);
        }
        if (options.endDate) {
            query = query.lte("created_at", options.endDate);
        }

        // Ordonner et limiter
        query = query.order("created_at", { ascending: false });

        if (options.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Erreur récupération transactions:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data || [] };
    } catch (error) {
        console.error("Exception récupération transactions:", error);
        return { success: false, error: error.message };
    }
}

// Récupérer les transactions envoyées par un utilisateur
async function getSentTransactions(userId, options = {}) {
    try {
        let query = supabase
            .from("transactions")
            .select("*")
            .eq("from_user_id", userId);

        if (options.status) {
            query = query.eq("status", options.status);
        }

        query = query.order("created_at", { ascending: false });

        if (options.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Erreur récupération transactions envoyées:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data || [] };
    } catch (error) {
        console.error("Exception transactions envoyées:", error);
        return { success: false, error: error.message };
    }
}

// Calculer les revenus totaux d'un créateur
async function calculateCreatorRevenue(creatorId) {
    try {
        const { data, error } = await supabase
            .from("transactions")
            .select("amount_net_creator, type")
            .eq("to_user_id", creatorId)
            .eq("status", "succeeded");

        if (error) {
            console.error("Erreur calcul revenus:", error);
            return { success: false, error: error.message };
        }

        const summary = {
            totalRevenue: 0,
            supportRevenue: 0,
            videoRevenue: 0,
            transactionCount: data ? data.length : 0,
        };

        if (data) {
            data.forEach((tx) => {
                summary.totalRevenue += parseFloat(tx.amount_net_creator || 0);
                if (tx.type === "support") {
                    summary.supportRevenue += parseFloat(
                        tx.amount_net_creator || 0,
                    );
                } else if (tx.type === "video_rpm") {
                    summary.videoRevenue += parseFloat(
                        tx.amount_net_creator || 0,
                    );
                }
            });
        }

        return { success: true, data: summary };
    } catch (error) {
        console.error("Exception calcul revenus:", error);
        return { success: false, error: error.message };
    }
}

/* ========================================
   FONCTIONS SUPABASE - VIDÉOS ET VUES
   ======================================== */

// Enregistrer une vue vidéo (appelé par le système de tracking)
async function recordVideoView(videoId, creatorId, videoDuration) {
    try {
        const today = new Date().toISOString().split("T")[0];
        const normalizedDuration = normalizeVideoDurationSeconds(videoDuration);
        const isEligible = isEligibleVideoDuration(normalizedDuration);

        // Vérifier si une entrée existe déjà pour aujourd'hui
        const { data: existing, error: checkError } = await supabase
            .from("video_views")
            .select("*")
            .eq("video_id", videoId)
            .eq("period_date", today)
            .single();

        if (checkError && checkError.code !== "PGRST116") {
            console.error("Erreur vérification vue:", checkError);
        }

        if (existing) {
            const existingDuration = normalizeVideoDurationSeconds(
                existing.video_duration,
            );
            const nextDuration = Math.max(existingDuration, normalizedDuration);

            // Incrémenter le compteur
            const { data, error } = await supabase
                .from("video_views")
                .update({
                    view_count: existing.view_count + 1,
                    eligible: isEligibleVideoDuration(nextDuration),
                    video_duration: nextDuration || null,
                    period_month: today.substring(0, 7) + "-01",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id)
                .select()
                .single();

            if (error) {
                console.error("Erreur mise à jour vue:", error);
                return { success: false, error: error.message };
            }

            return { success: true, data: data };
        } else {
            // Créer une nouvelle entrée
            const { data, error } = await supabase
                .from("video_views")
                .insert({
                    video_id: videoId,
                    creator_id: creatorId,
                    view_count: 1,
                    eligible: isEligible,
                    video_duration: normalizedDuration || null,
                    period_date: today,
                    period_month: today.substring(0, 7) + "-01",
                })
                .select()
                .single();

            if (error) {
                console.error("Erreur création vue:", error);
                return { success: false, error: error.message };
            }

            return { success: true, data: data };
        }
    } catch (error) {
        console.error("Exception enregistrement vue:", error);
        return { success: false, error: error.message };
    }
}

// Récupérer les statistiques vidéo d'un créateur
async function getCreatorVideoStats(creatorId, period = "month") {
    try {
        // On se base sur les contenus vidéo réels de l'utilisateur (table content)
        // car les vues ne sont pas encore enregistrées dans video_views.
        const now = new Date();
        let startDate = null;
        switch (period) {
            case "day":
                startDate = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                );
                break;
            case "week":
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case "month":
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            default:
                startDate = null;
        }

        let query = supabase
            .from("content")
            .select("id, views, created_at, type")
            .eq("user_id", creatorId)
            .eq("type", "video");

        if (startDate) {
            query = query.gte("created_at", startDate.toISOString());
        }

        const { data, error } = await query;
        if (error) {
            console.error("Erreur stats vidéo:", error);
            return { success: false, error: error.message };
        }

        const stats = {
            totalViews: 0,
            totalEligibleViews: 0,
            videoCount: 0,
            estimatedRevenue: 0,
        };

        if (Array.isArray(data) && data.length > 0) {
            data.forEach((row) => {
                const views = Number(row.views || 0);
                stats.totalViews += views;
                stats.totalEligibleViews += views; // faute de durée, on considère toutes les vues éligibles
            });
            stats.videoCount = data.length;
        }

        stats.estimatedRevenue =
            (stats.totalEligibleViews / 1000) *
            PLANS.PRO.rpmRate *
            (1 - PAYMENT_RULES.commissionRate);

        return { success: true, data: stats };
    } catch (error) {
        console.error("Exception stats vidéo:", error);
        return { success: false, error: error.message };
    }
}

/* ========================================
   FONCTIONS SUPABASE - PAYOUTS VIDÉO
   ======================================== */

// Récupérer les payouts vidéo d'un créateur
async function getCreatorVideoPayouts(creatorId, options = {}) {
    try {
        let query = supabase
            .from("video_payouts")
            .select("*")
            .eq("creator_id", creatorId);

        if (options.status) {
            query = query.eq("status", options.status);
        }

        query = query.order("period_month", { ascending: false });

        if (options.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Erreur récupération payouts:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data || [] };
    } catch (error) {
        console.error("Exception récupération payouts:", error);
        return { success: false, error: error.message };
    }
}

/* ========================================
   PAIEMENTS (MAISHAPAY UNIQUEMENT)
   ======================================== */

function resolveMonetizationApiBase() {
    // Utilisation de chemins relatifs pour Vercel (API et Frontend sur le même domaine)
    return "";
}

async function getMonetizationAccessToken() {
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
        throw new Error("Session invalide. Reconnectez-vous.");
    }

    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    if (
        expiresAt &&
        expiresAt - Date.now() < 2 * 60 * 1000 &&
        typeof supabase.auth.refreshSession === "function"
    ) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed?.error || !refreshed?.data?.session?.access_token) {
            throw new Error("Impossible de rafraîchir la session.");
        }
        return refreshed.data.session.access_token;
    }

    return session.access_token;
}

// Créer une session de paiement pour un soutien
async function createSupportPaymentSession(
    fromUserId,
    toUserId,
    amount,
    description = "",
) {
    try {
        if (!fromUserId || !toUserId) {
            return {
                success: false,
                error: "Utilisateur source ou destination manquant.",
            };
        }

        const apiBase = resolveMonetizationApiBase();
        if (!apiBase) {
            return { success: false, error: "Adresse API introuvable." };
        }

        const accessToken = await getMonetizationAccessToken();
        const response = await fetch(`${apiBase}/api/monetization/support`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                to_user_id: toUserId,
                amount,
                description,
            }),
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch (error) {
            payload = {};
        }

        if (!response.ok) {
            return {
                success: false,
                error: payload?.error || "Impossible d'envoyer le soutien.",
            };
        }

        return {
            success: true,
            data: payload,
        };
    } catch (error) {
        console.error("Erreur createSupportPaymentSession:", error);
        return {
            success: false,
            error:
                error?.message ||
                "Impossible de contacter le serveur de soutien.",
        };
    }
}

const PAYMENT_RETURN_VIEW_PARAM = "payment_return_view";
const PAYMENT_RETURN_IMMERSIVE_USER_PARAM = "payment_return_immersive_user";
const PAYMENT_RETURN_IMMERSIVE_CONTENT_PARAM =
    "payment_return_immersive_content";

function clearPaymentReturnResumeParams(url) {
    if (!(url instanceof URL)) return url;
    url.searchParams.delete(PAYMENT_RETURN_VIEW_PARAM);
    url.searchParams.delete(PAYMENT_RETURN_IMMERSIVE_USER_PARAM);
    url.searchParams.delete(PAYMENT_RETURN_IMMERSIVE_CONTENT_PARAM);
    return url;
}

function isImmersiveOverlayVisible() {
    const overlay = document.getElementById("immersive-overlay");
    if (!overlay) return false;
    return (
        overlay.style.display === "block" ||
        overlay.classList.contains("active")
    );
}

function resolveActiveImmersivePost(sourceElement = null) {
    if (sourceElement?.closest) {
        const directPost = sourceElement.closest(".immersive-post");
        if (directPost) return directPost;
    }

    const posts = Array.from(document.querySelectorAll(".immersive-post"));
    if (posts.length === 0) return null;

    let bestPost = null;
    let bestScore = -1;
    posts.forEach((post) => {
        const rect = post.getBoundingClientRect();
        const visibleHeight =
            Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        const visibleWidth =
            Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
        const score = Math.max(0, visibleHeight) * Math.max(0, visibleWidth);
        if (score > bestScore) {
            bestScore = score;
            bestPost = post;
        }
    });

    return bestPost;
}

function buildSupportReturnPath(sourceElement = null) {
    const url = new URL(window.location.href);
    clearPaymentReturnResumeParams(url);

    if (isImmersiveOverlayVisible()) {
        const activePost = resolveActiveImmersivePost(sourceElement);
        const immersiveUserId = String(
            activePost?.dataset?.userId || "",
        ).trim();
        const immersiveContentId = String(
            activePost?.dataset?.contentId || "",
        ).trim();

        if (immersiveUserId) {
            url.searchParams.set(PAYMENT_RETURN_VIEW_PARAM, "immersive");
            url.searchParams.set(
                PAYMENT_RETURN_IMMERSIVE_USER_PARAM,
                immersiveUserId,
            );
            if (immersiveContentId) {
                url.searchParams.set(
                    PAYMENT_RETURN_IMMERSIVE_CONTENT_PARAM,
                    immersiveContentId,
                );
            }
        }
    }

    return `${url.pathname}${url.search}${url.hash}`;
}

function buildSupportPaymentPageUrl({
    creatorId,
    creatorName = "",
    amount,
    description = "",
    returnPath = "",
}) {
    const normalizedAmount = Number.parseInt(String(amount), 10);
    const query = {
        kind: "support",
        creator: creatorId,
        amount: normalizedAmount,
        creator_name: String(creatorName || "").trim(),
        description: String(description || "")
            .trim()
            .slice(0, 160),
        return_path: String(returnPath || "").trim(),
    };

    if (window.XeraRouter?.buildHtmlUrl) {
        return window.XeraRouter.buildHtmlUrl("subscriptionPayment", { query });
    }

    const url = new URL("subscription-payment.html", window.location.href);
    Object.entries(query).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") return;
        url.searchParams.set(key, String(value));
    });
    return url.toString();
}

function redirectToSupportCheckout({
    creatorId,
    creatorName = "",
    amount,
    description = "",
    returnPath = "",
    sourceElement = null,
}) {
    const normalizedAmount = Number.parseFloat(amount);

    if (!creatorId) {
        return { success: false, error: "Créateur introuvable." };
    }
    if (!Number.isFinite(normalizedAmount)) {
        return { success: false, error: "Montant invalide." };
    }
    if (!Number.isInteger(normalizedAmount)) {
        return {
            success: false,
            error: "Choisissez un montant entier en USD pour le soutien.",
        };
    }
    if (
        normalizedAmount < PAYMENT_RULES.minTipAmount ||
        normalizedAmount > PAYMENT_RULES.maxTipAmount
    ) {
        return {
            success: false,
            error: `Le montant doit être entre ${PAYMENT_RULES.minTipAmount} et ${PAYMENT_RULES.maxTipAmount} USD.`,
        };
    }

    const destination = buildSupportPaymentPageUrl({
        creatorId,
        creatorName,
        amount: normalizedAmount,
        description,
        returnPath: returnPath || buildSupportReturnPath(sourceElement),
    });

    window.location.assign(destination);
    return { success: true, url: destination };
}

/* ========================================
   FONCTIONS UI - RENDU DES ÉLÉMENTS
   ======================================== */

// Générer le badge de plan
function renderPlanBadge(plan, isMonetized) {
    const planConfig = PLANS[plan?.toUpperCase()] || PLANS.FREE;
    const badgeClass =
        plan === "pro"
            ? "badge-pro"
            : plan === "medium"
              ? "badge-medium"
              : "badge-standard";

    if (!plan || plan === "free") {
        return "";
    }

    return `
        <span class="plan-badge ${badgeClass}">
            ${planConfig.name}
            ${isMonetized ? '<i class="fas fa-check-circle"></i>' : ""}
        </span>
    `;
}

// Générer le bouton de soutien
function renderSupportButton(creator, options = {}) {
    const canSupport = canReceiveSupport(creator);
    const size = options.size || "medium";

    if (!canSupport) {
        return `
            <button class="support-btn support-btn-disabled ${size}" disabled title="Ce créateur ne peut pas recevoir de soutiens">
                <i class="fas fa-lock"></i>
                Soutien indisponible
            </button>
        `;
    }

    return `
        <button class="support-btn support-btn-active ${size}" 
                onclick="openSupportModal('${creator.id}')"
                data-creator-id="${creator.id}">
            <i class="fas fa-heart"></i>
            Soutenir
        </button>
    `;
}

// Générer les options de montant pour le soutien
function renderSupportAmounts() {
    const amounts = [1, 3, 5, 10, 25, 50];

    return amounts
        .map(
            (amount) => `
        <button class="amount-btn" data-amount="${amount}" onclick="selectSupportAmount(${amount})">
            $${amount}
        </button>
    `,
        )
        .join("");
}

/* ========================================
   EXPORTS
   ======================================== */

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        PLANS,
        PAYMENT_RULES,
        VIDEO_MONETIZATION_MIN_DURATION_SECONDS,
        normalizeVideoDurationSeconds,
        isEligibleVideoDuration,
        canReceiveSupport,
        isGiftedPro,
        canMonetizeVideos,
        getUserPlan,
        formatCurrency,
        getUserActiveSubscription,
        getUserSubscriptionHistory,
        updateUserPlan,
        updateFollowersCount,
        createSupportTransaction,
        getCreatorTransactions,
        getSentTransactions,
        calculateCreatorRevenue,
        recordVideoView,
        getCreatorVideoStats,
        getCreatorVideoPayouts,
        createSupportPaymentSession,
        buildSupportReturnPath,
        buildSupportPaymentPageUrl,
        redirectToSupportCheckout,
        renderPlanBadge,
        renderSupportButton,
        renderSupportAmounts,
    };
}
