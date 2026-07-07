-- Correction de la table content pour le Momentum Engine
ALTER TABLE content ADD COLUMN IF NOT EXISTS tags text[];

-- Ajout d'une protection pour le tutoriel (si vous souhaitez le désactiver manuellement)
-- Exécutez ceci dans votre console navigateur si le tutoriel persiste:
-- localStorage.setItem('xera-tutorial-completed', 'true');
-- localStorage.setItem('pro-page-onboarding-completed', 'true');
