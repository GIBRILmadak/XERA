/**
 * Script d'initialisation de la table followers
 * À exécuter une fois pour créer la table et les triggers
 *
 * Utilisation:
 * node setup-followers-table.js
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config(); // ou charger les variables d'environnement autrement

async function setupFollowersTable() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ Variables d'environnement manquantes:");
        console.error("   - SUPABASE_URL");
        console.error("   - SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY");
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🔄 Création de la table followers...\n");

    // SQL à exécuter
    const sql = `
        -- Table pour gérer les relations suivant/suivi entre utilisateurs
        CREATE TABLE IF NOT EXISTS followers (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(follower_id, following_id)
        );

        -- Index pour les performances
        CREATE INDEX IF NOT EXISTS idx_followers_follower_id ON followers(follower_id);
        CREATE INDEX IF NOT EXISTS idx_followers_following_id ON followers(following_id);
        CREATE INDEX IF NOT EXISTS idx_followers_created_at ON followers(created_at);

        -- Activer Row Level Security
        ALTER TABLE followers ENABLE ROW LEVEL SECURITY;

        -- RLS Policies

        -- Les suivis d'un utilisateur sont visibles par tous
        CREATE POLICY "Les followers sont visibles par tous" ON followers
            FOR SELECT USING (true);

        -- Les utilisateurs peuvent ajouter un suiveur
        CREATE POLICY "Les utilisateurs peuvent suivre d'autres" ON followers
            FOR INSERT WITH CHECK (auth.uid() = follower_id);

        -- Les utilisateurs peuvent supprimer un suiveur
        CREATE POLICY "Les utilisateurs peuvent se désabonner" ON followers
            FOR DELETE USING (auth.uid() = follower_id);

        -- Trigger pour mettre à jour le compteur de followers
        CREATE OR REPLACE FUNCTION update_followers_count()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE users SET followers_count = COALESCE(followers_count, 0) + 1 WHERE id = NEW.following_id;
                RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
                UPDATE users SET followers_count = GREATEST(COALESCE(followers_count, 0) - 1, 0) WHERE id = OLD.following_id;
                RETURN OLD;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;

        -- Créer le trigger
        DROP TRIGGER IF EXISTS followers_count_update ON followers;
        CREATE TRIGGER followers_count_update AFTER INSERT OR DELETE ON followers
            FOR EACH ROW EXECUTE FUNCTION update_followers_count();

        -- Ajouter la colonne followers_count s'il n'existe pas
        ALTER TABLE users ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
    `;

    try {
        // Exécuter le SQL via RPC
        const { error } = await supabase.rpc("exec", { sql });

        if (error) {
            // Essayer une autre approche - utiliser le client direct
            console.log("💡 Tentative alternative...\n");

            // Vérifier que la table existe
            const { data: tables, error: tableError } = await supabase
                .from("information_schema.tables")
                .select("table_name")
                .eq("table_name", "followers");

            if (tableError) {
                console.error("❌ Impossible de vérifier les tables");
                console.error("   Erreur:", tableError.message);
                console.log("\n⚠️  Solution manuelle requise:");
                console.log("   1. Allez à: https://app.supabase.com");
                console.log("   2. SQL Editor → New Query");
                console.log(
                    "   3. Copiez le contenu de: sql/create-followers-table.sql",
                );
                console.log("   4. Exécutez");
                process.exit(1);
            }

            if (tables && tables.length > 0) {
                console.log("✅ Table followers existe déjà");
            } else {
                throw new Error("Table followers non trouvée");
            }
        } else {
            console.log("✅ Table followers créée avec succès");
        }

        // Vérifier la colonne followers_count
        const { data: columns, error: columnsError } = await supabase
            .from("information_schema.columns")
            .select("column_name")
            .eq("table_name", "users")
            .eq("column_name", "followers_count");

        if (columnsError) {
            console.log(
                "ℹ️  Impossible de vérifier la colonne followers_count",
            );
        } else if (columns && columns.length > 0) {
            console.log("✅ Colonne followers_count existe");
        } else {
            console.warn(
                "⚠️  Colonne followers_count non trouvée - elle sera créée par le trigger",
            );
        }

        console.log("\n✨ Setup terminé avec succès!\n");
        console.log("🎉 Vous pouvez maintenant:");
        console.log("   1. Réactualiser votre application");
        console.log("   2. Tester de suivre un utilisateur");
        console.log("   3. Le compteur d'abonnés devrait augmenter");
    } catch (error) {
        console.error("❌ Erreur lors de la création:", error.message);
        console.log("\n⚠️  Solution manuelle requise:");
        console.log("   1. Allez à: https://app.supabase.com");
        console.log("   2. SQL Editor → New Query");
        console.log(
            "   3. Copiez le contenu de: sql/create-followers-table.sql",
        );
        console.log("   4. Exécutez");
        process.exit(1);
    }
}

// Lancer le setup
setupFollowersTable();
