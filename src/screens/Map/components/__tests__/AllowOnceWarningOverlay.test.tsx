import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AllowOnceWarningOverlay } from '../AllowOnceWarningOverlay';

describe('AllowOnceWarningOverlay', () => {
  const mockOnDismiss = jest.fn();

  beforeEach(() => {
    mockOnDismiss.mockClear();
  });

  it('renders correctly when visible', () => {
    const { getByText, getByTestId } = render(
      <AllowOnceWarningOverlay visible={true} onDismiss={mockOnDismiss} />
    );

    expect(getByText('Location Permission Warning')).toBeTruthy();
    expect(getByText(/You granted.*Allow Once.*permission/)).toBeTruthy();
    expect(getByText(/location tracking will stop/)).toBeTruthy();
    expect(getByText('Understood')).toBeTruthy();
    expect(getByTestId('allow-once-warning-overlay')).toBeTruthy();
  });

  it('does not render when not visible', () => {
    const { queryByTestId } = render(
      <AllowOnceWarningOverlay visible={false} onDismiss={mockOnDismiss} />
    );

    expect(queryByTestId('allow-once-warning-overlay')).toBeNull();
  });

  it('calls onDismiss when Understood button is pressed', () => {
    const { getByText } = render(
      <AllowOnceWarningOverlay visible={true} onDismiss={mockOnDismiss} />
    );

    const understoodButton = getByText('Understood');
    fireEvent.press(understoodButton);

    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when backdrop is pressed', () => {
    const { getByTestId } = render(
      <AllowOnceWarningOverlay visible={true} onDismiss={mockOnDismiss} />
    );

    const modal = getByTestId('allow-once-warning-overlay');
    fireEvent.press(modal);

    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
  });

  it('has correct accessibility properties', () => {
    const { getByTestId } = render(
      <AllowOnceWarningOverlay visible={true} onDismiss={mockOnDismiss} />
    );

    const modal = getByTestId('allow-once-warning-overlay');
    expect(modal.props.accessibilityLabel).toBe('Location permission warning dialog');
  });
});
