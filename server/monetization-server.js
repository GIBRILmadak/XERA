const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');
const crypto = require('crypto');

dotenv.config();

const {
  APP_BASE_URL = 'http://localhost:3000',
  PORT = 5050,
  SUPABASE_URL = 'https://ssbuagqwjptyhavinkxg.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzYnVhZ3F3anB0eWhhdmlua3hnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTk1MjUzMywiZXhwIjoyMDg1NTI4NTMzfQ._aEaTXFxqpfx64bts6Z7FoP3L4oHMGcqoi08yREU33s',
  VAPID_PUBLIC_KEY = 'BDyU4kv_cnxruA5n_i3kw0-ipEXZTINrLmwVAhyyFhXsIVC6eImDqhkLVLs77Fl-TJdyOJVZsnp-k6z_7bu0bTM',
  VAPID_PRIVATE_KEY = '6dmRHoFpyGEFgL487qqwBc9BQ184TC8N9Yd3siS94Skpka',
  PUSH_CONTACT_EMAIL = 'mailto:notifications@xera.app',
  RETURN_REMINDER_HOURS = '10,18',
  RETURN_REMINDER_WINDOW_MINUTES = '15',
  RETURN_REMINDER_SWEEP_MS = '60000',
  MAISHAPAY_PUBLIC_KEY = 'MP-SBPK-gqKt$bN566$YDA3vPyCUfOxDhl$2njHikUr9FRgebHulr$RBBpzWd2JHE$f2M2r$1chH00x.EbTRNhKar0Iec5wnuT0t1EeopB6vilzcPeHKU0ypWdjjniv1',
  MAISHAPAY_SECRET_KEY = 'MP-SBPK-ie739o.T$j46RP1/XR$9$jKyudK82Y57d4zgh$fKqqS.A8nHTBK7h$YQzq1tfNw1aejya42cxsKzRq3Z68sP1lmTBk$QPvHR54zGjNyl0rcDDvS0czSiHsp2',
  MAISHAPAY_GATEWAY_MODE = '0',
  MAISHAPAY_CHECKOUT_URL = 'https://marchand.maishapay.online/payment/vers1.0/merchant/checkout',
  MAISHAPAY_CALLBACK_SECRET = '',
  SUPER_ADMIN_ID = 'b0f9f893-1706-4721-899c-d26ad79afc86'
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn('Warning: Missing VAPID keys. Push notifications will not be sent.');
} else {
  webpush.setVapidDetails(PUSH_CONTACT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const allowedOrigins = APP_BASE_URL.split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST'] }));

const PRIMARY_ORIGIN = allowedOrigins[0] || APP_BASE_URL.split(',')[0] || 'http://localhost:3000';
const REMINDER_HOURS = RETURN_REMINDER_HOURS
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23)
  .sort((a, b) => a - b);
const REMINDER_WINDOW_MIN = Math.max(1, parseInt(RETURN_REMINDER_WINDOW_MINUTES, 10) || 15);
const REMINDER_SWEEP_MS = Math.max(30000, parseInt(RETURN_REMINDER_SWEEP_MS, 10) || 60000);
let reminderSweepInFlight = false;
const SUBSCRIPTION_SWEEP_MS = Math.max(
  60000,
  parseInt(process.env.SUBSCRIPTION_SWEEP_MS, 10) || 10 * 60 * 1000
);
let subscriptionSweepInFlight = false;

const EXPIRES_BADGES = new Set(['verified', 'verified_gold', 'gold', 'pro']);
const PROTECTED_BADGES = new Set([
  'staff',
  'team',
  'community',
  'company',
  'enterprise',
  'ambassador'
]);

const MAISHAPAY_PLANS = {
  standard: 2.99,
  medium: 7.99,
  pro: 14.99
};

function computeMaishaPayAmount(plan, billingCycle) {
  const monthly = MAISHAPAY_PLANS[plan];
  if (!monthly) return null;
  if (billingCycle === 'annual') {
    return monthly * 12 * 0.8;
  }
  return monthly;
}

function addMonths(date, months) {
  const result = new Date(date);
  const desired = result.getMonth() + months;
  result.setMonth(desired);
  return result;
}

function createSignedState(payload) {
  if (!MAISHAPAY_CALLBACK_SECRET) return null;
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', MAISHAPAY_CALLBACK_SECRET)
    .update(data)
    .digest('hex');
  return `${data}.${signature}`;
}

function verifySignedState(state) {
  if (!state || !MAISHAPAY_CALLBACK_SECRET) return null;
  const [data, signature] = String(state).split('.');
  if (!data || !signature) return null;
  const expected = crypto
    .createHmac('sha256', MAISHAPAY_CALLBACK_SECRET)
    .update(data)
    .digest('hex');
  const valid = crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  if (!valid) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.expires_at && Date.now() > payload.expires_at) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

async function resolveUserId(accessToken, fallbackId) {
  if (!accessToken) return fallbackId;
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data?.user?.id) {
      return data.user.id;
    }
  } catch (e) {
    // ignore
  }
  return fallbackId;
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
      .from('subscriptions')
      .select('id')
      .eq('status', 'active')
      .lte('current_period_end', nowIso);

    if (subsError) throw subsError;

    const subscriptionIds = (expiredSubs || []).map((row) => row.id).filter(Boolean);
    if (subscriptionIds.length > 0) {
      await supabase
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: nowIso, cancel_at_period_end: true })
        .in('id', subscriptionIds);
    }

    const { data: expiredUsers, error: usersError } = await supabase
      .from('users')
      .select('id, badge')
      .eq('plan_status', 'active')
      .lte('plan_ends_at', nowIso);

    if (usersError) throw usersError;

    const userIds = (expiredUsers || []).map((row) => row.id).filter(Boolean);
    if (userIds.length > 0) {
      await supabase
        .from('users')
        .update({
          plan: 'free',
          plan_status: 'inactive',
          is_monetized: false,
          updated_at: nowIso
        })
        .in('id', userIds);

      const badgeIds = (expiredUsers || [])
        .filter((row) => shouldClearBadge(row.badge))
        .map((row) => row.id)
        .filter(Boolean);
      if (badgeIds.length > 0) {
        await supabase
          .from('users')
          .update({ badge: null, updated_at: nowIso })
          .in('id', badgeIds);
      }
    }
  } catch (error) {
    console.error('Subscription expiry sweep error:', error);
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
  walletId
}) {
  const paymentId = transactionRefId ? `maishapay_${transactionRefId}` : null;
  const normalizedPlan = String(plan || '').toLowerCase();
  const badgeForPlan = normalizedPlan === 'pro' ? 'verified_gold' : 'verified';

  if (paymentId) {
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('payapay_payment_id', paymentId)
      .maybeSingle();
    if (existing?.id) {
      return;
    }
  }

  const now = new Date();
  const periodEnd = billingCycle === 'annual' ? addMonths(now, 12) : addMonths(now, 1);

  let badgeToApply = badgeForPlan;
  try {
    const { data: profile } = await supabase
      .from('users')
      .select('badge')
      .eq('id', userId)
      .maybeSingle();
    const existingBadge = String(profile?.badge || '').toLowerCase();
    const protectedBadges = new Set(['staff', 'team', 'community', 'company', 'enterprise', 'ambassador']);
    if (protectedBadges.has(existingBadge)) {
      badgeToApply = profile?.badge || badgeForPlan;
    }
  } catch (e) {
    // Ignore profile read errors; continue with default badge
  }

  await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      payapay_subscription_id: paymentId
    });

  await supabase
    .from('users')
    .update({
      plan,
      plan_status: 'active',
      plan_ends_at: periodEnd.toISOString(),
      badge: badgeToApply
    })
    .eq('id', userId);

  await supabase
    .from('transactions')
    .insert({
      from_user_id: userId,
      to_user_id: userId,
      type: 'subscription',
      amount_gross: amount,
      amount_net_creator: 0,
      amount_commission_xera: 0,
      currency,
      payapay_payment_id: paymentId,
      status: 'succeeded',
      description: `Abonnement ${plan} (${billingCycle})`,
      metadata: {
        method,
        provider,
        wallet_id: walletId,
        operator_ref_id: operatorRefId
      }
    });
}

