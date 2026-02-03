# Street Data Integration Plan V2 - Production Architecture

## Executive Summary

This document outlines a **production-grade** street data integration architecture for Fog of Dog, addressing the limitations of the V1 approach. Key improvements include viewport-based loading, spatial indexing, GPS noise tolerance, async operations, and comprehensive state management.

## Architectural Critique & Lessons Learned

### V1 Limitations Identified

1. **Overpass API as Primary Source** → Too slow, rate-limited, requires network
2. **In-Memory Storage of All Streets** → Doesn't scale beyond small cities
3. **Naive Intersection Detection** → Misses overpasses, service roads, complex junctions
4. **Binary Exploration State** → GPS noise causes false positives
5. **No Viewport Management** → Loads data user will never see
6. **Synchronous Operations** → Blocks UI during downloads

### V2 Core Principles

✅ **Offline-First**: Local database with periodic syncs, not real-time queries
✅ **Viewport-Based**: Only load streets in current view + buffer
✅ **Spatial Indexing**: Fast spatial queries using R-tree/quadtree
✅ **Noise Tolerant**: Confidence scoring, not binary explored/unexplored
✅ **Async Everything**: Downloads never block user interaction
✅ **Instrumented**: Comprehensive logging for performance monitoring

---

## Architecture Overview

### Data Flow V2

```
User Pans Map
    ↓
Viewport Change Detected
    ↓
Calculate Required Tiles (with buffer)
    ↓
Check Local Cache (SQLite)
    ├─ Hit → Render immediately
    └─ Miss → Queue async download
            ↓
        Background Worker
            ↓
        Fetch from Overpass API
            ↓
        Store in SQLite
            ↓
        Emit load complete event
            ↓
        UI updates reactively
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MapScreen Component                   │
│  - Viewport state management                            │
│  - Triggers viewport loads                              │
│  - Renders streets from cache                           │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│            ViewportManager Service                       │
│  - Calculates required tiles                            │
│  - Manages tile grid (256m × 256m)                      │
│  - Determines what needs loading                        │
│  - Handles overlap/deduplication                        │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│          StreetCacheService (SQLite)                     │
│  - Local database with R-tree spatial index             │
│  - Fast bounding box queries                            │
│  - Stores: streets, intersections, metadata             │
│  - TTL-based eviction for old data                      │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│          AsyncDownloadQueue Service                      │
│  - Priority queue for tile downloads                    │
│  - Rate limiting (respects Overpass API)                │
│  - Retry logic with exponential backoff                 │
│  - Cancellable operations                               │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│             OverpassAPIClient                            │
│  - Optimized queries for tile requests                  │
│  - Response parsing and validation                      │
│  - Error handling and fallbacks                         │
└─────────────────────────────────────────────────────────┘
```

---

## Detailed Design

### 1. Viewport-Based Tile System

#### Tile Grid Design

```typescript
// 256m × 256m tiles (roughly 2-3 city blocks)
// Chosen to balance:
// - API request size (too large = slow, too small = too many requests)
// - Cache granularity
// - Render performance

interface TileCoordinate {
  x: number; // Longitude tile index
  y: number; // Latitude tile index
  zoom: number; // Tile zoom level (fixed at 15 for now)
}

interface Tile {
  coordinate: TileCoordinate;
  boundingBox: BoundingBox;
  state: TileState;
  loadedAt?: number; // Timestamp
  expiresAt?: number; // TTL-based expiration
  priority: number; // For download queue
}

enum TileState {
  NOT_LOADED = 'not_loaded',
  QUEUED = 'queued',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
  EXPIRED = 'expired',
}
```

#### Viewport to Tiles Conversion

```typescript
class ViewportManager {
  private readonly TILE_SIZE_METERS = 256;
  private readonly BUFFER_TILES = 1; // Load 1 tile beyond visible viewport

  /**
   * Convert current viewport to required tiles
   * Includes buffer zone for smooth panning
   */
  calculateRequiredTiles(viewport: MapViewport): TileCoordinate[] {
    const centerTile = this.latLonToTile(viewport.center);
    const viewportWidthTiles = Math.ceil(viewport.widthMeters / this.TILE_SIZE_METERS);
    const viewportHeightTiles = Math.ceil(viewport.heightMeters / this.TILE_SIZE_METERS);

    const tiles: TileCoordinate[] = [];

    // Include buffer tiles around viewport
    for (let dx = -this.BUFFER_TILES; dx <= viewportWidthTiles + this.BUFFER_TILES; dx++) {
      for (let dy = -this.BUFFER_TILES; dy <= viewportHeightTiles + this.BUFFER_TILES; dy++) {
        tiles.push({
          x: centerTile.x + dx,
          y: centerTile.y + dy,
          zoom: 15,
        });
      }
    }

    return tiles;
  }

  /**
   * Prioritize tiles: visible > buffer > background
   */
  prioritizeTiles(tiles: TileCoordinate[], viewport: MapViewport): Tile[] {
    return tiles.map(coord => {
      const isVisible = this.isInViewport(coord, viewport);
      const distanceFromCenter = this.distanceFromViewportCenter(coord, viewport);

      return {
        coordinate: coord,
        boundingBox: this.tileToBoundingBox(coord),
        state: TileState.NOT_LOADED,
        priority: isVisible ? 100 : Math.max(0, 50 - distanceFromCenter),
      };
    });
  }
}
```

---

### 2. Local SQLite Cache with Spatial Indexing

#### Schema Design

