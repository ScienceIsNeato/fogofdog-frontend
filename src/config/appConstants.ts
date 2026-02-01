/**
 * Application Constants
 *
 * Centralized location for all application-wide constants to eliminate
 * magic numbers and improve maintainability.
 */

/**
 * GPS and Location Constants
 */
export const GPS_CONSTANTS = {
  // Distance and movement
  MIN_MOVEMENT_THRESHOLD_METERS: 3, // Minimum movement to count as active (lowered for synthetic data)
  EARTH_RADIUS_METERS: 6371000, // Earth radius for Haversine calculations

  // Time thresholds
  MAX_TIME_GAP_MS: 300000, // 5 minutes max between points for time tracking
  SESSION_GAP_THRESHOLD_MS: 10 * 60 * 1000, // 10 minutes gap = new session

  // Deduplication settings
  DEDUPLICATION_DISTANCE_METERS: 10, // Distance threshold for duplicate detection
  DEDUPLICATION_TIME_WINDOW_MS: 30 * 1000, // 30 seconds time window

  // GPS injection and performance testing
  DEFAULT_GPS_INTERVAL_SECONDS: 30, // Default interval for generated GPS points
  REAL_TIME_INJECTION_INTERVAL_MS: 3000, // 3 seconds between real-time injections for realistic speed
} as const;

/**
 * UI and Performance Constants
 */
export const UI_CONSTANTS = {
  // Area recalculation
  AREA_RECALC_INTERVAL_MS: 30 * 1000, // 30 seconds between area recalculations

  // Performance limits
  MAX_POINTS_PER_FRAME: 500, // Limit for fog overlay performance
  MIN_VISUAL_DISTANCE_PIXELS: 5, // Skip points closer than 5px visually

  // Alert and notification cooldowns
  PERMISSION_ALERT_COOLDOWN_MS: 3 * 1000, // 3 seconds between permission alerts

  // Background location service
  BACKGROUND_LOCATION_INTERVAL_MS: 30 * 1000, // 30 seconds for background updates
  BACKGROUND_LOCATION_DISTANCE_METERS: 10, // 10 meters minimum distance
} as const;

/**
 * Time Formatting Constants
 */
export const TIME_CONSTANTS = {
  MILLISECONDS_PER_SECOND: 1000,
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  HOURS_PER_DAY: 24,
  HOURS_PER_WEEK: 168,
} as const;

/**
 * Test and Development Constants
 */
export const DEV_CONSTANTS = {
  // Performance testing
  DEFAULT_HISTORICAL_SESSION_HOURS: 2, // Default duration for historical GPS data

  // Logging
  LOG_THROTTLE_INTERVAL_MS: 1000, // Minimum interval between throttled logs

  // Quality gates
  BUNDLE_BUILD_TIMEOUT_SECONDS: 90, // Timeout for bundle creation tests
} as const;

/**
 * Validation helpers to ensure constants are used correctly
 */
export const VALIDATION = {
  /**
   * Check if a time gap is within session threshold
   */
  isWithinSessionGap: (gapMs: number): boolean => {
    return gapMs <= GPS_CONSTANTS.SESSION_GAP_THRESHOLD_MS;
  },

  /**
   * Check if movement is above threshold
   */
  isSignificantMovement: (distanceMeters: number): boolean => {
    return distanceMeters >= GPS_CONSTANTS.MIN_MOVEMENT_THRESHOLD_METERS;
  },

  /**
   * Check if coordinates should be deduplicated
   */
  shouldDeduplicate: (distanceMeters: number, timeGapMs: number): boolean => {
    return (
      distanceMeters < GPS_CONSTANTS.DEDUPLICATION_DISTANCE_METERS &&
      timeGapMs < GPS_CONSTANTS.DEDUPLICATION_TIME_WINDOW_MS
    );
  },
} as const;
