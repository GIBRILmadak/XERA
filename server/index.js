const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const webpush = require("web-push");

dotenv.config();

const {
    APP_BASE_URL = "http://localhost:3000",
    PORT = 5050,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    PUSH_CONTACT_EMAIL = "mailto:notifications@xera.app",
    RETURN_REMINDER_HOURS = "10,18",
    RETURN_REMINDER_WINDOW_MINUTES = "15",
    RETURN_REMINDER_SWEEP_MS = "60000",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn(
        "Warning: Missing VAPID keys. Push notifications will not be sent.",
    );
} else {
    webpush.setVapidDetails(
        PUSH_CONTACT_EMAIL,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
    );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.use(express.json());
const allowedOrigins = APP_BASE_URL.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
app.use(cors({ origin: allowedOrigins, methods: ["GET", "POST"] }));

const PRIMARY_ORIGIN =
    allowedOrigins[0] || APP_BASE_URL.split(",")[0] || "http://localhost:3000";
const REMINDER_HOURS = RETURN_REMINDER_HOURS.split(",")
    .map((value) => parseInt(value.trim(), 10))
    .filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23)
    .sort((a, b) => a - b);
const REMINDER_WINDOW_MIN = Math.max(
    1,
    parseInt(RETURN_REMINDER_WINDOW_MINUTES, 10) || 15,
);
const REMINDER_SWEEP_MS = Math.max(
    30000,
    parseInt(RETURN_REMINDER_SWEEP_MS, 10) || 60000,
);
let reminderSweepInFlight = false;

function supportsPush() {
    return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

function sanitizeTimeZone(value) {
    const fallback = "UTC";
    if (!value || typeof value !== "string") return fallback;
    try {
        Intl.DateTimeFormat("fr-FR", { timeZone: value }).format(new Date());
        return value;
    } catch (e) {
        return fallback;
    }
}

function isMissingColumnError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("column") && message.includes("does not exist");
}

function getTimePartsInZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const pick = (type) => parts.find((p) => p.type === type)?.value || "";
    const year = pick("year");
    const month = pick("month");
    const day = pick("day");
    const hour = parseInt(pick("hour"), 10);
    const minute = parseInt(pick("minute"), 10);
    return {
        dateKey: `${year}-${month}-${day}`,
        hour,
        minute,
    };
}

function resolveReminderSlot(now, timeZone) {
    if (REMINDER_HOURS.length === 0) return null;
    const parts = getTimePartsInZone(now, timeZone);
    if (!Number.isFinite(parts.hour) || !Number.isFinite(parts.minute))
        return null;
    const slotHour = REMINDER_HOURS.find((h) => h === parts.hour);
    if (slotHour === undefined) return null;
    if (parts.minute < 0 || parts.minute >= REMINDER_WINDOW_MIN) return null;
    const hourKey = String(slotHour).padStart(2, "0");
    return {
        hour: slotHour,
        dateKey: parts.dateKey,
        slotKey: `${parts.dateKey}-${hourKey}`,
    };
}

