/* ========================================
   SYSTÈME DE NOTIFICATIONS EN TEMPS RÉEL
   ======================================== */

let notificationChannel = null;
let notifications = [];
const NOTIF_PERMISSION_KEY = "xera-notif-permission-requested";
const PUSH_SUBSCRIBE_URL = "/api/push/subscribe";
const VAPID_PUBLIC_KEY =
    (typeof window !== "undefined" && window.VAPID_PUBLIC_KEY) ||
    "BKWmLmM6lYCuTb/YPmxIdeWJvMNjI1QDi0Kc36PiTKmEfybk4wky7VxsM6H/lK3dUXl1WQNXAB1zCbiTNGckdhM=";
const RETURN_REMINDER_SLOTS_KEY = "xera-return-reminder-slots";
const RETURN_REMINDER_HOURS = [10, 18];
const RETURN_REMINDER_WINDOW_MINUTES = 15;
const notifUserCache = new Map();
const notifStreamCache = new Map();
let swRegistration = null;
let pushSubscription = null;
let returnReminderTimer = null;
let pushMessageListenerBound = false;
let notificationsPollingTimer = null;
let notificationsRealtimeWarned = false;

// Initialiser les notifications
async function initializeNotifications() {
    if (!currentUser) return;
    
    // Charger les notifications existantes
    await loadNotifications();
    
    // S'abonner aux nouvelles notifications en temps réel
    subscribeToNotifications();

    // Mettre à jour le badge
    updateNotificationBadge();

    // Afficher un CTA type YouTube pour déclencher la demande via geste utilisateur
    renderNotificationPermissionCTA();

    // Enregistrer le service worker / push uniquement si déjà autorisé
    setupPushNotifications();
    startNotificationsPollingFallback();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        scheduleReturnReminder();
    }
}

// Enregistrer le SW + abonnement push
async function setupPushNotifications() {
    if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
    ) {
        return;
    }
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes("REMPLACEZ")) {
        console.warn(
            "VAPID_PUBLIC_KEY manquante. Configurez js/push-config.js pour activer le push.",
        );
        return;
    }

    try {
        swRegistration =
            swRegistration ||
            (await navigator.serviceWorker.register("/sw.js", {
                scope: "/",
            }));
        swRegistration = await navigator.serviceWorker.ready;

        // Si le SW a été mis à jour, conserver la clé publique pour resubscribe
        const targetWorker =
            swRegistration?.active ||
            swRegistration?.waiting ||
            swRegistration?.installing ||
            null;
        if (targetWorker) {
            targetWorker.postMessage({
                type: "SET_VAPID",
                publicKey: VAPID_PUBLIC_KEY,
            });
        }

        // Ne pas forcer la demande ici : on attend le geste utilisateur (CTA)
        if (Notification.permission !== "granted") return;

        pushSubscription =
            pushSubscription || (await swRegistration.pushManager.getSubscription());

        if (!pushSubscription) {
            const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            pushSubscription = await swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: appServerKey,
            });
        }

        if (pushSubscription) {
            await sendSubscriptionToServer(pushSubscription);
        }

        // Planifier les rappels quotidiens à 10h et 18h (heure locale)
        scheduleReturnReminder();

        // Écoute les resubscriptions envoyées par le SW
        if (!pushMessageListenerBound) {
            navigator.serviceWorker.addEventListener("message", async (event) => {
                if (event.data?.type === "PUSH_SUBSCRIPTION_REFRESH") {
                    pushSubscription = event.data.subscription;
                    await sendSubscriptionToServer(pushSubscription);
                }
            });
            pushMessageListenerBound = true;
        }
    } catch (error) {
        console.warn("Push setup failed:", error);
    }
}

// Charger les notifications existantes
async function loadNotifications() {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        notifications = normalizeNotifications(data || []);
        await hydrateNotificationMetadata(notifications);
        updateNotificationBadge();
        
    } catch (error) {
        console.error('Erreur chargement notifications:', error);
    }
}

