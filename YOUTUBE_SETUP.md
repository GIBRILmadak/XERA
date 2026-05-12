# Configuration du Système Anti-Cold Start YouTube

## ✅ État d'Intégration

Tous les fichiers ont été créés et intégrés dans le serveur :

### Fichiers Créés

- ✅ `/server/youtube-api-service.js` - Service API YouTube avec collecte de hashtags & scoring
- ✅ `/api/youtube/routes.js` - 6 endpoints API RESTful
- ✅ `/sql/youtube-shorts-schema.sql` - Schéma de base de données complet
- ✅ `/js/youtube-shorts-feed.js` - Composant frontend vanilla JavaScript
- ✅ `/youtube-demo.html` - Page de démonstration complète
- ✅ `/server/monetization-server.js` - Intégration middleware et routes

---

## 🔧 Étape 1 : Configuration Environnement

### Ajouter la clé API YouTube à `.env`

```bash
# Dans la racine du projet, éditer ou créer .env
YOUTUBE_API_KEY=AIzaSy... # Obtenir depuis Google Cloud Console
```

**Comment obtenir la clé :**

1. Aller sur [Google Cloud Console](https://console.cloud.google.com)
2. Créer un nouveau projet
3. Activer l'API YouTube Data v3
4. Créer une clé d'API (Application Servers)
5. Copier la clé et l'ajouter à `.env`

### Vérifier les Variables Supabase

Vérifier que ces variables existent dans `.env` :

```bash
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

---

## 📊 Étape 2 : Migration Base de Données

### Exécuter le schéma SQL

1. Ouvrir [Supabase SQL Editor](https://app.supabase.com/project/_/sql)
2. Créer une nouvelle requête
3. Copier tout le contenu de `/sql/youtube-shorts-schema.sql`
4. Exécuter (Ctrl+Enter ou clic "Run")
5. Vérifier que les tables ont été créées :
    - `youtube_shorts` (table principale)
    - `youtube_shorts_audit` (historique)
    - Vue `youtube_shorts_analytics`

**Résultat attendu :**

```
Tables created successfully:
- youtube_shorts (21 columns, 6 indexes)
- youtube_shorts_audit
- youtube_shorts_analytics view

RLS policies applied:
- Public SELECT of active videos
- Admin INSERT/UPDATE/DELETE
- Triggers for audit trail
```

---

## 🚀 Étape 3 : Démarrage du Serveur

### En Local (Mode Développement)

```bash
# Terminal 1 : Démarrer le serveur Node.js
cd /home/g/Bureau/XERA
npm install  # Si dépendances manquantes
node server/monetization-server.js

# Résultat attendu :
# Server running on port 5050
# YouTube API routes registered at /api/youtube/*
# MaishaPay configuration summary: {...}
```

### Vérifier le Serveur

```bash
# Terminal 2 : Tester la santé du serveur
curl http://localhost:5050/health
# Réponse : {"status":"ok","timestamp":"2024-01-15T10:30:00Z"}

# Tester les stats YouTube (avant chargement)
curl http://localhost:5050/api/youtube/stats
# Réponse : {"success":true,"stats":{"total_videos":0,"avg_quality_score":0,...}}
```

---

## 📥 Étape 4 : Charger des Vidéos YouTube

### Première Collecte (Batch)

```bash
# Démarrer une collecte de 50 vidéos (5 batches × 10 recherches)
curl http://localhost:5050/api/youtube/fetch-batch?batchCount=5&order=relevance

# Réponse attendue (prend ~30-60 secondes) :
# {
#   "success": true,
#   "fetchedVideos": 45,
#   "storedVideos": 45,
#   "duplicates": 0,
#   "quality_scores": {"avg": 8.7, "min": 6.2, "max": 9.8},
#   "quotaUsed": 500
# }
```

### Vérifier les Vidéos Stockées

```bash
# Récupérer les 20 meilleures vidéos
curl "http://localhost:5050/api/youtube/videos?limit=20&offset=0&sort=quality_score"

# Réponse attendue :
# {
#   "success": true,
#   "videos": [
#     {
#       "id": "uuid-xxx",
#       "youtube_video_id": "dQw4w9WgXcQ",
#       "title": "Building in Public: My SaaS Journey",
#       "channel_title": "Creator Name",
#       "view_count": 125000,
#       "like_count": 5200,
#       "quality_score": 9.5,
#       "thumbnail_url": "https://i.ytimg.com/vi/..."
#     },
#     ...
#   ],
#   "total": 45
# }
```

---

## 🎨 Étape 5 : Tester le Frontend

### Page de Démonstration

```bash
# Ouvrir dans le navigateur :
http://localhost:3000/youtube-demo.html

# Ou en déploiement :
https://votresite.vercel.app/youtube-demo.html
```

**Fonctionnalités à tester :**

- [ ] **Carrousel**: Les vidéos s'affichent en grille
- [ ] **Lazy Loading**: Les images se chargent au défilement
- [ ] **Infinite Scroll**: "Charger plus" déclenche nouvelles vidéos
- [ ] **Statistiques**: L'onglet "Stats" affiche les totaux
- [ ] **Bouton Rafraîchir**: Charge un nouveau batch depuis l'API

### Test de Clic

```bash
# Cliquer sur une vidéo dans le feed
# → S'ouvre dans un nouvel onglet YouTube
# → L'événement "view" est enregistré

# Vérifier le tracking :
curl "http://localhost:5050/api/youtube/video/dQw4w9WgXcQ"
# Réponse : {"view_count": 1, "like_count": 0, "comment_count": 0}
```

---

## 🔄 Étape 6 : Intégration avec Cron (Optionnel)

### Charger les Vidéos Automatiquement

**Pour Vercel :**

Ajouter à `vercel.json` :

```json
{
    "crons": [
        {
            "path": "/api/youtube/fetch-batch?batchCount=3",
            "schedule": "0 9 * * *"
        }
    ]
}
```

**Pour une autre plateforme :**

```bash
# Créer un fichier cron personnalisé
# Appeler chaque jour à 9h UTC :
curl -X GET "https://votreapi.com/api/youtube/fetch-batch?batchCount=3" \
  -H "X-Cron-Secret: $CRON_SECRET"
```

---

## 📊 Endpoints API - Référence Rapide

### Vidéos

| Endpoint                   | Méthode | Description                              |
| -------------------------- | ------- | ---------------------------------------- |
| `/api/youtube/fetch-batch` | GET     | Récupère et stocke un batch de vidéos    |
| `/api/youtube/videos`      | GET     | Liste les vidéos (paginé, trié)          |
| `/api/youtube/video/:id`   | GET     | Détail d'une vidéo unique                |
| `/api/youtube/video/track` | POST    | Enregistre une vue/like/commentaire      |
| `/api/youtube/stats`       | GET     | Statistiques globales (total, avg score) |
| `/api/youtube/video/:id`   | DELETE  | Désactiver une vidéo (soft delete)       |

### Paramètres

**GET /api/youtube/videos :**

```
?limit=20        # Nombre de vidéos (défaut: 20)
&offset=0        # Décalage pour pagination
&sort=quality_score|view_count|published_at  # Tri (défaut: quality_score)
```

**GET /api/youtube/fetch-batch :**

```
?batchCount=5    # Nombre de batches (défaut: 5)
&order=relevance|viewCount  # Tri recherche (défaut: relevance)
```

---

## 🛡️ Contrôle du Quota YouTube

### Quota Quotidien

- **Limite** : 10 000 unités/jour
- **Coût par recherche** : 100 unités
- **Coût par détail vidéo** : 1 unité

### Stratégie Optimale

```
1 fetch-batch (5 batches) = 500 unités → ~45 vidéos
→ Permet 20 batches par jour (9 000 unités)
→ Environ 900 vidéos/jour en production
```

**Vérifier l'utilisation :**

```bash
curl http://localhost:5050/api/youtube/stats
# Réponse : {..., "quota_used": 500, "quota_available": 9500}
```

---

## ⚠️ Dépannage

### "Supabase client not available"

```
Solution: Vérifier que le middleware est enregistré dans monetization-server.js
Ligne: app.use((req, res, next) => { req.supabase = supabase; next(); });
```

### "YOUTUBE_API_KEY is missing"

```
Solution: Ajouter à .env dans la racine du projet
YOUTUBE_API_KEY=AIzaSy...
```

### "YouTube API routes not available"

```
Solution: Vérifier que /api/youtube/routes.js existe
Chemin correct: /api/youtube/routes.js
Depuis monetization-server.js: require('./api/youtube/routes')
```

### "youtube_shorts table does not exist"

```
Solution: Exécuter le schéma SQL dans Supabase SQL Editor
Fichier: sql/youtube-shorts-schema.sql
```

### Aucune vidéo retournée après fetch

```
Possible causes:
1. YOUTUBE_API_KEY invalide
2. API YouTube non activée dans Google Cloud
3. Quota dépassé (vérifier avec /api/youtube/stats)
4. Requête filtrée par langage (ajuster en.sql)

Vérifier les logs serveur pour les erreurs API
```

---

## 📈 Monitoring en Production

### Health Check

```bash
# Vérifie que le serveur répond
GET /health

# Réponse: {"status":"ok","timestamp":"..."}
```

### Stats YouTube

```bash
# Récupère les métriques du système
GET /api/youtube/stats

# Réponse:
{
  "success": true,
  "stats": {
    "total_videos": 542,
    "avg_quality_score": 8.3,
    "total_views": 2340000,
    "total_engagement": 185000,
    "quota_used": 2800,
    "quota_available": 7200
  }
}
```

### Logs Serveur

```bash
# Terminal avec node server/monetization-server.js
# Chercher les lignes :
# [API] Fetch-batch: 45 videos stored
# [API] Quality score avg: 8.7
# YouTube API routes registered
```

---

## 🚀 Déploiement

### Vercel (Recommandé)

```bash
# 1. Pousser le code
git add -A
git commit -m "Feat: YouTube anti-cold start system"
git push

# 2. Ajouter les env vars dans Vercel Dashboard:
#    Settings → Environment Variables
YOUTUBE_API_KEY=AIzaSy...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# 3. Redéployer
vercel --prod

# 4. Tester
curl https://votresite.vercel.app/api/youtube/stats
```

### Exécution Quotidienne

```bash
# Ajouter à vercel.json pour charger automatiquement :
"crons": [{
  "path": "/api/youtube/fetch-batch?batchCount=5",
  "schedule": "0 9 * * *"
}]
```

---

## 📝 Prochaines Étapes

1. **✅ Config** : Ajouter YOUTUBE_API_KEY à `.env`
2. **✅ DB** : Exécuter le schéma SQL dans Supabase
3. **✅ Serveur** : Démarrer `node server/monetization-server.js`
4. **✅ Test** : Appeler `GET /api/youtube/fetch-batch`
5. **✅ Frontend** : Ouvrir `youtube-demo.html` dans le navigateur
6. **⏳ Production** : Déployer sur Vercel avec env vars

---

## 📞 Support

Pour des questions ou problèmes :

- Vérifier les logs serveur
- Tester les endpoints avec `curl`
- Consulter la documentation dans `ANTI_COLD_START_YOUTUBE_API.md`
- Vérifier les variables d'environnement

**C'est prêt pour exécution ! 🚀**
