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
    PUSH_CONTACT_EMAIL = "mailto:notifications@xera.app",
    RETURN_REMINDER_HOURS = "10,18",
    RETURN_REMINDER_WINDOW_MINUTES = "15",
    RETURN_REMINDER_SWEEP_MS = "600000",
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
app.use(express.urlencoded({ extended: false }));
const allowedOrigins = APP_BASE_URL.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
app.use(cors({ origin: allowedOrigins, methods: ["GET", "POST"] }));

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
    return String(value || "").trim().replace(/\/+$/, "");
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
const CALLBACK_ORIGIN = resolveCallbackOrigin(CALLBACK_BASE_URL, PRIMARY_ORIGIN);
const MAISHAPAY_CALLBACK_ALLOWED = parseBooleanEnv(MAISHAPAY_USE_CALLBACK, true);
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
        const baseUrl = new URL(PRIMARY_ORIGIN || APP_BASE_URL || "http://localhost:3000");
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
        return Math.max(1, Math.round(normalizedAmount * USD_TO_CDF_RATE_VALUE));
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
        .digest("hex");
    return `${data}.${signature}`;
}

function verifySignedState(state) {
    if (!state || !MAISHAPAY_CALLBACK_SECRET) return null;
    const [data, signature] = String(state).split(".");
    if (!data || !signature) return null;
    const expected = crypto
        .createHmac("sha256", MAISHAPAY_CALLBACK_SECRET)
        .update(data)
        .digest("hex");
    if (
        !/^[a-f0-9]+$/i.test(signature) ||
        signature.length !== expected.length
    ) {
        return null;
    }
    const providedBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (providedBuffer.length !== expectedBuffer.length) {
        return null;
    }
    const valid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    if (!valid) return null;
    try {
        const payload = JSON.parse(
            Buffer.from(data, "base64url").toString("utf8"),
        );
        if (payload.expires_at && Date.now() > payload.expires_at) return null;
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

function renderMaishaPayCheckoutPage({
    amount,
    currency,
    callbackUrl,
}) {
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
        currency: String(row?.currency || metadata.currency || "USD").toUpperCase(),
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
    return SUPPORTED_MOBILE_MONEY_PROVIDERS.has(normalized)
        ? normalized
        : null;
}

function sanitizeWalletNumber(value) {
    return String(value || "")
        .trim()
        .replace(/[^\d+]/g, "")
        .slice(0, 32);
}

function sanitizePayoutText(value, maxLength = 160) {
    return String(value || "").trim().slice(0, maxLength);
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
            MOBILE_MONEY_PROVIDER_LABELS[provider] || MOBILE_MONEY_PROVIDER_LABELS.other,
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
        requestedCurrency: String(row.requested_currency || "USD").toUpperCase(),
        channel: row.channel || "mobile_money",
        provider,
        providerLabel:
            MOBILE_MONEY_PROVIDER_LABELS[provider] || MOBILE_MONEY_PROVIDER_LABELS.other,
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
        if (userIds.length > 0) {
            await supabase
                .from("users")
                .update({
                    plan: "free",
                    plan_status: "inactive",
                    is_monetized: false,
                    updated_at: nowIso,
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

    const { data: updatedUser, error: updateUserError } = await supabase
        .from("users")
        .update({
            plan,
            plan_status: "active",
            plan_ends_at: periodEndIso,
            badge: badgeToApply,
            is_monetized: isMonetized,
        })
        .eq("id", userId)
        .select("*")
        .single();
    if (updateUserError) throw updateUserError;

    const mergedMetadata = {
        ...(pendingPayment?.metadata && typeof pendingPayment.metadata === "object"
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
        user.is_monetized === true ||
        Number(user.followers_count || 0) >= 1000
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
        let query = supabase.from("notifications").insert(payload).select("*").single();
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
        console.warn("Support notification insert error:", error?.message || error);
        return null;
    }
}

async function purgeStalePushSubscription(endpoint) {
    if (!endpoint) return;
    try {
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    } catch (error) {
        console.warn("Failed to purge stale push subscription:", error?.message || error);
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
    if (!supportsPush() || !userId || !payload) return;

    try {
        const { data: subs, error } = await supabase
            .from("push_subscriptions")
            .select("endpoint, keys")
            .eq("user_id", userId);
        if (error) throw error;
        if (!subs || subs.length === 0) return;

        const payloadString = JSON.stringify(payload);
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
            } catch (error) {
                if (error?.statusCode === 404 || error?.statusCode === 410) {
                    await purgeStalePushSubscription(sub.endpoint);
                    continue;
                }
                console.warn("Support push error:", error?.message || error);
            }
        }
    } catch (error) {
        console.warn("Support push lookup error:", error?.message || error);
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
            transactionRefId ||
            existing.metadata?.transaction_ref_id ||
            null,
        operator_ref_id:
            operatorRefId ||
            existing.metadata?.operator_ref_id ||
            null,
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
        supabase.from("users").select("id, name, avatar").eq("id", fromUserId).maybeSingle(),
        supabase.from("users").select("id, name, avatar").eq("id", toUserId).maybeSingle(),
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
        ...(pendingPayment?.metadata && typeof pendingPayment.metadata === "object"
            ? pendingPayment.metadata
            : {}),
        payment_provider: "maishapay",
        payment_ref: paymentId,
        transaction_ref_id: transactionRefId || null,
        operator_ref_id: operatorRefId || null,
        method: String(method || pendingPayment?.metadata?.method || "card").toLowerCase(),
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
        checkout_currency:
            String(
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
        senderProfile?.name ||
        mergedMetadata.sender_name ||
        "Un utilisateur";
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
    return { hour: slotHour, dateKey: parts.dateKey };
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
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
        });

        let callbackUrl = null;
        if (callbackConfig.callbackEnabled) {
            const statePayload = {
                user_id: userId,
                pending_transaction_id: pendingPayment.id,
                checkout_ref_id: pendingPayment.checkoutRefId,
                plan: planId,
                billing_cycle: billingCycle,
                currency,
                amount,
                method: String(method || "card").toLowerCase(),
                provider: provider || null,
                wallet_id: walletId || null,
                return_path: returnPath,
                issued_at: Date.now(),
                expires_at: Date.now() + 2 * 60 * 60 * 1000,
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
        return sendCheckoutErrorResponse(
            res,
            error,
            "Erreur MaishaPay",
        );
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
            return res.status(400).send(
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
                .send("Profil expediteur introuvable. Rechargez votre session.");
        }
        if (!recipientProfile) {
            return res.status(404).send("Createur introuvable");
        }
        if (!canUserReceiveSupport(recipientProfile)) {
            return res
                .status(400)
                .send("Ce createur n'est pas eligible aux soutiens.");
        }

        const checkoutAmount = computeSupportCheckoutAmount(amountUsd, currency);
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
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
        });

        let callbackUrl = null;
        if (callbackConfig.callbackEnabled) {
            const statePayload = {
                payment_kind: "support",
                from_user_id: fromUserId,
                to_user_id: toUserId,
                pending_transaction_id: pendingPayment.id,
                checkout_ref_id: pendingPayment.checkoutRefId,
                amount_usd: amountUsd,
                checkout_amount: checkoutAmount,
                checkout_currency: currency,
                method: String(method || "card").toLowerCase(),
                provider: provider || null,
                wallet_id: walletId || null,
                description:
                    description ||
                    `Soutien pour ${recipientProfile.name || "un createur"}`,
                return_path: returnPath,
                issued_at: Date.now(),
                expires_at: Date.now() + 2 * 60 * 60 * 1000,
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
        return sendCheckoutErrorResponse(
            res,
            error,
            "Erreur MaishaPay",
        );
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

        const paymentKind = String(payload.payment_kind || "subscription").toLowerCase();
        const isSuccess =
            String(status) === "202" ||
            String(status).toLowerCase() === "success";

        if (isSuccess) {
            if (paymentKind === "support") {
                await confirmSupportPayment({
                    fromUserId: payload.from_user_id,
                    toUserId: payload.to_user_id,
                    amountUsd: payload.amount_usd,
                    checkoutCurrency: payload.checkout_currency,
                    checkoutAmount: payload.checkout_amount,
                    method: payload.method,
                    provider: payload.provider,
                    walletId: payload.wallet_id,
                    description: payload.description,
                    pendingTransactionId: payload.pending_transaction_id,
                    transactionRefId,
                    operatorRefId,
                    confirmationSource: "maishapay_callback",
                });
            } else {
                await activateSubscription({
                    userId: payload.user_id,
                    plan: payload.plan,
                    billingCycle: payload.billing_cycle,
                    currency: payload.currency,
                    amount: payload.amount,
                    transactionRefId,
                    operatorRefId,
                    method: payload.method,
                    provider: payload.provider,
                    walletId: payload.wallet_id,
                    pendingTransactionId: payload.pending_transaction_id,
                    confirmationSource: "maishapay_callback",
                });
            }
        } else {
            await failPendingTransaction({
                pendingTransactionId: payload.pending_transaction_id,
                transactionRefId,
                operatorRefId,
                reason: description || String(status || "Paiement non confirme"),
                confirmationSource: "maishapay_callback",
            });
        }

        const successTitle =
            paymentKind === "support" ? "Soutien confirmé" : "Paiement confirmé";
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
                ? payload.return_path || "/"
                : payload.return_path || buildProfileReturnPath(payload.user_id);
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

        const { data: updated, error: updateError } = await supabase
            .from("users")
            .update({
                plan: normalizedPlan,
                plan_status: "active",
                plan_ends_at: null,
                badge: badgeToApply,
                is_monetized: isMonetized,
                updated_at: new Date().toISOString(),
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
            .map((value) => String(value || "").trim().toLowerCase())
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
            supportedProviders: Object.entries(MOBILE_MONEY_PROVIDER_LABELS).map(
                ([value, label]) => ({ value, label }),
            ),
        });
    } catch (error) {
        console.error("Monetization overview error:", error);
        if (isMissingRelationError(error)) {
            return res.status(503).json({ error: getWalletSchemaErrorMessage() });
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

        const [senderProfileResult, recipientProfileResult] = await Promise.all([
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
        ]);

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

        const description = String(rawDescription || "").trim().slice(0, 160);
        const breakdown = computeSupportRevenueBreakdown(amount);
        const metadata = {
            payment_provider: "internal_support",
            support_kind: "direct",
            sender_name: senderProfile?.name || authResult.user.email || "Utilisateur",
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
            senderProfile?.name || authResult.user.user_metadata?.username || "Un utilisateur";
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

        const withdrawals = await fetchCreatorWithdrawalRequests(authResult.user.id, {
            limit: Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30)),
        });
        return res.json({ success: true, withdrawals });
    } catch (error) {
        console.error("Monetization withdrawals list error:", error);
        if (isMissingRelationError(error)) {
            return res.status(503).json({ error: getWalletSchemaErrorMessage() });
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
        const countryCode = sanitizePayoutText(req.body?.country_code || "CD", 8)
            .toUpperCase();

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
            return res.status(503).json({ error: getWalletSchemaErrorMessage() });
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
            return res.status(503).json({ error: getWalletSchemaErrorMessage() });
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

        const requestedStatuses = String(req.query.status || "pending,processing")
            .split(",")
            .map((value) => String(value || "").trim().toLowerCase())
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
            return res.status(503).json({ error: getWalletSchemaErrorMessage() });
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
        const status = String(req.body?.status || "").trim().toLowerCase();
        const operatorRefId = sanitizePayoutText(req.body?.operator_ref_id, 120);
        const adminNote = sanitizePayoutText(req.body?.note, 280);
        const allowedStatuses = new Set(["processing", "paid", "rejected"]);

        if (!requestId) {
            return res.status(400).json({ error: "Demande de retrait manquante." });
        }
        if (!allowedStatuses.has(status)) {
            return res.status(400).json({ error: "Statut de retrait invalide." });
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
            return res.status(503).json({ error: getWalletSchemaErrorMessage() });
        }
        return res.status(500).json({
            error: "Impossible de mettre a jour cette demande de retrait.",
        });
    }
});

// ==================== API EXISTANTES ====================

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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

// ... (le reste du code existant pour les rappels, etc.)

const isDirectRun = require.main === module;

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
    });
}

module.exports = app;
module.exports.sweepExpiredSubscriptions = sweepExpiredSubscriptions;
module.exports.handleMaishaPaySubscriptionCheckout =
    handleMaishaPaySubscriptionCheckout;
module.exports.handleMaishaPaySupportCheckout = handleMaishaPaySupportCheckout;
module.exports.handleMaishaPayCallback = handleMaishaPayCallback;
module.exports.handlePublicConfig = handlePublicConfig;