// S'abonner aux notifications en temps réel
function subscribeToNotifications() {
    if (!currentUser) return;

    if (notificationChannel) {
        supabase.removeChannel(notificationChannel);
        notificationChannel = null;
    }
    
    // Créer un canal de notifications
    notificationChannel = supabase
        .channel(`notifications-${currentUser.id}-${Date.now()}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${currentUser.id}`
            },
            (payload) => {
                handleNewNotification(payload.new);
            }
        )
        .subscribe((status) => {
            if (status === "CHANNEL_ERROR" && !notificationsRealtimeWarned) {
                notificationsRealtimeWarned = true;
                console.warn(
                    "Notifications realtime indisponibles. Fallback actif (vérifiez la publication realtime de notifications).",
                );
            }
        });
}

// Gérer une nouvelle notification
function handleNewNotification(notification) {
    const normalized = normalizeNotification(notification);
    notifications.unshift(normalized);
    hydrateNotificationMetadata([normalized]).catch(() => {});
    
    // Afficher une notification toast
    showNotificationToast(normalized);

    // Afficher une notification navigateur si permis
    showBrowserNotification(normalized);
    
    // Mettre à jour le badge
    updateNotificationBadge();
    
    // Jouer un son (optionnel)
    playNotificationSound(normalized.type);
}

