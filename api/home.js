const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    let title = "XERA Protocol | Proof of Building & On-chain Project Certification";
    let description = "XERA is the decentralized trust layer for tech startups. Verify startup traction on-chain, build immutable development history, and prove execution to investors. The blockchain alternative to traditional pitches.";
    let keywords = "XERA protocol, XERA Proof of Building, Proof of Building protocol, xera1.xyz, Proof of Building blockchain, On-chain project certification, Verify startup traction, Investor trust layer, Anti-vaporware protocol, Blockchain startup pitch, Verifiable roadmap, Build in public tools";
    let image = "https://ssbuagqwjptyhavinkxg.supabase.co/storage/v1/object/public/assets/logo-512x512.png";
    let url = "https://xera1.xyz/";

    try {
        const filePath = path.join(process.cwd(), 'index.html');
        let html = fs.readFileSync(filePath, 'utf8');

        const injectMeta = (html, property, content, isName = false) => {
            const attr = isName ? 'name' : 'property';
            const regex = new RegExp(`<meta[^>]*?${attr}=["']${property}["'][^>]*?content=["'].*?["'][^>]*?>`, 'is');
            const newTag = `<meta ${attr}="${property}" content="${content.replace(/"/g, '&quot;')}" />`;
            return regex.test(html) ? html.replace(regex, newTag) : html.replace('</head>', `${newTag}\n</head>`);
        };

        // Données structurées JSON-LD pour Google
        const jsonLd = {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "XERA Protocol",
            "url": "https://xera1.xyz/",
            "logo": image,
            "description": description,
            "sameAs": [
                "https://www.linkedin.com/company/xera1/"
            ]
        };
        const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;

        html = html.replace(/<title>.*?<\/title>/is, `<title>${title}</title>`);
        html = injectMeta(html, 'keywords', keywords, true);
        html = injectMeta(html, 'description', description, true);
        html = injectMeta(html, 'og:title', title);
        html = injectMeta(html, 'og:description', description);
        html = injectMeta(html, 'og:image', image);
        html = injectMeta(html, 'og:url', url);
        html = injectMeta(html, 'twitter:title', title, true);
        html = injectMeta(html, 'twitter:description', description, true);
        html = injectMeta(html, 'twitter:image', image, true);
        html = injectMeta(html, 'twitter:card', 'summary_large_image', true);

        // Inject JSON-LD
        html = html.replace('</head>', `${jsonLdScript}\n</head>`);

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).send(html);
    } catch (error) {
        const fallbackPath = path.join(process.cwd(), 'index.html');
        return res.status(200).send(fs.readFileSync(fallbackPath, 'utf8'));
    }
};
