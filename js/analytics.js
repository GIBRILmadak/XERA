/* ========================================
   ANALYTICS MENSUELLES
   ======================================== */

window.analyticsCharts = window.analyticsCharts || {};
window.analyticsShareState = window.analyticsShareState || {};

function getAnalyticsDomIds(containerId) {
    const safeId = String(containerId || 'analytics-dashboard').replace(/[^a-zA-Z0-9_-]/g, '');
    return {
        containerId: containerId || 'analytics-dashboard',
        safeId,
        selectId: `month-select-${safeId}`,
        canvasId: `analytics-month-chart-${safeId}`,
        messageId: `analytics-message-${safeId}`,
        shareBtnId: `analytics-share-btn-${safeId}`,
        downloadBtnId: `analytics-download-btn-${safeId}`,
        sharePanelId: `analytics-share-panel-${safeId}`
    };
}

function cleanupAnalytics(containerId = 'analytics-dashboard') {
    const { safeId, containerId: dashId } = getAnalyticsDomIds(containerId);
    const chart = window.analyticsCharts[safeId];
    if (chart) {
        chart.destroy();
        delete window.analyticsCharts[safeId];
    }
    if (window.analyticsShareState && window.analyticsShareState[safeId]) {
        delete window.analyticsShareState[safeId];
    }

    const dashboard = document.getElementById(dashId);
    if (dashboard) {
        dashboard.innerHTML = '';
    }
}

function setAnalyticsMessage(containerId, text, timeoutMs = 2500) {
    const { messageId } = getAnalyticsDomIds(containerId);
    const message = document.getElementById(messageId);
    if (!message) return;
    message.textContent = text || '';
    if (text && timeoutMs) {
        setTimeout(() => {
            if (message.textContent === text) {
                message.textContent = '';
            }
        }, timeoutMs);
    }
}

function notifyAnalytics(containerId, text, type = 'info') {
    if (window.ToastManager) {
        if (type === 'success') ToastManager.success('Info', text);
        else if (type === 'error') ToastManager.error('Erreur', text);
        else ToastManager.info('Info', text);
        return;
    }
    setAnalyticsMessage(containerId, text);
}

function buildAnalyticsShareUrl(userId) {
    try {
        const base = new URL('analytics.html', window.location.href);
        if (userId) base.searchParams.set('user', userId);
        return base.toString();
    } catch (error) {
        return userId ? `analytics.html?user=${encodeURIComponent(userId)}` : 'analytics.html';
    }
}

function formatAnalyticsShareLabel(state) {
    if (!state) return 'Analytics XERA';
    const monthLabel = (state.year !== undefined && state.monthIndex !== undefined)
        ? formatMonthLabel(state.year, state.monthIndex)
        : '';
    const namePart = state.userName ? ` · ${state.userName}` : '';
    return monthLabel ? `Analytics ${monthLabel}${namePart}` : `Analytics XERA${namePart}`;
}

function buildSocialShareUrls({ url, text }) {
    const encodedUrl = encodeURIComponent(url || '');
    const encodedText = encodeURIComponent(text || '');
    return {
        x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    };
}

async function copyToClipboard(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (error) {
        console.error('Clipboard error:', error);
    }
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
    } catch (error) {
        console.error('Clipboard fallback error:', error);
        return false;
    }
}

