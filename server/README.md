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
- POST /api/users/upsert : crée/met à jour un utilisateur (id, email)
- POST /api/push/subscribe : enregistre un abonnement Web Push
    - body minimal: `{ userId, subscription }`
    - body recommandé: `{ userId, subscription, timezone, reminderEnabled }`

Note

- Toute la logique de paiement historique a été retirée. On réintroduira un provider plus tard.

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

Rappels email (optionnels)

- Exécuter `sql/email-reminders.sql` sur la base Supabase pour ajouter les préférences de rappel email.
- Endpoint utilisateur:
    - `POST /api/reminders/email/preferences`
    - headers: `Authorization: Bearer <access_token>`
    - body: `{ "userId": "<uuid>", "enabled": true, "timezone": "Africa/Lubumbashi" }`
- Variables d'environnement optionnelles:
    - `RETURN_REMINDER_EMAIL_ENABLED=1`
    - `RETURN_REMINDER_EMAIL_PROVIDER=resend` ou `webhook`
    - `RETURN_REMINDER_EMAIL_FROM="XERA <notif.xera@zohomail.com>"`
    - `RETURN_REMINDER_EMAIL_REPLY_TO=team@xera.app`
    - `RETURN_REMINDER_EMAIL_API_KEY=<cle API>` (si provider `resend`)
    - `RETURN_REMINDER_EMAIL_WEBHOOK_URL=https://...` (si provider `webhook`)
    - `RETURN_REMINDER_EMAIL_WEBHOOK_TOKEN=<token optionnel>`
- En `Vercel Hobby`, les crons `*/10 * * * *` ne sont pas acceptes. Utilisez un scheduler externe qui appelle:
    - `GET /api/cron/send-reminder-emails`
    - `GET /api/cron/sweep-subscriptions`
    - header recommande: `Authorization: Bearer <CRON_SECRET>`
- Si vous passez plus tard sur `Vercel Pro`, vous pouvez reintroduire des crons Vercel avec le meme `CRON_SECRET`.
- Campagnes email actuellement gerees:
    - rappel de post du jour avec lien direct vers l'ouverture du formulaire
    - reactivation apres 7 jours sans update
    - retour social quand des comptes suivis avancent pendant l'absence de l'utilisateur

Videos bots (optionnel)

- Pour que les bots recuperent des videos coherentes depuis internet, ajouter dans `.env`:
    - `BOT_VIDEO_PROVIDER=pexels`
    - `BOT_VIDEO_API_KEY=<cle API Pexels>`
    - `BOT_VIDEO_MAX_DURATION_SECONDS=30`
    - `BOT_VIDEO_SEARCH_TIMEOUT_MS=5000`
- Sans `BOT_VIDEO_API_KEY`, les bots retombent sur des images et ne tirent plus de videos locales.
