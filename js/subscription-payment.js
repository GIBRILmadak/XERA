/* ========================================
   PAYMENT PAGE - SUBSCRIPTIONS & SUPPORT
   ======================================== */

const PAYMENT_KIND_SUBSCRIPTION = "subscription";
const PAYMENT_KIND_SUPPORT = "support";
const DEFAULT_BILLING = "monthly";
const ANNUAL_DISCOUNT = 0.2;
const PAYMENT_RETURN_PATH_PARAM = "return_path";

let usdToCdfRate = 2300;
let maishaPayConfig = {
    callbackEnabled: true,
    gatewayMode: "1",
};

document.addEventListener("DOMContentLoaded", async () => {
    const user = await checkAuth();
    if (!user) {
        redirectToLogin();
        return;
    }

    hydrateNavAvatar(user);

    let accessToken = "";
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        accessToken = session?.access_token || "";
    } catch (error) {
        // keep empty token fallback
    }

    await loadExchangeRate();

    const params = new URLSearchParams(window.location.search);
    const paymentContext = await resolvePaymentContext(params, user);
    if (!paymentContext) {
        return;
    }

    hydratePaymentSummary(paymentContext);
    setupPaymentHint(paymentContext);
    setupPaymentForm(user, paymentContext, accessToken);
});

function redirectToLogin() {
    const redirectTarget = `${window.location.pathname}${window.location.search}`;
    if (window.XeraRouter?.navigate) {
        window.XeraRouter.navigate("login", {
            query: { redirect: redirectTarget },
        });
    } else {
        window.location.href =
            "login.html?redirect=" + encodeURIComponent(redirectTarget);
    }
}

function resolveNavAvatarUrl(avatarUrl) {
    const value = String(avatarUrl || "").trim();
    if (!value) return "";
    if (!/^https?:/i.test(value)) return value;
    try {
        const url = new URL(value, window.location.origin);
        url.searchParams.set("v", Date.now().toString());
        return url.toString();
    } catch (error) {
        return value;
    }
}

async function hydrateNavAvatar(user) {
    const navAvatar = document.getElementById("navAvatar");
    if (!navAvatar || !user) return;
    try {
        const profileResult = await getUserProfile(user.id);
        const avatar = profileResult?.success
            ? profileResult.data?.avatar
            : user.user_metadata?.avatar_url || user.user_metadata?.avatar;
        const resolvedAvatar = resolveNavAvatarUrl(avatar);
        if (resolvedAvatar) {
            navAvatar.src = resolvedAvatar;
        }
    } catch (error) {
        console.error("Erreur chargement avatar:", error);
    }
}

function normalizePaymentKind(kind) {
    return String(kind || "").toLowerCase() === PAYMENT_KIND_SUPPORT
        ? PAYMENT_KIND_SUPPORT
        : PAYMENT_KIND_SUBSCRIPTION;
}

function normalizePlan(plan) {
    const allowed = ["standard", "medium", "pro"];
    return allowed.includes(String(plan).toLowerCase())
        ? String(plan).toLowerCase()
        : "standard";
}

function normalizeBilling(billing) {
    return String(billing).toLowerCase() === "annual"
        ? "annual"
        : DEFAULT_BILLING;
}

async function resolvePaymentContext(params, user) {
    const kind = normalizePaymentKind(params.get("kind"));
    if (kind === PAYMENT_KIND_SUPPORT) {
        return resolveSupportContext(params, user);
    }

    const userProfileReturnPath = buildProfileReturnPath(user?.id || null);
    return {
        kind: PAYMENT_KIND_SUBSCRIPTION,
        planId: normalizePlan(params.get("plan")),
        billingCycle: normalizeBilling(params.get("billing")),
        formActionPath: "/api/maishapay/checkout",
        defaultCurrency: "USD",
        returnPath: userProfileReturnPath,
    };
}

