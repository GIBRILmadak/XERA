/* ========================================
   CONFIGURATION SUPABASE
   ======================================== */

const SUPABASE_URL = 'https://ssbuagqwjptyhavinkxg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_o7_j9WXXd96YKXa-fmfs1Q_OEwNTh1M';

// Initialiser le client Supabase seulement s'il n'existe pas déjà
if (!window.supabaseClient) {
    try {
        // Détecter si l'utilisateur veut être rappelé
        const rememberMe = localStorage.getItem('rize-remember-me') === 'true';
        
        if (window.supabase && window.supabase.createClient) {
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    // Utiliser localStorage si "Se souvenir de moi" est activé, sinon sessionStorage
                    storage: rememberMe ? window.localStorage : window.sessionStorage,
                    persistSession: true,
                    autoRefreshToken: true
                }
            });
        } else {
            console.error('Supabase library not loaded');
        }
    } catch (error) {
        console.error('Error initializing Supabase:', error);
    }
}

// Utiliser var au lieu de const pour permettre la redéclaration
var supabase = window.supabaseClient;

// Fonction pour reconfigurer le stockage de session selon les préférences
function updateSessionStorage(rememberMe) {
    // Sauvegarder la session actuelle si elle existe
    const currentSession = supabase.auth.getSession();
    
    // Créer un nouveau client avec le bon stockage
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage: rememberMe ? window.localStorage : window.sessionStorage,
            persistSession: true,
            autoRefreshToken: true
        }
    });
    
    supabase = window.supabaseClient;
    
    return currentSession;
}

// État d'authentification global
// Remove this line (line 17):
// let currentUser = null;

// Update the checkAuth function to not reassign to global currentUser
async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
        console.error('Erreur vérification session:', error);
        window.currentUser = null;
        window.currentUserId = null;
        return null;
    }
    
    if (session) {
        window.currentUser = session.user;
        window.currentUserId = session.user.id;
        return session.user;
    }
    window.currentUser = null;
    window.currentUserId = null;
    return null;
}

// Update signIn function to not assign to global currentUser
async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        // Return the user data instead of assigning to global
        return {
            success: true,
            data: data.user
        };
    } catch (error) {
        console.error('Erreur connexion:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Update signUp function similarly
async function signUp(email, password, username) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username: username }
            }
        });
        
        if (error) throw error;
        
        // Return the user data instead of assigning to global
        return {
            success: true,
            data: data.user
        };
    } catch (error) {
        console.error('Erreur inscription:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Update signOut function
async function signOut(clearRememberMe = false) {
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) throw error;
        
        // Si demandé, nettoyer les préférences "Se souvenir de moi"
        if (clearRememberMe) {
            localStorage.removeItem('rize-remember-email');
            localStorage.removeItem('rize-remember-me');
        }
        
        return {
            success: true
        };
    } catch (error) {
        console.error('Erreur déconnexion:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/* ========================================
   FONCTIONS BASE DE DONNÉES - USERS
   ======================================== */

// Créer ou mettre à jour un profil utilisateur
async function upsertUserProfile(userId, profileData) {
    try {
        // Vérifier que l'utilisateur est authentifié
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || user.id !== userId) {
            return { 
                success: false, 
                error: 'Utilisateur non authentifié ou ID non correspondant' 
            };
        }
        
        const { data, error } = await supabase
            .from('users')
            .upsert({
                id: userId,
                name: profileData.name,
                title: profileData.title,
                bio: profileData.bio,
                avatar: profileData.avatar,
                banner: profileData.banner,
                account_type: profileData.account_type,
                account_subtype: profileData.account_subtype,
                badge: profileData.badge,
                social_links: profileData.socialLinks,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) {
            console.error('Erreur upsert profil:', error);
            
            // Gestion spécifique des erreurs RLS
            if (error.code === '42501') {
                return { 
                    success: false, 
                    error: 'Permission refusée. Vérifiez que vous êtes connecté.' 
                };
            }
            
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data };
    } catch (error) {
        console.error('Exception upsert profil:', error);
        return { success: false, error: error.message };
    }
}

// Récupérer un profil utilisateur
async function getUserProfile(userId) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error) {
        console.error('Erreur récupération profil:', error);
        return { success: false, error: error.message, code: error.code };
    }
    
    return { success: true, data: data };
}

// Récupérer tous les utilisateurs (pour la page Discover)
async function getAllUsers() {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Erreur récupération utilisateurs:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true, data: data };
}

/* ========================================
   FONCTIONS BASE DE DONNÉES - CONTENT
   ======================================== */

