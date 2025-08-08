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
        {isTrackingPaused ? '🐕 Adventure!' : '😴 Nap'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  pauseButton: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  resumeButton: {
    backgroundColor: '#E8F5E8',
    borderWidth: 1,
    borderColor: '#C3E6CB',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pauseText: {
    color: '#6C757D',
  },
  resumeText: {
    color: '#28A745',
  },
});
