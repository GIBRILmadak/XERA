/* ========================================
   SUBSCRIPTION PLANS PAGE - Gestion des plans d'abonnement
   ======================================== */

let selectedPlan = null;
let currentUser = null;
let billingCycle = 'monthly';
const ANNUAL_DISCOUNT = 0.20;

document.addEventListener('DOMContentLoaded', () => {
    setupBillingToggle();
    applyBillingCycle(billingCycle);
    initPlansPage().catch(error => {
        console.error('Erreur initialisation page plans:', error);
    });
});

async function initPlansPage() {
    try {
        // Vérifier l'authentification
        const user = await checkAuth();
        if (!user) {
            if (window.XeraRouter?.navigate) {
                window.XeraRouter.navigate('login', {
                    query: { redirect: 'subscription-plans' },
                });
            } else {
                window.location.href = 'login.html?redirect=subscription-plans.html';
            }
            return;
        }
        
        // Charger le profil utilisateur
        const profileResult = await getUserProfile(user.id);
        if (profileResult?.success && profileResult.data) {
            currentUser = profileResult.data;
            updateNavAvatar(profileResult.data.avatar);
            highlightCurrentPlan(profileResult.data.plan);
        } else {
            // Fallback: autoriser l'achat même si le profil n'est pas encore créé
            currentUser = {
                id: user.id,
                plan: 'free',
                plan_status: 'inactive'
            };
            const fallbackAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.avatar;
            updateNavAvatar(fallbackAvatar);
        }

    } catch (error) {
        console.error('Erreur initialisation page plans:', error);
    }
}

function setupBillingToggle() {
    const toggle = document.querySelector('.billing-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', (event) => {
        const btn = event.target.closest('.billing-btn');
        if (!btn) return;
        const cycle = btn.getAttribute('data-cycle');
        if (cycle) applyBillingCycle(cycle);
    });
}

function applyBillingCycle(cycle) {
    billingCycle = cycle === 'annual' ? 'annual' : 'monthly';
    document.querySelectorAll('.billing-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-cycle') === billingCycle;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('.plan-detail-card .price').forEach(priceEl => {
        const monthly = parseFloat(priceEl.getAttribute('data-monthly'));
        if (Number.isNaN(monthly)) return;
        const annualBase = monthly * 12;
        const price = billingCycle === 'annual'
            ? annualBase * (1 - ANNUAL_DISCOUNT)
            : monthly;
        const suffix = billingCycle === 'annual' ? '/an' : '/mois';
        const format = typeof formatCurrency === 'function'
            ? formatCurrency
            : (value) => `$${value.toFixed(2)}`;
        const savingsNote = billingCycle === 'annual'
            ? `<small class="annual-savings">au lieu de ${format(annualBase)}/an</small>`
            : '';
        priceEl.innerHTML = `${format(price)}<span>${suffix}</span>${savingsNote}`;
    });
}

// Mettre à jour l'avatar dans la navigation
function updateNavAvatar(avatarUrl) {
    const navAvatar = document.getElementById('navAvatar');
    if (navAvatar && avatarUrl) {
        navAvatar.src = avatarUrl;
    }
}

// Mettre en évidence le plan actuel
function highlightCurrentPlan(currentPlan) {
    if (!currentPlan || currentPlan === 'free') return;
    
    const planCards = document.querySelectorAll('.plan-detail-card');
    planCards.forEach(card => {
        const planType = card.classList.contains('standard') ? 'standard' :
                        card.classList.contains('medium') ? 'medium' :
                        card.classList.contains('pro') ? 'pro' : null;
        
        if (planType === currentPlan) {
            const btn = card.querySelector('.btn-subscribe');
            btn.innerHTML = '<i class="fas fa-check"></i> Plan actuel';
            btn.disabled = true;
            btn.classList.add('btn-current');
            
            // Ajouter un badge
            const badge = document.createElement('div');
            badge.className = 'current-plan-badge';
            badge.innerHTML = '<i class="fas fa-check-circle"></i> Votre plan actuel';
            badge.style.marginBottom = '15px';
            card.insertBefore(badge, card.querySelector('h3'));
        }
    });
}

// Sélectionner un plan d'abonnement
async function selectSubscription(planId) {
    if (!currentUser) {
        showNotification('Veuillez vous connecter pour souscrire à un plan', 'error');
        return;
    }
    
    // Vérifier si c'est déjà le plan actuel
    if (currentUser.plan === planId) {
        showNotification('Vous avez déjà ce plan actif', 'info');
        return;
    }
    
    if (window.XeraRouter?.navigate) {
        window.XeraRouter.navigate('subscriptionPayment', {
            query: { plan: planId, billing: billingCycle },
        });
    } else {
        const url = new URL('subscription-payment.html', window.location.href);
        url.searchParams.set('plan', planId);
        url.searchParams.set('billing', billingCycle);
        window.location.href = url.toString();
    }
}

// Traiter l'abonnement
async function processSubscription() {
    if (!selectedPlan || !currentUser) return;
    
    try {
        if (window.XeraRouter?.navigate) {
            window.XeraRouter.navigate('subscriptionPayment', {
                query: { plan: selectedPlan, billing: billingCycle },
            });
        } else {
            const url = new URL('subscription-payment.html', window.location.href);
            url.searchParams.set('plan', selectedPlan);
            url.searchParams.set('billing', billingCycle);
            window.location.href = url.toString();
        }
    } catch (error) {
        console.error('Exception traitement abonnement:', error);
        showNotification('Une erreur est survenue lors du traitement', 'error');
    }
}

// Fermer le modal de confirmation
function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
        modal.classList.remove('active');
    }
    selectedPlan = null;
}

// Toggle FAQ
function toggleFaq(button) {
    const answer = button.nextElementSibling;
    const isActive = button.classList.contains('active');
    
    // Fermer tous les autres
    document.querySelectorAll('.faq-question').forEach(q => q.classList.remove('active'));
    document.querySelectorAll('.faq-answer').forEach(a => a.classList.remove('show'));
    
    // Ouvrir celui-ci si ce n'était pas déjà ouvert
    if (!isActive) {
        button.classList.add('active');
        answer.classList.add('show');
    }
}

// Notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    
    notification.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Fermer les modals en cliquant à l'extérieur
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Gérer le retour après paiement
async function handlePaymentReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const plan = urlParams.get('plan');
    
    if (status === 'success' && plan) {
        showNotification(`Félicitations ! Votre abonnement ${plan} est maintenant actif.`, 'success');
        
        // Mettre à jour le plan de l'utilisateur
        if (currentUser) {
            await updateUserPlan(currentUser.id, plan, 'active');
            highlightCurrentPlan(plan);
        }
        
        // Rediriger vers le dashboard après 2 secondes
        setTimeout(() => {
            if (window.XeraRouter?.navigate) {
                window.XeraRouter.navigate('creatorDashboard');
            } else {
                window.location.href = 'creator-dashboard.html';
            }
        }, 2000);
    } else if (status === 'canceled') {
        showNotification('Le paiement a été annulé. Vous pouvez réessayer quand vous voulez.', 'info');
    } else if (status === 'error') {
        showNotification('Une erreur est survenue lors du paiement. Veuillez réessayer.', 'error');
    }
}

// Vérifier le retour de paiement au chargement
document.addEventListener('DOMContentLoaded', () => {
    handlePaymentReturn();
});