function buildReturnReminderPayload(userId, slot) {
    const isMorning = slot.hour < 14;
    const title = isMorning ? "Rappel XERA • 10h" : "Rappel XERA • 18h";
    const body = isMorning
        ? "Prends 2 minutes pour documenter ta progression ce matin."
        : "Pense à documenter ta progression de la journée sur XERA.";
    const icon = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`;
    return {
        title,
        body,
        icon,
        link: `${PRIMARY_ORIGIN.replace(/\/$/, "")}/profile.html?user=${userId}`,
        tag: `xera-return-reminder-${slot.slotKey}`,
        renotify: false,
        silent: false,
    };
}

async function purgeStaleSubscription(endpoint) {
    if (!endpoint) return;
    try {
        await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", endpoint);
        console.log("Removed stale subscription", endpoint);
    } catch (error) {
        console.error("Failed to remove stale subscription", endpoint, error);
    }
}

async function sendPushToSubscription(sub, payload) {
    if (!supportsPush()) return { success: false, skipped: true };
    if (!sub?.endpoint || !sub?.keys) return { success: false, skipped: true };

    const payloadString = JSON.stringify(payload);
    const subscription = {
        endpoint: sub.endpoint,
        keys: sub.keys,
    };

    try {
        await webpush.sendNotification(subscription, payloadString);
        return { success: true };
    } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
            await purgeStaleSubscription(sub.endpoint);
            return { success: false, stale: true };
        }
        console.error("send push error", err);
        return { success: false, error: err };
    }
}

app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        payments: "disabled",
        push: supportsPush() ? "enabled" : "disabled",
        reminderHours: REMINDER_HOURS,
        reminderWindowMinutes: REMINDER_WINDOW_MIN,
        message: "Payments are currently disabled.",
    });
});

// Simple user upsert to keep Supabase usable while payments are disabled
app.post("/api/users/upsert", async (req, res) => {
    try {
        const { id, email } = req.body;
        if (!id) return res.status(400).json({ error: "Missing user id" });

        const { error } = await supabase
            .from("users")
            .upsert({ id, email: email || null });

        if (error) throw new Error(error.message);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Enregistrer / mettre à jour un abonnement Web Push pour un utilisateur
app.post("/api/push/subscribe", async (req, res) => {
    try {
        const {
            userId,
            subscription,
            timezone,
            reminderEnabled = true,
        } = req.body;
        if (!userId || !subscription || !subscription.endpoint) {
            return res
                .status(400)
                .json({ error: "Invalid subscription payload" });
        }

        const safeTimezone = sanitizeTimeZone(timezone);
        const basePayload = {
            user_id: userId,
            endpoint: subscription.endpoint,
            keys: subscription.keys || null,
        };
        const extendedPayload = {
            ...basePayload,
            reminder_timezone: safeTimezone,
            reminder_enabled: reminderEnabled !== false,
        };

        let { error } = await supabase
            .from("push_subscriptions")
            .upsert(extendedPayload, { onConflict: "endpoint" });

        // Compatibilité: si la migration reminder n'est pas encore appliquée, on retombe sur le schéma minimal.
        if (error && isMissingColumnError(error)) {
            ({ error } = await supabase
                .from("push_subscriptions")
                .upsert(basePayload, { onConflict: "endpoint" }));
        }

        if (error) throw error;

        res.json({ ok: true, timezone: safeTimezone });
    } catch (err) {
        console.error("push subscribe error", err);
        res.status(400).json({ error: err.message });
    }
});

// Relais temps-réel : notifications + messages directs
async function startPushRelay() {
    if (!supportsPush()) return;
    startNotificationPushRelay();
    startDirectMessagePushRelay();
}

function startNotificationPushRelay() {
    const channel = supabase.channel("server-push-relay-notifications");
    channel
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "notifications",
            },
            async (payload) => {
                const notif = payload.new;
                try {
                    await sendPushForNotification(notif);
                } catch (err) {
                    console.error("notification push relay error", err);
                }
            },
        )
        .subscribe((status) => {
            console.log("Notification push relay status:", status);
        });
}

function startDirectMessagePushRelay() {
    const channel = supabase.channel("server-push-relay-dm");
    channel
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "dm_messages",
            },
            async (payload) => {
                const message = payload.new;
                try {
                    await sendPushForDirectMessage(message);
                } catch (err) {
                    console.error("dm push relay error", err);
                }
            },
        )
        .subscribe((status) => {
            if (status === "CHANNEL_ERROR") {
                console.warn(
                    "DM push relay unavailable. Run sql/discovery-phase2-messaging.sql to enable messaging push.",
                );
            } else {
                console.log("DM push relay status:", status);
            }
        });
}

async function sendPushForNotification(notification) {
    if (!notification?.user_id) return;

    const { data: subs, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint, keys")
        .eq("user_id", notification.user_id);

    if (error) throw error;
    if (!subs || subs.length === 0) return;

    const payload = buildPushPayload(notification);
    for (const sub of subs) {
        await sendPushToSubscription(sub, payload);
    }
}

async function sendPushForDirectMessage(messageRow) {
    if (!messageRow?.conversation_id || !messageRow?.sender_id) return;

    const [
        { data: recipients, error: recipientsError },
        { data: senderUser, error: senderError },
    ] = await Promise.all([
        supabase
            .from("dm_participants")
            .select("user_id")
            .eq("conversation_id", messageRow.conversation_id)
            .neq("user_id", messageRow.sender_id),
        supabase
            .from("users")
            .select("id, name")
            .eq("id", messageRow.sender_id)
            .maybeSingle(),
    ]);

    if (recipientsError) throw recipientsError;
    if (senderError) {
        console.warn(
            "Sender lookup failed for DM push",
            senderError.message || senderError,
        );
    }

    const recipientIds = Array.from(
        new Set((recipients || []).map((r) => r.user_id).filter(Boolean)),
    );
    if (recipientIds.length === 0) return;

    const { data: subs, error: subsError } = await supabase
        .from("push_subscriptions")
        .select("user_id, endpoint, keys")
        .in("user_id", recipientIds);

    if (subsError) throw subsError;
    if (!subs || subs.length === 0) return;

    const payload = buildDirectMessagePushPayload(
        messageRow,
        senderUser?.name || "",
    );
    for (const sub of subs) {
        await sendPushToSubscription(sub, payload);
    }
}

function buildPushPayload(notification) {
    const typeTitleMap = {
        support: "Nouveau soutien",
        follow: "Nouvel abonné",
        encouragement: "Nouvel encouragement",
        new_trace: "Nouvelle trace",
        new_arc: "Nouvel ARC",
        stream: "Notification live",
        live_start: "Live en cours",
        collaboration: "Demande de collaboration",
        like: "Nouveau like",
        comment: "Nouveau commentaire",
        mention: "Mention",
        achievement: "Succès débloqué",
    };

    const title = typeTitleMap[notification.type] || "Notification XERA";
    const icon = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`;
    const link =
        normalizeNotificationLink(notification) ||
        `${PRIMARY_ORIGIN.replace(/\/$/, "")}/profile.html?user=${notification.user_id}`;

    return {
        title,
        body: notification.message || "",
        icon,
        link,
        tag: notification.id,
        renotify: false,
        silent: false,
    };
}

