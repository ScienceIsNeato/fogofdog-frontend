/**
 * StreetDataService – fetches, caches, and queries street-level data.
 *
 * Pure helper functions are exported individually so unit tests can exercise
 * them without instantiating the singleton or touching Redux.
 *
 * The singleton class (`StreetDataService`) is the only layer that reads /
 * writes Redux state; everything it delegates to is a plain function.
 */

import { store } from '../store';
import { logger } from '../utils/logger';
import type {
  StreetPoint,
  StreetSegment,
  Intersection,
  ExplorationFilter,
  ClosestStreetResult,
  ClosestIntersectionResult,
  LoopResult,
  LoopWaypoint,
} from '../types/street';
import {
  loadStreetData,
  setStreetLoading,
  setStreetError,
  markSegmentsExplored,
  markIntersectionsExplored,
} from '../store/slices/streetSlice';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const METERS_PER_MILE = 1609.344;
const EARTH_RADIUS_METERS = 6_371_000;
/** GPS points within this many metres of a segment mark it explored */
const EXPLORED_THRESHOLD_METERS = 30;
/** Upper bound on loop-walk iterations (prevents infinite spin) */
const MAX_LOOP_ITERATIONS = 500;

// ---------------------------------------------------------------------------
// 1. Pure geometry helpers  (exported for unit tests)
// ---------------------------------------------------------------------------

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.asin(Math.sqrt(a));
}

export function bearingBetween(from: StreetPoint, to: StreetPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const x = Math.sin(dLon) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

export function cardinalDirection(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const bearing = bearingBetween(
    { latitude: fromLat, longitude: fromLon },
    { latitude: toLat, longitude: toLon }
  );
  const idx = Math.round(((bearing + 360) % 360) / 45) % 8;
  return dirs[idx] ?? 'N';
}

/** Project point `p` onto the line segment `a`–`b`, clamped to [a, b]. */
function projectOntoEdge(p: StreetPoint, a: StreetPoint, b: StreetPoint): StreetPoint {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-20) return a;
  const t = Math.max(
    0,
    Math.min(1, ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) / lenSq)
  );
  return { latitude: a.latitude + t * dy, longitude: a.longitude + t * dx };
}

/**
 * Find the closest point on a polyline to `point`.
 * Checks every vertex **and** every edge projection.
 */
export function closestPointOnSegment(
  point: StreetPoint,
  segmentPoints: StreetPoint[]
): { closest: StreetPoint; distance: number } {
  if (segmentPoints.length === 0) return { closest: point, distance: Infinity };

  let bestDist = Infinity;
  let bestPt: StreetPoint = segmentPoints[0] ?? point;

  for (let i = 0; i < segmentPoints.length; i++) {
    const curr = segmentPoints[i];
    if (!curr) continue;

    const d = haversineDistance(point.latitude, point.longitude, curr.latitude, curr.longitude);
    if (d < bestDist) {
      bestDist = d;
      bestPt = curr;
    }

    const next = segmentPoints[i + 1];
    if (next) {
      const proj = projectOntoEdge(point, curr, next);
      const pd = haversineDistance(point.latitude, point.longitude, proj.latitude, proj.longitude);
      if (pd < bestDist) {
        bestDist = pd;
        bestPt = proj;
      }
    }
  }
  return { closest: bestPt, distance: bestDist };
}

/** Sum of haversine edges along a polyline (metres). */
export function computeSegmentLength(points: StreetPoint[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a && b) total += haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  return total;
}

// ---------------------------------------------------------------------------
// 2. Overpass API helpers
// ---------------------------------------------------------------------------

interface OverpassElement {
  type: string;
  id: number;
  tags?: { highway?: string; name?: string; [key: string]: string | undefined };
  geometry?: { lat: number; lon: number }[];
}

interface ParsedWay {
  id: string;
  name: string;
  points: StreetPoint[];
}

function makeNodeKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)}_${lon.toFixed(5)}`;
}

async function fetchFromOverpassAPI(
  center: StreetPoint,
  radiusMeters: number
): Promise<OverpassElement[]> {
  const q = [
    '[out:json][timeout:25];(',
    'way["highway"~"^(residential|primary|secondary|tertiary|unclassified|living_street|service)$"]',
    `(around:${radiusMeters},${center.latitude},${center.longitude});`,
    ');out geom;',
  ].join('');

  const res = await fetch(OVERPASS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(q)}`,
  });
  if (!res.ok) throw new Error(`Overpass API ${res.status}`);
  const data = (await res.json()) as { elements: OverpassElement[] };
  return data.elements;
}

function parseWays(elements: OverpassElement[]): ParsedWay[] {
  return elements
    .filter((el) => el.type === 'way' && el.geometry && el.geometry.length >= 2)
    .map((el) => ({
      id: String(el.id),
      name: el.tags?.name ?? 'Unnamed Road',
      points: (el.geometry ?? []).map((g) => ({ latitude: g.lat, longitude: g.lon })),
    }));
}

// ---------------------------------------------------------------------------
// 3. Graph construction  (endpoints → intersections → segments)
// ---------------------------------------------------------------------------

function buildStreetGraph(ways: ParsedWay[]): {
  segments: StreetSegment[];
  intersections: Intersection[];
} {
  // Collect first / last point of every way keyed by rounded coord
  const epMap: Record<string, { wayIds: string[]; point: StreetPoint }> = {};

  for (const way of ways) {
    const first = way.points[0];
    const last = way.points[way.points.length - 1];
    for (const ep of [first, last]) {
      if (!ep) continue;
      const key = makeNodeKey(ep.latitude, ep.longitude);
      if (!epMap[key]) epMap[key] = { wayIds: [], point: ep };
      epMap[key]!.wayIds.push(way.id);
    }
  }

  // Every endpoint becomes an intersection node
  const intersections: Intersection[] = Object.entries(epMap).map(([key, data]) => ({
    id: key,
    latitude: data.point.latitude,
    longitude: data.point.longitude,
    streetNames: [...new Set(ways.filter((w) => data.wayIds.includes(w.id)).map((w) => w.name))],
    connectedSegmentIds: [], // filled below
  }));

  // Build one segment per way; wire up connected-segment lists
  const segments: StreetSegment[] = ways.map((way) => {
    const first = way.points[0];
    const last = way.points[way.points.length - 1];
    const startId = first ? makeNodeKey(first.latitude, first.longitude) : '';
    const endId = last ? makeNodeKey(last.latitude, last.longitude) : '';

    const seg: StreetSegment = {
      id: `seg_${way.id}`,
      name: way.name,
      points: way.points,
      startNodeId: startId,
      endNodeId: endId,
      lengthMeters: computeSegmentLength(way.points),
    };

    const startInt = intersections.find((i) => i.id === startId);
    if (startInt) startInt.connectedSegmentIds.push(seg.id);
    const endInt = intersections.find((i) => i.id === endId);
    if (endInt) endInt.connectedSegmentIds.push(seg.id);

    return seg;
  });

  return { segments, intersections };
}

// ---------------------------------------------------------------------------
// 4. Core query functions  (pure – accept data, return results)
// ---------------------------------------------------------------------------

