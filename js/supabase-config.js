/* ========================================
   CONFIGURATION SUPABASE - XERA (ROOT)
   ======================================== */

const SUPABASE_URL = "https://ssbuagqwjptyhavinkxg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_o7_j9WXXd96YKXa-fmfs1Q_OEwNTh1M";

// Initialisation unique du client
if (!window.supabaseClient) {
    try {
        const rememberMeRaw = localStorage.getItem("rize-remember-me");
        const rememberMe =
            rememberMeRaw === null ? true : rememberMeRaw === "true";

        if (
            window.supabase &&
            typeof window.supabase.createClient === "function"
        ) {
            window.supabaseClient = window.supabase.createClient(
                SUPABASE_URL,
                SUPABASE_ANON_KEY,
                {
                    auth: {
                        storage: rememberMe
                            ? window.localStorage
                            : window.sessionStorage,
                        persistSession: true,
                        autoRefreshToken: true,
                    },
                },
            );
        }
    } catch (error) {
        console.error("Supabase init error:", error);
    }
}

var supabase = window.supabaseClient;

function buildAuthProfileData(user) {
    if (!user) return {};
    const emailPrefix =
        String(user?.email || "").split("@")[0] || "Utilisateur";
    const name =
        user?.user_metadata?.full_name ||
        user?.user_metadata?.display_name ||
        user?.user_metadata?.username ||
        emailPrefix;

    return {
        name,
        account_type:
            user?.user_metadata?.account_type ||
            user?.account_type ||
            "personal",
        account_subtype:
            user?.user_metadata?.account_subtype ||
            user?.account_subtype ||
            "personal",
        avatar:
            user?.user_metadata?.avatar_url ||
            user?.user_metadata?.picture ||
            null,
    };
}

/**
 * AUTHENTIFICATION
 */

async function checkAuth() {
    if (!supabase) return null;
    try {
        const {
            data: { session },
            error,
        } = await supabase.auth.getSession();
        if (error) throw error;
        if (session) {
            const authUser = session.user;
            // Try to load canonical profile row from `users` table first
            try {
                if (typeof getUserProfile === "function") {
                    const profileRes = await getUserProfile(authUser.id);
                    if (profileRes && profileRes.success && profileRes.data) {
                        window.currentUser = profileRes.data;
                        window.currentUserId = profileRes.data.id;
                        return window.currentUser;
                    }
                }
            } catch (fetchErr) {
                console.warn("checkAuth: getUserProfile failed:", fetchErr);
            }

            // Fallback to auth session user and ensure a minimal users row exists
            window.currentUser = authUser;
            window.currentUserId = authUser.id;
            try {
                if (typeof upsertUserProfile === "function") {
                    const profileData = buildAuthProfileData(authUser);
                    await upsertUserProfile(authUser.id, profileData);
                }
            } catch (syncError) {
                console.warn(
                    "checkAuth: could not sync auth user to users table:",
                    syncError,
                );
            }
            return window.currentUser;
        }
    } catch (e) {
        console.error("checkAuth error:", e);
    }
    window.currentUser = null;
    window.currentUserId = null;
    return null;
}

async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
        return { success: true, data: data.user };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            code: error.code,
            status: error.status,
        };
    }
}

async function signUp(email, password, username, metadata = {}) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username,
                    ...metadata,
                },
            },
        });
        if (error) throw error;
        return { success: true, data: data.user };
    } catch (error) {
        const errorMessage =
            (error &&
                typeof error.message === "string" &&
                error.message.trim()) ||
            (error && typeof error === "string" && error.trim()) ||
            JSON.stringify(error) ||
            "Erreur lors de l'inscription.";

        return {
            success: false,
            error: errorMessage,
            code: error?.code || "",
            status: error?.status || null,
        };
    }
}

async function signOut(clearRememberMe = false) {
    try {
        await supabase.auth.signOut();
        if (clearRememberMe) {
            localStorage.removeItem("rize-remember-email");
            localStorage.removeItem("rize-remember-me");
        }
        window.currentUser = null;
        window.currentUserId = null;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function updateSessionStorage(rememberMe) {
    if (!window.supabase) return null;
    window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            auth: {
                storage: rememberMe
                    ? window.localStorage
                    : window.sessionStorage,
                persistSession: true,
                autoRefreshToken: true,
            },
        },
    );
    supabase = window.supabaseClient;
    window.supabase = supabase;
    return supabase;
}

/**
 * DATABASE - USERS
 */

