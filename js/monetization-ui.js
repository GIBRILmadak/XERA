/* ========================================
   MONÉTISATION UI INTEGRATION
   Intégration des badges et boutons de soutien dans les profils et contenus
   ======================================== */

let monetizationUiInitialized = false;

function handleSupportButtonClick(e) {
    const supportBtn = e.target.closest('.support-btn-active');
    if (!supportBtn) return;

    const creatorId = supportBtn.dataset.creatorId;
    const creatorName = supportBtn.dataset.creatorName || 'Créateur';

    if (!creatorId) return;

    e.preventDefault();
    e.stopPropagation();
    openSupportModal(creatorId, creatorName, supportBtn);
}

function resolveSupportCreatorName(creatorName, sourceElement = null) {
    const resolvedName = String(
        creatorName || sourceElement?.dataset?.creatorName || '',
    ).trim();
    return resolvedName || 'Créateur';
}

// Initialiser la monétisation sur la page
function initMonetizationUI() {
    if (monetizationUiInitialized) return;
    monetizationUiInitialized = true;

    // Injecter le CSS si pas déjà présent
    if (!document.getElementById('monetization-css')) {
        const link = document.createElement('link');
        link.id = 'monetization-css';
        link.rel = 'stylesheet';
        link.href = 'css/monetization.css';
        document.head.appendChild(link);
    }
    
    // Ajouter les écouteurs pour les boutons de soutien
    document.addEventListener('click', handleSupportButtonClick);
}

// Générer le HTML pour le badge de plan
function generatePlanBadgeHTML(user, context = 'profile') {
    if (!user || !user.plan || user.plan === 'free') return '';
    if (String(user.plan_status || '').toLowerCase() !== 'active') return '';
    if (typeof isPlanActiveForUser === 'function' && !isPlanActiveForUser(user)) {
        return '';
    }
    if (context !== 'profile') {
        return '';
    }
    
    const planColors = {
        standard: '#3498db',
        medium: '#9b59b6',
        pro: '#f39c12'
    };
    
    const planLabels = {
        standard: 'Standard',
        medium: 'Medium',
        pro: 'Pro'
    };
    
    const color = planColors[user.plan] || '#95a5a6';
    const label = planLabels[user.plan] || user.plan;
    const hasMonetization =
        user.is_monetized === true ||
        (typeof isGiftedPro === 'function' && isGiftedPro(user));
    const verified = hasMonetization
        ? '<i class="fas fa-check-circle" title="Monétisation activée"></i>'
        : '';
    
    return `
        <span class="user-plan-badge" style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 10px;
            background: ${color};
            color: white;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-left: 8px;
            vertical-align: middle;
        ">
            ${label}
            ${verified}
        </span>
    `;
}

// Générer le bouton de soutien
function generateSupportButtonHTML(user, context = 'profile') {
    const canSupport = canReceiveSupport(user);
    const size = context === 'profile' ? 'large' : 'large';
    
    if (!canSupport) {
        return '';
    }

    const buttonClass = `support-btn support-btn-active support-btn-profile ${size}`;
    const labelHtml = '<span class="support-btn-label">Soutenir</span>';
    const creatorId = String(user.id || '');
    const creatorName = escapeSupportHtmlAttr(user.name || 'Créateur');
    const supportContext = escapeSupportHtmlAttr(context || 'profile');

    return `
        <button class="${buttonClass}" 
                data-creator-id="${creatorId}"
                data-creator-name="${creatorName}"
                data-support-context="${supportContext}"
                title="Soutenir ce créateur"
                aria-label="Soutenir ce créateur">
            <img src="icons/soutien.svg" alt="" class="support-icon-img">
            ${labelHtml}
        </button>
    `;
}

function escapeSupportHtmlAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Générer une modale de soutien
function createSupportModal() {
    if (document.getElementById('support-modal-global')) return;
    
    const modal = document.createElement('div');
    modal.id = 'support-modal-global';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content support-modal-content">
            <div class="modal-header">
                <h2>Soutenir <span id="support-creator-name"></span></h2>
                <button class="close-btn" onclick="closeGlobalSupportModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <p class="support-desc">Choisissez un montant pour montrer votre soutien</p>
                <div class="amount-options" id="global-amount-options">
                    <button class="amount-btn" data-amount="1" onclick="selectGlobalSupportAmount(1)">$1</button>
                    <button class="amount-btn" data-amount="3" onclick="selectGlobalSupportAmount(3)">$3</button>
                    <button class="amount-btn" data-amount="5" onclick="selectGlobalSupportAmount(5)">$5</button>
                    <button class="amount-btn" data-amount="10" onclick="selectGlobalSupportAmount(10)">$10</button>
                    <button class="amount-btn" data-amount="25" onclick="selectGlobalSupportAmount(25)">$25</button>
                    <button class="amount-btn" data-amount="50" onclick="selectGlobalSupportAmount(50)">$50</button>
                </div>
                <div class="custom-amount">
                    <label>Montant personnalisé ($)</label>
                    <input type="number" id="global-custom-amount" min="1" max="1000" step="1" placeholder="Entrez un montant" oninput="handleGlobalCustomAmount()">
                </div>
                <div class="support-summary">
                    <div class="summary-row">
                        <span>Montant</span>
                        <span id="global-summary-amount">$0.00</span>
                    </div>
                </div>
                <button class="btn-primary btn-full" id="global-support-submit" onclick="processGlobalSupport()" disabled>
                    <i class="fas fa-heart"></i> Envoyer le soutien
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fermer en cliquant à l'extérieur
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeGlobalSupportModal();
        }
    });
}

// Variables globales pour la modale
let globalSupportState = {
    creatorId: null,
    creatorName: '',
    amount: 0,
    returnPath: '',
};

// Ouvrir la modale de soutien globale
function openSupportModal(creatorId, creatorName, sourceElement = null) {
    createSupportModal();

    const resolvedCreatorName = resolveSupportCreatorName(
        creatorName,
        sourceElement,
    );
    
    globalSupportState = {
        creatorId,
        creatorName: resolvedCreatorName,
        amount: 0,
        returnPath:
            typeof buildSupportReturnPath === 'function'
                ? buildSupportReturnPath(sourceElement)
                : `${window.location.pathname}${window.location.search}${window.location.hash}`,
    };
    
    const creatorNameEl = document.getElementById('support-creator-name');
    if (creatorNameEl) {
        creatorNameEl.textContent = resolvedCreatorName;
    }
    
    // Réinitialiser la sélection
    document.querySelectorAll('#global-amount-options .amount-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.getElementById('global-custom-amount').value = '';
    updateGlobalSupportSummary();
    
    const modal = document.getElementById('support-modal-global');
    if (modal) {
        modal.classList.add('active');
    }
}

// Fermer la modale globale
function closeGlobalSupportModal() {
    const modal = document.getElementById('support-modal-global');
    if (modal) {
        modal.classList.remove('active');
    }
    globalSupportState.amount = 0;
}

// Sélectionner un montant prédéfini
function selectGlobalSupportAmount(amount) {
    globalSupportState.amount = amount;
    
    // Mettre à jour l'UI
    document.querySelectorAll('#global-amount-options .amount-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (parseFloat(btn.dataset.amount) === amount) {
            btn.classList.add('selected');
        }
    });
    
    // Réinitialiser le custom
    document.getElementById('global-custom-amount').value = '';
    
    updateGlobalSupportSummary();
}