async function resolveSupportContext(params, user) {
    const creatorId = String(params.get("creator") || "").trim();
    const rawAmount = Number.parseFloat(params.get("amount") || "");
    const creatorNameFromQuery = String(
        params.get("creator_name") || "",
    ).trim();
    const description = String(params.get("description") || "")
        .trim()
        .slice(0, 160);
    const returnPath = sanitizeClientReturnPath(
        params.get(PAYMENT_RETURN_PATH_PARAM),
        buildProfileReturnPath(creatorId),
    );

    if (!creatorId) {
        showPaymentError("Créateur introuvable pour ce soutien.", {
            disableButton: true,
        });
        return null;
    }
    if (!Number.isFinite(rawAmount) || rawAmount < 1 || rawAmount > 1000) {
        showPaymentError("Montant de soutien invalide.", {
            disableButton: true,
        });
        return null;
    }
    if (!Number.isInteger(rawAmount)) {
        showPaymentError("Le soutien doit être un montant entier en USD.", {
            disableButton: true,
        });
        return null;
    }
    if (user?.id && user.id === creatorId) {
        showPaymentError("Vous ne pouvez pas vous soutenir vous-même.", {
            disableButton: true,
        });
        return null;
    }

    const profileResult = await getUserProfile(creatorId);
    if (!profileResult?.success || !profileResult?.data) {
        showPaymentError("Impossible de charger ce créateur.", {
            disableButton: true,
        });
        return null;
    }

    const creator = profileResult.data;
    if (!canReceiveSupport(creator)) {
        showPaymentError(
            "Ce créateur ne peut pas recevoir de soutiens pour le moment.",
            { disableButton: true },
        );
        return null;
    }

    return {
        kind: PAYMENT_KIND_SUPPORT,
        creatorId,
        creatorName: creator.name || creatorNameFromQuery || "Créateur",
        amountUsd: Number.parseInt(String(rawAmount), 10),
        description:
            description || `Soutien pour ${creator.name || "ce créateur"}`,
        formActionPath: "/api/maishapay/support-checkout",
        defaultCurrency: "USD",
        returnPath,
    };
}

function buildProfileReturnPath(userId) {
    const safeUserId = String(userId || "").trim();
    if (window.XeraRouter?.buildHtmlUrl) {
        return window.XeraRouter.buildHtmlUrl("profile", {
            query: safeUserId ? { user: safeUserId } : {},
        });
    }
    const url = new URL("profile.html", window.location.href);
    if (safeUserId) {
        url.searchParams.set("user", safeUserId);
    }
    return `${url.pathname}${url.search}${url.hash}`;
}

