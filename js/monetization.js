/* ========================================
   MONÉTISATION XERA - Gestion des abonnements, paiements et revenus
   ======================================== */

// Configuration des plans
const PLANS = {
    STANDARD: {
        id: 'PLAN_STANDARD',
        name: 'Standard',
        price: 2.50,
        currency: 'USD',
        features: ['Badge bleu', 'Statut vérifié', 'Support prioritaire'],
        canReceiveTips: false,
        canMonetizeVideos: false
    },
    MEDIUM: {
        id: 'PLAN_MEDIUM',
        name: 'Medium',
        price: 6.00,
        currency: 'USD',
        features: ['Badge bleu', 'Statut vérifié', 'Recevoir des soutiens', 'Transferts Payapay'],
        canReceiveTips: true,
        canMonetizeVideos: false,
        minFollowers: 1000
    },
    PRO: {
        id: 'PLAN_PRO',
        name: 'Pro',
        price: 10.00,
        currency: 'USD',
        features: ['Badge bleu', 'Statut vérifié', 'Recevoir des soutiens', 'Monétisation vidéo ($0.40/1000 vues)', 'Dashboard avancé'],
        canReceiveTips: true,
        canMonetizeVideos: true,
        minFollowers: 1000,
        rpmRate: 0.40
    }
};

// Configuration Payapay
const PAYAPAY_CONFIG = {
    apiUrl: 'https://api.payapay.com/v1',
    commissionRate: 0.20,
    minPayoutAmount: 5.00,
    minTipAmount: 1.00,
    maxTipAmount: 1000.00
};

/* ========================================
   FONCTIONS UTILITAIRES
   ======================================== */

// Vérifier si un créateur peut recevoir des soutiens
function canReceiveSupport(user) {
    if (!user) return false;
    
    const hasValidPlan = user.plan === 'medium' || user.plan === 'pro';
    const hasActiveSubscription = user.plan_status === 'active';
    const hasEnoughFollowers = (user.followers_count || 0) >= 1000;
    const isMonetized = user.is_monetized === true;
    
    return hasValidPlan && hasActiveSubscription && hasEnoughFollowers && isMonetized;
}

// Vérifier si un créateur peut monétiser ses vidéos
function canMonetizeVideos(user) {
    if (!user) return false;
    
    return user.plan === 'pro' && 
           user.plan_status === 'active' && 
           (user.followers_count || 0) >= 1000 &&
           user.is_monetized === true;
}

// Obtenir le plan actuel de l'utilisateur
function getUserPlan(user) {
    if (!user || !user.plan) return PLANS.FREE;
    return PLANS[user.plan.toUpperCase()] || PLANS.FREE;
}

// Formater un montant en devise
function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

/* ========================================
   FONCTIONS SUPABASE - ABONNEMENTS
   ======================================== */

// Récupérer l'abonnement actif d'un utilisateur
async function getUserActiveSubscription(userId) {
    try {
        const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Erreur récupération abonnement:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data };
    } catch (error) {
        console.error('Exception récupération abonnement:', error);
        return { success: false, error: error.message };
    }
}

// Récupérer l'historique des abonnements
async function getUserSubscriptionHistory(userId) {
    try {
        const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Erreur récupération historique:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Exception historique abonnements:', error);
        return { success: false, error: error.message };
    }
}