function supportsPush() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

function sanitizeTimeZone(value) {
  const fallback = 'UTC';
  if (!value || typeof value !== 'string') return fallback;
  try {
    Intl.DateTimeFormat('fr-FR', { timeZone: value }).format(new Date());
    return value;
  } catch (e) {
    return fallback;
  }
}

function isMissingColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('column') && message.includes('does not exist');
}

function getTimePartsInZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || '';
  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  const hour = parseInt(pick('hour'), 10);
  const minute = parseInt(pick('minute'), 10);
  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute
  };
}

function resolveReminderSlot(now, timeZone) {
  if (REMINDER_HOURS.length === 0) return null;
  const parts = getTimePartsInZone(now, timeZone);
  if (!Number.isFinite(parts.hour) || !Number.isFinite(parts.minute)) return null;
  const slotHour = REMINDER_HOURS.find((h) => h === parts.hour);
  if (slotHour === undefined) return null;
  if (parts.minute < 0 || parts.minute >= REMINDER_WINDOW_MIN) return null;
  return { hour: slotHour, dateKey: parts.dateKey };
}

// ==================== MAISHAPAY CHECKOUT ====================

app.post('/api/maishapay/checkout', async (req, res) => {
  try {
    if (!MAISHAPAY_PUBLIC_KEY || !MAISHAPAY_SECRET_KEY) {
      return res.status(500).send('MaishaPay keys not configured');
    }

    const {
      plan,
      billing_cycle: billingCycleRaw,
      currency: currencyRaw,
      method = 'card',
      provider,
      wallet_id: walletId,
      access_token: accessToken,
      user_id: fallbackUserId
    } = req.body || {};

    const planId = String(plan || '').toLowerCase();
    const billingCycle = String(billingCycleRaw || 'monthly').toLowerCase() === 'annual' ? 'annual' : 'monthly';
    const currency = String(currencyRaw || 'USD').toUpperCase();
    const allowedCurrencies = new Set(['USD', 'CDF']);

    if (!MAISHAPAY_PLANS[planId]) {
      return res.status(400).send('Plan invalide');
    }
    if (!allowedCurrencies.has(currency)) {
      return res.status(400).send('Devise invalide');
    }

    const userId = await resolveUserId(accessToken, fallbackUserId);
    if (!userId) {
      return res.status(401).send('Utilisateur non authentifié');
    }

    const amount = computeMaishaPayAmount(planId, billingCycle);
    if (!amount) {
      return res.status(400).send('Montant invalide');
    }

    const statePayload = {
      user_id: userId,
      plan: planId,
      billing_cycle: billingCycle,
      currency,
      amount,
      method: String(method || 'card').toLowerCase(),
      provider: provider || null,
      wallet_id: walletId || null,
      issued_at: Date.now(),
      expires_at: Date.now() + 2 * 60 * 60 * 1000
    };
    const state = createSignedState(statePayload);
    if (!state) {
      return res.status(500).send('Callback secret manquant');
    }

    const callbackUrl = `${PRIMARY_ORIGIN}/api/maishapay/callback?state=${encodeURIComponent(state)}`;

    res.set('Content-Type', 'text/html');
    res.send(`
      <!doctype html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Redirection MaishaPay</title>
      </head>
      <body>
        <p>Redirection vers MaishaPay...</p>
        <form id="mpForm" action="${MAISHAPAY_CHECKOUT_URL}" method="POST">
          <input type="hidden" name="gatewayMode" value="${MAISHAPAY_GATEWAY_MODE}">
          <input type="hidden" name="publicApiKey" value="${MAISHAPAY_PUBLIC_KEY}">
          <input type="hidden" name="secretApiKey" value="${MAISHAPAY_SECRET_KEY}">
          <input type="hidden" name="montant" value="${amount}">
          <input type="hidden" name="devise" value="${currency}">
          <input type="hidden" name="callbackUrl" value="${callbackUrl}">
        </form>
        <script>
          document.getElementById('mpForm').submit();
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('MaishaPay checkout error:', error);
    res.status(500).send('Erreur MaishaPay');
  }
});

app.all('/api/maishapay/callback', async (req, res) => {
  try {
    const params = { ...req.query, ...req.body };
    const status = params.status ?? params.statusCode ?? '';
    const description = params.description || '';
    const transactionRefId = params.transactionRefId || params.transaction_ref_id;
    const operatorRefId = params.operatorRefId || params.operator_ref_id;
    const state = params.state;

    const payload = verifySignedState(state);
    if (!payload) {
      return res.status(400).send('Callback invalide');
    }

    const isSuccess = String(status) === '202' || String(status).toLowerCase() === 'success';

    if (isSuccess) {
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
        walletId: payload.wallet_id
      });
    }

    res.set('Content-Type', 'text/html');
    res.send(`
      <!doctype html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Paiement ${isSuccess ? 'réussi' : 'échoué'}</title>
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
          <div class="status">${isSuccess ? 'Paiement confirmé' : 'Paiement non confirmé'}</div>
          <div class="desc">${description || (isSuccess ? 'Votre abonnement est activé.' : 'Veuillez réessayer ou changer de moyen de paiement.')}</div>
          <a href="${PRIMARY_ORIGIN}/profile.html">Retour au profil</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('MaishaPay callback error:', error);
    res.status(500).send('Erreur callback');
  }
});

// ==================== ADMIN: OFFER PLAN ====================

app.post('/api/admin/gift-plan', async (req, res) => {
  try {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Token manquant.' });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user?.id) {
      return res.status(401).json({ error: 'Utilisateur non authentifié.' });
    }
    if (authData.user.id !== SUPER_ADMIN_ID) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }

    const { target_user_id: targetUserId, plan } = req.body || {};
    const normalizedPlan = String(plan || '').toLowerCase();
    if (!targetUserId) {
      return res.status(400).json({ error: 'Utilisateur cible manquant.' });
    }
    if (!['standard', 'medium', 'pro'].includes(normalizedPlan)) {
      return res.status(400).json({ error: 'Plan invalide.' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('badge, followers_count')
      .eq('id', targetUserId)
      .maybeSingle();

    if (profileError) {
      return res.status(500).json({ error: profileError.message || 'Impossible de charger le profil.' });
    }
    if (!profile) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const badgeForPlan = normalizedPlan === 'pro' ? 'verified_gold' : 'verified';
    const existingBadge = String(profile.badge || '').toLowerCase();
    const badgeToApply = PROTECTED_BADGES.has(existingBadge)
      ? profile.badge
      : badgeForPlan;
    const followersCount = Number(profile.followers_count || 0);
    const isMonetized =
      (normalizedPlan === 'medium' || normalizedPlan === 'pro') &&
      followersCount >= 1000;

    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update({
        plan: normalizedPlan,
        plan_status: 'active',
        plan_ends_at: null,
        badge: badgeToApply,
        is_monetized: isMonetized,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Mise à jour impossible.' });
    }

    return res.json({ success: true, user: updated });
  } catch (error) {
    console.error('Admin gift plan error:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ==================== FONCTIONS UTILITAIRES ====================

// ==================== API PUBLIQUES MONETIZATION ====================

// Récupérer les revenus d'un créateur
app.get('/api/creator-revenue/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = 'all' } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case '7':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = null;
    }
    
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('to_user_id', userId)
      .eq('status', 'succeeded');
    
    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    
    const { data: transactions, error } = await query;
    
    if (error) {
      console.error('Error fetching revenue:', error);
      return res.status(500).json({ error: 'Failed to fetch revenue' });
    }
    
    // Calculer les totaux
    const summary = {
      totalGross: 0,
      totalNet: 0,
      totalCommission: 0,
      supportRevenue: 0,
      videoRevenue: 0,
      transactionCount: transactions ? transactions.length : 0
    };
    
    if (transactions) {
      transactions.forEach(tx => {
        const gross = parseFloat(tx.amount_gross || 0);
        const net = parseFloat(tx.amount_net_creator || 0);
        const commission = parseFloat(tx.amount_commission_xera || 0);
        
        summary.totalGross += gross;
        summary.totalNet += net;
        summary.totalCommission += commission;
        
        if (tx.type === 'support') {
          summary.supportRevenue += net;
        } else if (tx.type === 'video_rpm') {
          summary.videoRevenue += net;
        }
      });
    }
    
    res.json({ success: true, data: summary });
    
  } catch (error) {
    console.error('Error fetching creator revenue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== API EXISTANTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ... (le reste du code existant pour les rappels, etc.)

if (SUBSCRIPTION_SWEEP_MS > 0) {
  sweepExpiredSubscriptions();
  setInterval(sweepExpiredSubscriptions, SUBSCRIPTION_SWEEP_MS);
}

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API endpoints available at /api/*`);
});

module.exports = app;
