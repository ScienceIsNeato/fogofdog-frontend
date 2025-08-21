import { GPSEvent } from '../types/GPSEvent';
import { GeoPoint } from '../types/user';
import { logger } from '../utils/logger';

/**
 * Statistics data structure for both session and total stats
 */
export interface ExplorationStats {
  distance: number; // meters
  area: number; // square meters
  time: number; // milliseconds
}

/**
 * Serializable GPS point for Redux state
 */
export interface SerializableGPSPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

/**
 * Session tracking information
 */
export interface SessionInfo {
  sessionId: string;
  startTime: number;
  endTime?: number;
  // Pause tracking for accurate session timing
  lastActiveTime?: number; // Last time tracking was active (for calculating pause duration)
  totalPausedTime: number; // Total time spent paused during this session
}

/**
 * Complete stats state interface (used by Redux)
 */
export interface StatsState {
  total: ExplorationStats;
  session: ExplorationStats;
  currentSession: SessionInfo;

  lastProcessedPoint: SerializableGPSPoint | null;
  isInitialized: boolean;
}

/**
 * Service for calculating exploration statistics from GPS data
 * Handles distance, area, and time calculations for both session and lifetime stats
 */
export class StatsCalculationService {
  private static readonly EARTH_RADIUS_METERS = 6371000;
  private static readonly MIN_MOVEMENT_THRESHOLD_METERS = 5; // Minimum movement to count as active
  private static readonly MAX_TIME_GAP_MS = 300000; // 5 minutes max between points for time tracking
  private static readonly SESSION_GAP_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes gap = new session

  /**
   * Calculate distance between two GPS points using Haversine formula
   */
  static calculateDistance(point1: GPSEvent, point2: GPSEvent): number {
    const lat1Rad = (point1.latitude * Math.PI) / 180;
    const lat2Rad = (point2.latitude * Math.PI) / 180;
    const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const deltaLonRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return this.EARTH_RADIUS_METERS * c;
  }

  /**
   * Calculate area using shoelace formula
   */
  static calculateArea(path: SerializableGPSPoint[]): number {
    if (path.length < 3) {
      return 0; // Need at least 3 points to form an area
    }

    let area = 0;
    const n = path.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = path[i]!.longitude;
      const yi = path[i]!.latitude;
      const xj = path[j]!.longitude;
      const yj = path[j]!.latitude;

      area += xi * yj - xj * yi;
    }

    // Convert to square meters (rough approximation)
    area = Math.abs(area) / 2;
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos((path[0]!.latitude * Math.PI) / 180);