function renderAnalyticsSharePanel(containerId, state) {
    const { sharePanelId } = getAnalyticsDomIds(containerId);
    const panel = document.getElementById(sharePanelId);
    if (!panel) return;

    const url = buildAnalyticsShareUrl(state?.userId);
    const label = formatAnalyticsShareLabel(state);
    const text = `Mes analytics${state?.userName ? ` · ${state.userName}` : ''} sur XERA.`;
    const shareUrls = buildSocialShareUrls({ url, text });

    panel.innerHTML = `
        <button class="btn btn-ghost analytics-share-action" data-action="copy">
            <img src="icons/link.svg" alt="Lien">
            Copier le lien
        </button>
        <a class="btn btn-ghost analytics-share-action" href="${shareUrls.x}" target="_blank" rel="noopener">
            <img src="icons/twitter.svg" alt="X">
            X
        </a>
        <a class="btn btn-ghost analytics-share-action" href="${shareUrls.linkedin}" target="_blank" rel="noopener">
            <img src="icons/linkedin.svg" alt="LinkedIn">
            LinkedIn
        </a>
        <a class="btn btn-ghost analytics-share-action" href="${shareUrls.facebook}" target="_blank" rel="noopener">
            <img src="icons/facebook.svg" alt="Facebook">
            Facebook
        </a>
        <div class="analytics-share-hint">Astuce : télécharge l'image pour la publier directement.</div>
    `;

    const copyBtn = panel.querySelector('[data-action="copy"]');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const ok = await copyToClipboard(url);
            notifyAnalytics(containerId, ok ? 'Lien copié !' : 'Impossible de copier le lien.', ok ? 'success' : 'error');
        });
    }

    panel.style.display = 'flex';
}

async function downloadAnalyticsChart(containerId) {
    const { safeId, canvasId } = getAnalyticsDomIds(containerId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        notifyAnalytics(containerId, "Graphique introuvable.", 'error');
        return;
    }
    const state = window.analyticsShareState[safeId] || {};
    const monthLabel = (state.year !== undefined && state.monthIndex !== undefined)
        ? formatMonthLabel(state.year, state.monthIndex)
        : 'mois';
    const safeName = (state.userName || 'profil').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const fileName = `analytics-${safeName}-${monthLabel.replace(/\s+/g, '-')}.png`;

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.92));
    if (!blob) {
        notifyAnalytics(containerId, "Impossible de générer l'image.", 'error');
        return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notifyAnalytics(containerId, "Image téléchargée.", 'success');
}

async function shareAnalyticsChart(containerId) {
    const { safeId, canvasId, sharePanelId } = getAnalyticsDomIds(containerId);
    const canvas = document.getElementById(canvasId);
    const state = window.analyticsShareState[safeId] || {};
    const monthLabel = (state.year !== undefined && state.monthIndex !== undefined)
        ? formatMonthLabel(state.year, state.monthIndex)
        : '';
    const title = monthLabel ? `Analytics · ${monthLabel}` : 'Analytics XERA';
    const text = monthLabel
        ? `Mes analytics de ${monthLabel} sur XERA.`
        : `Mes analytics sur XERA.`;
    const url = buildAnalyticsShareUrl(state.userId);

    if (navigator.share) {
        try {
            if (canvas && canvas.toBlob && navigator.canShare) {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.92));
                if (blob) {
                    const fileName = `analytics-${state.year || 'mois'}.png`;
                    const file = new File([blob], fileName, { type: 'image/png' });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({ title, text, url, files: [file] });
                        return;
                    }
                }
            }
            await navigator.share({ title, text, url });
            return;
        } catch (error) {
            console.warn('Web Share cancelled or failed:', error);
        }
    }

    const panel = document.getElementById(sharePanelId);
    if (panel && panel.style.display === 'flex') {
        panel.style.display = 'none';
        return;
    }
    renderAnalyticsSharePanel(containerId, { ...state, userId: state.userId });
}

function getMonthInfo(dateObj) {
    return {
        year: dateObj.getFullYear(),
        monthIndex: dateObj.getMonth()
    };
}

function getMonthRange(year, monthIndex) {
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const daysInMonth = end.getDate();

    return { startStr, endStr, daysInMonth };
}

function formatMonthLabel(year, monthIndex) {
    const date = new Date(year, monthIndex, 1);
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
}

