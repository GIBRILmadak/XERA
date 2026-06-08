# 🎬 Système Anti-Cold Start : YouTube Data API v3

## Vue d'ensemble

Système complet d'intégration YouTube Data API v3 pour remplir dynamiquement le feed XERA avec du contenu YouTube Shorts hautement ciblé. Évite un feed vide au lancement en fetchant intelligemment depuis YouTube et en stockant les vidéos en base.

---

## Architecture

```
Frontend                  Backend                     YouTube API
┌─────────────────┐      ┌──────────────────┐       ┌──────────────┐
│ youtube-demo.   │      │ youtube-api-     │       │   YouTube    │
│ html +          │─────▶│ service.js       │─────▶│   Data API   │
│ youtube-shorts- │      │ + routes.js      │       │   v3         │
│ feed.js         │      │                  │       └──────────────┘
│                 │      │  - Search        │
│  Affichage      │      │  - Quality       │
│  fluide du      │      │  - Dedup         │
│  feed           │      │  - Format        │
│                 │◀─────│  - Rotate        │
└─────────────────┘      └──────────────────┘
                                │
                                │ Stockage
                                ▼
                         ┌──────────────────┐
                         │ Supabase         │
                         │ youtube_shorts   │
                         │ Table + RLS      │
                         └──────────────────┘
```

---

## Installation & Configuration

### 1️⃣ Clé API YouTube Data API v3

**Obtenir la clé:**

1. Aller sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créer un nouveau projet
3. Activer l'API: **YouTube Data API v3**
4. Créer une clé API (type "API Key")
5. Ajouter les restrictions: domaines autorisés

**Variable d'environnement:**

```bash
# .env ou Vercel Environment Variables
YOUTUBE_API_KEY=AIzaSy...
```

**Quota API:**

- 10,000 unités/jour (gratuit)
- 1 search = 100 unités
- = ~100 recherches/jour
- ✅ Suffisant pour ~100 vidéos différentes/jour

### 2️⃣ Migration Base de Données Supabase

Exécuter le script SQL dans Supabase:

```bash
# Dans Supabase SQL Editor, copier puis exécuter:
cat sql/youtube-shorts-schema.sql
```

**Crée:**

- Table `youtube_shorts`
- Indexes pour performance
- RLS (Row Level Security)
- Audit trail
- Vue analytics

### 3️⃣ Installer dépendances serveur

```bash
# npm
npm install node-fetch

# ou vérifier que vous avez:
npm list node-fetch
```

Le serveur Node.js utilise `node-fetch` pour les requêtes HTTP. ✓ Déjà dans `package.json`

### 4️⃣ Intégrer routes API

