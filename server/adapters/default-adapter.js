async function fetchData(accessToken) {
    // Placeholder: cet adaptateur est appelé pour les outils sans implémentation spécifique.
    console.warn(
        "[Default Adapter] fetchData appelé avec un access token",
        Boolean(accessToken),
    );
    return [];
}

function normalize(item, userId, tool) {
    return {
        id: `default-${userId}-${Date.now()}`,
        userId,
        source: item?.source || tool || "unknown",
        type: "document_update",
        timestamp: new Date().toISOString(),
        title: "Action non supportée",
        description:
            "Aucun adaptateur spécifique n’est encore disponible pour cet outil.",
        content: item || {},
        metadata: {
            skills: [],
            relevanceScore: 0,
            isPublic: false,
        },
    };
}

module.exports = { fetchData, normalize };