export function findClosestStreets(params: {
  segments: StreetSegment[];
  exploredIds: string[];
  comparisonPoint: StreetPoint;
  numResults: number;
  filter?: ExplorationFilter;
}): ClosestStreetResult[] {
  const { segments, exploredIds, comparisonPoint, numResults, filter } = params;

  return segments
    .map((seg) => {
      const { closest, distance } = closestPointOnSegment(comparisonPoint, seg.points);
      return { seg, closest, distance, isExplored: exploredIds.includes(seg.id) };
    })
    .filter(({ isExplored }) => {
      if (filter === 'explored') return isExplored;
      if (filter === 'unexplored') return !isExplored;
      return true;
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, numResults)
    .map(({ seg, closest, distance, isExplored }) => ({
      segmentId: seg.id,
      streetName: seg.name,
      distance,
      closestPoint: closest,
      direction: cardinalDirection(
        comparisonPoint.latitude,
        comparisonPoint.longitude,
        closest.latitude,
        closest.longitude
      ),
      isExplored,
    }));
}

export function findClosestIntersections(params: {
  intersections: Intersection[];
  exploredIds: string[];
  comparisonPoint: StreetPoint;
  numResults: number;
  filter?: ExplorationFilter;
}): ClosestIntersectionResult[] {
  const { intersections, exploredIds, comparisonPoint, numResults, filter } = params;

  return intersections
    .map((i) => ({
      intersection: i,
      distance: haversineDistance(
        comparisonPoint.latitude,
        comparisonPoint.longitude,
        i.latitude,
        i.longitude
      ),
      isExplored: exploredIds.includes(i.id),
    }))
    .filter(({ isExplored }) => {
      if (filter === 'explored') return isExplored;
      if (filter === 'unexplored') return !isExplored;
      return true;
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, numResults)
    .map(({ intersection, distance, isExplored }) => ({
      intersectionId: intersection.id,
      streetNames: intersection.streetNames,
      coordinates: { latitude: intersection.latitude, longitude: intersection.longitude },
      distance,
      direction: cardinalDirection(
        comparisonPoint.latitude,
        comparisonPoint.longitude,
        intersection.latitude,
        intersection.longitude
      ),
      isExplored,
    }));
}

// ---------------------------------------------------------------------------
// 5. Loop algorithm helpers
// ---------------------------------------------------------------------------

/** Bearing of the exit from `intersection` along `seg` (towards the other end). */
function getExitBearing(seg: StreetSegment, intersection: Intersection): number {
  const here: StreetPoint = { latitude: intersection.latitude, longitude: intersection.longitude };
  if (seg.startNodeId === intersection.id) {
    const next = seg.points.length > 1 ? seg.points[1] : seg.points[0];
    return next ? bearingBetween(here, next) : 0;
  }
  const lastIdx = seg.points.length - 1;
  const prev = lastIdx > 0 ? seg.points[lastIdx - 1] : seg.points[0];
  return prev ? bearingBetween(here, prev) : 0;
}

/** Bearing of arrival into `intersection` along `seg` (from the other end). */
function getIncomingBearing(seg: StreetSegment, intersection: Intersection): number {
  const here: StreetPoint = { latitude: intersection.latitude, longitude: intersection.longitude };
  if (seg.endNodeId === intersection.id) {
    const prev = seg.points.length > 1 ? seg.points[seg.points.length - 2] : seg.points[0];
    return prev ? bearingBetween(prev, here) : 0;
  }
  const next = seg.points.length > 1 ? seg.points[1] : seg.points[seg.points.length - 1];
  return next ? bearingBetween(next, here) : 0;
}

/**
 * Among exits from `intersection` (excluding `excludeSegId`), choose the
 * one that is the rightmost turn from `incomingBearing`.
 *
 * Sort key: `((exitBearing − incomingBearing − 90 + 720) % 360)` ascending.
 */
function selectRightmostExit(params: {
  intersection: Intersection;
  excludeSegId: string;
  incomingBearing: number;
  allSegments: Record<string, StreetSegment>;
}): string | null {
  const { intersection, excludeSegId, incomingBearing, allSegments } = params;

  const candidates = intersection.connectedSegmentIds
    .filter((id) => id !== excludeSegId)
    .map((id) => {
      const seg = allSegments[id];
      if (!seg) return null;
      return { id, bearing: getExitBearing(seg, intersection) };
    })
    .filter((c): c is { id: string; bearing: number } => c !== null);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aRel = (a.bearing - incomingBearing - 90 + 720) % 360;
    const bRel = (b.bearing - incomingBearing - 90 + 720) % 360;
    return aRel - bRel;
  });

  return candidates[0]?.id ?? null;
}

