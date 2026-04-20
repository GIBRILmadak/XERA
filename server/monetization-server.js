const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const webpush = require("web-push");
const crypto = require("crypto");

dotenv.config();

const {
    APP_BASE_URL = "http://localhost:3000",
    PORT = 5050,
    SUPABASE_URL = "https://ssbuagqwjptyhavinkxg.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzYnVhZ3F3anB0eWhhdmlua3hnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTk1MjUzMywiZXhwIjoyMDg1NTI4NTMzfQ._aEaTXFxqpfx64bts6Z7FoP3L4oHMGcqoi08yREU33s",
    VAPID_PUBLIC_KEY = "BDyU4kv_cnxruA5n_i3kw0-ipEXZTINrLmwVAhyyFhXsIVC6eImDqhkLVLs77Fl-TJdyOJVZsnp-k6z_7bu0bTM",
    VAPID_PRIVATE_KEY = "6dmRHoFpyGEFgL487qqwBc9BQ184TC8N9Yd3siS94Skpka",
    PUSH_CONTACT_EMAIL = "mailto:notif.xera@zohomail.com",
    RETURN_REMINDER_HOURS = "10,18",
    RETURN_REMINDER_WINDOW_MINUTES = "15",
    RETURN_REMINDER_SWEEP_MS = "600000",
    RETURN_REMINDER_EMAIL_ENABLED = "1",
    RETURN_REMINDER_EMAIL_PROVIDER = "none",
    RETURN_REMINDER_EMAIL_FROM = "XERA <notif.xera@zohomail.com>",
    RETURN_REMINDER_EMAIL_REPLY_TO = "",
    RETURN_REMINDER_EMAIL_API_KEY = "",
    RETURN_REMINDER_EMAIL_WEBHOOK_URL = "",
    RETURN_REMINDER_EMAIL_WEBHOOK_TOKEN = "",
    USD_TO_CDF_RATE = "2300",
    CALLBACK_BASE_URL = "",
    MAISHAPAY_USE_CALLBACK = "1",

    MAISHAPAY_PUBLIC_KEY = "MP-LIVEPK-Gl4b.T27YY9$ydZA$1uQq0jVo1D8lRhPJ7Vw0Z5vssuO1NU3n$$0OPOdzPf52qU01u3s0dS9VK2FB7z8IbqkbYO1r6PZblygvafZFQFyMOG$JBDq$zTfy/3C",

    MAISHAPAY_SECRET_KEY = "MP-LIVESK-4PWp0AU4S0sfMqQ$E1Qpkl1jcq$zxCD3wy7jNYbGFCodo8qyX$vk$gU$quKhJrwtMwXuq363rvWAcNfeU6Z2GYLB5lNrvR4GNo/$NB10Kt/1oMyKQAAOJ2sY",

    MAISHAPAY_GATEWAY_MODE = "1",
    MAISHAPAY_CHECKOUT_URL = "https://marchand.maishapay.online/payment/vers1.0/merchant/checkout",
    MAISHAPAY_CALLBACK_SECRET = "31aca49d0e1d9deeb8857a01eab9c38014508ad216b587ee9662823f6cd9a633",
    SUPER_ADMIN_ID = "b0f9f893-1706-4721-899c-d26ad79afc86",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    // Do not exit the process in serverless environments (Vercel functions)
    // to avoid FUNCTION_INVOCATION_FAILED on missing env vars. Endpoints
    // will return errors later if configuration is invalid.
}

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn(
        "Warning: Missing VAPID keys. Push notifications will not be sent.",
    );
} else {
    // Normalize subject: allow plain email addresses in .env
    let vapidSubject = String(PUSH_CONTACT_EMAIL || "").trim();
    if (vapidSubject && !/^(mailto:|https?:)/i.test(vapidSubject)) {
        vapidSubject = `mailto:${vapidSubject}`;
    }
    try {
        webpush.setVapidDetails(
            vapidSubject,
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY,
        );
    } catch (err) {
        console.warn("Invalid VAPID configuration:", err?.message || err);
    }
}

// Firebase Admin (FCM / APNs via FCM)
let firebaseAdminInitialized = false;
let firebaseAdmin = null;
try {
    firebaseAdmin = require("firebase-admin");
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
        process.env;

    if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
        try {
            firebaseAdmin.initializeApp({
                credential: firebaseAdmin.credential.cert({
                    projectId: FIREBASE_PROJECT_ID,
                    clientEmail: FIREBASE_CLIENT_EMAIL,
                    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
                }),
            });
            firebaseAdminInitialized = true;
            console.log("Firebase admin initialized for native push");
        } catch (err) {
            console.warn(
                "Failed to initialize Firebase admin:",
                err?.message || err,
            );
        }
    } else {
        console.info("Firebase admin not configured; native push disabled.");
    }
} catch (err) {
    console.info("firebase-admin not installed; native push disabled.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const allowedOrigins = APP_BASE_URL.split(",")
    .map((v) => v.trim())
    .filter(Boolean);

function isLoopbackOrigin(origin) {
    try {
        const url = new URL(String(origin || "").trim());
        return (
            url.protocol === "http:" &&
            (url.hostname === "localhost" || url.hostname === "127.0.0.1")
        );
    } catch (error) {
        return false;
    }
}

app.use(
    cors({
        origin(origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }
            if (allowedOrigins.includes(origin) || isLoopbackOrigin(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("Origin not allowed by CORS"));
        },
        methods: ["GET", "POST", "OPTIONS"],
    }),
);

function parseBooleanEnv(value, fallback = false) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function hasPublicCallbackBaseUrl(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.includes("xxxxx.loca.lt")) return false;
    try {
        const url = new URL(raw);
        const hostname = String(url.hostname || "").toLowerCase();
        if (url.protocol !== "https:") return false;
        if (hostname === "localhost" || hostname === "127.0.0.1") return false;
        return true;
    } catch (error) {
        return false;
    }
}

function stripTrailingSlash(value) {
    return String(value || "")
        .trim()
        .replace(/\/+$/, "");
}

function resolveCallbackOrigin(callbackBaseUrl, primaryOrigin) {
    const explicitOrigin = stripTrailingSlash(callbackBaseUrl);
    if (hasPublicCallbackBaseUrl(explicitOrigin)) {
        return explicitOrigin;
    }

    const fallbackOrigin = stripTrailingSlash(primaryOrigin);
    if (hasPublicCallbackBaseUrl(fallbackOrigin)) {
        return fallbackOrigin;
    }

    return "";
}

function getRequestOrigin(req) {
    const forwardedProto = String(
        req?.headers?.["x-forwarded-proto"] || req?.protocol || "",
    )
        .split(",")[0]
        .trim()
        .toLowerCase();
    const forwardedHost = String(
        req?.headers?.["x-forwarded-host"] || req?.headers?.host || "",
    )
        .split(",")[0]
        .trim();

    if (!forwardedProto || !forwardedHost) {
        return "";
    }

    return stripTrailingSlash(`${forwardedProto}://${forwardedHost}`);
}

function readHeader(req, headerName) {
    if (!req || !req.headers) return "";
    const directValue = req.headers[headerName];
    if (typeof directValue === "string") return directValue.trim();

    const normalizedKey = Object.keys(req.headers).find(
        (key) => key && key.toLowerCase() === String(headerName).toLowerCase(),
    );
    return normalizedKey ? String(req.headers[normalizedKey] || "").trim() : "";
}

function authorizeCronRequest(req) {
    const configuredSecret = String(process.env.CRON_SECRET || "").trim();
    if (!configuredSecret) {
        return { ok: true, unsecured: true };
    }

    const authHeader = readHeader(req, "authorization");
    const bearerToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";
    const headerSecret = readHeader(req, "x-cron-secret");
    const providedSecret = bearerToken || headerSecret;

    if (providedSecret && providedSecret === configuredSecret) {
        return { ok: true, unsecured: false };
    }

    return {
        ok: false,
        status: 401,
        message: "Unauthorized cron request.",
    };
}

function escapeHtmlAttr(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

const PRIMARY_ORIGIN = stripTrailingSlash(
    allowedOrigins[0] || APP_BASE_URL.split(",")[0] || "http://localhost:3000",
);
const CALLBACK_ORIGIN = resolveCallbackOrigin(
    CALLBACK_BASE_URL,
    PRIMARY_ORIGIN,
);
const MAISHAPAY_CALLBACK_ALLOWED = parseBooleanEnv(
    MAISHAPAY_USE_CALLBACK,
    true,
);
const MAISHAPAY_CALLBACK_ENABLED =
    MAISHAPAY_CALLBACK_ALLOWED && Boolean(CALLBACK_ORIGIN);

function getMaishaPayCallbackConfig(req) {
    if (!MAISHAPAY_CALLBACK_ALLOWED) {
        return {
            callbackEnabled: false,
            callbackOrigin: "",
        };
    }

    const requestOrigin = getRequestOrigin(req);
    const callbackOrigin = resolveCallbackOrigin(
        CALLBACK_BASE_URL,
        requestOrigin || PRIMARY_ORIGIN,
    );

    return {
        callbackEnabled: Boolean(callbackOrigin),
        callbackOrigin,
    };
}

function buildProfileReturnPath(userId) {
    if (!userId) return "/profile.html";
    return `/profile.html?user=${encodeURIComponent(userId)}`;
}

function sanitizeReturnPath(value, fallbackPath = "/") {
    const fallback = String(fallbackPath || "/").trim() || "/";
    const raw = String(value || "").trim();
    if (!raw) return fallback;

    try {
        const baseUrl = new URL(
            PRIMARY_ORIGIN || APP_BASE_URL || "http://localhost:3000",
        );
        const url = new URL(raw, baseUrl);
        if (url.origin !== baseUrl.origin) {
            return fallback;
        }
        return `${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
        return fallback;
    }
}

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
const REMINDER_EMAIL_ENABLED = parseBooleanEnv(
    RETURN_REMINDER_EMAIL_ENABLED,
    true,
);
const REMINDER_EMAIL_PROVIDER = String(RETURN_REMINDER_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
const REMINDER_EMAIL_FROM = String(RETURN_REMINDER_EMAIL_FROM || "").trim();
const REMINDER_EMAIL_REPLY_TO = String(
    RETURN_REMINDER_EMAIL_REPLY_TO || "",
).trim();
const REMINDER_EMAIL_API_KEY = String(
    RETURN_REMINDER_EMAIL_API_KEY || "",
).trim();
const REMINDER_EMAIL_WEBHOOK_URL = String(
    RETURN_REMINDER_EMAIL_WEBHOOK_URL || "",
).trim();
const REMINDER_EMAIL_WEBHOOK_TOKEN = String(
    RETURN_REMINDER_EMAIL_WEBHOOK_TOKEN || "",
).trim();
const DAY_MS = 24 * 60 * 60 * 1000;
let reminderSweepInFlight = false;
const rawSubscriptionSweepMs = parseInt(process.env.SUBSCRIPTION_SWEEP_MS, 10);
const SUBSCRIPTION_SWEEP_MS = Number.isFinite(rawSubscriptionSweepMs)
    ? Math.max(0, rawSubscriptionSweepMs)
    : 10 * 60 * 1000;
let subscriptionSweepInFlight = false;
let lastSweepNetworkErrorAt = 0;

const EXPIRES_BADGES = new Set(["verified", "verified_gold", "gold", "pro"]);
const PROTECTED_BADGES = new Set([
    "staff",
    "team",
    "community",
    "company",
    "enterprise",
    "ambassador",
]);

/**
 * Calcule les fonctionnalités premium selon le plan
 * @param {string} plan - Le plan (standard, medium, pro)
 * @returns {object} Les fonctionnalités premium activées
 */
function computePremiumFeatures(plan) {
    const normalizedPlan = String(plan || "").toLowerCase();
    const features = {
        advanced_profile_customization: false,
        priority_recommendations: false,
        full_profile_customization: false,
        hd_streaming: false,
        private_live: false,
        advanced_collab_tools: false,
        realtime_analytics: false,
        data_export: false,
        maximum_visibility: false,
    };

    if (normalizedPlan === "medium") {
        features.advanced_profile_customization = true;
        features.priority_recommendations = true;
    } else if (normalizedPlan === "pro") {
        features.advanced_profile_customization = true;
        features.priority_recommendations = true;
        features.full_profile_customization = true;
        features.hd_streaming = true;
        features.private_live = true;
        features.advanced_collab_tools = true;
        features.realtime_analytics = true;
        features.data_export = true;
        features.maximum_visibility = true;
    }

    return features;
}

const MAISHAPAY_PLANS = {
    standard: 2.99,
    medium: 7.99,
    pro: 14.99,
};

const USD_TO_CDF_RATE_VALUE = Math.max(
    1,
    Number.parseFloat(USD_TO_CDF_RATE) || 2300,
);
const WITHDRAWAL_MIN_USD = 5;
const SUPPORT_MIN_USD = 1;
const SUPPORT_MAX_USD = 1000;
const SUPPORT_COMMISSION_RATE = 0.2;
const SUPPORTED_MOBILE_MONEY_PROVIDERS = new Set([
    "airtel_money",
    "orange_money",
    "mpesa",
    "afrimoney",
    "other",
]);
const MOBILE_MONEY_PROVIDER_LABELS = {
    airtel_money: "Airtel Money",
    orange_money: "Orange Money",
    mpesa: "M-Pesa",
    afrimoney: "Afrimoney",
    other: "Autre",
};

function isValidPlanId(value) {
    return ["standard", "medium", "pro"].includes(
        String(value || "").toLowerCase(),
    );
}

function computeMaishaPayAmount(plan, billingCycle, currency) {
    const monthlyUsd = MAISHAPAY_PLANS[plan];
    if (!monthlyUsd) return null;
    const amountUsd =
        billingCycle === "annual" ? monthlyUsd * 12 * 0.8 : monthlyUsd;
    if (String(currency).toUpperCase() === "CDF") {
        return Math.round(amountUsd * USD_TO_CDF_RATE_VALUE);
    }
    // MaishaPay: on affiche les prix décimaux côté UI, mais on facture un entier.
    return Math.ceil(amountUsd);
}

function computeSupportCheckoutAmount(amountUsd, currency) {
    const normalizedAmount = roundMoney(amountUsd);
    if (
        !Number.isFinite(normalizedAmount) ||
        normalizedAmount < SUPPORT_MIN_USD ||
        normalizedAmount > SUPPORT_MAX_USD
    ) {
        return null;
    }

    if (String(currency).toUpperCase() === "CDF") {
        return Math.max(
            1,
            Math.round(normalizedAmount * USD_TO_CDF_RATE_VALUE),
        );
    }

    return Math.ceil(normalizedAmount);
}

function inferMaishaPayKeyMode(value) {
    const key = String(value || "").toUpperCase();
    if (key.startsWith("MP-LIVE")) return "live";
    if (key.startsWith("MP-SB")) return "sandbox";
    return "unknown";
}

function maskKey(value, visible = 10) {
    const key = String(value || "");
    if (!key) return "<empty>";
    if (key.length <= visible) return `${"*".repeat(key.length)}`;
    return `${key.slice(0, visible)}***`;
}

function addMonths(date, months) {
    const result = new Date(date);
    const desired = result.getMonth() + months;
    result.setMonth(desired);
    return result;
}

function createSignedState(payload) {
    if (!MAISHAPAY_CALLBACK_SECRET) return null;
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
        .createHmac("sha256", MAISHAPAY_CALLBACK_SECRET)
        .update(data)
        .digest("base64url");
    return `${data}.${signature}`;
}

function verifySignedState(state) {
    if (!state || !MAISHAPAY_CALLBACK_SECRET) return null;
    const [data, signature] = String(state).split(".");
    if (!data || !signature) return null;
    const expected = crypto
        .createHmac("sha256", MAISHAPAY_CALLBACK_SECRET)
        .update(data)
        .digest("base64url");
    const expectedHex = crypto
        .createHmac("sha256", MAISHAPAY_CALLBACK_SECRET)
        .update(data)
        .digest("hex");
    const validBase64Url =
        signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const validHex =
        /^[a-f0-9]+$/i.test(signature) &&
        signature.length === expectedHex.length &&
        crypto.timingSafeEqual(
            Buffer.from(signature, "hex"),
            Buffer.from(expectedHex, "hex"),
        );
    if (!validBase64Url && !validHex) return null;
    try {
        const payload = JSON.parse(
            Buffer.from(data, "base64url").toString("utf8"),
        );
        const expiresAt = Number(payload?.e ?? payload?.expires_at);
        if (Number.isFinite(expiresAt) && Date.now() > expiresAt) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

async function resolveUserId(accessToken, fallbackId) {
    const requestUser = await resolveRequestUser(accessToken, fallbackId);
    return requestUser.id;
}

async function resolveRequestUser(accessToken, fallbackId) {
    if (!accessToken) {
        return {
            id: fallbackId || null,
            email: null,
            username: null,
            name: null,
            avatarUrl: null,
            accountType: null,
            accountSubtype: null,
            badge: null,
        };
    }
    try {
        const { data, error } = await supabase.auth.getUser(accessToken);
        if (!error && data?.user?.id) {
            const metadata =
                data.user.user_metadata &&
                typeof data.user.user_metadata === "object"
                    ? data.user.user_metadata
                    : {};
            return {
                id: data.user.id,
                email: data.user.email || null,
                username: metadata.username || null,
                name: metadata.name || metadata.full_name || null,
                avatarUrl: metadata.avatar_url || metadata.avatar || null,
                accountType: metadata.account_type || null,
                accountSubtype: metadata.account_subtype || null,
                badge: metadata.badge || null,
            };
        }
    } catch (e) {
        // ignore
    }
    return {
        id: fallbackId || null,
        email: null,
        username: null,
        name: null,
        avatarUrl: null,
        accountType: null,
        accountSubtype: null,
        badge: null,
    };
}

async function ensurePublicUserRecord(userId, options = {}) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return;

    const email = String(options.email || "").trim() || null;
    const username =
        String(options.username || options.name || "").trim() ||
        (email ? email.split("@")[0] : "") ||
        "xera_user";
    const displayName = String(options.name || "").trim() || username;
    const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeUserId}`;
    const defaultBanner =
        "https://placehold.co/1200x300/1a1a2e/00ff88?text=Ma+Trajectoire";
    const nowIso = new Date().toISOString();
    const payloadCandidates = [
        {
            id: safeUserId,
            email,
            username,
            name: displayName,
            title: "Nouveau membre",
            bio: "",
            avatar: String(options.avatarUrl || "").trim() || defaultAvatar,
            banner: defaultBanner,
            account_type: options.accountType || null,
            account_subtype: options.accountSubtype || null,
            badge: options.badge || null,
            social_links: {},
            updated_at: nowIso,
        },
        {
            id: safeUserId,
            username,
            name: displayName,
            title: "Nouveau membre",
            bio: "",
            avatar: String(options.avatarUrl || "").trim() || defaultAvatar,
            banner: defaultBanner,
            badge: options.badge || null,
            updated_at: nowIso,
        },
        {
            id: safeUserId,
            username,
            name: displayName,
            updated_at: nowIso,
        },
        {
            id: safeUserId,
            name: displayName,
            updated_at: nowIso,
        },
        {
            id: safeUserId,
        },
    ].map((payload) =>
        Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined),
        ),
    );

    let lastError = null;
    for (const payload of payloadCandidates) {
        const { error } = await supabase.from("users").upsert(payload, {
            onConflict: "id",
        });

        if (!error) {
            return;
        }

        lastError = error;
        if (
            !isMissingColumnError(error) &&
            !isMissingRelationError(error) &&
            !isNotNullViolation(error)
        ) {
            break;
        }
    }

    if (lastError) {
        throw lastError;
    }
}

async function createPendingSubscriptionPayment({
    userId,
    plan,
    billingCycle,
    currency,
    amount,
    method,
    provider,
    walletId,
    returnPath,
    callbackEnabled = MAISHAPAY_CALLBACK_ENABLED,
    callbackOrigin = CALLBACK_ORIGIN,
}) {
    const checkoutRefId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const metadata = {
        payment_provider: "maishapay",
        checkout_ref_id: checkoutRefId,
        plan: String(plan || "").toLowerCase(),
        billing_cycle: String(billingCycle || "monthly").toLowerCase(),
        method: String(method || "card").toLowerCase(),
        provider: provider || null,
        wallet_id: walletId || null,
        callback_return_path: returnPath || null,
        callback_enabled: callbackEnabled,
        callback_origin: callbackEnabled ? callbackOrigin || null : null,
        checkout_started_at: nowIso,
    };

    const { data, error } = await supabase
        .from("transactions")
        .insert({
            from_user_id: userId,
            to_user_id: userId,
            type: "subscription",
            amount_gross: amount,
            amount_net_creator: 0,
            amount_commission_xera: 0,
            currency,
            status: "pending",
            description: `Paiement abonnement ${plan} (${billingCycle}) en attente`,
            metadata,
        })
        .select("id, metadata, created_at")
        .single();

    if (error) {
        throw error;
    }

    return {
        id: data.id,
        checkoutRefId,
        createdAt: data.created_at,
    };
}

async function createPendingSupportPayment({
    fromUserId,
    toUserId,
    amountUsd,
    checkoutAmount,
    checkoutCurrency,
    method,
    provider,
    walletId,
    description,
    senderName,
    recipientName,
    returnPath,
    callbackEnabled = MAISHAPAY_CALLBACK_ENABLED,
    callbackOrigin = CALLBACK_ORIGIN,
}) {
    const checkoutRefId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const breakdown = computeSupportRevenueBreakdown(amountUsd);
    const metadata = {
        payment_provider: "maishapay",
        checkout_ref_id: checkoutRefId,
        support_kind: "direct",
        sender_name: senderName || "Utilisateur",
        recipient_name: recipientName || "Créateur",
        method: String(method || "card").toLowerCase(),
        provider: provider || null,
        wallet_id: walletId || null,
        support_amount_usd: breakdown.gross,
        checkout_amount: checkoutAmount,
        checkout_currency: String(checkoutCurrency || "USD").toUpperCase(),
        callback_return_path: returnPath || null,
        commission_rate: SUPPORT_COMMISSION_RATE,
        amount_net_creator: breakdown.netCreator,
        amount_commission_xera: breakdown.commission,
        callback_enabled: callbackEnabled,
        callback_origin: callbackEnabled ? callbackOrigin || null : null,
        checkout_started_at: nowIso,
    };

    const { data, error } = await supabase
        .from("transactions")
        .insert({
            from_user_id: fromUserId,
            to_user_id: toUserId,
            type: "support",
            amount_gross: breakdown.gross,
            amount_net_creator: breakdown.netCreator,
            amount_commission_xera: breakdown.commission,
            currency: "USD",
            status: "pending",
            description:
                description ||
                `Soutien pour ${recipientName || "un créateur"} en attente`,
            metadata,
        })
        .select("id, metadata, created_at")
        .single();

    if (error) {
        throw error;
    }

    return {
        id: data.id,
        checkoutRefId,
        createdAt: data.created_at,
    };
}

function renderMaishaPayCheckoutPage({ amount, currency, callbackUrl }) {
    const callbackInput = callbackUrl
        ? `\n          <input type="hidden" name="callbackUrl" value="${escapeHtmlAttr(callbackUrl)}">`
        : "";

    return `
      <!doctype html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Redirection MaishaPay</title>
      </head>
      <body>
        <p>Redirection vers MaishaPay...</p>
        <form id="mpForm" action="${MAISHAPAY_CHECKOUT_URL}" method="POST">
          <input type="hidden" name="gatewayMode" value="${escapeHtmlAttr(MAISHAPAY_GATEWAY_MODE)}">
          <input type="hidden" name="publicApiKey" value="${escapeHtmlAttr(MAISHAPAY_PUBLIC_KEY)}">
          <input type="hidden" name="secretApiKey" value="${escapeHtmlAttr(MAISHAPAY_SECRET_KEY)}">
          <input type="hidden" name="montant" value="${escapeHtmlAttr(amount)}">
          <input type="hidden" name="devise" value="${escapeHtmlAttr(currency)}">${callbackInput}
        </form>
        <script>
          document.getElementById('mpForm').submit();
        </script>
      </body>
      </html>
    `;
}

async function authenticateRequest(req) {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
        return { error: { status: 401, message: "Token manquant." } };
    }

    const { data: authData, error: authError } =
        await supabase.auth.getUser(token);
    if (authError || !authData?.user?.id) {
        return {
            error: { status: 401, message: "Utilisateur non authentifié." },
        };
    }
    return { user: authData.user, token };
}