```sql
-- Streets table with spatial index
CREATE TABLE streets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- residential, primary, etc.
    tile_x INTEGER NOT NULL,
    tile_y INTEGER NOT NULL,
    min_lat REAL NOT NULL,
    max_lat REAL NOT NULL,
    min_lon REAL NOT NULL,
    max_lon REAL NOT NULL,
    coordinates BLOB NOT NULL, -- Serialized GeoPoint array
    is_explored INTEGER DEFAULT 0,
    explored_at INTEGER,
    confidence_score REAL DEFAULT 0.0, -- NEW: 0.0-1.0 exploration confidence
    visit_count INTEGER DEFAULT 0, -- NEW: Number of GPS points near this street
    last_visited INTEGER, -- NEW: Most recent visit timestamp
    loaded_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- R-tree spatial index for fast bounding box queries
CREATE VIRTUAL TABLE streets_rtree USING rtree(
    id INTEGER PRIMARY KEY,
    min_lat REAL,
    max_lat REAL,
    min_lon REAL,
    max_lon REAL
);

-- Trigger to keep R-tree in sync
CREATE TRIGGER streets_insert AFTER INSERT ON streets
BEGIN
    INSERT INTO streets_rtree VALUES (
        new.rowid,
        new.min_lat,
        new.max_lat,
        new.min_lon,
        new.max_lon
    );
END;

-- Intersections table (similar structure)
CREATE TABLE intersections (
    id TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    street_ids TEXT NOT NULL, -- JSON array of street IDs
    street_names TEXT NOT NULL, -- JSON array of street names
    is_explored INTEGER DEFAULT 0,
    explored_at INTEGER,
    confidence_score REAL DEFAULT 0.0,
    visit_count INTEGER DEFAULT 0,
    last_visited INTEGER,
    loaded_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE intersections_rtree USING rtree(
    id INTEGER PRIMARY KEY,
    lat REAL,
    lat_dup REAL, -- R-tree requires min/max even for points
    lon REAL,
    lon_dup REAL
);

-- Tiles metadata table
CREATE TABLE tiles (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    zoom INTEGER NOT NULL,
    state TEXT NOT NULL,
    loaded_at INTEGER,
    expires_at INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    PRIMARY KEY (x, y, zoom)
);

-- Exploration events for analytics/debugging
CREATE TABLE exploration_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    street_id TEXT,
    intersection_id TEXT,
    gps_lat REAL NOT NULL,
    gps_lon REAL NOT NULL,
    gps_accuracy REAL,
    distance_meters REAL NOT NULL,
    confidence_delta REAL NOT NULL, -- How much confidence changed
    event_type TEXT NOT NULL -- 'street_explored', 'intersection_explored', 'noise_filtered'
);

CREATE INDEX idx_exploration_timestamp ON exploration_events(timestamp);
```

#### Cache Service Implementation

```typescript
class StreetCacheService {
  private db: SQLite.Database;
  private readonly TTL_DAYS = 30; // Longer TTL since OSM data changes slowly

  /**
   * Query streets in viewport using R-tree spatial index
   * This is FAST - O(log n) instead of O(n)
   */
  async getStreetsInBoundingBox(bbox: BoundingBox): Promise<StreetSegment[]> {
    const startTime = performance.now();

    const query = `
      SELECT s.*
      FROM streets s
      INNER JOIN streets_rtree r ON s.rowid = r.id
      WHERE r.min_lat <= ? AND r.max_lat >= ?
        AND r.min_lon <= ? AND r.max_lon >= ?
        AND s.expires_at > ?
    `;

    const rows = await this.db.query(query, [
      bbox.north,
      bbox.south,
      bbox.east,
      bbox.west,
      Date.now(),
    ]);

    const duration = performance.now() - startTime;
    logger.perf('StreetCache.getStreetsInBoundingBox', {
      duration,
      resultCount: rows.length,
      bbox,
    });

    return rows.map(this.deserializeStreet);
  }

  /**
   * Batch insert streets from tile download
   * Uses transaction for atomicity and performance
   */
  async insertStreets(streets: StreetSegment[], tileCoord: TileCoordinate): Promise<void> {
    const startTime = performance.now();

    await this.db.transaction(async (tx) => {
      for (const street of streets) {
        const bbox = this.calculateStreetBoundingBox(street.coordinates);

        await tx.execute(`
          INSERT OR REPLACE INTO streets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          street.id,
          street.name,
          street.type,
          tileCoord.x,
          tileCoord.y,
          bbox.south,
          bbox.north,
          bbox.west,
          bbox.east,
          this.serializeCoordinates(street.coordinates),
          street.isExplored ? 1 : 0,
          street.exploredAt,
          street.confidenceScore || 0.0,
          street.visitCount || 0,
          street.lastVisited,
          Date.now(),
          Date.now() + (this.TTL_DAYS * 24 * 60 * 60 * 1000),
        ]);
      }
    });

    const duration = performance.now() - startTime;
    logger.perf('StreetCache.insertStreets', {
      duration,
      streetCount: streets.length,
      tileCoord,
    });
  }

  /**
   * Evict expired tiles to keep database size manageable
   * Run periodically in background
   */
  async evictExpiredTiles(): Promise<number> {
    const startTime = performance.now();
    const now = Date.now();

    const result = await this.db.execute(`
      DELETE FROM streets WHERE expires_at < ?
    `, [now]);

    await this.db.execute(`DELETE FROM intersections WHERE expires_at < ?`, [now]);
    await this.db.execute(`DELETE FROM tiles WHERE expires_at < ?`, [now]);

    // Run VACUUM periodically to reclaim space
    if (result.rowsAffected > 1000) {
      await this.db.execute('VACUUM');
    }

    const duration = performance.now() - startTime;
    logger.perf('StreetCache.evictExpiredTiles', {
      duration,
      rowsDeleted: result.rowsAffected,
    });

    return result.rowsAffected;
  }
}
```

---

### 3. GPS Noise Tolerance & Confidence Scoring

#### Problem Statement

GPS has inherent accuracy limitations:
- **Urban areas**: ±5-15m typical, worse near tall buildings
- **Suburban**: ±3-8m typical
- **Indoor/tunnel**: Complete signal loss or ±50m+ error
- **Weather dependent**: Rain/clouds degrade signal

A binary "explored" flag causes:
- False positives: GPS drift marks streets you didn't visit
- False negatives: Walking on street but GPS shows you 12m away

#### Confidence-Based Solution

```typescript
interface ExplorationConfidence {
  confidenceScore: number; // 0.0 to 1.0
  visitCount: number; // Number of GPS samples near this street
  lastVisited: number; // Most recent visit timestamp
  totalTimeNearby: number; // Cumulative seconds within threshold
  averageDistance: number; // Average distance of GPS points
}

