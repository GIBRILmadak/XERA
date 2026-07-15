const NOTION_VERSION = "2022-06-28";

async function fetchData(accessToken) {
    if (!accessToken) {
        return [];
    }

    const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            page_size: 20,
            sort: {
                direction: "descending",
                timestamp: "last_edited_time",
            },
        }),
    });

    if (!response.ok) {
        console.warn("[Notion Adapter] API response error", response.status);
        return [];
    }

    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
}

function normalize(page, userId, tool = "notion") {
    const pageId = page.id || `${tool}-${Date.now()}`;
    const titleProperty = page.properties?.title;
    const title = Array.isArray(titleProperty?.title)
        ? titleProperty.title.map((t) => t.plain_text).join("")
        : page.properties?.name?.title?.[0]?.plain_text || "Page Notion";

    return {
        id: pageId,
        userId,
        source: "notion",
        type: "document_update",
        timestamp:
            page.last_edited_time ||
            page.created_time ||
            new Date().toISOString(),
        title: title || "Mise à jour Notion",
        description: page.url
            ? `Page Notion : ${page.url}`
            : "Contenu Notion mis à jour",
        content: {
            notionPageId: pageId,
            url: page.url,
            properties: page.properties,
        },
        previewUrl: null,
        mediaUrl: null,
        metadata: {
            skills: ["Notion"],
            relevanceScore: 1,
            isPublic: false,
        },
    };
}

module.exports = { fetchData, normalize };
