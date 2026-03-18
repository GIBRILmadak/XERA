/* ========================================
   CREATOR DASHBOARD - Interface de gestion des revenus
   ======================================== */

// État global
document.addEventListener('DOMContentLoaded', async () => {
    await initDashboard();
});

async function initDashboard() {
    try {
        // Vérifier l'authentification
        const user = await checkAuth();
        if (!user) {
            if (window.XeraRouter?.navigate) {
                window.XeraRouter.navigate('login', {
                    query: { redirect: 'creator-dashboard' },
                });
            } else {
                window.location.href = 'login.html?redirect=creator-dashboard.html';
            }
            return;
        }
        
        // Charger le profil utilisateur
        const { data: profile } = await getUserProfile(user.id);
        if (!profile) {
            showError('Impossible de charger votre profil');
            return;
        }
        
        window.currentUser = profile;
        
        // Mettre à jour l'avatar dans la nav
        updateNavAvatar(profile.avatar);
        
        // Afficher le bouton upgrade si nécessaire
        updateUpgradeButton(profile);
        
        // Mettre à jour le statut de monétisation
        updateMonetizationStatus(profile);
        
        // Mettre à jour les conditions requises
        updateRequirements(profile);
        
        // Charger les revenus
        await loadRevenueData(profile.id);
        
        // Charger les statistiques vidéo (si Pro)
        if (canMonetizeVideos(profile)) {
            await loadVideoStats(profile.id);
        }
        
        // Charger les transactions
        await loadTransactions(profile.id);
        
        // Charger les payouts
        await loadPayouts(profile.id);
        
        // Configurer les filtres
        setupFilters();
        
    } catch (error) {
        console.error('Erreur initialisation dashboard:', error);
        showError('Une erreur est survenue lors du chargement du dashboard');
    }
}

// Mettre à jour l'avatar dans la navigation
function updateNavAvatar(avatarUrl) {
    const navAvatar = document.getElementById('navAvatar');
    if (navAvatar && avatarUrl) {
        navAvatar.src = avatarUrl;
    }
}

// Mettre à jour le bouton d'upgrade
function updateUpgradeButton(profile) {
    const upgradeBtn = document.getElementById('upgradePlanBtn');
    if (!upgradeBtn) return;
    
    if (!canReceiveSupport(profile)) {
        upgradeBtn.style.display = 'block';
        upgradeBtn.onclick = () => openUpgradeModal();
    } else {
        upgradeBtn.style.display = 'none';
    }
}

// Mettre à jour le statut de monétisation
function updateMonetizationStatus(profile) {
    const statusSection = document.getElementById('monetizationStatus');
    const statusText = document.getElementById('statusText');
    const statusActions = document.getElementById('statusActions');
    
    if (!statusSection || !statusText) return;
    
    const isMonetized = canReceiveSupport(profile);
    const canMonetizeVid = canMonetizeVideos(profile);
    
    if (isMonetized) {
        statusSection.classList.add('active');
        statusSection.classList.remove('inactive');
        
        if (canMonetizeVid) {
            statusText.innerHTML = `
                <span class="status-badge active">
                    <i class="fas fa-check-circle"></i> Monétisation complète activée
                </span>
                <span class="status-detail">Vous pouvez recevoir des soutiens et monétiser vos vidéos</span>
            `;
        } else {
            statusText.innerHTML = `
                <span class="status-badge active">
                    <i class="fas fa-check-circle"></i> Soutiens activés
                </span>
                <span class="status-detail">Vous pouvez recevoir des soutiens. Passez à Pro pour monétiser vos vidéos.</span>
            `;
        }
        
        statusActions.innerHTML = `
            <a href="subscription-plans.html" class="btn-secondary">
                <i class="fas fa-cog"></i> Gérer mon abonnement
            </a>
        `;
    } else {
        statusSection.classList.add('inactive');
        statusSection.classList.remove('active');
        
        let missing = [];
        if (profile.plan !== 'medium' && profile.plan !== 'pro') {
            missing.push('abonnement Medium ou Pro');
        }
        if ((profile.followers_count || 0) < 1000) {
            missing.push('1000 abonnés');
        }
        
        statusText.innerHTML = `
            <span class="status-badge inactive">
                <i class="fas fa-lock"></i> Monétisation non activée
            </span>
            <span class="status-detail">Manque: ${missing.join(', ')}</span>
        `;
        
        statusActions.innerHTML = `
            <button class="btn-primary" onclick="openUpgradeModal()">
                <i class="fas fa-rocket"></i> Activer la monétisation
            </button>
        `;
    }
}