function monthKey(year, monthIndex) {
    const month = String(monthIndex + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function buildMonthList(createdAt) {
    const createdDate = createdAt ? new Date(createdAt) : new Date();
    const now = new Date();

    const start = new Date(createdDate.getFullYear(), createdDate.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);

    const months = [];
    const cursor = new Date(start);

    while (cursor <= end) {
        const year = cursor.getFullYear();
        const monthIndex = cursor.getMonth();
        months.push({
            year,
            monthIndex,
            key: monthKey(year, monthIndex),
            label: formatMonthLabel(year, monthIndex)
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
}

async function getMonthlyMetrics(userId, year, monthIndex) {
    try {
        const { startStr, endStr } = getMonthRange(year, monthIndex);
        const { data, error } = await supabase
            .from('daily_metrics')
            .select('date, success_count, failure_count, pause_count')
            .eq('user_id', userId)
            .gte('date', startStr)
            .lte('date', endStr)
            .order('date', { ascending: true });

        if (error) throw error;

        return { success: true, metrics: data || [] };
    } catch (error) {
        console.error('Erreur récupération métriques mensuelles:', error);
        return { success: false, error: error.message };
    }
}

async function getMonthlyLiveHours(userId, year, monthIndex) {
    try {
        const LIVE_PRESENCE_STALE_MS = 45000;
        const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
        const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
        const endIso = monthEnd.toISOString();
        const startIso = monthStart.toISOString();

        const { data, error } = await supabase
            .from('streaming_sessions')
            .select('id, started_at, ended_at')
            .eq('user_id', userId)
            .lte('started_at', endIso)
            .or(`ended_at.gte.${startIso},ended_at.is.null`);

        if (error) throw error;

        const nowMs = Date.now();
        const sessionIds = (data || [])
            .map((session) => session?.id)
            .filter(Boolean);
        const hostLastSeenByStreamId = new Map();
        let presenceQueryFailed = false;

        if (sessionIds.length > 0) {
            const { data: presenceRows, error: presenceError } = await supabase
                .from('stream_viewers')
                .select('stream_id, last_seen')
                .eq('user_id', userId)
                .in('stream_id', sessionIds);

            if (presenceError) {
                presenceQueryFailed = true;
            } else if (Array.isArray(presenceRows)) {
                presenceRows.forEach((row) => {
                    if (!row?.stream_id || !row?.last_seen) return;
                    const ts = new Date(row.last_seen).getTime();
                    if (!Number.isFinite(ts)) return;
                    const prev = hostLastSeenByStreamId.get(row.stream_id) || 0;
                    if (ts > prev) {
                        hostLastSeenByStreamId.set(row.stream_id, ts);
                    }
                });
            }
        }

        const durations = Array(monthEnd.getDate()).fill(0);
        (data || []).forEach((session) => {
            if (!session.started_at) return;
            const start = new Date(session.started_at);
            const explicitEndMs = session.ended_at ? new Date(session.ended_at).getTime() : 0;
            const hostLastSeenMs = hostLastSeenByStreamId.get(session.id) || 0;
            let effectiveEndMs = explicitEndMs;

            if (!Number.isFinite(effectiveEndMs) || effectiveEndMs <= 0) {
                if (hostLastSeenMs > 0) {
                    // If heartbeat is still fresh, consider the stream active now.
                    effectiveEndMs = (nowMs - hostLastSeenMs) <= LIVE_PRESENCE_STALE_MS
                        ? nowMs
                        : hostLastSeenMs;
                } else if (presenceQueryFailed) {
                    // Keep legacy behavior if presence lookup temporarily fails.
                    effectiveEndMs = nowMs;
                } else {
                    // No reliable presence info: avoid infinite growth of orphan sessions.
                    effectiveEndMs = 0;
                }
            }

            if (!effectiveEndMs) return;
            const end = new Date(effectiveEndMs);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

            const clampedStart = start < monthStart ? monthStart : start;
            const clampedEnd = end > monthEnd ? monthEnd : end;
            if (clampedEnd <= clampedStart) return;

            let cursor = new Date(clampedStart);
            while (cursor < clampedEnd) {
                const dayIndex = cursor.getDate() - 1;
                if (dayIndex < 0 || dayIndex >= durations.length) break;
                const dayEnd = new Date(cursor);
                dayEnd.setHours(23, 59, 59, 999);
                const segmentEnd = clampedEnd < dayEnd ? clampedEnd : dayEnd;
                const durationMs = segmentEnd - cursor;
                if (durationMs > 0) durations[dayIndex] += durationMs;
                cursor = new Date(dayEnd.getTime() + 1);
            }
        });

        const liveHours = durations.map(ms => ms > 0 ? Math.ceil(ms / 3600000) : 0);
        return { success: true, liveHours };
    } catch (error) {
        console.error('Erreur récupération heures live:', error);
        return { success: false, error: error.message };
    }
}

function buildSeries(metrics, daysInMonth, liveHours = []) {
    const success = Array(daysInMonth).fill(0);
    const failure = Array(daysInMonth).fill(0);
    const pause = Array(daysInMonth).fill(0);
    const live = Array(daysInMonth).fill(0);

    metrics.forEach((m) => {
        if (!m.date) return;
        const parts = m.date.split('-');
        if (parts.length !== 3) return;
        const day = parseInt(parts[2], 10);
        if (!day || day < 1 || day > daysInMonth) return;
        const idx = day - 1;
        success[idx] += m.success_count || 0;
        failure[idx] += m.failure_count || 0;
        pause[idx] += m.pause_count || 0;
    });

    if (Array.isArray(liveHours) && liveHours.length) {
        for (let i = 0; i < daysInMonth; i++) {
            live[i] = Number(liveHours[i]) || 0;
        }
    }

    return { success, failure, pause, live };
}

function renderDashboardShell(months, selectedKey, containerId = 'analytics-dashboard') {
    const { containerId: dashId, selectId, canvasId, messageId, shareBtnId, downloadBtnId, sharePanelId } = getAnalyticsDomIds(containerId);
    const dashboard = document.getElementById(dashId);
    if (!dashboard) return;
    const showShareActions = containerId === 'analytics-dashboard';

    const options = months.map((m) => {
        const selected = m.key === selectedKey ? 'selected' : '';
        return `<option value="${m.key}" ${selected}>${m.label}</option>`;
    }).join('');

    dashboard.innerHTML = `
        <div class="analytics-header" style="text-align: center; margin-bottom: 2rem;">
            <h1 style="font-size: 2.2rem; font-weight: 800; margin-bottom: 0.4rem;">Analytics Mensuelles</h1>
            <p style="color: var(--text-secondary);">Succès, échecs, pauses et lives (heures) par jour</p>
        </div>
        <div class="analytics-controls" style="display: flex; justify-content: center; gap: 1rem; align-items: center; margin-bottom: 2rem; flex-wrap: wrap;">
            <label for="${selectId}" style="color: var(--text-secondary); font-weight: 600;">Mois</label>
            <select id="${selectId}" style="background: rgba(255,255,255,0.06); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 8px;">
                ${options}
            </select>
            ${showShareActions ? `
                <div class="analytics-share-actions">
                    <button class="btn btn-ghost analytics-share-btn" id="${downloadBtnId}">
                        <img src="icons/camera.svg" alt="Télécharger">
                        Télécharger
                    </button>
                    <button class="btn btn-ghost analytics-share-btn" id="${shareBtnId}">
                        <img src="icons/link.svg" alt="Partager">
                        Partager
                    </button>
                </div>
            ` : ''}
        </div>
        ${showShareActions ? `<div id="${sharePanelId}" class="analytics-share-panel" style="display:none;"></div>` : ''}
        <div class="chart-container" style="background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color);">
            <canvas id="${canvasId}" height="320"></canvas>
        </div>
        <div id="${messageId}" style="text-align: center; margin-top: 1rem; color: var(--text-secondary);"></div>
    `;
}

function renderMonthlyChart({ year, monthIndex, daysInMonth, series, containerId }) {
    const { safeId, canvasId } = getAnalyticsDomIds(containerId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const maxValue = Math.max(
        ...series.success,
        ...series.failure,
        ...series.pause,
        ...series.live,
        0
    );
    // Dynamic scale: align chart height to the highest daily vector/value.
    const yMax = maxValue > 0 ? maxValue : 1;

    if (window.analyticsCharts[safeId]) {
        window.analyticsCharts[safeId].destroy();
    }

    window.analyticsCharts[safeId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Succès',
                    data: series.success,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    tension: 0.3
                },
                {
                    label: 'Échecs',
                    data: series.failure,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    tension: 0.3
                },
                {
                    label: 'Pauses',
                    data: series.pause,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.12)',
                    tension: 0.3
                },
                {
                    label: 'Live (heures)',
                    data: series.live,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.12)',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff'
                    }
                },
                title: {
                    display: true,
                    text: formatMonthLabel(year, monthIndex),
                    color: '#ffffff',
                    font: {
                        size: 16,
                        weight: '700'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: yMax,
                    ticks: {
                        color: '#ffffff',
                        stepSize: 1
                    },
                    grid: {
                        color: 'rgba(255,255,255,0.08)'
                    }
                },
                x: {
                    ticks: {
                        color: '#ffffff'
                    },
                    grid: {
                        color: 'rgba(255,255,255,0.08)'
                    }
                }
            }
        }
    });

    const existing = window.analyticsShareState[safeId] || {};
    window.analyticsShareState[safeId] = {
        ...existing,
        year,
        monthIndex,
        daysInMonth
    };
}

