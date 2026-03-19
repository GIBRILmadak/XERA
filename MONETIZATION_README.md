# Monetization Implementation Summary

## Files Created

### 1. Database Schema

- `sql/monetization-schema.sql` - Tables et policies pour la monétisation

### 2. JavaScript Logic

- `js/monetization.js` - Fonctions principales de monétisation
- `js/monetization-ui.js` - Intégration UI (badges, boutons)
- `js/creator-dashboard.js` - Dashboard créateur
- `js/subscription-plans.js` - Page des plans

### 3. Pages

- `creator-dashboard.html` - Dashboard des revenus
- `subscription-plans.html` - Sélection des plans

### 4. Styles

- `css/monetization.css` - Styles complets de monétisation

### 5. Backend

- `/api` (Vercel Functions) - Remplace l'ancien serveur Render.
- La logique backend est désormais hébergée sur Vercel via des Serverless Functions.

## Tables Supabase Créées

1. **users** (mises à jour)
    - plan: free, standard, medium, pro
    - plan_status: inactive, active, past_due, canceled
    - is_monetized: boolean
    - followers_count: integer

2. **subscriptions**
    - Gestion des abonnements via MaishaPay

3. **transactions**
    - Soutiens et revenus (commission 20% calculée auto)

4. **video_views**
    - Tracking des vues pour monétisation

5. **video_payouts**
    - Paiements mensuels aux créateurs

6. **monetization_audit_logs**
    - Logs pour conformité

## Fonctionnalités Implémentées

### Palier Standard ($2.50/mois)

- Badge bleu vérifié
- Statut vérifié
- Pas de monétisation

### Palier Medium ($6.00/mois)

- Tout le Standard +
- Recevoir des soutiens (80% net)
- Transferts MaishaPay
- Nécessite 1000 abonnés

### Palier Pro ($10.00/mois)

- Tout le Medium +
- Monétisation vidéo ($0.40/1000 vues)
- Dashboard avancé
- Nécessite 1000 abonnés

## API Endpoints

- `POST /api/maishapay/checkout` - Démarrer un paiement d’abonnement
- `GET|POST /api/maishapay/callback` - Callback MaishaPay
- `GET /api/creator-revenue/:userId` - Revenus créateur
- `GET /api/admin/subscription-payments` - Liste des paiements d'abonnement en attente
- `POST /api/admin/subscription-payments/confirm` - Confirmer un encaissement MaishaPay et activer le palier
- `POST /api/admin/subscription-payments/fail` - Marquer une tentative comme non confirmée

## Intégration Frontend

### À ajouter dans les pages existantes:

1. **profile.html**

    ```html
    <script src="js/monetization.js"></script>
    <script src="js/monetization-ui.js"></script>
    ```

2. **Pour afficher un badge de plan:**

    ```javascript
    integrateMonetizationInProfile(profileElement, userData);
    ```

3. **Pour afficher un bouton de soutien:**
    ```javascript
    generateSupportButtonHTML(user, "profile");
    ```

## Configuration Requise

Variables d'environnement à ajouter:

```
MAISHAPAY_PUBLIC_KEY=your_public_key
MAISHAPAY_SECRET_KEY=your_secret_key
MAISHAPAY_CALLBACK_SECRET=your_callback_secret
MAISHAPAY_USE_CALLBACK=0
# Optionnel en local: 0 pour désactiver le sweep d'expiration des abonnements
SUBSCRIPTION_SWEEP_MS=0
```

Notes:

- `MAISHAPAY_USE_CALLBACK=0` desactive l'envoi du `callbackUrl` a MaishaPay.
- Passe a `1` uniquement quand tu as une URL HTTPS publique et stable pour `/api/maishapay/callback`.
- Avec `MAISHAPAY_USE_CALLBACK=0`, les tentatives de paiement sont enregistrees en attente puis confirmees depuis `admin.html` apres verification de l'encaissement sur le compte MaishaPay.
- Pour activer le portefeuille createur et les retraits Mobile Money, execute aussi `sql/monetization-wallet.sql` dans Supabase SQL Editor.
- Pour forcer la regle `video > 60 sec` dans les vues monetisees et recalculer les payouts video ouverts, execute aussi `sql/monetization-video-eligibility-fix.sql`.

## Nouvelles APIs portefeuille

- `GET /api/monetization/overview` : resume du portefeuille createur, methode de retrait et historique recent.
- `POST /api/monetization/payout-settings` : enregistre le compte Mobile Money de retrait.
- `POST /api/monetization/withdrawals` : cree une demande de retrait manuelle.
- `GET /api/admin/withdrawal-requests` : liste admin des demandes de retrait.
- `POST /api/admin/withdrawal-requests/status` : passe une demande en `processing`, `paid` ou `rejected`.

## Notes d'implémentation

- Commission XERA fixée à 20% sur toutes les transactions
- Calcul automatique via triggers SQL
- RLS activé sur toutes les tables sensibles
- Notifications push pour nouveaux soutiens
- Vérification des 1000 abonnés requise pour activation
- Les revenus video ne comptent que pour les contenus de plus de 60 secondes
- Le solde retirable correspond uniquement aux revenus deja credites et non deja retires