// Mettre à jour les conditions requises
function updateRequirements(profile) {
    const reqPlan = document.getElementById('reqPlan');
    const reqFollowers = document.getElementById('reqFollowers');
    const reqKyc = document.getElementById('reqKyc');
    const followersStatus = document.getElementById('followersStatus');
    const planEnd = profile.plan_ends_at || profile.planEndsAt || null;
    const planEndMs = planEnd ? Date.parse(planEnd) : null;
    const activeByDate =
        !planEnd || (Number.isFinite(planEndMs) ? planEndMs > Date.now() : true);
    
    if (followersStatus) {
        const count = profile.followers_count || 0;
        followersStatus.textContent = `${count} / 1000`;
    }
    
    // Mettre à jour les icônes selon l'état
    if (reqPlan) {
        const hasPlan =
            (profile.plan === 'medium' || profile.plan === 'pro') &&
            profile.plan_status === 'active' &&
            activeByDate;
        reqPlan.querySelector('i').className = hasPlan ? 'fas fa-check-circle' : 'fas fa-circle';
        reqPlan.classList.toggle('completed', hasPlan);
        reqPlan.querySelector('.req-status').textContent = hasPlan ? 'Atteint' : 'Non atteint';
    }
    
    if (reqFollowers) {
        const hasFollowers = (profile.followers_count || 0) >= 1000;
        reqFollowers.querySelector('i').className = hasFollowers ? 'fas fa-check-circle' : 'fas fa-circle';
        reqFollowers.classList.toggle('completed', hasFollowers);
    }
    
    if (reqKyc) {
        const hasKyc =
            profile.is_monetized === true ||
            (profile.plan_status === 'active' && activeByDate);
        reqKyc.querySelector('i').className = hasKyc ? 'fas fa-check-circle' : 'fas fa-circle';
        reqKyc.classList.toggle('completed', hasKyc);
        reqKyc.querySelector('.req-status').textContent = hasKyc ? 'Vérifié' : 'Non vérifié';
    }
}

// Charger les données de revenus
async function loadRevenueData(userId, period = 'all') {
    try {
        // Calculer les dates selon la période
        let startDate, endDate;
        const now = new Date();
        
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
                break;
            case '7':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                break;
            case '30':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                break;
            default:
                startDate = null;
        }
        
        endDate = now.toISOString();
        
        // Récupérer les transactions
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('to_user_id', userId)
            .eq('status', 'succeeded');
        
        if (error) {
            console.error('Erreur chargement revenus:', error);
            return;
        }
        
        // Filtrer par période si nécessaire
        let filteredTransactions = transactions || [];
        if (startDate) {
            filteredTransactions = filteredTransactions.filter(tx => 
                new Date(tx.created_at) >= new Date(startDate)
            );
        }
        
        // Calculer les totaux
        let totalGross = 0;
        let totalNet = 0;
        let totalCommission = 0;
        let supportRevenue = 0;
        let videoRevenue = 0;
        let supportCount = 0;
        let videoCount = 0;
        
        filteredTransactions.forEach(tx => {
            const gross = parseFloat(tx.amount_gross || 0);
            const net = parseFloat(tx.amount_net_creator || 0);
            const commission = parseFloat(tx.amount_commission_xera || 0);
            
            totalGross += gross;
            totalNet += net;
            totalCommission += commission;
            
            if (tx.type === 'support') {
                supportRevenue += net;
                supportCount++;
            } else if (tx.type === 'video_rpm') {
                videoRevenue += net;
                videoCount++;
            }
        });
        
        // Mettre à jour l'UI
        document.getElementById('totalRevenue').textContent = formatCurrency(totalGross);
        document.getElementById('supportRevenue').textContent = formatCurrency(supportRevenue);
        document.getElementById('supportCount').textContent = `${supportCount} transaction${supportCount !== 1 ? 's' : ''}`;
        document.getElementById('videoRevenue').textContent = formatCurrency(videoRevenue);
        document.getElementById('commissionAmount').textContent = formatCurrency(totalCommission);
        document.getElementById('netRevenue').textContent = formatCurrency(totalNet);
        
        // Mettre à jour les stats vidéo dans la card
        document.getElementById('videoStats').textContent = `${videoCount} paiement${videoCount !== 1 ? 's' : ''}`;
        
    } catch (error) {
        console.error('Exception chargement revenus:', error);
    }
}

