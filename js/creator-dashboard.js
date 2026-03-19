/* ========================================
   CREATOR DASHBOARD - Interface de gestion des revenus
   ======================================== */

// État global
window.creatorWalletOverview = null;
window.payoutSettingsPanelOpen = true;
window.payoutSettingsSubmitting = false;
window.creatorDashboardRealtimeChannels = [];
window.creatorDashboardRefreshTimer = null;
window.creatorDashboardPollingTimer = null;
window.creatorDashboardLastSupportNotificationId = null;

document.addEventListener("DOMContentLoaded", async () => {
    if (window.initI18n) {
        await window.initI18n();
    }
    await initDashboard();
});

function buildDashboardRouteUrl(routeName, options = {}) {
    if (window.XeraRouter?.buildHtmlUrl) {
        return window.XeraRouter.buildHtmlUrl(routeName, options);
    }
    if (window.XeraRouter?.buildUrl) {
        return window.XeraRouter.buildUrl(routeName, options);
    }

    const fallbackMap = {
        discover: "index.html",
        login: "login.html",
        profile: "profile.html",
        creatorDashboard: "creator-dashboard.html",
        subscriptionPlans: "subscription-plans.html",
    };

    const basePath = fallbackMap[routeName] || "index.html";
    const url = new URL(basePath, window.location.href);
    const query = options?.query || {};
    Object.entries(query).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") return;
        url.searchParams.set(key, String(value));
    });
    return url.toString();
}

function navigateTo(pageId) {
    const routeMap = {
        discover: "discover",
        login: "login",
        profile: "profile",
        creatorDashboard: "creatorDashboard",
        subscriptionPlans: "subscriptionPlans",
    };
    const routeName = routeMap[pageId] || "discover";
    window.location.href = buildDashboardRouteUrl(routeName);
}

async function handleProfileNavigation() {
    const userId = window.currentUser?.id || window.currentUserId || null;
    if (!userId) {
        window.location.href = buildDashboardRouteUrl("login", {
            query: { redirect: "creator-dashboard" },
        });
        return;
    }
    window.location.href = buildDashboardRouteUrl("profile", {
        query: { user: userId },
    });
}

function openMessagesPage() {
    window.location.href = buildDashboardRouteUrl("discover");
}

function toggleNotificationPanel() {
    window.location.href = buildDashboardRouteUrl("discover");
}

window.navigateTo = navigateTo;
window.handleProfileNavigation = handleProfileNavigation;
window.openMessagesPage = openMessagesPage;
window.toggleNotificationPanel = toggleNotificationPanel;

function resolveDashboardApiBaseUrl() {
    // Utilisation de chemins relatifs pour Vercel
    return "";
}

async function getDashboardAccessToken() {
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

async function fetchDashboardApiJson(path, options = {}) {
    const accessToken = await getDashboardAccessToken();
    const apiBase = resolveDashboardApiBaseUrl();

    let response;
    try {
        response = await fetch(`${apiBase}${path}`, {
            method: options.method || "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...(options.body ? { "Content-Type": "application/json" } : {}),
            },
            body: options.body,
        });
    } catch (error) {
        console.error("Fetch API error:", error);
        throw new Error(
            "Impossible de contacter le serveur de monétisation (Vérifiez les fonctions Vercel).",
        );
    }

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }

    if (!response.ok) {
        throw new Error(payload?.error || "Erreur API monétisation.");
    }

    return payload;
}

function cleanupDashboardRealtime() {
    const channels = Array.isArray(window.creatorDashboardRealtimeChannels)
        ? window.creatorDashboardRealtimeChannels
        : [];
    channels.forEach((channel) => {
        try {
            supabase.removeChannel(channel);
        } catch (error) {
            // ignore cleanup errors
        }
    });
    window.creatorDashboardRealtimeChannels = [];
    if (window.creatorDashboardRefreshTimer) {
        clearTimeout(window.creatorDashboardRefreshTimer);
        window.creatorDashboardRefreshTimer = null;
    }
    if (window.creatorDashboardPollingTimer) {
        clearInterval(window.creatorDashboardPollingTimer);
        window.creatorDashboardPollingTimer = null;
    }
}

function scheduleDashboardRealtimeRefresh(userId) {
    if (!userId) return;
    if (window.creatorDashboardRefreshTimer) {
        clearTimeout(window.creatorDashboardRefreshTimer);
    }

    window.creatorDashboardRefreshTimer = setTimeout(async () => {
        try {
            await Promise.all([
                refreshWalletData(),
                loadRevenueData(userId),
                loadTransactions(userId),
            ]);
        } catch (error) {
            console.error("Erreur refresh realtime dashboard:", error);
        }
    }, 900);
}

async function syncDashboardSupportNotification(userId, options = {}) {
    if (!userId) return;

    try {
        const { data, error } = await supabase
            .from("notifications")
            .select("id, type, message, created_at")
            .eq("user_id", userId)
            .eq("type", "support")
            .order("created_at", { ascending: false })
            .limit(1);

        if (error) throw error;

        const latestNotification = data?.[0] || null;
        if (!latestNotification?.id) return;

        if (!window.creatorDashboardLastSupportNotificationId) {
            window.creatorDashboardLastSupportNotificationId =
                latestNotification.id;
            return;
        }

        if (
            window.creatorDashboardLastSupportNotificationId ===
            latestNotification.id
        ) {
            return;
        }

        window.creatorDashboardLastSupportNotificationId =
            latestNotification.id;
        if (options.silent !== true && latestNotification.message) {
            showSuccess(latestNotification.message);
        }
    } catch (error) {
        console.warn("Erreur sync notification soutien dashboard:", error);
    }
}