    return area * metersPerDegreeLat * metersPerDegreeLng;
  }

  /**
   * Calculate active time from GPS path, filtering out large gaps
   */
  static calculateActiveTime(path: SerializableGPSPoint[]): number {
    if (path.length < 2) {
      return 0;
    }

    let activeTime = 0;

    for (let i = 1; i < path.length; i++) {
      const timeDelta = path[i]!.timestamp - path[i - 1]!.timestamp;

      // Only count time if it's reasonable (not too large a gap)
      if (timeDelta > 0 && timeDelta <= this.MAX_TIME_GAP_MS) {
        activeTime += timeDelta;
      }
    }

    return activeTime;
  }

  /**
   * Extract sessions from GPS path based on time gaps
   * Sessions are separated by gaps larger than SESSION_GAP_THRESHOLD_MS
   */
  private static extractSessionsFromPath(
    gpsHistory: GPSEvent[]
  ): { startTime: number; endTime: number }[] {
    if (gpsHistory.length === 0) {
      return [];
    }

    if (gpsHistory.length === 1) {
      // Single point = no session duration
      return [];
    }

    const sessions: { startTime: number; endTime: number }[] = [];
    let currentSessionStart = gpsHistory[0]!.timestamp;

    // Show first few points for debugging
    const samplePoints = gpsHistory.slice(0, 5).map((point, index) => ({
      index,
      timestamp: new Date(point.timestamp).toISOString(),
      lat: point.latitude.toFixed(6),
      lng: point.longitude.toFixed(6),
    }));

    logger.debug('Starting session extraction', {
      component: 'StatsCalculationService',
      totalPoints: gpsHistory.length,
      firstTimestamp: new Date(gpsHistory[0]!.timestamp).toISOString(),
      lastTimestamp: new Date(gpsHistory[gpsHistory.length - 1]!.timestamp).toISOString(),
      thresholdMinutes: this.SESSION_GAP_THRESHOLD_MS / (1000 * 60),
      samplePoints,
    });

    for (let i = 1; i < gpsHistory.length; i++) {
      const prevPoint = gpsHistory[i - 1]!;
      const currentPoint = gpsHistory[i]!;
      const timeDelta = currentPoint.timestamp - prevPoint.timestamp;

      // Check if we have a session gap
      if (timeDelta > this.SESSION_GAP_THRESHOLD_MS) {
        // End current session
        const session = {
          startTime: currentSessionStart,
          endTime: prevPoint.timestamp,
        };
        sessions.push(session);

        logger.debug('Session gap detected, ending session', {
          component: 'StatsCalculationService',
          sessionIndex: sessions.length - 1,
          gapMinutes: timeDelta / (1000 * 60),
          sessionStart: new Date(session.startTime).toISOString(),
          sessionEnd: new Date(session.endTime).toISOString(),
          sessionDurationMinutes: (session.endTime - session.startTime) / (1000 * 60),
        });

        // Start new session
        currentSessionStart = currentPoint.timestamp;
      }
    }

    // Add final session
    const finalSession = {
      startTime: currentSessionStart,
      endTime: gpsHistory[gpsHistory.length - 1]!.timestamp,
    };
    sessions.push(finalSession);

    logger.info('Session extraction complete', {
      component: 'StatsCalculationService',
      totalSessions: sessions.length,
      finalSessionStart: new Date(finalSession.startTime).toISOString(),
      finalSessionEnd: new Date(finalSession.endTime).toISOString(),
      finalSessionDurationMinutes: (finalSession.endTime - finalSession.startTime) / (1000 * 60),
      totalTimeMinutes:
        sessions.reduce((sum, s) => sum + (s.endTime - s.startTime), 0) / (1000 * 60),
    });

    return sessions;
  }

  /**
   * MAIN METHOD: Calculate totals from complete GPS history
   * Used on app startup and after history management changes
   */
  static calculateTotalsFromHistory(gpsHistory: GPSEvent[]): StatsState {
    logger.info('Calculating totals from GPS history', {
      component: 'StatsCalculationService',
      action: 'calculateTotalsFromHistory',
      historyLength: gpsHistory.length,
    });

    if (gpsHistory.length === 0) {
      const initialState = this.createInitialState();
      initialState.isInitialized = true; // Mark as initialized even with empty history
      return initialState;
    }

    // Convert to serializable points for calculations
    const serializablePath = gpsHistory.map((point) => this.gpsEventToSerializable(point));

    // Calculate total distance with validation against unrealistic jumps
    const MAX_REASONABLE_DISTANCE_METERS = 50000; // 50km max jump between points
    let totalDistance = 0;
    for (let i = 1; i < gpsHistory.length; i++) {
      const distance = this.calculateDistance(gpsHistory[i - 1]!, gpsHistory[i]!);

      if (distance >= this.MIN_MOVEMENT_THRESHOLD_METERS) {
        if (distance > MAX_REASONABLE_DISTANCE_METERS) {
          logger.warn('Filtering out unrealistic distance jump in GPS history', {
            component: 'StatsCalculationService',
            action: 'calculateTotalsFromHistory',
            distanceJump: `${(distance / 1000).toFixed(2)}km`,
            maxAllowed: `${MAX_REASONABLE_DISTANCE_METERS / 1000}km`,
            fromPoint: {
              lat: gpsHistory[i - 1]!.latitude.toFixed(6),
              lng: gpsHistory[i - 1]!.longitude.toFixed(6),
              timestamp: new Date(gpsHistory[i - 1]!.timestamp).toISOString(),
            },
            toPoint: {
              lat: gpsHistory[i]!.latitude.toFixed(6),
              lng: gpsHistory[i]!.longitude.toFixed(6),
              timestamp: new Date(gpsHistory[i]!.timestamp).toISOString(),
            },
          });
        } else {
          totalDistance += distance;
        }
      }
    }

    // Calculate total area from entire path
    const totalArea = this.calculateArea(serializablePath);

    // Extract sessions based on time gaps and calculate total session time
    const sessions = this.extractSessionsFromPath(gpsHistory);
    let totalTime = 0;

    // Sum up all session durations
    for (const session of sessions) {
      const sessionDuration = session.endTime - session.startTime;
      totalTime += sessionDuration;
    }



    logger.info('History calculation complete', {
      component: 'StatsCalculationService',
      totalDistance,
      totalArea,
      totalTime,
      historyLength: gpsHistory.length,
      firstPoint:
        gpsHistory.length > 0
          ? {
              lat: gpsHistory[0]!.latitude.toFixed(6),
              lng: gpsHistory[0]!.longitude.toFixed(6),
              timestamp: new Date(gpsHistory[0]!.timestamp).toISOString(),
            }
          : null,
      lastPoint:
        gpsHistory.length > 0
          ? {
              lat: gpsHistory[gpsHistory.length - 1]!.latitude.toFixed(6),
              lng: gpsHistory[gpsHistory.length - 1]!.longitude.toFixed(6),
              timestamp: new Date(gpsHistory[gpsHistory.length - 1]!.timestamp).toISOString(),
            }
          : null,
    });

    // Start fresh session
    const sessionId = this.generateSessionId();

    return {
      total: {
        distance: totalDistance,
        area: totalArea,
        time: totalTime,
      },
      session: {
        distance: 0,
        area: 0,
        time: 0,
      },
      currentSession: {
        sessionId,
        startTime: Date.now(),
        totalPausedTime: 0,
        lastActiveTime: Date.now(),
      },
      lastProcessedPoint: null, // Start fresh session - don't connect to historical data
      isInitialized: true,
    };
  }

  /**
   * MAIN METHOD: Increment stats with new GPS point
   * Used for real-time updates during active sessions
   */
  static incrementStats(currentStats: StatsState, newPoint: GPSEvent): StatsState {
    if (!currentStats.isInitialized) {
      logger.warn('Attempted to increment stats on uninitialized service', {
        component: 'StatsCalculationService',
        action: 'incrementStats',
      });
      return currentStats;
    }

    const updatedStats = { ...currentStats };
    const serializablePoint = this.gpsEventToSerializable(newPoint);

    logger.debug('Incrementing stats with new GPS point', {
      component: 'StatsCalculationService',
      action: 'incrementStats',
      latitude: newPoint.latitude,
      longitude: newPoint.longitude,
      timestamp: newPoint.timestamp,
    });

    // Check if point belongs to current session (within reasonable time window)
    if (!this.isPointInCurrentSession(currentStats, newPoint)) {
      logger.debug('GPS point outside current session time window, skipping increment', {
        component: 'StatsCalculationService',
        pointTimestamp: newPoint.timestamp,
        sessionStart: currentStats.currentSession.startTime,
        sessionEnd: currentStats.currentSession.endTime,
      });
      return currentStats;
    }

    // Calculate distance increment if we have a previous point
    if (currentStats.lastProcessedPoint) {
      const prevGPSEvent = this.serializableToGPSEvent(currentStats.lastProcessedPoint);
      const distanceIncrement = this.calculateDistance(prevGPSEvent, newPoint);
      const MAX_REASONABLE_DISTANCE_METERS = 50000; // 50km max jump between points

      // Only add distance if movement is above threshold and below unrealistic jump threshold
      if (distanceIncrement >= this.MIN_MOVEMENT_THRESHOLD_METERS) {
        if (distanceIncrement > MAX_REASONABLE_DISTANCE_METERS) {
          logger.warn('Filtering out unrealistic distance jump in incremental stats', {
            component: 'StatsCalculationService',
            action: 'incrementStats',
            distanceJump: `${(distanceIncrement / 1000).toFixed(2)}km`,
            maxAllowed: `${MAX_REASONABLE_DISTANCE_METERS / 1000}km`,
            previousPoint: {
              lat: currentStats.lastProcessedPoint.latitude.toFixed(6),
              lng: currentStats.lastProcessedPoint.longitude.toFixed(6),
              timestamp: new Date(currentStats.lastProcessedPoint.timestamp).toISOString(),
            },
            newPoint: {
              lat: newPoint.latitude.toFixed(6),
              lng: newPoint.longitude.toFixed(6),
              timestamp: new Date(newPoint.timestamp).toISOString(),
            },
          });
        } else {
          updatedStats.session.distance += distanceIncrement;
          updatedStats.total.distance += distanceIncrement;

          logger.debug('Distance incremented', {
            component: 'StatsCalculationService',
            distanceIncrement: distanceIncrement.toFixed(2),
            sessionDistance: updatedStats.session.distance.toFixed(2),
            totalDistance: updatedStats.total.distance.toFixed(2),
            previousPoint: {
              lat: currentStats.lastProcessedPoint.latitude.toFixed(6),
              lng: currentStats.lastProcessedPoint.longitude.toFixed(6),
              timestamp: new Date(currentStats.lastProcessedPoint.timestamp).toISOString(),
            },
            newPoint: {
              lat: newPoint.latitude.toFixed(6),
              lng: newPoint.longitude.toFixed(6),
              timestamp: new Date(newPoint.timestamp).toISOString(),
            },
          });
        }
      } else {
        logger.debug('Distance below threshold, not incremented', {
          component: 'StatsCalculationService',
          distanceIncrement: distanceIncrement.toFixed(2),
          threshold: this.MIN_MOVEMENT_THRESHOLD_METERS,
        });
      }

      // Calculate time increment if session is active
      if (!currentStats.currentSession.endTime) {
        const timeIncrement = newPoint.timestamp - currentStats.lastProcessedPoint.timestamp;

        // Only add time if it's reasonable
        if (timeIncrement > 0 && timeIncrement < this.MAX_TIME_GAP_MS) {
          updatedStats.session.time += timeIncrement;
          updatedStats.total.time += timeIncrement;

          logger.debug('Time incremented', {
            component: 'StatsCalculationService',
            timeIncrement,
            sessionTime: updatedStats.session.time,
            totalTime: updatedStats.total.time,
          });
        }
      }
    }

    // Always update last processed point (even if it's the first point)
    updatedStats.lastProcessedPoint = serializablePoint;

    // TODO: Area calculation for incremental updates
    // For now, area is only calculated during full history processing
    // This could be improved by periodically recalculating area during active sessions

    return updatedStats;
  }

  /**
   * Recalculate area from current GPS path (for periodic updates during active sessions)
   */
  static recalculateAreaFromCurrentPath(
    currentStats: StatsState,
    currentGPSPath: GPSEvent[]
  ): StatsState {
    if (currentGPSPath.length < 3) {
      return currentStats; // Need at least 3 points for area calculation
    }

    const serializablePath = currentGPSPath.map((point) => this.gpsEventToSerializable(point));
    const recalculatedArea = this.calculateArea(serializablePath);

    logger.debug('Recalculated area from current GPS path', {
      component: 'StatsCalculationService',
      action: 'recalculateAreaFromCurrentPath',
      pathLength: currentGPSPath.length,
      recalculatedArea: recalculatedArea.toFixed(2),
      previousTotalArea: currentStats.total.area.toFixed(2),
    });

    return {
      ...currentStats,
      total: {
        ...currentStats.total,
        area: recalculatedArea,
      },
    };
  }

  /**
   * Start a new session
   */
  static startNewSession(currentStats: StatsState): StatsState {
    const newSessionId = this.generateSessionId();

    return {
      ...currentStats,
      session: {
        distance: 0,
        area: 0,
        time: 0,
      },
      currentSession: {
        sessionId: newSessionId,
        startTime: Date.now(),
        totalPausedTime: 0,
        lastActiveTime: Date.now(),
      },
    };
  }

  /**
   * End current session
   */
  static endCurrentSession(currentStats: StatsState): StatsState {
    return {
      ...currentStats,
      currentSession: {
        ...currentStats.currentSession,
        endTime: Date.now(),
      },
    };
  }

  /**
   * Handle tracking pause - record the pause start time
   */
  static pauseSession(currentStats: StatsState): StatsState {
    const now = Date.now();
    return {
      ...currentStats,
      currentSession: {
        ...currentStats.currentSession,
        lastActiveTime: now,
      },
    };
  }

  /**
   * Handle tracking resume - add paused time to total
   */
  static resumeSession(currentStats: StatsState): StatsState {
    const now = Date.now();
    const lastActiveTime = currentStats.currentSession.lastActiveTime;

    if (lastActiveTime) {
      const pauseDuration = now - lastActiveTime;
      return {
        ...currentStats,
        currentSession: {
          ...currentStats.currentSession,
          totalPausedTime: currentStats.currentSession.totalPausedTime + pauseDuration,
          lastActiveTime: now,
        },
      };
    }

    // If no lastActiveTime, just update it
    return {
      ...currentStats,
      currentSession: {
        ...currentStats.currentSession,
        lastActiveTime: now,
      },
    };
  }

  /**
   * Check if GPS point belongs to current session
   */
  private static isPointInCurrentSession(stats: StatsState, point: GPSEvent): boolean {
    const sessionStart = stats.currentSession.startTime;
    const sessionEnd = stats.currentSession.endTime;

    // If session is active (no end time), check if point is after session start
    if (!sessionEnd) {
      return point.timestamp >= sessionStart;
    }

    // If session is ended, check if point is within session window
    return point.timestamp >= sessionStart && point.timestamp <= sessionEnd;
  }

  /**
   * Generate unique session ID
   */
  private static generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Convert GPSEvent to SerializableGPSPoint
   */
  static gpsEventToSerializable(gpsEvent: GPSEvent): SerializableGPSPoint {
    return {
      latitude: gpsEvent.latitude,
      longitude: gpsEvent.longitude,
      timestamp: gpsEvent.timestamp,
    };
  }

  /**
   * Convert SerializableGPSPoint to GPSEvent
   */
  static serializableToGPSEvent(point: SerializableGPSPoint): GPSEvent {
    return new GPSEvent(point.latitude, point.longitude, point.timestamp);
  }

  /**
   * Convert GeoPoint to GPSEvent for compatibility
   */
  static geoPointToGPSEvent(geoPoint: GeoPoint): GPSEvent {
    return new GPSEvent(geoPoint.latitude, geoPoint.longitude, geoPoint.timestamp);
  }

  /**
   * Format distance for display (converts meters to km with appropriate precision)
   */
  static formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    } else {
      return `${(meters / 1000).toFixed(2)}km`;
    }
  }

  /**
   * Format area for display (converts square meters to km² with appropriate precision)
   */
  static formatArea(squareMeters: number): string {
    if (squareMeters < 10000) {
      return `${Math.round(squareMeters)}m²`;
    } else {
      return `${(squareMeters / 1000000).toFixed(2)}km²`;
    }
  }

  /**
   * Format time for display (converts milliseconds to human-readable format)
   */
  static formatTime(milliseconds: number): string {
    const totalMinutes = Math.ceil(milliseconds / (1000 * 60)); // Round up to nearest minute
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Format time as timer with progressive precision based on elapsed time
   * < 60s: :XX (seconds only)
   * 1m-1h: XX:YY (minutes:seconds)
   * 1h-1d: XX:YY:ZZ (hours:minutes:seconds)
   * > 1d: W days, X hours, Y minutes and Z seconds
   */
  static formatTimeAsTimer(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);

    const seconds = totalSeconds % 60;
    const minutes = totalMinutes % 60;
    const hours = totalHours % 24;

    if (totalDays > 0) {
      // > 1 day: "2 days, 3 hours, 15 minutes and 42 seconds"
      return `${totalDays} day${totalDays !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`;
    } else if (totalHours > 0) {
      // 1h-1d: "02:15:42" (HH:MM:SS)
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else if (totalMinutes > 0) {
      // 1m-1h: "15:42" (MM:SS)
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      // < 60s: ":42" (seconds only)
      return `:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Create initial stats state
   */
  static createInitialState(): StatsState {
    return {
      total: { distance: 0, area: 0, time: 0 },
      session: { distance: 0, area: 0, time: 0 },
      currentSession: {
        sessionId: this.generateSessionId(),
        startTime: Date.now(),
        totalPausedTime: 0,
        lastActiveTime: Date.now(),
      },
      lastProcessedPoint: null,
      isInitialized: false,
    };
  }
}