function buildDirectMessagePushPayload(messageRow, senderName) {
    const senderLabel =
        senderName && String(senderName).trim()
            ? String(senderName).trim()
            : "Nouveau message";
    const bodyRaw = String(messageRow?.body || "")
        .replace(/\s+/g, " ")
        .trim();
    const body =
        bodyRaw.length > 160
            ? `${bodyRaw.slice(0, 159)}…`
            : bodyRaw || "Vous avez reçu un nouveau message.";
    const icon = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`;
    const link = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/index.html?messages=1&dm=${encodeURIComponent(messageRow.sender_id)}`;

    return {
        title: `Message de ${senderLabel}`,
        body,
        icon,
        link,
        tag: `dm-${messageRow.id}`,
        renotify: true,
        silent: false,
    };
}

function normalizeNotificationLink(notification) {
    const base = PRIMARY_ORIGIN.replace(/\/$/, "");
    const raw = (notification && notification.link) || "";
    if (!raw) return "";
    const streamMatch = raw.match(/\/stream\/?([\w-]{8,})/i);
    if (streamMatch) {
        return `${base}/stream.html?id=${streamMatch[1]}`;
    }
    const profileMatch = raw.match(/\/profile\/?([\w-]{8,})/i);
    if (profileMatch) {
        return `${base}/profile.html?user=${profileMatch[1]}`;
    }
    const profileHtmlMatch = raw.match(/profile\.html\?user=([\w-]{8,})/i);
    if (profileHtmlMatch) {
        return `${base}/profile.html?user=${profileHtmlMatch[1]}`;
    }
    if (raw.startsWith("http")) return raw;
    if (raw.startsWith("/")) return `${base}${raw}`;
    return `${base}/${raw}`;
}

function getBearerToken(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== "string") return "";
    const [scheme, token] = authHeader.split(" ");
    if (!scheme || !token) return "";
    if (scheme.toLowerCase() !== "bearer") return "";
    return token.trim();
}