function subscribeDashboardRealtime(userId) {
    cleanupDashboardRealtime();
    if (!userId || !supabase?.channel) return;

    const transactionsChannel = supabase
        .channel(`creator-dashboard-transactions-${userId}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "transactions",
                filter: `to_user_id=eq.${userId}`,
            },
            (payload) => {
                const next = payload?.new || payload?.old || {};
                if (
                    !["support", "video_rpm", "subscription"].includes(
                        next.type,
                    )
                ) {
                    return;
                }
                scheduleDashboardRealtimeRefresh(userId);
            },
        )
        .subscribe();

    const notificationsChannel = supabase
        .channel(`creator-dashboard-notifications-${userId}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter: `user_id=eq.${userId}`,
            },
            (payload) => {
                const notification = payload?.new || null;
                if (!notification) return;
                if (notification.type === "support" && notification.message) {
                    window.creatorDashboardLastSupportNotificationId =
                        notification.id ||
                        window.creatorDashboardLastSupportNotificationId;
                    showSuccess(notification.message);
                }
            },
        )
        .subscribe();

    const withdrawalsChannel = supabase
        .channel(`creator-dashboard-withdrawals-${userId}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "withdrawal_requests",
                filter: `creator_id=eq.${userId}`,
            },
            () => {
                scheduleDashboardRealtimeRefresh(userId);
            },
        )
        .subscribe();

    const payoutSettingsChannel = supabase
        .channel(`creator-dashboard-payout-settings-${userId}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "creator_payout_settings",
                filter: `user_id=eq.${userId}`,
            },
            () => {
                scheduleDashboardRealtimeRefresh(userId);
            },
        )
        .subscribe();

    window.creatorDashboardRealtimeChannels = [
        transactionsChannel,
        notificationsChannel,
        withdrawalsChannel,
        payoutSettingsChannel,
    ];
}

function startDashboardAutoRefresh(userId) {
    if (window.creatorDashboardPollingTimer) {
        clearInterval(window.creatorDashboardPollingTimer);
    }
    if (!userId) return;

    window.creatorDashboardPollingTimer = setInterval(() => {
        scheduleDashboardRealtimeRefresh(userId);
        syncDashboardSupportNotification(userId);
    }, 30000);
}

window.addEventListener("beforeunload", cleanupDashboardRealtime);

function setWalletNotice(message, level = "info") {
    const notice = document.getElementById("walletNotice");
    if (!notice) return;
    notice.className = "wallet-alert";
    if (level === "success" || level === "warning" || level === "error") {
        notice.classList.add(level);
    }
    notice.textContent = message;
}

