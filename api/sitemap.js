const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ssbuagqwjptyhavinkxg.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
    const baseUrl = 'https://xera1.xyz';

    // Pages statiques
    const staticPages = [
        '',
        '/login',
        '/analytics',
        '/subscription-plans',
        '/credits',
        '/verification'
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // Ajouter les pages statiques
    staticPages.forEach(page => {
        xml += `
  <url>
    <loc>${baseUrl}${page}</loc>
    <changefreq>daily</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`;
    });

    try {
        // Récupérer les profils utilisateurs publics
        // On suppose que tous les utilisateurs dans la table 'users' sont indexables
        const { data: users, error } = await supabase
            .from('users')
            .select('id, updated_at')
            .limit(1000); // Limite de sécurité pour éviter un sitemap trop gros

        if (!error && users) {
            users.forEach(user => {
                const lastMod = user.updated_at ? new Date(user.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                xml += `
  <url>
    <loc>${baseUrl}/profile?id=${user.id}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
            });
        }
    } catch (e) {
        console.error("Erreur génération sitemap dynamic:", e);
    }

    xml += `
</urlset>`;

    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).send(xml);
};
