import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
      style={[styles.button, isTrackingPaused ? styles.playButton : styles.pauseButton, style]}
      onPress={handleToggleTracking}
      testID={isTrackingPaused ? 'play-tracking-button' : 'pause-tracking-button'}
    >
      <MaterialIcons
        name={isTrackingPaused ? 'play-arrow' : 'pause'}
        size={24}
        color={isTrackingPaused ? '#2E7D32' : '#5F6368'}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  playButton: {
    backgroundColor: '#E8F5E8',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  pauseButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
});
