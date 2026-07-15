import React, { useState } from "react";
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

    if (userAccountType !== "PERSONAL") {
        return null;
    }

    const handleConnect = async (toolId: string) => {
        try {
            // 1. Appeler l'API backend pour obtenir l'URL d'autorisation OAuth
            const response = await fetch(`/api/auth/${toolId}/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            const { authUrl } = await response.json();

            if (authUrl) {
                // 2. Rediriger l'utilisateur vers la page OAuth de l'outil
                // Si c'est React Native, utiliser Linking.openURL(authUrl)
                // Pour cet exemple web/hybride :
                window.location.href = authUrl;
            }
        } catch (error) {
            console.error(`Erreur lors de la connexion à ${toolId}:`, error);
            alert(`Impossible de connecter ${toolId}. Veuillez réessayer.`);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Activez votre flux de preuves</Text>
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
                    >
                        <Image source={tool.icon} style={styles.icon} />
                        <Text style={styles.toolName}>{tool.name}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { padding: 20 },
    title: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 15,
        color: "#fff",
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    toolCard: {
        width: "30%",
        padding: 10,
        alignItems: "center",
        backgroundColor: "#1e293b",
        borderRadius: 10,
    },
    connected: { borderColor: "#3b82f6", borderWidth: 2 },
    icon: { width: 40, height: 40 },
    toolName: { marginTop: 5, color: "#e2e8f0", fontSize: 12 },
});

export default ConnectionHub;