// Afficher un toast de notification
function showNotificationToast(notification) {
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `
        <div class="notification-toast-content">
            <div class="notification-toast-icon">${getNotificationIcon(notification.type)}</div>
            <div class="notification-toast-text">
                <div class="notification-toast-title">${getNotificationTitle(notification)}</div>
                <div class="notification-toast-message">${notification.message}</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Animation d'entrée
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Retirer après 5 secondes
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
    
    // Cliquer pour fermer
    toast.addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    });
}

// Obtenir l'icône selon le type de notification
function getNotificationIcon(type) {
    const icons = {
        support: '💖',
        follow: '👤',
        new_update: '📝',
        new_arc: '📈',
        stream: '🔴',
        live_start: '🔴',
        encouragement: '✨',
        collaboration: '🤝',
        like: '❤️',
        comment: '💬',
        mention: '@',
        achievement: '🏆'
    };
    return icons[type] || '🔔';
}

// Obtenir le titre de la notification
function getNotificationTitle(notification) {
    const titles = {
        support: 'Nouveau soutien',
        follow: 'Nouvel abonné',
        new_update: 'Nouvelle mise à jour',
        new_arc: 'Nouveau projet',
        stream: 'Live en cours',
        live_start: 'Live en cours',
        encouragement: 'Nouvel encouragement',
        collaboration: 'Demande de collaboration',
        like: 'Nouveau like',
        comment: 'Nouveau commentaire',
        mention: 'Mention',
        achievement: 'Succès débloqué'
    };
    return titles[notification.type] || 'Notification';
}

// Demander la permission de notifications navigateur (non bloquant)
function requestBrowserNotificationPermission(force = false) {
    if (typeof window === "undefined" || typeof Notification === "undefined")
        return;
    if (Notification.permission === "granted") return;
    const alreadyAsked = localStorage.getItem(NOTIF_PERMISSION_KEY) === "1";
    if (Notification.permission === "denied") return; // respect user choice
    if (alreadyAsked && !force) return;
    try {
        Notification.requestPermission().then((res) => {
            localStorage.setItem(NOTIF_PERMISSION_KEY, "1");
            if (res !== "granted") {
                console.info("Notifications navigateur non autorisées.");
            } else {
                setupPushNotifications();
                scheduleReturnReminder();
            }
        });
    } catch (e) {
        console.warn("Notification permission request failed", e);
    }
}

// CTA léger pour inviter l'utilisateur à autoriser les notifications (YouTube-like)
function renderNotificationPermissionCTA() {
    if (typeof window === "undefined" || typeof Notification === "undefined")
        return;
    const alreadyAsked = localStorage.getItem(NOTIF_PERMISSION_KEY) === "1";
    if (Notification.permission === "granted" || Notification.permission === "denied")
        return;
    if (alreadyAsked) return;

    const anchor =
        document.getElementById("notification-btn") ||
        document.querySelector(".nav-actions") ||
        document.body;
    if (!anchor) return;

    // Avoid duplicate banner
    if (document.getElementById("notif-permission-cta")) return;

    const cta = document.createElement("div");
    cta.id = "notif-permission-cta";
    cta.style.cssText =
        "position:fixed; bottom:18px; right:18px; max-width:320px; z-index:1200; background:var(--surface-color, #111); color:var(--text-primary, #fff); border:1px solid var(--border-color, rgba(255,255,255,0.12)); box-shadow:0 12px 30px rgba(0,0,0,0.25); border-radius:14px; padding:14px 16px; display:flex; gap:12px; align-items:flex-start;";
    cta.innerHTML = `
        <div style="flex-shrink:0; width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg, #6366f1, #8b5cf6); display:flex; align-items:center; justify-content:center; font-size:18px;">🔔</div>
        <div style="flex:1; min-width:0;">
            <div style="font-weight:700; margin-bottom:6px;">Activer les notifications</div>
            <div style="color:var(--text-secondary, #b5b5c3); font-size:0.9rem; line-height:1.3;">Soyez averti des nouveaux lives, réponses et encouragements.</div>
            <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                <button id="notif-cta-allow" class="btn-verify" style="padding:8px 12px; border:none; border-radius:10px; background:#10b981; color:#fff; cursor:pointer;">Autoriser</button>
                <button id="notif-cta-later" class="btn-ghost" style="padding:8px 12px; border:1px solid var(--border-color, rgba(255,255,255,0.15)); border-radius:10px; background:transparent; color:var(--text-secondary, #b5b5c3); cursor:pointer;">Plus tard</button>
            </div>
        </div>
    `;

    document.body.appendChild(cta);

    const closeCta = () => {
        cta.remove();
    };

    const allowBtn = document.getElementById("notif-cta-allow");
    const laterBtn = document.getElementById("notif-cta-later");

    if (allowBtn) {
        allowBtn.addEventListener("click", async () => {
            localStorage.setItem(NOTIF_PERMISSION_KEY, "1");
            const perm = await Notification.requestPermission();
            if (perm === "granted") {
                // Inscrire au push dès l'acceptation
                setupPushNotifications();
                ToastManager?.success(
                    "Notifications activées",
                    "Nous vous avertirons comme sur YouTube.",
                );
            }
            closeCta();
        });
    }

    if (laterBtn) {
        laterBtn.addEventListener("click", () => {
            cta.style.opacity = "0";
            setTimeout(closeCta, 120);
        });
    }
}

// Afficher une notification navigateur (lorsque l'onglet est ouvert)
function showBrowserNotification(notification) {
    if (typeof window === "undefined" || typeof Notification === "undefined")
        return;
    if (Notification.permission !== "granted") return;

    const title = getNotificationTitle(notification);
    const body = notification.message || "";
    const icon = "icons/logo.png";
    const link = normalizeNotificationLink(notification);
    showDeviceNotification({
        title,
        body,
        icon,
        tag: notification.id,
        link,
        renotify: false,
        silent: false,
    }).catch((e) => {
        console.warn("Browser notification error:", e);
    });
}

async function showDeviceNotification({
    title = "XERA",
    body = "",
    icon = "icons/logo.png",
    tag = undefined,
    link = "",
    renotify = false,
    silent = false,
} = {}) {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
        return false;
    }
    if (Notification.permission !== "granted") return false;

    const normalizedLink = String(link || "");
    const options = {
        body,
        icon,
        badge: icon,
        tag,
        renotify: !!renotify,
        silent: !!silent,
        data: { link: normalizedLink },
    };

    try {
        if ("serviceWorker" in navigator) {
            const reg = await navigator.serviceWorker.ready;
            if (reg && typeof reg.showNotification === "function") {
                await reg.showNotification(title, options);
                return true;
            }
        }
    } catch (swError) {
        console.warn("Service worker notification error:", swError);
    }

    try {
        const n = new Notification(title, options);
        n.onclick = () => {
            try {
                window.focus();
                if (normalizedLink) {
                    window.location.href = normalizedLink;
                }
            } finally {
                n.close();
            }
        };
        return true;
    } catch (notificationError) {
        console.warn("Window notification error:", notificationError);
        return false;
    }
}

function loadReminderSlots() {
    try {
        const parsed = JSON.parse(
            localStorage.getItem(RETURN_REMINDER_SLOTS_KEY) || "{}",
        );
        if (!parsed || typeof parsed !== "object") return {};
        return parsed;
    } catch (e) {
        return {};
    }
}

function saveReminderSlots(slots) {
    try {
        localStorage.setItem(RETURN_REMINDER_SLOTS_KEY, JSON.stringify(slots || {}));
    } catch (e) {
        // ignore storage failures
    }
}

function formatLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getReminderSlotKey(date) {
    const hour = date.getHours();
    const minute = date.getMinutes();
    if (!RETURN_REMINDER_HOURS.includes(hour)) return null;
    if (minute < 0 || minute >= RETURN_REMINDER_WINDOW_MINUTES) return null;
    return `${formatLocalDateKey(date)}-${String(hour).padStart(2, "0")}`;
}

function getNextReminderDate(fromDate = new Date()) {
    const now = new Date(fromDate);
    const candidates = RETURN_REMINDER_HOURS
        .map((hour) => {
            const candidate = new Date(now);
            candidate.setHours(hour, 0, 0, 0);
            if (candidate <= now) {
                candidate.setDate(candidate.getDate() + 1);
            }
            return candidate;
        })
        .sort((a, b) => a.getTime() - b.getTime());
    return candidates[0] || null;
}

// Rappel quotidien pour revenir sur XERA (10h et 18h locale)
function scheduleReturnReminder() {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    if (returnReminderTimer) {
        clearTimeout(returnReminderTimer);
        returnReminderTimer = null;
    }

    const now = new Date();
    const currentSlotKey = getReminderSlotKey(now);
    const slots = loadReminderSlots();
    if (currentSlotKey && slots[currentSlotKey] !== true) {
        showReturnReminderNotification(now)
            .then(() => {
                slots[currentSlotKey] = true;
                saveReminderSlots(slots);
            })
            .catch(() => {});
    }

    const nextReminderDate = getNextReminderDate(now);
    if (!nextReminderDate) return;
    const delayMs = Math.max(1000, nextReminderDate.getTime() - Date.now());

    returnReminderTimer = setTimeout(async () => {
        returnReminderTimer = null;
        await showReturnReminderNotification(nextReminderDate);
        const slotKey = getReminderSlotKey(nextReminderDate);
        if (slotKey) {
            const nextSlots = loadReminderSlots();
            nextSlots[slotKey] = true;
            saveReminderSlots(nextSlots);
        }
        scheduleReturnReminder();
    }, delayMs);
}

async function showReturnReminderNotification(reminderDate = new Date()) {
    const hour = reminderDate.getHours();
    const isMorning = hour < 14;
    const title = isMorning
        ? "Rappel XERA • 10h"
        : "Rappel XERA • 18h";
    const body = isMorning
        ? "Prends 2 minutes pour documenter ta progression ce matin."
        : "Pense à documenter ta progression de la journée sur XERA.";
    const link = currentUser?.id
        ? `profile.html?user=${currentUser.id}`
        : "index.html";
    await showDeviceNotification({
        title,
        body,
        icon: "icons/logo.png",
        tag: `xera-return-reminder-${String(hour).padStart(2, "0")}`,
        link,
        renotify: false,
        silent: false,
    });
}

// Mettre à jour le badge de notifications
function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    
    const unreadCount = notifications.filter(n => !n.read).length;
    
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// Afficher le panneau de notifications
function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;
    
    const isVisible = panel.classList.contains('show');
    
    if (isVisible) {
        panel.classList.remove('show');
    } else {
        panel.classList.add('show');
        renderNotifications();
    }
}

// Rendre les notifications dans le panneau
function renderNotifications() {
    const container = document.getElementById('notification-list');
    if (!container) return;
    
    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="notification-empty">
                <p>Aucune notification</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = notifications.map(notif => {
        const avatar = notif.actor?.avatar;
        const icon = getNotificationIcon(notif.type);
        const displayName = notif.actor?.name || getNotificationTitle(notif);
        return `
        <div class="notification-item ${notif.read ? '' : 'unread'}" onclick="handleNotificationClick('${notif.id}')" style="display:flex;gap:12px;align-items:flex-start;">
            <div class="notification-leading" style="width:42px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                ${avatar
                    ? `<img class="notification-avatar" src="${avatar}" alt="${displayName}" loading="lazy" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color, rgba(255,255,255,0.12));" />`
                    : `<div class="notification-icon" style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--surface-alt, #1f2937);font-size:18px;">${icon}</div>`}
            </div>
            <div class="notification-content" style="flex:1;min-width:0;">
                <div class="notification-title" style="font-weight:700;">${getNotificationTitle(notif)}</div>
                <div class="notification-message" style="color:var(--text-secondary,#b5b5c3);">${notif.message}</div>
                <div class="notification-meta" style="display:flex;gap:8px;align-items:center;color:var(--text-muted,#9ca3af);font-size:0.85rem;margin-top:4px;">
                    <span class="notification-time">${formatNotificationTime(notif.created_at)}</span>
                    ${displayName ? `<span class="notification-actor" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${displayName}</span>` : ""}
                </div>
            </div>
        </div>
    `}).join('');
}

// Gérer le clic sur une notification
async function handleNotificationClick(notificationId) {
    try {
        // Marquer comme lue
        await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId);
        
        // Mettre à jour localement
        const notif = notifications.find(n => n.id === notificationId);
        if (notif) {
            notif.read = true;
            updateNotificationBadge();
            renderNotifications();
        }
        
        // Fermer le panneau
        toggleNotificationPanel();
        
        // Naviguer vers la ressource liée (optionnel)
        const targetLink = notif ? normalizeNotificationLink(notif) : null;
        if (targetLink) {
            window.location.href = targetLink;
        }
        
    } catch (error) {
        console.error('Erreur marquage notification:', error);
    }
}

// Marquer toutes les notifications comme lues
async function markAllNotificationsAsRead() {
    try {
        await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', currentUser.id)
            .eq('read', false);
        
        notifications.forEach(n => n.read = true);
        updateNotificationBadge();
        renderNotifications();
        
    } catch (error) {
        console.error('Erreur marquage notifications:', error);
    }
}

// Formater le temps de la notification
function formatNotificationTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Jouer un son de notification
function playNotificationSound(type = "default") {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const audioContext = new AudioCtx();
        const pattern =
            type === "encouragement"
                ? [920, 1240]
                : [760];
        const now = audioContext.currentTime;

        pattern.forEach((frequency, index) => {
            const startAt = now + index * 0.13;
            const stopAt = startAt + 0.09;
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            gainNode.gain.setValueAtTime(0.0001, startAt);
            gainNode.gain.exponentialRampToValueAtTime(0.22, startAt + 0.015);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

            oscillator.start(startAt);
            oscillator.stop(stopAt);
        });

        setTimeout(() => {
            if (audioContext && typeof audioContext.close === "function") {
                audioContext.close().catch(() => {});
            }
        }, 700);
    } catch (error) {
        // Ignorer les erreurs de son
    }
}

// Créer une notification (fonction utilitaire)
async function createNotification(userId, type, message, link = null) {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                type: type,
                message: message,
                link: link,
                read: false
            })
            .select()
            .single();
        
        if (error) throw error;
        
        return { success: true, data: data };
        
    } catch (error) {
        console.error('Erreur création notification:', error);
        return { success: false, error: error.message };
    }
}

// Se désabonner des notifications
function unsubscribeFromNotifications() {
    if (notificationChannel) {
        supabase.removeChannel(notificationChannel);
        notificationChannel = null;
    }

    // Optionnel: se désabonner du push
    if (pushSubscription && swRegistration) {
        pushSubscription.unsubscribe().catch(() => {});
    }
    if (returnReminderTimer) {
        clearTimeout(returnReminderTimer);
        returnReminderTimer = null;
    }
    if (notificationsPollingTimer) {
        clearInterval(notificationsPollingTimer);
        notificationsPollingTimer = null;
    }
}

// Convertir une clé publique VAPID base64 vers Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Envoyer l'abonnement push au backend
async function sendSubscriptionToServer(subscription) {
    if (!currentUser || !subscription) return;
    try {
        let timezone = "UTC";
        try {
            timezone =
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        } catch (e) {
            timezone = "UTC";
        }
        await fetch(PUSH_SUBSCRIBE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: currentUser.id,
                subscription,
                timezone,
                reminderEnabled: true,
            }),
            credentials: "include",
        });
    } catch (error) {
        console.warn("Impossible d'enregistrer l'abonnement push", error);
    }
}

function startNotificationsPollingFallback() {
    if (notificationsPollingTimer) {
        clearInterval(notificationsPollingTimer);
        notificationsPollingTimer = null;
    }

    notificationsPollingTimer = setInterval(() => {
        if (!currentUser) return;
        if (document.hidden) return;
        loadNotifications().catch((error) => {
            console.warn("Notifications fallback refresh failed:", error);
        });
    }, 12000);
}

// ---------------------------
// Helpers de normalisation
// ---------------------------
function normalizeNotifications(list) {
    return (list || []).map(normalizeNotification);
}

function normalizeNotification(notif) {
    const n = { ...notif };
    n.link = normalizeNotificationLink(n);
    return n;
}

window.showDeviceNotification = showDeviceNotification;

document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!currentUser) return;
    loadNotifications().catch((error) => {
        console.warn("Notifications visibility refresh failed:", error);
    });
});

function normalizeNotificationLink(notif) {
    const link = (notif && notif.link) || "";
    if (!link) return "";
    // stream links
    const streamMatch = link.match(/\/stream\/?([a-f0-9-]{8,})/i);
    if (streamMatch) {
        const streamId = streamMatch[1];
        return `stream.html?id=${streamId}`;
    }
    // explicit stream.html
    if (link.includes("stream.html")) return link;
    // profile links
    const profileMatch = link.match(/\/profile\/?([a-f0-9-]{8,})/i);
    if (profileMatch) {
        return `profile.html?user=${profileMatch[1]}`;
    }
    const profileHtmlMatch = link.match(/profile\\.html\\?user=([a-f0-9-]{8,})/i);
    if (profileHtmlMatch) {
        return `profile.html?user=${profileHtmlMatch[1]}`;
    }
    // leave untouched
    return link.startsWith("/") ? link.slice(1) : link;
}

function extractStreamId(link = "") {
    const m =
        link.match(/stream\.html\?[^#]*id=([a-f0-9-]{8,})/i) ||
        link.match(/stream\.html\?id=([a-f0-9-]{8,})/i) ||
        link.match(/\/stream\/?([a-f0-9-]{8,})/i);
    return m ? m[1] : null;
}

function extractUserIdFromLink(link = "") {
    const m =
        link.match(/profile\.html\?[^#]*user=([a-f0-9-]{8,})/i) ||
        link.match(/profile\.html\?user=([a-f0-9-]{8,})/i) ||
        link.match(/\/profile\/?([a-f0-9-]{8,})/i);
    return m ? m[1] : null;
}

async function hydrateNotificationMetadata(list) {
    if (!Array.isArray(list) || list.length === 0) return;

    const streamIds = new Set();
    const userIds = new Set();

    list.forEach((n) => {
        const link = normalizeNotificationLink(n);
        n.link = link;
        const streamId = extractStreamId(link);
        const userId = extractUserIdFromLink(link);
        if (streamId) streamIds.add(streamId);
        if (userId) userIds.add(userId);
    });

    let streamMap = {};
    if (streamIds.size > 0) {
        const missing = [...streamIds].filter((id) => !notifStreamCache.has(id));
        if (missing.length > 0) {
            const { data, error } = await supabase
                .from("streaming_sessions")
                .select("id, user_id, title, thumbnail_url")
                .in("id", missing);
            if (!error && data) {
                data.forEach((row) => notifStreamCache.set(row.id, row));
            }
        }
        streamMap = Object.fromEntries(
            [...streamIds].map((id) => [id, notifStreamCache.get(id) || null]),
        );
        Object.values(streamMap)
            .filter(Boolean)
            .forEach((s) => s.user_id && userIds.add(s.user_id));
    }

    const missingUsers = [...userIds].filter((id) => !notifUserCache.has(id));
    if (missingUsers.length > 0) {
        const { data, error } = await supabase
            .from("users")
            .select("id, name, avatar")
            .in("id", missingUsers);
        if (!error && data) {
            data.forEach((u) => notifUserCache.set(u.id, u));
        }
    }
    const userMap = Object.fromEntries(
        [...userIds].map((id) => [id, notifUserCache.get(id) || null]),
    );

    list.forEach((n) => {
        const streamId = extractStreamId(n.link);
        const userIdFromLink = extractUserIdFromLink(n.link);
        const stream = streamId ? streamMap[streamId] : null;
        const actorId = userIdFromLink || stream?.user_id || null;
        if (actorId && userMap[actorId]) {
            n.actor = userMap[actorId];
        }
        if (stream && stream.user_id) {
            // Enrichir le lien pour inclure l'hôte, utile pour le lecteur
            const hostPart = n.link.includes("host=") ? "" : `&host=${stream.user_id}`;
            if (n.link.includes("stream.html")) {
                n.link = `${n.link}${hostPart}`;
            } else {
                n.link = `stream.html?id=${stream.id}${hostPart}`;
            }
            n.stream = stream;
        }
    });
}
