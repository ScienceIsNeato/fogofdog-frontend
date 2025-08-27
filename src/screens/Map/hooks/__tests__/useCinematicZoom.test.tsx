import { renderHook, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useCinematicZoom } from '../useCinematicZoom';
import explorationReducer from '../../../../store/slices/explorationSlice';
import statsReducer from '../../../../store/slices/statsSlice';
import userReducer from '../../../../store/slices/userSlice';
import { logger } from '../../../../utils/logger';
import * as mapZoomUtils from '../../../../utils/mapZoomUtils';
import * as mapConstraints from '../../../../constants/mapConstraints';
import type { GeoPoint } from '../../../../types/user';
import React from 'react';

// Mock dependencies
jest.mock('../../../../utils/logger');
jest.mock('../../../../utils/mapZoomUtils');
jest.mock('../../../../constants/mapConstraints');

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockMapZoomUtils = mapZoomUtils as jest.Mocked<typeof mapZoomUtils>;
const mockMapConstraints = mapConstraints as jest.Mocked<typeof mapConstraints>;

// Mock MapView
const mockMapView = {
  animateToRegion: jest.fn(),
  _cinematicZoomActive: false,
};

const createTestStore = (initialState?: any) => {
  return configureStore({
    reducer: {
      user: userReducer,
      exploration: explorationReducer,
      stats: statsReducer,
    },
    preloadedState: initialState,
  } as any);
};

const createWrapper = (store: any) => {
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  TestWrapper.displayName = 'TestWrapper';
  return TestWrapper;
};

describe('useCinematicZoom', () => {
  let mockMapRef: React.RefObject<any>;
  let currentLocation: GeoPoint;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockMapRef = { current: mockMapView };
    currentLocation = {
      latitude: 37.7749,
      longitude: -122.4194,
      timestamp: Date.now(),
    };

    // Setup default mocks
    mockMapZoomUtils.calculateZoomAnimation.mockReturnValue({
      startRegion: {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      },
      endRegion: {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      startScale: 2000,
      endScale: 50,
    });

    mockMapZoomUtils.gaussianEasing.mockImplementation((progress) => progress);
    mockMapConstraints.constrainRegion.mockImplementation((region) => region);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return initial region when current location exists', () => {
    const store = createTestStore({
      exploration: { path: [] },
    });

    const { result } = renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    // Should return cinematic start position, not current location
    expect(result.current.initialRegion).toBeDefined();
    expect(result.current.initialRegion?.latitudeDelta).toBe(0.0922); // 2km zoom level
    expect(result.current.initialRegion?.longitudeDelta).toBe(0.0421);
    // Latitude and longitude will be offset from current location for cinematic effect
    expect(result.current.initialRegion?.latitude).not.toBe(currentLocation.latitude);
    expect(result.current.initialRegion?.longitude).not.toBe(currentLocation.longitude);
  });

  it('should return null initial region when current location is null', () => {
    const store = createTestStore({
      exploration: { path: [] },
    });

    const { result } = renderHook(
      () => useCinematicZoom({ mapRef: mockMapRef, currentLocation: null }),
      { wrapper: createWrapper(store) }
    );

    expect(result.current.initialRegion).toBeNull();
  });

  it('should return null explorationBounds when path has fewer than 5 points', () => {
    const store = createTestStore({
      exploration: {
        path: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: 1 },
          { latitude: 37.775, longitude: -122.4195, timestamp: 2 },
        ],
      },
    });

    const { result } = renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    expect(result.current.explorationBounds).toBeNull();
  });

  it('should calculate bounds when path has 5 or more points', () => {
    const mockPath = Array.from({ length: 6 }, (_, i) => ({
      latitude: 37.7749 + i * 0.001,
      longitude: -122.4194 + i * 0.001,
      timestamp: i,
    }));

    const store = createTestStore({
      exploration: { path: mockPath },
    });

    const { result } = renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    expect(result.current.explorationBounds).toBeDefined();
  });

  it('should trigger animation even when explorationBounds is null (single point users)', () => {
    const store = createTestStore({
      exploration: { path: [] }, // Less than 5 points - but should still animate
    });

    renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    act(() => {
      jest.advanceTimersByTime(5100); // Wait for full animation
    });

    // Should trigger animation even without explorationBounds (for first-time users)
    expect(mockMapView.animateToRegion).toHaveBeenCalled();
  });

  it('should not trigger animation when mapRef.current is null', () => {
    const mockPath = Array.from({ length: 6 }, (_, i) => ({
      latitude: 37.7749 + i * 0.001,
      longitude: -122.4194 + i * 0.001,
      timestamp: i,
    }));

    const store = createTestStore({
      exploration: { path: mockPath },
    });

    const nullMapRef = { current: null };

    renderHook(() => useCinematicZoom({ mapRef: nullMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockMapView.animateToRegion).not.toHaveBeenCalled();
  });

  it('should trigger cinematic zoom with proper conditions', () => {
    const mockPath = Array.from({ length: 6 }, (_, i) => ({
      latitude: 37.7749 + i * 0.001,
      longitude: -122.4194 + i * 0.001,
      timestamp: i,
    }));

    const store = createTestStore({
      exploration: { path: mockPath },
    });

    renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    // Should set the cinematic zoom flag
    expect(mockMapView._cinematicZoomActive).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[ZOOM_DEBUG] Cinematic zoom flag set - preventing other animations'
    );

    // Should call calculateZoomAnimation for the end region only (50m scale)
    expect(mockMapZoomUtils.calculateZoomAnimation).toHaveBeenCalledWith(
      '50m',
      '50m',
      currentLocation,
      400
    );

    // Should constrain the end region
    expect(mockMapConstraints.constrainRegion).toHaveBeenCalledTimes(1);
  });

  it('should only run cinematic zoom once per session', () => {
    const mockPath = Array.from({ length: 6 }, (_, i) => ({
      latitude: 37.7749 + i * 0.001,
      longitude: -122.4194 + i * 0.001,
      timestamp: i,
    }));

    const store = createTestStore({
      exploration: { path: mockPath },
    });

    const { rerender } = renderHook(
      () => useCinematicZoom({ mapRef: mockMapRef, currentLocation }),
      { wrapper: createWrapper(store) }
    );

    // First render should trigger cinematic zoom
    expect(mockMapView._cinematicZoomActive).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[ZOOM_DEBUG] Cinematic zoom flag set - preventing other animations'
    );

    // Clear mocks and rerender (simulating path updates)
    jest.clearAllMocks();
    mockMapView._cinematicZoomActive = false;

    rerender({ mapRef: mockMapRef, currentLocation });

    // Should not trigger again
    expect(mockMapView._cinematicZoomActive).toBe(false);
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      '[ZOOM_DEBUG] Cinematic zoom flag set - preventing other animations'
    );
    expect(mockMapZoomUtils.calculateZoomAnimation).not.toHaveBeenCalled();
  });
});
