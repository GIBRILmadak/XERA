# ✅ YouTube Feed Integration - Checklist de Test & Déploiement

## Phase 1 : Préparation SQL (Supabase)

- [ ] **Accéder à Supabase**
    - Aller sur https://supabase.com → Projet XERA
    - Ouvrir l'éditeur SQL

- [ ] **Exécuter le schéma YouTube**
    - Copier le contenu de `sql/youtube-shorts-schema.sql`
    - Coller et exécuter dans Supabase SQL
    - Vérifier : Pas d'erreur

- [ ] **Vérifier les tables créées**

    ```sql
    SELECT table_name FROM information_schema.tables
    WHERE table_name LIKE 'youtube%';
    ```

    - Doit retourner : `youtube_shorts`, `youtube_user_preferences`

- [ ] **Vérifier les RLS policies**

    ```sql
    SELECT * FROM pg_policies WHERE tablename = 'youtube_user_preferences';
    ```

    - Doit retourner 3 policies (SELECT, UPDATE, INSERT)

- [ ] **Charger des vidéos YouTube**
    - Exécuter le serveur : `node server/monetization-server.js`
    - Attendre ~30-60s (l'API YouTube prend du temps)
    - Vérifier : `GET /api/youtube/stats` retourne count > 0

---

## Phase 2 : Vérification Backend

- [ ] **Endpoints API opérationnels**

    **Test 1** : Stats des vidéos

    ```bash
    curl http://localhost:5050/api/youtube/stats
    ```

    - ✅ Doit retourner `{ "success": true, "stats": {...} }`
    - ✅ `total_videos` > 0

    **Test 2** : Vidéos personnalisées

    ```bash
    curl "http://localhost:5050/api/youtube/feed/personalized?userId=test-user-1&limit=5"
    ```

    - ✅ Doit retourner `{ "success": true, "videos": [...] }`
    - ✅ Array de vidéos avec : `youtube_video_id`, `title`, `channel_title`, etc.

    **Test 3** : Préférences utilisateur (POST)

    ```bash
    curl -X POST http://localhost:5050/api/youtube/user-preferences \
      -H "Content-Type: application/json" \
      -d '{
        "userId": "test-user-1",
        "preferred_languages": ["en", "fr"],
        "min_quality_score": 7.0
      }'
    ```

    - ✅ Doit retourner `{ "success": true, "preferences": {...} }`

    **Test 4** : Récupérer les préférences (GET)

    ```bash
    curl "http://localhost:5050/api/youtube/user-preferences?userId=test-user-1"
    ```

    - ✅ Doit retourner les préférences sauvegardées

- [ ] **Logs serveur clean**
    - ✅ Pas d'erreur dans console serveur
    - ✅ Messages de log montrent chargement des vidéos

---

## Phase 3 : Frontend - Installation des Fichiers

- [ ] **Fichiers CSS ajoutés**
    - [ ] `/css/youtube-feed-integration.css` existe
    - [ ] Lien CSS ajouté à `index.html` : `<link rel="stylesheet" href="css/youtube-feed-integration.css">`

- [ ] **Fichiers JS ajoutés**
    - [ ] `/js/youtube-feed-integration.js` existe
    - [ ] Script ajouté à `index.html` : `<script src="js/youtube-feed-integration.js"></script>`

- [ ] **index.html valide**
    ```bash
    # Vérifier pas de doublon ou erreur de syntaxe
    grep -c 'youtube-feed-integration' index.html
    # Doit retourner : 2 (CSS + JS)
    ```

---

## Phase 4 : Test Frontend - Discover Page

**Conditions préalables** :

- ✅ Serveur XERA running (http://localhost:3000)
- ✅ Authentifié (login réussi)
- ✅ Base de données remplie avec vidéos YouTube

### Test 1 : Les vidéos apparaissent

- [ ] Ouvrir la page Discover (http://localhost:3000#/discover)
- [ ] **Attendre 2-3 secondes** pour que les vidéos se chargent
- [ ] ✅ Voir des **cartes vidéo YouTube** mélangées avec les posts utilisateurs
- [ ] ✅ Les cartes YouTube ont une **apparence différente** (thumbnail, badge orange)

### Test 2 : Design & Layout

- [ ] **Vérifier l'apparence de chaque carte YouTube** :
    - ✅ Thumbnail image chargée
    - ✅ Badge "▶ YouTube" orange en haut à gauche
    - ✅ Titre de la vidéo visible en bas
    - ✅ Nom du créateur visible sous le titre
    - ✅ Stats (👁 vues, ❤ likes, ⭐ quality score)

- [ ] **Distribution varié** :
    - ✅ Pas toutes les vidéos YouTube à la suite
    - ✅ Mixte : user post → user post → user post → **YouTube** → user post...
    - ✅ Environ 1 vidéo YouTube tous les 3-4 posts

### Test 3 : Interactions

- [ ] **Hover sur une carte YouTube** :
    - ✅ Carte s'élève légèrement
    - ✅ Ombre s'intensifie
    - ✅ Image zoom légèrement
    - ✅ Curseur devient pointer

- [ ] **Clic sur une carte YouTube** :
    - ✅ Ouvre YouTube.com dans un nouvel onglet
    - ✅ L'URL de la vidéo est correcte (`youtube.com/watch?v=...`)
    - ✅ View tracking envoyé au backend (check API logs)

### Test 4 : Mobile Responsive

- [ ] **Ouvrir DevTools** (F12) → Mode responsive
    - [ ] **iPhone 12** (390x844)
        - ✅ Cartes visibles
        - ✅ Texte lisible
        - ✅ Badge YouTube visible
        - ✅ Pas de débordement

    - [ ] **iPad** (768x1024)
        - ✅ Cartes bien espacées
        - ✅ Layout responsive

    - [ ] **Desktop** (1920x1080)
        - ✅ Grille multi-colonnes maintenue
        - ✅ Cartes bien positionnées

### Test 5 : Console Browser (F12)

- [ ] **Pas d'erreurs JavaScript**
    - ✅ Console clean (pas de red errors)
    - ✅ Pas d'avertissements CORS

- [ ] **YouTubeFeedIntegration chargée**

    ```javascript
    // Taper dans la console (F12) :
    window.youtubeFeedIntegration;
    ```

    - ✅ Retourne l'objet de classe
    - ✅ Propriétés : `youtubeVideos`, `userPreferences`, `isLoading`

- [ ] **Vidéos chargées**
    ```javascript
    window.youtubeFeedIntegration.youtubeVideos.length;
    ```

    - ✅ Retourne nombre > 0

---

## Phase 5 : Préférences Utilisateur

- [ ] **Sauvegarder des préférences**
    - [ ] Dans les settings utilisateur (si UI existe), définir :
        - Langues : FR, EN
        - Qualité minimale : 7.0
    - [ ] Ou via API directement :
        ```bash
        curl -X POST http://localhost:5050/api/youtube/user-preferences \
          -H "Content-Type: application/json" \
          -d '{"userId":"your-user-id","preferred_languages":["fr"],"min_quality_score":8.0}'
        ```

- [ ] **Vérifier que les préférences sont appliquées**
    - [ ] Rafraîchir la page (`F5`)
    - [ ] ✅ Les nouvelles vidéos respectent les filtres
    - [ ] ✅ Pas de vidéos en langues non préférées
    - [ ] ✅ Pas de vidéos avec score < 8.0

---

## Phase 6 : Performance & Optimisations

- [ ] **Lazy Loading** fonctionne
    - ✅ Seules les 5 premières vidéos chargées initialement
    - ✅ Autres vidéos chargées au scroll

- [ ] **Pas d'impact performance**
    - [ ] Ouvrir DevTools → Performance tab
    - [ ] Rafraîchir la page
    - [ ] ✅ First Contentful Paint (FCP) < 2s
    - ✅ Largest Contentful Paint (LCP) < 3s
    - ✅ Aucun jank/stutter visible

- [ ] **Images optimisées**
    - ✅ Thumbnails chargent rapidement
    - ✅ Format compressé (JPG, pas PNG)
    - ✅ Lazy loading sur le scroll

---

## Phase 7 : Edge Cases

- [ ] **Pas de vidéos disponibles**
    - Vider la table `youtube_shorts`
    - Actualiser Discover
    - ✅ Pas de crash
    - ✅ Affiche gracefully : "Pas de vidéos"

- [ ] **Erreur API**
    - Arrêter le serveur Backend
    - Actualiser Discover
    - ✅ Pas de crash JavaScript
    - ✅ Message d'erreur dans la console (pas visible user)

- [ ] **Utilisateur non authentifié**
    - Se déconnecter
    - Rafraîchir
    - ✅ Pas de crash
    - ✅ Pas de révélation de données privées

- [ ] **Quota YouTube dépassé**
    - Regarder les logs API quotas
    - ✅ Le système arrête les nouveaux chargements gracefully
    - ✅ Les vidéos en cache continuent à afficher

---

## Phase 8 : Analytics & Monitoring

- [ ] **Vérifier le tracking des vues**

    ```sql
    SELECT COUNT(*), youtube_video_id FROM youtube_view_tracking
    GROUP BY youtube_video_id
    ORDER BY COUNT(*) DESC LIMIT 10;
    ```

    - ✅ Les vues sont enregistrées

- [ ] **Vérifier la qualité du contenu**
    ```sql
    SELECT title, quality_score, view_count
    FROM youtube_shorts
    ORDER BY quality_score DESC LIMIT 10;
    ```

    - ✅ Les meilleures vidéos ont des scores élevés

---

## Phase 9 : Nettoyage & Finalisation

- [ ] **Supprimer/archiver les fichiers obsolètes**
    - [ ] `youtube-demo.html` (maintenant inutile, moved to feed)
    - [ ] `js/youtube-shorts-feed.js` (ancien système, remplacé)
    - Git : `git rm youtube-demo.html js/youtube-shorts-feed.js`

- [ ] **Commit & Push**

    ```bash
    git add -A
    git commit -m "feat: YouTube feed integration complete - videos in main feed"
    git push origin main
    ```

- [ ] **Deployment Vercel**
    - ✅ Vercel redéploie automatiquement
    - ✅ Variables d'env inchangées
    - ✅ Test en production (même checklist que locale)

---

## Phase 10 : Documentation & Handoff

- [ ] **Documentation créée**
    - ✅ `YOUTUBE_FEED_INTEGRATION.md` rédigée
    - ✅ `YOUTUBE_FEED_INTEGRATION_DEPLOYMENT.md` (ce fichier)

- [ ] **Runbook pour support**
    - Comment résoudre les problèmes
    - Comment scaler (ajouter plus de vidéos)
    - Contact support si besoin

- [ ] **Logs & Monitoring configurés**
    - ✅ Dashboard Supabase monitoré
    - ✅ Quotas API YouTube trackés
    - ✅ Erreurs remontées à Sentry/LogRocket (si utilisé)

---

## 🎯 Résumé de Vérification

| Étape              | Statut | Notes                         |
| ------------------ | ------ | ----------------------------- |
| **SQL Schema**     | ⬜     | À exécuter en Supabase        |
| **API Endpoints**  | ⬜     | Tester avec curl/Postman      |
| **Frontend Files** | ⬜     | Vérifier CSS/JS présents      |
| **Discover Page**  | ⬜     | Les vidéos doivent apparaître |
| **Design/UX**      | ⬜     | Vérifier layout + animations  |
| **Mobile**         | ⬜     | Test sur responsive           |
| **Console**        | ⬜     | Pas d'erreurs                 |
| **Performance**    | ⬜     | Pas de jank                   |
| **Edge Cases**     | ⬜     | Erreurs graceful              |
| **Cleanup**        | ⬜     | Fichiers inutiles supprimés   |
| **Deployment**     | ⬜     | Push à Vercel                 |

---

## ⚠️ Problèmes Potentiels & Solutions

### ❌ Les vidéos n'apparaissent pas

**Debugger** :

1. Vérifier que `youtube_shorts` contient des vidéos :

    ```sql
    SELECT COUNT(*) FROM youtube_shorts;
    ```

    Si `0` → Charger les vidéos avec le script batch

2. Vérifier que les fichiers sont chargés :

    ```bash
    curl http://localhost:3000
    grep -o 'youtube-feed-integration' || echo "NOT FOUND"
    ```

3. Vérifier la console browser (F12) :
    ```javascript
    console.log(window.youtubeFeedIntegration);
    ```

### ❌ CSS ne se charge pas

**Solution** :

```bash
# Hard refresh (bypass cache)
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)

# Ou
# DevTools → Network → Disable cache → Refresh
```

### ❌ Erreur RLS dans Supabase

**Fix** :

```sql
-- Vérifier les policies
SELECT * FROM pg_policies
WHERE tablename = 'youtube_user_preferences';

-- Récréer si manquantes
-- (voir sql/youtube-shorts-schema.sql)
```

### ❌ API Rate limit dépassé

**Cause** : Trop de requêtes à l'API YouTube
**Solution** :

- Attendre 24h pour reset quota
- Augmenter la taille des batchs (moins de requêtes)
- Pré-charger les vidéos offline

---

## 📞 Support

Si vous rencontrez des problèmes, consulter :

1. Console browser (`F12`)
2. Logs serveur (`node monetization-server.js`)
3. Supabase logs (Table editor → youtube_shorts)
4. Documentation : `YOUTUBE_FEED_INTEGRATION.md`
