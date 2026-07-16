const NOTION_VERSION = "2022-06-28";

async function fetchData(accessToken) {
    if (!accessToken) return [];

    // Récupérer les pages récemment éditées
    const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            page_size: 5,
            sort: {
                direction: "descending",
                timestamp: "last_edited_time",
            },
        }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
}

function normalize(page, userId, tool = "notion") {
    // Extraction plus robuste du titre
    const title = page.properties?.title?.title?.[0]?.plain_text || 
                  page.properties?.Name?.title?.[0]?.plain_text || 
                  "Note Notion";

    return {
        id: page.id,
        userId,
        source: "notion",
        type: "document_update",
        timestamp: page.last_edited_time,
        title: `Note Notion : ${title}`,
        description: `Mise à jour de la note : ${title}.`,
        content: {
            url: page.url,
        },
        // Notion n'a pas de thumbnail direct, on utilise une icône de fallback ou null
        mediaUrl: page.icon?.type === "external" ? page.icon.external.url : null,
        metadata: {
            skills: ["Notion", "Documentation"],
            relevanceScore: 1,
            isPublic: false,
        },
    };
}

module.exports = { fetchData, normalize };

