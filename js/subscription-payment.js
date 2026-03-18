/* ========================================
   SUBSCRIPTION PAYMENT - MAISHAPAY
   ======================================== */

const DEFAULT_BILLING = 'monthly';
const ANNUAL_DISCOUNT = 0.20;
let usdToCdfRate = 2300;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    if (!user) {
        if (window.XeraRouter?.navigate) {
            window.XeraRouter.navigate('login', {
                query: { redirect: 'subscription-payment' },
            });
        } else {
            window.location.href = 'login.html?redirect=subscription-payment.html';
        }
        return;
    }

    hydrateNavAvatar(user);

    const params = new URLSearchParams(window.location.search);
    const plan = normalizePlan(params.get('plan'));
    const billing = normalizeBilling(params.get('billing'));

    const currencyInput = document.getElementById('inputCurrency');
    const currency = currencyInput?.value || 'USD';
    await loadExchangeRate();
    hydrateSummary(plan, billing, currency);
    setupPaymentForm(user, plan, billing);
});

async function hydrateNavAvatar(user) {
    const navAvatar = document.getElementById('navAvatar');
    if (!navAvatar || !user) return;
    try {
        const profileResult = await getUserProfile(user.id);
        const avatar = profileResult?.success
            ? profileResult.data?.avatar
            : (user.user_metadata?.avatar_url || user.user_metadata?.avatar);
        if (avatar) {
            navAvatar.src = avatar;
        }
    } catch (error) {
        console.error('Erreur chargement avatar:', error);
    }
}

function normalizePlan(plan) {
    const allowed = ['standard', 'medium', 'pro'];
    return allowed.includes(String(plan).toLowerCase()) ? plan.toLowerCase() : 'standard';
}

function normalizeBilling(billing) {
    return String(billing).toLowerCase() === 'annual' ? 'annual' : DEFAULT_BILLING;
}

function hydrateSummary(planId, billingCycle, currency = 'USD') {
    const plan = PLANS[planId.toUpperCase()];
    if (!plan) return;

    const monthlyUsd = plan.price;
    const amountUsd = billingCycle === 'annual'
        ? monthlyUsd * 12 * (1 - ANNUAL_DISCOUNT)
        : monthlyUsd;
    const normalizedCurrency = String(currency || 'USD').toUpperCase();
    const amount = normalizedCurrency === 'CDF'
        ? Math.round(amountUsd * usdToCdfRate)
        : amountUsd;
    const cycleLabel = billingCycle === 'annual' ? 'Annuel' : 'Mensuel';
    const periodLabel = billingCycle === 'annual' ? '/an' : '/mois';
    const note = billingCycle === 'annual'
        ? 'Facturation annuelle avec 20% de réduction.'
        : 'Facturation mensuelle, résiliable à tout moment.';

    const summaryPlan = document.getElementById('summaryPlan');
    const summaryCycle = document.getElementById('summaryCycle');
    const summaryAmount = document.getElementById('summaryAmount');
    const summaryPeriod = document.getElementById('summaryPeriod');
    const summaryNote = document.getElementById('summaryNote');
    const summaryFeatures = document.getElementById('summaryFeatures');

    if (summaryPlan) summaryPlan.textContent = plan.name;
    if (summaryCycle) summaryCycle.textContent = cycleLabel;
    if (summaryAmount) summaryAmount.textContent = formatCurrency(amount, normalizedCurrency);
    if (summaryPeriod) summaryPeriod.textContent = periodLabel;
    if (summaryNote) summaryNote.textContent = note;

    if (summaryFeatures) {
        summaryFeatures.innerHTML = plan.features
            .slice(0, 5)
            .map((feature) => `
                <div class="summary-feature">
                    <i class="fas fa-circle-check"></i>
                    <span>${feature}</span>
                </div>
            `)
            .join('');
    }
}

function setupPaymentForm(user, planId, billingCycle) {
    const form = document.getElementById('maishapay-form');
    if (!form) return;

    const inputPlan = document.getElementById('inputPlan');
    const inputCycle = document.getElementById('inputCycle');
    const inputCurrency = document.getElementById('inputCurrency');
    const inputMethod = document.getElementById('inputMethod');
    const inputProvider = document.getElementById('inputProvider');
    const inputWallet = document.getElementById('inputWallet');
    const inputUserId = document.getElementById('inputUserId');
    const inputAccessToken = document.getElementById('inputAccessToken');
    const mobileFields = document.getElementById('mobileMoneyFields');
    const providerSelect = document.getElementById('providerSelect');
    const walletInput = document.getElementById('walletInput');
    const errorBox = document.getElementById('paymentError');

    inputPlan.value = planId;
    inputCycle.value = billingCycle;
    inputUserId.value = user.id;

    const apiBase = resolveApiBase();
    form.action = `${apiBase}/api/maishapay/checkout`;

    const methodButtons = document.querySelectorAll('.method-card');
    methodButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            methodButtons.forEach((b) => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            const method = btn.getAttribute('data-method') || 'card';
            inputMethod.value = method;
            if (method === 'mobilemoney') {
                mobileFields.classList.add('is-visible');
            } else {
                mobileFields.classList.remove('is-visible');
                providerSelect.value = '';
                walletInput.value = '';
            }
        });
    });

    const currencyButtons = document.querySelectorAll('.currency-btn');
    currencyButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            currencyButtons.forEach((b) => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            inputCurrency.value = btn.getAttribute('data-currency') || 'USD';
            hydrateSummary(planId, billingCycle, inputCurrency.value);
        });
    });

    form.addEventListener('submit', (event) => {
        if (errorBox) errorBox.textContent = '';
        if (inputMethod.value === 'mobilemoney') {
            const provider = providerSelect.value.trim();
            const wallet = walletInput.value.trim();
            if (!provider || !wallet) {
                event.preventDefault();
                if (errorBox) {
                    errorBox.textContent = 'Sélectionne un opérateur et un numéro Mobile Money.';
                }
                return;
            }
            inputProvider.value = provider;
            inputWallet.value = wallet;
        } else {
            inputProvider.value = '';
            inputWallet.value = '';
        }
    });
}

function resolveApiBase() {
    const bodyBase = document.body?.dataset?.apiBase?.trim();
    if (bodyBase) return bodyBase;

    const { protocol, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
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
    } catch (error) {
        // keep default rate
    }
}