function formatDateTime(value) {
    if (!value) return "—";
    try {
        return new Date(value).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch (error) {
        return value;
    }
}

function escapeWalletHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function isDateOnOrAfter(value, startDate) {
    if (!startDate) return true;
    if (!value) return false;
    const dateValue = new Date(value);
    const start = new Date(startDate);
    return Number.isFinite(dateValue.getTime()) && dateValue >= start;
}

function getVideoPayoutReferenceDate(payout) {
    return (
        payout?.paid_at ||
        payout?.paidAt ||
        payout?.created_at ||
        payout?.createdAt ||
        payout?.period_month ||
        payout?.periodMonth ||
        null
    );
}

function renderDashboardIdentity(profile) {
    const container = document.getElementById("dashboardIdentity");
    if (!container || !profile) return;

    const avatar = escapeWalletHtml(
        profile.avatar ||
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'><rect width='48' height='48' rx='24' fill='%231f2937'/><circle cx='24' cy='19' r='7' fill='%23e5e7eb'/><path d='M12 40c3-7 9.5-10.5 12-10.5S33 33 36 40' fill='%23e5e7eb'/></svg>",
    );
    const name = escapeWalletHtml(profile.name || "Compte connecté");
    const plan = escapeWalletHtml(String(profile.plan || "free").toUpperCase());

    container.innerHTML = `
        <div class="dashboard-identity-card">
            <img src="${avatar}" alt="${name}" class="dashboard-identity-avatar">
            <div class="dashboard-identity-meta">
                <strong>${name}</strong>
                <span>${plan}</span>
            </div>
        </div>
    `;
}

function updateDashboardNavigation(profile) {
    const navAuth = document.getElementById("nav-auth");
    const navProfile = document.getElementById("nav-profile");
    const navMessages = document.getElementById("messages-nav-btn");
    const navNotifications = document.getElementById("notification-btn");

    if (navAuth) {
        navAuth.style.display = profile ? "none" : "block";
        navAuth.href = buildDashboardRouteUrl("login", {
            query: { redirect: "creator-dashboard" },
        });
    }

    if (navProfile) {
        navProfile.style.display = profile ? "flex" : "none";
        navProfile.title = profile
            ? `Profil de ${profile.name || "vous"}`
            : "My Trajectory";
    }

    if (navMessages) navMessages.style.display = "none";
    if (navNotifications) navNotifications.style.display = "none";
}

function formatWithdrawalStatus(status) {
    const map = {
        pending: '<span class="status-pending">En attente</span>',
        processing: '<span class="status-processing">En traitement</span>',
        paid: '<span class="status-paid">Payé</span>',
        rejected: '<span class="status-failed">Refusé</span>',
        canceled: '<span class="status-refunded">Annulé</span>',
    };
    return map[status] || status;
}

function renderWithdrawalTable(withdrawals = []) {
    const tbody = document.getElementById("withdrawalsBody");
    if (!tbody) return;

    if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">Aucune demande de retrait pour le moment</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = withdrawals
        .map((item) => {
            const provider = escapeWalletHtml(
                item.providerLabel || item.provider || "Mobile Money",
            );
            const account = item.accountName
                ? `${escapeWalletHtml(item.accountName)}<br><small>${escapeWalletHtml(item.walletNumber || "")}</small>`
                : escapeWalletHtml(item.walletNumber || "—");
            const operatorRef = escapeWalletHtml(item.operatorRefId || "—");
            return `
            <tr>
                <td>${formatDateTime(item.requestedAt || item.createdAt)}</td>
                <td><strong>${formatCurrency(item.amountUsd || 0)}</strong></td>
                <td>${provider}</td>
                <td>${account}</td>
                <td>${formatWithdrawalStatus(item.status)}</td>
                <td>${operatorRef}</td>
            </tr>
        `;
        })
        .join("");
}

function hydratePayoutSettingsForm(payoutSettings) {
    const provider = document.getElementById("payoutProvider");
    const accountName = document.getElementById("payoutAccountName");
    const walletNumber = document.getElementById("payoutWalletNumber");
    const countryCode = document.getElementById("payoutCountryCode");
    const notes = document.getElementById("payoutNotes");
    const status = document.getElementById("payoutSettingsStatus");

    if (provider) provider.value = payoutSettings?.provider || "airtel_money";
    if (accountName) accountName.value = payoutSettings?.accountName || "";
    if (walletNumber) walletNumber.value = payoutSettings?.walletNumber || "";
    if (countryCode) countryCode.value = payoutSettings?.countryCode || "CD";
    if (notes) notes.value = payoutSettings?.notes || "";

    if (status) {
        status.textContent = payoutSettings?.walletNumber
            ? `Compte ${payoutSettings.status === "inactive" ? "inactif" : "actif"}: ${payoutSettings.providerLabel || payoutSettings.provider} • ${payoutSettings.walletNumber}`
            : "Aucun compte configuré.";
    }
}

function renderPayoutSettingsSummary(payoutSettings) {
    const summary = document.getElementById("payoutSettingsSummary");
    if (!summary) return;

    if (!payoutSettings?.walletNumber) {
        summary.style.display = "none";
        summary.innerHTML = "";
        return;
    }

    const provider = escapeWalletHtml(
        payoutSettings.providerLabel ||
            payoutSettings.provider ||
            "Mobile Money",
    );
    const accountName = escapeWalletHtml(
        payoutSettings.accountName || "Titulaire non renseigné",
    );
    const walletNumber = escapeWalletHtml(payoutSettings.walletNumber);
    const statusLabel =
        payoutSettings.status === "inactive" ? "Inactif" : "Actif";

    summary.style.display = "block";
    summary.innerHTML = `
        <strong>Compte enregistré</strong>
        <span>${provider} • ${accountName} • ${walletNumber} • ${statusLabel}</span>
    `;
}

function setPayoutSettingsPanelOpen(isOpen) {
    const panel = document.getElementById("payoutSettingsPanel");
    const toggleBtn = document.getElementById("payoutSettingsToggleBtn");
    const hasSavedWallet = Boolean(
        window.creatorWalletOverview?.payoutSettings?.walletNumber,
    );

    window.payoutSettingsPanelOpen = isOpen;

    if (panel) {
        panel.classList.toggle("is-open", isOpen);
        panel.classList.toggle("is-collapsed", !isOpen);
    }

    if (toggleBtn) {
        toggleBtn.style.display = hasSavedWallet ? "inline-flex" : "none";
        toggleBtn.innerHTML = isOpen
            ? '<i class="fas fa-eye-slash"></i> Masquer'
            : '<i class="fas fa-pen"></i> Modifier';
    }
}

function syncPayoutSettingsPanel(payoutSettings) {
    const hasSavedWallet = Boolean(payoutSettings?.walletNumber);
    if (!hasSavedWallet) {
        setPayoutSettingsPanelOpen(true);
        return;
    }

    if (window.payoutSettingsSubmitting) {
        setPayoutSettingsPanelOpen(true);
        return;
    }

    setPayoutSettingsPanelOpen(false);
}

function togglePayoutSettingsPanel() {
    const hasSavedWallet = Boolean(
        window.creatorWalletOverview?.payoutSettings?.walletNumber,
    );
    if (!hasSavedWallet) {
        setPayoutSettingsPanelOpen(true);
        return;
    }

    setPayoutSettingsPanelOpen(!window.payoutSettingsPanelOpen);
}

window.togglePayoutSettingsPanel = togglePayoutSettingsPanel;

function setPayoutSettingsSubmitting(isSubmitting) {
    window.payoutSettingsSubmitting = isSubmitting;

    const form = document.getElementById("payoutSettingsForm");
    const submitBtn = document.getElementById("payoutSettingsSubmitBtn");
    const toggleBtn = document.getElementById("payoutSettingsToggleBtn");
    const fields = form
        ? form.querySelectorAll("input, select, textarea, button")
        : [];

    if (form) {
        form.classList.toggle("is-submitting", isSubmitting);
    }

    fields.forEach((field) => {
        if (field === submitBtn) return;
        field.disabled = isSubmitting;
    });

    if (submitBtn) {
        submitBtn.disabled = isSubmitting;
        submitBtn.innerHTML = isSubmitting
            ? '<i class="fas fa-spinner fa-spin"></i> Enregistrement...'
            : '<i class="fas fa-floppy-disk"></i> Enregistrer le compte';
    }

    if (toggleBtn) {
        toggleBtn.disabled = isSubmitting;
    }
}

function renderWalletOverviewUI(overview) {
    window.creatorWalletOverview = overview || null;
    const wallet = overview?.wallet || {};
    const payoutSettings = overview?.payoutSettings || null;
    const withdrawals = overview?.withdrawals || [];

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText(
        "walletAvailableBalance",
        formatCurrency(wallet.availableBalance || 0),
    );
    setText(
        "availableBalanceHeader",
        formatCurrency(wallet.availableBalance || 0),
    );
    setText(
        "walletPendingIncoming",
        formatCurrency(wallet.pendingIncoming || 0),
    );
    setText(
        "walletPendingWithdrawals",
        formatCurrency(wallet.pendingWithdrawals || 0),
    );
    setText(
        "walletPaidWithdrawals",
        formatCurrency(wallet.paidWithdrawals || 0),
    );
    setText(
        "walletMinimumMeta",
        `Retrait minimum: ${formatCurrency(wallet.minimumWithdrawalUsd || 5)}`,
    );

    const withdrawalAvailable = document.getElementById("withdrawalAvailable");
    if (withdrawalAvailable) {
        withdrawalAvailable.value = formatCurrency(
            wallet.availableBalance || 0,
        );
    }

    const withdrawalSubmitBtn = document.getElementById("withdrawalSubmitBtn");
    if (withdrawalSubmitBtn) {
        withdrawalSubmitBtn.disabled = !wallet.canRequestWithdrawal;
    }

    const withdrawalAmount = document.getElementById("withdrawalAmount");
    if (withdrawalAmount) {
        const availableBalance = Number(wallet.availableBalance || 0);
        withdrawalAmount.disabled = !wallet.canRequestWithdrawal;
        withdrawalAmount.max =
            availableBalance > 0 ? availableBalance.toFixed(2) : "";
        if (!wallet.canRequestWithdrawal) {
            withdrawalAmount.value = "";
        }
    }

    const withdrawalNote = document.getElementById("withdrawalNote");
    if (withdrawalNote) {
        withdrawalNote.disabled = !wallet.canRequestWithdrawal;
    }

    hydratePayoutSettingsForm(payoutSettings);
    renderPayoutSettingsSummary(payoutSettings);
    syncPayoutSettingsPanel(payoutSettings);
    renderWithdrawalTable(withdrawals);

    if (!payoutSettings?.walletNumber) {
        setWalletNotice(
            "Enregistrez votre compte Mobile Money pour pouvoir demander un retrait.",
            "warning",
        );
        return;
    }
    if (payoutSettings.status && payoutSettings.status !== "active") {
        setWalletNotice(
            "Votre compte Mobile Money est inactif. Reenregistrez-le avant de demander un retrait.",
            "warning",
        );
        return;
    }
    if ((wallet.availableBalance || 0) < (wallet.minimumWithdrawalUsd || 5)) {
        setWalletNotice(
            `Votre solde disponible est inférieur au minimum de retrait (${formatCurrency(wallet.minimumWithdrawalUsd || 5)}).`,
            "warning",
        );
        return;
    }

    setWalletNotice(
        "Votre portefeuille est prêt. Toute nouvelle demande sera envoyée à l’équipe pour validation.",
        "success",
    );
}

async function refreshWalletData() {
    const refreshBtn = document.getElementById("walletRefreshBtn");
    if (refreshBtn) refreshBtn.disabled = true;

    try {
        setWalletNotice("Chargement du portefeuille...", "info");
        const payload = await fetchDashboardApiJson(
            "/api/monetization/overview",
        );
        renderWalletOverviewUI(payload);
    } catch (error) {
        console.error("Erreur chargement portefeuille:", error);
        setWalletNotice(
            error?.message || "Impossible de charger le portefeuille.",
            "error",
        );
    } finally {
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

async function savePayoutSettings(event) {
    event.preventDefault();
    if (window.payoutSettingsSubmitting) return;

    const provider = document.getElementById("payoutProvider")?.value || "";
    const accountName =
        document.getElementById("payoutAccountName")?.value || "";
    const walletNumber =
        document.getElementById("payoutWalletNumber")?.value || "";
    const countryCode =
        document.getElementById("payoutCountryCode")?.value || "CD";
    const notes = document.getElementById("payoutNotes")?.value || "";

    if (!provider || !accountName.trim() || !walletNumber.trim()) {
        showError(
            "Renseignez le fournisseur, le titulaire et le numero Mobile Money.",
        );
        return;
    }

    try {
        setPayoutSettingsSubmitting(true);
        const payload = await fetchDashboardApiJson(
            "/api/monetization/payout-settings",
            {
                method: "POST",
                body: JSON.stringify({
                    provider,
                    account_name: accountName,
                    wallet_number: walletNumber,
                    country_code: countryCode,
                    notes,
                }),
            },
        );
        window.creatorWalletOverview = {
            ...(window.creatorWalletOverview || {}),
            payoutSettings: payload.payoutSettings,
        };
        hydratePayoutSettingsForm(payload.payoutSettings);
        renderPayoutSettingsSummary(payload.payoutSettings);
        await refreshWalletData();
        showSuccess("Compte Mobile Money enregistré");
    } catch (error) {
        console.error("Erreur sauvegarde payout settings:", error);
        showError(error?.message || "Impossible d'enregistrer le compte.");
    } finally {
        setPayoutSettingsSubmitting(false);
        syncPayoutSettingsPanel(
            window.creatorWalletOverview?.payoutSettings || null,
        );
    }
}

async function submitWithdrawalRequest(event) {
    event.preventDefault();

    const amount = parseFloat(
        document.getElementById("withdrawalAmount")?.value || 0,
    );
    const note = document.getElementById("withdrawalNote")?.value || "";
    const wallet = window.creatorWalletOverview?.wallet || {};
    const payoutSettings = window.creatorWalletOverview?.payoutSettings || null;
    const minimumWithdrawal = Number(wallet.minimumWithdrawalUsd || 5);
    const availableBalance = Number(wallet.availableBalance || 0);
    const submitBtn = document.getElementById("withdrawalSubmitBtn");

    if (!amount || amount <= 0) {
        showError("Entrez un montant de retrait valide.");
        return;
    }
    if (!payoutSettings?.walletNumber || payoutSettings?.status !== "active") {
        showError(
            "Enregistrez un compte Mobile Money actif avant de demander un retrait.",
        );
        return;
    }
    if (amount < minimumWithdrawal) {
        showError(
            `Le retrait minimum est de ${formatCurrency(minimumWithdrawal)}.`,
        );
        return;
    }
    if (amount > availableBalance) {
        showError("Le montant demande depasse votre solde disponible.");
        return;
    }

    try {
        if (submitBtn) submitBtn.disabled = true;
        await fetchDashboardApiJson("/api/monetization/withdrawals", {
            method: "POST",
            body: JSON.stringify({ amount, note }),
        });
        const amountInput = document.getElementById("withdrawalAmount");
        const noteInput = document.getElementById("withdrawalNote");
        if (amountInput) amountInput.value = "";
        if (noteInput) noteInput.value = "";
        await refreshWalletData();
        showSuccess("Demande de retrait envoyée");
    } catch (error) {
        console.error("Erreur demande retrait:", error);
        showError(
            error?.message || "Impossible de créer la demande de retrait.",
        );
    } finally {
        if (submitBtn) {
            submitBtn.disabled = !Boolean(
                window.creatorWalletOverview?.wallet?.canRequestWithdrawal,
            );
        }
    }
}

function fillMaxWithdrawal() {
    const input = document.getElementById("withdrawalAmount");
    const available = Number(
        window.creatorWalletOverview?.wallet?.availableBalance || 0,
    );
    if (!input || !available) return;
    input.value = available.toFixed(2);
}

function setupWalletForms() {
    const payoutForm = document.getElementById("payoutSettingsForm");
    if (payoutForm) {
        payoutForm.addEventListener("submit", savePayoutSettings);
    }

    const withdrawalForm = document.getElementById("withdrawalRequestForm");
    if (withdrawalForm) {
        withdrawalForm.addEventListener("submit", submitWithdrawalRequest);
    }
}

async function initDashboard() {
    try {
        // Vérifier l'authentification
        const user = await checkAuth();
        if (!user) {
            if (window.XeraRouter?.navigate) {
                window.XeraRouter.navigate("login", {
                    query: { redirect: "creator-dashboard" },
                });
            } else {
                window.location.href =
                    "login.html?redirect=creator-dashboard.html";
            }
            return;
        }

        // Charger le profil utilisateur
        const { data: profile } = await getUserProfile(user.id);
        if (!profile) {
            showError("Impossible de charger votre profil");
            return;
        }

        window.currentUser = profile;
        window.currentUserId = profile.id;
        renderDashboardIdentity(profile);
        updateDashboardNavigation(profile);

        // Mettre à jour l'avatar dans la nav
        updateNavAvatar(profile.avatar);

        // Afficher le bouton upgrade si nécessaire
        updateUpgradeButton(profile);

        // Mettre à jour le statut de monétisation
        updateMonetizationStatus(profile);

        // Initialiser les formulaires de portefeuille
        setupWalletForms();
        await refreshWalletData();

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
        await syncDashboardSupportNotification(profile.id, { silent: true });
        subscribeDashboardRealtime(profile.id);
        startDashboardAutoRefresh(profile.id);
    } catch (error) {
        console.error("Erreur initialisation dashboard:", error);
        showError("Une erreur est survenue lors du chargement du dashboard");
    }
}

// Mettre à jour l'avatar dans la navigation
function updateNavAvatar(avatarUrl) {
    if (!avatarUrl) return;
    if (typeof window.setNavProfileAvatar === "function") {
        window.setNavProfileAvatar(
            avatarUrl,
            window.currentUser?.id || window.currentUserId || null,
        );
        return;
    }
    const navAvatar =
        document.getElementById("nav-profile-avatar") ||
        document.getElementById("navAvatar");
    if (!navAvatar) return;
    const resolvedAvatar = String(avatarUrl).trim();
    if (!resolvedAvatar) return;
    navAvatar.src = resolvedAvatar;
}

// Mettre à jour le bouton d'upgrade
function updateUpgradeButton(profile) {
    const upgradeBtn = document.getElementById("upgradePlanBtn");
    if (!upgradeBtn) return;

    if (!hasActiveMonetizationPlan(profile)) {
        upgradeBtn.style.display = "block";
        upgradeBtn.onclick = () => openUpgradeModal();
    } else {
        upgradeBtn.style.display = "none";
    }
}

// Mettre à jour le statut de monétisation
function updateMonetizationStatus(profile) {
    const statusSection = document.getElementById("monetizationStatus");
    const statusText = document.getElementById("statusText");
    const statusActions = document.getElementById("statusActions");

    if (!statusSection || !statusText) return;

    const isMonetized = canReceiveSupport(profile);
    const canMonetizeVid = canMonetizeVideos(profile);
    const hasEligiblePlan = hasActiveMonetizationPlan(profile);
    const followerGap = getMonetizationFollowerGap(profile);

    if (isMonetized) {
        statusSection.classList.add("active");
        statusSection.classList.remove("inactive");

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
    } else if (hasEligiblePlan) {
        statusSection.classList.add("inactive");
        statusSection.classList.remove("active");

        const followerMessage =
            followerGap > 0
                ? `Il vous manque encore ${followerGap} abonné${followerGap > 1 ? "s" : ""} pour débloquer les soutiens et la monétisation.`
                : `Votre abonnement est actif, mais l'état de monétisation n'est pas encore synchronisé.`;

        statusText.innerHTML = `
            <span class="status-badge inactive">
                <i class="fas fa-hourglass-half"></i> Abonnement actif, monétisation en attente
            </span>
            <span class="status-detail">${followerMessage}</span>
        `;

        statusActions.innerHTML = `
            <a href="subscription-plans.html" class="btn-secondary">
                <i class="fas fa-cog"></i> Gérer mon abonnement
            </a>
        `;
    } else {
        statusSection.classList.add("inactive");
        statusSection.classList.remove("active");

        statusText.innerHTML = `
            <span class="status-badge inactive">
                <i class="fas fa-lock"></i> Monétisation non activée
            </span>
            <span class="status-detail">Ce compte n'a pas encore les soutiens actifs. Vous pouvez néanmoins configurer votre portefeuille et gérer vos retraits ici dès que le compte devient éligible.</span>
        `;

        statusActions.innerHTML = `
            <button class="btn-primary" onclick="openUpgradeModal()">
                <i class="fas fa-rocket"></i> Activer la monétisation
            </button>
        `;
    }
}

// Charger les données de revenus
async function loadRevenueData(userId, period = "all") {
    try {
        // Calculer les dates selon la période
        let startDate;
        const now = new Date();

        switch (period) {
            case "today":
                startDate = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                ).toISOString();
                break;
            case "7":
                startDate = new Date(
                    now.getTime() - 7 * 24 * 60 * 60 * 1000,
                ).toISOString();
                break;
            case "30":
                startDate = new Date(
                    now.getTime() - 30 * 24 * 60 * 60 * 1000,
                ).toISOString();
                break;
            default:
                startDate = null;
        }

        const [supportResult, videoTransactionsResult, videoPayoutsResult] =
            await Promise.all([
                supabase
                    .from("transactions")
                    .select("*")
                    .eq("to_user_id", userId)
                    .eq("status", "succeeded")
                    .eq("type", "support"),
                supabase
                    .from("transactions")
                    .select("*")
                    .eq("to_user_id", userId)
                    .eq("status", "succeeded")
                    .eq("type", "video_rpm"),
                supabase
                    .from("video_payouts")
                    .select("*")
                    .eq("creator_id", userId)
                    .in("status", ["pending", "processing", "paid"])
                    .order("period_month", { ascending: false }),
            ]);

        if (
            supportResult.error ||
            videoTransactionsResult.error ||
            videoPayoutsResult.error
        ) {
            console.error(
                "Erreur chargement revenus:",
                supportResult.error ||
                    videoTransactionsResult.error ||
                    videoPayoutsResult.error,
            );
            return;
        }

        const supportTransactions = (supportResult.data || []).filter((tx) =>
            isDateOnOrAfter(tx.created_at, startDate),
        );
        const videoTransactions = (videoTransactionsResult.data || []).filter(
            (tx) => isDateOnOrAfter(tx.created_at, startDate),
        );
        const paidVideoPayouts = (videoPayoutsResult.data || [])
            .filter((payout) => payout.status === "paid")
            .filter((payout) =>
                isDateOnOrAfter(getVideoPayoutReferenceDate(payout), startDate),
            );

        const useVideoTransactions = videoTransactions.length > 0;
        const creditedVideoEntries = useVideoTransactions
            ? videoTransactions
            : paidVideoPayouts;

        // Calculer les totaux
        let totalNet = 0;
        let supportRevenue = 0;
        let videoRevenue = 0;
        const supportCount = supportTransactions.length;
        const videoCount = creditedVideoEntries.length;

        supportTransactions.forEach((tx) => {
            const net = parseFloat(tx.amount_net_creator || 0);

            totalNet += net;
            supportRevenue += net;
        });

        creditedVideoEntries.forEach((entry) => {
            const net = parseFloat(entry.amount_net_creator || 0);
            totalNet += net;
            videoRevenue += net;
        });

        // Mettre à jour l'UI
        document.getElementById("totalRevenue").textContent =
            formatCurrency(totalNet);
        document.getElementById("supportRevenue").textContent =
            formatCurrency(supportRevenue);
        document.getElementById("supportCount").textContent =
            `${supportCount} transaction${supportCount !== 1 ? "s" : ""}`;
        document.getElementById("videoRevenue").textContent =
            formatCurrency(videoRevenue);
        document.getElementById("netRevenue").textContent =
            formatCurrency(totalNet);

        // Mettre à jour les stats vidéo dans la card
        document.getElementById("videoStats").textContent =
            `${videoCount} paiement${videoCount !== 1 ? "s" : ""} credite${videoCount !== 1 ? "s" : ""}`;
    } catch (error) {
        console.error("Exception chargement revenus:", error);
    }
}

// Charger les statistiques vidéo
async function loadVideoStats(userId) {
    try {
        const videoSection = document.getElementById("videoStatsSection");
        if (videoSection) {
            videoSection.style.display = "block";
        }

        const createBtn = document.getElementById("createVideoBtn");
        if (createBtn) {
            createBtn.onclick = (e) => {
                e.preventDefault();
                const uid =
                    window.currentUserId ||
                    window.currentUser?.id ||
                    profile?.id ||
                    userId;
                if (!uid) {
                    console.warn(
                        "Impossible de déterminer l’utilisateur courant pour créer une trace.",
                    );
                    return;
                }
                if (typeof window.openCreateMenu === "function") {
                    window.openCreateMenu(uid);
                } else {
                    window.location.href = "profile.html";
                }
            };
        }

        const { data: stats, error } = await getCreatorVideoStats(
            userId,
            "month",
        );

        if (error) {
            console.error("Erreur stats vidéo:", error);
            return;
        }

        if (stats) {
            document.getElementById("totalViews").textContent =
                stats.totalViews.toLocaleString();
            document.getElementById("eligibleViews").textContent =
                stats.totalEligibleViews.toLocaleString();
            document.getElementById("videoCount").textContent =
                stats.videoCount;
            document.getElementById("estimatedRevenue").textContent =
                formatCurrency(stats.estimatedRevenue);
        }
    } catch (error) {
        console.error("Exception stats vidéo:", error);
    }
}

// Charger les transactions
async function loadTransactions(userId, options = {}) {
    try {
        const { data: transactions, error } = await getCreatorTransactions(
            userId,
            {
                limit: 50,
                ...options,
            },
        );

        if (error) {
            console.error("Erreur chargement transactions:", error);
            return;
        }

        const tbody = document.getElementById("transactionsBody");
        if (!tbody) return;

        if (!transactions || transactions.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">Aucune transaction pour le moment</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = transactions
            .map((tx) => {
                const date = new Date(tx.created_at).toLocaleDateString(
                    "fr-FR",
                    {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                    },
                );

                const typeLabels = {
                    support: '<i class="fas fa-heart"></i> Soutien',
                    video_rpm: '<i class="fas fa-video"></i> Vidéo',
                    subscription: '<i class="fas fa-crown"></i> Abonnement',
                    other: "Autre",
                };

                const statusLabels = {
                    succeeded: '<span class="status-success">Réussi</span>',
                    pending: '<span class="status-pending">En attente</span>',
                    failed: '<span class="status-failed">Échoué</span>',
                    refunded: '<span class="status-refunded">Remboursé</span>',
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
            })
            .join("");
    } catch (error) {
        console.error("Exception chargement transactions:", error);
    }
}

// Charger les payouts vidéo
async function loadPayouts(userId) {
    try {
        const { data: payouts, error } = await getCreatorVideoPayouts(userId);

        if (error) {
            console.error("Erreur chargement payouts:", error);
            return;
        }

        const tbody = document.getElementById("payoutsBody");
        if (!tbody) return;

        if (!payouts || payouts.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">Aucun paiement pour le moment</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = payouts
            .map((payout) => {
                const monthDate = new Date(payout.period_month);
                const monthLabel = monthDate.toLocaleDateString("fr-FR", {
                    month: "long",
                    year: "numeric",
                });

                const statusLabels = {
                    pending: '<span class="status-pending">En attente</span>',
                    processing:
                        '<span class="status-processing">En cours</span>',
                    paid: '<span class="status-paid">Payé</span>',
                    failed: '<span class="status-failed">Échoué</span>',
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
            })
            .join("");
    } catch (error) {
        console.error("Exception chargement payouts:", error);
    }
}

// Configurer les filtres
function setupFilters() {
    // Filtres de période pour les revenus
    const periodBtns = document.querySelectorAll(".period-filter .filter-btn");
    periodBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            periodBtns.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            const period = btn.dataset.period;
            loadRevenueData(window.currentUser.id, period);
        });
    });

    // Filtre de type pour les transactions
    const typeFilter = document.getElementById("transactionTypeFilter");
    if (typeFilter) {
        typeFilter.addEventListener("change", () => {
            const type = typeFilter.value;
            const options = type === "all" ? {} : { type };
            loadTransactions(window.currentUser.id, options);
        });
    }
}

// Modal d'upgrade
function openUpgradeModal() {
    const modal = document.getElementById("upgradeModal");
    if (modal) {
        modal.classList.add("active");
    }
}

function closeUpgradeModal() {
    const modal = document.getElementById("upgradeModal");
    if (modal) {
        modal.classList.remove("active");
    }
}

// Sélection d'un plan
async function selectPlan(planId) {
    try {
        if (window.XeraRouter?.navigate) {
            window.XeraRouter.navigate("subscriptionPayment", {
                query: { plan: planId, billing: "monthly" },
            });
        } else {
            const url = new URL(
                "subscription-payment.html",
                window.location.href,
            );
            url.searchParams.set("plan", planId);
            url.searchParams.set("billing", "monthly");
            window.location.href = url.toString();
        }
    } catch (error) {
        console.error("Exception sélection plan:", error);
        showError("Une erreur est survenue");
    }
}

// Modal de soutien
let selectedSupportAmount = 0;
let selectedCreatorId = null;

function openSupportModal(creatorId) {
    selectedCreatorId = creatorId;
    selectedSupportAmount = 0;

    const modal = document.getElementById("supportModal");
    const amountOptions = document.getElementById("amountOptions");

    if (amountOptions) {
        amountOptions.innerHTML = renderSupportAmounts();

        // Ajouter les event listeners
        amountOptions.querySelectorAll(".amount-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                amountOptions
                    .querySelectorAll(".amount-btn")
                    .forEach((b) => b.classList.remove("selected"));
                btn.classList.add("selected");
                selectSupportAmount(parseFloat(btn.dataset.amount));
            });
        });
    }

    if (modal) {
        modal.classList.add("active");
    }

    updateSupportSummary();
}

