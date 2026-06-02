const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ssbuagqwjptyhavinkxg.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
    const userId = req.query.id;
    const dayNumber = req.query.day; // Pour partager un jour spécifique
    const postId = req.query.post; // Ou un ID de post direct

    // Valeurs par défaut (Application)
    let title = "XERA | Tracez votre progression";
    let description = "Plateforme de suivi de progression transparente sans dopamine sociale.";
    let image = "https://ssbuagqwjptyhavinkxg.supabase.co/storage/v1/object/public/assets/logo.png";
    let url = `https://xera1.vercel.app/profile${userId ? '?id=' + userId : ''}`;

    if (userId) {
        try {
            // 1. Récupérer les infos de l'utilisateur
            const { data: user } = await supabase
                .from('users')
                .select('name, bio, avatar, title')
                .eq('id', userId)
                .single();

            if (user) {
                title = `${user.name} | XERA`;
                description = user.bio || `Découvrez la trajectoire de ${user.name} sur XERA.`;
                image = user.avatar || image;

                // 2. Si un contenu spécifique est demandé, on surcharge les métadonnées
                if (dayNumber || postId) {
                    let query = supabase.from('content').select('title, description, media_url, day_number').eq('user_id', userId);

                    if (postId) query = query.eq('id', postId);
                    else if (dayNumber) query = query.eq('day_number', dayNumber);

                    const { data: content } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();

                    if (content) {
                        title = `${content.title} - Jour ${content.day_number} | ${user.name}`;
                        description = content.description || description;
                        image = content.media_url || image;
                        if (dayNumber) url += `&day=${dayNumber}`;
                        if (postId) url += `&post=${postId}`;
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

        // Injection
        html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
        html = html.replace(/property="og:title"\s+content=".*?"/i, `property="og:title" content="${title}"`);
        html = html.replace(/property="og:description"\s+content=".*?"/i, `property="og:description" content="${description}"`);
        html = html.replace(/property="og:image"\s+content=".*?"/i, `property="og:image" content="${image}"`);
        html = html.replace(/property="og:url"\s+content=".*?"/i, `property="og:url" content="${url}"`);
        html = html.replace(/name="twitter:title"\s+content=".*?"/i, `name="twitter:title" content="${title}"`);
        html = html.replace(/name="twitter:description"\s+content=".*?"/i, `name="twitter:description" content="${description}"`);
        html = html.replace(/name="twitter:image"\s+content=".*?"/i, `name="twitter:image" content="${image}"`);

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        return res.status(200).send(html);
    } catch (error) {
        const fallbackPath = path.join(process.cwd(), 'profile.html');
        return res.status(200).send(fs.readFileSync(fallbackPath, 'utf8'));
    }
};
