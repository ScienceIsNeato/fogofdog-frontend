import { renderHook, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useCinematicZoom } from '../useCinematicZoom';
import explorationReducer from '../../../../store/slices/explorationSlice';
import statsReducer from '../../../../store/slices/statsSlice';
import userReducer from '../../../../store/slices/userSlice';
import skinReducer from '../../../../store/slices/skinSlice';
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
      skin: skinReducer,
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
  let mockGeoPoint: GeoPoint;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockMapRef = { current: mockMapView };
    currentLocation = {
      latitude: 37.7749,
      longitude: -122.4194,
      timestamp: Date.now(),
    };
    mockGeoPoint = {
      latitude: 37.7849,
      longitude: -122.4094,
      timestamp: Date.now() - 1000,
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

  it('should return null when no location is available', () => {
    const store = createTestStore({
      exploration: { path: [] },
    });

    const { result } = renderHook(
      () => useCinematicZoom({ mapRef: mockMapRef, currentLocation: null }),
      { wrapper: createWrapper(store) }
    );

    // Should return null until real location is available
    expect(result.current.initialRegion).toBeNull();
  });

  it('should return null explorationBounds when path is empty', () => {
    const store = createTestStore({
      exploration: {
        path: [], // Empty path should return null bounds
      },
    });

    const { result } = renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    expect(result.current.explorationBounds).toBeNull();
  });

  it('should calculate bounds when path has 1 or more points', () => {
    const mockPath = Array.from({ length: 1 }, (_, i) => ({
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
    expect(mockLogger.debug).toHaveBeenCalledWith('Animation lock enabled', {
      component: 'useCinematicZoom',
    });

    // calculateZoomAnimation and constrainRegion are no longer called in the simplified version
    expect(mockMapZoomUtils.calculateZoomAnimation).not.toHaveBeenCalled();
    expect(mockMapConstraints.constrainRegion).not.toHaveBeenCalled();
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
    expect(mockLogger.debug).toHaveBeenCalledWith('Animation lock enabled', {
      component: 'useCinematicZoom',
    });

    // Clear mocks and rerender (simulating path updates)
    jest.clearAllMocks();
    mockMapView._cinematicZoomActive = false;

    rerender({ mapRef: mockMapRef, currentLocation });

    // Should not trigger again
    expect(mockMapView._cinematicZoomActive).toBe(false);
    expect(mockLogger.debug).not.toHaveBeenCalledWith('Animation lock enabled', {
      component: 'useCinematicZoom',
    });
    expect(mockMapZoomUtils.calculateZoomAnimation).not.toHaveBeenCalled();
  });

  it('should not trigger cinematic zoom during GPS injection', () => {
    const store = createTestStore({
      exploration: {
        path: [mockGeoPoint],
        gpsInjectionStatus: {
          isRunning: true,
          type: 'real-time',
          message: 'Injecting GPS data...',
        },
      },
    });

    renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Should not trigger animation during GPS injection
    expect(mockMapView.animateToRegion).not.toHaveBeenCalled();
    expect(mockMapView._cinematicZoomActive).toBe(false);
  });

  it('should trigger cinematic zoom when GPS injection stops', () => {
    const store = createTestStore({
      exploration: {
        path: [mockGeoPoint],
        gpsInjectionStatus: {
          isRunning: false,
          type: null,
          message: '',
        },
      },
    });

    renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Should trigger animation when GPS injection is not running
    expect(mockMapView.animateToRegion).toHaveBeenCalledTimes(2);
    expect(mockMapView._cinematicZoomActive).toBe(true);
  });

  it('should not trigger multiple animations simultaneously', () => {
    const store = createTestStore({
      exploration: { path: [mockGeoPoint] },
    });

    const { rerender } = renderHook(
      () => useCinematicZoom({ mapRef: mockMapRef, currentLocation }),
      {
        wrapper: createWrapper(store),
      }
    );

    // First render starts animation
    act(() => {
      jest.advanceTimersByTime(100); // Start animation but don't complete it
    });

    expect(mockMapView.animateToRegion).toHaveBeenCalledTimes(2);
    jest.clearAllMocks();

    // Immediate re-render should not start another animation (already in progress)
    rerender({ mapRef: mockMapRef, currentLocation });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Should not trigger another animation while first is in progress
    expect(mockMapView.animateToRegion).not.toHaveBeenCalled();
  });

  it('should handle edge case with single point in path', () => {
    const store = createTestStore({
      exploration: { path: [mockGeoPoint] }, // Only 1 point
    });

    const { result } = renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    // Should return valid initial region (may use cinematic calculation or fallback)
    expect(result.current.initialRegion).toBeDefined();
    expect(result.current.initialRegion?.latitude).toBeCloseTo(currentLocation.latitude, 1);
    expect(result.current.initialRegion?.longitude).toBeCloseTo(currentLocation.longitude, 1);
    expect(result.current.initialRegion?.latitudeDelta).toBeDefined();
  });

  it('should complete full animation lifecycle including cleanup', () => {
    const store = createTestStore({
      exploration: { path: [mockGeoPoint] },
    });

    renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    // Start animation
    act(() => {
      jest.advanceTimersByTime(1000); // CINEMATIC_ZOOM_DELAY
    });

    expect(mockMapView._cinematicZoomActive).toBe(true);

    // Complete full animation including cleanup
    act(() => {
      jest.advanceTimersByTime(5200); // CINEMATIC_ZOOM_DURATION + 200 cleanup
    });

    // Animation should be cleaned up
    expect(mockMapView.animateToRegion).toHaveBeenCalledTimes(2);
  });

  it('should handle path with multiple points for travel direction calculation', () => {
    const multiPointPath = [
      { latitude: 44.052, longitude: -123.0867 },
      { latitude: 44.0521, longitude: -123.0866 },
      { latitude: 44.0522, longitude: -123.0865 },
      { latitude: 44.0523, longitude: -123.0864 },
    ];

    const store = createTestStore({
      exploration: { path: multiPointPath },
    });

    const { result } = renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    // Should calculate start region using travel direction
    expect(result.current.initialRegion).toBeDefined();
    expect(result.current.initialRegion?.latitude).toBeDefined();
    expect(result.current.initialRegion?.longitude).toBeDefined();
  });

  it('should handle fallback direction when no clear travel direction exists', () => {
    // Create path with very small movements (below direction threshold)
    const smallMovementPath = [
      { latitude: 44.052, longitude: -123.0867 },
      { latitude: 44.052, longitude: -123.0867 }, // Same location
    ];

    const store = createTestStore({
      exploration: { path: smallMovementPath },
    });

    const { result } = renderHook(() => useCinematicZoom({ mapRef: mockMapRef, currentLocation }), {
      wrapper: createWrapper(store),
    });

    // Should still provide valid start region with fallback logic
    expect(result.current.initialRegion).toBeDefined();
    expect(result.current.initialRegion?.latitudeDelta).toBeGreaterThan(0);
  });
});
