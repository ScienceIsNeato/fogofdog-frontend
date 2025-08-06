import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SettingsButton } from '../SettingsButton';

describe('SettingsButton', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering and basic functionality', () => {
    it('should render settings button with correct icon', () => {
      render(<SettingsButton onPress={mockOnPress} />);

      const button = screen.getByTestId('settings-button');
      expect(button).toBeTruthy();
      
      // Should have settings icon
      expect(screen.getByTestId('settings-icon')).toBeTruthy();
    });

    it('should call onPress when button is pressed', () => {
      render(<SettingsButton onPress={mockOnPress} />);

      fireEvent.press(screen.getByTestId('settings-button'));

      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('should have proper accessibility labels', () => {
      render(<SettingsButton onPress={mockOnPress} />);

      const button = screen.getByLabelText('Open settings menu');
      expect(button).toBeTruthy();
    });
  });

  describe('styling and positioning', () => {
    it('should apply custom styles when provided', () => {
      const customStyle = { backgroundColor: 'red' };
      render(<SettingsButton onPress={mockOnPress} style={customStyle} />);

      const button = screen.getByTestId('settings-button');
      expect(button.props.style).toEqual(expect.objectContaining(customStyle));
    });

    it('should handle positioning styles correctly', () => {
      const positionStyle = { 
        position: 'absolute' as const,
        bottom: 20,
        right: 20,
      };
      render(<SettingsButton onPress={mockOnPress} style={positionStyle} />);

      const button = screen.getByTestId('settings-button');
      expect(button.props.style).toEqual(expect.objectContaining(positionStyle));
    });
  });

  describe('disabled state', () => {
    it('should not call onPress when disabled', () => {
      render(<SettingsButton onPress={mockOnPress} disabled={true} />);

      fireEvent.press(screen.getByTestId('settings-button'));

      expect(mockOnPress).not.toHaveBeenCalled();
    });

    it('should apply disabled styling when disabled', () => {
      render(<SettingsButton onPress={mockOnPress} disabled={true} />);

      const button = screen.getByTestId('settings-button');
      expect(button.props.style).toEqual(expect.objectContaining({ opacity: 0.5 }));
    });

    it('should have proper accessibility state when disabled', () => {
      render(<SettingsButton onPress={mockOnPress} disabled={true} />);

      const button = screen.getByTestId('settings-button');
      expect(button.props.accessibilityState).toEqual({ disabled: true });
    });
  });

  describe('visual design', () => {
    it('should have circular button design', () => {
      render(<SettingsButton onPress={mockOnPress} />);

      const button = screen.getByTestId('settings-button');
      const buttonStyle = button.props.style;
      
      // Check for circular design properties
      expect(buttonStyle).toEqual(expect.objectContaining({
        borderRadius: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }));
    });

    it('should have proper shadow and elevation', () => {
      render(<SettingsButton onPress={mockOnPress} />);

      const button = screen.getByTestId('settings-button');
      const buttonStyle = button.props.style;
      
      // Check for shadow properties
      expect(buttonStyle).toEqual(expect.objectContaining({
        shadowColor: expect.any(String),
        shadowOffset: expect.any(Object),
        shadowOpacity: expect.any(Number),
        shadowRadius: expect.any(Number),
        elevation: expect.any(Number),
      }));
    });
  });

  describe('integration compatibility', () => {
    it('should work as a drop-in replacement for existing clear button', () => {
      // This test ensures it can replace the existing data clear button functionality
      const handleSettingsPress = jest.fn();
      
      render(
        <SettingsButton 
          onPress={handleSettingsPress}
          style={{ position: 'absolute' as const, bottom: 100, right: 20 }}
        />
      );

      const button = screen.getByTestId('settings-button');
      expect(button).toBeTruthy();
      
      fireEvent.press(button);
      expect(handleSettingsPress).toHaveBeenCalled();
    });
  });
}); 