/** Walk the always-turn-right loop starting from `startIntersection`. */
function walkRightLoop(params: {
  startIntersection: Intersection;
  startSegId: string;
  allSegments: Record<string, StreetSegment>;
  allIntersections: Record<string, Intersection>;
  maxDistMeters: number;
}): LoopResult {
  const { startIntersection, startSegId, allSegments, allIntersections, maxDistMeters } = params;

  let current = startIntersection;
  let prevSegId = startSegId;
  let totalDist = 0;
  const waypoints: LoopWaypoint[] = [];

  const startSeg = allSegments[startSegId];
  let prevBearing = startSeg ? getIncomingBearing(startSeg, startIntersection) : 0;

  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    const nextSegId = selectRightmostExit({
      intersection: current,
      excludeSegId: prevSegId,
      incomingBearing: prevBearing,
      allSegments,
    });

    if (!nextSegId) {
      return {
        success: false,
        waypoints,
        totalDistanceMiles: totalDist / METERS_PER_MILE,
        error: 'dead_end',
      };
    }

    const nextSeg = allSegments[nextSegId];
    if (!nextSeg) {
      return {
        success: false,
        waypoints,
        totalDistanceMiles: totalDist / METERS_PER_MILE,
        error: 'dead_end',
      };
    }

    totalDist += nextSeg.lengthMeters;
    if (totalDist > maxDistMeters) {
      return {
        success: false,
        waypoints,
        totalDistanceMiles: totalDist / METERS_PER_MILE,
        error: 'max_distance_exceeded',
      };
    }

    // Determine next intersection
    const otherId = nextSeg.startNodeId === current.id ? nextSeg.endNodeId : nextSeg.startNodeId;
    const nextInt = allIntersections[otherId];
    if (!nextInt) {
      return {
        success: false,
        waypoints,
        totalDistanceMiles: totalDist / METERS_PER_MILE,
        error: 'dead_end',
      };
    }

    waypoints.push({
      intersectionId: nextInt.id,
      segmentId: nextSegId,
      direction: cardinalDirection(
        current.latitude,
        current.longitude,
        nextInt.latitude,
        nextInt.longitude
      ),
      distanceFromStart: totalDist,
    });

    // Loop closed?
    if (waypoints.length >= 3 && nextInt.id === startIntersection.id) {
      return { success: true, waypoints, totalDistanceMiles: totalDist / METERS_PER_MILE };
    }

    prevBearing = getExitBearing(nextSeg, current);
    prevSegId = nextSegId;
    current = nextInt;
  }

  return {
    success: false,
    waypoints,
    totalDistanceMiles: totalDist / METERS_PER_MILE,
    error: 'max_distance_exceeded',
  };
}

/**
 * Find the shortest loop from `startPoint` using the always-turn-right rule.
 */
export function findShortestLoop(params: {
  segments: Record<string, StreetSegment>;
  intersections: Record<string, Intersection>;
  startPoint: StreetPoint;
  maxDistanceMiles: number;
}): LoopResult {
  const { segments, intersections, startPoint, maxDistanceMiles } = params;
  const segList = Object.values(segments);
  if (segList.length === 0) {
    return { success: false, waypoints: [], totalDistanceMiles: 0, error: 'dead_end' };
  }

  // 1. Find nearest segment and project
  let bestSeg: StreetSegment | null = null;
  let bestDist = Infinity;
  for (const seg of segList) {
    const { distance } = closestPointOnSegment(startPoint, seg.points);
    if (distance < bestDist) {
      bestDist = distance;
      bestSeg = seg;
    }
  }
  if (!bestSeg) {
    return { success: false, waypoints: [], totalDistanceMiles: 0, error: 'dead_end' };
  }

  // 2. Walk to the nearer intersection on that segment
  const startInt = nearerIntersection(startPoint, bestSeg, intersections);
  if (!startInt) {
    return { success: false, waypoints: [], totalDistanceMiles: 0, error: 'dead_end' };
  }

  return walkRightLoop({
    startIntersection: startInt,
    startSegId: bestSeg.id,
    allSegments: segments,
    allIntersections: intersections,
    maxDistMeters: maxDistanceMiles * METERS_PER_MILE,
  });
}

