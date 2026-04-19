# Bots — configuration et déploiement

Ce document décrit les composants, variables d'environnement et étapes pour que le "Bots Manager" fonctionne correctement en local et sur Vercel/GitHub.

## Composants clés

- Schéma DB: `sql/create-bots-schema.sql` (table `bots`, `bot_control`, flag `is_bot` sur `users`).
- Backend (endpoints admin): `server/monetization-server.js` (`/api/admin/bots/*`).
- UI Admin: `js/admin-bots.js` (affiché dans `admin.html`).
- Worker local (optionnel): `server/bot-runner.js` (processus long-running pour dev/staging).
- Seed bots: `scripts/generate-bots.js`.
- Cron (CI): `.github/workflows/bots-cron.yml` (appelle `/api/admin/bots/run-now`).

## Variables d'environnement requises

- `SUPABASE_URL` — URL Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (nécessaire aux inserts/server-side)
- `SUPER_ADMIN_ID` — UUID du super-admin (accès admin UI)

Variables optionnelles / réglages bots:

- `CRON_SECRET` — secret partagé pour valider les appels cron (recommandé)
- `BOT_FOLLOW_DAILY_LIMIT` — par défaut `3`
- `BOT_MAX_FOLLOWS_PER_BOT` — par défaut `50`
- `BOT_MAX_ENCOURAGES_PER_RUN` — par défaut `200`
- `BOT_MAX_POSTS_PER_RUN` — par défaut `50`
- `BOT_RUN_ONCE_BATCH` — batch size pour l'endpoint `run-now` (par défaut `20`)

## Déploiement sur Vercel + GitHub Actions

1. Dans les Settings Vercel, définir les variables d'environnement listées ci‑dessus.
2. Dans le dépôt GitHub, ajouter un secret `BOTS_RUN_URL` avec la valeur:
   `https://<votre-app>.vercel.app/api/admin/bots/run-now`
3. Ajouter un secret `CRON_SECRET` (même valeur que `CRON_SECRET` sur Vercel). `.github/workflows/bots-cron.yml` utilise ces secrets pour appeler l'endpoint hourly.
4. `vercel.json` est déjà configuré pour réécrire `/api/:path*` vers le routeur backend (`api/router.js`).

Remarque: Vercel n'autorise pas de processus persistants sur l'offre serverless; le pattern ici est d'exposer un endpoint `POST /api/admin/bots/run-now` et d'utiliser un scheduler externe (GitHub Actions, cron service) pour l'appeler.

## Tests locaux

1. Démarrer l'API locale:

```bash
# depuis la racine du repo
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run api
```

2. Lancer le worker local (optionnel, utile pour dev):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node server/bot-runner.js
```

3. Générer des bots de test (staging/dev):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-bots.js 50
```

4. Tester l'endpoint run-now (avec secret si configuré):

```bash
curl -X POST "http://localhost:5050/api/admin/bots/run-now" -H "x-cron-secret: $CRON_SECRET" -d '{}'
```

## Utilisation de l'Admin UI

- Ouvrir `/admin` (ou `admin.html` en local). Le widget "Bots Manager" permet:
    - voir un échantillon des bots
    - définir le nombre de bots actifs (`Set active count`)
    - activer/désactiver un bot individuellement
    - forcer un `Run now` (exécute le même code que le cron)

## Checklist pré-push (assurez-vous de)

- Ajouter les variables d'environnement sur Vercel.
- Ajouter les secrets GitHub (`BOTS_RUN_URL`, `CRON_SECRET`).
- Vérifier `/api/health` après déploiement.
- Appeler manuellement `BOTS_RUN_URL` (avec header `x-cron-secret`) pour valider la réponse JSON.

## Dépannage rapide

- Erreur "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY": vérifier vos env vars.
- `Unauthorized cron request.`: vérifier `CRON_SECRET` et le header `x-cron-secret` envoyé par GitHub Actions.
- Si `run-now` retourne 500: vérifier les logs Vercel (fonctions serverless) et la connectivité Supabase.

Si tu veux, j'applique aussi quelques améliorations UI/CSS pour rendre le panneau plus lisible et accessible — dis‑moi si je dois procéder.
