import React, { useEffect, useState } from "react";
import {
    View,
    FlatList,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
} from "react-native";
import { WorkItem } from "../types/WorkItem";
import {
    GitHubCard,
    FigmaCard,
    SummaryCard,
    DefaultCard,
} from "./FeedCardSelector";

interface FeedProps {
    userId: string;
}

const ImmersiveFeed: React.FC<FeedProps> = ({ userId }) => {
    const [items, setItems] = useState<WorkItem[]>([]);

    useEffect(() => {
        // Charger les WorkItems depuis la base de données
        fetchWorkItems();
    }, []);

    const fetchWorkItems = async () => {
        // Appel API pour récupérer les items normalisés (Evidence of Work)
        const response = await fetch(`/api/work-items/${userId}`);
        const data = await response.json();
        setItems(data);
    };

    const renderItem = ({ item }: { item: WorkItem }) => {
        if (item.source === "github") {
            return <GitHubCard item={item} />;
        }
        if (item.source === "figma") {
            return <FigmaCard item={item} />;
        }
        if (item.type === "work_summary") {
            return <SummaryCard item={item} />;
        }
        return <DefaultCard item={item} />;
    };

    return (
        <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.feedContainer}
            snapToAlignment="start"
            decelerationRate="fast"
            snapToInterval={600} // Pour l'effet immersif (TikTok style)
        />
    );
};

const styles = StyleSheet.create({
    feedContainer: { paddingBottom: 50 },
});

export default ImmersiveFeed;
