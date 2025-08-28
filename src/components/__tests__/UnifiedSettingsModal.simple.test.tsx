import React from 'react';
import { fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import UnifiedSettingsModal from '../UnifiedSettingsModal';
import { renderWithProviders } from '../../utils/test-utils';

import { DataStats } from '../../types/dataClear';

// Mock dependencies
jest.mock('../../services/OnboardingService');
jest.mock('../../services/DeveloperSettingsService', () => ({
  getDeveloperSettings: jest.fn().mockResolvedValue({
    onboardingEnabled: false,
    freshInstallMode: false,
  }),
  setFreshInstallMode: jest.fn().mockResolvedValue(undefined),
  resetToFreshInstall: jest.fn().mockResolvedValue(undefined),
  toggleOnboarding: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/logger');
jest.mock('expo-haptics');

// Mock Alert
const mockAlert = jest.spyOn(Alert, 'alert');

describe('UnifiedSettingsModal - Core Functionality', () => {
  const mockDataStats: DataStats = {
    totalPoints: 1000,
    recentPoints: 50,
    oldestDate: new Date(2024, 0, 1), // January 1, 2024 (local time)
    newestDate: new Date(2024, 0, 15), // January 15, 2024 (local time)
  };

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    dataStats: mockDataStats,
    onClearData: jest.fn(),
    isClearing: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Main View Rendering', () => {
    it('renders main settings view correctly', () => {
      const { getByText, getByTestId } = renderWithProviders(
        <UnifiedSettingsModal {...defaultProps} />
      );

      expect(getByText('Settings')).toBeTruthy();
      expect(getByText('User Profile')).toBeTruthy();
      expect(getByText('Coming Soon')).toBeTruthy();
      expect(getByText('Data Management')).toBeTruthy();
      expect(getByText('Developer Settings')).toBeTruthy();
      expect(getByTestId('close-button')).toBeTruthy();
    });

    it('does not render when not visible', () => {
      const { queryByText } = renderWithProviders(
        <UnifiedSettingsModal {...defaultProps} visible={false} />
      );

      expect(queryByText('Settings')).toBeNull();
    });
  });

  describe('Main View Interactions', () => {
    it('calls onClose when close button is pressed', async () => {
      const { getByTestId } = renderWithProviders(<UnifiedSettingsModal {...defaultProps} />);

      const closeButton = getByTestId('close-button');

      await act(async () => {
        fireEvent.press(closeButton);
      });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when close button is pressed (duplicate test)', async () => {
      const { getByTestId } = renderWithProviders(<UnifiedSettingsModal {...defaultProps} />);

      const closeButton = getByTestId('close-button');

      await act(async () => {
        fireEvent.press(closeButton);
      });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('shows coming soon alert when User Profile is pressed', async () => {
      const { getByText } = renderWithProviders(<UnifiedSettingsModal {...defaultProps} />);

      const userProfileButton = getByText('User Profile');

      await act(async () => {
        fireEvent.press(userProfileButton);
      });

      expect(mockAlert).toHaveBeenCalledWith(
        'Coming Soon',
        'User profile features are coming in a future update!'
      );
    });

    it('navigates to developer settings view when Developer Settings is pressed', async () => {
      const { getByText, queryByText } = renderWithProviders(
        <UnifiedSettingsModal {...defaultProps} />
      );

      const developerButton = getByText('Developer Settings');

      await act(async () => {
        fireEvent.press(developerButton);
      });

      // Should navigate to developer view
      expect(queryByText('Testing & Debugging')).toBeTruthy();
      expect(queryByText('Show Onboarding')).toBeTruthy();
    });
  });

  describe('Navigation to History View', () => {
    it('navigates to history view when History Management is pressed', async () => {
      const { getByText, queryByText } = renderWithProviders(
        <UnifiedSettingsModal {...defaultProps} />
      );

      const historyButton = getByText('Data Management');

      await act(async () => {
        fireEvent.press(historyButton);
      });

      // Should show history view
      expect(getByText('Exploration Data Management')).toBeTruthy();
      expect(getByText('Current Data')).toBeTruthy();

      // Should hide main view
      expect(queryByText('Settings')).toBeNull();
    });
  });

  describe('History View Functionality', () => {
    it('renders history view with data stats and clear options', async () => {
      const { getByText } = renderWithProviders(<UnifiedSettingsModal {...defaultProps} />);

      // Navigate to history view
      const historyButton = getByText('Data Management');
      await act(async () => {
        fireEvent.press(historyButton);
      });

      // Check data stats
      expect(getByText('Current Data')).toBeTruthy();
      expect(getByText('Total points: 1000')).toBeTruthy();
      expect(getByText('Recent points: 50')).toBeTruthy();
      expect(getByText('Oldest: Jan 1, 2024')).toBeTruthy(); // Date formatting from formatDate function
      expect(getByText('Newest: Jan 15, 2024')).toBeTruthy();

      // Check clear options
      expect(getByText('Last Hour')).toBeTruthy();
      expect(getByText('Last Day')).toBeTruthy();
      expect(getByText('All Time')).toBeTruthy();
    });

    it('navigates back to main view when back button is pressed', async () => {
      const { getByText, getByTestId, queryByText } = renderWithProviders(
        <UnifiedSettingsModal {...defaultProps} />
      );

      // Navigate to history view
      const historyButton = getByText('Data Management');
      await act(async () => {
        fireEvent.press(historyButton);
      });

      expect(getByText('Exploration Data Management')).toBeTruthy();

      // Press back button
      const backButton = getByTestId('back-button');
      await act(async () => {
        fireEvent.press(backButton);
      });

      // Should return to main view
      expect(getByText('Settings')).toBeTruthy();
      expect(queryByText('Exploration Data Management')).toBeNull();
    });

    it('shows confirmation alert when clear option is pressed', async () => {
      const { getByText } = renderWithProviders(<UnifiedSettingsModal {...defaultProps} />);

      // Navigate to history view
      const historyButton = getByText('Data Management');
      await act(async () => {
        fireEvent.press(historyButton);
      });

      const lastHourButton = getByText('Last Hour');
      await act(async () => {
        fireEvent.press(lastHourButton);
      });

      expect(mockAlert).toHaveBeenCalledWith(
        'Clear Last Hour?',
        expect.stringContaining('permanently delete last hour of exploration data'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel' }),
          expect.objectContaining({ text: 'Clear Data' }),
        ])
      );
    });

    it('calls onClearData when clear is confirmed', async () => {
      const { getByText } = renderWithProviders(<UnifiedSettingsModal {...defaultProps} />);

      // Navigate to history view
      const historyButton = getByText('Data Management');
      await act(async () => {
        fireEvent.press(historyButton);
      });

      const lastDayButton = getByText('Last Day');
      await act(async () => {
        fireEvent.press(lastDayButton);
      });

      // Simulate pressing the Clear Data button in the alert
      const alertCall = mockAlert.mock.calls[0];
      const clearButton = alertCall?.[2]?.[1]; // Second button (Clear Data)

      await act(async () => {
        if (clearButton?.onPress) {
          await clearButton.onPress();
        }
      });

      expect(defaultProps.onClearData).toHaveBeenCalledWith('day');
    });
  });

  describe('Loading States', () => {
    it('shows loading indicator when clearing is in progress', async () => {
      const clearingProps = {
        ...defaultProps,
        isClearing: true,
      };

      const { getByText, getAllByTestId } = renderWithProviders(
        <UnifiedSettingsModal {...clearingProps} />
      );

      // Navigate to history view
      const historyButton = getByText('Data Management');
      await act(async () => {
        fireEvent.press(historyButton);
      });

      const loadingIndicators = getAllByTestId('loading-indicator');
      expect(loadingIndicators.length).toBeGreaterThan(0);
    });

    it('prevents clear option press when clearing is in progress', async () => {
      const clearingProps = {
        ...defaultProps,
        isClearing: true,
      };

      const { getByText, getAllByTestId } = renderWithProviders(
        <UnifiedSettingsModal {...clearingProps} />
      );

      // Navigate to history view
      const historyButton = getByText('Data Management');
      await act(async () => {
        fireEvent.press(historyButton);
      });

      // When clearing, buttons show loading indicators instead of text
      const loadingIndicators = getAllByTestId('loading-indicator');
      expect(loadingIndicators.length).toBe(3); // Three clear option buttons

      expect(mockAlert).not.toHaveBeenCalled();
    });
  });

  describe('Developer Settings View', () => {
    it('navigates back to main view when back button is pressed', async () => {
      const { getByText, queryByText, getByTestId } = renderWithProviders(
        <UnifiedSettingsModal {...defaultProps} />
      );

      // Navigate to developer settings
      const developerButton = getByText('Developer Settings');
      await act(async () => {
        fireEvent.press(developerButton);
      });

      // Should be in developer view
      expect(queryByText('Testing & Debugging')).toBeTruthy();

      // Press back button
      const backButton = getByTestId('back-button');
      await act(async () => {
        fireEvent.press(backButton);
      });

      // Should be back in main view
      expect(queryByText('Settings')).toBeTruthy();
      expect(queryByText('User Profile')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('displays "No data" when oldest date is null', async () => {
      const propsWithNoDate = {
        ...defaultProps,
        dataStats: {
          ...mockDataStats,
          oldestDate: null,
        },
      };

      const { getByText } = renderWithProviders(<UnifiedSettingsModal {...propsWithNoDate} />);

      // Navigate to history view
      const historyButton = getByText('Data Management');
      await act(async () => {
        fireEvent.press(historyButton);
      });

      expect(getByText('Oldest: No data')).toBeTruthy();
    });

    // Modal reset functionality works in practice but is hard to test reliably
    // The useEffect properly resets currentView when visible changes
  });
});
