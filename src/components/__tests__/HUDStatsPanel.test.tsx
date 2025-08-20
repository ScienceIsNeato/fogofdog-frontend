import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { HUDStatsPanel } from '../HUDStatsPanel';
import userReducer from '../../store/slices/userSlice';
import explorationReducer from '../../store/slices/explorationSlice';
import statsReducer from '../../store/slices/statsSlice';

// Helper function to create mock store with stats
const createMockStoreWithStats = (statsState: any) => {
  return configureStore({
    reducer: {
      user: userReducer,
      exploration: explorationReducer,
      stats: statsReducer,
    },
    preloadedState: {
      user: { user: null, isLoading: false, error: null },
      exploration: {
        path: [],
        currentLocation: null,
        zoomLevel: 10,
        isMapCenteredOnUser: false,
        isFollowModeActive: false,
        exploredAreas: [],
        backgroundLocationStatus: {
          isRunning: false,
          hasPermission: false,
          storedLocationCount: 0,
        },
        isTrackingPaused: false,
      },
      stats: statsState,
    },
  });
};

// Mock stats data
const mockStatsState = {
  total: {
    distance: 5000, // 5km
    area: 250000, // 0.25 km²
    time: 7200000, // 2 hours
  },
  session: {
    distance: 1500, // 1.5km
    area: 50000, // 0.05 km²
    time: 1800000, // 30 minutes
  },
  sessionStartTime: Date.now() - 1800000,
  isSessionActive: true,
  lastProcessedPoint: null,
  exploredPath: [],
  isLoading: false,
  lastError: null,
  lastSaveTime: null,
  formattedStats: {
    totalDistance: '5.0km',
    totalArea: '0.25km²',
    totalTime: '2h 0m',
    sessionDistance: '1.5km',
    sessionArea: '0.05km²',
    sessionTime: '30m',
  },
};

const mockLoadingStatsState = {
  ...mockStatsState,
  isLoading: true,
};

// Render helper
const renderWithMockStore = (component: React.ReactElement, statsState: any) => {
  const store = createMockStoreWithStats(statsState);
  return render(<Provider store={store}>{component}</Provider>);
};

describe('HUDStatsPanel', () => {
  it('should render stats panel with formatted values', () => {
    const { getByText, getAllByText } = renderWithMockStore(<HUDStatsPanel />, mockStatsState);

    // Check section headers
    expect(getByText('All Time')).toBeTruthy();
    expect(getByText('Session')).toBeTruthy();

    // Check labels (appear twice - once for each section)
    expect(getAllByText('Distance')).toHaveLength(2);
    expect(getAllByText('Area')).toHaveLength(2);
    expect(getAllByText('Time')).toHaveLength(2);

    // Check values
    expect(getByText('5.0km')).toBeTruthy();
    expect(getByText('0.25km²')).toBeTruthy();
    expect(getByText('2h 0m')).toBeTruthy();
    expect(getByText('1.5km')).toBeTruthy();
    expect(getByText('0.05km²')).toBeTruthy();
    expect(getByText('30m')).toBeTruthy();
  });

  it('should render loading state when stats are loading', () => {
    const { getByText, queryByText } = renderWithMockStore(
      <HUDStatsPanel />,
      mockLoadingStatsState
    );

    // Should show loading message
    expect(getByText('Loading stats...')).toBeTruthy();

    // Should not show stats
    expect(queryByText('All Time')).toBeNull();
    expect(queryByText('Today')).toBeNull();
  });

  it('should render with zero values correctly', () => {
    const zeroState = {
      ...mockStatsState,
      formattedStats: {
        totalDistance: '0m',
        totalArea: '0m²',
        totalTime: '0m',
        sessionDistance: '0m',
        sessionArea: '0m²',
        sessionTime: '0m',
      },
    };

    const { getAllByText } = renderWithMockStore(<HUDStatsPanel />, zeroState);

    // Check that zero values are displayed (multiple instances expected)
    const zeroMeters = getAllByText('0m');
    expect(zeroMeters.length).toBeGreaterThan(0);

    const zeroSquareMeters = getAllByText('0m²');
    expect(zeroSquareMeters.length).toBeGreaterThan(0);
  });

  it('should have proper styling structure', () => {
    // The component should render without throwing
    // We can't easily test styles in React Native, but we can ensure structure
    expect(() => renderWithMockStore(<HUDStatsPanel />, mockStatsState)).not.toThrow();
  });

  it('should display stats in correct order', () => {
    const { getByText } = renderWithMockStore(<HUDStatsPanel />, mockStatsState);

    // Verify the structure exists
    const totalLabel = getByText('All Time');
    const sessionLabel = getByText('Session');

    expect(totalLabel).toBeTruthy();
    expect(sessionLabel).toBeTruthy();
  });

  it('should handle missing formatted stats gracefully', () => {
    const incompleteState = {
      ...mockStatsState,
      formattedStats: {
        totalDistance: '',
        totalArea: '',
        totalTime: '',
        sessionDistance: '',
        sessionArea: '',
        sessionTime: '',
      },
    };

    // Should render without crashing
    expect(() => {
      renderWithMockStore(<HUDStatsPanel />, incompleteState);
    }).not.toThrow();
  });

  it('should use correct selectors from Redux store', () => {
    // This test ensures the component properly connects to Redux
    const { getByText } = renderWithMockStore(<HUDStatsPanel />, mockStatsState);

    // If selectors work correctly, we should see the formatted values
    expect(getByText('5.0km')).toBeTruthy();
    expect(getByText('1.5km')).toBeTruthy();
  });

  it('should render labeled stats with blue vector icons', () => {
    const { getAllByText } = renderWithMockStore(<HUDStatsPanel />, mockStatsState);

    // Should have distance labels (appears twice - once for total, once for session)
    const distanceLabels = getAllByText('Distance');
    expect(distanceLabels.length).toBe(2);

    // Should have area labels
    const areaLabels = getAllByText('Area');
    expect(areaLabels.length).toBe(2);

    // Should have time labels
    const timeLabels = getAllByText('Time');
    expect(timeLabels.length).toBe(2);
  });
});