// Gérer le montant personnalisé
function handleGlobalCustomAmount() {
    const input = document.getElementById('global-custom-amount');
    const value = parseFloat(input.value) || 0;
    
    // Réinitialiser les boutons
    document.querySelectorAll('#global-amount-options .amount-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    globalSupportState.amount = value;
    updateGlobalSupportSummary();
}

// Mettre à jour le résumé
function updateGlobalSupportSummary() {
    const amount = globalSupportState.amount || 0;
    
    const amountEl = document.getElementById('global-summary-amount');
    if (amountEl) amountEl.textContent = formatCurrency(amount);
    
    // Activer/désactiver le bouton
    const submitBtn = document.getElementById('global-support-submit');
    if (Number.isInteger(amount) && amount >= 1 && amount <= 1000) {
        submitBtn.disabled = false;
    } else {
        submitBtn.disabled = true;
    }
}

// Traiter le soutien
async function processGlobalSupport() {
    const { creatorId, amount } = globalSupportState;
    
    if (!creatorId || amount < 1) {
        showGlobalNotification('Veuillez sélectionner un montant valide', 'error');
        return;
    }
    
    try {
        // Vérifier si l'utilisateur est connecté
        const currentUser = await checkAuth();
        if (!currentUser) {
            showGlobalNotification('Veuillez vous connecter pour envoyer un soutien', 'error');
            window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
            return;
        }

        const submitBtn = document.getElementById('global-support-submit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';
        }

        const result = redirectToSupportCheckout({
            creatorId,
            creatorName: globalSupportState.creatorName,
            amount,
            description: 'Soutien depuis le profil',
            returnPath: globalSupportState.returnPath,
        });

        if (result.success) {
            closeGlobalSupportModal();
        } else {
            showGlobalNotification(result.error || 'Erreur lors du traitement', 'error');
        }
    } catch (error) {
        console.error('Exception traitement soutien:', error);
        showGlobalNotification('Une erreur est survenue', 'error');
    } finally {
        const submitBtn = document.getElementById('global-support-submit');
        if (submitBtn) {
            submitBtn.disabled = !(
                Number.isInteger(amount) &&
                amount >= 1 &&
                amount <= 1000
            );
            submitBtn.innerHTML = '<i class="fas fa-heart"></i> Envoyer le soutien';
        }
    }
}

// Afficher une notification globale
function showGlobalNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    const colors = {
        success: '#27ae60',
        error: '#e74c3c',
        info: '#3498db'
    };
    
    notification.style.background = colors[type] || colors.info;
    notification.style.color = 'white';
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    
    notification.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Intégrer la monétisation dans un profil
function integrateMonetizationInProfile(profileElement, user) {
    if (!profileElement || !user) return;
    
    // Ajouter le badge de plan
    const nameElement = profileElement.querySelector('.profile-name, .user-name, h1, h2');
    if (nameElement && user.plan && user.plan !== 'free') {
        const badgeHTML = generatePlanBadgeHTML(user, 'profile');
        if (!nameElement.querySelector('.user-plan-badge')) {
            nameElement.insertAdjacentHTML('beforeend', badgeHTML);
        }
    }
    
    // Ajouter le bouton de soutien
    const actionsElement = profileElement.querySelector('.profile-actions, .user-actions');
    if (actionsElement) {
        const supportHTML = generateSupportButtonHTML(user, 'profile');
        if (supportHTML && !actionsElement.querySelector('.support-btn')) {
            actionsElement.insertAdjacentHTML('beforeend', supportHTML);
        }
    }
}

// Intégrer la monétisation dans une carte de contenu
function integrateMonetizationInContentCard(cardElement, user) {
    if (!cardElement || !user) return;
    
    // Ajouter le badge de plan sur le nom de l'auteur
    const authorElement = cardElement.querySelector('.content-author, .post-author');
    if (authorElement && user.plan && user.plan !== 'free') {
        const badgeHTML = generatePlanBadgeHTML(user, 'feed');
        if (!authorElement.querySelector('.user-plan-badge')) {
            authorElement.insertAdjacentHTML('beforeend', badgeHTML);
        }
    }
    
    // Ajouter le bouton de soutien dans les actions
    const actionsElement = cardElement.querySelector('.content-actions, .post-actions');
    if (actionsElement) {
        const supportHTML = generateSupportButtonHTML(user, 'feed');
        if (supportHTML && !actionsElement.querySelector('.support-btn')) {
            actionsElement.insertAdjacentHTML('beforeend', supportHTML);
        }
    }
}

// Fonction utilitaire pour récupérer et afficher les infos de monétisation
document.addEventListener('DOMContentLoaded', () => {
    initMonetizationUI();
    createSupportModal();
});

window.initMonetizationUI = initMonetizationUI;
window.openSupportModal = openSupportModal;
window.closeGlobalSupportModal = closeGlobalSupportModal;
window.selectGlobalSupportAmount = selectGlobalSupportAmount;
window.handleGlobalCustomAmount = handleGlobalCustomAmount;
window.processGlobalSupport = processGlobalSupport;
window.integrateMonetizationInProfile = integrateMonetizationInProfile;
window.integrateMonetizationInContentCard = integrateMonetizationInContentCard;