class GPSNoiseFilter {
  // Distance thresholds for confidence levels
  private readonly CONFIDENCE_THRESHOLDS = {
    HIGH: 5, // 0-5m = high confidence (0.8-1.0)
    MEDIUM: 15, // 5-15m = medium confidence (0.4-0.8)
    LOW: 30, // 15-30m = low confidence (0.1-0.4)
    NOISE: 50, // 30-50m = likely noise (0.0-0.1)
  };

  /**
   * Calculate confidence score for a single GPS point near a street
   * Factors: distance, GPS accuracy, time spent, historical visits
   */
  calculatePointConfidence(
    gpsPoint: GPSPoint,
    distanceToStreet: number,
    street: StreetSegment
  ): number {
    // Base confidence from distance
    let confidence = 0;
    if (distanceToStreet <= this.CONFIDENCE_THRESHOLDS.HIGH) {
      confidence = 0.8 + (1 - distanceToStreet / this.CONFIDENCE_THRESHOLDS.HIGH) * 0.2;
    } else if (distanceToStreet <= this.CONFIDENCE_THRESHOLDS.MEDIUM) {
      const ratio = (distanceToStreet - this.CONFIDENCE_THRESHOLDS.HIGH) /
                   (this.CONFIDENCE_THRESHOLDS.MEDIUM - this.CONFIDENCE_THRESHOLDS.HIGH);
      confidence = 0.4 + (1 - ratio) * 0.4;
    } else if (distanceToStreet <= this.CONFIDENCE_THRESHOLDS.LOW) {
      const ratio = (distanceToStreet - this.CONFIDENCE_THRESHOLDS.MEDIUM) /
                   (this.CONFIDENCE_THRESHOLDS.LOW - this.CONFIDENCE_THRESHOLDS.MEDIUM);
      confidence = 0.1 + (1 - ratio) * 0.3;
    } else if (distanceToStreet <= this.CONFIDENCE_THRESHOLDS.NOISE) {
      confidence = 0.05;
    }

    // Adjust for GPS accuracy
    if (gpsPoint.accuracy) {
      if (gpsPoint.accuracy > 20) {
        confidence *= 0.5; // Low accuracy GPS, reduce confidence
      } else if (gpsPoint.accuracy < 8) {
        confidence *= 1.2; // High accuracy GPS, boost confidence
      }
    }

    // Boost for repeated visits
    if (street.visitCount > 5) {
      confidence *= 1.1;
    }

    // Cap at 1.0
    return Math.min(confidence, 1.0);
  }

  /**
   * Update street confidence based on new GPS point
   * Uses exponential moving average to weigh recent visits more
   */
  updateStreetConfidence(
    street: StreetSegment,
    newPointConfidence: number,
    gpsPoint: GPSPoint
  ): StreetSegment {
    const alpha = 0.3; // EMA smoothing factor

    // Update confidence score (exponential moving average)
    const oldConfidence = street.confidenceScore || 0;
    street.confidenceScore = alpha * newPointConfidence + (1 - alpha) * oldConfidence;

    // Update visit metadata
    street.visitCount = (street.visitCount || 0) + 1;
    street.lastVisited = gpsPoint.timestamp;

    // Mark as "explored" if confidence exceeds threshold
    if (street.confidenceScore >= 0.5 && !street.isExplored) {
      street.isExplored = true;
      street.exploredAt = gpsPoint.timestamp;

      logger.info('Street marked as explored', {
        streetId: street.id,
        streetName: street.name,
        confidenceScore: street.confidenceScore,
        visitCount: street.visitCount,
      });
    }

    return street;
  }

  /**
   * Filter out obvious GPS noise before processing
   */
  filterNoisePoints(gpsPoints: GPSPoint[]): GPSPoint[] {
    if (gpsPoints.length < 2) return gpsPoints;

    const filtered: GPSPoint[] = [gpsPoints[0]!]; // Always keep first point

    for (let i = 1; i < gpsPoints.length; i++) {
      const current = gpsPoints[i]!;
      const previous = filtered[filtered.length - 1]!;

      // Calculate speed between points
      const distance = haversineDistance(previous, current);
      const timeDiff = (current.timestamp - previous.timestamp) / 1000; // seconds
      const speed = distance / timeDiff; // meters per second

      // Filter out impossible speeds (> 100 km/h = 27.8 m/s)
      // User is walking/jogging, not driving
      if (speed > 27.8) {
        logger.warn('GPS noise detected: impossible speed', {
          speed,
          distance,
          timeDiff,
          filtered: true,
        });
        continue;
      }

      // Filter out low accuracy points when we have better data
      if (current.accuracy && current.accuracy > 50 && previous.accuracy && previous.accuracy < 20) {
        logger.warn('GPS noise detected: low accuracy after high accuracy', {
          currentAccuracy: current.accuracy,
          previousAccuracy: previous.accuracy,
          filtered: true,
        });
        continue;
      }

      filtered.push(current);
    }

    logger.info('GPS noise filtering complete', {
      original: gpsPoints.length,
      filtered: filtered.length,
      removed: gpsPoints.length - filtered.length,
    });

    return filtered;
  }
}
```

#### GPS Point Generation with Realistic Noise

```typescript
/**
 * Generate test GPS data with realistic noise characteristics
 * Used by developer tools for testing
 */