// Charger les statistiques vidéo
async function loadVideoStats(userId) {
    try {
        const videoSection = document.getElementById('videoStatsSection');
        if (videoSection) {
            videoSection.style.display = 'block';
        }
        
        const { data: stats, error } = await getCreatorVideoStats(userId, 'month');
        
        if (error) {
            console.error('Erreur stats vidéo:', error);
            return;
        }
        
        if (stats) {
            document.getElementById('totalViews').textContent = stats.totalViews.toLocaleString();
            document.getElementById('eligibleViews').textContent = stats.totalEligibleViews.toLocaleString();
            document.getElementById('videoCount').textContent = stats.videoCount;
            document.getElementById('estimatedRevenue').textContent = formatCurrency(stats.estimatedRevenue);
        }
        
    } catch (error) {
        console.error('Exception stats vidéo:', error);
    }
}

// Charger les transactions
async function loadTransactions(userId, options = {}) {
    try {
        const { data: transactions, error } = await getCreatorTransactions(userId, {
            limit: 50,
            ...options
        });
        
        if (error) {
            console.error('Erreur chargement transactions:', error);
            return;
        }
        
        const tbody = document.getElementById('transactionsBody');
        if (!tbody) return;
        
        if (!transactions || transactions.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">Aucune transaction pour le moment</td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = transactions.map(tx => {
            const date = new Date(tx.created_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const typeLabels = {
                'support': '<i class="fas fa-heart"></i> Soutien',
                'video_rpm': '<i class="fas fa-video"></i> Vidéo',
                'subscription': '<i class="fas fa-crown"></i> Abonnement',
                'other': 'Autre'
            };
            
            const statusLabels = {
                'succeeded': '<span class="status-success">Réussi</span>',
                'pending': '<span class="status-pending">En attente</span>',
                'failed': '<span class="status-failed">Échoué</span>',
                'refunded': '<span class="status-refunded">Remboursé</span>'
            };
            
            return `
                <tr>
                    <td>${date}</td>
                    <td>${typeLabels[tx.type] || tx.type}</td>
                    <td>${formatCurrency(tx.amount_gross)}</td>
                    <td>${formatCurrency(tx.amount_commission_xera)}</td>
                    <td><strong>${formatCurrency(tx.amount_net_creator)}</strong></td>
                    <td>${statusLabels[tx.status] || tx.status}</td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Exception chargement transactions:', error);
    }
}

// Charger les payouts vidéo
async function loadPayouts(userId) {
    try {
        const { data: payouts, error } = await getCreatorVideoPayouts(userId);
        
        if (error) {
            console.error('Erreur chargement payouts:', error);
            return;
        }
        
        const tbody = document.getElementById('payoutsBody');
        if (!tbody) return;
        
        if (!payouts || payouts.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">Aucun paiement pour le moment</td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = payouts.map(payout => {
            const monthDate = new Date(payout.period_month);
            const monthLabel = monthDate.toLocaleDateString('fr-FR', {
                month: 'long',
                year: 'numeric'
            });
            
            const statusLabels = {
                'pending': '<span class="status-pending">En attente</span>',
                'processing': '<span class="status-processing">En cours</span>',
                'paid': '<span class="status-paid">Payé</span>',
                'failed': '<span class="status-failed">Échoué</span>'
            };
            
            return `
                <tr>
                    <td>${monthLabel}</td>
                    <td>${payout.views.toLocaleString()}</td>
                    <td>$${payout.rpm_rate}/1000</td>
                    <td>${formatCurrency(payout.amount_gross)}</td>
                    <td><strong>${formatCurrency(payout.amount_net_creator)}</strong></td>
                    <td>${statusLabels[payout.status] || payout.status}</td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Exception chargement payouts:', error);
    }
}

// Configurer les filtres
function setupFilters() {
    // Filtres de période pour les revenus
    const periodBtns = document.querySelectorAll('.period-filter .filter-btn');
    periodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            periodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const period = btn.dataset.period;
            loadRevenueData(window.currentUser.id, period);
        });
    });
    
    // Filtre de type pour les transactions
    const typeFilter = document.getElementById('transactionTypeFilter');
    if (typeFilter) {
        typeFilter.addEventListener('change', () => {
            const type = typeFilter.value;
            const options = type === 'all' ? {} : { type };
            loadTransactions(window.currentUser.id, options);
        });
    }
}