async function sendScheduledReturnReminders() {
    if (!supportsPush()) return;
    if (REMINDER_HOURS.length === 0) return;
    if (reminderSweepInFlight) return;
    reminderSweepInFlight = true;

    try {
        const { data: subs, error } = await supabase
            .from("push_subscriptions")
            .select(
                "endpoint, keys, user_id, reminder_timezone, reminder_enabled, last_reminder_slot",
            )
            .eq("reminder_enabled", true);

        if (error) {
            if (isMissingColumnError(error)) {
                console.warn(
                    "Reminder columns missing in push_subscriptions. Run sql/push-subscriptions.sql to enable 10h/18h reminders.",
                );
                return;
            }
            throw error;
        }
        if (!subs || subs.length === 0) return;

        const now = new Date();
        for (const sub of subs) {
            if (!sub?.endpoint || !sub?.keys || !sub?.user_id) continue;
            const timeZone = sanitizeTimeZone(sub.reminder_timezone || "UTC");
            const slot = resolveReminderSlot(now, timeZone);
            if (!slot) continue;
            if (sub.last_reminder_slot === slot.slotKey) continue;

            const payload = buildReturnReminderPayload(sub.user_id, slot);
            const result = await sendPushToSubscription(sub, payload);
            if (!result.success) continue;

            const { error: updateError } = await supabase
                .from("push_subscriptions")
                .update({
                    reminder_timezone: timeZone,
                    last_reminder_slot: slot.slotKey,
                })
                .eq("endpoint", sub.endpoint);

            if (updateError) {
                if (!isMissingColumnError(updateError)) {
                    console.error(
                        "Failed to persist reminder slot",
                        updateError,
                    );
                }
            }
        }
    } catch (error) {
        console.error("Reminder sweep error", error);
    } finally {
        reminderSweepInFlight = false;
    }
}

function startReminderScheduler() {
    if (!supportsPush()) return;
    if (REMINDER_HOURS.length === 0) return;
    setInterval(() => {
        sendScheduledReturnReminders().catch((error) => {
            console.error("Reminder scheduler tick error", error);
        });
    }, REMINDER_SWEEP_MS);
    sendScheduledReturnReminders().catch((error) => {
        console.error("Initial reminder sweep error", error);
    });
}

app.post("/api/account/delete", async (req, res) => {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return res
                .status(401)
                .json({ error: "Missing authorization token" });
        }

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);

        if (authError || !authData?.user?.id) {
            return res.status(401).json({ error: "Invalid session token" });
        }

        const authedUserId = authData.user.id;
        const requestedUserId = String(req.body?.userId || "").trim();
        if (requestedUserId && requestedUserId !== authedUserId) {
            return res
                .status(403)
                .json({ error: "Forbidden account deletion target" });
        }

        const rawReason = String(req.body?.reason || "").trim();
        const rawDetail = String(req.body?.detail || "").trim();
        const allowedReasons = new Set([
            "inactive",
            "technical",
            "privacy",
            "experience",
            "other",
        ]);
        const safeReason = allowedReasons.has(rawReason) ? rawReason : "other";
        const safeDetail = rawDetail.slice(0, 1200);

        // Archive lightweight feedback before deletion (best effort).
        try {
            const reasonLine = `account-delete:${safeReason}`;
            const detailLine = safeDetail ? ` | detail:${safeDetail}` : "";
            const comment = `${reasonLine}${detailLine}`.slice(0, 400);
            await supabase.from("feedback_inbox").insert({
                mood: null,
                comment,
                sender_user_id: authedUserId,
                receiver_id: null,
            });
        } catch (feedbackError) {
            console.warn(
                "Account delete feedback insert failed",
                feedbackError?.message || feedbackError,
            );
        }

        // Remove app profile first; foreign keys should cascade related app data.
        const { error: profileDeleteError } = await supabase
            .from("users")
            .delete()
            .eq("id", authedUserId);

        if (profileDeleteError) {
            throw profileDeleteError;
        }

        // Delete Supabase Auth user (service role).
        const { error: authDeleteError } =
            await supabase.auth.admin.deleteUser(authedUserId);
        if (authDeleteError) {
            throw authDeleteError;
        }

        return res.json({ ok: true });
    } catch (error) {
        console.error("Account delete error", error);
        return res.status(500).json({
            error: error?.message || "Unable to delete account",
        });
    }
});

// --- INTÉGRATION MONÉTISATION ---
try {
    // Charge les routes de monétisation depuis le fichier dédié
    // Note: monetization-server.js doit exporter le router (module.exports = router/app)
    const monetizationRoutes = require("./monetization-server");
    app.use(monetizationRoutes);
    console.log("✅ Module de monétisation chargé.");
} catch (error) {
    // Ignore l'erreur seulement si le fichier est absent (pour éviter de casser le serveur si pas encore déployé)
    if (error.code !== "MODULE_NOT_FOUND")
        console.error("❌ Erreur chargement monétisation:", error);
    else
        console.log(
            "ℹ️ Fichier monetization-server.js non trouvé, monétisation inactive.",
        );
}

app.use((_req, res) => {
    res.status(404).json({ error: "Endpoint introuvable." });
});

app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
    startPushRelay();
    startReminderScheduler();
});
