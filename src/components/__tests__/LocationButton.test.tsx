import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LocationButton from '../LocationButton';

describe('LocationButton', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render correctly with default props', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={false} isFollowModeActive={false} />
      );

      const button = getByTestId('location-button');
      expect(button).toBeTruthy();
    });

    it('should apply custom styles when provided', () => {
      const customStyle = { marginTop: 20 };
      const { getByTestId } = render(
        <LocationButton
          onPress={mockOnPress}
          isCentered={false}
          isFollowModeActive={false}
          style={customStyle}
        />
      );

      const button = getByTestId('location-button');
      expect(button.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining(customStyle)])
      );
    });
  });

  describe('Interaction', () => {
    it('should call onPress when tapped', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={false} isFollowModeActive={false} />
      );

      const button = getByTestId('location-button');
      fireEvent.press(button);

      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Visual States', () => {
    it('should show active state when map is centered', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={true} isFollowModeActive={false} />
      );

      const button = getByTestId('location-button');

      // Check background color for active state - now on the button itself
      expect(button.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: '#007AFF' })])
      );
    });

    it('should show normal state when not centered', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={false} isFollowModeActive={false} />
      );

      const button = getByTestId('location-button');

      // Check background color for normal state - now on the button itself
      expect(button.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgba(0, 0, 0, 0.6)' })])
      );
    });

    it('should show follow mode active state (blue background)', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={false} isFollowModeActive={true} />
      );

      const button = getByTestId('location-button');

      // Follow mode active should show blue background even when not centered
      expect(button.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: '#007AFF' })])
      );
    });

    it('should show follow mode inactive state (dark background when not centered)', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={false} isFollowModeActive={false} />
      );

      const button = getByTestId('location-button');

      // Follow mode inactive should show dark background when not centered
      expect(button.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgba(0, 0, 0, 0.6)' })])
      );
    });

    it('should render only one blue background when centered (no duplicates)', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={true} isFollowModeActive={false} />
      );

      const button = getByTestId('location-button');
      const buttonContainer = getByTestId('location-button-container');

      // The button should have blue background
      expect(button.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: '#007AFF' })])
      );

      // The inner container should NOT have any background color
      expect(buttonContainer.props.style).toBeUndefined();
    });
  });

  describe('Accessibility', () => {
    it('should have correct accessibility label when follow mode is inactive', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={false} isFollowModeActive={false} />
      );

      const button = getByTestId('location-button');

      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe('Follow current location');
      expect(button.props.accessibilityHint).toBe(
        'Double tap to center and follow your current location'
      );
    });

    it('should have correct accessibility label when follow mode is active', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={false} isFollowModeActive={true} />
      );

      const button = getByTestId('location-button');

      expect(button.props.accessibilityLabel).toBe('Stop following location');
      expect(button.props.accessibilityHint).toBe(
        'Double tap to stop auto-centering the map on your location'
      );
    });

    it('should indicate selected state when follow mode is active', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={false} isFollowModeActive={true} />
      );

      const button = getByTestId('location-button');

      expect(button.props.accessibilityState).toEqual({ selected: true });
    });

    it('should not indicate selected state when only centered (follow mode off)', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={true} isFollowModeActive={false} />
      );

      const button = getByTestId('location-button');

      expect(button.props.accessibilityState).toEqual({});
    });

    it('should have no selected state when neither centered nor following', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isCentered={false} isFollowModeActive={false} />
      );

      const button = getByTestId('location-button');

      expect(button.props.accessibilityState).toEqual({});
    });
  });
});
