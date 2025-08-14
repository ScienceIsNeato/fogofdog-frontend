import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PermissionLoadingScreen } from '../PermissionLoadingScreen';

describe('PermissionLoadingScreen', () => {
  const mockOnRetry = jest.fn();

  beforeEach(() => {
    mockOnRetry.mockClear();
  });

  it('renders correctly with no error', () => {
    const { getByText, getByTestId } = render(
      <PermissionLoadingScreen error={null} onRetry={mockOnRetry} />
    );

    expect(getByText('Checking Location Permissions')).toBeTruthy();
    expect(getByText(/Verifying your location settings/)).toBeTruthy();
    expect(getByTestId('permission-loading-screen')).toBeTruthy();
  });

  it('renders correctly with error message and retry button', () => {
    const errorMessage = 'Permission verification timed out';
    const { getByText } = render(
      <PermissionLoadingScreen error={errorMessage} onRetry={mockOnRetry} />
    );

    expect(getByText('Checking Location Permissions')).toBeTruthy();
    expect(getByText(errorMessage)).toBeTruthy();
    expect(getByText('Try Again')).toBeTruthy();
  });

  it('does not show retry button when no error', () => {
    const { queryByText } = render(<PermissionLoadingScreen error={null} onRetry={mockOnRetry} />);

    expect(queryByText('Try Again')).toBeNull();
  });

  it('calls onRetry when Try Again button is pressed', () => {
    const { getByText } = render(
      <PermissionLoadingScreen error="Some error" onRetry={mockOnRetry} />
    );

    const retryButton = getByText('Try Again');
    fireEvent.press(retryButton);

    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it('has correct accessibility properties', () => {
    const { getByTestId } = render(
      <PermissionLoadingScreen error="Some error" onRetry={mockOnRetry} />
    );

    const screen = getByTestId('permission-loading-screen');
    expect(screen.props.accessibilityLabel).toBe('Permission loading screen');
  });
});