export const generateGPSPointsWithNoise = (
  basePoints: GeoPoint[],
  options: {
    noiseStdDev?: number; // Standard deviation in meters (default: 5m)
    accuracyRange?: [number, number]; // Min/max accuracy values (default: [3, 15])
    dropoutProbability?: number; // Chance of signal loss (default: 0.02)
    driftProbability?: number; // Chance of sustained drift (default: 0.05)
  } = {}
): GPSPointWithAccuracy[] {
  const {
    noiseStdDev = 5,
    accuracyRange = [3, 15],
    dropoutProbability = 0.02,
    driftProbability = 0.05,
  } = options;

  const noisyPoints: GPSPointWithAccuracy[] = [];
  let isDrifting = false;
  let driftOffset = { lat: 0, lon: 0 };

  for (const basePoint of basePoints) {
    // Simulate signal dropout
    if (Math.random() < dropoutProbability) {
      logger.debug('Simulated GPS dropout', { timestamp: basePoint.timestamp });
      continue;
    }

    // Simulate sustained drift (GPS multipath, urban canyon effect)
    if (Math.random() < driftProbability) {
      isDrifting = !isDrifting;
      if (isDrifting) {
        // New drift direction
        const driftDistance = gaussianRandom(0, 10); // Mean 0, std dev 10m
        const driftAngle = Math.random() * 2 * Math.PI;
        driftOffset = {
          lat: (driftDistance * Math.cos(driftAngle)) / 111000,
          lon: (driftDistance * Math.sin(driftAngle)) / (111000 * Math.cos(basePoint.latitude * Math.PI / 180)),
        };
        logger.debug('Simulated GPS drift started', { driftDistance });
      } else {
        logger.debug('Simulated GPS drift ended');
      }
    }

    // Add Gaussian noise to simulate GPS inaccuracy
    const noiseLat = gaussianRandom(0, noiseStdDev) / 111000;
    const noiseLon = gaussianRandom(0, noiseStdDev) / (111000 * Math.cos(basePoint.latitude * Math.PI / 180));

    // Apply drift if active
    const driftLat = isDrifting ? driftOffset.lat : 0;
    const driftLon = isDrifting ? driftOffset.lon : 0;

    // Generate realistic accuracy value
    const accuracy = accuracyRange[0] + Math.random() * (accuracyRange[1] - accuracyRange[0]);

    noisyPoints.push({
      latitude: basePoint.latitude + noiseLat + driftLat,
      longitude: basePoint.longitude + noiseLon + driftLon,
      timestamp: basePoint.timestamp,
      accuracy,
      isDrifting,
    });
  }

  return noisyPoints;
};

/**
 * Box-Muller transform for Gaussian random numbers
 */
function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}
```

---

### 4. Async Download Queue

#### Requirements

- Never block UI thread
- Prioritize visible tiles over background tiles
- Respect Overpass API rate limits (10 req/min = 6s between requests)
- Handle errors gracefully with retry logic
- Allow cancellation of queued downloads when viewport changes rapidly

#### Implementation

```typescript
interface DownloadTask {
  id: string;
  tileCoord: TileCoordinate;
  priority: number;
  createdAt: number;
  attempts: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
}

class AsyncDownloadQueue {
  private queue: PriorityQueue<DownloadTask>;
  private activeDownloads: Map<string, AbortController> = new Map();
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL_MS = 6000; // Rate limit
  private readonly MAX_CONCURRENT = 2; // Max parallel downloads
  private readonly MAX_RETRIES = 3;

  constructor(
    private cacheService: StreetCacheService,
    private overpassClient: OverpassAPIClient
  ) {
    this.queue = new PriorityQueue((a, b) => b.priority - a.priority);
    this.startWorker();
  }

  /**
   * Enqueue tile for download
   * Deduplicates if already queued
   */
  enqueue(tileCoord: TileCoordinate, priority: number): string {
    const taskId = this.getTileId(tileCoord);

    // Cancel existing task if lower priority
    const existing = this.queue.find(t => t.id === taskId);
    if (existing) {
      if (priority > existing.priority) {
        this.queue.remove(existing);
        existing.priority = priority;
        this.queue.push(existing);
        logger.debug('Download task priority updated', { taskId, newPriority: priority });
      }
      return taskId;
    }

    // Add new task
    const task: DownloadTask = {
      id: taskId,
      tileCoord,
      priority,
      createdAt: Date.now(),
      attempts: 0,
      status: 'queued',
    };

    this.queue.push(task);

    logger.info('Tile download queued', {
      taskId,
      tileCoord,
      priority,
      queueSize: this.queue.size(),
    });

    return taskId;
  }

  /**
   * Cancel all downloads for tiles no longer in viewport
   */
  cancelOutOfViewport(visibleTiles: TileCoordinate[]): number {
    const visibleIds = new Set(visibleTiles.map(this.getTileId));
    let cancelledCount = 0;

    // Cancel queued tasks
    this.queue.removeIf(task => {
      if (!visibleIds.has(task.id)) {
        task.status = 'cancelled';
        cancelledCount++;
        return true;
      }
      return false;
    });

    // Cancel active downloads
    for (const [taskId, abortController] of this.activeDownloads) {
      if (!visibleIds.has(taskId)) {
        abortController.abort();
        this.activeDownloads.delete(taskId);
        cancelledCount++;
      }
    }

    if (cancelledCount > 0) {
      logger.info('Cancelled out-of-viewport downloads', { count: cancelledCount });
    }

    return cancelledCount;
  }

  /**
   * Background worker that processes queue
   */
  private async startWorker(): Promise<void> {
    while (true) {
      // Wait if we're at max concurrent or need to respect rate limit
      while (this.activeDownloads.size >= this.MAX_CONCURRENT || !this.canMakeRequest()) {
        await sleep(100);
      }

      // Get next task
      const task = this.queue.pop();
      if (!task) {
        await sleep(500); // Queue empty, wait before checking again
        continue;
      }

      // Process task
      this.processTask(task);
    }
  }

