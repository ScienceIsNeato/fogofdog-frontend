import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { toggleTracking } from '../store/slices/explorationSlice';

interface TrackingControlButtonProps {
  style?: ViewStyle;
}

export const TrackingControlButton: React.FC<TrackingControlButtonProps> = ({ style }) => {
  const dispatch = useAppDispatch();
  const isTrackingPaused = useAppSelector((state) => state.exploration.isTrackingPaused);

  const handleToggleTracking = () => {
    dispatch(toggleTracking());
  };

  return (
    <TouchableOpacity
      style={[styles.button, isTrackingPaused ? styles.resumeButton : styles.pauseButton, style]}
      onPress={handleToggleTracking}
      testID={isTrackingPaused ? 'resume-tracking-button' : 'pause-tracking-button'}
    >
      <Text style={[styles.buttonText, isTrackingPaused ? styles.resumeText : styles.pauseText]}>
        {isTrackingPaused ? '▶️ Resume Exploration' : '⏸️ Pause Exploration'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  pauseButton: {
    backgroundColor: '#FF6B6B',
  },
  resumeButton: {
    backgroundColor: '#4ECDC4',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pauseText: {
    color: '#FFFFFF',
  },
  resumeText: {
    color: '#FFFFFF',
  },
});
