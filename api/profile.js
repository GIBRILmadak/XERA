const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ssbuagqwjptyhavinkxg.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
    const userId = req.query.id;
    const dayNumber = req.query.day;
    const postId = req.query.post;

    let title = "XERA | Tracez votre progression";
    let description = "Plateforme de suivi de progression transparente sans dopamine sociale.";
    let image = "https://ssbuagqwjptyhavinkxg.supabase.co/storage/v1/object/public/assets/logo-512x512.png";
    let url = `https://xera1.vercel.app/profile${userId ? '?id=' + userId : ''}`;

    if (userId) {
        try {
            const { data: user } = await supabase
                .from('users')
                .select('name, bio, avatar, title')
                .eq('id', userId)
                .single();

            if (user) {
                title = `${user.name} | XERA`;
                description = user.bio || `Découvrez la trajectoire de ${user.name} sur XERA.`;
                image = user.avatar || image;

                if (dayNumber || postId) {
                    let query = supabase.from('content').select('title, description, media_url, day_number').eq('user_id', userId);
                    if (postId) query = query.eq('id', postId);
                    else if (dayNumber) query = query.eq('day_number', dayNumber);

                    const { data: content } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();

                    if (content) {
                        title = `${content.title} - J${content.day_number} | ${user.name}`;
                        description = content.description || description;
                        image = content.media_url || image;
                    }
                }
            }
        } catch (e) {
            console.error("Erreur SSR Metadata:", e);
        }
    }

    try {
        const filePath = path.join(process.cwd(), 'profile.html');
        let html = fs.readFileSync(filePath, 'utf8');

        // Fonction de remplacement robuste (multi-ligne)
        const injectMeta = (html, property, content, isName = false) => {
            const attr = isName ? 'name' : 'property';
            // Regex qui cherche la balise meta avec la propriété donnée et remplace son contenu
            const regex = new RegExp(`<meta[^>]*?${attr}=["']${property}["'][^>]*?content=["'].*?["'][^>]*?>`, 'is');
            const newTag = `<meta ${attr}="${property}" content="${content.replace(/"/g, '&quot;')}" />`;

            if (regex.test(html)) {
                return html.replace(regex, newTag);
            } else {
                // Si la balise n'existe pas, on l'ajoute avant </head>
                return html.replace('</head>', `${newTag}\n</head>`);
            }
        };

        html = html.replace(/<title>.*?<\/title>/is, `<title>${title}</title>`);

        // OG
        html = injectMeta(html, 'og:title', title);
        html = injectMeta(html, 'og:description', description);
        html = injectMeta(html, 'og:image', image);
        html = injectMeta(html, 'og:url', url);

        // Twitter
        html = injectMeta(html, 'twitter:title', title, true);
        html = injectMeta(html, 'twitter:description', description, true);
        html = injectMeta(html, 'twitter:image', image, true);
        html = injectMeta(html, 'twitter:card', 'summary_large_image', true);

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        return res.status(200).send(html);
    } catch (error) {
        const fallbackPath = path.join(process.cwd(), 'profile.html');
        return res.status(200).send(fs.readFileSync(fallbackPath, 'utf8'));
    }
};