async function upsertUserProfile(userId, profileData) {
    try {
        const normalizedProfileData = { ...profileData };
        if (
            Object.prototype.hasOwnProperty.call(
                normalizedProfileData,
                "profilePreferences",
            )
        ) {
            normalizedProfileData.profile_preferences =
                normalizedProfileData.profilePreferences;
            delete normalizedProfileData.profilePreferences;
        }
        if (
            Object.prototype.hasOwnProperty.call(
                normalizedProfileData,
                "socialLinks",
            )
        ) {
            normalizedProfileData.social_links =
                normalizedProfileData.socialLinks;
            delete normalizedProfileData.socialLinks;
        }

        const { data, error } = await supabase
            .from("users")
            .upsert({
                id: userId,
                ...normalizedProfileData,
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getAllUsers() {
    try {
        const { data, error } = await supabase
            .from("users")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * DATABASE - CONTENT
 */

async function createContent(contentData) {
    try {
        const payload = {
            ...contentData,
            user_id: contentData.user_id ?? contentData.userId ?? null,
            day_number: contentData.day_number ?? contentData.dayNumber ?? null,
            media_url: contentData.media_url ?? contentData.mediaUrl ?? null,
            media_urls: contentData.media_urls ?? contentData.mediaUrls ?? null,
            arc_id: contentData.arc_id ?? contentData.arcId ?? null,
            page_id: contentData.page_id ?? contentData.pageId ?? null,
        };
        delete payload.userId;
        delete payload.dayNumber;
        delete payload.mediaUrl;
        delete payload.mediaUrls;
        delete payload.arcId;
        delete payload.pageId;

        const { data, error } = await supabase
            .from("content")
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function updateContent(contentId, contentData) {
    if (!contentId) {
        return { success: false, error: "Missing content id for update." };
    }

    try {
        const payload = {
            ...contentData,
            updated_at: new Date().toISOString(),
            user_id: contentData.user_id ?? contentData.userId ?? null,
            day_number: contentData.day_number ?? contentData.dayNumber ?? null,
            media_url: contentData.media_url ?? contentData.mediaUrl ?? null,
            media_urls: contentData.media_urls ?? contentData.mediaUrls ?? null,
            arc_id: contentData.arc_id ?? contentData.arcId ?? null,
            page_id: contentData.page_id ?? contentData.pageId ?? null,
        };
        delete payload.userId;
        delete payload.dayNumber;
        delete payload.mediaUrl;
        delete payload.mediaUrls;
        delete payload.arcId;
        delete payload.pageId;

        const { data, error } = await supabase
            .from("content")
            .update(payload)
            .eq("id", contentId)
            .select()
            .single();
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * DATABASE - FOLLOWERS
 */

async function getFollowerCount(userId) {
    try {
        const { count, error } = await supabase
            .from("followers")
            .select("*", { count: "exact", head: true })
            .eq("following_id", userId);
        if (error) throw error;
        return count || 0;
    } catch (error) {
        return 0;
    }
}

async function getFollowingCount(userId) {
    try {
        const { count, error } = await supabase
            .from("followers")
            .select("*", { count: "exact", head: true })
            .eq("follower_id", userId);
        if (error) throw error;
        return count || 0;
    } catch (error) {
        return 0;
    }
}

async function getUserEngagementTotals(userId) {
    try {
        const { data, error } = await supabase
            .from("content")
            .select("views")
            .eq("user_id", userId);
        if (error) throw error;
        const totalViews = (data || []).reduce(
            (sum, item) => sum + (Number(item.views) || 0),
            0,
        );
        return { totalViews };
    } catch (error) {
        return { totalViews: 0 };
    }
}

async function getUserProjects(userId) {
    try {
        const { data, error } = await supabase
            .from("projects")
            .select("*")
            .eq("user_id", userId);
        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Récupérer le contenu d'un utilisateur depuis la base (utilisé par app-supabase.js)
async function getUserContent(userId) {
    try {
        const columns = `
            *,
            arcs (
                id,
                title,
                status,
                user_id,
                stage_level,
                opportunity_intents
            ),
            projects (
                id,
                name
            )
        `;

        const { data, error } = await supabase
            .from("content")
            .select(columns)
            .eq("user_id", userId)
            .order("day_number", { ascending: false });

        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (error) {
        console.warn("getUserContent error:", error);
        return { success: false, error: error?.message || String(error) };
    }
}

/**
 * EXPORTS GLOBAUX
 */

window.checkAuth = checkAuth;
window.signIn = signIn;
window.signUp = signUp;
window.signOut = signOut;
window.updateSessionStorage = updateSessionStorage;
window.upsertUserProfile = upsertUserProfile;
window.getUserProfile = getUserProfile;
window.getAllUsers = getAllUsers;
window.createContent = createContent;
window.updateContent = updateContent;
window.getFollowerCount = getFollowerCount;
window.getFollowingCount = getFollowingCount;
window.getUserEngagementTotals = getUserEngagementTotals;
window.getUserProjects = getUserProjects;

// Ne pas écraser window.supabase s'il est déjà défini par la lib CDN
if (supabase) {
    window.supabase = supabase;
    window.supabaseClient = supabase;
}

/**
 * HELPERS - ACCOUNT TYPES & PLANS
 */

function normalizeAccountType(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function isProAccountType(accountType, accountSubtype) {
    const values = [accountType, accountSubtype]
        .filter(
            (value) => value !== undefined && value !== null && value !== "",
        )
        .map((value) => normalizeAccountType(value));

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
            "recruiter",
            "investor",
            "partner",
            "professional",
        ].includes(value),
    );
}

function isProUser(user) {
    if (!user) return false;

    // Debug pour identifier le statut pro
    const subtype = user.account_subtype || user.user_metadata?.account_subtype;
    const type = user.account_type || user.user_metadata?.account_type;

    const normalizedPlan = normalizeAccountType(
        user.plan ||
            user.subscription_tier ||
            user.role ||
            type ||
            user.user_metadata?.plan ||
            user.user_metadata?.subscription_tier
    );

    const isPro = (
        user.is_pro === true ||
        user.isPro === true ||
        normalizedPlan === "pro" ||
        normalizedPlan === "elite" ||
        isProAccountType(type, subtype)
    );

    if (isPro) console.log(`[Auth] User confirmed as PRO (subtype: ${subtype}, plan: ${normalizedPlan})`);

    return isPro;
}

window.isProUser = isProUser;
window.isProAccountType = isProAccountType;
window.normalizeAccountType = normalizeAccountType;
