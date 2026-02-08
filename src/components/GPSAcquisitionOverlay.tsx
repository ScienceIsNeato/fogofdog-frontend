import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

interface GPSAcquisitionOverlayProps {
  /** Whether to show the overlay (true when GPS is being acquired) */
  visible: boolean;
}

/**
 * Semi-transparent overlay shown on top of the map while GPS location
 * is being acquired. Shows a pulsing satellite icon and status text.
 *
 * Replaces the old white "Getting your location..." full-screen blocker
 * so the map is always visible underneath.
 */
export const GPSAcquisitionOverlay: React.FC<GPSAcquisitionOverlayProps> = ({ visible }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();

    return () => pulse.stop();
  }, [visible, pulseAnim]);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none" testID="gps-acquisition-overlay">
      <View style={styles.pill}>
        <Animated.Text style={[styles.icon, { opacity: pulseAnim }]}>📡</Animated.Text>
        <Text style={styles.text}>Acquiring GPS signal…</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 10,
  },
  icon: {
    fontSize: 22,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
