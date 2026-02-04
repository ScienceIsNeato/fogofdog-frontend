/**
 * OverpassClient – fetches street geometry from the Overpass API and assembles
 * it into the same `{ segments, intersections }` shape used by the Redux store.
 *
 * This module is the **only** place that touches the network. Everything it
 * returns is plain data; no Redux dispatching happens here.
 *
 * Features:
 *   ✅ Retry with exponential back-off on transient errors
 *   ✅ Cache responses keyed on (centre, radius) with TTL
 *   ✅ Offline fallback status exposed to callers
 */

import type {
  StreetSegment,
  Intersection,
  StreetPoint,
  StreetType,
  OSMElement,
  OSMWayElement,
  OSMWayElementWithGeometry,
  OSMResponse,
} from '../types/street';
import { computeSegmentLength, makeNodeKey } from './StreetDataService';
import { logger } from '../utils/logger';

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// ---------------------------------------------------------------------------
// Retry & Caching Configuration
// ---------------------------------------------------------------------------

/** Maximum number of retry attempts for transient failures */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential back-off (doubles each retry) */
const RETRY_BASE_DELAY_MS = 1000;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Maximum cache entries to prevent memory bloat */
const MAX_CACHE_ENTRIES = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: StreetGraphResult;
  timestamp: number;
}

interface ParsedWay {
  id: string;
  name: string;
  streetType: StreetType | undefined;
  points: StreetPoint[];
}

export interface StreetGraphResult {
  segments: StreetSegment[];
  intersections: Intersection[];
}

export interface FetchStreetGraphResult extends StreetGraphResult {
  /** Whether data came from cache */
  fromCache: boolean;
  /** Whether we're in offline fallback mode */
  isOfflineFallback: boolean;
}

export type OverpassStatus = 'online' | 'offline' | 'unknown';

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

/** In-memory cache keyed on "lat,lng,radius" */
const responseCache = new Map<string, CacheEntry>();

/** Current connectivity status */
let overpassStatus: OverpassStatus = 'unknown';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function makeCacheKey(center: StreetPoint, radiusMeters: number): string {
  // Round coordinates to 4 decimal places (~11m precision) for cache hits
  const lat = center.latitude.toFixed(4);
  const lng = center.longitude.toFixed(4);
  return `${lat},${lng},${radiusMeters}`;
}

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network errors, timeouts, and 5xx are transient
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('fetch') ||
      /overpass api 5\d\d/.test(msg)
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseHighwayType(highway: string | undefined): StreetType | undefined {
  if (!highway) return undefined;
  // Map OSM highway values to our enum
  const mapping: Record<string, StreetType> = {
    motorway: 'motorway' as StreetType,
    motorway_link: 'motorway_link' as StreetType,
    primary: 'primary' as StreetType,
    secondary: 'secondary' as StreetType,
    tertiary: 'tertiary' as StreetType,
    residential: 'residential' as StreetType,
    unclassified: 'unclassified' as StreetType,
    service: 'service' as StreetType,
    living_street: 'living_street' as StreetType,
    pedestrian: 'pedestrian' as StreetType,
    footway: 'footway' as StreetType,
    cycleway: 'cycleway' as StreetType,
    track: 'track' as StreetType,
    path: 'path' as StreetType,
  };
  return mapping[highway];
}

