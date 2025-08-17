import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SimplePerformancePanel } from '../SimplePerformancePanel';
import { performanceTestInjector } from '../../utils/injectPerformanceTestData';

// Mock the performance test injector
jest.mock('../../utils/injectPerformanceTestData', () => ({
  performanceTestInjector: {
    getCurrentDataCount: jest.fn(),
    injectCustomData: jest.fn(),
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
    const { getByText } = render(<SimplePerformancePanel />);

    expect(getByText('Performance Testing')).toBeTruthy();
    expect(getByText('GPS Points: 0')).toBeTruthy();
    expect(getByText('Adaptive Optimization: Active')).toBeTruthy();
    expect(getByText('+500')).toBeTruthy();
    expect(getByText('Clear')).toBeTruthy();
  });

  it('should display current GPS point count', () => {
    (performanceTestInjector.getCurrentDataCount as jest.Mock).mockReturnValue(1234);

    const { getByText } = render(<SimplePerformancePanel />);

    expect(getByText('GPS Points: 1,234')).toBeTruthy();
  });

  it('should inject test data when +500 button is pressed', async () => {
    (performanceTestInjector.injectCustomData as jest.Mock).mockResolvedValue(undefined);

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));

    await waitFor(() => {
      expect(performanceTestInjector.injectCustomData).toHaveBeenCalledWith(500, 'REALISTIC_DRIVE');
    });
  });

  it('should show success alert after injecting data', async () => {
    (performanceTestInjector.injectCustomData as jest.Mock).mockResolvedValue(undefined);
    (performanceTestInjector.getCurrentDataCount as jest.Mock)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(500);

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Success', 'Added 500 GPS points');
    });
  });

  it('should handle injection errors gracefully', async () => {
    // Suppress expected console.error for this test
    const originalConsoleError = console.error;
    console.error = jest.fn();

    (performanceTestInjector.injectCustomData as jest.Mock).mockRejectedValue(
      new Error('Test error')
    );

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to inject test data');
    });

    // Restore console.error
    console.error = originalConsoleError;
  });

  it('should show confirmation dialog when Clear button is pressed', () => {
    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('Clear'));

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

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('Clear'));

    expect(performanceTestInjector.clearData).toHaveBeenCalled();
  });

  it('should disable buttons when loading', async () => {
    (performanceTestInjector.injectCustomData as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));

    // Buttons should be disabled during loading
    expect(getByText('Loading...')).toBeTruthy();
  });
});
