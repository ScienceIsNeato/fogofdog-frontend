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
        <LocationButton onPress={mockOnPress} isLocationAvailable={true} isCentered={false} />
      );

      const button = getByTestId('location-button');
      expect(button).toBeTruthy();
    });

    it('should apply custom styles when provided', () => {
      const customStyle = { marginTop: 20 };
      const { getByTestId } = render(
        <LocationButton
          onPress={mockOnPress}
          isLocationAvailable={true}
          isCentered={false}
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
    it('should call onPress when tapped and location is available', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isLocationAvailable={true} isCentered={false} />
      );

      const button = getByTestId('location-button');
      fireEvent.press(button);

      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('should not call onPress when location is not available', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isLocationAvailable={false} isCentered={false} />
      );

      const button = getByTestId('location-button');
      fireEvent.press(button);

      expect(mockOnPress).not.toHaveBeenCalled();
    });
  });

  describe('Visual States', () => {
    it('should show disabled state when location is not available', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isLocationAvailable={false} isCentered={false} />
      );

      const buttonContainer = getByTestId('location-button-container');

      // Check opacity for disabled state
      expect(buttonContainer.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ opacity: 0.5 })])
      );
    });

    it('should show active state when map is centered', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isLocationAvailable={true} isCentered={true} />
      );

      const buttonContainer = getByTestId('location-button-container');

      // Check background color for active state
      expect(buttonContainer.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: '#007AFF' })])
      );
    });

    it('should show normal state when location available but not centered', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isLocationAvailable={true} isCentered={false} />
      );

      const buttonContainer = getByTestId('location-button-container');

      // Check background color for normal state
      expect(buttonContainer.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgba(0, 0, 0, 0.6)' })])
      );
    });
  });

  describe('Accessibility', () => {
    it('should have correct accessibility properties', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isLocationAvailable={true} isCentered={false} />
      );

      const button = getByTestId('location-button');

      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe('Center on current location');
      expect(button.props.accessibilityHint).toBe(
        'Double tap to center the map on your current location'
      );
    });

    it('should indicate disabled state in accessibility', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isLocationAvailable={false} isCentered={false} />
      );

      const button = getByTestId('location-button');

      expect(button.props.accessibilityState).toEqual({ disabled: true });
    });

    it('should indicate selected state when centered', () => {
      const { getByTestId } = render(
        <LocationButton onPress={mockOnPress} isLocationAvailable={true} isCentered={true} />
      );

      const button = getByTestId('location-button');

      expect(button.props.accessibilityState).toEqual({ selected: true });
    });
  });
});
