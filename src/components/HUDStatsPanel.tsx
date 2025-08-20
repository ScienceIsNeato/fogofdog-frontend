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
        {/* Category Headers */}
        <View style={styles.categoryHeaders}>
          <View style={styles.sectionLabels}>
            <View style={styles.sectionLabelContainer}>
              <MaterialIcons name="play-circle-outline" size={16} color="#007AFF" />
              <Text style={styles.sectionLabel}>Session</Text>
            </View>
            <View style={styles.sectionLabelContainer}>
              <MaterialIcons name="all-inclusive" size={16} color="#007AFF" />
              <Text style={styles.sectionLabel}>All Time</Text>
            </View>
          </View>
        </View>
        
        {/* Stats Grid */}
        <View style={styles.statsContainer}>
          <HUDStatRow
            icon="pets"
            label="Distance"
            sessionValue={formattedStats.sessionDistance}
            totalValue={formattedStats.totalDistance}
          />
          <HUDStatRow
            icon="map"
            label="Area"
            sessionValue={formattedStats.sessionArea}
            totalValue={formattedStats.totalArea}
          />
          <HUDStatRow
            icon="access-time"
            label="Time"
            sessionValue={formattedStats.sessionTime}
            totalValue={formattedStats.totalTime}
          />
        </View>
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
 * Individual stat row component showing category icon, label, and both session/total values
 */
const HUDStatRow: React.FC<{
  icon: string;
  label: string;
  sessionValue: string;
  totalValue: string;
}> = ({ icon, label, sessionValue, totalValue }) => (
  <View style={styles.statRow}>
    <View style={styles.statCategory}>
      <MaterialIcons name={icon as any} size={18} color="#007AFF" />
      <Text style={styles.statLabel}>{label}</Text>
    </View>
    <View style={styles.statValues}>
      <Text style={styles.statValue}>{sessionValue}</Text>
      <Text style={styles.statValue}>{totalValue}</Text>
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
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
  },
  categoryHeaders: {
    marginBottom: 8,
  },
  sectionLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingLeft: 100, // Offset for the category icon space
  },
  sectionLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  sectionLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  statsContainer: {
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  statCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 100, // Fixed width for category labels
    marginRight: 16,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
  },
  statValues: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
  },
  statValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
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