**Dans `server/monetization-server.js` (à la fin, avant l'export):**

```javascript
// ==================== YOUTUBE API ROUTES ====================
const youtubeRoutes = require("./api/youtube/routes");
const youtubeRoutes = require("./server/api/youtube/routes");

app.use("/api/youtube", youtubeRoutes);

// Middleware: injecter client Supabase dans req
app.use((req, res, next) => {
    req.supabase = supabase;
    next();
});

// Attach YouTube routes APRÈS le middleware
const YouTubeRoutes = require("./api/youtube/routes");
app.use("/api/youtube", YouTubeRoutes);

// ... rest of exports
module.exports = app;
```

---

## Endpoints API

### Fetch Batch de Vidéos

```bash
GET /api/youtube/fetch-batch?batchCount=5&order=relevance
```

**Paramètres:**

- `batchCount`: Nombre de batches (défaut: 5)
- `order`: `relevance` | `viewCount`

**Réponse:**

```json
{
    "success": true,
    "stored": 245,
    "total_found": 250,
    "quota_used": 500,
    "batches_completed": 5,
    "errors": []
}
```

**Quotas:**

- 5 batches × 100 unités = 500 unités
- = 5% du quota journalier

### Récupérer Vidéos du Feed

```bash
GET /api/youtube/videos?limit=20&offset=0&orderBy=quality_score
```

**Paramètres:**

- `limit`: 1-100 (défaut: 20)
- `offset`: Pagination
- `orderBy`: `quality_score` | `view_count` | `published_at`

**Réponse:**

```json
{
    "success": true,
    "videos": [
        {
            "youtube_video_id": "dQw4w9WgXcQ",
            "title": "Learn Python in 100 Seconds",
            "channel_title": "Fireship",
            "thumbnail_url": "https://...",
            "view_count": 5000000,
            "like_count": 50000,
            "comment_count": 5000,
            "quality_score": 8.5,
            "published_at": "2024-01-15T10:30:00Z"
        }
    ],
    "total": 245,
    "hasMore": true
}
```

### Obtenir Statistiques

```bash
GET /api/youtube/stats
```

**Réponse:**

```json
{
    "success": true,
    "stats": {
        "total_videos": 245,
        "avg_quality_score": 7.8,
        "total_views": 12500000,
        "total_engagement": 250000,
        "quota_used": 500,
        "quota_available": true
    }
}
```

### Tracker Événement

```bash
POST /api/youtube/video/track
Content-Type: application/json

{
  "videoId": "dQw4w9WgXcQ",
  "eventType": "view" | "like" | "comment"
}
```

---

## Niches Ciblées & Tags

Le système recherche automatiquement sur 50+ hashtags organisés par catégorie:

### 🏗️ Building Public

```
#buildinpublic #indiehacker #diy #solofounder #codinglife
```

### 💻 Général

```
#coding #programming #developer #tech
```

### 🎮 Indie & Projets

```
#indiedev #gamedev #indiegamedev #creativecoding
```

### 🚀 Technologies 2024

```
#python #javascript #ai #artificialintelligence #reactjs #webdev
```

### 📚 Apprentissage

```
#learncoding #codingchallenge #programmer #computerscience
```

### 🎬 Shorts Essentiels

```
#Shorts #YouTubeShorts #Viral #Trending #FYP
```

### 🇫🇷 Français

```
#informatique #programmation #développeur #devindé
#apprendreàcoder #bricolage #astucebricolage
```

**Total:** 70+ hashtags testés par rotation quotidienne

---

## Stratégie de Qualité

### Critères de Tri

1. **Ordre de recherche**: Alternance `relevance` / `viewCount`
2. **Exclusions**:
    - Titres avec: "humour", "prank", "funny"
    - Contenu non anglais (sauf FR optionnel)
    - Vidéos non-Shorts

### Scoring de Qualité

```
QualityScore = (
  EngagementScore(40%) +
  ViewPopularity(40%) +
  TitleQuality(20%)
)

EngagementScore = (likes + comments) / views × 100
ViewPopularity = log(views + 1) / 10
TitleQuality = 10 si 10 < length < 100, sinon 5
```

**Score:** 0-10 (plus haut = meilleur)

### Résultat

- ✅ Vidéos pertinentes et engageantes
- ✅ Pas de spam ou contenu vide
- ✅ Diversité de sources et créateurs

---

## Base de Données

### Table: `youtube_shorts`

```sql
Column              Type        Desc
─────────────────────────────────────────────────────
youtube_video_id    TEXT        ID YouTube (unique)
title               TEXT        Titre vidéo
description         TEXT        Description
thumbnail_url       TEXT        URL preview
channel_title       TEXT        Nom du créateur
channel_id          TEXT        ID du channel
published_at        TIMESTAMP   Date publication
view_count          INTEGER     Nombre de vues
like_count          INTEGER     Nombre de likes
comment_count       INTEGER     Nombre de commentaires
duration            TEXT        ISO 8601 (PT1M30S)
language            TEXT        Langue (en, fr)
quality_score       DECIMAL     Score de qualité (0-10)
is_active           BOOLEAN     Vidéo active?
fetched_at          TIMESTAMP   Quand fetchée
updated_at          TIMESTAMP   Dernière maj
created_at          TIMESTAMP   Création
```

### Indexes

- `quality_score DESC` - Tri par qualité
- `published_at DESC` - Vidéos récentes
- `view_count DESC` - Tendances
- `is_active` - Filtrage

### RLS Policies

- ✅ Public: Lire vidéos actives
- ✅ Authentifié: Tout lire
- ✅ Admin only: Insert/Update/Delete

---

## Frontend Integration

### 1. Charger le script

```html
<script src="/js/youtube-shorts-feed.js"></script>
```

### 2. Créer le container

```html
<div id="youtube-feed-container"></div>
```

### 3. Contrôler avec JavaScript

```javascript
// Accéder à l'instance
const feed = window.youTubeShortsFeed;

// Recharger le feed
feed.loadVideos(true);

// Ouvrir une vidéo
feed.openVideo(videoObject);

// Tracker un événement
feed.trackEvent(videoId, "view");

// Détruire
feed.destroy();
```

### Features Frontend

- ✅ Grid responsive (auto-fit)
- ✅ Lazy loading images
- ✅ Infinite scroll avec Intersection Observer
- ✅ Animations fluides (hover, transitions)
- ✅ Mobile-first design
- ✅ Indicateur loading
- ✅ Affichage vues/likes
- ✅ Durée vidéo au format `M:SS`

---

## Admin & Monitoring

### Dashboard Admin

Accès: `/admin.html`

**Fonctionnalités:**

- Voir les stats en temps réel
- Lancer un fetch batch manuel
- Visualiser les erreurs
- Gérer les vidéos inactives

### Endpoint Admin

```bash
GET /api/youtube/stats
```

**Output:**

```json
{
    "total_videos": 245,
    "avg_quality_score": 7.8,
    "total_views": 12500000,
    "total_engagement": 250000,
    "quota_used": 500,
    "quota_available": true
}
```

### Cron Job (Optionnel)

Pour refresh régulier (ex: tous les jours à 10h UTC):

```bash
# Vercel cron.json
{
  "crons": [{
    "path": "/api/youtube/fetch-batch?batchCount=3",
    "schedule": "0 10 * * *"
  }]
}
```

---

## Déploiement

### Variables d'Environnement

```env
# .env.local ou Vercel
YOUTUBE_API_KEY=AIzaSy...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### Vercel Deploy

```bash
# Push vers GitHub
git push origin main

# Vercel se déploie automatiquement
# Configurer variables env dans:
# Settings > Environment Variables
```

### Local Dev

```bash
# Installation
npm install

# Démarrer serveur
npm run api

# Ouvrir démo
# http://localhost:3000/youtube-demo.html
```

---

## Performance & Limites

### Quotas API YouTube

| Élément    | Limite        | Usage                 |
| ---------- | ------------- | --------------------- |
| Quota/jour | 10,000 unités | ✅ Non-commercial     |
| Par search | 100 unités    | ✅ ~100 requêtes/jour |
| Par minute | 100 requêtes  | ✅ Throttled          |
| Rate limit | 1 par 500ms   | ✅ Respecté           |

### Optimisations

1. **Deduplication**: Pas de doublons en base
2. **Batch fetching**: 5 recherches = 500 unités
3. **Caching**: 15min TTL pour découverte
4. **Pagination**: Chargement 20 vidéos par page
5. **Lazy loading**: Images en `loading="lazy"`
6. **Compression**: Images thumbnail optimisées

### Stockage Supabase

- `youtube_shorts`: ~200-300 vidéos
- Taille par vidéo: ~1KB
- Total: ~300KB (négligeable)

---

## Dépannage

### ❌ "Invalid API Key"

- Vérifier `YOUTUBE_API_KEY` en `.env`
- Vérifier que l'API est activée sur Google Cloud
- Vérifier les quotas YouTube

### ❌ "No videos found"

- Vérifier qu'au moins 1 hashtag fonctionne
- Vérifier la langue: `en` recommandé
- Essayer `order=viewCount` au lieu de `relevance`

### ❌ "Quota exceeded"

- Attendre 24h (quota quotidien)
- Réduire `batchCount`
- Utiliser `SUBSCRIPTION_SWEEP_MS=0` en dev

### ❌ Table `youtube_shorts` missing

- Exécuter `sql/youtube-shorts-schema.sql` dans Supabase
- Vérifier les permissions RLS

### ❌ CORS error

- Ajouter domaine à YouTube API Console
- Vérifier `CORS` dans `server/monetization-server.js`

---

## Architecture de Requête

### 1. Client demande vidéos

```
GET /api/youtube/videos?limit=20
```

### 2. Serveur fetch Supabase

```
SELECT * FROM youtube_shorts
WHERE is_active = true
ORDER BY quality_score DESC
LIMIT 20
```

### 3. Supabase RLS appliquée

```
✅ Public: can SELECT active videos
❌ Public: cannot INSERT/UPDATE/DELETE
✅ Admin: full access
```

### 4. Response JSON

```json
{
  "videos": [...],
  "total": 245,
  "hasMore": true
}
```

### 5. Frontend render

```javascript
// Créer une grid de cartes
// Lazy load images
// Setup infinite scroll
```

---

## Fichiers Créés

```
/home/g/Bureau/XERA/
├── server/
│   └── youtube-api-service.js       (Service YouTube API)
├── api/youtube/
│   └── routes.js                    (Endpoints API)
├── sql/
│   └── youtube-shorts-schema.sql    (Migrations DB)
├── js/
│   └── youtube-shorts-feed.js       (Component frontend)
└── youtube-demo.html                (Page démo)
```

---

## Prochaines Étapes

1. ✅ **Configuration API YouTube** → Clé API
2. ✅ **Migration Supabase** → Table + RLS
3. ✅ **Installation dépendances** → node-fetch
4. ✅ **Intégration serveur** → Routes API
5. ✅ **Tests API** → `curl` ou Postman
6. ✅ **Tests frontend** → `/youtube-demo.html`
7. ✅ **Déploiement** → Vercel + env vars
8. 📊 **Monitoring** → Stats endpoint
9. 🔄 **Automation** → Cron jobs
10. 🎯 **Optimisation** → User tracking

---

## Support & Ressources

- **YouTube API Docs**: https://developers.google.com/youtube/v3
- **Supabase Docs**: https://supabase.com/docs
- **Démonstration**: http://localhost:3000/youtube-demo.html

---

**Créé le:** 2024
**Dernière mise à jour:** Mai 2024
**Status:** ✅ Production-ready
