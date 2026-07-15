import React, { useState, useRef } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    LayoutAnimation,
    Platform,
    UIManager,
} from "react-native";
import styles from "./ArcTraceComposer.styles";
import { useUserProjects } from "../hooks/useUserProjects";

type ContentType = "arc" | "trace";

export interface ArcTraceComposerProps {
    initialType?: ContentType;
    placeholder?: string;
    onSubmit?: (payload: {
        type: ContentType;
        text: string;
        tags: string[];
    }) => void;
    onCreateProject?: () => void;
}

if (
    Platform.OS === "android" &&
    UIManager.setLayoutAnimationEnabledExperimental
) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const ArcTraceComposer: React.FC<ArcTraceComposerProps> = ({
    initialType = "arc",
    placeholder = "Quoi de neuf ? Partagez une mise à jour...",
    onSubmit,
    onCreateProject,
}) => {
    const [type, setType] = useState<ContentType>(initialType);
    const [text, setText] = useState("");
    const [height, setHeight] = useState(80);
    const [tags, setTags] = useState<string[]>([]);
    const [tagDraft, setTagDraft] = useState("");
    const { hasProjects } = useUserProjects();

    const submit = () => {
        if (!hasProjects) {
            onCreateProject && onCreateProject();
            return;
        }
        onSubmit && onSubmit({ type, text, tags });
        setText("");
        setTags([]);
        setTagDraft("");
    };

    const toggleType = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setType((t) => (t === "arc" ? "trace" : "arc"));
    };

    const addTag = () => {
        const value = tagDraft.trim();
        if (!value) return;
        setTags((s) => (s.includes(value) ? s : [...s, value]));
        setTagDraft("");
    };

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <View style={styles.avatar} />
                <TouchableOpacity style={styles.typePill} onPress={toggleType}>
                    <Text style={styles.typeText}>
                        {type === "arc" ? "Arc / Projet" : "Trace / Update"}
                    </Text>
                </TouchableOpacity>
                <Text style={styles.smallMuted}>
                    • Sélection de projet • Visibilité
                </Text>
            </View>

            <TextInput
                multiline
                placeholder={placeholder}
                placeholderTextColor="#6b7280"
                value={text}
                onChangeText={setText}
                onContentSizeChange={(e) => {
                    const h = Math.min(
                        Math.max(80, e.nativeEvent.contentSize.height + 10),
                        300,
                    );
                    setHeight(h);
                }}
                style={[styles.input, { height }]}
                underlineColorAndroid="transparent"
            />

            <View style={styles.tagsRow}>
                {tags.map((t) => (
                    <View key={t} style={styles.tag}>
                        <Text style={{ color: "#c7b9ff" }}>{t}</Text>
                    </View>
                ))}
            </View>

            <View style={styles.toolbar}>
                <View style={styles.actionsLeft}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => {}}
                    >
                        <Text style={styles.actionIcon}>🖼️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => {}}
                    >
                        <Text style={styles.actionIcon}>🎬</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => {}}
                    >
                        <Text style={styles.actionIcon}>✨</Text>
                    </TouchableOpacity>
                    <View style={{ width: 140 }}>
                        <TextInput
                            placeholder="Ajouter un tag (Entrée)"
                            placeholderTextColor="#6b7280"
                            value={tagDraft}
                            onChangeText={setTagDraft}
                            onSubmitEditing={addTag}
                            style={[styles.pill, { color: "#e6eef8" }]}
                            returnKeyType="done"
                        />
                    </View>
                </View>

                <View style={styles.actionsRight}>
                    <TouchableOpacity
                        style={{ marginRight: 8 }}
                        onPress={() => {}}
                    >
                        <Text style={styles.smallMuted}>Prévisualiser</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.submitButton}
                        onPress={submit}
                    >
                        <Text style={styles.submitText}>
                            {!hasProjects 
                                ? "Créer mon premier projet" 
                                : type === "arc" ? "Créer Arc" : "Publier Trace"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

export default ArcTraceComposer;
