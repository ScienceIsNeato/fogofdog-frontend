import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectFormattedStats,
  selectIsStatsLoading,
  selectIsSessionActive,
  updateSessionTimer,
} from '../store/slices/statsSlice';
import { RootState } from '../store';

/**
 * HUD Stats Panel Component
 *
 * Displays real-time exploration statistics in a persistent bottom panel.
 * Shows both lifetime totals and current session stats.
 */
export const HUDStatsPanel: React.FC = () => {
  const dispatch = useDispatch();
  const formattedStats = useSelector((state: RootState) => selectFormattedStats(state));
  const isLoading = useSelector((state: RootState) => selectIsStatsLoading(state));
  const isSessionActive = useSelector((state: RootState) => selectIsSessionActive(state));
  const isTrackingPaused = useSelector((state: RootState) => state.exploration.isTrackingPaused);

  // Real-time timer effect - updates every second when tracking is active
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    // Start timer if we have an active session and tracking is not paused
    if (isSessionActive && !isTrackingPaused) {
      intervalId = setInterval(() => {
        dispatch(updateSessionTimer());
      }, 1000); // Update every second
    }

    // Cleanup interval on unmount or when conditions change
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [dispatch, isSessionActive, isTrackingPaused]);

  if (isLoading) {
    return <HUDLoadingView />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <HUDSessionStats formattedStats={formattedStats} />
        <View style={styles.separator} />
        <HUDAllTimeStats formattedStats={formattedStats} />
      </View>
    </View>
  );
};

/**
 * Loading view component
 */
const HUDLoadingView: React.FC = () => (
  <View style={styles.container}>
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingText}>Loading stats...</Text>
    </View>
  </View>
);

/**
 * Session stats section component
 */
const HUDSessionStats: React.FC<{ formattedStats: any }> = ({ formattedStats }) => (
  <View style={styles.statsSection}>
    <View style={styles.statsRow}>
      <View style={styles.sectionHeader}>
        <MaterialIcons name="play-circle-outline" size={20} color="#007AFF" />
        <Text style={styles.sectionLabel}>Session</Text>
      </View>
      <HUDStatsGrid
        distance={formattedStats.sessionDistance}
        area={formattedStats.sessionArea}
        time={formattedStats.sessionTime}
      />
    </View>
  </View>
);

/**
 * All time stats section component
 */
const HUDAllTimeStats: React.FC<{ formattedStats: any }> = ({ formattedStats }) => (
  <View style={styles.statsSection}>
    <View style={styles.statsRow}>
      <View style={styles.sectionHeader}>
        <MaterialIcons name="all-inclusive" size={20} color="#007AFF" />
        <Text style={styles.sectionLabel}>All Time</Text>
      </View>
      <HUDStatsGrid
        distance={formattedStats.totalDistance}
        area={formattedStats.totalArea}
        time={formattedStats.totalTime}
      />
    </View>
  </View>
);

/**
 * Stats grid component
 */
const HUDStatsGrid: React.FC<{ distance: string; area: string; time: string }> = ({
  distance,
  area,
  time,
}) => (
  <View style={styles.statsGrid}>
    <View style={styles.statItem}>
      <View style={styles.statLabelContainer}>
        <MaterialIcons name="pets" size={18} color="#007AFF" />
        <Text style={styles.statLabel}>Distance</Text>
      </View>
      <Text style={styles.statValue}>{distance}</Text>
    </View>
    <View style={styles.statItem}>
      <View style={styles.statLabelContainer}>
        <MaterialIcons name="map" size={18} color="#007AFF" />
        <Text style={styles.statLabel}>Area</Text>
      </View>
      <Text style={styles.statValue}>{area}</Text>
    </View>
    <View style={styles.statItem}>
      <View style={styles.statLabelContainer}>
        <MaterialIcons name="access-time" size={18} color="#007AFF" />
        <Text style={styles.statLabel}>Time</Text>
      </View>
      <Text style={styles.statValue}>{time}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000, // Ensure it's above map elements
  },
  panel: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)', // Slightly more opaque for better readability
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
  },
  statsSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)', // Subtle background for each section
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 90, // Fixed width for alignment
    marginRight: 16,
  },
  sectionLabel: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 4,
  },
  statLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 4,
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 8,
    marginHorizontal: 8,
  },
  statValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default HUDStatsPanel;