  /**
   * Process a single download task
   */
  private async processTask(task: DownloadTask): Promise<void> {
    const startTime = performance.now();
    task.status = 'downloading';
    task.attempts++;

    const abortController = new AbortController();
    this.activeDownloads.set(task.id, abortController);

    try {
      logger.info('Starting tile download', {
        taskId: task.id,
        tileCoord: task.tileCoord,
        attempt: task.attempts,
        queueWaitTime: Date.now() - task.createdAt,
      });

      // Rate limiting
      await this.waitForRateLimit();

      // Download from Overpass API
      const streets = await this.overpassClient.fetchTile(
        task.tileCoord,
        { signal: abortController.signal }
      );

      // Store in cache
      await this.cacheService.insertStreets(streets, task.tileCoord);

      // Update tile metadata
      await this.cacheService.updateTileState(task.tileCoord, TileState.LOADED);

      task.status = 'completed';
      const duration = performance.now() - startTime;

      logger.perf('Tile download completed', {
        taskId: task.id,
        tileCoord: task.tileCoord,
        duration,
        streetCount: streets.length,
        attempt: task.attempts,
      });

      // Emit event for UI to react
      EventEmitter.emit('tile:loaded', {
        tileCoord: task.tileCoord,
        streetCount: streets.length,
      });

    } catch (error) {
      if (abortController.signal.aborted) {
        task.status = 'cancelled';
        logger.debug('Tile download cancelled', { taskId: task.id });
      } else {
        task.status = 'failed';

        logger.error('Tile download failed', error, {
          taskId: task.id,
          tileCoord: task.tileCoord,
          attempt: task.attempts,
        });

        // Retry logic with exponential backoff
        if (task.attempts < this.MAX_RETRIES) {
          const backoffMs = Math.pow(2, task.attempts) * 1000;
          setTimeout(() => {
            task.status = 'queued';
            task.priority = Math.max(0, task.priority - 10); // Lower priority on retry
            this.queue.push(task);
          }, backoffMs);

          logger.info('Tile download will retry', {
            taskId: task.id,
            nextAttempt: task.attempts + 1,
            backoffMs,
          });
        } else {
          // Max retries exceeded, update tile state
          await this.cacheService.updateTileState(
            task.tileCoord,
            TileState.ERROR,
            error.message
          );

          logger.error('Tile download failed permanently', error, {
            taskId: task.id,
            maxRetriesReached: true,
          });
        }
      }
    } finally {
      this.activeDownloads.delete(task.id);
      this.lastRequestTime = Date.now();
    }
  }

  /**
   * Ensure we respect rate limiting
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL_MS) {
      const waitTime = this.MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
      logger.debug('Rate limit wait', { waitTime });
      await sleep(waitTime);
    }
  }

  private canMakeRequest(): boolean {
    const now = Date.now();
    return now - this.lastRequestTime >= this.MIN_REQUEST_INTERVAL_MS;
  }

  private getTileId(coord: TileCoordinate): string {
    return `${coord.zoom}/${coord.x}/${coord.y}`;
  }
}
```

---

### 5. State Machine for Viewport Loading

#### State Diagram

```
┌─────────────────┐
│   INITIALIZING  │ ← App startup
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│      IDLE       │ ← No viewport changes
└────┬───────┬────┘
     │       │
     ↓       ↓ (viewport change)
     │  ┌────────────┐
     │  │ CALCULATING│ ← Determine required tiles
     │  └─────┬──────┘
     │        │
     │        ↓
     │  ┌────────────┐
     │  │  CHECKING  │ ← Query cache for tiles
     │  └─────┬──────┘
     │        │
     │        ├─→ All in cache → IDLE
     │        │
     │        ↓ (some missing)
     │  ┌────────────┐
     │  │   LOADING  │ ← Download missing tiles
     │  └─────┬──────┘
     │        │
     │        ├─→ Downloads complete → IDLE
     │        ├─→ Viewport changed → CALCULATING
     │        └─→ Error → ERROR
     │
     ↓
┌─────────────────┐
│      ERROR      │ ← Download failures
└─────────────────┘
     │
     ↓ (retry)
   CALCULATING
```

#### Implementation

```typescript
enum ViewportLoadState {
  INITIALIZING = 'initializing',
  IDLE = 'idle',
  CALCULATING = 'calculating',
  CHECKING = 'checking',
  LOADING = 'loading',
  ERROR = 'error',
}

interface ViewportLoadContext {
  state: ViewportLoadState;
  currentViewport: MapViewport | null;
  requiredTiles: TileCoordinate[];
  loadedTiles: TileCoordinate[];
  loadingTiles: TileCoordinate[];
  missingTiles: TileCoordinate[];
  error: Error | null;
  lastStateChange: number;
}

class ViewportLoadStateMachine {
  private context: ViewportLoadContext;
  private listeners: Map<ViewportLoadState, Array<() => void>> = new Map();

  constructor(
    private viewportManager: ViewportManager,
    private cacheService: StreetCacheService,
    private downloadQueue: AsyncDownloadQueue
  ) {
    this.context = {
      state: ViewportLoadState.INITIALIZING,
      currentViewport: null,
      requiredTiles: [],
      loadedTiles: [],
      loadingTiles: [],
      missingTiles: [],
      error: null,
      lastStateChange: Date.now(),
    };

    this.initialize();
  }

  /**
   * Handle viewport change event
   */
  async onViewportChange(newViewport: MapViewport): Promise<void> {
    logger.info('Viewport changed', {
      currentState: this.context.state,
      newViewport,
    });

    this.context.currentViewport = newViewport;

    // Transition based on current state
    switch (this.context.state) {
      case ViewportLoadState.IDLE:
      case ViewportLoadState.ERROR:
        await this.transitionTo(ViewportLoadState.CALCULATING);
        break;

      case ViewportLoadState.LOADING:
        // Cancel out-of-viewport downloads
        this.downloadQueue.cancelOutOfViewport(
          this.viewportManager.calculateRequiredTiles(newViewport)
        );
        // Recalculate immediately
        await this.transitionTo(ViewportLoadState.CALCULATING);
        break;

      case ViewportLoadState.CALCULATING:
      case ViewportLoadState.CHECKING:
        // Already in progress, will pick up new viewport on next cycle
        break;
    }
  }

  /**
   * Transition to new state
   */
  private async transitionTo(newState: ViewportLoadState): Promise<void> {
    const oldState = this.context.state;
    const stateTransitionStart = performance.now();

    logger.info('State transition', {
      from: oldState,
      to: newState,
      viewport: this.context.currentViewport,
    });

    this.context.state = newState;
    this.context.lastStateChange = Date.now();

    // Execute state logic
    switch (newState) {
      case ViewportLoadState.CALCULATING:
        await this.executeCalculating();
        break;

      case ViewportLoadState.CHECKING:
        await this.executeChecking();
        break;

      case ViewportLoadState.LOADING:
        await this.executeLoading();
        break;

      case ViewportLoadState.IDLE:
        this.executeIdle();
        break;

      case ViewportLoadState.ERROR:
        this.executeError();
        break;
    }

    const duration = performance.now() - stateTransitionStart;
    logger.perf('State transition complete', {
      from: oldState,
      to: newState,
      duration,
    });

    // Notify listeners
    this.notifyListeners(newState);
  }

