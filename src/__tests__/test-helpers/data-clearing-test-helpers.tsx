import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { Alert } from 'react-native';
import { createMockStore } from './shared-mocks';
import type { DataStats, ClearType } from '../../types/dataClear';

// Common mock data stats
export const mockDataStats: DataStats = {
  totalPoints: 150,
  recentPoints: 25,
  oldestDate: new Date('2024-01-01'),
  newestDate: new Date(),
};

export const emptyDataStats: DataStats = {
  totalPoints: 0,
  recentPoints: 0,
  oldestDate: null,
  newestDate: null,
};

// Mock functions factory
export const createDataClearingMocks = () => ({
  onClear: jest.fn(),
  onCancel: jest.fn(),
  onClearRequest: jest.fn(),
});

// Common test props for DataClearSelectionDialog
export const createDialogProps = (overrides = {}) => ({
  visible: true,
  dataStats: mockDataStats,
  isClearing: false,
  ...createDataClearingMocks(),
  ...overrides,
});

// Test component wrapper factory function
export const createTestWrapper = (store = createMockStore()) => {
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  TestWrapper.displayName = 'TestWrapper';
  return TestWrapper;
};

// Common test assertions
export const expectDialogToBeVisible = async (getByText: any) => {
  await waitFor(() => {
    expect(getByText('Clear Exploration Data')).toBeTruthy();
    expect(getByText('Choose time range to clear:')).toBeTruthy();
  });
};

export const expectDataStatsToBeDisplayed = async (getByText: any, stats: DataStats) => {
  await waitFor(() => {
    expect(getByText('Total Points:')).toBeTruthy();
    expect(getByText(stats.totalPoints.toString())).toBeTruthy();
    expect(getByText('Recent (24h):')).toBeTruthy();
    expect(getByText(stats.recentPoints.toString())).toBeTruthy();
  });
};

export const expectButtonsToBePresent = async (getByText: any) => {
  await waitFor(() => {
    expect(getByText('Last Hour')).toBeTruthy();
    expect(getByText('Last Day')).toBeTruthy();
    expect(getByText('All Time')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });
};

// Common button interaction helpers
export const pressButton = async (getByText: any, buttonText: string) => {
  const button = getByText(buttonText);
  fireEvent.press(button);
  await waitFor(() => expect(button).toBeTruthy());
};

export const pressClearButton = (getByText: any, type: 'hour' | 'day' | 'all') => {
  const buttonMap = {
    hour: 'Last Hour',
    day: 'Last Day',
    all: 'All Time',
  };
  return pressButton(getByText, buttonMap[type]);
};

// Alert mock setup
export const setupAlertMocks = () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  alertSpy.mockImplementation((_title, _message, buttons) => {
    // Simulate user pressing the confirm button
    if (buttons && buttons.length > 1) {
      const confirmButton = buttons.find((b) => b.text !== 'Cancel');
      if (confirmButton?.onPress) {
        confirmButton.onPress();
      }
    }
  });
  return alertSpy;
};

// Loading state test helpers
export const expectLoadingState = async (queryByTestId: any) => {
  await waitFor(() => {
    expect(queryByTestId('loading-indicator')).toBeTruthy();
  });
};

export const expectNotLoadingState = async (queryByTestId: any) => {
  await waitFor(() => {
    expect(queryByTestId('loading-indicator')).toBeFalsy();
  });
};

// Common test scenarios
export const runDialogVisibilityTest = async (component: any) => {
  const { getByText } = render(component);
  await expectDialogToBeVisible(getByText);
  await expectButtonsToBePresent(getByText);
};

export const runDataStatsDisplayTest = async (component: any, stats: DataStats) => {
  const { getByText } = render(component);
  await expectDataStatsToBeDisplayed(getByText, stats);
};

export const runCancelFlowTest = async (
  component: any,
  mockFunctions: ReturnType<typeof createDataClearingMocks>
) => {
  const { getByText } = render(component);
  await pressButton(getByText, 'Cancel');
  expect(mockFunctions.onCancel).toHaveBeenCalledTimes(1);
};

export const runClearFlowTest = async (
  component: any,
  clearType: ClearType,
  mockFunctions: ReturnType<typeof createDataClearingMocks>
) => {
  const { getByText } = render(component);

  // Press the appropriate clear button
  await pressClearButton(getByText, clearType);

  // Verify the onClear callback was called with correct type
  expect(mockFunctions.onClear).toHaveBeenCalledWith(clearType);
};

// Complete test flow helper
export const runCompleteDialogFlow = async (component: any) => {
  const mockFunctions = createDataClearingMocks();
  const { getByText, queryByTestId } = render(component);

  // Test initial render
  await runDialogVisibilityTest(component);

  // Test cancel flow
  await runCancelFlowTest(component, mockFunctions);

  // Test each clear type
  for (const clearType of ['hour', 'day', 'all'] as const) {
    await runClearFlowTest(component, clearType, mockFunctions);
  }

  return { mockFunctions, getByText, queryByTestId };
};
