/**
 * StreetDataService – pure geometry helpers, query functions, loop algorithm,
 * street-walk generator, and exploration-marking utilities.
 *
 * Every export is a plain function.  Nothing in this module reads or writes
 * Redux state; callers are responsible for dispatching.
 */

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
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

/** Round lat/lon to 5 decimal places and join with underscore — used as node ID. */
export function makeNodeKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)}_${lon.toFixed(5)}`;
}

// ---------------------------------------------------------------------------
// 2. Core query functions  (pure – accept data, return results)
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
// 3. Loop algorithm helpers
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
// 4. Street-walk helpers  (used by test-data generators)
// ---------------------------------------------------------------------------

/** Choose the intersection end of `seg` that is closer to `point`. */
function nearerEndId(point: StreetPoint, seg: StreetSegment): string {
  const first = seg.points[0];
  const last = seg.points[seg.points.length - 1];
  if (!first) return seg.startNodeId;
  if (!last) return seg.endNodeId;
  const dStart = haversineDistance(
    point.latitude,
    point.longitude,
    first.latitude,
    first.longitude
  );
  const dEnd = haversineDistance(point.latitude, point.longitude, last.latitude, last.longitude);
  return dStart <= dEnd ? seg.startNodeId : seg.endNodeId;
}

/** Pick a random exit segment at `intersection`, optionally preferring unexplored. */
function pickNextSegment(params: {
  intersection: Intersection;
  excludeId: string;
  preferUnexplored: boolean;
  exploredIds: string[];
}): string | null {
  const { intersection, excludeId, preferUnexplored, exploredIds } = params;
  const candidates = intersection.connectedSegmentIds.filter((id) => id !== excludeId);
  if (candidates.length === 0) return null;

  if (preferUnexplored) {
    const unexplored = candidates.filter((id) => !exploredIds.includes(id));
    if (unexplored.length > 0)
      return unexplored[Math.floor(Math.random() * unexplored.length)] ?? null;
  }
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

/** Interpolate `maxPts` evenly-spaced points from `from` toward `to`. */
function stepsToward(
  from: StreetPoint,
  to: StreetPoint,
  stepMeters: number,
  maxPts: number
): StreetPoint[] {
  const totalDist = haversineDistance(from.latitude, from.longitude, to.latitude, to.longitude);
  const n = Math.min(maxPts, Math.max(1, Math.round(totalDist / stepMeters)));
  const result: StreetPoint[] = [];
  for (let i = 1; i <= n; i++) {
    const t = Math.min((i * stepMeters) / totalDist, 1);
    result.push({
      latitude: from.latitude + t * (to.latitude - from.latitude),
      longitude: from.longitude + t * (to.longitude - from.longitude),
    });
  }
  return result;
}

/**
 * Core street-walk loop – returns raw StreetPoint path.
 *
 * Algorithm:
 *  1. Snap `start` to the nearest segment.
 *  2. Walk toward the nearer intersection on that segment.
 *  3. At each intersection choose a random (or prefer-unexplored) exit.
 *  4. Repeat until `count` points have been emitted.
 */
export function walkStreets(params: {
  start: StreetPoint;
  segMap: Record<string, StreetSegment>;
  intMap: Record<string, Intersection>;
  count: number;
  preferUnexplored: boolean;
  exploredSegmentIds: string[];
}): StreetPoint[] {
  const { start, segMap, intMap, count, preferUnexplored, exploredSegmentIds } = params;
  const STEP_M = 15; // ~15 m between generated points
  const points: StreetPoint[] = [start];

  // Find nearest segment
  let bestSeg: StreetSegment | null = null;
  let bestDist = Infinity;
  for (const seg of Object.values(segMap)) {
    const { distance } = closestPointOnSegment(start, seg.points);
    if (distance < bestDist) {
      bestDist = distance;
      bestSeg = seg;
    }
  }
  if (!bestSeg) return points;

  let currentSegId = bestSeg.id;
  let targetIntId = nearerEndId(start, bestSeg);

  while (points.length < count) {
    const targetInt = intMap[targetIntId];
    if (!targetInt) break;

    // Generate steps toward this intersection
    const last = points[points.length - 1]!;
    const steps = stepsToward(last, targetInt, STEP_M, count - points.length);
    points.push(...steps);

    // Choose next segment
    const nextSegId = pickNextSegment({
      intersection: targetInt,
      excludeId: currentSegId,
      preferUnexplored,
      exploredIds: exploredSegmentIds,
    });
    if (!nextSegId) break; // dead end

    currentSegId = nextSegId;
    const nextSeg = segMap[nextSegId];
    if (nextSeg) {
      targetIntId = nextSeg.startNodeId === targetInt.id ? nextSeg.endNodeId : nextSeg.startNodeId;
    }
  }
  return points;
}

// ---------------------------------------------------------------------------
// 5. Exploration-marking helpers
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

/**
 * Scan every point in a path and return the IDs of nearby segments and
 * intersections.  The caller is responsible for dispatching the result.
 */
export function computeExploredIds(
  path: StreetPoint[],
  segments: StreetSegment[],
  intersections: Intersection[]
): { segmentIds: string[]; intersectionIds: string[] } {
  const segIds = new Set<string>();
  const intIds = new Set<string>();
  for (const pt of path) {
    for (const id of findNearbySegmentIds(pt, segments)) segIds.add(id);
    for (const id of findNearbyIntersectionIds(pt, intersections)) intIds.add(id);
  }
  return { segmentIds: [...segIds], intersectionIds: [...intIds] };
}

// ---------------------------------------------------------------------------
// 6. Sample street data  (3×3 grid fixture for dev / CI)
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
