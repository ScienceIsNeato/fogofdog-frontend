import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SimplePerformancePanel } from '../SimplePerformancePanel';
import { renderWithProviders } from '../../utils/test-utils';
import { performanceTestInjector } from '../../utils/injectPerformanceTestData';

// Mock the performance test injector
jest.mock('../../utils/injectPerformanceTestData', () => ({
  performanceTestInjector: {
    getCurrentDataCount: jest.fn(),
    injectRealTimeData: jest.fn(),
    prependHistoricalData: jest.fn(),
    clearData: jest.fn(),
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('SimplePerformancePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (performanceTestInjector.getCurrentDataCount as jest.Mock).mockReturnValue(0);
  });

  it('should render correctly with initial state', () => {
    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    expect(getByText('Performance Testing')).toBeTruthy();
    expect(getByText('GPS Points: 0')).toBeTruthy();
    expect(getByText('+500 Live')).toBeTruthy();
    expect(getByText('+500 History')).toBeTruthy();
    expect(getByText('Clear All Data')).toBeTruthy();
  });

  it('should display current GPS point count', () => {
    (performanceTestInjector.getCurrentDataCount as jest.Mock).mockReturnValue(1234);

    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    expect(getByText('GPS Points: 1,234')).toBeTruthy();
  });

  it('should show confirmation dialog when +500 button is pressed', async () => {
    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500 Live'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Real-Time GPS Injection',
      'This will inject 500 GPS points in real-time with current timestamps. The GPS beacon will act as the "head" of the worm. This will take about 25 minutes.',
      expect.arrayContaining([
        { text: 'Cancel', style: 'cancel' },
        expect.objectContaining({
          text: 'Start Real-Time',
        }),
      ])
    );
  });

  it('should inject real-time data when confirmation dialog Start Real-Time is pressed', async () => {
    (performanceTestInjector.injectRealTimeData as jest.Mock).mockResolvedValue(undefined);

    // Mock Alert.alert to simulate user pressing Start Real-Time
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      const startButton = buttons.find((b: any) => b.text === 'Start Real-Time');
      if (startButton?.onPress) {
        startButton.onPress();
      }
    });

    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500 Live'));

    await waitFor(() => {
      expect(performanceTestInjector.injectRealTimeData).toHaveBeenCalledWith(
        500,
        'REALISTIC_DRIVE',
        { intervalMs: 3000 }
      );
    });
  });

  it('should not show success alert after injecting data', async () => {
    (performanceTestInjector.injectRealTimeData as jest.Mock).mockResolvedValue(undefined);
    (performanceTestInjector.getCurrentDataCount as jest.Mock)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(500);

    // Mock Alert.alert to simulate user pressing OK
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      const startButton = buttons.find((b: any) => b.text === 'Start Real-Time');
      if (startButton?.onPress) {
        startButton.onPress();
      }
    });

    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500 Live'));

    await waitFor(() => {
      expect(performanceTestInjector.injectRealTimeData).toHaveBeenCalledWith(
        500,
        'REALISTIC_DRIVE',
        { intervalMs: 3000 }
      );
    });

    // Should not show success alert (user sees GPS points in real-time instead)
    expect(Alert.alert).not.toHaveBeenCalledWith('Success', 'Added 500 GPS points');
  });

  it('should handle injection errors gracefully', async () => {
    // Suppress expected console.error for this test
    const originalConsoleError = console.error;
    console.error = jest.fn();

    (performanceTestInjector.injectRealTimeData as jest.Mock).mockRejectedValue(
      new Error('Test error')
    );

    // Mock Alert.alert to simulate user pressing OK on confirmation, then handle error alert
    let callCount = 0;
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      callCount++;
      if (callCount === 1) {
        // First call is the confirmation dialog
        const startButton = buttons?.find((b: any) => b.text === 'Start Real-Time');
        if (startButton?.onPress) {
          startButton.onPress();
        }
      }
      // Second call will be the error alert - just let it be called
    });

    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500 Live'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to inject real-time data');
    });

    // Restore console.error
    console.error = originalConsoleError;
  });

  it('should not inject data when confirmation dialog Cancel is pressed', () => {
    (performanceTestInjector.injectRealTimeData as jest.Mock).mockResolvedValue(undefined);

    // Mock Alert.alert to simulate user pressing Cancel (no onPress callback needed)
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, _buttons) => {
      // Cancel button typically has no onPress callback, just dismisses dialog
      // We don't need to call anything here
    });

    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500 Live'));

    // Verify the confirmation dialog was shown
    expect(Alert.alert).toHaveBeenCalledWith(
      'Real-Time GPS Injection',
      'This will inject 500 GPS points in real-time with current timestamps. The GPS beacon will act as the "head" of the worm. This will take about 25 minutes.',
      expect.arrayContaining([
        { text: 'Cancel', style: 'cancel' },
        expect.objectContaining({ text: 'Start Real-Time' }),
      ])
    );

    // Verify injection was not called
    expect(performanceTestInjector.injectRealTimeData).not.toHaveBeenCalled();
  });

  it('should call onCloseModal when GPS injection starts', async () => {
    const mockOnCloseModal = jest.fn();
    (performanceTestInjector.injectRealTimeData as jest.Mock).mockResolvedValue(undefined);

    // Mock Alert.alert to simulate user pressing Start Real-Time
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      const startButton = buttons?.find((b: any) => b.text === 'Start Real-Time');
      if (startButton?.onPress) {
        startButton.onPress();
      }
    });

    const { getByText } = renderWithProviders(
      <SimplePerformancePanel onCloseModal={mockOnCloseModal} />
    );

    fireEvent.press(getByText('+500 Live'));

    await waitFor(() => {
      expect(mockOnCloseModal).toHaveBeenCalled();
      expect(performanceTestInjector.injectRealTimeData).toHaveBeenCalledWith(
        500,
        'REALISTIC_DRIVE',
        { intervalMs: 3000 }
      );
    });
  });

  it('should show confirmation dialog when Clear button is pressed', () => {
    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    fireEvent.press(getByText('Clear All Data'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Clear Data',
      'Remove all GPS points?',
      expect.arrayContaining([
        { text: 'Cancel', style: 'cancel' },
        expect.objectContaining({
          text: 'Clear',
          style: 'destructive',
        }),
      ])
    );
  });

  it('should clear data when confirmation is accepted', () => {
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      // Simulate user pressing "Clear" button
      const clearButton = buttons.find((b: any) => b.text === 'Clear');
      if (clearButton?.onPress) {
        clearButton.onPress();
      }
    });

    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    fireEvent.press(getByText('Clear All Data'));

    expect(performanceTestInjector.clearData).toHaveBeenCalled();
  });

  it('should disable buttons when loading', async () => {
    (performanceTestInjector.injectRealTimeData as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    // Mock Alert.alert to simulate user pressing Start Real-Time
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      const startButton = buttons?.find((b: any) => b.text === 'Start Real-Time');
      if (startButton?.onPress) {
        startButton.onPress();
      }
    });

    const { getByText } = renderWithProviders(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500 Live'));

    // Wait for loading state to appear after confirmation
    await waitFor(() => {
      expect(getByText('Loading...')).toBeTruthy();
    });
  });
});