function sanitizeClientReturnPath(rawValue, fallbackPath) {
    const fallback = String(fallbackPath || buildProfileReturnPath("")).trim();
    const value = String(rawValue || "").trim();
    if (!value) return fallback;

    try {
        const url = new URL(value, window.location.origin);
        if (url.origin !== window.location.origin) {
            return fallback;
        }
        return `${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
        return fallback;
    }
}

function hydratePaymentSummary(paymentContext, currency = null) {
    if (paymentContext.kind === PAYMENT_KIND_SUPPORT) {
        hydrateSupportSummary(
            paymentContext,
            currency || paymentContext.defaultCurrency,
        );
        return;
    }

    hydrateSubscriptionSummary(
        paymentContext.planId,
        paymentContext.billingCycle,
        currency || paymentContext.defaultCurrency,
    );
}

function hydrateSubscriptionSummary(planId, billingCycle, currency = "USD") {
    const plan = PLANS[planId.toUpperCase()];
    if (!plan) return;

    const monthlyUsd = plan.price;
    const amountUsd =
        billingCycle === "annual"
            ? monthlyUsd * 12 * (1 - ANNUAL_DISCOUNT)
            : monthlyUsd;
    const normalizedCurrency = String(currency || "USD").toUpperCase();
    const amount =
        normalizedCurrency === "CDF"
            ? Math.round(amountUsd * usdToCdfRate)
            : amountUsd;
    const cycleLabel = billingCycle === "annual" ? "Annuel" : "Mensuel";
    const periodLabel = billingCycle === "annual" ? "/an" : "/mois";
    const note =
        billingCycle === "annual"
            ? "Facturation annuelle avec 20% de réduction."
            : "Facturation mensuelle, résiliable à tout moment.";

    setText("summaryLabel", "Plan choisi");
    setText("summaryCycle", cycleLabel);
    setText("summaryPlan", plan.name);
    setText("summarySub", "Active ton badge et débloque les avantages.");
    setText("summaryAmount", formatCurrency(amount, normalizedCurrency));
    setText("summaryPeriod", periodLabel);
    setText("summaryNote", note);
    setText("paymentFormTitle", "Choisis ton moyen de paiement");
    setText(
        "paymentFormSubtitle",
        "Sélectionne carte ou mobile money, puis la devise.",
    );
    setText("payButton", "Continuer vers le paiement");
    document.title = `Paiement ${plan.name} - XERA`;

    renderSummaryFeatures(plan.features.slice(0, 5));
}

function hydrateSupportSummary(paymentContext, currency = "USD") {
    const normalizedCurrency = String(currency || "USD").toUpperCase();
    const checkoutAmount =
        normalizedCurrency === "CDF"
            ? Math.round(paymentContext.amountUsd * usdToCdfRate)
            : Math.ceil(paymentContext.amountUsd);
    const automaticConfirmation = maishaPayConfig.callbackEnabled !== false;

    setText("summaryLabel", "Soutien choisi");
    setText("summaryCycle", "Soutien");
    setText("summaryPlan", `Soutenir ${paymentContext.creatorName}`);
    setText(
        "summarySub",
        automaticConfirmation
            ? "Paiement MaishaPay avec crédit automatique du créateur après confirmation."
            : "Paiement MaishaPay avec crédit du créateur après confirmation du paiement.",
    );
    setText(
        "summaryAmount",
        formatCurrency(checkoutAmount, normalizedCurrency),
    );
    setText("summaryPeriod", "une fois");
    setText(
        "summaryNote",
        normalizedCurrency === "CDF"
            ? `Débit estimé en CDF pour un soutien de ${formatCurrency(paymentContext.amountUsd, "USD")}.`
            : `Le créateur recevra 80% net après commission XERA.`,
    );
    setText("paymentFormTitle", "Choisis ton moyen de paiement");
    setText(
        "paymentFormSubtitle",
        `Tu soutiens ${paymentContext.creatorName}. Sélectionne carte ou mobile money, puis la devise.`,
    );
    setText("payButton", "Continuer vers MaishaPay");
    document.title = `Soutenir ${paymentContext.creatorName} - XERA`;

    renderSummaryFeatures([
        `Destinataire: ${paymentContext.creatorName}`,
        `Montant de soutien: ${formatCurrency(paymentContext.amountUsd, "USD")}`,
        automaticConfirmation
            ? "Le dashboard du créateur se mettra à jour automatiquement après confirmation."
            : "Le soutien restera en attente tant que la confirmation MaishaPay n’est pas reçue.",
        "Le créateur pourra ensuite demander son retrait Mobile Money depuis son dashboard.",
    ]);
}

function renderSummaryFeatures(features) {
    const summaryFeatures = document.getElementById("summaryFeatures");
    if (!summaryFeatures) return;

    summaryFeatures.innerHTML = (features || [])
        .filter(Boolean)
        .map(
            (feature) => `
            <div class="summary-feature">
                <i class="fas fa-circle-check"></i>
                <span>${feature}</span>
            </div>
        `,
        )
        .join("");
}

function setupPaymentForm(user, paymentContext, accessToken = "") {
    const form = document.getElementById("maishapay-form");
    if (!form) return;

    const inputKind = document.getElementById("inputKind");
    const inputPlan = document.getElementById("inputPlan");
    const inputCycle = document.getElementById("inputCycle");
    const inputTargetUserId = document.getElementById("inputTargetUserId");
    const inputSupportAmountUsd = document.getElementById(
        "inputSupportAmountUsd",
    );
    const inputSupportDescription = document.getElementById(
        "inputSupportDescription",
    );
    const inputReturnPath = document.getElementById("inputReturnPath");
    const inputCurrency = document.getElementById("inputCurrency");
    const inputMethod = document.getElementById("inputMethod");
    const inputProvider = document.getElementById("inputProvider");
    const inputWallet = document.getElementById("inputWallet");
    const inputUserId = document.getElementById("inputUserId");
    const inputAccessToken = document.getElementById("inputAccessToken");
    const mobileFields = document.getElementById("mobileMoneyFields");
    const providerSelect = document.getElementById("providerSelect");
    const walletInput = document.getElementById("walletInput");
    const errorBox = document.getElementById("paymentError");
    const payButton = document.getElementById("payButton");

    if (inputKind) inputKind.value = paymentContext.kind;
    if (inputUserId) inputUserId.value = user.id;
    if (inputAccessToken) inputAccessToken.value = accessToken;
    if (inputCurrency)
        inputCurrency.value = paymentContext.defaultCurrency || "USD";
    if (inputReturnPath) {
        inputReturnPath.value =
            paymentContext.returnPath || buildProfileReturnPath(user.id);
    }

    if (paymentContext.kind === PAYMENT_KIND_SUPPORT) {
        if (inputPlan) inputPlan.value = "";
        if (inputCycle) inputCycle.value = "";
        if (inputTargetUserId)
            inputTargetUserId.value = paymentContext.creatorId;
        if (inputSupportAmountUsd) {
            inputSupportAmountUsd.value = String(paymentContext.amountUsd);
        }
        if (inputSupportDescription) {
            inputSupportDescription.value = paymentContext.description;
        }
    } else {
        if (inputPlan) inputPlan.value = paymentContext.planId;
        if (inputCycle) inputCycle.value = paymentContext.billingCycle;
        if (inputTargetUserId) inputTargetUserId.value = "";
        if (inputSupportAmountUsd) inputSupportAmountUsd.value = "";
        if (inputSupportDescription) inputSupportDescription.value = "";
    }

    const apiBase = resolveApiBase();
    form.action = `${apiBase}${paymentContext.formActionPath}`;

    const methodButtons = document.querySelectorAll(".method-card");
    methodButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            clearPaymentError();
            methodButtons.forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
            const method = btn.getAttribute("data-method") || "card";
            inputMethod.value = method;
            if (method === "mobilemoney") {
                mobileFields.classList.add("is-visible");
            } else {
                mobileFields.classList.remove("is-visible");
                providerSelect.value = "";
                walletInput.value = "";
            }
        });
    });

    const currencyButtons = document.querySelectorAll(".currency-btn");
    currencyButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            clearPaymentError();
            currencyButtons.forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
            inputCurrency.value = btn.getAttribute("data-currency") || "USD";
            hydratePaymentSummary(paymentContext, inputCurrency.value);
        });
    });

    providerSelect?.addEventListener("change", () => {
        clearPaymentError();
    });
    walletInput?.addEventListener("input", () => {
        clearPaymentError();
    });

    form.addEventListener("submit", (event) => {
        if (errorBox) errorBox.textContent = "";
        if (payButton) payButton.disabled = false;

        if (paymentContext.kind === PAYMENT_KIND_SUPPORT) {
            const supportAmount = Number.parseFloat(
                inputSupportAmountUsd?.value || "0",
            );
            if (!Number.isInteger(supportAmount) || supportAmount < 1) {
                event.preventDefault();
                showPaymentError(
                    "Le soutien doit être un montant entier en USD.",
                );
                return;
            }
        }

        if (inputMethod.value === "mobilemoney") {
            const provider = providerSelect.value.trim();
            const wallet = walletInput.value.trim();
            if (!provider || !wallet) {
                event.preventDefault();
                showPaymentError(
                    "Sélectionne un opérateur et un numéro Mobile Money.",
                );
                return;
            }
            inputProvider.value = provider;
            inputWallet.value = wallet;
        } else {
            inputProvider.value = "";
            inputWallet.value = "";
        }
    });
}

function setupPaymentHint(paymentContext) {
    const hint = document.querySelector(".payment-hint");
    if (!hint) return;

    if (maishaPayConfig.callbackEnabled === false) {
        hint.innerHTML =
            paymentContext.kind === PAYMENT_KIND_SUPPORT
                ? `
                    <i class="fas fa-circle-info"></i>
                    Soutien MaishaPay en direct. Sans callback public actif, la confirmation automatique restera en attente.
                `
                : `
                    <i class="fas fa-circle-info"></i>
                    Paiement MaishaPay en direct. La validation automatique de l'abonnement est desactivee temporairement.
                `;
        return;
    }

    hint.innerHTML = `
        <i class="fas fa-lock"></i>
        Paiement securise via MaishaPay
    `;
}

function clearPaymentError() {
    const errorBox = document.getElementById("paymentError");
    if (errorBox) {
        errorBox.textContent = "";
    }

    const payButton = document.getElementById("payButton");
    if (payButton) {
        payButton.disabled = false;
    }
}

function showPaymentError(message, options = {}) {
    const { disableButton = false } = options;

    const errorBox = document.getElementById("paymentError");
    if (errorBox) {
        errorBox.textContent = message;
    }

    const payButton = document.getElementById("payButton");
    if (payButton) {
        payButton.disabled = disableButton;
    }
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function resolveApiBase() {
    const bodyBase = document.body?.dataset?.apiBase?.trim();
    if (bodyBase) return bodyBase;

    const { protocol, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return `${protocol}//${hostname}:5050`;
    }
    return window.location.origin;
}

async function loadExchangeRate() {
    try {
        const apiBase = resolveApiBase();
        const response = await fetch(`${apiBase}/api/config`);
        if (!response.ok) return;
        const data = await response.json();
        const rate = Number.parseFloat(data?.usdToCdfRate);
        if (Number.isFinite(rate) && rate > 0) {
            usdToCdfRate = rate;
        }
        if (data?.maishaPay && typeof data.maishaPay === "object") {
            maishaPayConfig = {
                ...maishaPayConfig,
                ...data.maishaPay,
            };
        }
    } catch (error) {
        // keep defaults
    }
}
