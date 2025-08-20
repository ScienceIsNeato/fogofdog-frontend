import { StatsCalculationService, StatsState } from '../StatsCalculationService';
import { GPSEvent } from '../../types/GPSEvent';

describe('StatsCalculationService', () => {
  // Helper function to create test GPS points
  const createGPSEvent = (lat: number, lon: number, timestamp: number): GPSEvent => {
    return new GPSEvent(lat, lon, timestamp);
  };

  // Helper function to create a simple path for testing
  const createTestPath = (): GPSEvent[] => [
    createGPSEvent(40.7128, -74.006, 1000), // NYC
    createGPSEvent(40.7589, -73.9851, 2000), // Times Square (1 second later)
    createGPSEvent(40.7614, -73.9776, 3000), // Central Park (1 second later)
  ];

  describe('calculateTotalsFromHistory', () => {
    it('should handle empty history correctly', () => {
      const result = StatsCalculationService.calculateTotalsFromHistory([]);

      expect(result.total.distance).toBe(0);
      expect(result.total.area).toBe(0);
      expect(result.total.time).toBe(0);
      expect(result.session.distance).toBe(0);
      expect(result.session.area).toBe(0);
      expect(result.session.time).toBe(0);
      expect(result.isInitialized).toBe(true);
      expect(result.lastProcessedPoint).toBeNull();
      expect(result.currentSession.sessionId).toBeDefined();
      expect(result.currentSession.startTime).toBeGreaterThan(0);
      expect(result.currentSession.endTime).toBeUndefined();
    });

    it('should handle single point correctly', () => {
      const singlePoint = [createGPSEvent(40.7128, -74.006, 1000)];
      const result = StatsCalculationService.calculateTotalsFromHistory(singlePoint);

      expect(result.total.distance).toBe(0); // No distance with single point
      expect(result.total.time).toBe(0); // No time with single point
      expect(result.isInitialized).toBe(true);
      expect(result.lastProcessedPoint).toBeNull(); // Fresh session starts with null
    });

    it('should calculate distance correctly for two points', () => {
      const twoPoints = [
        createGPSEvent(40.7128, -74.006, 1000), // NYC
        createGPSEvent(40.7589, -73.9851, 2000), // Times Square
      ];
      const result = StatsCalculationService.calculateTotalsFromHistory(twoPoints);

      // Distance between NYC and Times Square is approximately 5.2km
      expect(result.total.distance).toBeGreaterThan(5000);
      expect(result.total.distance).toBeLessThan(6000);
      expect(result.total.time).toBe(1000); // 1 second between points
      expect(result.session.distance).toBe(0); // Fresh session
      expect(result.session.time).toBe(0);
    });

    it('should calculate stats for longer path', () => {
      const testPath = createTestPath();
      const result = StatsCalculationService.calculateTotalsFromHistory(testPath);

      expect(result.total.distance).toBeGreaterThan(0);
      expect(result.total.time).toBe(2000); // 2 seconds total (1000ms + 1000ms)
      expect(result.total.area).toBeGreaterThan(0); // Should have some area with 3+ points
      expect(result.session.distance).toBe(0); // Fresh session
      expect(result.isInitialized).toBe(true);
    });

    it('should ignore tiny movements below threshold', () => {
      const tinyMovements = [
        createGPSEvent(40.7128, -74.006, 1000),
        createGPSEvent(40.7128001, -74.0060001, 2000), // ~0.1m movement
        createGPSEvent(40.7128002, -74.0060002, 3000), // ~0.1m movement
      ];
      const result = StatsCalculationService.calculateTotalsFromHistory(tinyMovements);

      expect(result.total.distance).toBe(0); // Below 5m threshold
      expect(result.total.time).toBe(2000); // Time still counts (session duration: 3000-1000 = 2000ms)
    });

    it('should ignore large time gaps', () => {
      const largeGaps = [
        createGPSEvent(40.7128, -74.006, 1000),
        createGPSEvent(40.7589, -73.9851, 400000), // 6+ minute gap
      ];
      const result = StatsCalculationService.calculateTotalsFromHistory(largeGaps);

      expect(result.total.distance).toBeGreaterThan(0); // Distance should still count
      expect(result.total.time).toBe(399000); // Time counts (session duration: 400000-1000 = 399000ms)
    });

    it('should handle realistic GPS path with noise', () => {
      // Simulate a walk with some GPS noise
      const noisyPath = [
        createGPSEvent(40.7128, -74.006, 1000),
        createGPSEvent(40.7129, -74.0061, 2000), // ~15m movement
        createGPSEvent(40.7128, -74.006, 3000), // GPS noise back to start
        createGPSEvent(40.713, -74.0062, 4000), // ~30m movement
      ];
      const result = StatsCalculationService.calculateTotalsFromHistory(noisyPath);

      expect(result.total.distance).toBeGreaterThan(0);
      expect(result.total.time).toBeGreaterThan(0);
      expect(result.total.time).toBeLessThanOrEqual(3000); // Should filter some noise
    });
  });

  describe('incrementStats', () => {
    let initializedState: StatsState;

    beforeEach(() => {
      // Create an initialized state with some history
      const history = createTestPath();
      initializedState = StatsCalculationService.calculateTotalsFromHistory(history);
    });

    it('should reject updates on uninitialized service', () => {
      global.expectConsoleErrors = true; // This test expects console warnings

      const uninitializedState = StatsCalculationService.createInitialState();
      const newPoint = createGPSEvent(40.7615, -73.9777, 4000);

      const result = StatsCalculationService.incrementStats(uninitializedState, newPoint);

      expect(result).toBe(uninitializedState); // Should return unchanged state
    });

    it('should increment distance and time correctly', () => {
      // Use a timestamp that's after the session start time
      const sessionStartTime = initializedState.currentSession.startTime;

      // First point establishes baseline (no distance added)
      const firstPoint = createGPSEvent(40.7614, -73.9776, sessionStartTime + 1000);
      const stateWithFirstPoint = StatsCalculationService.incrementStats(
        initializedState,
        firstPoint
      );

      // Second point should add distance
      const secondPoint = createGPSEvent(40.762, -73.977, sessionStartTime + 2000);
      const result = StatsCalculationService.incrementStats(stateWithFirstPoint, secondPoint);

      expect(result.total.distance).toBeGreaterThanOrEqual(initializedState.total.distance);
      expect(result.total.time).toBeGreaterThanOrEqual(initializedState.total.time);
      expect(result.session.distance).toBeGreaterThan(0);
      expect(result.session.time).toBeGreaterThan(0);
      expect(result.lastProcessedPoint).toEqual({
        latitude: 40.762,
        longitude: -73.977,
        timestamp: sessionStartTime + 2000,
      });
    });

    it('should ignore tiny movements in incremental updates', () => {
      const tinyMovement = createGPSEvent(40.7614001, -73.9776001, 4000); // ~0.1m
      const originalDistance = initializedState.total.distance;

      const result = StatsCalculationService.incrementStats(initializedState, tinyMovement);

      expect(result.total.distance).toBe(originalDistance); // No change
      expect(result.session.distance).toBe(0); // No change
    });

    it('should ignore points outside current session', () => {
      // End the current session first
      const endedSession = StatsCalculationService.endCurrentSession(initializedState);

      // Try to add a point from before the session started
      const oldPoint = createGPSEvent(40.7615, -73.9777, 500); // Before session start
      const result = StatsCalculationService.incrementStats(endedSession, oldPoint);

      expect(result.session.distance).toBe(0); // Should not increment session
      expect(result.total.distance).toBe(endedSession.total.distance); // Should not increment total
    });

    it('should handle large time gaps gracefully', () => {
      const largeGap = createGPSEvent(40.7615, -73.9777, 400000); // 6+ minute later
      const originalTime = initializedState.total.time;

      const result = StatsCalculationService.incrementStats(initializedState, largeGap);

      expect(result.total.time).toBe(originalTime); // Time should not increment
      expect(result.session.time).toBe(0); // Session time should not increment
    });

    it('should handle first point correctly (no previous point)', () => {
      const freshState = StatsCalculationService.calculateTotalsFromHistory([]);
      const sessionStartTime = freshState.currentSession.startTime;
      const firstPoint = createGPSEvent(40.7128, -74.006, sessionStartTime + 1000);

      const result = StatsCalculationService.incrementStats(freshState, firstPoint);

      expect(result.total.distance).toBe(0); // No distance without previous point
      expect(result.session.distance).toBe(0);
      expect(result.lastProcessedPoint).toEqual({
        latitude: 40.7128,
        longitude: -74.006,
        timestamp: sessionStartTime + 1000,
      });
    });
  });

  describe('session management', () => {
    let testState: StatsState;

    beforeEach(() => {
      testState = StatsCalculationService.calculateTotalsFromHistory(createTestPath());
    });

    it('should start new session correctly', () => {
      const originalSessionId = testState.currentSession.sessionId;

      const result = StatsCalculationService.startNewSession(testState);

      expect(result.session.distance).toBe(0);
      expect(result.session.area).toBe(0);
      expect(result.session.time).toBe(0);
      expect(result.currentSession.sessionId).not.toBe(originalSessionId);
      expect(result.currentSession.startTime).toBeGreaterThanOrEqual(
        testState.currentSession.startTime
      );
      expect(result.currentSession.endTime).toBeUndefined();
      expect(result.total).toEqual(testState.total); // Total should be preserved
    });

    it('should end session correctly', () => {
      const result = StatsCalculationService.endCurrentSession(testState);

      expect(result.currentSession.endTime).toBeGreaterThanOrEqual(result.currentSession.startTime);
      expect(result.currentSession.sessionId).toBe(testState.currentSession.sessionId);
      expect(result.session).toEqual(testState.session); // Session stats preserved
      expect(result.total).toEqual(testState.total); // Total stats preserved
    });

    it('should generate unique session IDs', () => {
      const session1 = StatsCalculationService.startNewSession(testState);
      const session2 = StatsCalculationService.startNewSession(testState);

      expect(session1.currentSession.sessionId).not.toBe(session2.currentSession.sessionId);
    });
  });

  describe('utility functions', () => {
    it('should convert between GPS formats correctly', () => {
      const gpsEvent = createGPSEvent(40.7128, -74.006, 1000);
      const serializable = StatsCalculationService.gpsEventToSerializable(gpsEvent);
      const backToGPS = StatsCalculationService.serializableToGPSEvent(serializable);

      expect(serializable).toEqual({
        latitude: 40.7128,
        longitude: -74.006,
        timestamp: 1000,
      });
      expect(backToGPS.latitude).toBe(gpsEvent.latitude);
      expect(backToGPS.longitude).toBe(gpsEvent.longitude);
      expect(backToGPS.timestamp).toBe(gpsEvent.timestamp);
    });

    it('should format distances correctly', () => {
      expect(StatsCalculationService.formatDistance(500)).toBe('500m');
      expect(StatsCalculationService.formatDistance(1500)).toBe('1.50km');
      expect(StatsCalculationService.formatDistance(12345)).toBe('12.35km');
    });

    it('should format areas correctly', () => {
      expect(StatsCalculationService.formatArea(5000)).toBe('5000m²');
      expect(StatsCalculationService.formatArea(15000)).toBe('0.01km²');
      expect(StatsCalculationService.formatArea(1500000)).toBe('1.50km²');
    });

    it('should format times correctly in days/hours/minutes', () => {
      expect(StatsCalculationService.formatTime(30000)).toBe('1m'); // 30 seconds rounds up to 1 minute
      expect(StatsCalculationService.formatTime(90000)).toBe('2m'); // 1.5 minutes (rounds up)
      expect(StatsCalculationService.formatTime(3600000)).toBe('1h 0m'); // 1 hour exactly
      expect(StatsCalculationService.formatTime(3660000)).toBe('1h 1m'); // 1 hour 1 minute
      expect(StatsCalculationService.formatTime(7200000)).toBe('2h 0m'); // 2 hours
      expect(StatsCalculationService.formatTime(7320000)).toBe('2h 2m'); // 2 hours 2 minutes
      expect(StatsCalculationService.formatTime(86400000)).toBe('1d 0h 0m'); // 1 day
      expect(StatsCalculationService.formatTime(90000000)).toBe('1d 1h 0m'); // 1 day 1 hour
      expect(StatsCalculationService.formatTime(93780000)).toBe('1d 2h 3m'); // 1 day 2 hours 3 minutes
      expect(StatsCalculationService.formatTime(172800000)).toBe('2d 0h 0m'); // 2 days
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle NaN coordinates gracefully', () => {
      const invalidPath = [createGPSEvent(NaN, -74.006, 1000), createGPSEvent(40.7589, NaN, 2000)];

      // Should not throw, should return reasonable defaults
      expect(() => {
        StatsCalculationService.calculateTotalsFromHistory(invalidPath);
      }).not.toThrow();
    });

    it('should handle negative timestamps', () => {
      const negativePath = [
        createGPSEvent(40.7128, -74.006, -1000),
        createGPSEvent(40.7589, -73.9851, -500),
      ];

      const result = StatsCalculationService.calculateTotalsFromHistory(negativePath);
      expect(result.total.time).toBe(500); // Time difference is positive (500ms)
    });

    it('should handle extremely large coordinates', () => {
      const extremePath = [createGPSEvent(90, 180, 1000), createGPSEvent(-90, -180, 2000)];

      expect(() => {
        StatsCalculationService.calculateTotalsFromHistory(extremePath);
      }).not.toThrow();
    });

    it('should handle very large datasets efficiently', () => {
      // Generate 1000 GPS points
      const largeDataset = Array.from({ length: 1000 }, (_, i) =>
        createGPSEvent(40.7128 + i * 0.0001, -74.006 + i * 0.0001, 1000 + i * 1000)
      );

      const startTime = performance.now();
      const result = StatsCalculationService.calculateTotalsFromHistory(largeDataset);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete in <1 second
      expect(result.total.distance).toBeGreaterThan(0);
      expect(result.isInitialized).toBe(true);
    });
  });

  describe('session gap detection', () => {
    it('should detect session gaps and count session durations', () => {
      // Create path with a 15-minute gap (should be detected as 2 sessions)
      const pathWithGap = [
        createGPSEvent(40.7128, -74.006, 1000), // Session 1 start
        createGPSEvent(40.7138, -74.007, 2000), // 1 second later
        createGPSEvent(40.7148, -74.008, 3000), // Session 1 end (duration: 3000-1000 = 2000ms)
        // 15-minute gap here (900,000ms > 10-minute threshold)
        createGPSEvent(40.7158, -74.009, 903000), // Session 2 start
        createGPSEvent(40.7168, -74.01, 904000), // Session 2 end (duration: 904000-903000 = 1000ms)
      ];

      const result = StatsCalculationService.calculateTotalsFromHistory(pathWithGap);

      // Should count session durations: Session 1 (2000ms) + Session 2 (1000ms) = 3000ms
      expect(result.total.time).toBe(3000);
      expect(result.total.distance).toBeGreaterThan(0);
    });

    it('should not detect gaps for continuous activity under threshold', () => {
      // Create path with 5-minute gaps (under 10-minute threshold, treated as one session)
      const continuousPath = [
        createGPSEvent(40.7128, -74.006, 1000), // Session start
        createGPSEvent(40.7138, -74.007, 301000), // 5 minutes later
        createGPSEvent(40.7148, -74.008, 601000), // 5 minutes later
        createGPSEvent(40.7158, -74.009, 901000), // Session end (duration: 901000-1000 = 900000ms)
      ];

      const result = StatsCalculationService.calculateTotalsFromHistory(continuousPath);

      // Should count full session duration: 15 minutes total
      expect(result.total.time).toBe(900000); // 15 minutes
    });

    it('should handle multiple session gaps correctly', () => {
      const pathWithMultipleGaps = [
        // Session 1: duration = 3000 - 1000 = 2000ms
        createGPSEvent(40.7128, -74.006, 1000), // Session 1 start
        createGPSEvent(40.7138, -74.007, 2000),
        createGPSEvent(40.7148, -74.008, 3000), // Session 1 end

        // 20-minute gap
        createGPSEvent(40.7158, -74.009, 1203000), // Session 2 start (20 minutes later)

        // Session 2: duration = 1207000 - 1203000 = 4000ms
        createGPSEvent(40.7168, -74.01, 1204000),
        createGPSEvent(40.7178, -74.011, 1205000),
        createGPSEvent(40.7188, -74.012, 1206000),
        createGPSEvent(40.7198, -74.013, 1207000), // Session 2 end

        // 30-minute gap
        createGPSEvent(40.7208, -74.014, 3007000), // Session 3 start (30 minutes later)

        // Session 3: duration = 3008000 - 3007000 = 1000ms
        createGPSEvent(40.7218, -74.015, 3008000), // Session 3 end
      ];

      const result = StatsCalculationService.calculateTotalsFromHistory(pathWithMultipleGaps);

      // Should count session durations: 2000ms + 4000ms + 1000ms = 7000ms total
      expect(result.total.time).toBe(7000);
    });

    it('should handle edge case with gap exactly at threshold', () => {
      const pathAtThreshold = [
        createGPSEvent(40.7128, -74.006, 1000), // Session start
        createGPSEvent(40.7138, -74.007, 2000),
        // Exactly 10 minutes gap (at threshold, should still be continuous)
        createGPSEvent(40.7148, -74.008, 602000), // 10 minutes later
        createGPSEvent(40.7158, -74.009, 603000), // Session end
      ];

      const result = StatsCalculationService.calculateTotalsFromHistory(pathAtThreshold);

      // At threshold should still count as one continuous session: 603000 - 1000 = 602000ms
      expect(result.total.time).toBe(602000); // Full session duration counted
    });

    it('should handle path starting with a large timestamp', () => {
      // Test session duration calculation with large timestamps
      const laterStartPath = [
        createGPSEvent(40.7128, -74.006, 1000000), // Session start at 1000 seconds
        createGPSEvent(40.7138, -74.007, 1001000), // 1 second later
        createGPSEvent(40.7148, -74.008, 1002000), // Session end (duration: 1002000 - 1000000 = 2000ms)
      ];

      const result = StatsCalculationService.calculateTotalsFromHistory(laterStartPath);

      // Should count session duration: 2 seconds
      expect(result.total.time).toBe(2000);
    });
  });

  describe('integration scenarios', () => {
    it('should handle app startup with existing history', () => {
      // Simulate existing user with GPS history
      const existingHistory = [
        createGPSEvent(40.7128, -74.006, 1000),
        createGPSEvent(40.7589, -73.9851, 2000),
        createGPSEvent(40.7614, -73.9776, 3000),
      ];

      // App starts up, processes history
      const initialState = StatsCalculationService.calculateTotalsFromHistory(existingHistory);

      expect(initialState.total.distance).toBeGreaterThan(0);
      expect(initialState.total.time).toBeGreaterThan(0);
      expect(initialState.session.distance).toBe(0); // Fresh session
      expect(initialState.isInitialized).toBe(true);

      // User starts moving, adds new points
      const sessionStartTime = initialState.currentSession.startTime;
      const firstPoint = createGPSEvent(40.7614, -73.9776, sessionStartTime + 1000); // Baseline point
      const stateAfterFirst = StatsCalculationService.incrementStats(initialState, firstPoint);

      const secondPoint = createGPSEvent(40.762, -73.977, sessionStartTime + 2000); // Movement
      const updated1 = StatsCalculationService.incrementStats(stateAfterFirst, secondPoint);

      expect(updated1.session.distance).toBeGreaterThan(0);
      expect(updated1.total.distance).toBeGreaterThanOrEqual(initialState.total.distance);
    });

    it('should handle history management changes', () => {
      // User has some history
      const originalHistory = createTestPath();
      const originalState = StatsCalculationService.calculateTotalsFromHistory(originalHistory);

      // User clears some history, service recalculates
      const reducedHistory = originalHistory.slice(1); // Remove first point
      const recalculatedState = StatsCalculationService.calculateTotalsFromHistory(reducedHistory);

      expect(recalculatedState.total.distance).toBeLessThan(originalState.total.distance);
      expect(recalculatedState.isInitialized).toBe(true);
    });

    it('should handle pause/resume flow', () => {
      const state = StatsCalculationService.calculateTotalsFromHistory(createTestPath());

      // Add some session activity
      const sessionStartTime = state.currentSession.startTime;
      const firstPoint = createGPSEvent(40.7614, -73.9776, sessionStartTime + 1000);
      const stateAfterFirst = StatsCalculationService.incrementStats(state, firstPoint);

      const secondPoint = createGPSEvent(40.762, -73.977, sessionStartTime + 2000);
      const activeState = StatsCalculationService.incrementStats(stateAfterFirst, secondPoint);

      expect(activeState.session.distance).toBeGreaterThan(0);

      // End session (pause)
      const pausedState = StatsCalculationService.endCurrentSession(activeState);

      // Try to add point while paused (should be ignored for session)
      const point2 = createGPSEvent(40.7625, -73.9765, sessionStartTime + 2000);
      const stillPausedState = StatsCalculationService.incrementStats(pausedState, point2);

      expect(stillPausedState.session.distance).toBe(activeState.session.distance); // No change

      // Start new session (resume)
      const resumedState = StatsCalculationService.startNewSession(stillPausedState);

      expect(resumedState.session.distance).toBe(0); // Fresh session
      expect(resumedState.total.distance).toBeGreaterThanOrEqual(activeState.total.distance); // Total preserved + increment
    });
  });
});