function getContentWriteErrorMessage(error, contentData = {}) {
    const rawMessage = String(error?.message || '').trim();
    const lowerMessage = rawMessage.toLowerCase();
    const contentType = String(contentData?.type || '').toLowerCase();

    const isTypeConstraint =
        lowerMessage.includes('content_type_check') ||
        (lowerMessage.includes('check constraint') &&
            lowerMessage.includes('type'));

    if (isTypeConstraint && contentType === 'live') {
        return "Le type 'live' n'est pas activé dans la base. Exécutez le script sql/content-live-type-fix.sql dans Supabase SQL Editor.";
    }

    const isMissingArcColumn =
        lowerMessage.includes('arc_id') &&
        (lowerMessage.includes('column') || lowerMessage.includes('colonne')) &&
        (lowerMessage.includes('does not exist') || lowerMessage.includes('n\'existe pas'));

    if (isMissingArcColumn) {
        return "La colonne 'arc_id' est manquante sur la table content. Exécutez sql/arcs-schema.sql.";
    }

    return rawMessage || 'Erreur inconnue lors de l\'écriture du contenu.';
}

// Créer un nouveau contenu
async function createContent(contentData) {
    const basePayload = {
        user_id: contentData.userId,
        project_id: contentData.projectId,
        arc_id: contentData.arcId,
        day_number: contentData.dayNumber,
        type: contentData.type,
        state: contentData.state,
        title: contentData.title,
        description: contentData.description,
        media_url: contentData.mediaUrl,
    };

    const mediaUrls = Array.isArray(contentData.mediaUrls)
        ? contentData.mediaUrls.filter(Boolean)
        : [];

    const payloadWithMulti =
        mediaUrls.length > 0
            ? { ...basePayload, media_urls: mediaUrls }
            : basePayload;

    // Try writing multi-images first; if the column does not exist, fallback to media_url only.
    const attempt = async (payload) =>
        supabase.from('content').insert(payload).select().single();

    let response = await attempt(payloadWithMulti);
    let { data, error } = response;

    if (error) {
        const msg = String(error.message || '').toLowerCase();
        const mentionsMissingColumn =
            msg.includes('media_urls') &&
            (msg.includes('column') || msg.includes('colonne')) &&
            (msg.includes('does not exist') ||
                msg.includes("n'existe pas") ||
                msg.includes('could not find') ||
                msg.includes('schema cache'));

        if (mentionsMissingColumn) {
            // Fallback for older schema
            response = await attempt(basePayload);
            data = response.data;
            error = response.error;
        }
    }

    if (error) {
        console.error('Erreur création contenu:', error);
        return {
            success: false,
            error: getContentWriteErrorMessage(error, contentData),
        };
    }

    return { success: true, data: data };
}

// Mettre à jour un contenu existant
async function updateContent(contentId, contentData) {
    const basePayload = {
        project_id: contentData.projectId,
        arc_id: contentData.arcId,
        day_number: contentData.dayNumber,
        type: contentData.type,
        state: contentData.state,
        title: contentData.title,
        description: contentData.description,
        media_url: contentData.mediaUrl,
    };

    const mediaUrls = Array.isArray(contentData.mediaUrls)
        ? contentData.mediaUrls.filter(Boolean)
        : [];
    const payloadWithMulti =
        mediaUrls.length > 0
            ? { ...basePayload, media_urls: mediaUrls }
            : basePayload;

    const attempt = async (payload) =>
        supabase
            .from('content')
            .update(payload)
            .eq('id', contentId)
            .eq('user_id', contentData.userId)
            .select()
            .single();

    let response = await attempt(payloadWithMulti);
    let { data, error } = response;

    if (error) {
        const msg = String(error.message || '').toLowerCase();
        const mentionsMissingColumn =
            msg.includes('media_urls') &&
            (msg.includes('column') || msg.includes('colonne')) &&
            (msg.includes('does not exist') ||
                msg.includes("n'existe pas") ||
                msg.includes('could not find') ||
                msg.includes('schema cache'));

        if (mentionsMissingColumn) {
            response = await attempt(basePayload);
            data = response.data;
            error = response.error;
        }
    }

    if (error) {
        console.error('Erreur mise à jour contenu:', error);
        return {
            success: false,
            error: getContentWriteErrorMessage(error, contentData),
        };
    }

    return { success: true, data: data };
}