function closeSupportModal() {
    const modal = document.getElementById("supportModal");
    if (modal) {
        modal.classList.remove("active");
    }
    selectedSupportAmount = 0;
    selectedCreatorId = null;
}

function selectSupportAmount(amount) {
    selectedSupportAmount = amount;
    document.getElementById("customAmount").value = "";
    updateSupportSummary();
}

function updateSupportSummary() {
    const customAmount = parseFloat(
        document.getElementById("customAmount")?.value || 0,
    );
    const amount = selectedSupportAmount || customAmount || 0;

    const amountEl = document.getElementById("summaryAmount");
    if (amountEl) amountEl.textContent = formatCurrency(amount);
}

// Écouter le changement du montant personnalisé
document.addEventListener("DOMContentLoaded", () => {
    const customAmountInput = document.getElementById("customAmount");
    if (customAmountInput) {
        customAmountInput.addEventListener("input", () => {
            selectedSupportAmount = 0;
            document
                .querySelectorAll(".amount-btn")
                .forEach((b) => b.classList.remove("selected"));
            updateSupportSummary();
        });
    }
});

// Traiter le soutien
async function processSupport() {
    try {
        const customAmount = parseFloat(
            document.getElementById("customAmount")?.value || 0,
        );
        const amount = selectedSupportAmount || customAmount;
        const submitBtn = document.querySelector(
            "#supportModal .btn-primary.btn-full",
        );

        if (!amount || amount < 1) {
            showError(
                "Veuillez sélectionner ou entrer un montant valide (minimum $1)",
            );
            return;
        }

        if (amount > 1000) {
            showError("Le montant maximum est de $1000");
            return;
        }

        if (!Number.isInteger(amount)) {
            showError("Choisissez un montant entier en USD.");
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Envoi...';
        }

        const result = redirectToSupportCheckout({
            creatorId: selectedCreatorId,
            amount,
            description: "Soutien depuis le dashboard",
        });

        if (result.success) {
            closeSupportModal();
        } else {
            showError(result.error || "Erreur lors de la création du paiement");
        }
    } catch (error) {
        console.error("Exception traitement soutien:", error);
        showError("Une erreur est survenue lors du traitement du paiement");
    } finally {
        const submitBtn = document.querySelector(
            "#supportModal .btn-primary.btn-full",
        );
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML =
                '<i class="fas fa-heart"></i> Envoyer le soutien';
        }
    }
}

// Fonctions utilitaires
function showError(message) {
    // Créer une notification d'erreur
    const notification = document.createElement("div");
    notification.className = "notification notification-error";
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
    const notification = document.createElement("div");
    notification.className = "notification notification-success";
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
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
        e.target.classList.remove("active");
    }
});