async function authenticateSuperAdmin(req) {
    const authResult = await authenticateRequest(req);
    if (authResult.error) {
        return authResult;
    }
    if (authResult.user.id !== SUPER_ADMIN_ID) {
        return { error: { status: 403, message: "Accès refusé." } };
    }
    return authResult;
}

function extractSubscriptionPaymentDetails(row) {
    const metadata =
        row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return {
        id: row?.id || null,
        userId: row?.to_user_id || row?.from_user_id || null,
        amount:
            Number.isFinite(Number(row?.amount_gross)) &&
            Number(row.amount_gross) > 0
                ? Number(row.amount_gross)
                : Number(metadata.amount || 0),
        currency: String(
            row?.currency || metadata.currency || "USD",
        ).toUpperCase(),
        status: String(row?.status || "").toLowerCase(),
        plan: String(metadata.plan || "").toLowerCase(),
        billingCycle: String(metadata.billing_cycle || "monthly").toLowerCase(),
        method: String(metadata.method || "card").toLowerCase(),
        provider: metadata.provider || null,
        walletId: metadata.wallet_id || null,
        checkoutRefId: metadata.checkout_ref_id || null,
        transactionRefId: metadata.transaction_ref_id || null,
        operatorRefId: metadata.operator_ref_id || null,
        description: row?.description || "",
        createdAt: row?.created_at || null,
        updatedAt: row?.updated_at || null,
        metadata,
    };
}

function roundMoney(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount * 100) / 100;
}

function computeSupportRevenueBreakdown(amountUsd) {
    const gross = roundMoney(amountUsd);
    const commission = roundMoney(gross * SUPPORT_COMMISSION_RATE);
    const netCreator = roundMoney(Math.max(0, gross - commission));

    return {
        gross,
        commission,
        netCreator,
    };
}

function resolveTransactionNetAmount(row) {
    const explicitNet = Number(row?.amount_net_creator);
    if (Number.isFinite(explicitNet) && explicitNet > 0) {
        return roundMoney(explicitNet);
    }

    if (String(row?.type || "").toLowerCase() === "support") {
        return computeSupportRevenueBreakdown(row?.amount_gross).netCreator;
    }

    return roundMoney(explicitNet);
}

function resolveTransactionCommissionAmount(row) {
    const explicitCommission = Number(row?.amount_commission_xera);
    if (Number.isFinite(explicitCommission) && explicitCommission > 0) {
        return roundMoney(explicitCommission);
    }

    if (String(row?.type || "").toLowerCase() === "support") {
        return computeSupportRevenueBreakdown(row?.amount_gross).commission;
    }

    return roundMoney(explicitCommission);
}

function normalizeMobileMoneyProvider(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    return SUPPORTED_MOBILE_MONEY_PROVIDERS.has(normalized) ? normalized : null;
}

function sanitizeWalletNumber(value) {
    return String(value || "")
        .trim()
        .replace(/[^\d+]/g, "")
        .slice(0, 32);
}

function sanitizePayoutText(value, maxLength = 160) {
    return String(value || "")
        .trim()
        .slice(0, maxLength);
}

function isMissingRelationError(error) {
    const message = String(error?.message || "").toLowerCase();
    return (
        (message.includes("relation") && message.includes("does not exist")) ||
        (message.includes("could not find") && message.includes("table")) ||
        message.includes("schema cache")
    );
}

function getWalletSchemaErrorMessage() {
    return "Schema portefeuille manquant. Executez sql/monetization-supabase-one-shot.sql ou sql/monetization-wallet.sql dans Supabase SQL Editor.";
}

function isForeignKeyViolation(error) {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").toLowerCase();
    return (
        code === "23503" ||
        (message.includes("foreign key") && message.includes("violates"))
    );
}

function isNotNullViolation(error) {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").toLowerCase();
    return (
        code === "23502" ||
        (message.includes("null value") && message.includes("violates"))
    );
}

function getReadableServerErrorMessage(error, fallbackMessage) {
    const message = String(error?.message || "").trim();
    if (!message) return fallbackMessage;
    return message.slice(0, 280);
}

function setResponseHeader(res, name, value) {
    if (!res || !name) return;
    if (typeof res.set === "function") {
        res.set(name, value);
        return;
    }
    if (typeof res.setHeader === "function") {
        res.setHeader(name, value);
    }
}

function sendCheckoutErrorResponse(res, error, fallbackMessage) {
    const sourceCode = String(error?.code || "").trim() || "UNKNOWN";
    let category = "checkout_failure";

    if (isMissingRelationError(error) || isMissingColumnError(error)) {
        category = "schema_missing";
        setResponseHeader(res, "X-Xera-Error-Category", category);
        setResponseHeader(res, "X-Xera-Error-Code", sourceCode);
        return res.status(503).send(getWalletSchemaErrorMessage());
    }

    if (isForeignKeyViolation(error)) {
        category = "foreign_key_violation";
        setResponseHeader(res, "X-Xera-Error-Category", category);
        setResponseHeader(res, "X-Xera-Error-Code", sourceCode);
        return res
            .status(409)
            .send(
                "Profil utilisateur incomplet dans la base. Deconnectez-vous puis reconnectez-vous avant de reessayer.",
            );
    }

    if (isNotNullViolation(error)) {
        category = "not_null_violation";
        setResponseHeader(res, "X-Xera-Error-Category", category);
        setResponseHeader(res, "X-Xera-Error-Code", sourceCode);
        return res
            .status(409)
            .send(
                getReadableServerErrorMessage(
                    error,
                    "Certaines donnees du profil utilisateur sont manquantes pour lancer le paiement.",
                ),
            );
    }

    setResponseHeader(res, "X-Xera-Error-Category", category);
    setResponseHeader(res, "X-Xera-Error-Code", sourceCode);

    if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
        return res
            .status(500)
            .send(getReadableServerErrorMessage(error, fallbackMessage));
    }

    return res.status(500).send(fallbackMessage);
}

function extractPayoutSettings(row) {
    if (!row) return null;
    const provider = normalizeMobileMoneyProvider(row.provider) || "other";
    return {
        id: row.id || null,
        userId: row.user_id || null,
        channel: row.channel || "mobile_money",
        provider,
        providerLabel:
            MOBILE_MONEY_PROVIDER_LABELS[provider] ||
            MOBILE_MONEY_PROVIDER_LABELS.other,
        accountName: row.account_name || "",
        walletNumber: row.wallet_number || "",
        countryCode: row.country_code || "CD",
        status: row.status === "inactive" ? "inactive" : "active",
        notes: row.notes || "",
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };
}

function extractWithdrawalRequest(row) {
    if (!row) return null;
    const provider = normalizeMobileMoneyProvider(row.provider) || "other";
    return {
        id: row.id || null,
        creatorId: row.creator_id || null,
        payoutSettingId: row.payout_setting_id || null,
        amountUsd: roundMoney(row.amount_usd),
        requestedAmount: roundMoney(row.requested_amount),
        requestedCurrency: String(
            row.requested_currency || "USD",
        ).toUpperCase(),
        channel: row.channel || "mobile_money",
        provider,
        providerLabel:
            MOBILE_MONEY_PROVIDER_LABELS[provider] ||
            MOBILE_MONEY_PROVIDER_LABELS.other,
        walletNumber: row.wallet_number || "",
        accountName: row.account_name || "",
        note: row.note || "",
        status: row.status || "pending",
        operatorRefId: row.operator_ref_id || null,
        adminNote: row.admin_note || "",
        requestedAt: row.requested_at || row.created_at || null,
        processedAt: row.processed_at || null,
        paidAt: row.paid_at || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };
}

