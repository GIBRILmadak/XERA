# Backend XERA (Migration Vercel)

Le backend Node.js autonome (Render) a été supprimé au profit de **Vercel Serverless Functions**.

La logique backend doit être migrée dans le dossier `/api` à la racine du projet.
Les fichiers dans ce dossier `server/` sont conservés à titre d'archive ou doivent être supprimés si la migration est complète.

Vercel détectera automatiquement les fonctions dans `/api` et les servira sous le même domaine que le frontend.
