import { GPSEvent } from '../types/GPSEvent';
import { GeoPoint } from '../types/user';
import { logger } from '../utils/logger';
import { FOG_CONFIG } from '../config/fogConfig';
import { GPSConnectionService } from './GPSConnectionService';

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
   * Calculate area based on fog revelation (circle area per GPS point)
   * This directly corresponds to the visual area cleared on the map
   */
  static calculateArea(path: SerializableGPSPoint[]): number {
    if (path.length === 0) {
      return 0;
    }

    // Each GPS point clears a circular area with radius from FOG_CONFIG
    const circleAreaSquareMeters = Math.PI * FOG_CONFIG.RADIUS_METERS * FOG_CONFIG.RADIUS_METERS;

    // Total area = number of points × area of each circle
    // Note: This ignores overlap between nearby circles, but provides
    // a simple approximation that matches the visual fog clearing
    const totalArea = path.length * circleAreaSquareMeters;

    logger.debug('Calculated fog-based area', {
      component: 'StatsCalculationService',
      action: 'calculateArea',
      pointCount: path.length,
      fogRadiusMeters: FOG_CONFIG.RADIUS_METERS,
      circleAreaSquareMeters: circleAreaSquareMeters.toFixed(0),
      totalAreaSquareMeters: totalArea.toFixed(0),
    });

    return totalArea;
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
   * Sort GPS history chronologically and convert to serializable format
   * This is critical when historical data is prepended to existing data
   */
  private static preprocessGPSHistory(gpsHistory: GPSEvent[]): {
    sortedHistory: GPSEvent[];
    serializablePath: SerializableGPSPoint[];
  } {
    const sortedHistory = [...gpsHistory].sort((a, b) => a.timestamp - b.timestamp);
    const serializablePath = sortedHistory.map((point) => this.gpsEventToSerializable(point));
    return { sortedHistory, serializablePath };
  }

  /**
   * Calculate total distance with validation against unrealistic jumps
   */
  private static calculateTotalDistanceFromHistory(sortedHistory: GPSEvent[]): number {
    // Convert GPSEvents to GeoPoints for unified connection processing
    const geoPoints = sortedHistory.map((event) => GPSConnectionService.gpsEventToGeoPoint(event));

    // Use unified connection logic to get only connected segments
    const processedPoints = GPSConnectionService.processGPSPoints(geoPoints);

    // Calculate total distance using only connected segments
    const totalDistance = GPSConnectionService.calculateTotalDistance(processedPoints);

    logger.info('Distance calculated using unified connection logic', {
      component: 'StatsCalculationService',
      action: 'calculateTotalDistanceFromHistory',
      totalPoints: processedPoints.length,
      connectedSegments: processedPoints.filter((p) => p.connectsToPrevious).length,
      sessionStarts: processedPoints.filter((p) => p.startsNewSession).length,
      totalDistance: `${(totalDistance / 1000).toFixed(2)}km`,
    });

    return totalDistance;
  }

  /**
   * Calculate total session time from GPS history
   */
  private static calculateTotalTimeFromHistory(sortedHistory: GPSEvent[]): number {
    const sessions = this.extractSessionsFromPath(sortedHistory);
    let totalTime = 0;

    for (const session of sessions) {
      const sessionDuration = session.endTime - session.startTime;
      totalTime += sessionDuration;
    }

    return totalTime;
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

    // Preprocess GPS history
    const { sortedHistory, serializablePath } = this.preprocessGPSHistory(gpsHistory);

    // Calculate totals using extracted helper methods
    const totalDistance = this.calculateTotalDistanceFromHistory(sortedHistory);
    const totalArea = this.calculateArea(serializablePath);
    const totalTime = this.calculateTotalTimeFromHistory(sortedHistory);

    logger.info('History calculation complete', {
      component: 'StatsCalculationService',
      totalDistance,
      totalArea,
      totalTime,
      historyLength: sortedHistory.length,
      firstPoint:
        sortedHistory.length > 0
          ? {
              lat: sortedHistory[0]!.latitude.toFixed(6),
              lng: sortedHistory[0]!.longitude.toFixed(6),
              timestamp: new Date(sortedHistory[0]!.timestamp).toISOString(),
            }
          : null,
      lastPoint:
        sortedHistory.length > 0
          ? {
              lat: sortedHistory[sortedHistory.length - 1]!.latitude.toFixed(6),
              lng: sortedHistory[sortedHistory.length - 1]!.longitude.toFixed(6),
              timestamp: new Date(sortedHistory[sortedHistory.length - 1]!.timestamp).toISOString(),
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
   * Calculate and apply distance increment between two points
   */
  private static applyDistanceIncrement(
    updatedStats: StatsState,
    prevPoint: SerializableGPSPoint,
    newPoint: GPSEvent
  ): void {
    // Use unified connection logic to determine if points should be connected
    const prevGeoPoint = {
      latitude: prevPoint.latitude,
      longitude: prevPoint.longitude,
      timestamp: prevPoint.timestamp,
    };
    const newGeoPoint = GPSConnectionService.gpsEventToGeoPoint(newPoint);

    // Process the two points to check if they should be connected
    const processedPoints = GPSConnectionService.processGPSPoints([prevGeoPoint, newGeoPoint]);

    // Only add distance if the new point connects to the previous point
    if (processedPoints.length === 2 && processedPoints[1]!.connectsToPrevious) {
      const segments = GPSConnectionService.getConnectedSegments(processedPoints);
      if (segments.length === 1) {
        const distanceIncrement = segments[0]!.distance;

        updatedStats.session.distance += distanceIncrement;
        updatedStats.total.distance += distanceIncrement;

        logger.debug('Distance incremented using unified connection logic', {
          component: 'StatsCalculationService',
          action: 'applyDistanceIncrement',
          distanceIncrement: distanceIncrement.toFixed(2),
          sessionDistance: updatedStats.session.distance.toFixed(2),
          totalDistance: updatedStats.total.distance.toFixed(2),
        });
      }
    } else {
      const reason =
        processedPoints.length === 2 ? processedPoints[1]!.disconnectionReason : 'Invalid points';
      logger.debug('Distance not incremented - points not connected', {
        component: 'StatsCalculationService',
        action: 'applyDistanceIncrement',
        reason,
        previousPoint: {
          lat: prevPoint.latitude.toFixed(6),
          lng: prevPoint.longitude.toFixed(6),
          timestamp: new Date(prevPoint.timestamp).toISOString(),
        },
        newPoint: {
          lat: newPoint.latitude.toFixed(6),
          lng: newPoint.longitude.toFixed(6),
          timestamp: new Date(newPoint.timestamp).toISOString(),
        },
      });
    }
  }

  /**
   * Calculate and apply time increment for active sessions
   */
  private static applyTimeIncrement(
    updatedStats: StatsState,
    prevPoint: SerializableGPSPoint,
    newPoint: GPSEvent
  ): void {
    // Calculate time increment if session is active
    if (!updatedStats.currentSession.endTime) {
      const timeIncrement = newPoint.timestamp - prevPoint.timestamp;

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

    // Apply increments if we have a previous point
    if (currentStats.lastProcessedPoint) {
      this.applyDistanceIncrement(updatedStats, currentStats.lastProcessedPoint, newPoint);
      this.applyTimeIncrement(updatedStats, currentStats.lastProcessedPoint, newPoint);
    }

    // Always update last processed point (even if it's the first point)
    updatedStats.lastProcessedPoint = serializablePoint;

    // Session area calculation is handled by the periodic area recalculation in MapScreen
    // and real-time area updates when new GPS points are added

    return updatedStats;
  }

  /**
   * Recalculate area from serializable GPS points (for periodic updates during active sessions)
   * Also calculates session area for active sessions
   */
  static recalculateAreaFromSerializablePoints(
    currentStats: StatsState,
    serializablePoints: SerializableGPSPoint[]
  ): StatsState {
    if (serializablePoints.length < 3) {
      return currentStats; // Need at least 3 points for area calculation
    }

    const recalculatedTotalArea = this.calculateArea(serializablePoints);

    // Calculate session area if we have an active session
    let sessionArea = 0;
    if (currentStats.currentSession && !currentStats.currentSession.endTime) {
      const sessionStartTime = currentStats.currentSession.startTime;

      // Filter points that belong to current session
      const sessionPoints = serializablePoints.filter(
        (point) => point.timestamp >= sessionStartTime
      );

      if (sessionPoints.length >= 3) {
        sessionArea = this.calculateArea(sessionPoints);
        logger.debug('Calculated session area', {
          component: 'StatsCalculationService',
          action: 'recalculateAreaFromSerializablePoints',
          sessionPointsCount: sessionPoints.length,
          sessionArea: sessionArea.toFixed(2),
        });
      }
    }

    logger.debug('Recalculated areas from serializable GPS points', {
      component: 'StatsCalculationService',
      action: 'recalculateAreaFromSerializablePoints',
      pathLength: serializablePoints.length,
      recalculatedTotalArea: recalculatedTotalArea.toFixed(2),
      sessionArea: sessionArea.toFixed(2),
      previousTotalArea: currentStats.total.area.toFixed(2),
    });

    return {
      ...currentStats,
      total: {
        ...currentStats.total,
        area: recalculatedTotalArea,
      },
      session: {
        ...currentStats.session,
        area: sessionArea,
      },
    };
  }

  /**
   * Recalculate area from current GPS path (for periodic updates during active sessions)
   * @deprecated Use recalculateAreaFromSerializablePoints instead for Redux compatibility
   */
  static recalculateAreaFromCurrentPath(
    currentStats: StatsState,
    currentGPSPath: GPSEvent[]
  ): StatsState {
    if (currentGPSPath.length < 3) {
      return currentStats; // Need at least 3 points for area calculation
    }

    const serializablePath = currentGPSPath.map((point) => this.gpsEventToSerializable(point));
    return this.recalculateAreaFromSerializablePoints(currentStats, serializablePath);
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
   * Format time as compact timer with progressive precision based on elapsed time
   * < 60s: "3 secs"
   * 1m-1h: "3 min 13 secs"
   * 1h-1d: "4h 3m 13s"
   * > 1d: "27d 12h 15m 13s"
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
      // > 1 day: "27d 12h 15m 13s"
      return `${totalDays}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (totalHours > 0) {
      // 1h-1d: "4h 3m 13s"
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (totalMinutes > 0) {
      // 1m-1h: "3 min 13 secs"
      return `${minutes} min ${seconds} secs`;
    } else {
      // < 60s: "3 secs"
      return `${seconds} secs`;
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
