/* ========================================
   CONFIGURATION SUPABASE - XERA (ROOT)
   ======================================== */

const SUPABASE_URL = "https://ssbuagqwjptyhavinkxg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_o7_j9WXXd96YKXa-fmfs1Q_OEwNTh1M";

const AUTH_STORAGE_KEY = "rize-remember-me";
const AUTH_EMAIL_KEY = "rize-remember-email";
let authStateListenerRegistered = false;

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function setAuthState(user, session = null) {
    window.currentUser = user || null;
    window.currentUserId = user?.id || null;
    window.currentSession = session || null;
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent("xera-auth-state-changed", {
                detail: { user, session },
            }),
        );
    }
    return { user, session };
}

function getRememberMePreference() {
    const rememberMeRaw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return rememberMeRaw === null ? true : rememberMeRaw === "true";
}

function setRememberMePreference(rememberMe) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, rememberMe ? "true" : "false");
}

function clearRememberMePreference() {
    window.localStorage.removeItem(AUTH_EMAIL_KEY);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function createSupabaseClient(rememberMe = getRememberMePreference()) {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        return null;
    }

    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage: rememberMe ? window.localStorage : window.sessionStorage,
            persistSession: true,
            autoRefreshToken: true,
            flowType: "pkce",
        },
    });
}

function ensureSupabaseClient(rememberMe = getRememberMePreference()) {
    if (supabase?.auth) {
        return supabase;
    }

    if (window.supabaseClient?.auth) {
        supabase = window.supabaseClient;
        window.supabase = supabase;
        registerAuthStateListener(supabase);
        return supabase;
    }

    try {
        const client = createSupabaseClient(rememberMe);
        if (client) {
            window.supabaseClient = client;
            supabase = client;
            window.supabase = client;
            registerAuthStateListener(client);
            return client;
        }
    } catch (error) {
        console.warn("Unable to initialize Supabase client:", error);
    }

    return null;
}

function registerAuthStateListener(client) {
    if (!client || authStateListenerRegistered) return;

    try {
        client.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT") {
                setAuthState(null, null);
                return;
            }
            if (session?.user) {
                setAuthState(session.user, session);
            }
        });
        authStateListenerRegistered = true;
    } catch (error) {
        console.warn("Unable to register auth listener:", error);
    }
}

// Initialisation unique du client
if (!window.supabaseClient) {
    try {
        window.supabaseClient = createSupabaseClient();
    } catch (error) {
        console.error("Supabase init error:", error);
    }
}

var supabase = window.supabaseClient || null;
if (supabase) {
    registerAuthStateListener(supabase);
}

/**
 * AUTHENTIFICATION
 */

async function checkAuth() {
    const client = ensureSupabaseClient();
    if (!client) return null;
    try {
        const {
            data: { session },
            error: sessionError,
        } = await client.auth.getSession();
        if (sessionError) throw sessionError;

        if (!session?.access_token) {
            setAuthState(null, null);
            return null;
        }

        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError) throw userError;

        const user = userData?.user || session.user || null;
        setAuthState(user, session);
        return user;
    } catch (e) {
        console.error("checkAuth error:", e);
        setAuthState(null, null);
        return null;
    }
}

async function signIn(email, password) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
        return {
            success: false,
            error: "Veuillez fournir un email et un mot de passe.",
            code: "missing_fields",
        };
    }

    const client = ensureSupabaseClient();
    if (!client) {
        return {
            success: false,
            error: "Impossible d'initialiser l'authentification Supabase.",
            code: "client_init_failed",
        };
    }

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: normalizedEmail,
            password,
        });
        if (error) throw error;

        const user = data?.user || null;
        const session = data?.session || null;
        setAuthState(user, session);
        return { success: true, data: user, session };
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
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password || !username) {
        return {
            success: false,
            error: "Veuillez remplir tous les champs requis pour l'inscription.",
            code: "missing_fields",
        };
    }

    const client = ensureSupabaseClient();
    if (!client) {
        return {
            success: false,
            error: "Impossible d'initialiser l'authentification Supabase.",
            code: "client_init_failed",
        };
    }

    try {
        const { data, error } = await client.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
                data: {
                    username: username,
                    ...metadata,
                },
                emailRedirectTo: `${window.location.origin}/index.html`,
            },
        });
        if (error) throw error;
        return { success: true, data: data.user };
    } catch (error) {
        return { success: false, error: error.message, code: error.code };
    }
}

async function signOut(clearRememberMe = false) {
    const client = ensureSupabaseClient();
    try {
        if (client?.auth?.signOut) {
            await client.auth.signOut();
        }
        if (clearRememberMe) {
            clearRememberMePreference();
        }
        setAuthState(null, null);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function resetPassword(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return { success: false, error: "Veuillez entrer votre adresse email." };
    }

    const client = ensureSupabaseClient();
    if (!client) {
        return { success: false, error: "Impossible d'initialiser l'authentification Supabase." };
    }

    try {
        const { error } = await client.auth.resetPasswordForEmail(
            normalizedEmail,
            {
                redirectTo: `${window.location.origin}/login.html?reset=true`,
            },
        );
        if (error) throw error;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message, code: error.code };
    }
}

async function signInWithGoogle(redirectTo = `${window.location.origin}/login.html`) {
    const client = ensureSupabaseClient();
    if (!client) {
        return {
            success: false,
            error: "Impossible d'initialiser l'authentification Supabase.",
            code: "client_init_failed",
        };
    }

    if (!client.auth?.signInWithOAuth) {
        return {
            success: false,
            error: "La connexion Google n'est pas disponible dans cette session.",
        };
    }

    try {
        const { data, error } = await client.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo,
                flowType: "pkce",
                queryParams: {
                    access_type: "offline",
                    prompt: "consent",
                },
            },
        });
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message, code: error.code };
    }
}

function updateSessionStorage(rememberMe) {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        return null;
    }

    setRememberMePreference(rememberMe);
    window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            auth: {
                storage: rememberMe ? window.localStorage : window.sessionStorage,
                persistSession: true,
                autoRefreshToken: true,
            },
        },
    );
    supabase = window.supabaseClient;
    window.supabase = supabase;
    registerAuthStateListener(supabase);
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
window.resetPassword = resetPassword;
window.signInWithGoogle = signInWithGoogle;
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
