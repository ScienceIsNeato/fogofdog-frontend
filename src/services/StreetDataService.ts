import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { GeoPoint, GPSPointWithAccuracy } from '../types/user';
import {
  StreetSegment,
  StreetIntersection,
  StreetType,
  BoundingBox,
  OSMResponse,
  ClosestStreetResult,
  ClosestIntersectionResult,
  LoopPath,
  GetClosestStreetsOptions,
  GetClosestIntersectionsOptions,
  GetShortestLoopOptions,
  ExplorationFilter,
} from '../types/street';

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const CACHE_PREFIX = 'street_cache_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_MS = 6000; // 10 requests per minute = 6s between requests

// V2: Confidence scoring constants
const CONFIDENCE_THRESHOLD = 0.7; // Threshold to consider explored (0.0-1.0)
const CONFIDENCE_EMA_ALPHA = 0.3; // Exponential moving average smoothing factor
const CONFIDENCE_HIGH_DISTANCE = 5; // Distance in meters for high confidence (0.8-1.0)
const CONFIDENCE_MEDIUM_DISTANCE = 15; // Distance in meters for medium confidence (0.4-0.8)
const CONFIDENCE_MAX_DISTANCE = 30; // Maximum distance to consider (beyond this = 0 confidence)
const GPS_ACCURACY_GOOD = 10; // GPS accuracy threshold for good signal (meters)
const GPS_ACCURACY_POOR = 20; // GPS accuracy threshold for poor signal (meters)

interface CacheEntry {
  data: StreetSegment[] | StreetIntersection[];
  timestamp: number;
  size: number;
}

/**
 * Service for fetching and managing street-level data from OpenStreetMap
 */
export class StreetDataService {
  private static instance: StreetDataService;
  private streets: Map<string, StreetSegment> = new Map();
  private intersections: Map<string, StreetIntersection> = new Map();
  private lastFetchTimestamp = 0;
  private currentLocation: GeoPoint | null = null;

  private constructor() {
    logger.info('StreetDataService initialized', {
      component: 'StreetDataService',
      action: 'constructor',
    });
  }

  static getInstance(): StreetDataService {
    if (!StreetDataService.instance) {
      StreetDataService.instance = new StreetDataService();
    }
    return StreetDataService.instance;
  }

  /**
   * Set the current user location (used as default comparison point)
   */
  setCurrentLocation(location: GeoPoint): void {
    this.currentLocation = location;
  }