  /**
   * CALCULATING state: Determine which tiles are needed
   */
  private async executeCalculating(): Promise<void> {
    if (!this.context.currentViewport) {
      await this.transitionTo(ViewportLoadState.IDLE);
      return;
    }

    this.context.requiredTiles = this.viewportManager.calculateRequiredTiles(
      this.context.currentViewport
    );

    logger.debug('Required tiles calculated', {
      count: this.context.requiredTiles.length,
      viewport: this.context.currentViewport,
    });

    await this.transitionTo(ViewportLoadState.CHECKING);
  }

  /**
   * CHECKING state: Query cache for required tiles
   */
  private async executeChecking(): Promise<void> {
    const tileStates = await Promise.all(
      this.context.requiredTiles.map(tile =>
        this.cacheService.getTileState(tile)
      )
    );

    this.context.loadedTiles = [];
    this.context.missingTiles = [];
    this.context.loadingTiles = [];

    for (let i = 0; i < this.context.requiredTiles.length; i++) {
      const tile = this.context.requiredTiles[i]!;
      const state = tileStates[i]!;

      if (state === TileState.LOADED) {
        this.context.loadedTiles.push(tile);
      } else if (state === TileState.LOADING) {
        this.context.loadingTiles.push(tile);
      } else {
        this.context.missingTiles.push(tile);
      }
    }

    logger.info('Tile cache check complete', {
      required: this.context.requiredTiles.length,
      loaded: this.context.loadedTiles.length,
      loading: this.context.loadingTiles.length,
      missing: this.context.missingTiles.length,
    });

    // Transition based on results
    if (this.context.missingTiles.length === 0 && this.context.loadingTiles.length === 0) {
      // All tiles cached
      await this.transitionTo(ViewportLoadState.IDLE);
    } else {
      // Need to load some tiles
      await this.transitionTo(ViewportLoadState.LOADING);
    }
  }

  /**
   * LOADING state: Queue missing tiles for download
   */
  private async executeLoading(): Promise<void> {
    // Prioritize visible tiles over buffer tiles
    const prioritizedTiles = this.viewportManager.prioritizeTiles(
      this.context.missingTiles,
      this.context.currentViewport!
    );

    // Enqueue downloads
    for (const tile of prioritizedTiles) {
      this.downloadQueue.enqueue(tile.coordinate, tile.priority);
    }

    // Listen for tile load completions
    const loadListener = (event: { tileCoord: TileCoordinate }) => {
      // Remove from loading list
      const index = this.context.loadingTiles.findIndex(
        t => this.tilesEqual(t, event.tileCoord)
      );
      if (index >= 0) {
        this.context.loadingTiles.splice(index, 1);
        this.context.loadedTiles.push(event.tileCoord);
      }

      // If all tiles loaded, transition to IDLE
      if (this.context.missingTiles.length === 0 && this.context.loadingTiles.length === 0) {
        EventEmitter.off('tile:loaded', loadListener);
        this.transitionTo(ViewportLoadState.IDLE);
      }
    };

    EventEmitter.on('tile:loaded', loadListener);

    // Set timeout for hanging loads
    setTimeout(() => {
      if (this.context.state === ViewportLoadState.LOADING) {
        logger.warn('Load timeout exceeded, transitioning to IDLE', {
          loadingTiles: this.context.loadingTiles.length,
        });
        EventEmitter.off('tile:loaded', loadListener);
        this.transitionTo(ViewportLoadState.IDLE);
      }
    }, 60000); // 60 second timeout
  }

  /**
   * IDLE state: All required tiles loaded
   */
  private executeIdle(): void {
    logger.info('Viewport load complete', {
      loadedTiles: this.context.loadedTiles.length,
    });

    // Could trigger prefetching of adjacent tiles here
    this.prefetchAdjacentTiles();
  }

  /**
   * ERROR state: Handle download failures
   */
  private executeError(): void {
    logger.error('Viewport load error', this.context.error, {
      currentState: this.context.state,
      missingTiles: this.context.missingTiles.length,
    });

    // Could show user notification here
    // After some delay, could retry by transitioning back to CALCULATING
  }

  /**
   * Prefetch tiles adjacent to viewport for smoother panning
   */
  private prefetchAdjacentTiles(): void {
    if (!this.context.currentViewport) return;

    // Calculate tiles 2 rings out from viewport
    const extendedViewport = {
      ...this.context.currentViewport,
      widthMeters: this.context.currentViewport.widthMeters * 2,
      heightMeters: this.context.currentViewport.heightMeters * 2,
    };

    const adjacentTiles = this.viewportManager.calculateRequiredTiles(extendedViewport);
    const newTiles = adjacentTiles.filter(
      tile => !this.context.loadedTiles.some(loaded => this.tilesEqual(loaded, tile))
    );

    if (newTiles.length > 0) {
      logger.debug('Prefetching adjacent tiles', { count: newTiles.length });

      for (const tile of newTiles) {
        this.downloadQueue.enqueue(tile, 10); // Low priority
      }
    }
  }

  private tilesEqual(a: TileCoordinate, b: TileCoordinate): boolean {
    return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
  }
}
```

---

### 6. Instrumentation & Performance Monitoring

#### Logging Infrastructure

```typescript
/**
 * Enhanced logger with performance tracking
 */
class Logger {
  /**
   * Log performance metrics
   * Automatically includes timing, counts, and context
   */
  perf(operation: string, metrics: Record<string, any>): void {
    const logEntry = {
      level: 'PERF',
      timestamp: Date.now(),
      operation,
      ...metrics,
    };

    // Log to console in development
    if (__DEV__) {
      console.log(`[PERF] ${operation}`, metrics);
    }

    // Send to analytics in production
    if (!__DEV__) {
      Analytics.track('performance_metric', logEntry);
    }

    // Store in local database for debugging
    this.storeMetric(logEntry);
  }

