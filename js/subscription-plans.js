/* ========================================
   SUBSCRIPTION PLANS PAGE - Gestion des plans d'abonnement
   ======================================== */

let selectedPlan = null;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initPlansPage();
});

async function initPlansPage() {
    try {
        // Vérifier l'authentification
        const user = await checkAuth();
        if (!user) {
            window.location.href = 'login.html?redirect=subscription-plans.html';
            return;
        }
        
        // Charger le profil utilisateur
        const { data: profile } = await getUserProfile(user.id);
        if (profile) {
            currentUser = profile;
            updateNavAvatar(profile.avatar);
            highlightCurrentPlan(profile.plan);
        }
        
    } catch (error) {
        console.error('Erreur initialisation page plans:', error);
    }
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
            btn.style.background = '#27ae60';
            
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
    
    selectedPlan = planId;
    
    // Afficher les détails dans le modal
    const planDetails = document.getElementById('confirmPlanDetails');
    const plan = PLANS[planId.toUpperCase()];
    
    if (planDetails && plan) {
        planDetails.innerHTML = `
            <div class="plan-summary">
                <h3>${plan.name}</h3>
                <div class="plan-price-large">${formatCurrency(plan.price)}<span>/mois</span></div>
                <ul class="plan-mini-features">
                    ${plan.features.slice(0, 3).map(f => `<li><i class="fas fa-check"></i> ${f}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    // Ouvrir le modal
    const modal = document.getElementById('confirmModal');
    if (modal) {
        modal.classList.add('active');
    }
}

// Traiter l'abonnement
async function processSubscription() {
    if (!selectedPlan || !currentUser) return;
    
    try {
        const result = await createPayapaySubscription(currentUser.id, selectedPlan);
        
        if (result.success && result.data.paymentUrl) {
            // Rediriger vers Payapay pour le paiement
            window.location.href = result.data.paymentUrl;
        } else {
            showNotification(result.error || 'Erreur lors de la création de l\'abonnement', 'error');
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
            window.location.href = 'creator-dashboard.html';
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
