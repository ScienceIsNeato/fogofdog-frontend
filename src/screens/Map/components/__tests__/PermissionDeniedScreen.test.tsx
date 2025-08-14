import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PermissionDeniedScreen } from '../PermissionDeniedScreen';

describe('PermissionDeniedScreen', () => {
  const mockOnRetry = jest.fn();

  beforeEach(() => {
    mockOnRetry.mockClear();
  });

  it('renders correctly with no error', () => {
    const { getByText, getByTestId } = render(
      <PermissionDeniedScreen error={null} onRetry={mockOnRetry} />
    );

    expect(getByText('Location Permission Required')).toBeTruthy();
    expect(getByText(/This app requires location permission/)).toBeTruthy();
    expect(getByText('Try Again')).toBeTruthy();
    expect(getByTestId('permission-denied-screen')).toBeTruthy();
  });

  it('renders correctly with error message', () => {
    const errorMessage = 'Permission denied by user';
    const { getByText } = render(
      <PermissionDeniedScreen error={errorMessage} onRetry={mockOnRetry} />
    );

    expect(getByText('Location Permission Required')).toBeTruthy();
    expect(getByText(errorMessage)).toBeTruthy();
    expect(getByText('Try Again')).toBeTruthy();
  });

  it('calls onRetry when Try Again button is pressed', () => {
    const { getByText } = render(<PermissionDeniedScreen error={null} onRetry={mockOnRetry} />);

    const retryButton = getByText('Try Again');
    fireEvent.press(retryButton);

    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it('has correct accessibility properties', () => {
    const { getByTestId } = render(<PermissionDeniedScreen error={null} onRetry={mockOnRetry} />);

    const screen = getByTestId('permission-denied-screen');
    expect(screen.props.accessibilityLabel).toBe('Permission denied screen');
  });
});
