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

  it('should show confirmation dialog when +500 button is pressed', async () => {
    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'GPS Injection Ready',
      'Clicking OK will return you to the app and commence adding GPS points. Enjoy the show!',
      expect.arrayContaining([
        { text: 'Cancel', style: 'cancel' },
        expect.objectContaining({
          text: 'OK',
        }),
      ])
    );
  });

  it('should inject test data when confirmation dialog OK is pressed', async () => {
    (performanceTestInjector.injectCustomData as jest.Mock).mockResolvedValue(undefined);
    
    // Mock Alert.alert to simulate user pressing OK
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      const okButton = buttons.find((b: any) => b.text === 'OK');
      if (okButton?.onPress) {
        okButton.onPress();
      }
    });

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));

    await waitFor(() => {
      expect(performanceTestInjector.injectCustomData).toHaveBeenCalledWith(500, 'REALISTIC_DRIVE');
    });
  });

  it('should not show success alert after injecting data', async () => {
    (performanceTestInjector.injectCustomData as jest.Mock).mockResolvedValue(undefined);
    (performanceTestInjector.getCurrentDataCount as jest.Mock)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(500);

    // Mock Alert.alert to simulate user pressing OK
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      const okButton = buttons.find((b: any) => b.text === 'OK');
      if (okButton?.onPress) {
        okButton.onPress();
      }
    });

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));

    await waitFor(() => {
      expect(performanceTestInjector.injectCustomData).toHaveBeenCalledWith(500, 'REALISTIC_DRIVE');
    });

    // Should not show success alert (user sees GPS points in real-time instead)
    expect(Alert.alert).not.toHaveBeenCalledWith('Success', 'Added 500 GPS points');
  });

  it('should handle injection errors gracefully', async () => {
    // Suppress expected console.error for this test
    const originalConsoleError = console.error;
    console.error = jest.fn();

    (performanceTestInjector.injectCustomData as jest.Mock).mockRejectedValue(
      new Error('Test error')
    );

    // Mock Alert.alert to simulate user pressing OK on confirmation, then handle error alert
    let callCount = 0;
    (Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
      callCount++;
      if (callCount === 1) {
        // First call is the confirmation dialog
        const okButton = buttons?.find((b: any) => b.text === 'OK');
        if (okButton?.onPress) {
          okButton.onPress();
        }
      }
      // Second call will be the error alert - just let it be called
    });

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to inject test data');
    });

    // Restore console.error
    console.error = originalConsoleError;
  });

  it('should not inject data when confirmation dialog Cancel is pressed', () => {
    (performanceTestInjector.injectCustomData as jest.Mock).mockResolvedValue(undefined);
    
    // Mock Alert.alert to simulate user pressing Cancel (no onPress callback needed)
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      // Cancel button typically has no onPress callback, just dismisses dialog
      // We don't need to call anything here
    });

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));
    
    // Verify the confirmation dialog was shown
    expect(Alert.alert).toHaveBeenCalledWith(
      'GPS Injection Ready',
      'Clicking OK will return you to the app and commence adding GPS points. Enjoy the show!',
      expect.arrayContaining([
        { text: 'Cancel', style: 'cancel' },
        expect.objectContaining({ text: 'OK' }),
      ])
    );
    
    // Verify injection was not called
    expect(performanceTestInjector.injectCustomData).not.toHaveBeenCalled();
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

    // Mock Alert.alert to simulate user pressing OK
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      const okButton = buttons?.find((b: any) => b.text === 'OK');
      if (okButton?.onPress) {
        okButton.onPress();
      }
    });

    const { getByText } = render(<SimplePerformancePanel />);

    fireEvent.press(getByText('+500'));

    // Wait for loading state to appear after confirmation
    await waitFor(() => {
      expect(getByText('Loading...')).toBeTruthy();
    });
  });
});
