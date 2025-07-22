import React, { useState } from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, TouchableOpacity, Text, View } from 'react-native';
import DataClearSelectionDialog from '../DataClearSelectionDialog';
import type { DataStats, ClearType } from '../../types/dataClear';

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

// Mock Alert.alert
const mockAlert = jest.spyOn(Alert, 'alert');

// Test component that manages dialog visibility state like the real MapScreen
const DialogTestComponent: React.FC<{
  onClearData: (type: ClearType) => void;
  isClearing?: boolean;
  initiallyVisible?: boolean;
}> = ({ onClearData, isClearing = false, initiallyVisible = false }) => {
  const [isDialogVisible, setIsDialogVisible] = useState(initiallyVisible);
  const [dialogState, setDialogState] = useState<string>('hidden');

  const mockDataStats: DataStats = {
    totalPoints: 6,
    recentPoints: 2,
    oldestDate: new Date('2024-11-30T10:00:00Z'),
    newestDate: new Date('2024-12-01T15:30:00Z'),
  };

  // Update state for testing verification
  React.useEffect(() => {
    setDialogState(isDialogVisible ? 'visible' : 'hidden');
  }, [isDialogVisible]);

  const handleClearRequest = () => {
    act(() => {
      setIsDialogVisible(true);
    });
  };

  const handleCancel = () => {
    act(() => {
      setIsDialogVisible(false);
    });
  };

  const handleClear = async (type: ClearType) => {
    await act(async () => {
      onClearData(type);
      setIsDialogVisible(false); // Dialog closes after clearing
    });
  };

  return (
    <View>
      {/* Clear Button - Similar to MapScreen */}
      <TouchableOpacity testID="clear-button" onPress={handleClearRequest} disabled={isClearing}>
        <Text testID="clear-button-text">🗑️ Clear History</Text>
      </TouchableOpacity>

      {/* State indicator for testing */}
      <Text testID="dialog-state">{dialogState}</Text>

      {/* Dialog Component */}
      <DataClearSelectionDialog
        visible={isDialogVisible}
        dataStats={mockDataStats}
        onClear={handleClear}
        onCancel={handleCancel}
        isClearing={isClearing}
      />
    </View>
  );
};

describe('Data Clearing Integration Tests - User Stories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAlert.mockClear();
  });

  describe('User Story 1: Complete Cancel Flow', () => {
    it('should handle: user presses clear button → dialog appears → user clicks cancel → dialog disappears', async () => {
      const mockOnClear = jest.fn();

      const { getByTestId, queryByText } = render(
        <DialogTestComponent onClearData={mockOnClear} />
      );

      // Step 1: Verify initial state - dialog is hidden
      expect(getByTestId('dialog-state')).toHaveTextContent('hidden');
      expect(queryByText('Clear Exploration Data')).toBeNull();

      // Step 2: User presses clear history button
      fireEvent.press(getByTestId('clear-button'));

      // Step 3: Verify dialog appears
      await waitFor(() => {
        expect(getByTestId('dialog-state')).toHaveTextContent('visible');
        expect(queryByText('Clear Exploration Data')).toBeTruthy();
      });

      // Step 4: User clicks cancel
      fireEvent.press(queryByText('Cancel')!);

      // Step 5: Verify dialog disappears
      await waitFor(() => {
        expect(getByTestId('dialog-state')).toHaveTextContent('hidden');
        expect(queryByText('Clear Exploration Data')).toBeNull();
      });

      // Step 6: Verify no clearing action was taken
      expect(mockOnClear).not.toHaveBeenCalled();
    });
  });

  describe('User Story 2: Complete Clear Data Flow', () => {
    it('should handle: user presses clear button → dialog appears → user selects time range → confirmation → data cleared → success message → return to map', async () => {
      const mockOnClear = jest.fn();

      const { getByTestId, getByText, queryByText } = render(
        <DialogTestComponent onClearData={mockOnClear} />
      );

      // Step 1: User presses clear history button
      fireEvent.press(getByTestId('clear-button'));

      // Step 2: Verify dialog appears with options
      await waitFor(() => {
        expect(getByTestId('dialog-state')).toHaveTextContent('visible');
        expect(getByText('Clear Exploration Data')).toBeTruthy();
        expect(getByText('Last Hour')).toBeTruthy();
        expect(getByText('Last Day')).toBeTruthy();
        expect(getByText('All Time')).toBeTruthy();
      });

      // Step 3: User clicks "Last Hour" option
      fireEvent.press(getByText('Last Hour'));

      // Step 4: Verify confirmation alert appears
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

      // Step 5: User confirms by clicking "Clear Data" in the alert
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmButton = alertCall[2].find((button: any) => button.text === 'Clear Data');

      await act(async () => {
        confirmButton.onPress();
      });

      // Step 6: Verify clearing action is triggered
      await waitFor(() => {
        expect(mockOnClear).toHaveBeenCalledWith('hour');
      });

      // Step 7: Verify dialog disappears (user returned to map)
      await waitFor(() => {
        expect(getByTestId('dialog-state')).toHaveTextContent('hidden');
        expect(queryByText('Clear Exploration Data')).toBeNull();
      });
    });

    it('should handle "All Time" clearing with proper warnings', async () => {
      const mockOnClear = jest.fn();

      const { getByTestId, getByText } = render(<DialogTestComponent onClearData={mockOnClear} />);

      // Open dialog and select "All Time"
      fireEvent.press(getByTestId('clear-button'));

      await waitFor(() => {
        expect(getByText('All Time')).toBeTruthy();
      });

      fireEvent.press(getByText('All Time'));

      // Verify destructive confirmation appears
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Clear All Data',
          expect.stringContaining('permanently delete ALL your exploration data'),
          expect.arrayContaining([
            expect.objectContaining({ text: 'Cancel' }),
            expect.objectContaining({ text: 'Clear Data' }),
          ])
        );
      });

      // Confirm the destructive action
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmButton = alertCall[2].find((button: any) => button.text === 'Clear Data');

      await act(async () => {
        confirmButton.onPress();
      });

      // Verify clearing action
      await waitFor(() => {
        expect(mockOnClear).toHaveBeenCalledWith('all');
      });
    });
  });

  describe('Loading States', () => {
    it('should disable interactions during clearing process', async () => {
      const mockOnClear = jest.fn();

      const { getByTestId } = render(
        <DialogTestComponent onClearData={mockOnClear} isClearing={true} initiallyVisible={true} />
      );

      // Verify clear button is disabled during clearing
      expect(getByTestId('clear-button')).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid button presses gracefully', async () => {
      const mockOnClear = jest.fn();

      const { getByTestId, getByText } = render(<DialogTestComponent onClearData={mockOnClear} />);

      // Rapid button presses
      fireEvent.press(getByTestId('clear-button'));
      fireEvent.press(getByTestId('clear-button'));
      fireEvent.press(getByTestId('clear-button'));

      await waitFor(() => {
        expect(getByText('Clear Exploration Data')).toBeTruthy();
      });

      // Should still work normally
      fireEvent.press(getByText('Cancel'));

      await waitFor(() => {
        expect(getByTestId('dialog-state')).toHaveTextContent('hidden');
      });
    });
  });
});