// Récupérer le contenu d'un utilisateur
async function getUserContent(userId) {
    const { data, error } = await supabase
        .from('content')
        .select(`
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
        `)
        .eq('user_id', userId)
        .order('day_number', { ascending: false });
    
    if (error) {
        console.error('Erreur récupération contenu:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true, data: data };
}

// Batch fetch basic user profiles (id, name, avatar)
async function fetchUsersByIds(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { success: true, data: [] };
    }
    const unique = Array.from(new Set(ids));
    const { data, error } = await supabase
        .from('users')
        .select('id, name, avatar')
        .in('id', unique);
    if (error) {
        console.error('Erreur fetchUsersByIds:', error);
        return { success: false, error: error.message };
    }
    return { success: true, data };
}

// Récupérer le contenu public d'un utilisateur (sans jointures)
async function getUserContentPublic(userId) {
    const { data, error } = await supabase
        .from('content')
        .select(`
            *,
            arcs (
                id,
                title,
                status,
                user_id
            )
        `)
        .eq('user_id', userId)
        .order('day_number', { ascending: false });

    if (error) {
        console.error('Erreur récupération contenu public:', error);
        return { success: false, error: error.message };
    }

    return { success: true, data: data };
}

/* ========================================
   FONCTIONS BASE DE DONNÉES - FOLLOWERS
   ======================================== */

// Suivre un utilisateur
async function followUser(followerId, followingId) {
    const { data, error } = await supabase
        .from('followers')
        .insert({
            follower_id: followerId,
            following_id: followingId
        })
        .select()
        .single();
    
    if (error) {
        console.error('Erreur follow:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true, data: data };
}

// Ne plus suivre un utilisateur
async function unfollowUser(followerId, followingId) {
    const { error } = await supabase
        .from('followers')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);
    
    if (error) {
        console.error('Erreur unfollow:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true };
}

// Vérifier si un utilisateur suit un autre
async function isFollowing(followerId, followingId) {
    const { data, error } = await supabase
        .from('followers')
        .select('*')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Erreur vérification follow:', error);
        return false;
    }
    
    return data !== null;
}

// Récupérer la liste des followers d'un utilisateur (ids uniquement)
async function getFollowerIds(userId) {
    try {
        const { data, error } = await supabase
            .from('followers')
            .select('follower_id')
            .eq('following_id', userId);

        if (error) throw error;
        return (data || []).map((row) => row.follower_id).filter(Boolean);
    } catch (error) {
        console.error('Erreur récupération followers ids:', error);
        return [];
    }
}

// Compter les followers
async function getFollowerCount(userId) {
    const { count, error } = await supabase
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);
    
    if (error) {
        console.error('Erreur comptage followers:', error);
        return 0;
    }
    
    return count || 0;
}

// Compter les following
async function getFollowingCount(userId) {
    const { count, error } = await supabase
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);
    
    if (error) {
        console.error('Erreur comptage following:', error);
        return 0;
    }
    
    return count || 0;
}

// Totaux d'engagements pour un profil
async function getUserEngagementTotals(userId) {
    const totals = {
        totalViews: 0,
        totalEncouragements: 0,
        totalStreamViewers: 0
    };
    
    try {
        const { data: contentData, error: contentError } = await supabase
            .from('content')
            .select('views, encouragements_count')
            .eq('user_id', userId);
        
        if (!contentError && Array.isArray(contentData)) {
            totals.totalViews = contentData.reduce((sum, row) => sum + (row.views || 0), 0);
            totals.totalEncouragements = contentData.reduce((sum, row) => sum + (row.encouragements_count || 0), 0);
        } else if (contentError) {
            console.error('Erreur récupération vues/encouragements:', contentError);
        }
    } catch (error) {
        console.error('Erreur récupération vues/encouragements:', error);
    }
    
    try {
        const { data: streamData, error: streamError } = await supabase
            .from('streaming_sessions')
            .select('id')
            .eq('user_id', userId);
        
        if (!streamError && Array.isArray(streamData) && streamData.length > 0) {
            const streamIds = streamData.map(stream => stream.id);
            const { data: viewerData, error: viewerError } = await supabase
                .from('stream_viewers')
                .select('user_id')
                .in('stream_id', streamIds);
            
            if (!viewerError && Array.isArray(viewerData)) {
                const uniqueViewers = new Set(viewerData.map(row => row.user_id).filter(Boolean));
                totals.totalStreamViewers = uniqueViewers.size;
            } else if (viewerError) {
                console.error('Erreur récupération viewers stream:', viewerError);
            }
        } else if (streamError) {
            console.error('Erreur récupération streams:', streamError);
        }
    } catch (error) {
        console.error('Erreur récupération viewers stream:', error);
    }
    
    return totals;
}

/* ========================================
   FONCTIONS D'AUTHENTIFICATION AVANCÉES
   ======================================== */

// Google OAuth login
async function signInWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {}
        });
        
        if (error) throw error;
        
        return {
            success: true,
            data: data
        };
    } catch (error) {
        console.error('Erreur connexion Google:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Réinitialisation du mot de passe
async function resetPassword(email) {
    try {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/login.html?reset=true'
        });
        
        if (error) throw error;
        
        return {
            success: true,
            data: data
        };
    } catch (error) {
        console.error('Erreur reset password:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Mettre à jour le mot de passe (après reset)
async function updatePassword(newPassword) {
    try {
        const { data, error } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (error) throw error;
        
        return {
            success: true,
            data: data.user
        };
    } catch (error) {
        console.error('Erreur update password:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/* ========================================
   FONCTIONS BASE DE DONNÉES - PROJECTS
   ======================================== */

// Créer un projet
async function createProject(projectData) {
    const { data, error } = await supabase
        .from('projects')
        .insert({
            user_id: projectData.userId,
            name: projectData.name,
            description: projectData.description,
            cover: projectData.cover
        })
        .select()
        .single();
    
    if (error) {
        console.error('Erreur création projet:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true, data: data };
}

// Récupérer les projets d'un utilisateur
async function getUserProjects(userId) {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Erreur récupération projets:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true, data: data };
}
