import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export const ProfileSpotlight: React.FC = () => {
    // Note : Pour une vraie animation, utilisez useRef et Animated.Value
    return (
        <View style={styles.spotlightContainer}>
            <View style={styles.halo} />
            <View style={styles.tooltip}>
                <Text style={styles.tooltipText}>Lancez votre premier projet ici !</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    spotlightContainer: {
        position: 'absolute',
        alignItems: 'center',
    },
    halo: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderWidth: 2,
        borderColor: '#3b82f6',
    },
    tooltip: {
        marginTop: 10,
        backgroundColor: '#3b82f6',
        padding: 8,
        borderRadius: 8,
    },
    tooltipText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
});
