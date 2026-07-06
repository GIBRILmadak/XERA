import { StyleSheet } from "react-native";

export default StyleSheet.create({
    card: {
        backgroundColor: "#0f1720",
        borderRadius: 12,
        padding: 12,
        shadowColor: "#000",
        shadowOpacity: 0.6,
        shadowRadius: 10,
        elevation: 6,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#1f2937",
        marginRight: 10,
    },
    typePill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: "#111827",
        borderWidth: 1,
        borderColor: "#2b2f3a",
    },
    typeText: {
        color: "#dbeafe",
        fontWeight: "600",
    },
    input: {
        color: "#e6eef8",
        fontSize: 16,
        lineHeight: 22,
        paddingVertical: 8,
    },
    toolbar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: "#111827",
        paddingTop: 10,
    },
    actionsLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    actionButton: {
        marginRight: 12,
        padding: 6,
        borderRadius: 8,
        backgroundColor: "transparent",
    },
    actionIcon: {
        color: "#a78bfa",
        fontSize: 18,
    },
    actionsRight: {
        flexDirection: "row",
        alignItems: "center",
    },
    submitButton: {
        backgroundColor: "#7c3aed",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
    },
    submitText: {
        color: "#fff",
        fontWeight: "700",
    },
    smallMuted: {
        color: "#9ca3af",
        fontSize: 13,
        marginLeft: 8,
    },
    pill: {
        backgroundColor: "#111827",
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: "#1f2937",
    },
    tagsRow: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        marginTop: 8,
    },
    tag: {
        backgroundColor: "#111827",
        color: "#c7b9ff",
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 12,
        marginRight: 8,
        marginBottom: 6,
    },
});
