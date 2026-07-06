import React from "react";
import { SafeAreaView, ScrollView, View, Text, Alert } from "react-native";
import ArcTraceComposer from "./components/ArcTraceComposer";

const ArcTraceExample: React.FC = () => {
    const handleSubmit = (payload: any) => {
        Alert.alert("Submitted", JSON.stringify(payload));
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#071128" }}>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Text
                    style={{ color: "#e6eef8", fontSize: 18, marginBottom: 12 }}
                >
                    Nouveau post
                </Text>
                <ArcTraceComposer onSubmit={handleSubmit} />
                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

export default ArcTraceExample;