async function fetchCreatorPayoutSettings(userId) {
    const { data, error } = await supabase
        .from("creator_payout_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw error;
    return extractPayoutSettings(data);
}

async function fetchCreatorWithdrawalRequests(userId, options = {}) {
    let query = supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("creator_id", userId)
        .order("created_at", { ascending: false });

    if (options.statuses?.length) {
        query = query.in("status", options.statuses);
    }
    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(extractWithdrawalRequest);
}

async function buildCreatorWalletOverview(userId) {
    const [
        profileResult,
        transactionsResult,
        videoPayoutsResult,
        payoutSettingsResult,
        withdrawalsResult,
    ] = await Promise.all([
        supabase
            .from("users")
            .select(
                "id, name, avatar, badge, followers_count, plan, plan_status, plan_ends_at, is_monetized",
            )
            .eq("id", userId)
            .maybeSingle(),
        supabase
            .from("transactions")
            .select(
                "id, type, amount_gross, amount_net_creator, amount_commission_xera, currency, status, description, metadata, created_at",
            )
            .eq("to_user_id", userId)
            .in("type", ["support", "video_rpm"])
            .in("status", ["pending", "succeeded"])
            .order("created_at", { ascending: false }),
        supabase
            .from("video_payouts")
            .select(
                "id, period_month, views, rpm_rate, amount_gross, amount_net_creator, amount_commission_xera, status, paid_at, created_at",
            )
            .eq("creator_id", userId)
            .in("status", ["pending", "processing", "paid"])
            .order("period_month", { ascending: false }),
        fetchCreatorPayoutSettings(userId),
        fetchCreatorWithdrawalRequests(userId, { limit: 20 }),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (transactionsResult.error) throw transactionsResult.error;
    if (videoPayoutsResult.error) throw videoPayoutsResult.error;

    const profile = profileResult.data || null;
    const revenueTransactions = transactionsResult.data || [];
    const videoPayouts = videoPayoutsResult.data || [];
    const payoutSettings = payoutSettingsResult || null;
    const withdrawals = withdrawalsResult || [];

    let supportAvailable = 0;
    let supportPending = 0;
    let videoAvailable = 0;
    let videoPending = 0;

    revenueTransactions.forEach((tx) => {
        const net = resolveTransactionNetAmount(tx);
        if (tx.type === "support") {
            if (tx.status === "succeeded") supportAvailable += net;
            if (tx.status === "pending") supportPending += net;
        }
        if (tx.type === "video_rpm") {
            if (tx.status === "succeeded") videoAvailable += net;
            if (tx.status === "pending") videoPending += net;
        }
    });

    const hasVideoRevenueTransactions = revenueTransactions.some(
        (tx) => tx.type === "video_rpm",
    );
    if (!hasVideoRevenueTransactions) {
        videoAvailable = 0;
        videoPending = 0;
        videoPayouts.forEach((payout) => {
            const net = roundMoney(payout.amount_net_creator);
            if (payout.status === "paid") videoAvailable += net;
            if (["pending", "processing"].includes(payout.status)) {
                videoPending += net;
            }
        });
    }

    let pendingWithdrawals = 0;
    let paidWithdrawals = 0;
    withdrawals.forEach((withdrawal) => {
        if (["pending", "processing"].includes(withdrawal.status)) {
            pendingWithdrawals += roundMoney(withdrawal.amountUsd);
        }
        if (withdrawal.status === "paid") {
            paidWithdrawals += roundMoney(withdrawal.amountUsd);
        }
    });

    const creditedBalance = roundMoney(supportAvailable + videoAvailable);
    const pendingIncoming = roundMoney(supportPending + videoPending);
    const availableBalance = roundMoney(
        Math.max(0, creditedBalance - pendingWithdrawals - paidWithdrawals),
    );

    return {
        profile,
        payoutSettings,
        withdrawals,
        wallet: {
            currency: "USD",
            availableBalance,
            pendingIncoming,
            pendingWithdrawals: roundMoney(pendingWithdrawals),
            paidWithdrawals: roundMoney(paidWithdrawals),
            lifetimeNetRevenue: roundMoney(creditedBalance + paidWithdrawals),
            supportAvailable: roundMoney(supportAvailable),
            supportPending: roundMoney(supportPending),
            videoAvailable: roundMoney(videoAvailable),
            videoPending: roundMoney(videoPending),
            minimumWithdrawalUsd: WITHDRAWAL_MIN_USD,
            canRequestWithdrawal:
                availableBalance >= WITHDRAWAL_MIN_USD &&
                Boolean(
                    payoutSettings?.status === "active" &&
                    payoutSettings?.walletNumber &&
                    payoutSettings?.provider &&
                    payoutSettings?.accountName,
                ),
        },
    };
}

function shouldClearBadge(value) {
    if (!value) return false;
    const normalized = String(value).toLowerCase();
    return EXPIRES_BADGES.has(normalized);
}

async function sweepExpiredSubscriptions() {
    if (subscriptionSweepInFlight) return;
    subscriptionSweepInFlight = true;
    const nowIso = new Date().toISOString();

    try {
        const { data: expiredSubs, error: subsError } = await supabase
            .from("subscriptions")
            .select("id")
            .eq("status", "active")
            .lte("current_period_end", nowIso);

        if (subsError) throw subsError;

        const subscriptionIds = (expiredSubs || [])
            .map((row) => row.id)
            .filter(Boolean);
        if (subscriptionIds.length > 0) {
            await supabase
                .from("subscriptions")
                .update({
                    status: "canceled",
                    canceled_at: nowIso,
                    cancel_at_period_end: true,
                })
                .in("id", subscriptionIds);
        }

        const { data: expiredUsers, error: usersError } = await supabase
            .from("users")
            .select("id, badge")
            .eq("plan_status", "active")
            .lte("plan_ends_at", nowIso);

        if (usersError) throw usersError;

        const userIds = (expiredUsers || [])
            .map((row) => row.id)
            .filter(Boolean);
        // Révoquer toutes les fonctionnalités premium lors de l'expiration
        const expiredFeatures = {
            advanced_profile_customization: false,
            priority_recommendations: false,
            full_profile_customization: false,
            hd_streaming: false,
            private_live: false,
            advanced_collab_tools: false,
            realtime_analytics: false,
            data_export: false,
            maximum_visibility: false,
        };

        if (userIds.length > 0) {
            await supabase
                .from("users")
                .update({
                    plan: "free",
                    plan_status: "inactive",
                    is_monetized: false,
                    updated_at: nowIso,
                    ...expiredFeatures,
                })
                .in("id", userIds);

            const badgeIds = (expiredUsers || [])
                .filter((row) => shouldClearBadge(row.badge))
                .map((row) => row.id)
                .filter(Boolean);
            if (badgeIds.length > 0) {
                await supabase
                    .from("users")
                    .update({ badge: null, updated_at: nowIso })
                    .in("id", badgeIds);
            }
        }
    } catch (error) {
        const details = String(error?.details || "").toLowerCase();
        const message = String(error?.message || "").toLowerCase();
        const isNetworkTimeout =
            details.includes("connecttimeouterror") ||
            details.includes("und_err_connect_timeout") ||
            message.includes("fetch failed");

        if (isNetworkTimeout) {
            const now = Date.now();
            if (now - lastSweepNetworkErrorAt > 60 * 1000) {
                console.warn(
                    "Subscription expiry sweep warning: Supabase unreachable (network timeout). Vérifie internet/DNS/firewall ou mets SUBSCRIPTION_SWEEP_MS=0 en local.",
                );
                lastSweepNetworkErrorAt = now;
            }
        } else {
            console.error("Subscription expiry sweep error:", error);
        }
    } finally {
        subscriptionSweepInFlight = false;
    }
}

async function activateSubscription({
    userId,
    plan,
    billingCycle,
    currency,
    amount,
    transactionRefId,
    operatorRefId,
    method,
    provider,
    walletId,
    pendingTransactionId,
    confirmationSource = "maishapay_callback",
    confirmedBy,
    note,
}) {
    const paymentId = transactionRefId ? `maishapay_${transactionRefId}` : null;
    const normalizedPlan = String(plan || "").toLowerCase();
    const badgeForPlan =
        normalizedPlan === "pro" ? "verified_gold" : "verified";

    let pendingPayment = null;
    if (pendingTransactionId) {
        const { data, error } = await supabase
            .from("transactions")
            .select(
                "id, from_user_id, to_user_id, amount_gross, currency, status, metadata",
            )
            .eq("id", pendingTransactionId)
            .maybeSingle();
        if (error) throw error;
        if (!data) {
            throw new Error("Paiement en attente introuvable.");
        }
        if (String(data.status || "").toLowerCase() === "succeeded") {
            const { data: existingUser } = await supabase
                .from("users")
                .select("*")
                .eq("id", userId)
                .maybeSingle();
            return {
                alreadyActivated: true,
                user: existingUser || null,
                transactionId: data.id,
            };
        }
        if (String(data.status || "").toLowerCase() !== "pending") {
            throw new Error("Ce paiement ne peut plus être confirmé.");
        }
        pendingPayment = data;
    }

    if (transactionRefId) {
        const { data: existing } = await supabase
            .from("transactions")
            .select("id")
            .eq("metadata->>transaction_ref_id", String(transactionRefId))
            .eq("status", "succeeded")
            .maybeSingle();
        if (existing?.id && existing.id !== pendingTransactionId) {
            const { data: existingUser } = await supabase
                .from("users")
                .select("*")
                .eq("id", userId)
                .maybeSingle();
            return {
                alreadyActivated: true,
                user: existingUser || null,
                transactionId: existing.id,
            };
        }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const periodEnd =
        billingCycle === "annual" ? addMonths(now, 12) : addMonths(now, 1);
    const periodEndIso = periodEnd.toISOString();

    let badgeToApply = badgeForPlan;
    let followersCount = 0;
    try {
        const { data: profile } = await supabase
            .from("users")
            .select("badge, followers_count")
            .eq("id", userId)
            .maybeSingle();
        const existingBadge = String(profile?.badge || "").toLowerCase();
        followersCount = Number(profile?.followers_count || 0);
        const protectedBadges = new Set([
            "staff",
            "team",
            "community",
            "company",
            "enterprise",
            "ambassador",
        ]);
        if (protectedBadges.has(existingBadge)) {
            badgeToApply = profile?.badge || badgeForPlan;
        }
    } catch (e) {
        // Ignore profile read errors; continue with default badge
    }
    const isMonetized =
        ["medium", "pro"].includes(normalizedPlan) && followersCount >= 1000;

    const { error: cancelSubsError } = await supabase
        .from("subscriptions")
        .update({
            status: "canceled",
            canceled_at: nowIso,
            cancel_at_period_end: false,
        })
        .eq("user_id", userId)
        .eq("status", "active");
    if (cancelSubsError) throw cancelSubsError;

    const { data: insertedSubscription, error: insertSubError } = await supabase
        .from("subscriptions")
        .insert({
            user_id: userId,
            plan,
            status: "active",
            current_period_start: nowIso,
            current_period_end: periodEndIso,
        })
        .select("id")
        .single();
    if (insertSubError) throw insertSubError;

    // Calculer les fonctionnalités premium selon le plan
    const premiumFeatures = computePremiumFeatures(normalizedPlan);

    const { data: updatedUser, error: updateUserError } = await supabase
        .from("users")
        .update({
            plan,
            plan_status: "active",
            plan_ends_at: periodEndIso,
            badge: badgeToApply,
            is_monetized: isMonetized,
            ...premiumFeatures,
        })
        .eq("id", userId)
        .select("*")
        .single();
    if (updateUserError) throw updateUserError;

    const mergedMetadata = {
        ...(pendingPayment?.metadata &&
        typeof pendingPayment.metadata === "object"
            ? pendingPayment.metadata
            : {}),
        payment_provider: "maishapay",
        payment_ref: paymentId,
        transaction_ref_id: transactionRefId || null,
        method,
        provider,
        wallet_id: walletId,
        operator_ref_id: operatorRefId || null,
        activated_at: nowIso,
        activation_source: confirmationSource,
        subscription_id: insertedSubscription?.id || null,
    };
    if (confirmedBy) mergedMetadata.confirmed_by = confirmedBy;
    if (note) mergedMetadata.admin_note = note;

    let transactionId = pendingTransactionId || null;
    if (pendingTransactionId) {
        const { error: updateTxError } = await supabase
            .from("transactions")
            .update({
                amount_gross: amount,
                amount_net_creator: 0,
                amount_commission_xera: 0,
                currency,
                status: "succeeded",
                description: `Abonnement ${plan} (${billingCycle})`,
                metadata: mergedMetadata,
            })
            .eq("id", pendingTransactionId);
        if (updateTxError) throw updateTxError;
    } else {
        const { data: insertedTransaction, error: insertTxError } =
            await supabase
                .from("transactions")
                .insert({
                    from_user_id: userId,
                    to_user_id: userId,
                    type: "subscription",
                    amount_gross: amount,
                    amount_net_creator: 0,
                    amount_commission_xera: 0,
                    currency,
                    status: "succeeded",
                    description: `Abonnement ${plan} (${billingCycle})`,
                    metadata: mergedMetadata,
                })
                .select("id")
                .single();
        if (insertTxError) throw insertTxError;
        transactionId = insertedTransaction?.id || null;
    }

    return {
        alreadyActivated: false,
        user: updatedUser,
        subscriptionId: insertedSubscription?.id || null,
        transactionId,
    };
}

function supportsPush() {
    return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

function isPlanActiveForUser(user) {
    if (!user) return false;
    const status = String(user.plan_status || "").toLowerCase();
    if (status !== "active") return false;
    const planEnd = user.plan_ends_at || null;
    if (!planEnd) return true;
    const endMs = Date.parse(planEnd);
    if (!Number.isFinite(endMs)) return true;
    return endMs > Date.now();
}

function isGiftedProUser(user) {
    if (!user) return false;
    return (
        String(user.plan || "").toLowerCase() === "pro" &&
        String(user.plan_status || "").toLowerCase() === "active" &&
        !user.plan_ends_at
    );
}

function canUserReceiveSupport(user) {
    if (!user) return false;
    const plan = String(user.plan || "").toLowerCase();
    if (!["medium", "pro"].includes(plan)) return false;
    if (!isPlanActiveForUser(user)) return false;
    if (isGiftedProUser(user)) return true;
    return (
        user.is_monetized === true || Number(user.followers_count || 0) >= 1000
    );
}

function formatMoneyUsd(value) {
    const amount = roundMoney(value);
    return `$${amount.toFixed(2)}`;
}

async function createNotificationRecord({
    userId,
    type,
    message,
    link,
    actorId,
    metadata,
}) {
    if (!userId || !type || !message) return null;

    const payload = {
        user_id: userId,
        type,
        message,
        link: link || null,
        read: false,
    };

    if (actorId) payload.actor_id = actorId;
    if (metadata && typeof metadata === "object") payload.metadata = metadata;

    try {
        let query = supabase
            .from("notifications")
            .insert(payload)
            .select("*")
            .single();
        let { data, error } = await query;

        if (error && isMissingColumnError(error)) {
            const fallbackPayload = {
                user_id: userId,
                type,
                message,
                link: link || null,
                read: false,
            };
            ({ data, error } = await supabase
                .from("notifications")
                .insert(fallbackPayload)
                .select("*")
                .single());
        }

        if (error) throw error;
        return data || null;
    } catch (error) {
        console.warn(
            "Support notification insert error:",
            error?.message || error,
        );
        return null;
    }
}

async function purgeStalePushSubscription(endpoint) {
    if (!endpoint) return;
    try {
        await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", endpoint);
    } catch (error) {
        console.warn(
            "Failed to purge stale push subscription:",
            error?.message || error,
        );
    }
}

function buildNotificationPushPayload(notification) {
    const typeTitleMap = {
        support: "Nouveau soutien",
        follow: "Nouvel abonné",
        like: "Nouveau like",
        comment: "Nouveau commentaire",
        mention: "Mention",
        achievement: "Succès débloqué",
        stream: "Live en cours",
    };

    const title = typeTitleMap[notification?.type] || "Notification XERA";
    const icon = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`;
    const rawLink = String(notification?.link || "").trim();
    const link = rawLink
        ? rawLink.startsWith("http")
            ? rawLink
            : `${PRIMARY_ORIGIN.replace(/\/$/, "")}/${rawLink.replace(/^\//, "")}`
        : `${PRIMARY_ORIGIN.replace(/\/$/, "")}/profile.html?user=${notification?.user_id || ""}`;

    return {
        title,
        body: notification?.message || "",
        icon,
        link,
        tag: notification?.id || `support-${notification?.user_id || "xera"}`,
        renotify: false,
        silent: false,
    };
}

async function sendPushToUser(userId, payload) {
    if (!userId || !payload) return;

    try {
        // Compute unread count for badge synchronization
        let unreadCount = 0;
        try {
            const { count, error: countErr } = await supabase
                .from("notifications")
                .select("*", { head: true, count: "exact" })
                .eq("user_id", userId)
                .eq("read", false);
            if (!countErr) unreadCount = Number(count || 0);
        } catch (e) {
            // ignore counting errors
        }

        const payloadWithBadge = { ...(payload || {}), badge: unreadCount };

        // 1) Web Push (existing subscriptions)
        if (supportsPush()) {
            try {
                const { data: subs, error } = await supabase
                    .from("push_subscriptions")
                    .select("endpoint, keys")
                    .eq("user_id", userId);
                if (error) throw error;
                if (Array.isArray(subs)) {
                    const payloadString = JSON.stringify(payloadWithBadge);
                    for (const sub of subs) {
                        if (!sub?.endpoint || !sub?.keys) continue;
                        try {
                            await webpush.sendNotification(
                                {
                                    endpoint: sub.endpoint,
                                    keys: sub.keys,
                                },
                                payloadString,
                            );
                        } catch (err) {
                            if (
                                err?.statusCode === 404 ||
                                err?.statusCode === 410
                            ) {
                                await purgeStalePushSubscription(sub.endpoint);
                                continue;
                            }
                            console.warn(
                                "Support push error:",
                                err?.message || err,
                            );
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    "Support push lookup error:",
                    error?.message || error,
                );
            }
        }

        // 2) Native mobile tokens via Firebase Admin (FCM -> Android / APNs)
        if (firebaseAdminInitialized && firebaseAdmin) {
            try {
                const { data: tokensRows, error: tokensErr } = await supabase
                    .from("device_push_tokens")
                    .select("token, platform")
                    .eq("user_id", userId);
                if (
                    !tokensErr &&
                    Array.isArray(tokensRows) &&
                    tokensRows.length > 0
                ) {
                    const tokens = tokensRows
                        .map((r) => String(r.token || ""))
                        .filter(Boolean);
                    if (tokens.length > 0) {
                        const message = {
                            tokens,
                            notification: {
                                title: String(payloadWithBadge.title || "XERA"),
                                body: String(payloadWithBadge.body || ""),
                                image: String(payloadWithBadge.icon || ""),
                            },
                            data: {
                                link: String(payloadWithBadge.link || ""),
                                tag: String(payloadWithBadge.tag || ""),
                            },
                            android: {
                                priority: "high",
                                notification: {
                                    sound: "default",
                                },
                            },
                            apns: {
                                payload: {
                                    aps: {
                                        badge: unreadCount || 0,
                                        sound: "default",
                                    },
                                },
                            },
                        };

                        try {
                            await firebaseAdmin
                                .messaging()
                                .sendMulticast(message);
                        } catch (fcmErr) {
                            console.error(
                                "FCM send error:",
                                fcmErr?.message || fcmErr,
                            );
                        }
                    }
                }
            } catch (err) {
                console.warn(
                    "Device tokens lookup/send error:",
                    err?.message || err,
                );
            }
        }
    } catch (error) {
        console.warn("sendPushToUser error:", error?.message || error);
    }
}

async function failPendingTransaction({
    pendingTransactionId,
    transactionRefId,
    operatorRefId,
    reason,
    confirmationSource = "maishapay_callback",
}) {
    if (!pendingTransactionId) return null;

    const { data: existing, error: existingError } = await supabase
        .from("transactions")
        .select("id, status, metadata")
        .eq("id", pendingTransactionId)
        .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return null;

    const currentStatus = String(existing.status || "").toLowerCase();
    if (currentStatus !== "pending") {
        return existing;
    }

    const nowIso = new Date().toISOString();
    const metadata = {
        ...(existing.metadata && typeof existing.metadata === "object"
            ? existing.metadata
            : {}),
        transaction_ref_id:
            transactionRefId || existing.metadata?.transaction_ref_id || null,
        operator_ref_id:
            operatorRefId || existing.metadata?.operator_ref_id || null,
        failure_reason: reason || null,
        failed_at: nowIso,
        confirmation_source: confirmationSource,
    };

    const { data, error } = await supabase
        .from("transactions")
        .update({
            status: "failed",
            metadata,
            updated_at: nowIso,
        })
        .eq("id", pendingTransactionId)
        .select("id, status, metadata")
        .single();
    if (error) throw error;

    return data;
}

async function confirmSupportPayment({
    fromUserId,
    toUserId,
    amountUsd,
    checkoutCurrency,
    checkoutAmount,
    method,
    provider,
    walletId,
    description,
    pendingTransactionId,
    transactionRefId,
    operatorRefId,
    confirmationSource = "maishapay_callback",
}) {
    const paymentId = transactionRefId ? `maishapay_${transactionRefId}` : null;
    const breakdown = computeSupportRevenueBreakdown(amountUsd);

    let pendingPayment = null;
    if (pendingTransactionId) {
        const { data, error } = await supabase
            .from("transactions")
            .select(
                "id, from_user_id, to_user_id, type, amount_gross, currency, status, description, metadata",
            )
            .eq("id", pendingTransactionId)
            .maybeSingle();
        if (error) throw error;
        if (!data) {
            throw new Error("Paiement de soutien introuvable.");
        }
        if (String(data.type || "").toLowerCase() !== "support") {
            throw new Error("Transaction de soutien invalide.");
        }
        if (String(data.status || "").toLowerCase() === "succeeded") {
            return {
                alreadyConfirmed: true,
                transactionId: data.id,
            };
        }
        if (String(data.status || "").toLowerCase() !== "pending") {
            throw new Error("Ce soutien ne peut plus être confirmé.");
        }
        pendingPayment = data;
    }

    if (transactionRefId) {
        const { data: existing, error: existingError } = await supabase
            .from("transactions")
            .select("id")
            .eq("type", "support")
            .eq("metadata->>transaction_ref_id", String(transactionRefId))
            .eq("status", "succeeded")
            .maybeSingle();
        if (existingError) throw existingError;
        if (existing?.id && existing.id !== pendingTransactionId) {
            return {
                alreadyConfirmed: true,
                transactionId: existing.id,
            };
        }
    }

    const [senderResult, recipientResult] = await Promise.all([
        supabase
            .from("users")
            .select("id, name, avatar")
            .eq("id", fromUserId)
            .maybeSingle(),
        supabase
            .from("users")
            .select("id, name, avatar")
            .eq("id", toUserId)
            .maybeSingle(),
    ]);
    if (senderResult.error) throw senderResult.error;
    if (recipientResult.error) throw recipientResult.error;

    const senderProfile = senderResult.data || null;
    const recipientProfile = recipientResult.data || null;
    if (!recipientProfile) {
        throw new Error("Createur introuvable.");
    }

    const nowIso = new Date().toISOString();
    const mergedMetadata = {
        ...(pendingPayment?.metadata &&
        typeof pendingPayment.metadata === "object"
            ? pendingPayment.metadata
            : {}),
        payment_provider: "maishapay",
        payment_ref: paymentId,
        transaction_ref_id: transactionRefId || null,
        operator_ref_id: operatorRefId || null,
        method: String(
            method || pendingPayment?.metadata?.method || "card",
        ).toLowerCase(),
        provider: provider || pendingPayment?.metadata?.provider || null,
        wallet_id: walletId || pendingPayment?.metadata?.wallet_id || null,
        support_kind: "direct",
        sender_name:
            senderProfile?.name ||
            pendingPayment?.metadata?.sender_name ||
            "Utilisateur",
        recipient_name:
            recipientProfile?.name ||
            pendingPayment?.metadata?.recipient_name ||
            "Createur",
        support_amount_usd: breakdown.gross,
        checkout_amount:
            checkoutAmount ||
            pendingPayment?.metadata?.checkout_amount ||
            breakdown.gross,
        checkout_currency: String(
            checkoutCurrency ||
                pendingPayment?.metadata?.checkout_currency ||
                "USD",
        ).toUpperCase(),
        confirmed_at: nowIso,
        confirmation_source: confirmationSource,
        commission_rate: SUPPORT_COMMISSION_RATE,
        amount_net_creator: breakdown.netCreator,
        amount_commission_xera: breakdown.commission,
    };

    let transactionId = pendingTransactionId || null;
    if (pendingTransactionId) {
        const { error: updateError } = await supabase
            .from("transactions")
            .update({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                amount_gross: breakdown.gross,
                amount_net_creator: breakdown.netCreator,
                amount_commission_xera: breakdown.commission,
                currency: "USD",
                status: "succeeded",
                description:
                    description ||
                    pendingPayment?.description ||
                    "Soutien XERA",
                metadata: mergedMetadata,
            })
            .eq("id", pendingTransactionId);
        if (updateError) throw updateError;
    } else {
        const { data, error } = await supabase
            .from("transactions")
            .insert({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                type: "support",
                amount_gross: breakdown.gross,
                amount_net_creator: breakdown.netCreator,
                amount_commission_xera: breakdown.commission,
                currency: "USD",
                status: "succeeded",
                description: description || "Soutien XERA",
                metadata: mergedMetadata,
            })
            .select("id")
            .single();
        if (error) throw error;
        transactionId = data.id;
    }

    const senderName =
        senderProfile?.name || mergedMetadata.sender_name || "Un utilisateur";
    const notification = await createNotificationRecord({
        userId: toUserId,
        type: "support",
        message: `${senderName} vous a envoye ${formatMoneyUsd(breakdown.gross)} de soutien.`,
        link: `/creator-dashboard`,
        actorId: fromUserId,
        metadata: {
            transaction_id: transactionId,
            amount_gross: breakdown.gross,
            amount_net_creator: breakdown.netCreator,
            amount_commission_xera: breakdown.commission,
            currency: "USD",
            sender_id: fromUserId,
        },
    });

    if (notification) {
        await sendPushToUser(
            toUserId,
            buildNotificationPushPayload(notification),
        );
    }

    return {
        alreadyConfirmed: false,
        transactionId,
        notification,
        recipient: recipientProfile,
    };
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
    return (
        (message.includes("column") && message.includes("does not exist")) ||
        ((message.includes("column") || message.includes("could not find")) &&
            message.includes("schema cache"))
    );
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

function supportsEmailReminders() {
    return !getEmailDeliveryIssue();
}

function getEmailDeliveryIssue() {
    if (!REMINDER_EMAIL_ENABLED) {
        return "Envoi email desactive via RETURN_REMINDER_EMAIL_ENABLED.";
    }
    if (REMINDER_EMAIL_PROVIDER === "resend") {
        if (!REMINDER_EMAIL_API_KEY) {
            return "Cle API Resend manquante.";
        }
        const normalizedApiKey = REMINDER_EMAIL_API_KEY.toLowerCase();
        if (
            REMINDER_EMAIL_API_KEY === "re_123456789" ||
            normalizedApiKey.includes("<cle api>") ||
            normalizedApiKey.includes("<api key>") ||
            normalizedApiKey.includes("example") ||
            normalizedApiKey.includes("changeme")
        ) {
            return "Cle API Resend invalide ou de demonstration.";
        }
        if (!REMINDER_EMAIL_FROM) {
            return "Adresse d'expedition email manquante.";
        }
        return null;
    }
    if (REMINDER_EMAIL_PROVIDER === "webhook") {
        if (!REMINDER_EMAIL_WEBHOOK_URL) {
            return "URL webhook email manquante.";
        }
        return null;
    }
    return "Fournisseur email non configure.";
}

function buildProfileReminderUrl(userId) {
    return `${PRIMARY_ORIGIN.replace(/\/$/, "")}/profile.html?user=${encodeURIComponent(userId || "")}`;
}

function buildCreateReminderUrl(userId) {
    const profileUrl = buildProfileReminderUrl(userId);
    return `${profileUrl}&action=create`;
}

function buildDiscoverReminderUrl() {
    return `${PRIMARY_ORIGIN.replace(/\/$/, "")}/`;
}

function hashString(value) {
    const input = String(value || "");
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
        hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
    }
    return hash;
}

function pickDeterministicVariant(seed, variants = []) {
    if (!Array.isArray(variants) || variants.length === 0) return null;
    return variants[hashString(seed) % variants.length] || variants[0];
}

function getDaysSince(dateValue, now = new Date()) {
    const time = Date.parse(dateValue || "");
    if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
}

function isSentRecently(dateValue, minGapMs, now = new Date()) {
    const time = Date.parse(dateValue || "");
    if (!Number.isFinite(time)) return false;
    return now.getTime() - time < minGapMs;
}

function buildReminderEmailLayout({
    eyebrow,
    greeting,
    headline,
    bodyLines = [],
    ctaLabel,
    ctaUrl,
    footer,
}) {
    const safeLines = bodyLines
        .map((line) => String(line || "").trim())
        .filter(Boolean);
    const safeGreeting = String(greeting || "Bonjour,").trim() || "Bonjour,";
    const safeHeadline = String(headline || "").trim();
    const safeCtaLabel = String(ctaLabel || "Revenir sur XERA").trim();
    const safeCtaUrl = String(ctaUrl || buildDiscoverReminderUrl()).trim();
    const safeFooter =
        String(
            footer ||
                "Tu recois ce message parce que tu as active les rappels email sur XERA. Tu peux les couper quand tu veux dans les reglages.",
        ).trim() ||
        "Tu recois ce message parce que tu as active les rappels email sur XERA. Tu peux les couper quand tu veux dans les reglages.";

    const htmlParagraphs = safeLines
        .map(
            (line) =>
                `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#334155;">${escapeHtmlAttr(line)}</p>`,
        )
        .join("");
    const text = [
        safeGreeting,
        "",
        safeHeadline,
        "",
        ...safeLines,
        "",
        `${safeCtaLabel}: ${safeCtaUrl}`,
        "",
        safeFooter,
    ].join("\n");

    return {
        html: `
<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px;border:1px solid #e5e7eb;">
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">${escapeHtmlAttr(eyebrow || "XERA")}</div>
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#334155;">${escapeHtmlAttr(safeGreeting)}</p>
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#0f172a;">${escapeHtmlAttr(safeHeadline)}</h1>
      ${htmlParagraphs}
      <a href="${escapeHtmlAttr(safeCtaUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtmlAttr(safeCtaLabel)}</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b;">${escapeHtmlAttr(safeFooter)}</p>
    </div>
  </body>
</html>`.trim(),
        text,
    };
}

function buildDailyPostReminderCampaign(user, context, slot) {
    if (!slot || context.hasPostedToday) return null;
    if (!Array.isArray(context.activeArcs) || context.activeArcs.length === 0) {
        return null;
    }
    if (user.last_email_reminder_slot === slot.slotKey) return null;

    const arcTitle =
        String(context.activeArcs[0]?.title || "").trim() || "ton projet";
    const ctaUrl = buildCreateReminderUrl(user.id);
    const greeting = user.name ? `Bonjour ${user.name},` : "Bonjour,";
    const variants = [
        {
            subject: `XERA - ${arcTitle} t'attend toujours`,
            headline: "Si tu as 30 secondes, reviens nous montrer ou tu en es.",
            bodyLines: [
                `Ton projet "${arcTitle}" est toujours en cours.`,
                "Pas besoin d'un long texte: une petite update suffit pour garder le fil.",
            ],
            ctaLabel: "Revenir poster",
        },
        {
            subject: `XERA - On n'a pas oublie ${arcTitle}`,
            headline: "On n'a pas oublie ton projet.",
            bodyLines: [
                `Tu peux revenir sur "${arcTitle}" quand tu veux.`,
                "Une photo, deux lignes, un point rapide: tout compte.",
            ],
            ctaLabel: "Ouvrir mon update",
        },
        {
            subject: `XERA - Tu veux remettre ${arcTitle} en mouvement ?`,
            headline: "Tu peux remettre ton projet en mouvement aujourd'hui.",
            bodyLines: [
                `"${arcTitle}" merite sa petite mise a jour du jour.`,
                "Le plus dur, c'est souvent d'ouvrir l'app. On te facilite le retour.",
            ],
            ctaLabel: "Publier en un clic",
        },
        {
            subject: `XERA - Un petit signe de vie pour ${arcTitle} ?`,
            headline: "Un petit signe de vie suffit.",
            bodyLines: [
                `Si tu avances sur "${arcTitle}", viens nous montrer ca.`,
                "Meme une update courte garde ton elan visible.",
            ],
            ctaLabel: "Faire ma mise a jour",
        },
    ];
    const variant = pickDeterministicVariant(
        `daily:${user.id}:${slot.slotKey}`,
        variants,
    );
    const layout = buildReminderEmailLayout({
        eyebrow:
            slot.hour < 14 ? "Un petit rappel" : "Avant de finir la journee",
        greeting,
        headline: variant.headline,
        bodyLines: variant.bodyLines,
        ctaLabel: variant.ctaLabel,
        ctaUrl,
    });

    return {
        type: "daily_post",
        subject: variant.subject,
        html: layout.html,
        text: layout.text,
        slotKey: slot.slotKey,
        ctaUrl,
    };
}

function buildInactiveReengagementCampaign(user, context, now) {
    if (!Array.isArray(context.activeArcs) || context.activeArcs.length === 0) {
        return null;
    }
    const noRecentPost = !Number.isFinite(context.inactivityDays);
    if (
        (!noRecentPost && context.inactivityDays < 7) ||
        (noRecentPost && context.projectAgeDays < 7)
    ) {
        return null;
    }
    if (isSentRecently(user.last_inactive_reminder_sent_at, 7 * DAY_MS, now)) {
        return null;
    }

    const arcTitle =
        String(context.activeArcs[0]?.title || "").trim() || "ton projet";
    const ctaUrl = buildCreateReminderUrl(user.id);
    const greeting = user.name ? `Bonjour ${user.name},` : "Bonjour,";
    const variants = [
        {
            subject: `XERA - ${arcTitle} t'attend toujours`,
            headline: "On peut reprendre tranquillement.",
            bodyLines: [
                `"${arcTitle}" est toujours la.`,
                `Cela fait environ ${noRecentPost ? context.projectAgeDays : context.inactivityDays} jours depuis ta derniere update, mais tu peux reprendre sans pression.`,
            ],
            ctaLabel: "Revenir sur mon projet",
        },
        {
            subject: "XERA - Ca fait un moment. On reprend ensemble ?",
            headline: "Ton projet n'est pas perdu.",
            bodyLines: [
                `Si tu veux, on te ramene directement a "${arcTitle}".`,
                "Pas besoin de revenir avec quelque chose de parfait. Une petite mise a jour suffit.",
            ],
            ctaLabel: "Relancer mon projet",
        },
        {
            subject: `XERA - ${arcTitle} peut repartir aujourd'hui`,
            headline: "Ton elan peut revenir plus vite que tu ne le penses.",
            bodyLines: [
                `On n'a pas vu de nouvelle avancee recente sur "${arcTitle}".`,
                "Si tu veux reprendre le fil aujourd'hui, XERA t'attend au bon endroit.",
            ],
            ctaLabel: "Revenir sur XERA",
        },
        {
            subject: `XERA - Tu peux revenir la ou tu t'etais arrete`,
            headline: "Tu peux revenir la ou tu t'etais arrete.",
            bodyLines: [
                `Ton projet "${arcTitle}" est encore en cours.`,
                "On te remet directement dans l'app pour reprendre sans friction.",
            ],
            ctaLabel: "Continuer mon projet",
        },
    ];
    const variant = pickDeterministicVariant(
        `inactive:${user.id}:${context.dateKey}`,
        variants,
    );
    const layout = buildReminderEmailLayout({
        eyebrow: "On pense a ton projet",
        greeting,
        headline: variant.headline,
        bodyLines: variant.bodyLines,
        ctaLabel: variant.ctaLabel,
        ctaUrl,
    });

    return {
        type: "inactive_week",
        subject: variant.subject,
        html: layout.html,
        text: layout.text,
        ctaUrl,
    };
}

function buildSocialProgressCampaign(user, context, now) {
    const noRecentPost = !Number.isFinite(context.inactivityDays);
    if (
        (!noRecentPost && context.inactivityDays < 2) ||
        (noRecentPost && context.projectAgeDays < 2)
    ) {
        return null;
    }
    if (!context.socialSignal) return null;
    if (isSentRecently(user.last_social_progress_email_sent_at, DAY_MS, now)) {
        return null;
    }

    const authorName =
        String(context.socialSignal.authorName || "").trim() ||
        "Quelqu'un que tu suis";
    const activityTitle =
        String(context.socialSignal.title || "").trim() ||
        "une nouvelle avancee";
    const activityCount = Math.max(1, Number(context.socialSignal.count || 1));
    const ctaUrl = buildDiscoverReminderUrl();
    const greeting = user.name ? `Bonjour ${user.name},` : "Bonjour,";
    const variants = [
        {
            subject: `XERA - ${authorName} a publie quelque chose de nouveau`,
            headline: "Ca bouge encore du cote des comptes que tu suis.",
            bodyLines: [
                `${authorName} a partage ${activityTitle}.`,
                "Si tu veux reprendre le rythme, c'est peut-etre le bon moment pour revenir.",
            ],
            ctaLabel: "Voir ce qu'il y a de neuf",
        },
        {
            subject:
                "XERA - Pendant ton absence, quelques updates sont tombees",
            headline: "Tu as peut-etre manque deux ou trois choses.",
            bodyLines: [
                `${activityCount} update${activityCount > 1 ? "s" : ""} recente${activityCount > 1 ? "s" : ""} viennent d'apparaitre chez les comptes que tu suis.`,
                "Reviens jeter un oeil, puis publier la tienne si tu en as envie.",
            ],
            ctaLabel: "Retourner dans l'app",
        },
        {
            subject: "XERA - Les autres avancent, et ta place est toujours la",
            headline: "Les autres avancent, et ta place est toujours la.",
            bodyLines: [
                `${authorName} et d'autres continuent a documenter leur progression.`,
                "Reviens voir ce qui se passe et poster la tienne quand tu veux.",
            ],
            ctaLabel: "Revenir sur XERA",
        },
        {
            subject: "XERA - Il y a du nouveau dans ton reseau",
            headline: "Il y a du nouveau dans ton reseau.",
            bodyLines: [
                `${authorName} bouge, et tu n'es pas loin de reprendre toi aussi.`,
                "On te remet dans l'app en un clic.",
            ],
            ctaLabel: "Voir les nouvelles updates",
        },
    ];
    const variant = pickDeterministicVariant(
        `social:${user.id}:${context.dateKey}:${authorName}:${activityCount}`,
        variants,
    );
    const layout = buildReminderEmailLayout({
        eyebrow: "Pendant ce temps sur XERA",
        greeting,
        headline: variant.headline,
        bodyLines: variant.bodyLines,
        ctaLabel: variant.ctaLabel,
        ctaUrl,
    });

    return {
        type: "social_progress",
        subject: variant.subject,
        html: layout.html,
        text: layout.text,
        ctaUrl,
    };
}

async function buildEmailReminderContexts(users = [], now = new Date()) {
    const userIds = Array.from(
        new Set((users || []).map((user) => user?.id).filter(Boolean)),
    );
    if (userIds.length === 0) return new Map();

    const recentOwnActivityIso = new Date(
        now.getTime() - 8 * DAY_MS,
    ).toISOString();
    const recentSocialActivityIso = new Date(
        now.getTime() - 3 * DAY_MS,
    ).toISOString();

    const [arcsResult, ownContentResult, followRowsResult] = await Promise.all([
        supabase
            .from("arcs")
            .select("id, user_id, title, status, created_at")
            .in("user_id", userIds)
            .eq("status", "in_progress"),
        supabase
            .from("content")
            .select("id, user_id, title, created_at, arc_id")
            .in("user_id", userIds)
            .gte("created_at", recentOwnActivityIso)
            .order("created_at", { ascending: false }),
        supabase
            .from("followers")
            .select("follower_id, following_id")
            .in("follower_id", userIds),
    ]);

    if (arcsResult.error) throw arcsResult.error;
    if (ownContentResult.error) throw ownContentResult.error;
    if (followRowsResult.error) throw followRowsResult.error;

    const activeArcsByUser = new Map();
    (arcsResult.data || []).forEach((arc) => {
        if (!activeArcsByUser.has(arc.user_id)) {
            activeArcsByUser.set(arc.user_id, []);
        }
        activeArcsByUser.get(arc.user_id).push(arc);
    });

    const latestOwnContentByUser = new Map();
    (ownContentResult.data || []).forEach((row) => {
        if (!latestOwnContentByUser.has(row.user_id)) {
            latestOwnContentByUser.set(row.user_id, row);
        }
    });

    const followingsByUser = new Map();
    (followRowsResult.data || []).forEach((row) => {
        if (!followingsByUser.has(row.follower_id)) {
            followingsByUser.set(row.follower_id, []);
        }
        followingsByUser.get(row.follower_id).push(row.following_id);
    });

    const followedUserIds = Array.from(
        new Set(
            (followRowsResult.data || [])
                .map((row) => row.following_id)
                .filter(Boolean),
        ),
    );

    let recentSocialRows = [];
    let followedUsers = [];
    if (followedUserIds.length > 0) {
        const [socialContentResult, followedUsersResult] = await Promise.all([
            supabase
                .from("content")
                .select("id, user_id, title, created_at, arc_id")
                .in("user_id", followedUserIds)
                .gte("created_at", recentSocialActivityIso)
                .order("created_at", { ascending: false }),
            supabase.from("users").select("id, name").in("id", followedUserIds),
        ]);

        if (socialContentResult.error) throw socialContentResult.error;
        if (followedUsersResult.error) throw followedUsersResult.error;
        recentSocialRows = socialContentResult.data || [];
        followedUsers = followedUsersResult.data || [];
    }

    const followedUsersById = new Map(
        followedUsers.map((row) => [row.id, row]),
    );
    const recentSocialByAuthor = new Map();
    recentSocialRows.forEach((row) => {
        if (!recentSocialByAuthor.has(row.user_id)) {
            recentSocialByAuthor.set(row.user_id, []);
        }
        recentSocialByAuthor.get(row.user_id).push(row);
    });

    const contexts = new Map();
    users.forEach((user) => {
        const timeZone = sanitizeTimeZone(
            user.email_reminder_timezone || "UTC",
        );
        const slot = resolveReminderSlot(now, timeZone);
        const dateKey = getTimePartsInZone(now, timeZone).dateKey;
        const activeArcs = activeArcsByUser.get(user.id) || [];
        const lastOwnContent = latestOwnContentByUser.get(user.id) || null;
        const oldestActiveArc =
            activeArcs
                .slice()
                .sort(
                    (left, right) =>
                        Date.parse(left.created_at || 0) -
                        Date.parse(right.created_at || 0),
                )[0] || null;
        const lastOwnDateKey = lastOwnContent?.created_at
            ? getTimePartsInZone(new Date(lastOwnContent.created_at), timeZone)
                  .dateKey
            : "";
        const hasPostedToday = Boolean(
            lastOwnDateKey && lastOwnDateKey === dateKey,
        );
        const inactivityDays = getDaysSince(lastOwnContent?.created_at, now);
        const projectAgeDays = oldestActiveArc?.created_at
            ? getDaysSince(oldestActiveArc.created_at, now)
            : 0;

        const followedIds = Array.from(
            new Set((followingsByUser.get(user.id) || []).filter(Boolean)),
        );
        const socialCandidates = followedIds
            .flatMap((followedId) => {
                const rows = recentSocialByAuthor.get(followedId) || [];
                return rows.slice(0, 1).map((row) => ({
                    ...row,
                    authorName:
                        followedUsersById.get(followedId)?.name ||
                        "Un createur",
                }));
            })
            .sort(
                (left, right) =>
                    Date.parse(right.created_at || 0) -
                    Date.parse(left.created_at || 0),
            );

        contexts.set(user.id, {
            timeZone,
            slot,
            dateKey,
            activeArcs,
            lastOwnContent,
            hasPostedToday,
            inactivityDays,
            projectAgeDays,
            socialSignal:
                socialCandidates.length > 0
                    ? {
                          count: socialCandidates.length,
                          authorName: socialCandidates[0].authorName,
                          title:
                              socialCandidates[0].title ||
                              "une nouvelle avancee",
                          createdAt: socialCandidates[0].created_at || null,
                      }
                    : null,
        });
    });

    return contexts;
}

function selectReminderCampaign(user, context, now = new Date()) {
    if (!user || !context) return null;
    return (
        buildInactiveReengagementCampaign(user, context, now) ||
        buildSocialProgressCampaign(user, context, now) ||
        buildDailyPostReminderCampaign(user, context, context.slot)
    );
}

async function resolveReminderEmailAddress(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return "";

    try {
        const { data, error } =
            await supabase.auth.admin.getUserById(safeUserId);
        if (error) throw error;
        return String(data?.user?.email || "")
            .trim()
            .toLowerCase();
    } catch (error) {
        console.warn(
            "Unable to resolve reminder email address:",
            safeUserId,
            error?.message || error,
        );
        return "";
    }
}

async function sendReminderEmail(payload) {
    if (!supportsEmailReminders()) return { success: false, skipped: true };
    if (!payload?.to || !payload?.subject) {
        return { success: false, skipped: true };
    }

    try {
        let response = null;

        if (REMINDER_EMAIL_PROVIDER === "resend") {
            const body = {
                from: REMINDER_EMAIL_FROM,
                to: [payload.to],
                subject: payload.subject,
                html: payload.html || "",
                text: payload.text || "",
            };
            if (REMINDER_EMAIL_REPLY_TO) {
                body.reply_to = REMINDER_EMAIL_REPLY_TO;
            }

            response = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${REMINDER_EMAIL_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
        } else if (REMINDER_EMAIL_PROVIDER === "webhook") {
            const headers = {
                "Content-Type": "application/json",
            };
            if (REMINDER_EMAIL_WEBHOOK_TOKEN) {
                headers.Authorization = `Bearer ${REMINDER_EMAIL_WEBHOOK_TOKEN}`;
            }

            response = await fetch(REMINDER_EMAIL_WEBHOOK_URL, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    ...payload,
                    from: REMINDER_EMAIL_FROM || null,
                    replyTo: REMINDER_EMAIL_REPLY_TO || null,
                }),
            });
        } else {
            return { success: false, skipped: true };
        }

        if (!response?.ok) {
            const details = await response.text().catch(() => "");
            throw new Error(
                `Email provider error ${response?.status || "unknown"} ${details.slice(0, 280)}`.trim(),
            );
        }

        return { success: true };
    } catch (error) {
        console.warn("Reminder email send failed:", error?.message || error);
        return { success: false, error };
    }
}

async function sweepReturnReminderEmails(now = new Date()) {
    if (!supportsEmailReminders()) return { ok: true, skipped: true };

    const { data: users, error } = await supabase
        .from("users")
        .select(
            "id, name, email_reminder_enabled, email_reminder_timezone, last_email_reminder_slot, last_inactive_reminder_sent_at, last_social_progress_email_sent_at",
        )
        .eq("email_reminder_enabled", true);

    if (error) {
        if (isMissingColumnError(error)) {
            console.warn(
                "Email reminder columns missing in users. Run sql/email-reminders.sql to enable email reminders.",
            );
            return {
                ok: false,
                schemaMissing: true,
            };
        }
        throw error;
    }

    const contextsByUserId = await buildEmailReminderContexts(users || [], now);
    let sentCount = 0;
    for (const user of users || []) {
        if (!user?.id) continue;

        const context = contextsByUserId.get(user.id) || null;
        const campaign = selectReminderCampaign(user, context, now);
        if (!campaign) continue;
        const email = await resolveReminderEmailAddress(user.id);
        if (!email) continue;

        const payload = {
            to: email,
            subject: campaign.subject,
            html: campaign.html,
            text: campaign.text,
        };
        const result = await sendReminderEmail(payload);
        if (!result.success) continue;

        const updatePayload = {
            email_reminder_timezone: context?.timeZone || "UTC",
        };
        if (campaign.type === "daily_post" && campaign.slotKey) {
            updatePayload.last_email_reminder_slot = campaign.slotKey;
        }
        if (campaign.type === "inactive_week") {
            updatePayload.last_inactive_reminder_sent_at = now.toISOString();
        }
        if (campaign.type === "social_progress") {
            updatePayload.last_social_progress_email_sent_at =
                now.toISOString();
        }

        const { error: updateError } = await supabase
            .from("users")
            .update(updatePayload)
            .eq("id", user.id);

        if (updateError && !isMissingColumnError(updateError)) {
            console.warn(
                "Failed to persist email reminder slot:",
                updateError?.message || updateError,
            );
        }

        sentCount += 1;
    }

    return {
        ok: true,
        sentCount,
    };
}

async function sendScheduledReturnReminders() {
    if (reminderSweepInFlight) return;
    reminderSweepInFlight = true;

    try {
        await sweepReturnReminderEmails(new Date());
    } catch (error) {
        console.error("Return reminder sweep error:", error);
    } finally {
        reminderSweepInFlight = false;
    }
}

function startReminderScheduler() {
    if (!supportsEmailReminders()) return;

    setInterval(() => {
        sendScheduledReturnReminders().catch((error) => {
            console.error("Reminder scheduler tick error:", error);
        });
    }, REMINDER_SWEEP_MS);

    sendScheduledReturnReminders().catch((error) => {
        console.error("Initial reminder sweep error:", error);
    });
}

// ==================== MAISHAPAY CHECKOUT ====================

async function handleMaishaPaySubscriptionCheckout(req, res) {
    try {
        if (!MAISHAPAY_PUBLIC_KEY || !MAISHAPAY_SECRET_KEY) {
            return res.status(500).send("MaishaPay keys not configured");
        }

        const callbackConfig = getMaishaPayCallbackConfig(req);

        const {
            plan,
            billing_cycle: billingCycleRaw,
            currency: currencyRaw,
            method = "card",
            provider,
            wallet_id: walletId,
            access_token: accessToken,
            user_id: fallbackUserId,
            return_path: rawReturnPath,
        } = req.body || {};

        const planId = String(plan || "").toLowerCase();
        const billingCycle =
            String(billingCycleRaw || "monthly").toLowerCase() === "annual"
                ? "annual"
                : "monthly";
        const currency = String(currencyRaw || "USD").toUpperCase();
        const allowedCurrencies = new Set(["USD", "CDF"]);

        if (!MAISHAPAY_PLANS[planId]) {
            return res.status(400).send("Plan invalide");
        }
        if (!allowedCurrencies.has(currency)) {
            return res.status(400).send("Devise invalide");
        }

        const requestUser = await resolveRequestUser(
            accessToken,
            fallbackUserId,
        );
        const userId = requestUser.id;
        if (!userId) {
            return res.status(401).send("Utilisateur non authentifié");
        }
        await ensurePublicUserRecord(userId, {
            email: requestUser.email,
            username: requestUser.username,
            name: requestUser.name,
            avatarUrl: requestUser.avatarUrl,
            accountType: requestUser.accountType,
            accountSubtype: requestUser.accountSubtype,
            badge: requestUser.badge,
        });

        const returnPath = sanitizeReturnPath(
            rawReturnPath,
            buildProfileReturnPath(userId),
        );

        const amount = computeMaishaPayAmount(planId, billingCycle, currency);
        if (!amount) {
            return res.status(400).send("Montant invalide");
        }

        const pendingPayment = await createPendingSubscriptionPayment({
            userId,
            plan: planId,
            billingCycle,
            currency,
            amount,
            method,
            provider,
            walletId,
            returnPath,
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
        });

        let callbackUrl = null;
        if (callbackConfig.callbackEnabled) {
            const statePayload = {
                i: pendingPayment.id,
                e: Date.now() + 2 * 60 * 60 * 1000,
            };
            const state = createSignedState(statePayload);
            if (!state) {
                return res.status(500).send("Callback secret manquant");
            }
            callbackUrl = `${callbackConfig.callbackOrigin}/api/maishapay/callback/${encodeURIComponent(state)}`;
        }

        console.info("[MaishaPay checkout]", {
            gatewayMode: String(MAISHAPAY_GATEWAY_MODE),
            publicKey: maskKey(MAISHAPAY_PUBLIC_KEY),
            secretKey: maskKey(MAISHAPAY_SECRET_KEY),
            publicKeyMode: inferMaishaPayKeyMode(MAISHAPAY_PUBLIC_KEY),
            secretKeyMode: inferMaishaPayKeyMode(MAISHAPAY_SECRET_KEY),
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
            pendingTransactionId: pendingPayment.id,
            checkoutRefId: pendingPayment.checkoutRefId,
            plan: planId,
            billingCycle,
            currency,
            method: String(method || "card").toLowerCase(),
        });

        setResponseHeader(res, "Content-Type", "text/html");
        res.send(
            renderMaishaPayCheckoutPage({
                amount,
                currency,
                callbackUrl,
            }),
        );
    } catch (error) {
        console.error("MaishaPay checkout error:", error);
        return sendCheckoutErrorResponse(res, error, "Erreur MaishaPay");
    }
}

app.post(
    ["/api/maishapay/checkout", "/api/checkout-subscription"],
    handleMaishaPaySubscriptionCheckout,
);

async function handleMaishaPaySupportCheckout(req, res) {
    try {
        if (!MAISHAPAY_PUBLIC_KEY || !MAISHAPAY_SECRET_KEY) {
            return res.status(500).send("MaishaPay keys not configured");
        }

        const callbackConfig = getMaishaPayCallbackConfig(req);

        const {
            to_user_id: toUserId,
            amount_usd: rawAmountUsd,
            currency: currencyRaw,
            method = "card",
            provider,
            wallet_id: walletId,
            access_token: accessToken,
            user_id: fallbackUserId,
            description: rawDescription,
            return_path: rawReturnPath,
        } = req.body || {};

        const requestUser = await resolveRequestUser(
            accessToken,
            fallbackUserId,
        );
        const fromUserId = requestUser.id;
        if (!fromUserId) {
            return res.status(401).send("Utilisateur non authentifié");
        }
        await ensurePublicUserRecord(fromUserId, {
            email: requestUser.email,
            username: requestUser.username,
            name: requestUser.name,
            avatarUrl: requestUser.avatarUrl,
            accountType: requestUser.accountType,
            accountSubtype: requestUser.accountSubtype,
            badge: requestUser.badge,
        });

        if (!toUserId) {
            return res.status(400).send("Destinataire manquant");
        }
        if (fromUserId === toUserId) {
            return res.status(400).send("Auto-soutien interdit");
        }

        const amountUsd = roundMoney(rawAmountUsd);
        if (
            !Number.isFinite(amountUsd) ||
            amountUsd < SUPPORT_MIN_USD ||
            amountUsd > SUPPORT_MAX_USD
        ) {
            return res
                .status(400)
                .send(
                    `Le soutien doit etre entre ${SUPPORT_MIN_USD} et ${SUPPORT_MAX_USD} USD`,
                );
        }
        if (!Number.isInteger(amountUsd)) {
            return res
                .status(400)
                .send("Le soutien doit etre un montant entier en USD.");
        }

        const currency = String(currencyRaw || "USD").toUpperCase();
        if (!["USD", "CDF"].includes(currency)) {
            return res.status(400).send("Devise invalide");
        }

        const [senderResult, recipientResult] = await Promise.all([
            supabase
                .from("users")
                .select("id, name")
                .eq("id", fromUserId)
                .maybeSingle(),
            supabase
                .from("users")
                .select(
                    "id, name, followers_count, plan, plan_status, plan_ends_at, is_monetized",
                )
                .eq("id", toUserId)
                .maybeSingle(),
        ]);
        if (senderResult.error) throw senderResult.error;
        if (recipientResult.error) throw recipientResult.error;

        const senderProfile = senderResult.data || null;
        const recipientProfile = recipientResult.data || null;
        if (!senderProfile) {
            return res
                .status(400)
                .send(
                    "Profil expediteur introuvable. Rechargez votre session.",
                );
        }
        if (!recipientProfile) {
            return res.status(404).send("Createur introuvable");
        }
        if (!canUserReceiveSupport(recipientProfile)) {
            return res
                .status(400)
                .send("Ce createur n'est pas eligible aux soutiens.");
        }

        const checkoutAmount = computeSupportCheckoutAmount(
            amountUsd,
            currency,
        );
        if (!checkoutAmount) {
            return res.status(400).send("Montant invalide");
        }

        const description = sanitizePayoutText(rawDescription, 160);
        const returnPath = sanitizeReturnPath(
            rawReturnPath,
            buildProfileReturnPath(toUserId),
        );
        const pendingPayment = await createPendingSupportPayment({
            fromUserId,
            toUserId,
            amountUsd,
            checkoutAmount,
            checkoutCurrency: currency,
            method,
            provider,
            walletId,
            description:
                description ||
                `Soutien pour ${recipientProfile.name || "un createur"}`,
            senderName: senderProfile.name || "Utilisateur",
            recipientName: recipientProfile.name || "Createur",
            returnPath,
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
        });

        let callbackUrl = null;
        if (callbackConfig.callbackEnabled) {
            const statePayload = {
                i: pendingPayment.id,
                e: Date.now() + 2 * 60 * 60 * 1000,
            };
            const state = createSignedState(statePayload);
            if (!state) {
                return res.status(500).send("Callback secret manquant");
            }
            callbackUrl = `${callbackConfig.callbackOrigin}/api/maishapay/callback/${encodeURIComponent(state)}`;
        }

        console.info("[MaishaPay support checkout]", {
            gatewayMode: String(MAISHAPAY_GATEWAY_MODE),
            publicKey: maskKey(MAISHAPAY_PUBLIC_KEY),
            secretKey: maskKey(MAISHAPAY_SECRET_KEY),
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
            pendingTransactionId: pendingPayment.id,
            checkoutRefId: pendingPayment.checkoutRefId,
            fromUserId,
            toUserId,
            amountUsd,
            checkoutAmount,
            currency,
            method: String(method || "card").toLowerCase(),
        });

        setResponseHeader(res, "Content-Type", "text/html");
        res.send(
            renderMaishaPayCheckoutPage({
                amount: checkoutAmount,
                currency,
                callbackUrl,
            }),
        );
    } catch (error) {
        console.error("MaishaPay support checkout error:", error);
        return sendCheckoutErrorResponse(res, error, "Erreur MaishaPay");
    }
}

app.post(
    ["/api/maishapay/support-checkout", "/api/checkout-support"],
    handleMaishaPaySupportCheckout,
);

async function handleMaishaPayCallback(req, res) {
    try {
        const params = { ...req.query, ...req.body };
        const status = params.status ?? params.statusCode ?? "";
        const description = params.description || "";
        const transactionRefId =
            params.transactionRefId || params.transaction_ref_id;
        const operatorRefId = params.operatorRefId || params.operator_ref_id;
        const state = params.state || req.params?.state;

        const payload = verifySignedState(state);
        if (!payload) {
            return res.status(400).send("Callback invalide");
        }

        const pendingTransactionId = String(
            payload.i || payload.pending_transaction_id || "",
        ).trim();
        if (!pendingTransactionId) {
            return res.status(400).send("Transaction callback manquante");
        }

        const { data: callbackTransaction, error: callbackTransactionError } =
            await supabase
                .from("transactions")
                .select(
                    "id, from_user_id, to_user_id, type, amount_gross, currency, status, description, metadata",
                )
                .eq("id", pendingTransactionId)
                .maybeSingle();
        if (callbackTransactionError) throw callbackTransactionError;
        if (!callbackTransaction) {
            return res.status(404).send("Transaction callback introuvable");
        }

        const callbackMetadata =
            callbackTransaction.metadata &&
            typeof callbackTransaction.metadata === "object"
                ? callbackTransaction.metadata
                : {};
        const paymentKind = String(
            payload.k ||
                payload.payment_kind ||
                callbackTransaction.type ||
                "subscription",
        ).toLowerCase();
        const isSuccess =
            String(status) === "202" ||
            String(status).toLowerCase() === "success";

        if (isSuccess) {
            if (paymentKind === "support") {
                await confirmSupportPayment({
                    fromUserId: callbackTransaction.from_user_id,
                    toUserId: callbackTransaction.to_user_id,
                    amountUsd:
                        callbackMetadata.support_amount_usd ??
                        callbackTransaction.amount_gross,
                    checkoutCurrency:
                        callbackMetadata.checkout_currency ||
                        callbackTransaction.currency,
                    checkoutAmount:
                        callbackMetadata.checkout_amount ||
                        callbackTransaction.amount_gross,
                    method: callbackMetadata.method,
                    provider: callbackMetadata.provider,
                    walletId: callbackMetadata.wallet_id,
                    description: callbackTransaction.description,
                    pendingTransactionId: callbackTransaction.id,
                    transactionRefId,
                    operatorRefId,
                    confirmationSource: "maishapay_callback",
                });
            } else {
                await activateSubscription({
                    userId:
                        callbackTransaction.to_user_id ||
                        callbackTransaction.from_user_id,
                    plan: callbackMetadata.plan,
                    billingCycle: callbackMetadata.billing_cycle,
                    currency:
                        callbackTransaction.currency ||
                        callbackMetadata.currency,
                    amount: callbackTransaction.amount_gross,
                    transactionRefId,
                    operatorRefId,
                    method: callbackMetadata.method,
                    provider: callbackMetadata.provider,
                    walletId: callbackMetadata.wallet_id,
                    pendingTransactionId: callbackTransaction.id,
                    confirmationSource: "maishapay_callback",
                });
            }
        } else {
            await failPendingTransaction({
                pendingTransactionId: callbackTransaction.id,
                transactionRefId,
                operatorRefId,
                reason:
                    description || String(status || "Paiement non confirme"),
                confirmationSource: "maishapay_callback",
            });
        }

        const successTitle =
            paymentKind === "support"
                ? "Soutien confirmé"
                : "Paiement confirmé";
        const successDescription =
            paymentKind === "support"
                ? "Le soutien a bien ete confirme et sera visible dans le dashboard du createur."
                : "Votre abonnement est activé.";
        const failureDescription =
            paymentKind === "support"
                ? "Le soutien n'a pas ete confirme. Veuillez reessayer ou changer de moyen de paiement."
                : "Veuillez réessayer ou changer de moyen de paiement.";
        const returnPath =
            paymentKind === "support"
                ? callbackMetadata.callback_return_path || "/"
                : callbackMetadata.callback_return_path ||
                  buildProfileReturnPath(
                      callbackTransaction.to_user_id ||
                          callbackTransaction.from_user_id,
                  );
        const returnHref = String(returnPath || "").startsWith("http")
            ? String(returnPath)
            : `${PRIMARY_ORIGIN}/${String(returnPath || "/").replace(/^\//, "")}`;
        const returnLabel =
            paymentKind === "support"
                ? "Retour a la page precedente"
                : "Retour au profil";
        const autoRedirectDelayMs = isSuccess ? 1400 : 2200;

        setResponseHeader(res, "Content-Type", "text/html");
        res.send(`
      <!doctype html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Paiement ${isSuccess ? "réussi" : "échoué"}</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0b0b0b; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { max-width: 480px; padding: 32px; border-radius: 18px; background: #141414; border: 1px solid #2a2a2a; text-align: center; }
          .status { font-size: 22px; margin-bottom: 12px; }
          .desc { color: #9ca3af; margin-bottom: 20px; }
          a { color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 999px; border: 1px solid #2a2a2a; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="status">${isSuccess ? successTitle : "Paiement non confirmé"}</div>
          <div class="desc">${description || (isSuccess ? successDescription : failureDescription)}</div>
          <a href="${escapeHtmlAttr(returnHref)}">${returnLabel}</a>
        </div>
        <script>
          setTimeout(function () {
            window.location.replace(${JSON.stringify(returnHref)});
          }, ${autoRedirectDelayMs});
        </script>
      </body>
      </html>
    `);
    } catch (error) {
        console.error("MaishaPay callback error:", error);
        res.status(500).send("Erreur callback");
    }
}

app.all("/api/maishapay/callback/:state?", handleMaishaPayCallback);

// ==================== ADMIN: BROADCAST EMAIL ====================

app.post("/api/admin/broadcast-email", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const { subject, body, ctaLabel, ctaUrl } = req.body || {};
        if (!subject || !body) {
            return res
                .status(400)
                .json({ error: "Sujet ou contenu manquant." });
        }
        const emailDeliveryIssue = getEmailDeliveryIssue();
        if (emailDeliveryIssue) {
            return res.status(503).json({
                error: `Envoi email non configure. ${emailDeliveryIssue}`,
                provider: REMINDER_EMAIL_PROVIDER || null,
            });
        }

        const layout = buildReminderEmailLayout({
            eyebrow: "Annonce XERA",
            greeting: "Bonjour,",
            headline: subject,
            bodyLines: body.split("\n"),
            ctaLabel: ctaLabel || "Ouvrir XERA",
            ctaUrl: ctaUrl || buildDiscoverReminderUrl(),
        });

        let sentCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let attemptedCount = 0;
        let page = 1;
        const perPage = 100;
        let lastErrorMessage = "";

        while (true) {
            const { data, error } = await supabase.auth.admin.listUsers({
                page,
                perPage,
            });

            if (error) throw error;

            const users = data.users || [];
            if (users.length === 0) {
                break;
            }

            for (const user of users) {
                if (!user.email) {
                    skippedCount += 1;
                    continue;
                }
                attemptedCount += 1;

                const payload = {
                    to: user.email,
                    subject: `XERA - ${subject}`,
                    html: layout.html,
                    text: layout.text,
                };

                const result = await sendReminderEmail(payload);
                if (result.success) {
                    sentCount++;
                } else {
                    failedCount++;
                    if (!lastErrorMessage) {
                        lastErrorMessage = String(
                            result?.error?.message || result?.error || "",
                        ).trim();
                    }
                }
            }

            if (users.length < perPage) {
                break;
            }
            page += 1;
        }

        if (attemptedCount === 0) {
            return res.status(404).json({
                error: "Aucun utilisateur avec email n'a ete trouve.",
                attemptedCount,
                sentCount,
                failedCount,
                skippedCount,
            });
        }

        if (sentCount === 0 && failedCount > 0) {
            return res.status(502).json({
                error:
                    lastErrorMessage ||
                    "Aucun email n'a pu etre envoye par le fournisseur.",
                attemptedCount,
                sentCount,
                failedCount,
                skippedCount,
                provider: REMINDER_EMAIL_PROVIDER,
            });
        }

        return res.json({
            success: failedCount === 0,
            attemptedCount,
            sentCount,
            failedCount,
            skippedCount,
            provider: REMINDER_EMAIL_PROVIDER,
        });
    } catch (error) {
        console.error("Admin broadcast email error:", error);
        return res.status(500).json({ error: "Erreur serveur." });
    }
});

// ==================== ADMIN: OFFER PLAN ====================

app.post("/api/admin/gift-plan", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const { target_user_id: targetUserId, plan } = req.body || {};
        const normalizedPlan = String(plan || "").toLowerCase();
        if (!targetUserId) {
            return res
                .status(400)
                .json({ error: "Utilisateur cible manquant." });
        }
        if (!["standard", "medium", "pro"].includes(normalizedPlan)) {
            return res.status(400).json({ error: "Plan invalide." });
        }

        const { data: profile, error: profileError } = await supabase
            .from("users")
            .select("badge, followers_count")
            .eq("id", targetUserId)
            .maybeSingle();

        if (profileError) {
            return res.status(500).json({
                error:
                    profileError.message || "Impossible de charger le profil.",
            });
        }
        if (!profile) {
            return res.status(404).json({ error: "Utilisateur introuvable." });
        }

        const badgeForPlan =
            normalizedPlan === "pro" ? "verified_gold" : "verified";
        const existingBadge = String(profile.badge || "").toLowerCase();
        const badgeToApply = PROTECTED_BADGES.has(existingBadge)
            ? profile.badge
            : badgeForPlan;
        const followersCount = Number(profile.followers_count || 0);
        const isMonetized =
            normalizedPlan === "pro"
                ? true
                : normalizedPlan === "medium" && followersCount >= 1000;

        // Calculer les fonctionnalités premium selon le plan
        const premiumFeatures = computePremiumFeatures(normalizedPlan);

        const { data: updated, error: updateError } = await supabase
            .from("users")
            .update({
                plan: normalizedPlan,
                plan_status: "active",
                plan_ends_at: null,
                badge: badgeToApply,
                is_monetized: isMonetized,
                updated_at: new Date().toISOString(),
                ...premiumFeatures,
            })
            .eq("id", targetUserId)
            .select()
            .single();

        if (updateError) {
            return res.status(500).json({
                error: updateError.message || "Mise à jour impossible.",
            });
        }

        return res.json({ success: true, user: updated });
    } catch (error) {
        console.error("Admin gift plan error:", error);
        return res.status(500).json({ error: "Erreur serveur." });
    }
});

app.get("/api/admin/subscription-payments", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const requestedStatuses = String(req.query.status || "pending")
            .split(",")
            .map((value) =>
                String(value || "")
                    .trim()
                    .toLowerCase(),
            )
            .filter(Boolean);
        const allowedStatuses = new Set([
            "pending",
            "succeeded",
            "failed",
            "canceled",
            "refunded",
        ]);
        const statuses = requestedStatuses.filter((value) =>
            allowedStatuses.has(value),
        );
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit, 10) || 30),
        );

        let query = supabase
            .from("transactions")
            .select(
                "id, from_user_id, to_user_id, amount_gross, currency, status, description, metadata, created_at, updated_at",
            )
            .eq("type", "subscription")
            .eq("metadata->>payment_provider", "maishapay")
            .order("created_at", { ascending: false })
            .limit(limit);

        if (statuses.length === 1) {
            query = query.eq("status", statuses[0]);
        } else if (statuses.length > 1) {
            query = query.in("status", statuses);
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        const payments = rows || [];
        const userIds = Array.from(
            new Set(
                payments
                    .map((row) => row.to_user_id || row.from_user_id)
                    .filter(Boolean),
            ),
        );

        let usersById = new Map();
        if (userIds.length > 0) {
            const { data: userRows, error: userError } = await supabase
                .from("users")
                .select(
                    "id, name, avatar, badge, followers_count, plan, plan_status, plan_ends_at, is_monetized",
                )
                .in("id", userIds);
            if (userError) throw userError;
            usersById = new Map((userRows || []).map((row) => [row.id, row]));
        }

        return res.json({
            success: true,
            payments: payments.map((row) => {
                const details = extractSubscriptionPaymentDetails(row);
                return {
                    ...details,
                    user: usersById.get(details.userId) || null,
                };
            }),
        });
    } catch (error) {
        console.error("Admin subscription payments list error:", error);
        return res.status(500).json({ error: "Erreur serveur." });
    }
});