// Modal d'upgrade
function openUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Sélection d'un plan
async function selectPlan(planId) {
    try {
        if (window.XeraRouter?.navigate) {
            window.XeraRouter.navigate('subscriptionPayment', {
                query: { plan: planId, billing: 'monthly' },
            });
        } else {
            const url = new URL('subscription-payment.html', window.location.href);
            url.searchParams.set('plan', planId);
            url.searchParams.set('billing', 'monthly');
            window.location.href = url.toString();
        }
    } catch (error) {
        console.error('Exception sélection plan:', error);
        showError('Une erreur est survenue');
    }
}

// Modal de soutien
let selectedSupportAmount = 0;
let selectedCreatorId = null;

function openSupportModal(creatorId) {
    selectedCreatorId = creatorId;
    selectedSupportAmount = 0;
    
    const modal = document.getElementById('supportModal');
    const amountOptions = document.getElementById('amountOptions');
    
    if (amountOptions) {
        amountOptions.innerHTML = renderSupportAmounts();
        
        // Ajouter les event listeners
        amountOptions.querySelectorAll('.amount-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                amountOptions.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectSupportAmount(parseFloat(btn.dataset.amount));
            });
        });
    }
    
    if (modal) {
        modal.classList.add('active');
    }
    
    updateSupportSummary();
}

function closeSupportModal() {
    const modal = document.getElementById('supportModal');
    if (modal) {
        modal.classList.remove('active');
    }
    selectedSupportAmount = 0;
    selectedCreatorId = null;
}

function selectSupportAmount(amount) {
    selectedSupportAmount = amount;
    document.getElementById('customAmount').value = '';
    updateSupportSummary();
}

function updateSupportSummary() {
    const customAmount = parseFloat(document.getElementById('customAmount')?.value || 0);
    const amount = selectedSupportAmount || customAmount || 0;
    
    const amountEl = document.getElementById('summaryAmount');
    if (amountEl) amountEl.textContent = formatCurrency(amount);
}

// Écouter le changement du montant personnalisé
document.addEventListener('DOMContentLoaded', () => {
    const customAmountInput = document.getElementById('customAmount');
    if (customAmountInput) {
        customAmountInput.addEventListener('input', () => {
            selectedSupportAmount = 0;
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
            updateSupportSummary();
        });
    }
});

// Traiter le soutien
async function processSupport() {
    try {
        const customAmount = parseFloat(document.getElementById('customAmount')?.value || 0);
        const amount = selectedSupportAmount || customAmount;
        
        if (!amount || amount < 1) {
            showError('Veuillez sélectionner ou entrer un montant valide (minimum $1)');
            return;
        }
        
        if (amount > 1000) {
            showError('Le montant maximum est de $1000');
            return;
        }
        
        const result = await createSupportPaymentSession(
            window.currentUser.id,
            selectedCreatorId,
            amount,
            'Soutien depuis le dashboard'
        );
        
        if (result.success && result.data.paymentUrl) {
            window.location.href = result.data.paymentUrl;
        } else {
            showError(result.error || 'Erreur lors de la création du paiement');
        }
    } catch (error) {
        console.error('Exception traitement soutien:', error);
        showError('Une erreur est survenue lors du traitement du paiement');
    }
}

// Fonctions utilitaires
function showError(message) {
    // Créer une notification d'erreur
    const notification = document.createElement('div');
    notification.className = 'notification notification-error';
    notification.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function showSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'notification notification-success';
    notification.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Fermer les modals en cliquant à l'extérieur
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});
