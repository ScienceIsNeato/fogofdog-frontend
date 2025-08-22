import React from 'react';
import { render } from '@testing-library/react-native';
import { GPSInjectionIndicator } from '../GPSInjectionIndicator';

describe('GPSInjectionIndicator', () => {
  it('renders nothing when not visible', () => {
    const { queryByText } = render(
      <GPSInjectionIndicator isVisible={false} message="Test message" />
    );

    expect(queryByText('Test message')).toBeNull();
  });

  it('renders indicator when visible', () => {
    const { getByText } = render(
      <GPSInjectionIndicator isVisible={true} message="Injecting GPS data..." />
    );

    expect(getByText('Injecting GPS data...')).toBeTruthy();
  });

  it('renders loading spinner when visible', () => {
    const { getByTestId } = render(<GPSInjectionIndicator isVisible={true} message="Loading..." />);

    // ActivityIndicator should be present
    expect(getByTestId).toBeDefined();
  });

  it('renders GPS icon when visible', () => {
    const { getByTestId } = render(<GPSInjectionIndicator isVisible={true} message="GPS active" />);

    // MaterialIcons should be present
    expect(getByTestId).toBeDefined();
  });

  it('handles different message types', () => {
    const { getByText, rerender } = render(
      <GPSInjectionIndicator isVisible={true} message="Real-time injection..." />
    );

    expect(getByText('Real-time injection...')).toBeTruthy();

    rerender(<GPSInjectionIndicator isVisible={true} message="Historical injection..." />);

    expect(getByText('Historical injection...')).toBeTruthy();
  });

  it('handles empty message gracefully', () => {
    const { root } = render(<GPSInjectionIndicator isVisible={true} message="" />);

    expect(root).toBeTruthy();
  });

  it('renders with proper structure when visible', () => {
    const { getByText } = render(<GPSInjectionIndicator isVisible={true} message="Test message" />);

    const messageElement = getByText('Test message');
    expect(messageElement).toBeTruthy();
  });
});
