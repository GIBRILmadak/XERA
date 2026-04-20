-- Ajouter une colonne hashtags pour stocker les hashtags des posts
-- Cela permet à l'algorithme de reconnaître la nature des posts

ALTER TABLE content ADD COLUMN IF NOT EXISTS hashtags text[];

-- Index pour recherche rapide par hashtags
CREATE INDEX IF NOT EXISTS idx_content_hashtags ON content USING GIN(hashtags);

-- Mettre à jour les posts existants des bots avec les hashtags depuis description
-- (extraction basique des #hashtags)