// Mettre à jour le plan d'un utilisateur
async function updateUserPlan(userId, plan, status = 'active') {
    try {
        const { data, error } = await supabase
            .from('users')
            .update({
                plan: plan,
                plan_status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select()
            .single();
        
        if (error) {
            console.error('Erreur mise à jour plan:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data };
    } catch (error) {
        console.error('Exception mise à jour plan:', error);
        return { success: false, error: error.message };
    }
}

// Mettre à jour le compteur de followers et recalculer le statut de monétisation
async function updateFollowersCount(userId, count) {
    try {
        const { data, error } = await supabase
            .from('users')
            .update({
                followers_count: count,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select()
            .single();
        
        if (error) {
            console.error('Erreur mise à jour followers:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data };
    } catch (error) {
        console.error('Exception mise à jour followers:', error);
        return { success: false, error: error.message };
    }
}

/* ========================================
   FONCTIONS SUPABASE - TRANSACTIONS
   ======================================== */

// Créer une transaction (soutien)
async function createSupportTransaction(fromUserId, toUserId, amount, description = '') {
    try {
        // Vérifier que le créateur peut recevoir des soutiens
        const { data: creator } = await getUserProfile(toUserId);
        if (!canReceiveSupport(creator.data)) {
            return { 
                success: false, 
                error: 'Ce créateur ne peut pas recevoir de soutiens. Il doit avoir un plan Medium ou Pro actif et au moins 1000 abonnés.' 
            };
        }
        
        // Vérifier les limites de montant
        if (amount < PAYAPAY_CONFIG.minTipAmount || amount > PAYAPAY_CONFIG.maxTipAmount) {
            return {
                success: false,
                error: `Le montant doit être entre ${PAYAPAY_CONFIG.minTipAmount} et ${PAYAPAY_CONFIG.maxTipAmount} USD`
            };
        }
        
        const { data, error } = await supabase
            .from('transactions')
            .insert({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                type: 'support',
                amount_gross: amount,
                status: 'pending',
                description: description,
                currency: 'USD'
            })
            .select()
            .single();
        
        if (error) {
            console.error('Erreur création transaction:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data };
    } catch (error) {
        console.error('Exception création transaction:', error);
        return { success: false, error: error.message };
    }
}

// Récupérer les transactions reçues par un créateur
async function getCreatorTransactions(creatorId, options = {}) {
    try {
        let query = supabase
            .from('transactions')
            .select('*')
            .eq('to_user_id', creatorId)
            .eq('status', 'succeeded');
        
        // Filtrer par type
        if (options.type) {
            query = query.eq('type', options.type);
        }
        
        // Filtrer par période
        if (options.startDate) {
            query = query.gte('created_at', options.startDate);
        }
        if (options.endDate) {
            query = query.lte('created_at', options.endDate);
        }
        
        // Ordonner et limiter
        query = query.order('created_at', { ascending: false });
        
        if (options.limit) {
            query = query.limit(options.limit);
        }
        
        const { data, error } = await query;
        
        if (error) {
            console.error('Erreur récupération transactions:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Exception récupération transactions:', error);
        return { success: false, error: error.message };
    }
}

// Récupérer les transactions envoyées par un utilisateur
async function getSentTransactions(userId, options = {}) {
    try {
        let query = supabase
            .from('transactions')
            .select('*')
            .eq('from_user_id', userId);
        
        if (options.status) {
            query = query.eq('status', options.status);
        }
        
        query = query.order('created_at', { ascending: false });
        
        if (options.limit) {
            query = query.limit(options.limit);
        }
        
        const { data, error } = await query;
        
        if (error) {
            console.error('Erreur récupération transactions envoyées:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Exception transactions envoyées:', error);
        return { success: false, error: error.message };
    }
}

// Calculer les revenus totaux d'un créateur
async function calculateCreatorRevenue(creatorId) {
    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('amount_net_creator, type')
            .eq('to_user_id', creatorId)
            .eq('status', 'succeeded');
        
        if (error) {
            console.error('Erreur calcul revenus:', error);
            return { success: false, error: error.message };
        }
        
        const summary = {
            totalRevenue: 0,
            supportRevenue: 0,
            videoRevenue: 0,
            transactionCount: data ? data.length : 0
        };
        
        if (data) {
            data.forEach(tx => {
                summary.totalRevenue += parseFloat(tx.amount_net_creator || 0);
                if (tx.type === 'support') {
                    summary.supportRevenue += parseFloat(tx.amount_net_creator || 0);
                } else if (tx.type === 'video_rpm') {
                    summary.videoRevenue += parseFloat(tx.amount_net_creator || 0);
                }
            });
        }
        
        return { success: true, data: summary };
    } catch (error) {
        console.error('Exception calcul revenus:', error);
        return { success: false, error: error.message };
    }
}

/* ========================================
   FONCTIONS SUPABASE - VIDÉOS ET VUES
   ======================================== */

// Enregistrer une vue vidéo (appelé par le système de tracking)
async function recordVideoView(videoId, creatorId, videoDuration) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const isEligible = videoDuration > 60; // > 60 secondes
        
        // Vérifier si une entrée existe déjà pour aujourd'hui
        const { data: existing, error: checkError } = await supabase
            .from('video_views')
            .select('*')
            .eq('video_id', videoId)
            .eq('period_date', today)
            .single();
        
        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Erreur vérification vue:', checkError);
        }
        
        if (existing) {
            // Incrémenter le compteur
            const { data, error } = await supabase
                .from('video_views')
                .update({
                    view_count: existing.view_count + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();
            
            if (error) {
                console.error('Erreur mise à jour vue:', error);
                return { success: false, error: error.message };
            }
            
            return { success: true, data: data };
        } else {
            // Créer une nouvelle entrée
            const { data, error } = await supabase
                .from('video_views')
                .insert({
                    video_id: videoId,
                    creator_id: creatorId,
                    view_count: 1,
                    eligible: isEligible,
                    video_duration: videoDuration,
                    period_date: today,
                    period_month: today.substring(0, 7) + '-01'
                })
                .select()
                .single();
            
            if (error) {
                console.error('Erreur création vue:', error);
                return { success: false, error: error.message };
            }
            
            return { success: true, data: data };
        }
    } catch (error) {
        console.error('Exception enregistrement vue:', error);
        return { success: false, error: error.message };
    }
}

// Récupérer les statistiques vidéo d'un créateur
async function getCreatorVideoStats(creatorId, period = 'month') {
    try {
        let startDate;
        const now = new Date();
        
        switch (period) {
            case 'day':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            default:
                startDate = null;
        }
        
        let query = supabase
            .from('video_views')
            .select('*')
            .eq('creator_id', creatorId)
            .eq('eligible', true);
        
        if (startDate) {
            query = query.gte('period_date', startDate.toISOString().split('T')[0]);
        }
        
        const { data, error } = await query;
        
        if (error) {
            console.error('Erreur stats vidéo:', error);
            return { success: false, error: error.message };
        }
        
        const stats = {
            totalViews: 0,
            totalEligibleViews: 0,
            videoCount: 0,
            estimatedRevenue: 0
        };
        
        if (data) {
            const uniqueVideos = new Set();
            data.forEach(view => {
                stats.totalViews += view.view_count || 0;
                if (view.eligible) {
                    stats.totalEligibleViews += view.view_count || 0;
                }
                uniqueVideos.add(view.video_id);
            });
            stats.videoCount = uniqueVideos.size;
            stats.estimatedRevenue = (stats.totalEligibleViews / 1000) * PLANS.PRO.rpmRate * 0.8; // 80% net
        }
        
        return { success: true, data: stats };
    } catch (error) {
        console.error('Exception stats vidéo:', error);
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
            .from('video_payouts')
            .select('*')
            .eq('creator_id', creatorId);
        
        if (options.status) {
            query = query.eq('status', options.status);
        }
        
        query = query.order('period_month', { ascending: false });
        
        if (options.limit) {
            query = query.limit(options.limit);
        }
        
        const { data, error } = await query;
        
        if (error) {
            console.error('Erreur récupération payouts:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Exception récupération payouts:', error);
        return { success: false, error: error.message };
    }
}

/* ========================================
   FONCTIONS PAYAPAY - INTÉGRATION
   ======================================== */

// Créer une session de paiement pour un soutien
async function createSupportPaymentSession(fromUserId, toUserId, amount, description = '') {
    try {
        // Vérifier que le créateur peut recevoir des soutiens
        const { data: creator } = await getUserProfile(toUserId);
        if (!canReceiveSupport(creator.data)) {
            return { 
                success: false, 
                error: 'Ce créateur ne peut pas recevoir de soutiens.' 
            };
        }
        
        // Créer la transaction en pending
        const { data: transaction, error: txError } = await createSupportTransaction(
            fromUserId, 
            toUserId, 
            amount, 
            description
        );
        
        if (txError || !transaction.success) {
            return { 
                success: false, 
                error: transaction?.error || txError || 'Erreur création transaction' 
            };
        }
        
        // Appeler l'API Payapay (à implémenter selon leur documentation)
        const payapaySession = await createPayapayPaymentSession({
            amount: amount,
            currency: 'USD',
            description: `Soutien à ${creator.data?.name || 'créateur'}`,
            metadata: {
                transaction_id: transaction.data.id,
                from_user_id: fromUserId,
                to_user_id: toUserId,
                type: 'support'
            },
            application_fee_amount: amount * PAYAPAY_CONFIG.commissionRate
        });
        
        if (!payapaySession.success) {
            // Mettre à jour la transaction comme échouée
            await supabase
                .from('transactions')
                .update({ status: 'failed' })
                .eq('id', transaction.data.id);
            
            return { success: false, error: payapaySession.error };
        }
        
        // Mettre à jour la transaction avec l'ID Payapay
        await supabase
            .from('transactions')
            .update({ 
                payapay_payment_id: payapaySession.paymentId,
                metadata: { session_url: payapaySession.url }
            })
            .eq('id', transaction.data.id);
        
        return { 
            success: true, 
            data: {
                transactionId: transaction.data.id,
                paymentUrl: payapaySession.url,
                sessionId: payapaySession.sessionId
            }
        };
    } catch (error) {
        console.error('Exception création session paiement:', error);
        return { success: false, error: error.message };
    }
}

// Créer un abonnement Payapay
async function createPayapaySubscription(userId, planId) {
    try {
        const plan = PLANS[planId.toUpperCase()];
        if (!plan) {
            return { success: false, error: 'Plan invalide' };
        }
        
        // Récupérer l'utilisateur
        const { data: user } = await getUserProfile(userId);
        
        // Appeler l'API Payapay pour créer l'abonnement
        const subscription = await createPayapaySubscriptionRequest({
            customer_id: user.data?.payapay_customer_id,
            plan_id: plan.id,
            metadata: {
                user_id: userId,
                plan: planId.toLowerCase()
            }
        });
        
        if (!subscription.success) {
            return { success: false, error: subscription.error };
        }
        
        // Enregistrer l'abonnement dans Supabase
        const { data: subData, error: subError } = await supabase
            .from('subscriptions')
            .insert({
                user_id: userId,
                plan: planId.toLowerCase(),
                status: 'active',
                payapay_subscription_id: subscription.subscriptionId,
                payapay_customer_id: subscription.customerId,
                current_period_end: subscription.currentPeriodEnd
            })
            .select()
            .single();
        
        if (subError) {
            console.error('Erreur enregistrement abonnement:', subError);
            return { success: false, error: subError.message };
        }
        
        // Mettre à jour le profil utilisateur
        await updateUserPlan(userId, planId.toLowerCase(), 'active');
        
        return { 
            success: true, 
            data: {
                subscription: subData,
                paymentUrl: subscription.paymentUrl
            }
        };
    } catch (error) {
        console.error('Exception création abonnement:', error);
        return { success: false, error: error.message };
    }
}

// Simuler les appels API Payapay (à remplacer par les vrais appels)
async function createPayapayPaymentSession(params) {
    // TODO: Implémenter selon la documentation Payapay
    console.log('Creating Payapay payment session:', params);
    
    // Simulation
    return {
        success: true,
        sessionId: 'sess_' + Math.random().toString(36).substr(2, 9),
        paymentId: 'pay_' + Math.random().toString(36).substr(2, 9),
        url: 'https://pay.payapay.com/session/' + Math.random().toString(36).substr(2, 9)
    };
}

async function createPayapaySubscriptionRequest(params) {
    // TODO: Implémenter selon la documentation Payapay
    console.log('Creating Payapay subscription:', params);
    
    // Simulation
    return {
        success: true,
        subscriptionId: 'sub_' + Math.random().toString(36).substr(2, 9),
        customerId: params.customer_id || 'cus_' + Math.random().toString(36).substr(2, 9),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        paymentUrl: 'https://pay.payapay.com/subscribe/' + Math.random().toString(36).substr(2, 9)
    };
}

/* ========================================
   FONCTIONS WEBHOOK - GESTION DES ÉVÉNEMENTS PAYAPAY
   ======================================== */

// Gérer un webhook Payapay
async function handlePayapayWebhook(event) {
    try {
        switch (event.type) {
            case 'payment.succeeded':
                await handlePaymentSucceeded(event.data);
                break;
            case 'payment.failed':
                await handlePaymentFailed(event.data);
                break;
            case 'subscription.created':
                await handleSubscriptionCreated(event.data);
                break;
            case 'subscription.updated':
                await handleSubscriptionUpdated(event.data);
                break;
            case 'subscription.canceled':
                await handleSubscriptionCanceled(event.data);
                break;
            case 'subscription.past_due':
                await handleSubscriptionPastDue(event.data);
                break;
            default:
                console.log('Unhandled webhook event:', event.type);
        }
        
        return { success: true };
    } catch (error) {
        console.error('Exception webhook:', error);
        return { success: false, error: error.message };
    }
}

// Paiement réussi
async function handlePaymentSucceeded(data) {
    const { payment_id, transaction_id } = data;
    
    // Mettre à jour la transaction
    const { error } = await supabase
        .from('transactions')
        .update({ 
            status: 'succeeded',
            updated_at: new Date().toISOString()
        })
        .eq('payapay_payment_id', payment_id);
    
    if (error) {
        console.error('Erreur mise à jour transaction:', error);
    }
    
    // TODO: Envoyer une notification au créateur
    // TODO: Créditer le compte du créateur
}

// Paiement échoué
async function handlePaymentFailed(data) {
    const { payment_id } = data;
    
    const { error } = await supabase
        .from('transactions')
        .update({ 
            status: 'failed',
            updated_at: new Date().toISOString()
        })
        .eq('payapay_payment_id', payment_id);
    
    if (error) {
        console.error('Erreur mise à jour transaction:', error);
    }
}

// Abonnement créé
async function handleSubscriptionCreated(data) {
    console.log('Subscription created:', data);
}

// Abonnement mis à jour
async function handleSubscriptionUpdated(data) {
    const { subscription_id, status, current_period_end } = data;
    
    const { error } = await supabase
        .from('subscriptions')
        .update({
            status: status,
            current_period_end: current_period_end,
            updated_at: new Date().toISOString()
        })
        .eq('payapay_subscription_id', subscription_id);
    
    if (error) {
        console.error('Erreur mise à jour abonnement:', error);
    }
}

// Abonnement annulé
async function handleSubscriptionCanceled(data) {
    const { subscription_id } = data;
    
    const { data: subscription, error: fetchError } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('payapay_subscription_id', subscription_id)
        .single();
    
    if (fetchError) {
        console.error('Erreur récupération abonnement:', fetchError);
        return;
    }
    
    // Mettre à jour l'abonnement
    await supabase
        .from('subscriptions')
        .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('payapay_subscription_id', subscription_id);
    
    // Mettre à jour le profil utilisateur
    await supabase
        .from('users')
        .update({
            plan: 'free',
            plan_status: 'canceled',
            is_monetized: false
        })
        .eq('id', subscription.user_id);
}

// Abonnement en retard de paiement
async function handleSubscriptionPastDue(data) {
    const { subscription_id } = data;
    
    await supabase
        .from('subscriptions')
        .update({
            status: 'past_due',
            updated_at: new Date().toISOString()
        })
        .eq('payapay_subscription_id', subscription_id);
}

/* ========================================
   FONCTIONS UI - RENDU DES ÉLÉMENTS
   ======================================== */

// Générer le badge de plan
function renderPlanBadge(plan, isMonetized) {
    const planConfig = PLANS[plan?.toUpperCase()] || PLANS.FREE;
    const badgeClass = plan === 'pro' ? 'badge-pro' : plan === 'medium' ? 'badge-medium' : 'badge-standard';
    
    return `
        <span class="plan-badge ${badgeClass}">
            ${planConfig.name}
            ${isMonetized ? '<i class="fas fa-check-circle"></i>' : ''}
        </span>
    `;
}

// Générer le bouton de soutien
function renderSupportButton(creator, options = {}) {
    const canSupport = canReceiveSupport(creator);
    const size = options.size || 'medium';
    
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
    
    return amounts.map(amount => `
        <button class="amount-btn" data-amount="${amount}" onclick="selectSupportAmount(${amount})">
            $${amount}
        </button>
    `).join('');
}

/* ========================================
   EXPORTS
   ======================================== */

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PLANS,
        PAYAPAY_CONFIG,
        canReceiveSupport,
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
        createPayapaySubscription,
        handlePayapayWebhook,
        renderPlanBadge,
        renderSupportButton,
        renderSupportAmounts
    };
}
