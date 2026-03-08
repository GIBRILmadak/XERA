Rize Backend (paiements désactivés)

Setup
- Copier .env.example en .env
- Renseigner SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
- Ajuster APP_BASE_URL (domaines front autorisés)

Run
- npm install
- npm run api

Endpoints actifs
- GET /api/health : indique que les paiements sont désactivés
- POST /api/users/upsert : crée/met à jour un utilisateur (id, email, paypal_email)
- POST /api/push/subscribe : enregistre un abonnement Web Push
  - body minimal: `{ userId, subscription }`
  - body recommandé: `{ userId, subscription, timezone, reminderEnabled }`

Note
- Toute la logique PayPal a été retirée. On réintroduira Stripe plus tard.

Notifications push (nouvelle infra)
- Générer des clés VAPID : `npx web-push generate-vapid-keys`
- Dans `.env`, ajouter :
  - VAPID_PUBLIC_KEY=<clé_publique>
  - VAPID_PRIVATE_KEY=<clé_privée>
  - PUSH_CONTACT_EMAIL=mailto:votre_email (optionnel)
- Exécuter le SQL `sql/push-subscriptions.sql` sur la base Supabase pour créer la table `push_subscriptions`.
- Démarrer l'API (`npm run api`) : le backend s'abonne en temps réel à `public.notifications` et envoie un push à chaque insertion.

Rappels programmés (10h / 18h)
- Le backend envoie aussi des push de rappel à 10h et 18h (heure locale de l'utilisateur via timezone du navigateur).
- Variables d'environnement optionnelles:
  - `RETURN_REMINDER_HOURS=10,18`
  - `RETURN_REMINDER_WINDOW_MINUTES=15` (fenêtre d'envoi après l'heure cible)
  - `RETURN_REMINDER_SWEEP_MS=60000` (fréquence de scan des abonnements)