async function renderMonth(userId, year, monthIndex, containerId = 'analytics-dashboard') {
    const { messageId } = getAnalyticsDomIds(containerId);
    const message = document.getElementById(messageId);
    if (message) {
        message.textContent = 'Chargement des données...';
    }

    const { daysInMonth } = getMonthRange(year, monthIndex);
    const metricsResult = await getMonthlyMetrics(userId, year, monthIndex);
    const liveResult = await getMonthlyLiveHours(userId, year, monthIndex);

    if (!metricsResult.success) {
        if (message) {
            message.textContent = 'Erreur lors du chargement des données.';
        }
        return;
    }

    const liveHours = liveResult.success ? liveResult.liveHours : Array(daysInMonth).fill(0);
    const series = buildSeries(metricsResult.metrics, daysInMonth, liveHours);

    renderMonthlyChart({ year, monthIndex, daysInMonth, series, containerId });

    const total = series.success.reduce((a, b) => a + b, 0)
        + series.failure.reduce((a, b) => a + b, 0)
        + series.pause.reduce((a, b) => a + b, 0)
        + series.live.reduce((a, b) => a + b, 0);

    if (message) {
        message.textContent = total === 0 ? 'Aucune donnée pour ce mois.' : '';
    }
}

async function renderAnalyticsDashboard(user, options = {}) {
    if (!user) return;

    const userId = user.id;
    const containerId = options.containerId || 'analytics-dashboard';
    const months = buildMonthList(user.created_at);
    const nowInfo = getMonthInfo(new Date());
    const currentKey = monthKey(nowInfo.year, nowInfo.monthIndex);

    renderDashboardShell(months, currentKey, containerId);

    const { safeId, selectId, shareBtnId, downloadBtnId } = getAnalyticsDomIds(containerId);
    window.analyticsShareState[safeId] = {
        ...(window.analyticsShareState[safeId] || {}),
        userId,
        userName: user.name || user.username || 'Profil'
    };
    const select = document.getElementById(selectId);
    if (!select) return;

    const getSelectedMonth = () => {
        const [yearStr, monthStr] = select.value.split('-');
        const year = parseInt(yearStr, 10);
        const monthIndex = parseInt(monthStr, 10) - 1;
        return { year, monthIndex };
    };

    select.addEventListener('change', () => {
        const { year, monthIndex } = getSelectedMonth();
        renderMonth(userId, year, monthIndex, containerId);
    });

    const shareBtn = document.getElementById(shareBtnId);
    if (shareBtn) {
        shareBtn.addEventListener('click', () => shareAnalyticsChart(containerId));
    }
    const downloadBtn = document.getElementById(downloadBtnId);
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => downloadAnalyticsChart(containerId));
    }

    const { year, monthIndex } = getSelectedMonth();
    await renderMonth(userId, year, monthIndex, containerId);
}

async function renderProfileAnalytics(userId) {
    if (!userId) return;
    const container = document.getElementById('profile-analytics');
    if (!container) return;

    const user = typeof getUser === 'function' ? getUser(userId) : null;
    const userData = user || { id: userId };

    await renderAnalyticsDashboard(userData, { containerId: 'profile-analytics' });
}

window.cleanupAnalytics = cleanupAnalytics;
window.renderAnalyticsDashboard = renderAnalyticsDashboard;
window.renderProfileAnalytics = renderProfileAnalytics;
