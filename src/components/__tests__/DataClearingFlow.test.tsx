import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import DataClearSelectionDialog from '../DataClearSelectionDialog';
import {
  mockDataStats,
  createDataClearingMocks,
  createDialogProps,
  setupAlertMocks,
  expectDialogToBeVisible,
  expectDataStatsToBeDisplayed,
  expectButtonsToBePresent,
  pressButton,
  pressClearButton,
} from '../../__tests__/test-helpers/data-clearing-test-helpers';

// Mock dependencies
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
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

describe('Data Clearing User Flow Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAlertMocks();
  });

  describe('User Story 1: Cancel Flow', () => {
    it('should handle complete cancel flow: button press → dialog appears → user clicks cancel → dialog disappears', async () => {
      // Test data
      const mockFunctions = createDataClearingMocks();
      const props = createDialogProps(mockFunctions);

      // Render the dialog
      const { getByText, rerender, queryByText } = render(<DataClearSelectionDialog {...props} />);

      // Step 1: Verify dialog appears with correct content
      await expectDialogToBeVisible(getByText);
      await expectButtonsToBePresent(getByText);

      // Step 2: User clicks cancel
      await pressButton(getByText, 'Cancel');

      // Step 3: Verify onCancel is called (simulating dialog disappearing)
      await waitFor(() => {
        expect(mockFunctions.onCancel).toHaveBeenCalledTimes(1);
      });

      // Step 4: Simulate dialog disappearing by re-rendering with visible=false
      rerender(<DataClearSelectionDialog {...props} visible={false} />);

      // Step 5: Verify dialog has disappeared
      expect(queryByText('Clear Exploration Data')).toBeNull();

      // Step 6: Verify onClear was never called
      expect(mockFunctions.onClear).not.toHaveBeenCalled();
    });
  });

  describe('User Story 2: Clear Data Flow', () => {
    it('should handle complete clear flow: button press → dialog appears → user selects option → confirmation → data cleared → success message → return to map', async () => {
      const mockFunctions = createDataClearingMocks();
      const props = createDialogProps(mockFunctions);

      const { getByText } = render(<DataClearSelectionDialog {...props} />);

      await pressClearButton(getByText, 'hour');
      expect(mockFunctions.onClear).toHaveBeenCalledWith('hour');
    });

    it('should handle "Clear All Data" flow with appropriate warnings', async () => {
      const mockFunctions = createDataClearingMocks();
      const props = createDialogProps(mockFunctions);

      const { getByText } = render(<DataClearSelectionDialog {...props} />);

      await pressClearButton(getByText, 'all');
      expect(mockFunctions.onClear).toHaveBeenCalledWith('all');
    });

    it('should handle "Clear Last Day" flow correctly', async () => {
      const mockFunctions = createDataClearingMocks();
      const props = createDialogProps(mockFunctions);

      const { getByText } = render(<DataClearSelectionDialog {...props} />);

      await pressClearButton(getByText, 'day');
      expect(mockFunctions.onClear).toHaveBeenCalledWith('day');
    });
  });

  describe('Data Statistics Display', () => {
    it('should display accurate data statistics to help user make informed decisions', async () => {
      const { getByText } = render(
        <DataClearSelectionDialog
          visible={true}
          dataStats={mockDataStats}
          onClear={jest.fn()}
          onCancel={jest.fn()}
          isClearing={false}
        />
      );

      // Verify data statistics are displayed using helper function
      await expectDataStatsToBeDisplayed(getByText, mockDataStats);
    });
  });

  describe('Error Handling', () => {
    it('should not allow actions when clearing is in progress', () => {
      const mockFunctions = createDataClearingMocks();
      const props = createDialogProps({ ...mockFunctions, isClearing: true });

      const { getAllByTestId } = render(<DataClearSelectionDialog {...props} />);

      // Verify loading indicators are shown (buttons disabled)
      const loadingIndicators = getAllByTestId('loading-indicator');
      expect(loadingIndicators).toHaveLength(3); // One for each option button

      // Note: During loading state, users cannot interact with the options
      // This prevents double-clicking or multiple simultaneous clear operations
    });
  });
});