app.post("/api/admin/subscription-payments/confirm", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const {
            payment_id: paymentId,
            transaction_ref_id: transactionRefId,
            operator_ref_id: operatorRefId,
            note,
        } = req.body || {};
        if (!paymentId) {
            return res.status(400).json({ error: "Paiement manquant." });
        }

        const { data: paymentRow, error: paymentError } = await supabase
            .from("transactions")
            .select(
                "id, from_user_id, to_user_id, amount_gross, currency, status, metadata, created_at, updated_at",
            )
            .eq("id", paymentId)
            .eq("type", "subscription")
            .eq("metadata->>payment_provider", "maishapay")
            .maybeSingle();
        if (paymentError) throw paymentError;
        if (!paymentRow) {
            return res.status(404).json({ error: "Paiement introuvable." });
        }

        const payment = extractSubscriptionPaymentDetails(paymentRow);
        if (payment.status !== "pending") {
            return res.status(409).json({
                error: "Ce paiement n'est plus en attente de confirmation.",
            });
        }
        if (!payment.userId || !isValidPlanId(payment.plan)) {
            return res.status(400).json({
                error: "Les donnees du paiement en attente sont invalides.",
            });
        }
        if (!payment.amount || !payment.currency) {
            return res.status(400).json({
                error: "Montant ou devise introuvable pour ce paiement.",
            });
        }

        const activationResult = await activateSubscription({
            userId: payment.userId,
            plan: payment.plan,
            billingCycle: payment.billingCycle,
            currency: payment.currency,
            amount: payment.amount,
            transactionRefId: transactionRefId || payment.transactionRefId,
            operatorRefId: operatorRefId || payment.operatorRefId,
            method: payment.method,
            provider: payment.provider,
            walletId: payment.walletId,
            pendingTransactionId: payment.id,
            confirmationSource: "admin_manual",
            confirmedBy: authResult.user.id,
            note,
        });

        const { data: refreshedPayment, error: refreshedPaymentError } =
            await supabase
                .from("transactions")
                .select(
                    "id, from_user_id, to_user_id, amount_gross, currency, status, description, metadata, created_at, updated_at",
                )
                .eq("id", payment.id)
                .maybeSingle();
        if (refreshedPaymentError) throw refreshedPaymentError;

        return res.json({
            success: true,
            alreadyActivated: activationResult?.alreadyActivated === true,
            user: activationResult?.user || null,
            payment: refreshedPayment
                ? extractSubscriptionPaymentDetails(refreshedPayment)
                : null,
        });
    } catch (error) {
        console.error("Admin subscription payment confirm error:", error);
        return res.status(500).json({
            error:
                error?.message ||
                "Impossible de confirmer ce paiement d'abonnement.",
        });
    }
});