/** Which end-intersection of `seg` is closer to `point`? */
function nearerIntersection(
  point: StreetPoint,
  seg: StreetSegment,
  intersections: Record<string, Intersection>
): Intersection | null {
  const startInt = intersections[seg.startNodeId];
  const endInt = intersections[seg.endNodeId];
  if (!startInt && !endInt) return null;
  if (!startInt) return endInt ?? null;
  if (!endInt) return startInt;

  const dStart = haversineDistance(
    point.latitude,
    point.longitude,
    startInt.latitude,
    startInt.longitude
  );
  const dEnd = haversineDistance(
    point.latitude,
    point.longitude,
    endInt.latitude,
    endInt.longitude
  );
  return dStart <= dEnd ? startInt : endInt;
}

// ---------------------------------------------------------------------------
// 6. Exploration-marking helpers  (used by the service)
// ---------------------------------------------------------------------------

function findNearbySegmentIds(point: StreetPoint, segments: StreetSegment[]): string[] {
  return segments
    .filter((seg) => closestPointOnSegment(point, seg.points).distance <= EXPLORED_THRESHOLD_METERS)
    .map((seg) => seg.id);
}

function findNearbyIntersectionIds(point: StreetPoint, intersections: Intersection[]): string[] {
  return intersections
    .filter(
      (i) =>
        haversineDistance(point.latitude, point.longitude, i.latitude, i.longitude) <=
        EXPLORED_THRESHOLD_METERS
    )
    .map((i) => i.id);
}

// ---------------------------------------------------------------------------
// 7. Sample street data  (3×3 grid fixture for dev / CI)
// ---------------------------------------------------------------------------

export function getSampleStreetData(): {
  segments: StreetSegment[];
  intersections: Intersection[];
} {
  // 3×3 grid centred on Eugene South Hills (44.0462, −123.0236)
  // Lat step 0.0018° ≈ 200 m   Lon step 0.0025° ≈ 200 m at lat 44
  const rows = [44.0444, 44.0462, 44.048]; // Maple / Cedar / Birch (S → N)
  const cols = [-123.0261, -123.0236, -123.0211]; // Oak / Elm / Pine   (W → E)
  const ewNames = ['Maple St', 'Cedar St', 'Birch St'];
  const nsNames = ['Oak Ave', 'Elm Ave', 'Pine Ave'];

  const idAt = (r: number, c: number): string => makeNodeKey(rows[r]!, cols[c]!);

  // Build intersections
  const intersections: Intersection[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      intersections.push({
        id: idAt(r, c),
        latitude: rows[r]!,
        longitude: cols[c]!,
        streetNames: [ewNames[r]!, nsNames[c]!],
        connectedSegmentIds: [],
      });
    }
  }

  const segments: StreetSegment[] = [];

  // E–W segments (each row has 2 segments connecting 3 intersections)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const seg = makeSampleSegment(
        `ew_${r}_${c}`,
        ewNames[r]!,
        rows[r]!,
        cols[c]!,
        rows[r]!,
        cols[c + 1]!,
        idAt(r, c),
        idAt(r, c + 1)
      );
      segments.push(seg);
      wires(intersections, seg);
    }
  }

  // N–S segments (each column has 2 segments connecting 3 intersections)
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 2; r++) {
      const seg = makeSampleSegment(
        `ns_${c}_${r}`,
        nsNames[c]!,
        rows[r]!,
        cols[c]!,
        rows[r + 1]!,
        cols[c]!,
        idAt(r, c),
        idAt(r + 1, c)
      );
      segments.push(seg);
      wires(intersections, seg);
    }
  }

  return { segments, intersections };
}

function makeSampleSegment(
  id: string,
  name: string,
  sLat: number,
  sLon: number,
  eLat: number,
  eLon: number,
  startNodeId: string,
  endNodeId: string
): StreetSegment {
  const points: StreetPoint[] = [
    { latitude: sLat, longitude: sLon },
    { latitude: eLat, longitude: eLon },
  ];
  return { id, name, points, startNodeId, endNodeId, lengthMeters: computeSegmentLength(points) };
}

