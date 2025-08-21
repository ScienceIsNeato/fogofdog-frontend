import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { resetSessionStats } from '../store/slices/statsSlice';

interface SessionResetButtonProps {
  style?: ViewStyle;
}

/**
 * Session Reset Button Component
 *
 * Provides a button to reset the current session stats.
 * Shows confirmation dialog when tracking is active to prevent accidental resets.
 */
export const SessionResetButton: React.FC<SessionResetButtonProps> = ({ style }) => {
  const dispatch = useAppDispatch();
  const isTrackingPaused = useAppSelector((state) => state.exploration.isTrackingPaused);
  const isSessionActive = useAppSelector((state) => {
    return state.stats.currentSession && !state.stats.currentSession.endTime;
  });

  const handleResetSession = () => {
    const resetSession = () => {
      // Reset only the session stats, preserving total stats
      dispatch(resetSessionStats());
    };

    // If tracking is active (not paused), show confirmation dialog
    if (!isTrackingPaused && isSessionActive) {
      Alert.alert(
        'Reset Session',
        'Are you sure you want to reset the current session? This will clear all current session stats and cannot be undone.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Reset',
            style: 'destructive',
            onPress: resetSession,
          },
        ]
      );
    } else {
      // If paused or no active session, reset immediately
      resetSession();
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={handleResetSession}
      testID="reset-session-button"
    >
      <MaterialIcons name="play-circle-outline" size={16} color="#007AFF" />
      <MaterialIcons name="refresh" size={16} color="#007AFF" style={styles.refreshIcon} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  refreshIcon: {
    marginLeft: 4,
  },
});