  /**
   * Store metrics locally for debugging
   * Can be exported via developer menu
   */
  private async storeMetric(entry: any): Promise<void> {
    // Use separate SQLite table for metrics
    await db.execute(`
      INSERT INTO performance_metrics (timestamp, operation, data)
      VALUES (?, ?, ?)
    `, [entry.timestamp, entry.operation, JSON.stringify(entry)]);
  }
}

/**
 * Performance tracker for monitoring operations
 */
class PerformanceTracker {
  private operations: Map<string, number> = new Map();

  /**
   * Start timing an operation
   */
  start(operationId: string): void {
    this.operations.set(operationId, performance.now());
  }

  /**
   * End timing and log result
   */
  end(operationId: string, metadata?: Record<string, any>): number {
    const startTime = this.operations.get(operationId);
    if (!startTime) {
      logger.warn('Performance tracking end called without start', { operationId });
      return 0;
    }

    const duration = performance.now() - startTime;
    this.operations.delete(operationId);

    logger.perf(operationId, {
      duration,
      ...metadata,
    });

    return duration;
  }

  /**
   * Track async operation
   */
  async track<T>(
    operationId: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    this.start(operationId);
    try {
      const result = await operation();
      this.end(operationId, metadata);
      return result;
    } catch (error) {
      this.end(operationId, { ...metadata, error: true });
      throw error;
    }
  }
}

// Export singleton
export const performanceTracker = new PerformanceTracker();
```

#### Key Metrics to Track

```typescript
/**
 * Metrics tracked throughout the system
 */
const TRACKED_OPERATIONS = {
  // Viewport operations
  'viewport.calculateTiles': 'Time to calculate required tiles',
  'viewport.stateTransition': 'Time for state machine transition',

  // Cache operations
  'cache.queryStreets': 'SQLite R-tree query time',
  'cache.insertStreets': 'Batch insert time',
  'cache.eviction': 'Old tile eviction time',

  // Download operations
  'download.overpassAPI': 'Overpass API request time',
  'download.queueWait': 'Time task waited in queue',
  'download.parseResponse': 'OSM data parsing time',

  // Exploration tracking
  'exploration.updateConfidence': 'Confidence score calculation time',
  'exploration.filterNoise': 'GPS noise filtering time',
  'exploration.markExplored': 'Time to mark streets explored',

  // UI operations
  'ui.renderStreets': 'Street rendering time',
  'ui.mapUpdate': 'Map component update time',
};
```

#### Developer Menu for Metrics

```typescript
/**
 * Add performance monitoring section to developer menu
 */
export const PerformanceMonitoringPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    const recentMetrics = await db.query(`
      SELECT * FROM performance_metrics
      WHERE timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 100
    `, [Date.now() - 3600000]); // Last hour

    setMetrics(recentMetrics);
  };

  const exportMetrics = async () => {
    const csv = generateCSV(metrics);
    await Share.share({
      message: csv,
      title: 'Performance Metrics',
    });
  };

  return (
    <View>
      <Text style={styles.header}>Performance Metrics (Last Hour)</Text>

      {/* Summary stats */}
      <View style={styles.summaryRow}>
        <MetricCard
          title="Avg Tile Load"
          value={calculateAvg(metrics, 'download.overpassAPI')}
          unit="ms"
        />
        <MetricCard
          title="Cache Hit Rate"
          value={calculateCacheHitRate(metrics)}
          unit="%"
        />
        <MetricCard
          title="Avg GPS Filter"
          value={calculateAvg(metrics, 'exploration.filterNoise')}
          unit="ms"
        />
      </View>

      {/* Detailed metrics table */}
      <ScrollView style={styles.metricsTable}>
        {metrics.map(metric => (
          <MetricRow key={metric.id} metric={metric} />
        ))}
      </ScrollView>

      {/* Actions */}
      <Button title="Export Metrics (CSV)" onPress={exportMetrics} />
      <Button title="Clear Metrics" onPress={clearMetrics} />
    </View>
  );
};
```

---

## Updated Testing Strategy

### Unit Tests with GPS Noise

```typescript
describe('GPSNoiseFilter', () => {
  let filter: GPSNoiseFilter;

  beforeEach(() => {
    filter = new GPSNoiseFilter();
  });

  describe('filterNoisePoints', () => {
    it('should filter out impossible speeds', () => {
      const points: GPSPoint[] = [
        { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now(), accuracy: 5 },
        // Jump 1km in 1 second = 1000 m/s (impossible for walking)
        { latitude: 44.0562, longitude: -123.0236, timestamp: Date.now() + 1000, accuracy: 5 },
      ];

      const filtered = filter.filterNoisePoints(points);

      expect(filtered).toHaveLength(1); // Second point filtered out
    });

    it('should keep realistic walking speeds', () => {
      const points: GPSPoint[] = [
        { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now(), accuracy: 5 },
        // Move ~10m in 10 seconds = 1 m/s (realistic walking)
        { latitude: 44.0463, longitude: -123.0236, timestamp: Date.now() + 10000, accuracy: 5 },
      ];

      const filtered = filter.filterNoisePoints(points);

      expect(filtered).toHaveLength(2); // Both points kept
    });

    it('should filter low accuracy after high accuracy', () => {
      const points: GPSPoint[] = [
        { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now(), accuracy: 8 },
        { latitude: 44.0463, longitude: -123.0236, timestamp: Date.now() + 5000, accuracy: 60 },
      ];

      const filtered = filter.filterNoisePoints(points);

      expect(filtered).toHaveLength(1); // Low accuracy point filtered
    });
  });

  describe('calculatePointConfidence', () => {
    it('should give high confidence for close distances', () => {
      const gpsPoint: GPSPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
        accuracy: 5,
      };

      const street = createMockStreet();
      const confidence = filter.calculatePointConfidence(gpsPoint, 3, street); // 3m away

      expect(confidence).toBeGreaterThan(0.8);
    });

    it('should give low confidence for far distances', () => {
      const gpsPoint: GPSPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
        accuracy: 5,
      };

      const street = createMockStreet();
      const confidence = filter.calculatePointConfidence(gpsPoint, 25, street); // 25m away

      expect(confidence).toBeLessThan(0.2);
    });

    it('should reduce confidence for low GPS accuracy', () => {
      const highAccuracyPoint: GPSPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
        accuracy: 5,
      };

      const lowAccuracyPoint: GPSPoint = {
        ...highAccuracyPoint,
        accuracy: 30,
      };

      const street = createMockStreet();
      const highConfidence = filter.calculatePointConfidence(highAccuracyPoint, 10, street);
      const lowConfidence = filter.calculatePointConfidence(lowAccuracyPoint, 10, street);

      expect(lowConfidence).toBeLessThan(highConfidence);
    });
  });
});
```

### Maestro Tests with Realistic GPS Simulation

```yaml
appId: com.fogofdog.app
---
# Test street-based navigation with GPS noise simulation

