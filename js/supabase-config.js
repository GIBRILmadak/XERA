/* ========================================
   CONFIGURATION SUPABASE - XERA (ROOT)
   ======================================== */

const SUPABASE_URL = "https://ssbuagqwjptyhavinkxg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_o7_j9WXXd96YKXa-fmfs1Q_OEwNTh1M";

// Initialisation unique du client
if (!window.supabaseClient) {
    try {
        const rememberMeRaw = localStorage.getItem("rize-remember-me");
        const rememberMe = rememberMeRaw === null ? true : rememberMeRaw === "true";

        if (window.supabase && typeof window.supabase.createClient === 'function') {
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    storage: rememberMe ? window.localStorage : window.sessionStorage,
                    persistSession: true,
                    autoRefreshToken: true,
                },
            });
        }
    } catch (error) {
        console.error("Supabase init error:", error);
    }
}

var supabase = window.supabaseClient;

/**
 * AUTHENTIFICATION
 */

async function checkAuth() {
    if (!supabase) return null;
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (session) {
            window.currentUser = session.user;
            window.currentUserId = session.user.id;
            return session.user;
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
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return { success: true, data: data.user };
    } catch (error) {
        return { success: false, error: error.message, code: error.code, status: error.status };
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
                    ...metadata
                }
            }
        });
        if (error) throw error;
        return { success: true, data: data.user };
    } catch (error) {
        return { success: false, error: error.message, code: error.code };
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
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage: rememberMe ? window.localStorage : window.sessionStorage,
            persistSession: true,
            autoRefreshToken: true,
        },
    });
    supabase = window.supabaseClient;
    window.supabase = supabase;
    return supabase;
}

/**
 * DATABASE - USERS
 */

async function upsertUserProfile(userId, profileData) {
    try {
        const { data, error } = await supabase.from("users").upsert({
            id: userId,
            ...profileData,
            updated_at: new Date().toISOString()
        }).select().single();
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getUserProfile(userId) {
    try {
        const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getAllUsers() {
    try {
        const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
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
        const { data, error } = await supabase.from("content").insert(contentData).select().single();
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
        const { count, error } = await supabase.from("followers").select("*", { count: "exact", head: true }).eq("following_id", userId);
        if (error) throw error;
        return count || 0;
    } catch (error) {
        return 0;
    }
}

async function getFollowingCount(userId) {
    try {
        const { count, error } = await supabase.from("followers").select("*", { count: "exact", head: true }).eq("follower_id", userId);
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
        const totalViews = (data || []).reduce((sum, item) => sum + (Number(item.views) || 0), 0);
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
window.getFollowerCount = getFollowerCount;
window.getFollowingCount = getFollowingCount;
window.getUserEngagementTotals = getUserEngagementTotals;
window.getUserProjects = getUserProjects;
window.supabase = supabase;
window.supabaseClient = supabase;
