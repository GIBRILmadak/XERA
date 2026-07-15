async function fetchData(accessToken) {
    const response = await fetch("https://api.figma.com/v1/files?limit=10", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    const data = await response.json();
    return Array.isArray(data.files) ? data.files : [];
}

function normalize(frame, userId) {
    return {
        id: frame.key || `figma-${frame.id}-${Date.now()}`,
        userId,
        source: "figma",
        type: "design_update",
        timestamp: frame.last_modified || new Date().toISOString(),
        title: frame.name || "Mise à jour Figma",
        description: frame.description || `Fichier Figma ${frame.name}`,
        content: {
            fileId: frame.key,
            url: frame.url,
            thumbnail: frame.thumbnail_url,
        },
        previewUrl: frame.thumbnail_url || null,
        mediaUrl: frame.thumbnail_url || null,
        metadata: {
            skills: ["UI/UX"],
            relevanceScore: 1,
            isPublic: false,
        },
    };
}

module.exports = { fetchData, normalize };
