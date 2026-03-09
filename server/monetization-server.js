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
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  PUSH_CONTACT_EMAIL = 'mailto:notifications@xera.app',
  RETURN_REMINDER_HOURS = '10,18',
  RETURN_REMINDER_WINDOW_MINUTES = '15',
  RETURN_REMINDER_SWEEP_MS = '60000',
  PAYAPAY_API_KEY,
  PAYAPAY_WEBHOOK_SECRET
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

// ==================== MONETIZATION WEBHOOKS ====================

// Vérifier la signature du webhook Payapay
function verifyPayapayWebhook(payload, signature) {
  if (!PAYAPAY_WEBHOOK_SECRET) {
    console.warn('PAYAPAY_WEBHOOK_SECRET not configured, skipping signature verification');
    return true;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', PAYAPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

// Webhook handler pour Payapay
app.post('/webhooks/payapay', async (req, res) => {
  try {
    const signature = req.headers['x-payapay-signature'];
    const payload = req.body;
    
    // Vérifier la signature
    if (!verifyPayapayWebhook(payload, signature)) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const { type, data } = payload;
    
    console.log('Payapay webhook received:', type);
    
    switch (type) {
      case 'payment.succeeded':
        await handlePaymentSucceeded(data);
        break;
      case 'payment.failed':
        await handlePaymentFailed(data);
        break;
      case 'payment.refunded':
        await handlePaymentRefunded(data);
        break;
      case 'subscription.created':
        await handleSubscriptionCreated(data);
        break;
      case 'subscription.updated':
        await handleSubscriptionUpdated(data);
        break;
      case 'subscription.canceled':
        await handleSubscriptionCanceled(data);
        break;
      case 'subscription.past_due':
        await handleSubscriptionPastDue(data);
        break;
      case 'payout.paid':
        await handlePayoutPaid(data);
        break;
      default:
        console.log('Unhandled webhook event:', type);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Paiement réussi
async function handlePaymentSucceeded(data) {
  const { payment_id, transaction_id, metadata } = data;
  
  try {
    // Mettre à jour la transaction
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'succeeded',
        payapay_payment_id: payment_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction_id);
    
    if (updateError) {
      console.error('Error updating transaction:', updateError);
    }
    
    // Récupérer la transaction pour envoyer une notification
    const { data: transaction } = await supabase
      .from('transactions')
      .select('*, to_user: to_user_id(id, name)')
      .eq('id', transaction_id)
      .single();
    
    if (transaction && supportsPush()) {
      // Envoyer une notification push au créateur
      await sendSupportNotification(transaction.to_user_id, {
        amount: transaction.amount_net_creator,
        supporterName: metadata?.supporter_name || 'Quelqu\'un'
      });
    }
    
    // Créer une notification dans l'app
    await createInAppNotification(transaction.to_user_id, {
      type: 'support_received',
      title: 'Nouveau soutien reçu !',
      message: `Vous avez reçu un soutien de ${formatCurrency(transaction.amount_net_creator)}`,
      data: { transaction_id }
    });
    
  } catch (error) {
    console.error('Error handling payment success:', error);
  }
}

// Paiement échoué
async function handlePaymentFailed(data) {
  const { payment_id, transaction_id, failure_message } = data;
  
  try {
    const { error } = await supabase
      .from('transactions')
      .update({
        status: 'failed',
        metadata: { failure_message },
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction_id);
    
    if (error) {
      console.error('Error updating failed transaction:', error);
    }
  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
}

// Paiement remboursé
async function handlePaymentRefunded(data) {
  const { payment_id, transaction_id } = data;
  
  try {
    const { error } = await supabase
      .from('transactions')
      .update({
        status: 'refunded',
        updated_at: new Date().toISOString()
      })
      .eq('payapay_payment_id', payment_id);
    
    if (error) {
      console.error('Error updating refunded transaction:', error);
    }
  } catch (error) {
    console.error('Error handling refund:', error);
  }
}

// Abonnement créé
async function handleSubscriptionCreated(data) {
  const { subscription_id, customer_id, plan_id, user_id, current_period_end } = data;
  
  try {
    // Déterminer le plan
    const planMap = {
      'PLAN_STANDARD': 'standard',
      'PLAN_MEDIUM': 'medium',
      'PLAN_PRO': 'pro'
    };
    
    const plan = planMap[plan_id] || 'standard';
    
    // Créer l'abonnement
    const { error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id,
        plan,
        status: 'active',
        payapay_subscription_id: subscription_id,
        payapay_customer_id: customer_id,
        current_period_end
      });
    
    if (subError) {
      console.error('Error creating subscription:', subError);
    }
    
    // Mettre à jour le profil utilisateur
    const { error: userError } = await supabase
      .from('users')
      .update({
        plan,
        plan_status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', user_id);
    
    if (userError) {
      console.error('Error updating user plan:', userError);
    }
    
    // Envoyer une notification de bienvenue
    await createInAppNotification(user_id, {
      type: 'subscription_activated',
      title: 'Bienvenue sur le plan ' + plan,
      message: 'Votre abonnement est maintenant actif. Profitez de vos nouvelles fonctionnalités !',
      data: { plan }
    });
    
  } catch (error) {
    console.error('Error handling subscription creation:', error);
  }
}

// Abonnement mis à jour
async function handleSubscriptionUpdated(data) {
  const { subscription_id, status, current_period_end } = data;
  
  try {
    const { error } = await supabase
      .from('subscriptions')
      .update({
        status,
        current_period_end,
        updated_at: new Date().toISOString()
      })
      .eq('payapay_subscription_id', subscription_id);
    
    if (error) {
      console.error('Error updating subscription:', error);
    }
    
    // Mettre à jour le statut de l'utilisateur
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('user_id, plan')
      .eq('payapay_subscription_id', subscription_id)
      .single();
    
    if (subscription) {
      await supabase
        .from('users')
        .update({
          plan_status: status,
          plan: status === 'active' ? subscription.plan : 'free',
          is_monetized: status === 'active' && ['medium', 'pro'].includes(subscription.plan)
        })
        .eq('id', subscription.user_id);
    }
    
  } catch (error) {
    console.error('Error handling subscription update:', error);
  }
}

// Abonnement annulé
async function handleSubscriptionCanceled(data) {
  const { subscription_id } = data;
  
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('payapay_subscription_id', subscription_id)
      .single();
    
    if (!subscription) return;
    
    // Mettre à jour l'abonnement
    await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('payapay_subscription_id', subscription_id);
    
    // Mettre à jour le profil utilisateur
    await supabase
      .from('users')
      .update({
        plan: 'free',
        plan_status: 'canceled',
        is_monetized: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.user_id);
    
    // Notification
    await createInAppNotification(subscription.user_id, {
      type: 'subscription_canceled',
      title: 'Abonnement annulé',
      message: 'Votre abonnement a été annulé. Les fonctionnalités premium seront désactivées à la fin de la période.',
      data: {}
    });
    
  } catch (error) {
    console.error('Error handling subscription cancel:', error);
  }
}

// Abonnement en retard de paiement
async function handleSubscriptionPastDue(data) {
  const { subscription_id } = data;
  
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('payapay_subscription_id', subscription_id)
      .single();
    
    if (subscription) {
      // Mettre à jour le statut
      await supabase
        .from('subscriptions')
        .update({
          status: 'past_due',
          updated_at: new Date().toISOString()
        })
        .eq('payapay_subscription_id', subscription_id);
      
      // Désactiver temporairement la monétisation
      await supabase
        .from('users')
        .update({
          plan_status: 'past_due',
          is_monetized: false
        })
        .eq('id', subscription.user_id);
      
      // Notification
      await createInAppNotification(subscription.user_id, {
        type: 'payment_failed',
        title: 'Problème de paiement',
        message: 'Nous n\'avons pas pu prélever votre abonnement. Veuillez mettre à jour votre moyen de paiement.',
        data: {}
      });
    }
    
  } catch (error) {
    console.error('Error handling past due:', error);
  }
}

// Paiement de revenus vidéo effectué
async function handlePayoutPaid(data) {
  const { payout_id, creator_id, period_month } = data;
  
  try {
    const { error } = await supabase
      .from('video_payouts')
      .update({
        status: 'paid',
        payapay_payout_id: payout_id,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('creator_id', creator_id)
      .eq('period_month', period_month);
    
    if (error) {
      console.error('Error updating payout:', error);
    }
    
    // Notification
    const { data: payout } = await supabase
      .from('video_payouts')
      .select('amount_net_creator')
      .eq('creator_id', creator_id)
      .eq('period_month', period_month)
      .single();
    
    if (payout) {
      await createInAppNotification(creator_id, {
        type: 'payout_paid',
        title: 'Paiement reçu !',
        message: `Vous avez reçu un paiement de ${formatCurrency(payout.amount_net_creator)} pour vos revenus vidéo.`,
        data: { payout_id, period_month }
      });
    }
    
  } catch (error) {
    console.error('Error handling payout:', error);
  }
}

// ==================== FONCTIONS UTILITAIRES ====================

// Envoyer une notification push
async function sendSupportNotification(userId, { amount, supporterName }) {
  try {
    // Récupérer les subscriptions push de l'utilisateur
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);
    
    if (!subscriptions || subscriptions.length === 0) return;
    
    const payload = JSON.stringify({
      title: 'Nouveau soutien reçu !',
      body: `${supporterName} vous a soutenu avec ${formatCurrency(amount)}`,
      icon: '/icons/logo.png',
      badge: '/icons/logo.png',
      tag: 'support-received',
      data: {
        url: '/creator-dashboard.html'
      }
    });
    
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, payload);
      } catch (error) {
        console.error('Error sending push notification:', error);
        // Si l'endpoint n'est plus valide, le supprimer
        if (error.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }
      }
    }
  } catch (error) {
    console.error('Error sending support notification:', error);
  }
}

// Créer une notification in-app
async function createInAppNotification(userId, { type, title, message, data }) {
  try {
    await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data,
        read: false
      });
  } catch (error) {
    console.error('Error creating in-app notification:', error);
  }
}

// Formater un montant
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

// ==================== API PUBLIQUES MONETIZATION ====================

// Créer une session de paiement pour un soutien
app.post('/api/create-support-session', async (req, res) => {
  try {
    const { from_user_id, to_user_id, amount, description } = req.body;
    
    // Vérifier les données
    if (!from_user_id || !to_user_id || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Vérifier que le créateur peut recevoir des soutiens
    const { data: creator, error: creatorError } = await supabase
      .from('users')
      .select('plan, plan_status, followers_count, is_monetized, payapay_account_id')
      .eq('id', to_user_id)
      .single();
    
    if (creatorError || !creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }
    
    const canReceive = creator.plan_status === 'active' &&
                       ['medium', 'pro'].includes(creator.plan) &&
                       (creator.followers_count || 0) >= 1000 &&
                       creator.is_monetized;
    
    if (!canReceive) {
      return res.status(400).json({ error: 'Creator cannot receive support' });
    }
    
    // Créer la transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        from_user_id,
        to_user_id,
        type: 'support',
        amount_gross: amount,
        status: 'pending',
        description,
        currency: 'USD'
      })
      .select()
      .single();
    
    if (txError) {
      console.error('Error creating transaction:', txError);
      return res.status(500).json({ error: 'Failed to create transaction' });
    }
    
    // Créer la session Payapay (simulation - à remplacer par l'API réelle)
    const sessionId = 'sess_' + crypto.randomUUID();
    const paymentUrl = `https://pay.payapay.com/session/${sessionId}?return_url=${encodeURIComponent(PRIMARY_ORIGIN + '/creator-dashboard.html')}`;
    
    // Mettre à jour la transaction avec l'ID Payapay
    await supabase
      .from('transactions')
      .update({
        payapay_payment_id: sessionId,
        metadata: { session_url: paymentUrl }
      })
      .eq('id', transaction.id);
    
    res.json({
      success: true,
      data: {
        transaction_id: transaction.id,
        session_id: sessionId,
        payment_url: paymentUrl
      }
    });
    
  } catch (error) {
    console.error('Error creating support session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Créer un abonnement
app.post('/api/create-subscription', async (req, res) => {
  try {
    const { user_id, plan_id } = req.body;
    
    if (!user_id || !plan_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const planMap = {
      'standard': 'PLAN_STANDARD',
      'medium': 'PLAN_MEDIUM',
      'pro': 'PLAN_PRO'
    };
    
    const payapayPlanId = planMap[plan_id];
    if (!payapayPlanId) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    // Créer le customer Payapay et l'abonnement (simulation)
    const customerId = 'cus_' + crypto.randomUUID().substring(0, 8);
    const subscriptionId = 'sub_' + crypto.randomUUID().substring(0, 8);
    const paymentUrl = `https://pay.payapay.com/subscribe/${subscriptionId}?plan=${payapayPlanId}&customer=${customerId}&return_url=${encodeURIComponent(PRIMARY_ORIGIN + '/subscription-plans.html?status=success&plan=' + plan_id)}&cancel_url=${encodeURIComponent(PRIMARY_ORIGIN + '/subscription-plans.html?status=canceled')}`;
    
    res.json({
      success: true,
      data: {
        customer_id: customerId,
        subscription_id: subscriptionId,
        payment_url: paymentUrl
      }
    });
    
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Monetization webhooks available at /webhooks/payapay`);
  console.log(`API endpoints available at /api/*`);
});

module.exports = app;
