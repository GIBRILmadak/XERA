-- Ajouter les colonnes manquantes pour le live streaming
-- Exécuter ce script dans Supabase SQL Editor

-- Ajouter la colonne is_private (pour les lives privés des créateurs Pro)
ALTER TABLE public.streaming_sessions 
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;

-- Ajouter la colonne quality (pour la qualité du stream: sd, hd)
ALTER TABLE public.streaming_sessions 
ADD COLUMN IF NOT EXISTS quality TEXT DEFAULT 'sd';

-- Vérifier que les colonnes ont été ajoutées
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'streaming_sessions' 
AND column_name IN ('is_private', 'quality');