- launchApp
- assertVisible: "FogOfDog"

# Enable developer settings
- tapOn: "Settings"
- tapOn: "Developer Settings"

# Enable street preferences AND GPS noise
- tapOn:
    id: "prefer-streets-toggle"
- tapOn:
    id: "gps-noise-toggle" # NEW: Simulate realistic GPS noise
- assertVisible: "GPS Noise: Enabled"

# Configure noise parameters
- tapOn: "GPS Noise Settings"
- inputText:
    id: "noise-std-dev"
    text: "8" # 8m standard deviation (realistic urban)
- inputText:
    id: "dropout-probability"
    text: "0.05" # 5% chance of signal loss
- tapOn: "Save"

# Inject data with noise
- tapOn:
    id: "back-button"
- tapOn: "Clear All Data"
- tapOn: "Confirm"

- tapOn: "Inject Street-Based Data"
- inputText: "100" # 100 GPS points
- tapOn: "Inject"

# Wait for processing
- waitForAnimationToEnd
- wait: 5000 # Extra time for confidence scoring

# Verify exploration tracking handled noise correctly
- tapOn:
    id: "back-button"
- tapOn:
    id: "back-button"

# Open exploration stats
- tapOn: "Stats"
- assertVisible: "Streets Explored"

# Verify confidence-based exploration
- runScript: |
    const stats = await getExplorationStats();

    // Should have marked streets as explored despite GPS noise
    expect(stats.streetsExplored).toBeGreaterThan(5);

    // But not all streets (noise filtering should prevent false positives)
    expect(stats.streetsExplored).toBeLessThan(15);

    // Confidence scores should be reasonable
    expect(stats.averageConfidence).toBeGreaterThan(0.4);
    expect(stats.averageConfidence).toBeLessThan(0.9);

    // Some points should have been filtered as noise
    expect(stats.noisePointsFiltered).toBeGreaterThan(0);

# Check performance metrics
- tapOn: "Developer Settings"
- tapOn: "Performance Metrics"

# Verify timing logs
- runScript: |
    const metrics = await getPerformanceMetrics();

    // Viewport tile loads should be fast
    const avgTileLoad = metrics.find(m => m.operation === 'download.overpassAPI');
    expect(avgTileLoad.avgDuration).toBeLessThan(5000); // < 5 seconds

    // Cache queries should be very fast
    const avgCacheQuery = metrics.find(m => m.operation === 'cache.queryStreets');
    expect(avgCacheQuery.avgDuration).toBeLessThan(50); // < 50ms

    // GPS filtering should be fast
    const avgFilter = metrics.find(m => m.operation === 'exploration.filterNoise');
    expect(avgFilter.avgDuration).toBeLessThan(100); // < 100ms
```

---

## Migration Path from V1 to V2

### Phase 1: Add SQLite Cache (Week 1)
- [ ] Implement StreetCacheService with R-tree indexing
- [ ] Migrate existing in-memory data to SQLite
- [ ] Add cache query methods
- [ ] Test cache performance (queries < 50ms)

### Phase 2: Implement Viewport Management (Week 2)
- [ ] Create ViewportManager with tile calculation
- [ ] Implement ViewportLoadStateMachine
- [ ] Add viewport change detection in MapScreen
- [ ] Test state transitions

### Phase 3: Async Download Queue (Week 3)
- [ ] Implement AsyncDownloadQueue with priority
- [ ] Add rate limiting and retry logic
- [ ] Integrate with viewport state machine
- [ ] Test cancellation and error handling

### Phase 4: GPS Noise Tolerance (Week 4)
- [ ] Implement GPSNoiseFilter
- [ ] Add confidence scoring to exploration tracking
- [ ] Update dev tools with noise generation
- [ ] Test with realistic noise parameters

### Phase 5: Instrumentation (Week 5)
- [ ] Add performance tracking throughout system
- [ ] Create developer menu for metrics
- [ ] Add log events for all operations
- [ ] Test metrics collection and export

### Phase 6: Testing & Optimization (Week 6)
- [ ] Write comprehensive unit tests with noise
- [ ] Create Maestro E2E tests
- [ ] Performance profiling and optimization
- [ ] Load testing with large datasets

---

## Success Metrics

### Performance Requirements
- ✅ Cache query time: < 50ms (99th percentile)
- ✅ Tile download time: < 5s (average)
- ✅ State transition time: < 100ms
- ✅ UI frame rate: 60 FPS maintained during loads
- ✅ Memory usage: < 100MB for street data
- ✅ Database size: < 50MB per 100 km²

### Accuracy Requirements
- ✅ False positive rate: < 5% (streets marked explored but not visited)
- ✅ False negative rate: < 10% (streets visited but not marked)
- ✅ Confidence score accuracy: ±0.2 of ground truth
- ✅ GPS noise filtering: > 90% of impossible speeds caught

### User Experience Requirements
- ✅ No UI blocking during downloads
- ✅ Smooth panning (no stuttering)
- ✅ Offline mode works with cached data
- ✅ Error recovery without app restart

---

## Conclusion

This V2 architecture addresses all the critical issues identified in V1:

1. ✅ **Viewport-based loading** → Only loads what user sees
2. ✅ **SQLite + R-tree** → Fast queries, manageable memory
3. ✅ **Async operations** → Never blocks UI
4. ✅ **Confidence scoring** → Handles GPS noise gracefully
5. ✅ **State machine** → Robust handling of all scenarios
6. ✅ **Instrumentation** → Visibility into performance

The system is now production-ready and scalable to large cities while maintaining excellent performance and accuracy.
