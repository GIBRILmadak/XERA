import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { WorkItem } from "../types/WorkItem";
import { useFeedInteraction } from "../hooks/useFeedInteraction";

const InteractionBar = ({ item }: { item: WorkItem }) => {
    // Supposons que item contient désormais is_followed et is_encouraged via le backend
    const { isSubscribed, toggleSubscribe, isLiked, toggleLike, likesCount } = useFeedInteraction(
        item.id, 
        (item as any).is_followed || false, 
        (item as any).is_encouraged || false
    );
    return (
        <View style={styles.interactionBar}>
            <TouchableOpacity onPress={toggleSubscribe}>
                <Image source={isSubscribed ? require('../../../icons/subscribed.svg') : require('../../../icons/subscribe.svg')} style={styles.icon} />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleLike} style={styles.likeContainer}>
                <Image source={isLiked ? require('../../../icons/courage-green.svg') : require('../../../icons/courage-blue.svg')} style={styles.icon} />
                <Text style={styles.likesCount}>{likesCount}</Text>
            </TouchableOpacity>
        </View>
    );
};

export function GitHubCard({ item }: { item: WorkItem }) {
    return (
        <View style={styles.card}>
            <Text style={styles.header}>GITHUB</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
            {item.content?.html_url && (
                <Text style={styles.link}>{item.content.html_url}</Text>
            )}
            <InteractionBar item={item} />
            <TouchableOpacity style={styles.actionBtn}>
                <Text style={styles.actionText}>Voir le commit</Text>
            </TouchableOpacity>
        </View>
    );
}

export function FigmaCard({ item }: { item: WorkItem }) {
    return (
        <View style={styles.card}>
            <Text style={styles.header}>FIGMA</Text>
            <Text style={styles.title}>{item.title}</Text>
            {item.previewUrl && (
                <Image source={{ uri: item.previewUrl }} style={styles.media} />
            )}
            <Text style={styles.description}>{item.description}</Text>
            <InteractionBar item={item} />
            <TouchableOpacity style={styles.actionBtn}>
                <Text style={styles.actionText}>Voir la maquette</Text>
            </TouchableOpacity>
        </View>
    );
}

export function SummaryCard({ item }: { item: WorkItem }) {
    return (
        <View style={styles.card}>
            <Text style={styles.header}>RÉCAPITULATIF</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
            {item.content?.summary && (
                <Text style={styles.summaryText}>
                    {item.content.summary.join(" · ")}
                </Text>
            )}
            <InteractionBar item={item} />
            <TouchableOpacity style={styles.actionBtn}>
                <Text style={styles.actionText}>Voir le détail</Text>
            </TouchableOpacity>
        </View>
    );
}

export function DefaultCard({ item }: { item: WorkItem }) {
    return (
        <View style={styles.card}>
            <Text style={styles.header}>{item.source.toUpperCase()}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
            {item.previewUrl && (
                <Image source={{ uri: item.previewUrl }} style={styles.media} />
            )}
            <InteractionBar item={item} />
            <TouchableOpacity style={styles.actionBtn}>
                <Text style={styles.actionText}>Voir le projet</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        height: 600,
        backgroundColor: "#0f172a",
        marginBottom: 10,
        padding: 20,
    },
    header: { color: "#64748b", fontSize: 12, marginBottom: 8 },
    title: { color: "#fff", fontSize: 20, fontWeight: "bold" },
    description: { color: "#cbd5e1", marginTop: 10 },
    summaryText: { color: "#e2e8f0", marginTop: 8 },
    link: { color: "#38bdf8", marginTop: 8 },
    media: { width: "100%", height: 300, borderRadius: 10, marginTop: 10 },
    actionBtn: {
        marginTop: 15,
        backgroundColor: "#3b82f6",
        padding: 10,
        borderRadius: 5,
        alignItems: "center",
    },
    actionText: { color: "#fff", fontWeight: "bold" },
    interactionBar: {
        flexDirection: 'row',
        marginTop: 15,
        gap: 20,
        alignItems: 'center',
    },
    icon: { width: 30, height: 30 },
    likeContainer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    likesCount: { color: '#fff' },
});
