const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    let title = "XERA | Tracez votre progression";
    let description = "XERA est la plateforme de suivi de progression transparente. Partagez vos victoires et vos échecs sans filtre.";
    let image = "https://ssbuagqwjptyhavinkxg.supabase.co/storage/v1/object/public/assets/logo-512x512.png";
    let url = "https://xera1.vercel.app/";

    try {
        const filePath = path.join(process.cwd(), 'index.html');
        let html = fs.readFileSync(filePath, 'utf8');

        const injectMeta = (html, property, content, isName = false) => {
            const attr = isName ? 'name' : 'property';
            const regex = new RegExp(`<meta[^>]*?${attr}=["']${property}["'][^>]*?content=["'].*?["'][^>]*?>`, 'is');
            const newTag = `<meta ${attr}="${property}" content="${content.replace(/"/g, '&quot;')}" />`;
            return regex.test(html) ? html.replace(regex, newTag) : html.replace('</head>', `${newTag}\n</head>`);
        };

        html = html.replace(/<title>.*?<\/title>/is, `<title>${title}</title>`);
        html = injectMeta(html, 'og:title', title);
        html = injectMeta(html, 'og:description', description);
        html = injectMeta(html, 'og:image', image);
        html = injectMeta(html, 'og:url', url);
        html = injectMeta(html, 'twitter:title', title, true);
        html = injectMeta(html, 'twitter:description', description, true);
        html = injectMeta(html, 'twitter:image', image, true);
        html = injectMeta(html, 'twitter:card', 'summary_large_image', true);

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).send(html);
    } catch (error) {
        const fallbackPath = path.join(process.cwd(), 'index.html');
        return res.status(200).send(fs.readFileSync(fallbackPath, 'utf8'));
    }
};