function wires(intersections: Intersection[], seg: StreetSegment): void {
  const s = intersections.find((i) => i.id === seg.startNodeId);
  if (s) s.connectedSegmentIds.push(seg.id);
  const e = intersections.find((i) => i.id === seg.endNodeId);
  if (e) e.connectedSegmentIds.push(seg.id);
}

// ---------------------------------------------------------------------------
// 8. Singleton service class  (reads / writes Redux)
// ---------------------------------------------------------------------------

export class StreetDataService {
  private static instance: StreetDataService;

  static getInstance(): StreetDataService {
    if (!StreetDataService.instance) {
      StreetDataService.instance = new StreetDataService();
    }
    return StreetDataService.instance;
  }

  /** Fetch from Overpass, parse, and dispatch into Redux. */
  async fetchAndStore(center: StreetPoint, radiusMiles: number): Promise<void> {
    store.dispatch(setStreetLoading(true));
    try {
      const elements = await fetchFromOverpassAPI(center, radiusMiles * METERS_PER_MILE);
      const ways = parseWays(elements);
      const graph = buildStreetGraph(ways);
      store.dispatch(loadStreetData(graph));
      logger.info(`Fetched ${graph.segments.length} street segments from Overpass`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown fetch error';
      store.dispatch(setStreetError(msg));
      logger.error('Failed to fetch street data', err);
    }
  }

  /** Return closest streets, optionally filtered by exploration status. */
  get_closest_streets(
    options: {
      numResults?: number;
      comparisonPoint?: StreetPoint;
      filter?: ExplorationFilter;
    } = {}
  ): ClosestStreetResult[] {
    const state = store.getState();
    const { numResults = 1, filter } = options;
    const comparisonPoint = options.comparisonPoint ?? this.currentPoint();
    return findClosestStreets({
      segments: Object.values(state.street.segments),
      exploredIds: state.street.exploredSegmentIds,
      comparisonPoint,
      numResults,
      ...(filter !== undefined && { filter }),
    });
  }

  /** Return closest intersections, optionally filtered by exploration status. */
  get_closest_intersections(
    options: {
      numResults?: number;
      comparisonPoint?: StreetPoint;
      filter?: ExplorationFilter;
    } = {}
  ): ClosestIntersectionResult[] {
    const state = store.getState();
    const { numResults = 1, filter } = options;
    const comparisonPoint = options.comparisonPoint ?? this.currentPoint();
    return findClosestIntersections({
      intersections: Object.values(state.street.intersections),
      exploredIds: state.street.exploredIntersectionIds,
      comparisonPoint,
      numResults,
      ...(filter !== undefined && { filter }),
    });
  }

  /** Find the shortest always-turn-right loop from current location. */
  get_shortest_loop(options: { maxDistanceMiles?: number } = {}): LoopResult {
    const state = store.getState();
    const { maxDistanceMiles = 3 } = options;
    return findShortestLoop({
      segments: state.street.segments,
      intersections: state.street.intersections,
      startPoint: this.currentPoint(),
      maxDistanceMiles,
    });
  }

  /** Scan every point in a path and batch-mark nearby segments / intersections explored. */
  markPathAsExplored(path: StreetPoint[]): void {
    const state = store.getState();
    const segments = Object.values(state.street.segments);
    const intersections = Object.values(state.street.intersections);

    const segIds = new Set<string>();
    const intIds = new Set<string>();
    for (const pt of path) {
      for (const id of findNearbySegmentIds(pt, segments)) segIds.add(id);
      for (const id of findNearbyIntersectionIds(pt, intersections)) intIds.add(id);
    }

    if (segIds.size > 0) store.dispatch(markSegmentsExplored([...segIds]));
    if (intIds.size > 0) store.dispatch(markIntersectionsExplored([...intIds]));
  }

  /** Fallback comparison point – current GPS or Eugene centre. */
  private currentPoint(): StreetPoint {
    const loc = store.getState().exploration.currentLocation;
    return loc ?? { latitude: 44.0462, longitude: -123.0236 };
  }
}