app.post("/api/admin/subscription-payments/fail", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const { payment_id: paymentId, reason } = req.body || {};
        if (!paymentId) {
            return res.status(400).json({ error: "Paiement manquant." });
        }

        const { data: paymentRow, error: paymentError } = await supabase
            .from("transactions")
            .select("id, status, metadata")
            .eq("id", paymentId)
            .eq("type", "subscription")
            .eq("metadata->>payment_provider", "maishapay")
            .maybeSingle();
        if (paymentError) throw paymentError;
        if (!paymentRow) {
            return res.status(404).json({ error: "Paiement introuvable." });
        }
        if (String(paymentRow.status || "").toLowerCase() !== "pending") {
            return res.status(409).json({
                error: "Seuls les paiements en attente peuvent etre refuses.",
            });
        }

        const updatedMetadata = {
            ...(paymentRow.metadata && typeof paymentRow.metadata === "object"
                ? paymentRow.metadata
                : {}),
            failed_at: new Date().toISOString(),
            failed_by: authResult.user.id,
        };
        if (reason) updatedMetadata.admin_note = String(reason);

        const { error: updateError } = await supabase
            .from("transactions")
            .update({
                status: "failed",
                metadata: updatedMetadata,
            })
            .eq("id", paymentId);
        if (updateError) throw updateError;

        return res.json({ success: true });
    } catch (error) {
        console.error("Admin subscription payment fail error:", error);
        return res.status(500).json({
            error:
                error?.message ||
                "Impossible de marquer ce paiement comme echoue.",
        });
    }
});