  /**
   * Calculate bounding box from center point and radius
   */
  private calculateBoundingBox(center: GeoPoint, radiusKm: number): BoundingBox {
    const latDelta = radiusKm / 111; // Approximately 111 km per degree latitude
    const lonDelta = radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180));

    return {
      south: center.latitude - latDelta,
      west: center.longitude - lonDelta,
      north: center.latitude + latDelta,
      east: center.longitude + lonDelta,
    };
  }

  /**
   * Generate cache key for a bounding box
   */
  private getCacheKey(bbox: BoundingBox, type: 'streets' | 'intersections'): string {
    const key = `${type}_${bbox.south.toFixed(4)}_${bbox.west.toFixed(4)}_${bbox.north.toFixed(4)}_${bbox.east.toFixed(4)}`;
    return `${CACHE_PREFIX}${key}`;
  }

  /**
   * Check if cache entry is valid
   */
  private async isCacheValid(key: string): Promise<boolean> {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (!cached) return false;

      const entry: CacheEntry = JSON.parse(cached);
      const now = Date.now();

      return now - entry.timestamp < CACHE_TTL_MS;
    } catch (error) {
      logger.error('Failed to check cache validity', error, {
        component: 'StreetDataService',
        action: 'isCacheValid',
      });
      return false;
    }
  }

  /**
   * Get data from cache
   */
  private async getFromCache<T>(key: string): Promise<T[] | null> {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (!cached) return null;

      const entry: CacheEntry = JSON.parse(cached);
      return entry.data as T[];
    } catch (error) {
      logger.error('Failed to get from cache', error, {
        component: 'StreetDataService',
        action: 'getFromCache',
      });
      return null;
    }
  }

  /**
   * Save data to cache
   */
  private async saveToCache(
    key: string,
    data: StreetSegment[] | StreetIntersection[]
  ): Promise<void> {
    try {
      const entry: CacheEntry = {
        data,
        timestamp: Date.now(),
        size: JSON.stringify(data).length,
      };

      await AsyncStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      logger.error('Failed to save to cache', error, {
        component: 'StreetDataService',
        action: 'saveToCache',
      });
    }
  }

  /**
   * Fetch streets from Overpass API
   */
  async fetchStreetsInBoundingBox(bbox: BoundingBox, useCache = true): Promise<StreetSegment[]> {
    const perfTimer = logger.startTimer('StreetDataService.fetchStreetsInBoundingBox');
    const cacheKey = this.getCacheKey(bbox, 'streets');

    // Check cache first
    if (useCache && (await this.isCacheValid(cacheKey))) {
      const cacheReadTimer = logger.startTimer('StreetDataService.cacheRead');
      const cached = await this.getFromCache<StreetSegment>(cacheKey);
      cacheReadTimer();

      if (cached) {
        logger.info('Loaded streets from cache', {
          component: 'StreetDataService',
          action: 'fetchStreetsInBoundingBox',
          count: cached.length,
        });

        // Update in-memory map
        cached.forEach((street) => this.streets.set(street.id, street));
        perfTimer();
        return cached;
      }
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastFetch = now - this.lastFetchTimestamp;
    if (timeSinceLastFetch < RATE_LIMIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastFetch));
    }

    // Build Overpass query
    const query = `
      [out:json];
      (
        way["highway"~"^(residential|primary|secondary|tertiary|path|track)$"]
            ["name"]
            (${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      );
      out geom;
    `;

    try {
      logger.info('Fetching streets from Overpass API', {
        component: 'StreetDataService',
        action: 'fetchStreetsInBoundingBox',
        bbox,
      });

      const apiTimer = logger.startTimer('StreetDataService.overpassAPI');
      const response = await fetch(OVERPASS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      const data: OSMResponse = await response.json();
      apiTimer();
      this.lastFetchTimestamp = Date.now();

      // Parse response into StreetSegment objects
      const parseTimer = logger.startTimer('StreetDataService.parseOSM');
      const streets = this.parseStreetsFromOSM(data);
      parseTimer();

      // Update in-memory map
      streets.forEach((street) => this.streets.set(street.id, street));

      // Save to cache
      const cacheWriteTimer = logger.startTimer('StreetDataService.cacheWrite');
      await this.saveToCache(cacheKey, streets);
      cacheWriteTimer();

      logger.info('Successfully fetched streets', {
        component: 'StreetDataService',
        action: 'fetchStreetsInBoundingBox',
        count: streets.length,
      });

      perfTimer();
      return streets;
    } catch (error) {
      logger.error('Failed to fetch streets from Overpass API', error, {
        component: 'StreetDataService',
        action: 'fetchStreetsInBoundingBox',
      });

      // Try to return cached data as fallback
      const cached = await this.getFromCache<StreetSegment>(cacheKey);
      if (cached) {
        logger.warn('Returning stale cached data due to API error', {
          component: 'StreetDataService',
          action: 'fetchStreetsInBoundingBox',
        });
        perfTimer();
        return cached;
      }

      perfTimer();
      throw error;
    }
  }

  /**
   * Parse OSM response into StreetSegment objects
   */
  private parseStreetsFromOSM(osmData: OSMResponse): StreetSegment[] {
    const streets: StreetSegment[] = [];

    for (const element of osmData.elements) {
      if (element.type !== 'way' || !element.geometry || !element.tags?.name) {
        continue;
      }

      const coordinates: GeoPoint[] = element.geometry.map((coord) => ({
        latitude: coord.lat,
        longitude: coord.lon,
        timestamp: Date.now(),
      }));

      const street: StreetSegment = {
        id: element.id.toString(),
        name: element.tags.name,
        type: this.parseStreetType(element.tags.highway),
        coordinates,
        isExplored: false,
      };

      streets.push(street);
    }

    return streets;
  }

  /**
   * Parse OSM highway tag into StreetType enum
   */
  private parseStreetType(highway?: string): StreetType {
    switch (highway) {
      case 'residential':
        return StreetType.Residential;
      case 'primary':
        return StreetType.Primary;
      case 'secondary':
        return StreetType.Secondary;
      case 'tertiary':
        return StreetType.Tertiary;
      case 'path':
        return StreetType.Path;
      case 'track':
        return StreetType.Track;
      default:
        return StreetType.Residential;
    }
  }

  /**
   * Fetch intersections from Overpass API
   */
  async fetchIntersectionsInBoundingBox(
    bbox: BoundingBox,
    useCache = true
  ): Promise<StreetIntersection[]> {
    const cacheKey = this.getCacheKey(bbox, 'intersections');

    // Check cache first
    if (useCache && (await this.isCacheValid(cacheKey))) {
      const cached = await this.getFromCache<StreetIntersection>(cacheKey);
      if (cached) {
        logger.info('Loaded intersections from cache', {
          component: 'StreetDataService',
          action: 'fetchIntersectionsInBoundingBox',
          count: cached.length,
        });

        // Update in-memory map
        cached.forEach((intersection) => this.intersections.set(intersection.id, intersection));
        return cached;
      }
    }

    // For simplicity, derive intersections from street endpoints
    // In a production app, we'd query OSM for actual intersection nodes
    const streets = await this.fetchStreetsInBoundingBox(bbox, useCache);
    const intersections = this.deriveIntersectionsFromStreets(streets);

    // Update in-memory map
    intersections.forEach((intersection) => this.intersections.set(intersection.id, intersection));

    // Save to cache
    await this.saveToCache(cacheKey, intersections);

    return intersections;
  }

  /**
   * Derive intersections from street endpoints
   * This is a simplified approach - in production, query OSM for actual nodes
   */
  private deriveIntersectionsFromStreets(streets: StreetSegment[]): StreetIntersection[] {
    const intersectionMap = new Map<string, StreetIntersection>();
    const PROXIMITY_THRESHOLD = 0.0001; // ~11 meters

    for (const street of streets) {
      if (street.coordinates.length < 2) continue;

      // Check both endpoints
      const endpoints = [street.coordinates[0], street.coordinates[street.coordinates.length - 1]];

      for (const endpoint of endpoints) {
        if (!endpoint) continue;

        // Look for nearby endpoints from other streets
        const nearbyStreets: StreetSegment[] = [];

        for (const otherStreet of streets) {
          if (otherStreet.id === street.id) continue;
          if (otherStreet.coordinates.length < 2) continue;

          const otherEndpoints = [
            otherStreet.coordinates[0],
            otherStreet.coordinates[otherStreet.coordinates.length - 1],
          ];

          for (const otherEndpoint of otherEndpoints) {
            if (!otherEndpoint) continue;

            const distance = this.haversineDistance(endpoint, otherEndpoint);
            if (distance < PROXIMITY_THRESHOLD * 111000) {
              // Convert degrees to meters
              nearbyStreets.push(otherStreet);
              break;
            }
          }
        }

        // If we found nearby streets, this is an intersection
        if (nearbyStreets.length > 0) {
          const intersectionId = `${endpoint.latitude.toFixed(6)}_${endpoint.longitude.toFixed(6)}`;

          if (!intersectionMap.has(intersectionId)) {
            const intersection: StreetIntersection = {
              id: intersectionId,
              location: endpoint,
              streetNames: [street.name, ...nearbyStreets.map((s) => s.name)],
              streetIds: [street.id, ...nearbyStreets.map((s) => s.id)],
              isExplored: false,
            };

            intersectionMap.set(intersectionId, intersection);
          }
        }
      }
    }

    return Array.from(intersectionMap.values());
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private haversineDistance(p1: GeoPoint, p2: GeoPoint): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (p1.latitude * Math.PI) / 180;
    const φ2 = (p2.latitude * Math.PI) / 180;
    const Δφ = ((p2.latitude - p1.latitude) * Math.PI) / 180;
    const Δλ = ((p2.longitude - p1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Calculate bearing from one point to another
   */
  private calculateBearing(from: GeoPoint, to: GeoPoint): number {
    const φ1 = (from.latitude * Math.PI) / 180;
    const φ2 = (to.latitude * Math.PI) / 180;
    const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);

    return ((θ * 180) / Math.PI + 360) % 360; // Normalize to 0-359
  }

  /**
   * Convert bearing to cardinal direction
   */
  private bearingToDirection(bearing: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index] || 'N';
  }

  /**
   * V2: Calculate confidence score for a single GPS point near a street
   * Returns a value between 0.0 (no confidence) and 1.0 (high confidence)
   * Based on distance to street and GPS accuracy
   */
  private calculatePointConfidence(
    gpsPoint: GPSPointWithAccuracy,
    distanceToStreet: number
  ): number {
    // If too far away, no confidence
    if (distanceToStreet > CONFIDENCE_MAX_DISTANCE) {
      return 0.0;
    }

    // Base confidence from distance
    let confidence = 0;
    if (distanceToStreet <= CONFIDENCE_HIGH_DISTANCE) {
      // High confidence: 0.8 to 1.0
      confidence = 0.8 + (1 - distanceToStreet / CONFIDENCE_HIGH_DISTANCE) * 0.2;
    } else if (distanceToStreet <= CONFIDENCE_MEDIUM_DISTANCE) {
      // Medium confidence: 0.4 to 0.8
      const ratio =
        (distanceToStreet - CONFIDENCE_HIGH_DISTANCE) /
        (CONFIDENCE_MEDIUM_DISTANCE - CONFIDENCE_HIGH_DISTANCE);
      confidence = 0.8 - ratio * 0.4;
    } else {
      // Low confidence: 0.0 to 0.4
      const ratio =
        (distanceToStreet - CONFIDENCE_MEDIUM_DISTANCE) /
        (CONFIDENCE_MAX_DISTANCE - CONFIDENCE_MEDIUM_DISTANCE);
      confidence = 0.4 * (1 - ratio);
    }

    // Adjust for GPS accuracy (if available)
    if (gpsPoint.accuracy !== undefined) {
      if (gpsPoint.accuracy > GPS_ACCURACY_POOR) {
        // Very poor accuracy, reduce confidence significantly
        confidence *= 0.5;
      } else if (gpsPoint.accuracy > GPS_ACCURACY_GOOD) {
        // Poor accuracy, reduce confidence moderately
        confidence *= 0.75;
      }
      // Good accuracy (< GPS_ACCURACY_GOOD) - no reduction
    }

    return Math.min(Math.max(confidence, 0.0), 1.0);
  }

  /**
   * V2: Update confidence score using exponential moving average (EMA)
   * This smooths out noise and prevents rapid fluctuations
   */
  private updateConfidenceScore(currentConfidence: number, newObservation: number): number {
    // EMA formula: new = alpha * observation + (1 - alpha) * old
    const updated =
      CONFIDENCE_EMA_ALPHA * newObservation + (1 - CONFIDENCE_EMA_ALPHA) * currentConfidence;
    return Math.min(Math.max(updated, 0.0), 1.0);
  }

  /**
   * V2: Initialize or get confidence tracking data for a street
   */
  private initializeConfidenceData(street: StreetSegment): void {
    if (street.confidenceScore === undefined) {
      street.confidenceScore = 0.0;
      street.visitCount = 0;
      street.totalTimeNearby = 0;
      street.averageDistance = 0;
    }
  }

  /**
   * V2: Initialize or get confidence tracking data for an intersection
   */
  private initializeIntersectionConfidenceData(intersection: StreetIntersection): void {
    if (intersection.confidenceScore === undefined) {
      intersection.confidenceScore = 0.0;
      intersection.visitCount = 0;
      intersection.totalTimeNearby = 0;
      intersection.averageDistance = 0;
    }
  }

  /**
   * Calculate minimum distance from point to line segment
   */
  private pointToLineSegmentDistance(
    point: GeoPoint,
    lineStart: GeoPoint,
    lineEnd: GeoPoint
  ): number {
    // Calculate perpendicular distance
    const lineLength = this.haversineDistance(lineStart, lineEnd);

    if (lineLength === 0) return this.haversineDistance(point, lineStart);

    // Project point onto line segment
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.latitude - lineStart.latitude) * (lineEnd.latitude - lineStart.latitude) +
          (point.longitude - lineStart.longitude) * (lineEnd.longitude - lineStart.longitude)) /
          (lineLength * lineLength)
      )
    );

    const projection: GeoPoint = {
      latitude: lineStart.latitude + t * (lineEnd.latitude - lineStart.latitude),
      longitude: lineStart.longitude + t * (lineEnd.longitude - lineStart.longitude),
      timestamp: Date.now(),
    };

    return this.haversineDistance(point, projection);
  }

  /**
   * Calculate minimum distance from point to street segment
   */
  private pointToStreetDistance(point: GeoPoint, street: StreetSegment): number {
    let minDistance = Infinity;

    for (let i = 0; i < street.coordinates.length - 1; i++) {
      const start = street.coordinates[i];
      const end = street.coordinates[i + 1];

      if (!start || !end) continue;

      const distance = this.pointToLineSegmentDistance(point, start, end);
      minDistance = Math.min(minDistance, distance);
    }

    return minDistance;
  }

  /**
   * Apply exploration filter to streets
   */
  private applyStreetFilter(streets: StreetSegment[], filter: ExplorationFilter): StreetSegment[] {
    if (filter === 'all') return streets;
    if (filter === 'explored') return streets.filter((s) => s.isExplored);
    if (filter === 'unexplored') return streets.filter((s) => !s.isExplored);
    return streets;
  }

  /**
   * Apply exploration filter to intersections
   */
  private applyIntersectionFilter(
    intersections: StreetIntersection[],
    filter: ExplorationFilter
  ): StreetIntersection[] {
    if (filter === 'all') return intersections;
    if (filter === 'explored') return intersections.filter((i) => i.isExplored);
    if (filter === 'unexplored') return intersections.filter((i) => !i.isExplored);
    return intersections;
  }

  /**
   * Get closest streets to a comparison point
   */
  async getClosestStreets(options: GetClosestStreetsOptions = {}): Promise<ClosestStreetResult[]> {
    const perfTimer = logger.startTimer('StreetDataService.getClosestStreets', {
      numResults: options.numResults,
      filter: options.filter,
    });

    const { numResults = 1, comparisonPoint, filter = 'all' } = options;

    const point = comparisonPoint || this.currentLocation;

    if (!point) {
      throw new Error('No comparison point provided and no current location set');
    }

    // Ensure we have street data
    if (this.streets.size === 0) {
      const bbox = this.calculateBoundingBox(point, 1); // 1km radius
      await this.fetchStreetsInBoundingBox(bbox);
    }

    // Get all streets and apply filter
    const allStreets = Array.from(this.streets.values());
    const filteredStreets = this.applyStreetFilter(allStreets, filter);

    // Calculate distances and sort
    const results: ClosestStreetResult[] = filteredStreets.map((street) => {
      const distance = this.pointToStreetDistance(point, street);
      const closestPoint = this.findClosestPointOnStreet(point, street);
      const bearing = this.calculateBearing(point, closestPoint);
      const direction = this.bearingToDirection(bearing);

      return { street, distance, direction, bearing };
    });

    results.sort((a, b) => a.distance - b.distance);

    logger.perf('StreetDataService.getClosestStreets', {
      totalStreets: this.streets.size,
      filteredStreets: filteredStreets.length,
      resultsReturned: Math.min(numResults, results.length),
    });
    perfTimer();

    return results.slice(0, numResults);
  }

  /**
   * Find closest point on a street to a given point
   */
  private findClosestPointOnStreet(point: GeoPoint, street: StreetSegment): GeoPoint {
    let closestPoint = street.coordinates[0] || point;
    let minDistance = Infinity;

    for (const coord of street.coordinates) {
      const distance = this.haversineDistance(point, coord);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = coord;
      }
    }

    return closestPoint;
  }

  /**
   * Get closest intersections to a comparison point
   */
  async getClosestIntersections(
    options: GetClosestIntersectionsOptions = {}
  ): Promise<ClosestIntersectionResult[]> {
    const { numResults = 1, comparisonPoint, filter = 'all' } = options;

    const point = comparisonPoint || this.currentLocation;

    if (!point) {
      throw new Error('No comparison point provided and no current location set');
    }

    // Ensure we have intersection data
    if (this.intersections.size === 0) {
      const bbox = this.calculateBoundingBox(point, 1); // 1km radius
      await this.fetchIntersectionsInBoundingBox(bbox);
    }

    // Get all intersections and apply filter
    const allIntersections = Array.from(this.intersections.values());
    const filteredIntersections = this.applyIntersectionFilter(allIntersections, filter);

    // Calculate distances and sort
    const results: ClosestIntersectionResult[] = filteredIntersections.map((intersection) => {
      const distance = this.haversineDistance(point, intersection.location);
      const bearing = this.calculateBearing(point, intersection.location);
      const direction = this.bearingToDirection(bearing);

      return { intersection, distance, direction, bearing };
    });

    results.sort((a, b) => a.distance - b.distance);

    return results.slice(0, numResults);
  }

  /**
   * Get shortest loop from current location using "always turn" algorithm
   */
  async getShortestLoop(options: GetShortestLoopOptions = {}): Promise<LoopPath> {
    const { maxDistanceMiles = 3, startLocation } = options;

    const start = startLocation || this.currentLocation;

    if (!start) {
      return {
        segments: [],
        totalDistance: 0,
        estimatedTime: 0,
        turns: [],
        isPossible: false,
        reason: 'No starting location provided or set',
      };
    }

    // Ensure we have street data
    if (this.streets.size === 0) {
      const bbox = this.calculateBoundingBox(start, maxDistanceMiles * 1.5);
      await this.fetchStreetsInBoundingBox(bbox);
    }

    // Find closest street to start
    const closestResults = await this.getClosestStreets({
      numResults: 1,
      comparisonPoint: start,
    });

    if (closestResults.length === 0) {
      return {
        segments: [],
        totalDistance: 0,
        estimatedTime: 0,
        turns: [],
        isPossible: false,
        reason: 'No streets found near starting location',
      };
    }

    const startStreet = closestResults[0]?.street;

    if (!startStreet) {
      return {
        segments: [],
        totalDistance: 0,
        estimatedTime: 0,
        turns: [],
        isPossible: false,
        reason: 'No valid starting street found',
      };
    }

    // Simplified loop algorithm
    // In a production implementation, this would use a graph traversal algorithm
    // For now, return a placeholder indicating more complex logic is needed

    return {
      segments: [startStreet],
      totalDistance: 0,
      estimatedTime: 0,
      turns: [],
      isPossible: false,
      reason: 'Loop algorithm requires graph traversal implementation',
    };
  }

  /**
   * Mark a street as explored
   */
  markStreetExplored(streetId: string, timestamp: number = Date.now()): void {
    const street = this.streets.get(streetId);
    if (street) {
      street.isExplored = true;
      street.exploredAt = timestamp;
      this.streets.set(streetId, street);
    }
  }

  /**
   * Mark an intersection as explored
   */
  markIntersectionExplored(intersectionId: string, timestamp: number = Date.now()): void {
    const intersection = this.intersections.get(intersectionId);
    if (intersection) {
      intersection.isExplored = true;
      intersection.exploredAt = timestamp;
      this.intersections.set(intersectionId, intersection);
    }
  }

  /**
   * V2: Check if GPS path intersects with a street and update confidence
   * Uses confidence-based tracking with GPS noise tolerance
   */
  updateExplorationFromGPSPath(gpsPath: GeoPoint[]): void {
    const perfTimer = logger.startTimer('StreetDataService.updateExplorationFromGPSPath', {
      pathLength: gpsPath.length,
      streetCount: this.streets.size,
      intersectionCount: this.intersections.size,
    });

    // Sort points by timestamp to calculate time intervals
    const sortedPath = [...gpsPath].sort((a, b) => a.timestamp - b.timestamp);

    let streetsUpdated = 0;
    let intersectionsUpdated = 0;
    let newlyExploredStreets = 0;
    let newlyExploredIntersections = 0;

    for (let i = 0; i < sortedPath.length; i++) {
      const point = sortedPath[i];
      if (!point) continue;

      // Calculate time interval to next point (for time tracking)
      const nextPoint = sortedPath[i + 1];
      const timeInterval = nextPoint ? nextPoint.timestamp - point.timestamp : 0;

      // Convert to GPSPointWithAccuracy (may already have accuracy from noise generation)
      const gpsPoint: GPSPointWithAccuracy = point;

      // Check streets
      for (const street of this.streets.values()) {
        const distance = this.pointToStreetDistance(point, street);

        // Only process if within max confidence distance
        if (distance < CONFIDENCE_MAX_DISTANCE) {
          this.initializeConfidenceData(street);
          streetsUpdated++;

          // Calculate confidence for this observation
          const pointConfidence = this.calculatePointConfidence(gpsPoint, distance);

          // Update confidence using EMA
          const wasExplored = street.isExplored;
          street.confidenceScore = this.updateConfidenceScore(
            street.confidenceScore || 0,
            pointConfidence
          );

          // Update tracking metrics
          street.visitCount = (street.visitCount || 0) + 1;
          street.totalTimeNearby = (street.totalTimeNearby || 0) + timeInterval;

          // Update average distance using running average
          const prevAvg = street.averageDistance || 0;
          const count = street.visitCount || 1;
          street.averageDistance = prevAvg + (distance - prevAvg) / count;

          street.lastVisited = point.timestamp;

          // Update isExplored based on confidence threshold
          if (street.confidenceScore >= CONFIDENCE_THRESHOLD && !street.isExplored) {
            street.isExplored = true;
            street.exploredAt = point.timestamp;
            if (!wasExplored) newlyExploredStreets++;
          }
        }
      }

      // Check intersections
      for (const intersection of this.intersections.values()) {
        const distance = this.haversineDistance(point, intersection.location);

        if (distance < CONFIDENCE_MAX_DISTANCE) {
          this.initializeIntersectionConfidenceData(intersection);
          intersectionsUpdated++;

          // Calculate confidence for this observation
          const pointConfidence = this.calculatePointConfidence(gpsPoint, distance);

          // Update confidence using EMA
          const wasExplored = intersection.isExplored;
          intersection.confidenceScore = this.updateConfidenceScore(
            intersection.confidenceScore || 0,
            pointConfidence
          );

          // Update tracking metrics
          intersection.visitCount = (intersection.visitCount || 0) + 1;
          intersection.totalTimeNearby = (intersection.totalTimeNearby || 0) + timeInterval;

          // Update average distance using running average
          const prevAvg = intersection.averageDistance || 0;
          const count = intersection.visitCount || 1;
          intersection.averageDistance = prevAvg + (distance - prevAvg) / count;

          intersection.lastVisited = point.timestamp;

          // Update isExplored based on confidence threshold
          if (intersection.confidenceScore >= CONFIDENCE_THRESHOLD && !intersection.isExplored) {
            intersection.isExplored = true;
            intersection.exploredAt = point.timestamp;
            if (!wasExplored) newlyExploredIntersections++;
          }
        }
      }
    }

    // Log performance metrics
    logger.perf('StreetDataService.updateExplorationFromGPSPath', {
      pathLength: gpsPath.length,
      streetsUpdated,
      intersectionsUpdated,
      newlyExploredStreets,
      newlyExploredIntersections,
    });
    perfTimer();
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);

      logger.info('Cleared street data cache', {
        component: 'StreetDataService',
        action: 'clearCache',
        keysCleared: cacheKeys.length,
      });
    } catch (error) {
      logger.error('Failed to clear cache', error, {
        component: 'StreetDataService',
        action: 'clearCache',
      });
    }
  }

  /**
   * Reset in-memory data
   */
  reset(): void {
    this.streets.clear();
    this.intersections.clear();
    this.lastFetchTimestamp = 0;
    this.currentLocation = null;
  }

  /**
   * Get all streets (for debugging/testing)
   */
  getAllStreets(): StreetSegment[] {
    return Array.from(this.streets.values());
  }

  /**
   * Get all intersections (for debugging/testing)
   */
  getAllIntersections(): StreetIntersection[] {
    return Array.from(this.intersections.values());
  }
}

// Export singleton instance
export const streetDataService = StreetDataService.getInstance();
