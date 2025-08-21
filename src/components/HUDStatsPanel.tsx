import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectFormattedStats,
  selectIsStatsLoading,
  selectIsSessionActive,
  updateSessionTimer,
  pauseTracking,
  resumeTracking,
} from '../store/slices/statsSlice';
import { RootState } from '../store';
import { SessionResetButton } from './SessionResetButton';

/**
 * Custom hook to handle pause/resume state changes
 */
const usePauseResumeHandler = (
  dispatch: ReturnType<typeof useDispatch>,
  isSessionActive: boolean,
  isTrackingPaused: boolean
) => {
  const prevIsTrackingPausedRef = useRef<boolean>(isTrackingPaused);

  useEffect(() => {
    const prevPaused = prevIsTrackingPausedRef.current;
    const currentPaused = isTrackingPaused;

    // Only dispatch if there's an active session and the state actually changed
    if (isSessionActive && prevPaused !== currentPaused) {
      if (currentPaused) {
        // Just became paused - record pause time
        dispatch(pauseTracking());
      } else {
        // Just became unpaused - calculate and add paused duration
        dispatch(resumeTracking());
      }
    }

    // Update ref for next comparison
    prevIsTrackingPausedRef.current = currentPaused;
  }, [dispatch, isSessionActive, isTrackingPaused]);
};

/**
 * Custom hook to handle real-time timer updates
 */
const useSessionTimer = (
  dispatch: ReturnType<typeof useDispatch>,
  isSessionActive: boolean,
  isTrackingPaused: boolean
) => {
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
};

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

  // Use custom hooks for cleaner code organization
  usePauseResumeHandler(dispatch, isSessionActive, isTrackingPaused);
  useSessionTimer(dispatch, isSessionActive, isTrackingPaused);

  if (isLoading) {
    return <HUDLoadingView />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        {/* Stat Headers Row with Reset Button */}
        <View style={styles.statHeaders}>
          <View style={styles.statColumn}>
            <MaterialIcons name="pets" size={16} color="#007AFF" />
            <Text style={styles.statHeaderLabel}>Distance</Text>
          </View>
          <View style={styles.statColumn}>
            <MaterialIcons name="map" size={16} color="#007AFF" />
            <Text style={styles.statHeaderLabel}>Area</Text>
          </View>
          <View style={styles.statColumn}>
            <MaterialIcons name="access-time" size={16} color="#007AFF" />
            <Text style={styles.statHeaderLabel}>Time</Text>
          </View>
          <View style={styles.resetButtonContainer}>
            <SessionResetButton style={styles.rectangularResetButton} />
          </View>
        </View>

        {/* Data Rows */}
        <View style={styles.dataGrid}>
          <HUDDataRow
            icon="play-circle-outline"
            label="Session"
            values={[
              formattedStats.sessionDistance,
              formattedStats.sessionArea,
              formattedStats.sessionTime,
            ]}
          />
          <HUDDataRow
            icon="all-inclusive"
            label="All Time"
            values={[
              formattedStats.totalDistance,
              formattedStats.totalArea,
              formattedStats.totalTime,
            ]}
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
 * Data row component showing stat values with row label on the right
 */
const HUDDataRow: React.FC<{
  icon: string;
  label: string;
  values: string[];
}> = ({ icon, label, values }) => (
  <View style={styles.dataRow}>
    <Text style={styles.dataValue}>{values[0]}</Text>
    <Text style={styles.dataValue}>{values[1]}</Text>
    <Text style={styles.dataValue}>{values[2]}</Text>
    <View style={styles.rowLabel}>
      <MaterialIcons name={icon as any} size={14} color="#007AFF" />
      <Text style={styles.rowLabelText}>{label}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20, // Add breathing room from bottom of screen
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
  statHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // 4-column table spanning full width
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  resetButtonContainer: {
    flex: 1, // Take equal space as a column
    alignItems: 'center',
    justifyContent: 'center',
  },
  rectangularResetButton: {
    // Additional styles will be applied by the SessionResetButton component
  },
  labelColumn: {
    width: 80, // Fixed width for row labels (now on the right)
    alignItems: 'flex-end', // Right-align the labels
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statHeaderLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  dataGrid: {
    gap: 4,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // 4-column table layout
    paddingVertical: 4,
  },

  rowLabel: {
    flex: 1, // Take equal space as 4th column
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabelText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 4,
  },
  dataValue: {
    flex: 1, // Equal width columns
    color: 'white',
    fontSize: 12,
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
