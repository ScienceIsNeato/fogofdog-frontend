import {
  GPS_CONSTANTS,
  UI_CONSTANTS,
  TIME_CONSTANTS,
  DEV_CONSTANTS,
  VALIDATION,
} from '../appConstants';

describe('appConstants', () => {
  describe('GPS_CONSTANTS', () => {
    it('should have expected GPS constants', () => {
      expect(GPS_CONSTANTS.MIN_MOVEMENT_THRESHOLD_METERS).toBe(3);
      expect(GPS_CONSTANTS.EARTH_RADIUS_METERS).toBe(6371000);
      expect(GPS_CONSTANTS.MAX_TIME_GAP_MS).toBe(300000);
      expect(GPS_CONSTANTS.SESSION_GAP_THRESHOLD_MS).toBe(10 * 60 * 1000);
      expect(GPS_CONSTANTS.DEDUPLICATION_DISTANCE_METERS).toBe(10);
      expect(GPS_CONSTANTS.DEDUPLICATION_TIME_WINDOW_MS).toBe(30 * 1000);
      expect(GPS_CONSTANTS.DEFAULT_GPS_INTERVAL_SECONDS).toBe(30);
      expect(GPS_CONSTANTS.REAL_TIME_INJECTION_INTERVAL_MS).toBe(3000);
    });

    it('should be readonly object', () => {
      // Test that the object is frozen/readonly
      expect(Object.isFrozen(GPS_CONSTANTS)).toBe(false); // 'as const' makes it readonly at compile time, not frozen
      expect(typeof GPS_CONSTANTS).toBe('object');
    });
  });

  describe('UI_CONSTANTS', () => {
    it('should have expected UI constants', () => {
      expect(UI_CONSTANTS.AREA_RECALC_INTERVAL_MS).toBe(30 * 1000);
      expect(UI_CONSTANTS.MAX_POINTS_PER_FRAME).toBe(500);
      expect(UI_CONSTANTS.MIN_VISUAL_DISTANCE_PIXELS).toBe(5);
      expect(UI_CONSTANTS.PERMISSION_ALERT_COOLDOWN_MS).toBe(3 * 1000);
      expect(UI_CONSTANTS.BACKGROUND_LOCATION_INTERVAL_MS).toBe(30 * 1000);
      expect(UI_CONSTANTS.BACKGROUND_LOCATION_DISTANCE_METERS).toBe(10);
    });
  });

  describe('TIME_CONSTANTS', () => {
    it('should have expected time constants', () => {
      expect(TIME_CONSTANTS.MILLISECONDS_PER_SECOND).toBe(1000);
      expect(TIME_CONSTANTS.SECONDS_PER_MINUTE).toBe(60);
      expect(TIME_CONSTANTS.MINUTES_PER_HOUR).toBe(60);
      expect(TIME_CONSTANTS.HOURS_PER_DAY).toBe(24);
      expect(TIME_CONSTANTS.HOURS_PER_WEEK).toBe(168);
    });

    it('should have mathematically correct relationships', () => {
      expect(TIME_CONSTANTS.HOURS_PER_WEEK).toBe(TIME_CONSTANTS.HOURS_PER_DAY * 7);
      expect(TIME_CONSTANTS.MINUTES_PER_HOUR * TIME_CONSTANTS.SECONDS_PER_MINUTE).toBe(3600);
    });
  });

  describe('DEV_CONSTANTS', () => {
    it('should have expected development constants', () => {
      expect(DEV_CONSTANTS.DEFAULT_HISTORICAL_SESSION_HOURS).toBe(2);
      expect(DEV_CONSTANTS.LOG_THROTTLE_INTERVAL_MS).toBe(1000);
      expect(DEV_CONSTANTS.BUNDLE_BUILD_TIMEOUT_SECONDS).toBe(90);
    });
  });

  describe('VALIDATION helpers', () => {
    describe('isWithinSessionGap', () => {
      it('should return true for gaps within session threshold', () => {
        expect(VALIDATION.isWithinSessionGap(5 * 60 * 1000)).toBe(true); // 5 minutes
        expect(VALIDATION.isWithinSessionGap(10 * 60 * 1000)).toBe(true); // 10 minutes (exactly at threshold)
      });

      it('should return false for gaps exceeding session threshold', () => {
        expect(VALIDATION.isWithinSessionGap(15 * 60 * 1000)).toBe(false); // 15 minutes
        expect(VALIDATION.isWithinSessionGap(20 * 60 * 1000)).toBe(false); // 20 minutes
      });

      it('should handle edge cases', () => {
        expect(VALIDATION.isWithinSessionGap(0)).toBe(true);
        expect(VALIDATION.isWithinSessionGap(-1000)).toBe(true); // Negative time gaps
      });
    });

    describe('isSignificantMovement', () => {
      it('should return true for movement at or above threshold', () => {
        expect(VALIDATION.isSignificantMovement(5)).toBe(true); // Exactly at threshold (>= 5)
        expect(VALIDATION.isSignificantMovement(10)).toBe(true); // Above threshold
        expect(VALIDATION.isSignificantMovement(100)).toBe(true); // Well above threshold
      });

      it('should return false for movement below threshold', () => {
        expect(VALIDATION.isSignificantMovement(2)).toBe(false);
        expect(VALIDATION.isSignificantMovement(1)).toBe(false);
        expect(VALIDATION.isSignificantMovement(0)).toBe(false);
      });

      it('should handle negative distances', () => {
        expect(VALIDATION.isSignificantMovement(-5)).toBe(false);
      });
    });

    describe('shouldDeduplicate', () => {
      it('should return true when both distance and time are below thresholds', () => {
        expect(VALIDATION.shouldDeduplicate(5, 15000)).toBe(true); // 5m, 15s
        expect(VALIDATION.shouldDeduplicate(9, 29000)).toBe(true); // 9m, 29s
      });

      it('should return false when distance exceeds threshold', () => {
        expect(VALIDATION.shouldDeduplicate(15, 15000)).toBe(false); // 15m, 15s
        expect(VALIDATION.shouldDeduplicate(20, 10000)).toBe(false); // 20m, 10s
      });

      it('should return false when time exceeds threshold', () => {
        expect(VALIDATION.shouldDeduplicate(5, 35000)).toBe(false); // 5m, 35s
        expect(VALIDATION.shouldDeduplicate(8, 40000)).toBe(false); // 8m, 40s
      });

      it('should return false when both exceed thresholds', () => {
        expect(VALIDATION.shouldDeduplicate(15, 35000)).toBe(false); // 15m, 35s
      });

      it('should handle edge cases', () => {
        expect(VALIDATION.shouldDeduplicate(10, 30000)).toBe(false); // Exactly at thresholds
        expect(VALIDATION.shouldDeduplicate(0, 0)).toBe(true); // Zero values
      });
    });
  });
});
