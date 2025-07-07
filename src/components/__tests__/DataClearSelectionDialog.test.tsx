import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import DataClearSelectionDialog from '../DataClearSelectionDialog';
import type { DataStats } from '../../types/dataClear';

// Mock Alert.alert
jest.spyOn(Alert, 'alert');

// Mock Haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

// Mock MaterialIcons
jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: ({
    name,
    size: _size,
    color: _color,
    ...props
  }: {
    name: string;
    size: number;
    color: string;
    [key: string]: any;
  }) => {
    const React = jest.requireActual('react');
    const { Text } = jest.requireActual('react-native');
    return React.createElement(Text, { ...props, testID: `icon-${name}` }, name);
  },
}));

describe('DataClearSelectionDialog', () => {
  const mockDataStats: DataStats = {
    totalPoints: 1000,
    recentPoints: 100,
    oldestDate: new Date('2025-01-01'),
    newestDate: new Date('2025-07-03'),
  };

  const defaultProps = {
    visible: true,
    dataStats: mockDataStats,
    onClear: jest.fn(),
    onCancel: jest.fn(),
    isClearing: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Alert.alert as jest.Mock).mockClear();
  });

  it('renders when visible is true', () => {
    const { getByText } = render(<DataClearSelectionDialog {...defaultProps} />);

    expect(getByText('Clear Exploration Data')).toBeTruthy();
    expect(getByText('Choose time range to clear:')).toBeTruthy();
  });

  it('does not render when visible is false', () => {
    const { queryByText } = render(<DataClearSelectionDialog {...defaultProps} visible={false} />);

    expect(queryByText('Clear Exploration Data')).toBeNull();
  });

  it('shows three clearing options: Last Hour, Last Day, All Time', () => {
    const { getByText } = render(<DataClearSelectionDialog {...defaultProps} />);

    expect(getByText('Last Hour')).toBeTruthy();
    expect(getByText('Last Day')).toBeTruthy();
    expect(getByText('All Time')).toBeTruthy();
  });

  it('shows data statistics', () => {
    const { getByText } = render(<DataClearSelectionDialog {...defaultProps} />);

    expect(getByText('1,000')).toBeTruthy(); // Total points
    expect(getByText('100')).toBeTruthy(); // Recent points
  });

  it('calls onCancel when Cancel button is pressed', async () => {
    const mockOnCancel = jest.fn();
    const { getByText } = render(
      <DataClearSelectionDialog {...defaultProps} onCancel={mockOnCancel} />
    );

    fireEvent.press(getByText('Cancel'));
    await waitFor(() => {
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('shows confirmation alert when Last Hour is selected', async () => {
    const { getByText } = render(<DataClearSelectionDialog {...defaultProps} />);

    fireEvent.press(getByText('Last Hour'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Clear Last Hour',
        expect.stringContaining('This will remove exploration data from the last hour'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel' }),
          expect.objectContaining({ text: 'Clear Data' }),
        ])
      );
    });
  });

  it('shows confirmation alert when Last Day is selected', async () => {
    const { getByText } = render(<DataClearSelectionDialog {...defaultProps} />);

    fireEvent.press(getByText('Last Day'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Clear Last Day',
        expect.stringContaining('This will remove exploration data from the last day'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel' }),
          expect.objectContaining({ text: 'Clear Data' }),
        ])
      );
    });
  });

  it('shows confirmation alert when All Time is selected', async () => {
    const { getByText } = render(<DataClearSelectionDialog {...defaultProps} />);

    fireEvent.press(getByText('All Time'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Clear All Data',
        expect.stringContaining('permanently delete ALL your exploration data'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel' }),
          expect.objectContaining({ text: 'Clear All Data' }),
        ])
      );
    });
  });

  it('calls onClear with correct type when confirmation is accepted', async () => {
    const mockOnClear = jest.fn();
    const { getByText } = render(
      <DataClearSelectionDialog {...defaultProps} onClear={mockOnClear} />
    );

    fireEvent.press(getByText('Last Hour'));

    // Wait for the alert to be called
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });

    // Simulate user confirming the alert
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmButton = alertCall[2].find((button: any) => button.text === 'Clear Data');
    confirmButton.onPress();

    expect(mockOnClear).toHaveBeenCalledWith('hour');
  });

  it('disables buttons when isClearing is true', () => {
    const { getAllByTestId } = render(
      <DataClearSelectionDialog {...defaultProps} isClearing={true} />
    );

    // When isClearing is true, buttons show loading indicators instead of text
    const loadingIndicators = getAllByTestId('loading-indicator');
    expect(loadingIndicators).toHaveLength(3); // One for each option button

    // Check that loading indicators are present (indicating disabled state)
    loadingIndicators.forEach((indicator) => {
      expect(indicator).toBeTruthy();
    });
  });

  it('shows loading indicators when isClearing is true', () => {
    const { getAllByTestId } = render(
      <DataClearSelectionDialog {...defaultProps} isClearing={true} />
    );

    const loadingIndicators = getAllByTestId('loading-indicator');
    expect(loadingIndicators).toHaveLength(3); // One for each option
  });
});