// ==================== FONCTIONS UTILITAIRES ====================

// ==================== API PUBLIQUES MONETIZATION ====================

// Récupérer les revenus d'un créateur
app.get("/api/creator-revenue/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const { period = "all" } = req.query;

        let startDate;
        const now = new Date();

        switch (period) {
            case "today":
                startDate = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                );
                break;
            case "7":
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case "30":
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = null;
        }

        let query = supabase
            .from("transactions")
            .select("*")
            .eq("to_user_id", userId)
            .eq("status", "succeeded");

        if (startDate) {
            query = query.gte("created_at", startDate.toISOString());
        }

        const { data: transactions, error } = await query;

        if (error) {
            console.error("Error fetching revenue:", error);
            return res.status(500).json({ error: "Failed to fetch revenue" });
        }

        // Calculer les totaux
        const summary = {
            totalGross: 0,
            totalNet: 0,
            totalCommission: 0,
            supportRevenue: 0,
            videoRevenue: 0,
            transactionCount: transactions ? transactions.length : 0,
        };

        if (transactions) {
            transactions.forEach((tx) => {
                const gross = parseFloat(tx.amount_gross || 0);
                const net = resolveTransactionNetAmount(tx);
                const commission = resolveTransactionCommissionAmount(tx);

                summary.totalGross += gross;
                summary.totalNet += net;
                summary.totalCommission += commission;

                if (tx.type === "support") {
                    summary.supportRevenue += net;
                } else if (tx.type === "video_rpm") {
                    summary.videoRevenue += net;
                }
            });
        }

        res.json({ success: true, data: summary });
    } catch (error) {
        console.error("Error fetching creator revenue:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/monetization/overview", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const overview = await buildCreatorWalletOverview(authResult.user.id);
        return res.json({
            success: true,
            profile: overview.profile,
            wallet: overview.wallet,
            payoutSettings: overview.payoutSettings,
            withdrawals: overview.withdrawals,
            supportedProviders: Object.entries(
                MOBILE_MONEY_PROVIDER_LABELS,
            ).map(([value, label]) => ({ value, label })),
        });
    } catch (error) {
        console.error("Monetization overview error:", error);
        if (isMissingRelationError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res
            .status(500)
            .json({ error: "Impossible de charger le portefeuille." });
    }
});

app.post("/api/monetization/support", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const fromUserId = authResult.user.id;
        const {
            to_user_id: toUserId,
            amount: rawAmount,
            description: rawDescription,
        } = req.body || {};

        if (!toUserId) {
            return res.status(400).json({ error: "Destinataire manquant." });
        }

        if (fromUserId === toUserId) {
            return res
                .status(400)
                .json({ error: "Vous ne pouvez pas vous envoyer un soutien." });
        }

        const amount = Number.parseFloat(rawAmount);
        if (!Number.isFinite(amount)) {
            return res.status(400).json({ error: "Montant invalide." });
        }
        if (amount < SUPPORT_MIN_USD || amount > SUPPORT_MAX_USD) {
            return res.status(400).json({
                error: `Le montant doit etre entre ${SUPPORT_MIN_USD} et ${SUPPORT_MAX_USD} USD.`,
            });
        }

        const [senderProfileResult, recipientProfileResult] = await Promise.all(
            [
                supabase
                    .from("users")
                    .select("id, name, avatar")
                    .eq("id", fromUserId)
                    .maybeSingle(),
                supabase
                    .from("users")
                    .select(
                        "id, name, avatar, followers_count, plan, plan_status, plan_ends_at, is_monetized",
                    )
                    .eq("id", toUserId)
                    .maybeSingle(),
            ],
        );

        if (senderProfileResult.error) throw senderProfileResult.error;
        if (recipientProfileResult.error) throw recipientProfileResult.error;

        const senderProfile = senderProfileResult.data || null;
        const recipientProfile = recipientProfileResult.data || null;

        if (!recipientProfile) {
            return res.status(404).json({ error: "Createur introuvable." });
        }

        if (!canUserReceiveSupport(recipientProfile)) {
            return res.status(400).json({
                error: "Ce createur n'est pas eligible aux soutiens.",
            });
        }

        const description = String(rawDescription || "")
            .trim()
            .slice(0, 160);
        const breakdown = computeSupportRevenueBreakdown(amount);
        const metadata = {
            payment_provider: "internal_support",
            support_kind: "direct",
            sender_name:
                senderProfile?.name || authResult.user.email || "Utilisateur",
            created_via: "support_api",
            commission_rate: SUPPORT_COMMISSION_RATE,
            amount_net_creator: breakdown.netCreator,
            amount_commission_xera: breakdown.commission,
        };

        const { data: transaction, error: txError } = await supabase
            .from("transactions")
            .insert({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                type: "support",
                amount_gross: breakdown.gross,
                amount_net_creator: breakdown.netCreator,
                amount_commission_xera: breakdown.commission,
                currency: "USD",
                status: "succeeded",
                description: description || "Soutien XERA",
                metadata,
            })
            .select(
                "id, from_user_id, to_user_id, type, amount_gross, amount_net_creator, amount_commission_xera, currency, status, description, created_at",
            )
            .single();

        if (txError) throw txError;

        const senderName =
            senderProfile?.name ||
            authResult.user.user_metadata?.username ||
            "Un utilisateur";
        const notification = await createNotificationRecord({
            userId: toUserId,
            type: "support",
            message: `${senderName} vous a envoye ${formatMoneyUsd(breakdown.gross)} de soutien.`,
            link: `/creator-dashboard`,
            actorId: fromUserId,
            metadata: {
                transaction_id: transaction?.id || null,
                amount_gross: breakdown.gross,
                amount_net_creator: breakdown.netCreator,
                amount_commission_xera: breakdown.commission,
                currency: "USD",
                sender_id: fromUserId,
            },
        });

        if (notification) {
            await sendPushToUser(
                toUserId,
                buildNotificationPushPayload(notification),
            );
        }

        return res.json({
            success: true,
            transaction,
            notification,
            recipient: {
                id: recipientProfile.id,
                name: recipientProfile.name || "Createur",
            },
        });
    } catch (error) {
        console.error("Monetization support error:", error);
        if (isMissingRelationError(error) || isMissingColumnError(error)) {
            return res.status(503).json({
                error: "Schema monétisation ou notifications incomplet. Exécutez sql/monetization-supabase-one-shot.sql puis sql/notifications-rls-fix.sql si nécessaire.",
            });
        }
        return res
            .status(500)
            .json({ error: "Impossible d'envoyer le soutien." });
    }
});

app.get("/api/monetization/withdrawals", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const withdrawals = await fetchCreatorWithdrawalRequests(
            authResult.user.id,
            {
                limit: Math.min(
                    100,
                    Math.max(1, parseInt(req.query.limit, 10) || 30),
                ),
            },
        );
        return res.json({ success: true, withdrawals });
    } catch (error) {
        console.error("Monetization withdrawals list error:", error);
        if (isMissingRelationError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res
            .status(500)
            .json({ error: "Impossible de charger les retraits." });
    }
});

app.post("/api/monetization/payout-settings", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const provider = normalizeMobileMoneyProvider(req.body?.provider);
        const walletNumber = sanitizeWalletNumber(req.body?.wallet_number);
        const accountName = sanitizePayoutText(req.body?.account_name, 80);
        const notes = sanitizePayoutText(req.body?.notes, 280);
        const countryCode = sanitizePayoutText(
            req.body?.country_code || "CD",
            8,
        ).toUpperCase();

        if (!provider) {
            return res.status(400).json({
                error: "Choisissez un fournisseur Mobile Money valide.",
            });
        }
        if (!walletNumber || walletNumber.length < 8) {
            return res.status(400).json({
                error: "Numero Mobile Money invalide.",
            });
        }
        if (!accountName) {
            return res.status(400).json({
                error: "Nom du titulaire requis.",
            });
        }

        const payload = {
            user_id: authResult.user.id,
            channel: "mobile_money",
            provider,
            account_name: accountName,
            wallet_number: walletNumber,
            country_code: countryCode || "CD",
            status: "active",
            notes,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from("creator_payout_settings")
            .upsert(payload, { onConflict: "user_id" })
            .select("*")
            .single();
        if (error) throw error;

        return res.json({
            success: true,
            payoutSettings: extractPayoutSettings(data),
        });
    } catch (error) {
        console.error("Monetization payout settings error:", error);
        if (isMissingRelationError(error) || isMissingColumnError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res.status(500).json({
            error: "Impossible d'enregistrer la methode de retrait.",
        });
    }
});

app.post("/api/monetization/withdrawals", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const requestedAmount = roundMoney(req.body?.amount);
        const note = sanitizePayoutText(req.body?.note, 280);

        if (!requestedAmount || requestedAmount < WITHDRAWAL_MIN_USD) {
            return res.status(400).json({
                error: `Le retrait minimum est de ${WITHDRAWAL_MIN_USD} USD.`,
            });
        }

        const overview = await buildCreatorWalletOverview(authResult.user.id);
        const payoutSettings = overview.payoutSettings;
        if (
            !payoutSettings?.provider ||
            !payoutSettings?.walletNumber ||
            !payoutSettings?.accountName
        ) {
            return res.status(400).json({
                error: "Enregistrez d'abord votre compte Mobile Money.",
            });
        }
        if (payoutSettings.status !== "active") {
            return res.status(400).json({
                error: "Votre compte Mobile Money est inactif. Reenregistrez-le avant le retrait.",
            });
        }
        if (requestedAmount > overview.wallet.availableBalance) {
            return res.status(400).json({
                error: "Solde disponible insuffisant pour ce retrait.",
            });
        }

        const { data, error } = await supabase
            .from("withdrawal_requests")
            .insert({
                creator_id: authResult.user.id,
                payout_setting_id: payoutSettings.id,
                amount_usd: requestedAmount,
                requested_amount: requestedAmount,
                requested_currency: "USD",
                channel: "mobile_money",
                provider: payoutSettings.provider,
                wallet_number: payoutSettings.walletNumber,
                account_name: payoutSettings.accountName,
                note,
                status: "pending",
                requested_at: new Date().toISOString(),
            })
            .select("*")
            .single();
        if (error) throw error;

        return res.json({
            success: true,
            withdrawal: extractWithdrawalRequest(data),
        });
    } catch (error) {
        console.error("Monetization withdrawal request error:", error);
        if (isMissingRelationError(error) || isMissingColumnError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res
            .status(500)
            .json({ error: "Impossible de creer la demande de retrait." });
    }
});