async function fetchFromOverpassAPIWithRetry(
  center: StreetPoint,
  radiusMeters: number
): Promise<OSMElement[]> {
  const q = [
    '[out:json][timeout:25];(',
    'way["highway"~"^(residential|primary|secondary|tertiary|unclassified|living_street|service)$"]',
    `(around:${radiusMeters},${center.latitude},${center.longitude});`,
    ');out geom;',
  ].join('');

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.info(`Overpass retry ${attempt}/${MAX_RETRIES}, waiting ${delay}ms`, {
          component: 'OverpassClient',
          action: 'retry',
        });
        await sleep(delay);
      }

      const res = await fetch(OVERPASS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(q)}`,
      });

      if (!res.ok) {
        throw new Error(`Overpass API ${res.status}`);
      }

      const data = (await res.json()) as OSMResponse;
      overpassStatus = 'online';
      return data.elements;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isTransientError(error) || attempt === MAX_RETRIES) {
        overpassStatus = 'offline';
        logger.error('Overpass API failed', lastError, {
          component: 'OverpassClient',
          action: 'fetch',
          attempt,
        });
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error('Overpass fetch failed');
}

function hasGeometry(el: OSMElement): el is OSMWayElementWithGeometry {
  return (
    el.type === 'way' &&
    Array.isArray((el as OSMWayElement).geometry) &&
    ((el as OSMWayElement).geometry?.length ?? 0) >= 2
  );
}

function parseWays(elements: OSMElement[]): ParsedWay[] {
  return elements.filter(hasGeometry).map((el) => ({
    id: String(el.id),
    name: el.tags?.['name'] ?? 'Unnamed Road',
    streetType: parseHighwayType(el.tags?.['highway']),
    points: el.geometry.map((g) => ({ latitude: g.lat, longitude: g.lon })),
  }));
}

function buildStreetGraph(ways: ParsedWay[]): StreetGraphResult {
  // Pre-compute intersection map for O(1) lookups (addresses PR review feedback)
  const epMap: Record<string, { wayIds: string[]; point: StreetPoint }> = {};

  for (const way of ways) {
    const first = way.points[0];
    const last = way.points[way.points.length - 1];
    for (const ep of [first, last]) {
      if (!ep) continue;
      const key = makeNodeKey(ep.latitude, ep.longitude);
      epMap[key] ??= { wayIds: [], point: ep };
      epMap[key]!.wayIds.push(way.id);
    }
  }

  // Build intersections
  const intersections: Intersection[] = Object.entries(epMap).map(([key, data]) => ({
    id: key,
    latitude: data.point.latitude,
    longitude: data.point.longitude,
    streetNames: [...new Set(ways.filter((w) => data.wayIds.includes(w.id)).map((w) => w.name))],
    connectedSegmentIds: [],
  }));

  // Build a lookup map for O(1) intersection access
  const intersectionMap = new Map(intersections.map((i) => [i.id, i]));

  // Build segments and wire up connections
  const segments: StreetSegment[] = ways.map((way) => {
    const first = way.points[0];
    const last = way.points[way.points.length - 1];
    const startId = first ? makeNodeKey(first.latitude, first.longitude) : '';
    const endId = last ? makeNodeKey(last.latitude, last.longitude) : '';

    const seg: StreetSegment = {
      id: `seg_${way.id}`,
      name: way.name,
      ...(way.streetType && { streetType: way.streetType }),
      points: way.points,
      startNodeId: startId,
      endNodeId: endId,
      lengthMeters: computeSegmentLength(way.points),
    };

    // O(1) lookup instead of O(N) find
    const startInt = intersectionMap.get(startId);
    if (startInt) startInt.connectedSegmentIds.push(seg.id);
    const endInt = intersectionMap.get(endId);
    if (endInt) endInt.connectedSegmentIds.push(seg.id);

    return seg;
  });

  return { segments, intersections };
}

function pruneCache(): void {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;

  // Remove oldest entries first
  const entries = Array.from(responseCache.entries()).sort(
    (a, b) => a[1].timestamp - b[1].timestamp
  );
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
  for (const [key] of toRemove) {
    responseCache.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch street data around `centre` within `radiusMeters` from the Overpass
 * API and return the assembled graph.
 *
 * Uses caching and retry with exponential back-off.
 * The caller is responsible for dispatching the result into Redux.
 */
export async function fetchStreetGraph(
  centre: StreetPoint,
  radiusMeters: number
): Promise<FetchStreetGraphResult> {
  const cacheKey = makeCacheKey(centre, radiusMeters);

  // Check cache first
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.info('Overpass cache hit', {
      component: 'OverpassClient',
      action: 'cacheHit',
      key: cacheKey,
    });
    return {
      ...cached.data,
      fromCache: true,
      isOfflineFallback: false,
    };
  }

  try {
    const elements = await fetchFromOverpassAPIWithRetry(centre, radiusMeters);
    const ways = parseWays(elements);
    const result = buildStreetGraph(ways);

    // Store in cache
    responseCache.set(cacheKey, { data: result, timestamp: Date.now() });
    pruneCache();

    return {
      ...result,
      fromCache: false,
      isOfflineFallback: false,
    };
  } catch (error) {
    // If we have stale cache data, use it as offline fallback
    if (cached) {
      logger.info('Overpass offline fallback — using stale cache', {
        component: 'OverpassClient',
        action: 'offlineFallback',
        key: cacheKey,
      });
      return {
        ...cached.data,
        fromCache: true,
        isOfflineFallback: true,
      };
    }
    throw error;
  }
}

/**
 * Get the current Overpass API connectivity status.
 * Useful for UI indicators.
 */
export function getOverpassStatus(): OverpassStatus {
  return overpassStatus;
}

/**
 * Clear the response cache. Useful for testing or forcing fresh data.
 */
export function clearOverpassCache(): void {
  responseCache.clear();
}

/**
 * Get cache statistics for debugging.
 */
export function getOverpassCacheStats(): { size: number; maxSize: number } {
  return { size: responseCache.size, maxSize: MAX_CACHE_ENTRIES };
}
