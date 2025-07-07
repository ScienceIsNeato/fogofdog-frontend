import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DataClearSelectionDialog from '../DataClearSelectionDialog';
import type { DataStats } from '../../types/dataClear';

// Mock dependencies
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
  },
}));

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

describe('DataClearSelectionDialog - Simple Cancel Test', () => {
  const mockDataStats: DataStats = {
    totalPoints: 6,
    recentPoints: 2,
    oldestDate: new Date('2024-11-30T10:00:00Z'),
    newestDate: new Date('2024-12-01T15:30:00Z'),
  };

  it('should call onCancel when Cancel button is pressed', async () => {
    const mockOnCancel = jest.fn();
    const mockOnClear = jest.fn();

    const { getByText } = render(
      <DataClearSelectionDialog
        visible={true}
        dataStats={mockDataStats}
        onClear={mockOnClear}
        onCancel={mockOnCancel}
        isClearing={false}
      />
    );

    // Find and press the Cancel button
    const cancelButton = getByText('Cancel');
    fireEvent.press(cancelButton);

    // Wait for the async haptic feedback to complete
    await waitFor(() => {
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    // Verify onClear was not called
    expect(mockOnClear).not.toHaveBeenCalled();
  });

  it('should not call onCancel when dialog is not visible', () => {
    const mockOnCancel = jest.fn();
    const mockOnClear = jest.fn();

    const { queryByText } = render(
      <DataClearSelectionDialog
        visible={false}
        dataStats={mockDataStats}
        onClear={mockOnClear}
        onCancel={mockOnCancel}
        isClearing={false}
      />
    );

    // Dialog should not be rendered when visible=false
    expect(queryByText('Cancel')).toBeNull();
    expect(mockOnCancel).not.toHaveBeenCalled();
  });
});