app.get("/api/admin/withdrawal-requests", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const requestedStatuses = String(
            req.query.status || "pending,processing",
        )
            .split(",")
            .map((value) =>
                String(value || "")
                    .trim()
                    .toLowerCase(),
            )
            .filter(Boolean);
        const allowedStatuses = new Set([
            "pending",
            "processing",
            "paid",
            "rejected",
            "canceled",
        ]);
        const statuses = requestedStatuses.filter((value) =>
            allowedStatuses.has(value),
        );
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit, 10) || 30),
        );

        let query = supabase
            .from("withdrawal_requests")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);
        if (statuses.length === 1) {
            query = query.eq("status", statuses[0]);
        } else if (statuses.length > 1) {
            query = query.in("status", statuses);
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        const requests = (rows || []).map(extractWithdrawalRequest);
        const userIds = Array.from(
            new Set(requests.map((item) => item.creatorId).filter(Boolean)),
        );

        let usersById = new Map();
        if (userIds.length > 0) {
            const { data: userRows, error: userError } = await supabase
                .from("users")
                .select(
                    "id, name, avatar, badge, followers_count, plan, plan_status, plan_ends_at, is_monetized",
                )
                .in("id", userIds);
            if (userError) throw userError;
            usersById = new Map((userRows || []).map((row) => [row.id, row]));
        }

        return res.json({
            success: true,
            requests: requests.map((request) => ({
                ...request,
                user: usersById.get(request.creatorId) || null,
            })),
        });
    } catch (error) {
        console.error("Admin withdrawal requests list error:", error);
        if (isMissingRelationError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res
            .status(500)
            .json({ error: "Impossible de charger les demandes de retrait." });
    }
});

app.post("/api/admin/withdrawal-requests/status", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const requestId = String(req.body?.request_id || "").trim();
        const status = String(req.body?.status || "")
            .trim()
            .toLowerCase();
        const operatorRefId = sanitizePayoutText(
            req.body?.operator_ref_id,
            120,
        );
        const adminNote = sanitizePayoutText(req.body?.note, 280);
        const allowedStatuses = new Set(["processing", "paid", "rejected"]);

        if (!requestId) {
            return res
                .status(400)
                .json({ error: "Demande de retrait manquante." });
        }
        if (!allowedStatuses.has(status)) {
            return res
                .status(400)
                .json({ error: "Statut de retrait invalide." });
        }

        const { data: existing, error: existingError } = await supabase
            .from("withdrawal_requests")
            .select("*")
            .eq("id", requestId)
            .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) {
            return res
                .status(404)
                .json({ error: "Demande de retrait introuvable." });
        }

        const currentStatus = String(existing.status || "").toLowerCase();
        if (currentStatus === "paid" || currentStatus === "rejected") {
            return res.status(409).json({
                error: "Cette demande a deja ete traitee definitivement.",
            });
        }

        const nowIso = new Date().toISOString();
        const updatePayload = {
            status,
            operator_ref_id: operatorRefId || existing.operator_ref_id || null,
            admin_note: adminNote || existing.admin_note || null,
            processed_at: nowIso,
            updated_at: nowIso,
        };
        if (status === "paid") {
            updatePayload.paid_at = nowIso;
        }

        const { data: updated, error: updateError } = await supabase
            .from("withdrawal_requests")
            .update(updatePayload)
            .eq("id", requestId)
            .select("*")
            .single();
        if (updateError) throw updateError;

        return res.json({
            success: true,
            request: extractWithdrawalRequest(updated),
        });
    } catch (error) {
        console.error("Admin withdrawal request update error:", error);
        if (isMissingRelationError(error) || isMissingColumnError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res.status(500).json({
            error: "Impossible de mettre a jour cette demande de retrait.",
        });
    }
});

// ==================== API EXISTANTES ====================

app.post("/api/reminders/email/preferences", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const targetUserId = String(
            req.body?.userId || authResult.user.id || "",
        ).trim();
        if (!targetUserId || targetUserId !== authResult.user.id) {
            return res
                .status(403)
                .json({ error: "Utilisateur cible invalide." });
        }

        const metadata =
            authResult.user.user_metadata &&
            typeof authResult.user.user_metadata === "object"
                ? authResult.user.user_metadata
                : {};
        const enabled = req.body?.enabled !== false;
        const safeTimezone = sanitizeTimeZone(req.body?.timezone || "UTC");
        const nowIso = new Date().toISOString();

        await ensurePublicUserRecord(targetUserId, {
            email: authResult.user.email,
            username: metadata.username || null,
            name: metadata.name || metadata.full_name || null,
            avatarUrl: metadata.avatar_url || metadata.avatar || null,
            accountType: metadata.account_type || null,
            accountSubtype: metadata.account_subtype || null,
            badge: metadata.badge || null,
        });

        const updatePayload = {
            email_reminder_enabled: enabled,
            email_reminder_timezone: safeTimezone,
            updated_at: nowIso,
        };
        if (enabled) {
            updatePayload.email_reminder_opted_in_at = nowIso;
        }

        const { error } = await supabase
            .from("users")
            .update(updatePayload)
            .eq("id", targetUserId);

        if (error) {
            if (isMissingColumnError(error)) {
                return res.status(503).json({
                    error: "Colonnes de rappel email manquantes. Executez sql/email-reminders.sql.",
                });
            }
            throw error;
        }

        return res.json({
            ok: true,
            enabled,
            timezone: safeTimezone,
            email: authResult.user.email || null,
            deliveryReady: supportsEmailReminders(),
            provider: supportsEmailReminders() ? REMINDER_EMAIL_PROVIDER : null,
            deliveryIssue: getEmailDeliveryIssue(),
        });
    } catch (error) {
        console.error("Email reminder preference error:", error);
        return res.status(500).json({
            error:
                error?.message ||
                "Impossible d'enregistrer la preference email.",
        });
    }
});

app.get("/api/cron/send-reminder-emails", async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    const result = await sweepReturnReminderEmails(new Date());

    return res.status(200).json({
        message: "Reminder email sweep completed.",
        result,
    });
});

app.get("/api/cron/sweep-subscriptions", async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    await sweepExpiredSubscriptions();

    return res.status(200).json({
        message: "Subscription sweep initiated successfully.",
    });
});

// Cron: evaluate & apply 'tech' badge based on 7-day continuous posting streak
app.get("/api/cron/evaluate-tech-badges", async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    try {
        const result = await evaluateTechBadges();
        return res.status(200).json({
            message: "Tech badge evaluation completed.",
            result,
        });
    } catch (error) {
        console.error("evaluate-tech-badges error:", error);
        return res.status(500).json({ error: error?.message || "failed" });
    }
});

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        reminderHours: REMINDER_HOURS,
        reminderWindowMinutes: REMINDER_WINDOW_MIN,
        emailReminders: supportsEmailReminders()
            ? REMINDER_EMAIL_PROVIDER
            : "disabled",
        emailReminderFrom: REMINDER_EMAIL_FROM || null,
        emailRemindersIssue: getEmailDeliveryIssue(),
        subscriptionSweepMs: SUBSCRIPTION_SWEEP_MS,
    });
});

function handlePublicConfig(req, res) {
    const callbackConfig = getMaishaPayCallbackConfig(req);
    res.json({
        usdToCdfRate: USD_TO_CDF_RATE_VALUE,
        maishaPay: {
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackEnabled
                ? callbackConfig.callbackOrigin
                : null,
            gatewayMode: String(MAISHAPAY_GATEWAY_MODE),
        },
    });
}

app.get("/api/config", handlePublicConfig);

// Enregistrer / mettre à jour un abonnement Web Push (navigateur)
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

        // Compatibilité: si la migration reminder n'est pas encore appliquée, retomber sur le schéma minimal.
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

// Enregistrer un token de device mobile (FCM / APNs)
app.post("/api/push/register-device", async (req, res) => {
    try {
        const { userId, token, platform = "other" } = req.body;
        if (!userId || !token) {
            return res.status(400).json({ error: "Missing userId or token" });
        }
        const safePlatform = ["android", "ios"].includes(
            String(platform || "").toLowerCase(),
        )
            ? String(platform).toLowerCase()
            : "other";

        const { error } = await supabase.from("device_push_tokens").upsert(
            {
                token: String(token),
                user_id: userId,
                platform: safePlatform,
            },
            { onConflict: "token" },
        );

        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        console.error("register device token error", err);
        res.status(400).json({ error: err.message || "failed" });
    }
});

// Obtenir le compteur de badge (notifications non lues) pour l'utilisateur authentifié
app.get("/api/notifications/badge", async (req, res) => {
    try {
        const authHeader =
            req.headers.authorization || req.headers.Authorization || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : "";
        if (!token)
            return res
                .status(401)
                .json({ error: "Missing authorization token" });

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);
        if (authError || !authData?.user?.id) {
            return res.status(401).json({ error: "Invalid session token" });
        }
        const userId = authData.user.id;

        const { count, error } = await supabase
            .from("notifications")
            .select("*", { head: true, count: "exact" })
            .eq("user_id", userId)
            .eq("read", false);

        if (error) throw error;
        return res.json({ unreadCount: Number(count || 0) });
    } catch (err) {
        console.error("badge count error", err);
        return res.status(500).json({ error: err.message || "failed" });
    }
});

// Remise à zéro du badge / marquer toutes les notifications comme lues pour l'utilisateur authentifié
app.post("/api/notifications/badge-reset", async (req, res) => {
    try {
        const authHeader =
            req.headers.authorization || req.headers.Authorization || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : "";
        if (!token)
            return res
                .status(401)
                .json({ error: "Missing authorization token" });

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);
        if (authError || !authData?.user?.id) {
            return res.status(401).json({ error: "Invalid session token" });
        }
        const userId = authData.user.id;

        const { error } = await supabase
            .from("notifications")
            .update({ read: true })
            .eq("user_id", userId)
            .eq("read", false);

        if (error) throw error;
        return res.json({ ok: true });
    } catch (err) {
        console.error("badge reset error", err);
        return res.status(500).json({ error: err.message || "failed" });
    }
});

// ... (le reste du code existant pour les rappels, etc.)

async function evaluateTechBadges(options = {}) {
    const safeTZ = sanitizeTimeZone(process.env.BADGE_TIMEZONE || "UTC");
    const lookbackDays = Number.isFinite(
        Number(process.env.BADGE_LOOKBACK_DAYS),
    )
        ? Math.max(7, parseInt(process.env.BADGE_LOOKBACK_DAYS, 10))
        : 14;
    const now = options.now || new Date();
    const nowIso = now.toISOString();
    const startDate = new Date(now.getTime() - lookbackDays * DAY_MS);
    const startIso = startDate.toISOString();

    // Fetch recent content for the lookback window
    const { data: rows, error: rowsError } = await supabase
        .from("content")
        .select("user_id, created_at")
        .gte("created_at", startIso);

    if (rowsError) {
        throw rowsError;
    }

    // Build per-user date sets and last post timestamp
    const map = new Map();
    (rows || []).forEach((r) => {
        const uid = String(r.user_id || "").trim();
        if (!uid) return;
        const createdAt = r.created_at;
        if (!createdAt) return;

        const parts = getTimePartsInZone(new Date(createdAt), safeTZ);
        const dateKey = parts.dateKey;

        let entry = map.get(uid);
        if (!entry) {
            entry = { dateSet: new Set(), lastCreatedAt: createdAt };
            map.set(uid, entry);
        }
        entry.dateSet.add(dateKey);
        if (
            !entry.lastCreatedAt ||
            new Date(createdAt) > new Date(entry.lastCreatedAt)
        ) {
            entry.lastCreatedAt = createdAt;
        }
    });

    const awarded = [];
    // Award badge when user has a 7-day streak (including today)
    for (const [uid, entry] of map.entries()) {
        let streak = 0;
        for (let i = 0; i < 7; i++) {
            const d = new Date(now.getTime() - i * DAY_MS);
            const key = getTimePartsInZone(d, safeTZ).dateKey;
            if (entry.dateSet.has(key)) streak++;
            else break;
        }

        if (streak >= 7) {
            try {
                const { data: profile, error: pErr } = await supabase
                    .from("users")
                    .select("id, badge")
                    .eq("id", uid)
                    .maybeSingle();
                if (pErr) {
                    console.warn(
                        "evaluateTechBadges: failed to read user",
                        uid,
                        pErr,
                    );
                    continue;
                }
                const currentBadge = String(profile?.badge || "").toLowerCase();
                if (currentBadge !== "tech") {
                    const { error: upErr } = await supabase
                        .from("users")
                        .update({ badge: "tech", updated_at: nowIso })
                        .eq("id", uid);
                    if (upErr) {
                        console.warn(
                            "evaluateTechBadges: failed to award badge to",
                            uid,
                            upErr.message || upErr,
                        );
                    } else {
                        awarded.push(uid);
                    }
                }
            } catch (e) {
                console.warn(
                    "evaluateTechBadges: exception awarding badge",
                    uid,
                    e,
                );
            }
        }
    }

    // Revoke badge when the user's last post was >= 3 days ago
    const { data: techUsers, error: techUsersErr } = await supabase
        .from("users")
        .select("id")
        .eq("badge", "tech");
    if (techUsersErr) {
        throw techUsersErr;
    }

    const revoked = [];
    for (const u of techUsers || []) {
        const uid = u.id;
        let lastCreatedAt = map.get(uid)?.lastCreatedAt || null;
        if (!lastCreatedAt) {
            // Fetch last post if not in the recent window
            try {
                const { data: lastRow, error: lastErr } = await supabase
                    .from("content")
                    .select("created_at")
                    .eq("user_id", uid)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (!lastErr && lastRow)
                    lastCreatedAt = lastRow.created_at || null;
            } catch (e) {
                console.warn(
                    "evaluateTechBadges: failed to fetch last post for",
                    uid,
                    e,
                );
            }
        }

        const daysSinceLast = lastCreatedAt
            ? getDaysSince(lastCreatedAt, now)
            : Infinity;
        if (daysSinceLast >= 3) {
            try {
                const { error: upErr } = await supabase
                    .from("users")
                    .update({ badge: null, updated_at: nowIso })
                    .eq("id", uid);
                if (upErr) {
                    console.warn(
                        "evaluateTechBadges: failed to revoke badge for",
                        uid,
                        upErr.message || upErr,
                    );
                } else {
                    revoked.push(uid);
                }
            } catch (e) {
                console.warn(
                    "evaluateTechBadges: exception revoking badge",
                    uid,
                    e,
                );
            }
        }
    }

    return {
        evaluatedAt: nowIso,
        timezone: safeTZ,
        lookbackDays,
        awarded,
        revoked,
    };
}

const isDirectRun = require.main === module;

/* ========================================
   ADMIN - BOTS CONTROL ENDPOINTS
   ======================================== */

app.get("/api/admin/bots/status", async (req, res) => {
    const authResult = await authenticateSuperAdmin(req);
    if (authResult.error) {
        return res
            .status(authResult.error.status)
            .send(authResult.error.message);
    }
    try {
        const { count: totalBots, error: countErr } = await supabase
            .from("bots")
            .select("id", { count: "exact", head: true });
        if (countErr) console.warn("bots count error", countErr);

        const { data: control } = await supabase
            .from("bot_control")
            .select("value")
            .eq("key", "bots.active_count")
            .maybeSingle();

        const activeCount =
            (control && control.value && control.value.count) || 0;

        // Read global auto-force-posts flag if present
        let forcePostsEnabled = false;
        try {
            const { data: fControl } = await supabase
                .from("bot_control")
                .select("value")
                .eq("key", "bots.force_posts")
                .maybeSingle();
            if (fControl && fControl.value !== undefined) {
                const v = fControl.value;
                if (typeof v === "object") {
                    forcePostsEnabled =
                        v.enabled === true || String(v.enabled) === "true";
                } else {
                    forcePostsEnabled =
                        v === true || String(v) === "true" || String(v) === "1";
                }
            }
        } catch (e) {
            // ignore
        }

        const { data: sampleData, error: sampleErr } = await supabase
            .from("bots")
            .select(
                "user_id, display_name, avatar_url, active, schedule_hour, encourage_days",
            )
            .limit(20);
        if (sampleErr) console.warn("bots sample error", sampleErr);

        return res.json({
            totalBots: Number(totalBots) || 0,
            activeCount: Number(activeCount) || 0,
            sample: sampleData || [],
            forcePosts: !!forcePostsEnabled,
        });
    } catch (e) {
        console.error("/api/admin/bots/status error", e?.message || e);
        return res.status(500).send("Erreur interne");
    }
});

app.post("/api/admin/bots/set-active-count", async (req, res) => {
    const authResult = await authenticateSuperAdmin(req);
    if (authResult.error) {
        return res
            .status(authResult.error.status)
            .send(authResult.error.message);
    }

    const rawCount =
        req.body && req.body.count !== undefined
            ? req.body.count
            : req.query.count;
    const parsed = Number(rawCount);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).send("Paramètre count invalide");
    }
    const count = Math.max(0, Math.min(400, parseInt(parsed, 10)));

    try {
        // Upsert control
        const { error: upErr } = await supabase.from("bot_control").upsert(
            {
                key: "bots.active_count",
                value: { count },
                updated_at: new Date().toISOString(),
            },
            { onConflict: "key" },
        );
        if (upErr) throw upErr;

        // Apply activation flags (simple strategy: reset all then enable first N by last_action_at)
        if (count <= 0) {
            await supabase.from("bots").update({ active: false });
        } else {
            const { data: selected } = await supabase
                .from("bots")
                .select("user_id")
                .order("last_action_at", { ascending: true })
                .limit(count);
            const ids = (selected || []).map((r) => r.user_id).filter(Boolean);

            // Deactivate all
            await supabase.from("bots").update({ active: false });

            if (ids.length) {
                await supabase
                    .from("bots")
                    .update({ active: true })
                    .in("user_id", ids);
            }
        }

        return res.json({ success: true, activeCount: count });
    } catch (e) {
        console.error(
            "/api/admin/bots/set-active-count error",
            e?.message || e,
        );
        return res.status(500).send("Erreur interne");
    }
});

