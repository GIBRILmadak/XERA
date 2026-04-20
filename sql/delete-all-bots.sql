-- Script SQL pour supprimer TOUS les bots de la DB
-- Utilisation: psql -d URL_SUPABASE -f delete-all-bots.sql

-- 1. Récupérer les user_ids des bots
-- 2. Supprimer le contenu associé
DELETE FROM content 
WHERE user_id IN (SELECT user_id FROM bots);

-- 3. Supprimer de la table bots
DELETE FROM bots;

-- 4. Supprimer les utilisateurs bots
DELETE FROM users 
WHERE is_bot = true;

-- 5. Reset le compteur
INSERT INTO bot_control (key, value) VALUES ('bots.active_count', '{"count":0}')
ON CONFLICT (key) DO UPDATE SET value = '{"count":0}';

-- Vérifier
SELECT COUNT(*) as bots_restants FROM bots;
SELECT COUNT(*) as users_bots_restants FROM users WHERE is_bot = true;