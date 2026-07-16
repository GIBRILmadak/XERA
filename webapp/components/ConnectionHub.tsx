import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";

// Ce composant ne doit être rendu QUE pour les comptes personnels.
// La logique de filtrage est assurée par le composant parent ou par le hook d'auth.
const TOOLS = [
    { id: "github", name: "GitHub", icon: require("../../icons/github.svg") },
    { id: "figma", name: "Figma", icon: require("../../icons/figma.svg") },
    { id: "notion", name: "Notion", icon: require("../../icons/notion.svg") },
    {
        id: "google-cloud",
        name: "Google Cloud",
        icon: require("../../icons/google-cloud.svg"),
    },
];

interface ConnectionHubProps {
    userAccountType: "PERSONAL" | "PROFESSIONAL";
}

const ConnectionHub: React.FC<ConnectionHubProps> = ({ userAccountType }) => {
    const [connectedTools, setConnectedTools] = useState<string[]>([]);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                // Utiliser la même logique d'authentification que le reste de l'app si possible
                // Ici on suppose qu'un token est accessible globalement ou via contexte
                const response = await fetch(`/api/auth/status`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                const { connections } = await response.json();
                if (connections) {
                    setConnectedTools(connections.filter((c: any) => c.status === 'active').map((c: any) => c.tool));
                }
            } catch (error) {
                console.error("Erreur lors de la récupération du statut:", error);
            }
        };
        fetchStatus();
    }, []);

    if (userAccountType !== "PERSONAL") {
        return null;
    }

    const handleConnect = async (toolId: string) => {
        if (connectedTools.includes(toolId)) return; // Déjà connecté
        try {
            // 1. Appeler l'API backend pour obtenir l'URL d'autorisation OAuth
            const response = await fetch(`/api/auth/${toolId}/start`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
            });

            const { authUrl } = await response.json();

            if (authUrl) {
                // 2. Rediriger l'utilisateur vers la page OAuth de l'outil
                window.location.href = authUrl;
            }
        } catch (error) {
            console.error(`Erreur lors de la connexion à ${toolId}:`, error);
            alert(`Impossible de connecter ${toolId}. Veuillez réessayer.`);
        }
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={() => setIsVisible(!isVisible)} style={styles.toggleButton}>
                <Text style={styles.toggleButtonText}>{isVisible ? "Masquer les outils" : "Afficher les outils"}</Text>
            </TouchableOpacity>

            {isVisible && (
                <View style={styles.grid}>
                    {TOOLS.map((tool) => (
                        <TouchableOpacity
                            key={tool.id}
                            style={[
                                styles.toolCard,
                                connectedTools.includes(tool.id) &&
                                    styles.connected,
                            ]}
                            onPress={() => handleConnect(tool.id)}
                            disabled={connectedTools.includes(tool.id)}
                        >
                            <Image source={tool.icon} style={styles.icon} />
                            <Text style={styles.toolName}>{connectedTools.includes(tool.id) ? "Connecté" : tool.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { padding: 20 },
    toggleButton: { marginBottom: 15, padding: 8, backgroundColor: '#334155', borderRadius: 8, alignSelf: 'flex-start' },
    toggleButtonText: { color: '#fff', fontSize: 14 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    toolCard: {
        width: "22%",
        padding: 10,
        alignItems: "center",
        backgroundColor: "#1e293b",
        borderRadius: 10,
        borderColor: 'transparent',
        borderWidth: 2,
    },
    connected: { borderColor: "#10b981", backgroundColor: "#064e3b" },
    icon: { width: 40, height: 40 },
    toolName: { marginTop: 5, color: "#e2e8f0", fontSize: 12 },
});

export default ConnectionHub;