// Toggle single bot active state
app.post("/api/admin/bots/toggle-active", async (req, res) => {
    const authResult = await authenticateSuperAdmin(req);
    if (authResult.error) {
        return res
            .status(authResult.error.status)
            .send(authResult.error.message);
    }

    const { user_id: userId, active } = req.body || {};
    if (!userId) return res.status(400).send("user_id missing");
    const isActive = !!active;
    try {
        const { error } = await supabase
            .from("bots")
            .update({
                active: isActive,
                last_action_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        if (error) throw error;
        return res.json({ success: true, user_id: userId, active: isActive });
    } catch (e) {
        console.error("/api/admin/bots/toggle-active error", e?.message || e);
        return res.status(500).send("Erreur interne");
    }
});

// Set global auto-force-posts flag for bots (stored in bot_control)
app.post("/api/admin/bots/set-force-posts", async (req, res) => {
    const authResult = await authenticateSuperAdmin(req);
    if (authResult.error) {
        return res
            .status(authResult.error.status)
            .send(authResult.error.message);
    }

    const raw =
        req.body && req.body.enabled !== undefined
            ? req.body.enabled
            : req.query.enabled;
    const enabled = raw === true || raw === "true" || raw === "1" || raw === 1;

    try {
        const { error: upErr } = await supabase.from("bot_control").upsert(
            {
                key: "bots.force_posts",
                value: { enabled: !!enabled },
                updated_at: new Date().toISOString(),
            },
            { onConflict: "key" },
        );
        if (upErr) throw upErr;
        return res.json({ success: true, enabled: !!enabled });
    } catch (e) {
        console.error("/api/admin/bots/set-force-posts error", e?.message || e);
        return res.status(500).send("Erreur interne");
    }
});

// Run-once runner for bots - intended for serverless environments (Vercel cron)
app.post("/api/admin/bots/run-now", async (req, res) => {
    // Authorize cron invocation (uses CRON_SECRET or Bearer token / x-cron-secret)
    const cronAuth = authorizeCronRequest(req);
    // Allow either a valid cron secret OR an authenticated super-admin session
    let authorized = cronAuth.ok === true;
    if (!authorized) {
        const adminAuth = await authenticateSuperAdmin(req);
        if (!adminAuth.error) authorized = true;
    }
    if (!authorized) {
        return res.status(401).send("Unauthorized cron request.");
    }

    const force = req.body?.force === true;
    const limit = Number(
        req.body?.limit ??
            req.query?.limit ??
            process.env.BOT_RUN_ONCE_BATCH ??
            20,
    );
    // Par défaut suivre 3 utilisateurs par bot et par jour
    const FOLLOW_DAILY_LIMIT = Number(process.env.BOT_FOLLOW_DAILY_LIMIT) || 3;
    const MAX_POSTS_PER_RUN = Number(process.env.BOT_MAX_POSTS_PER_RUN) || 50;
    const MAX_ENCOURAGES_PER_RUN =
        Number(process.env.BOT_MAX_ENCOURAGES_PER_RUN) || 200;

    function pickRandom(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function isSameDayUTC(a, b) {
        if (!a || !b) return false;
        const da = new Date(a);
        const db = new Date(b);
        return (
            da.getUTCFullYear() === db.getUTCFullYear() &&
            da.getUTCMonth() === db.getUTCMonth() &&
            da.getUTCDate() === db.getUTCDate()
        );
    }

    // Check global bot_control flag to auto-force posts (admin can set bots.force_posts)
    let globalForcePostsEnabled = false;
    try {
        const { data: forceControl } = await supabase
            .from("bot_control")
            .select("value")
            .eq("key", "bots.force_posts")
            .maybeSingle();
        if (forceControl && forceControl.value !== undefined) {
            const v = forceControl.value;
            if (typeof v === "object") {
                globalForcePostsEnabled =
                    v.enabled === true ||
                    String(v.enabled) === "true" ||
                    Number(v.enabled) === 1;
            } else {
                globalForcePostsEnabled =
                    v === true || String(v) === "true" || String(v) === "1";
            }
        }
    } catch (e) {
        // ignore and default to false
    }

    async function postAsBot(bot) {
        try {
            const dayKey = new Date().toISOString().slice(0, 10);
            const uniq = require("crypto")
                .createHash("sha1")
                .update(`${bot.user_id}:${dayKey}`)
                .digest("hex")
                .slice(0, 6);
            const mediaUrl = `https://picsum.photos/seed/${encodeURIComponent(bot.user_id + "-" + dayKey + "-" + uniq)}/1200/800`;

            // parse meta and choose topic templates
            const meta =
                bot.meta && typeof bot.meta === "object"
                    ? bot.meta
                    : bot.meta
                      ? JSON.parse(bot.meta)
                      : {};
            const topic =
                meta.topic ||
                (Array.isArray(meta.topics) && meta.topics[0]) ||
                "general";

            let title;
            let description;
            if (
                topic &&
                [
                    "robotics",
                    "ai",
                    "diy",
                    "coding",
                    "entrepreneurship",
                    "mechanics",
                ].includes(topic)
            ) {
                const tplMap = {
                    robotics: {
                        prefixes: [
                            "Prototype",
                            "Module",
                            "Capteur",
                            "Contrôleur",
                            "Bras robotique",
                            "Moteur",
                        ],
                        actions: [
                            "en test",
                            "v1.0",
                            "au labo",
                            "en montage",
                            "intégration Arduino",
                            "optimisé",
                        ],
                    },
                    ai: {
                        prefixes: [
                            "Modèle",
                            "Expérience",
                            "Réseau",
                            "Pipeline",
                            "Fine-tune",
                            "Prototype",
                        ],
                        actions: [
                            "pour vision",
                            "NLP",
                            "en entraînement",
                            "avec PyTorch",
                            "optimisé",
                            "en production",
                        ],
                    },
                    diy: {
                        prefixes: [
                            "Tuto",
                            "Astuce",
                            "Montage",
                            "Projet DIY",
                            "Guide",
                            "Hack",
                        ],
                        actions: [
                            "étape par étape",
                            "facile",
                            "avec pièces récupérées",
                            "low-cost",
                            "rapide",
                        ],
                    },
                    coding: {
                        prefixes: [
                            "Snippet",
                            "Pattern",
                            "Refactor",
                            "Truc",
                            "Astuce dev",
                            "Bricolage code",
                        ],
                        actions: [
                            "JS/Node",
                            "Python",
                            "best-practices",
                            "optimisation",
                            "débogage",
                        ],
                    },
                    entrepreneurship: {
                        prefixes: [
                            "Business",
                            "MVP",
                            "Pitch",
                            "Growth",
                            "Leçon",
                            "Astuce",
                        ],
                        actions: [
                            "lean",
                            "croissance",
                            "marketing",
                            "monétisation",
                            "expérience client",
                        ],
                    },
                    mechanics: {
                        prefixes: [
                            "Réglage",
                            "Mécanique",
                            "Diagnostic",
                            "Atelier",
                            "Maintenance",
                            "Assemblage",
                        ],
                        actions: [
                            "pignon",
                            "roulement",
                            "couple",
                            "soudure",
                            "usinage",
                        ],
                    },
                };
                const tpl = tplMap[topic] || tplMap.coding;
                title = `${pickRandom(tpl.prefixes)} ${pickRandom(tpl.actions)} • ${uniq}`;
                description = `Partage technique (${topic}) — ${pickRandom(["Petit retour d'expérience", "Astuce pratique", "Étapes clés", "Code & schéma"])} (${uniq})`;
            } else {
                const adjectives = [
                    "Petit",
                    "Grand",
                    "Nouveau",
                    "Simple",
                    "Rapide",
                    "Beau",
                ];
                const nouns = [
                    "progrès",
                    "instant",
                    "moment",
                    "capture",
                    "éclair",
                    "point",
                ];
                const verbs = [
                    "du jour",
                    "du matin",
                    "du soir",
                    "du week-end",
                    "d'aujourd'hui",
                ];
                title = `${pickRandom(adjectives)} ${pickRandom(nouns)} ${pickRandom(verbs)} • ${uniq}`;
                description = `Partage quotidien — ${pickRandom(["Un pas de plus", "Petite victoire", "Persévérance", "Suivi de progrès"])} (${uniq})`;
            }

            // Compute next day_number for this user's content (incremental per-user)
            let nextDayNumber = 1;
            try {
                const { data: lastRow, error: lastErr } = await supabase
                    .from("content")
                    .select("day_number")
                    .eq("user_id", bot.user_id)
                    .order("day_number", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (
                    !lastErr &&
                    lastRow &&
                    Number.isFinite(Number(lastRow.day_number))
                ) {
                    nextDayNumber = Number(lastRow.day_number) + 1;
                }
            } catch (e) {
                // ignore and fallback to 1
            }

            const payload = {
                user_id: bot.user_id,
                day_number: nextDayNumber,
                type: "image",
                state: "success",
                title,
                description,
                media_url: mediaUrl,
                created_at: new Date().toISOString(),
            };

            const { data, error } = await supabase
                .from("content")
                .insert(payload)
                .select()
                .single();
            if (error) throw error;
            await supabase
                .from("bots")
                .update({
                    last_posted_at: new Date().toISOString(),
                    last_action_at: new Date().toISOString(),
                })
                .eq("user_id", bot.user_id);
            return data;
        } catch (e) {
            console.warn(
                `postAsBot error for ${bot.user_id}:`,
                e?.message || e,
            );
            return null;
        }
    }

    async function encourageAsBot(bot) {
        try {
            // Fetch recent content candidates
            const { data: candidates, error } = await supabase
                .from("content")
                .select("id, user_id, created_at")
                .neq("user_id", bot.user_id)
                .order("created_at", { ascending: false })
                .limit(500);
            if (error) throw error;
            if (!candidates || candidates.length === 0) return null;

            // Prioritize content from real users (is_bot = false)
            const userIds = Array.from(
                new Set(candidates.map((c) => c.user_id).filter(Boolean)),
            );
            let usersMap = {};
            if (userIds.length > 0) {
                const { data: users } = await supabase
                    .from("users")
                    .select("id, is_bot")
                    .in("id", userIds);
                if (users && users.length) {
                    users.forEach((u) => {
                        usersMap[u.id] = !!u.is_bot;
                    });
                }
            }

            const prioritized = candidates.filter((c) => !usersMap[c.user_id]);
            const pickFrom = prioritized.length > 0 ? prioritized : candidates;
            const target = pickRandom(pickFrom);
            if (!target) return null;
            // Incrémenter les vues: simuler que le bot a vu ce contenu
            try {
                await supabase.rpc("increment_views", { row_id: target.id });
            } catch (incErr) {
                console.warn(
                    `increment_views rpc error for ${target.id}:`,
                    incErr?.message || incErr,
                );
            }

            const { data: rpcData, error: rpcErr } = await supabase.rpc(
                "toggle_courage",
                { row_id: target.id, user_id_param: bot.user_id },
            );
            if (rpcErr) throw rpcErr;
            // Ensure content.encouragements_count reflects server state (if RPC returned count)
            try {
                const serverCount =
                    rpcData &&
                    (Number(rpcData.count) || Number(rpcData.count) === 0
                        ? Number(rpcData.count)
                        : null);
                if (Number.isFinite(serverCount)) {
                    await supabase
                        .from("content")
                        .update({ encouragements_count: serverCount })
                        .eq("id", target.id);
                } else {
                    const { data: row } = await supabase
                        .from("content")
                        .select("encouragements_count")
                        .eq("id", target.id)
                        .maybeSingle();
                    const newCount =
                        row && Number(row.encouragements_count)
                            ? Number(row.encouragements_count) + 1
                            : 1;
                    await supabase
                        .from("content")
                        .update({ encouragements_count: newCount })
                        .eq("id", target.id);
                }
            } catch (err) {
                console.warn(
                    `update encouragements_count error for ${target.id}:`,
                    err?.message || err,
                );
            }
            await supabase
                .from("bots")
                .update({
                    last_encouraged_at: new Date().toISOString(),
                    last_action_at: new Date().toISOString(),
                })
                .eq("user_id", bot.user_id);
            return rpcData;
        } catch (e) {
            console.warn(
                `encourageAsBot error for ${bot.user_id}:`,
                e?.message || e,
            );
            return null;
        }
    }

    async function getFollowingIds(botUserId) {
        try {
            const { data, error } = await supabase
                .from("followers")
                .select("following_id")
                .eq("follower_id", botUserId);
            if (error) throw error;
            return (data || []).map((r) => r.following_id).filter(Boolean);
        } catch (e) {
            console.warn("getFollowingIds error", e?.message || e);
            return [];
        }
    }

    async function followAsBot(bot, maxToFollow = 1) {
        try {
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            const meta =
                bot.meta && typeof bot.meta === "object"
                    ? bot.meta
                    : bot.meta
                      ? JSON.parse(bot.meta)
                      : {};
            if (meta.last_followed_date === todayStr) return 0;

            const followingIds = new Set(await getFollowingIds(bot.user_id));
            const { data: candidates, error } = await supabase
                .from("users")
                .select("id, name, is_bot, followers_count")
                .neq("id", bot.user_id)
                .order("followers_count", { ascending: false })
                .limit(400);
            if (error) throw error;
            if (!candidates || candidates.length === 0) return 0;

            // Prioritize real users first, then bots (stronger preference)
            const realUsers = candidates.filter((c) => !c.is_bot);
            const botUsers = candidates.filter((c) => c.is_bot);
            realUsers.sort(
                (a, b) => (b.followers_count || 0) - (a.followers_count || 0),
            );
            botUsers.sort(
                (a, b) => (b.followers_count || 0) - (a.followers_count || 0),
            );
            const orderedCandidates = [...realUsers, ...botUsers];

            let followed = 0;
            for (const cand of orderedCandidates) {
                if (followed >= maxToFollow) break;
                if (!cand || !cand.id) continue;
                if (followingIds.has(cand.id)) continue;
                try {
                    const { error: insErr } = await supabase
                        .from("followers")
                        .insert({
                            follower_id: bot.user_id,
                            following_id: cand.id,
                        });
                    if (insErr) {
                        // ignore duplicates or constraint errors
                        console.warn(
                            "follow insert err",
                            insErr?.message || insErr,
                        );
                        continue;
                    }
                    followingIds.add(cand.id);
                    followed += 1;
                    // Simuler que le bot a vu les derniers posts de l'utilisateur suivi
                    try {
                        const { data: recent, error: recentErr } =
                            await supabase
                                .from("content")
                                .select("id")
                                .eq("user_id", cand.id)
                                .order("created_at", { ascending: false })
                                .limit(3);
                        if (!recentErr && Array.isArray(recent)) {
                            for (const r of recent) {
                                try {
                                    await supabase.rpc("increment_views", {
                                        row_id: r.id,
                                    });
                                } catch (rvErr) {
                                    // ignore individual errors
                                }
                                await sleep(60 + Math.random() * 200);
                            }
                        }
                    } catch (rvCatch) {
                        // ignore
                    }
                    // small delay between follow actions
                    await sleep(150 + Math.random() * 500);
                } catch (e) {
                    console.warn("followAsBot insert error", e?.message || e);
                }
            }

            // Update meta
            meta.follow_total = (Number(meta.follow_total) || 0) + followed;
            meta.last_followed_date = todayStr;
            await supabase
                .from("bots")
                .update({
                    meta: meta,
                    last_action_at: new Date().toISOString(),
                })
                .eq("user_id", bot.user_id);
            if (followed > 0)
                console.log(`Bot ${bot.user_id} followed ${followed} user(s)`);
            return followed;
        } catch (e) {
            console.warn(
                `followAsBot error for ${bot.user_id}:`,
                e?.message || e,
            );
            return 0;
        }
    }

    try {
        const { data: control } = await supabase
            .from("bot_control")
            .select("value")
            .eq("key", "bots.active_count")
            .maybeSingle();
        const activeCountValue =
            (control && control.value && Number(control.value.count)) || 0;

        const q = supabase
            .from("bots")
            .select("*")
            .eq("active", true)
            .order("last_action_at", { ascending: true });
        if (limit && Number.isFinite(limit) && limit > 0) q.limit(limit);
        const { data: bots, error: botsErr } = await q;
        if (botsErr) throw botsErr;

        const now = new Date();
        const currentHour = now.getUTCHours();
        const dayOfWeek = now.getUTCDay();

        let posts = 0;
        let encourages = 0;
        let follows = 0;

        for (const bot of bots || []) {
            // Post
            if (posts < MAX_POSTS_PER_RUN) {
                // Determine if we should force posting for this run (request param OR global admin flag)
                const shouldForcePostsForRun = force || globalForcePostsEnabled;
                if (
                    shouldForcePostsForRun ||
                    Number(bot.schedule_hour) === currentHour
                ) {
                    const todayStart = new Date(
                        Date.UTC(
                            now.getUTCFullYear(),
                            now.getUTCMonth(),
                            now.getUTCDate(),
                        ),
                    );
                    const shouldPost = shouldForcePostsForRun
                        ? true
                        : !bot.last_posted_at ||
                          new Date(bot.last_posted_at) < todayStart;
                    if (shouldPost) {
                        const d = await postAsBot(bot);
                        if (d) posts += 1;
                    }
                }
            }

            // Encourage
            if (encourages < MAX_ENCOURAGES_PER_RUN) {
                try {
                    const days = Array.isArray(bot.encourage_days)
                        ? bot.encourage_days.map(Number)
                        : [];
                    const notDoneToday =
                        !bot.last_encouraged_at ||
                        !isSameDayUTC(bot.last_encouraged_at, now);

                    // Ignore day check if force is true
                    if (force || (days.includes(dayOfWeek) && notDoneToday)) {
                        const e = await encourageAsBot(bot);
                        if (e) encourages += 1;
                    }
                } catch (e) {
                    // ignore per-bot parse errors
                }
            }

            // Follows (small daily quota)
            try {
                const f = await followAsBot(bot, FOLLOW_DAILY_LIMIT);
                if (f) follows += f;
            } catch (e) {
                // ignore follow errors
            }
        }

        return res.json({
            success: true,
            processed: (bots || []).length,
            posts,
            encourages,
            follows,
            activeCount: activeCountValue,
        });
    } catch (e) {
        console.error("/api/admin/bots/run-now error", e);
        if (e && e.stack) console.error(e.stack);
        return res.status(500).send("Erreur interne");
    }
});

if (isDirectRun && SUBSCRIPTION_SWEEP_MS > 0) {
    sweepExpiredSubscriptions();
    setInterval(sweepExpiredSubscriptions, SUBSCRIPTION_SWEEP_MS);
} else if (isDirectRun && SUBSCRIPTION_SWEEP_MS === 0) {
    console.info(
        "Subscription expiry sweep disabled (SUBSCRIPTION_SWEEP_MS=0).",
    );
}

// Démarrer le serveur (local/dev uniquement)
if (isDirectRun) {
    console.info("MaishaPay configuration summary:", {
        gatewayMode: String(MAISHAPAY_GATEWAY_MODE),
        publicKey: maskKey(MAISHAPAY_PUBLIC_KEY),
        secretKey: maskKey(MAISHAPAY_SECRET_KEY),
        publicKeyMode: inferMaishaPayKeyMode(MAISHAPAY_PUBLIC_KEY),
        secretKeyMode: inferMaishaPayKeyMode(MAISHAPAY_SECRET_KEY),
        callbackEnabled: MAISHAPAY_CALLBACK_ENABLED,
        callbackOrigin: CALLBACK_ORIGIN,
    });

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`API endpoints available at /api/*`);
        if (supportsEmailReminders()) {
            startReminderScheduler();
        } else {
            console.info(
                "Email reminder scheduler disabled (provider not configured).",
            );
        }
    });
}

module.exports = app;
module.exports.sweepExpiredSubscriptions = sweepExpiredSubscriptions;
module.exports.sweepReturnReminderEmails = sweepReturnReminderEmails;
module.exports.sendScheduledReturnReminders = sendScheduledReturnReminders;
module.exports.handleMaishaPaySubscriptionCheckout =
    handleMaishaPaySubscriptionCheckout;
module.exports.handleMaishaPaySupportCheckout = handleMaishaPaySupportCheckout;
module.exports.handleMaishaPayCallback = handleMaishaPayCallback;
module.exports.handlePublicConfig = handlePublicConfig;
module.exports.evaluateTechBadges = evaluateTechBadges;
