async function fetchData(accessToken) {
    if (!accessToken) {
        return [];
    }

    const response = await fetch(
        "https://cloudresourcemanager.googleapis.com/v1/projects",
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
        },
    );

    if (!response.ok) {
        console.warn(
            "[Google Cloud Adapter] API response error",
            response.status,
        );
        return [];
    }

    const data = await response.json();
    return Array.isArray(data.projects) ? data.projects : [];
}

function normalize(project, userId) {
    return {
        id: project.projectId || `google-cloud-${Date.now()}`,
        userId,
        source: "google-cloud",
        type: "document_update",
        timestamp: project.createTime || new Date().toISOString(),
        title: project.projectId || project.name || "Projet Google Cloud",
        description: project.name
            ? `Projet GCP : ${project.name}`
            : "Projet Google Cloud détecté",
        content: {
            projectId: project.projectId,
            projectNumber: project.projectNumber,
            lifecycleState: project.lifecycleState,
        },
        previewUrl: null,
        mediaUrl: null,
        metadata: {
            skills: ["Google Cloud"],
            relevanceScore: 1,
            isPublic: false,
        },
    };
}

module.exports = { fetchData, normalize };
