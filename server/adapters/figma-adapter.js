async function fetchData(accessToken) {
    // Récupérer les fichiers récents
    const response = await fetch("https://api.figma.com/v1/me/files", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    const data = await response.json();
    return Array.isArray(data.files) ? data.files : [];
}

function normalize(file, userId) {
    return {
        id: file.key,
        userId,
        source: "figma",
        type: "design_update",
        timestamp: file.updated_at || new Date().toISOString(),
        title: `Design Update: ${file.name}`,
        description: `Mise à jour du fichier Figma : ${file.name}.`,
        content: {
            fileId: file.key,
            url: `https://www.figma.com/file/${file.key}`,
        },
        // Figma fournit bien des thumbnails
        mediaUrl: file.thumbnail_url || null,
        metadata: {
            skills: ["Figma", "UI/UX"],
            relevanceScore: 1,
            isPublic: false,
        },
    };
}

module.exports = { fetchData, normalize };
