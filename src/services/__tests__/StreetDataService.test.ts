import {
  haversineDistance,
  bearingBetween,
  cardinalDirection,
  closestPointOnSegment,
  computeSegmentLength,
  findClosestStreets,
  findClosestIntersections,
  findShortestLoop,
  getSampleStreetData,
  computeExploredIds,
} from '../StreetDataService';
import type { StreetPoint } from '../../types/street';

// ===========================================================================
// 1. haversineDistance
// ===========================================================================
describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(44.0462, -123.0236, 44.0462, -123.0236)).toBe(0);
  });

  it('returns positive distance for distinct points', () => {
    // 0.0018° lat at lat 44 ≈ 200 m
    const d = haversineDistance(44.0444, -123.0236, 44.0462, -123.0236);
    expect(d).toBeGreaterThan(150);
    expect(d).toBeLessThan(250);
  });

  it('is symmetric', () => {
    const d1 = haversineDistance(40.0, -74.0, 41.0, -74.0);
    const d2 = haversineDistance(41.0, -74.0, 40.0, -74.0);
    expect(d1).toBeCloseTo(d2, 1);
  });

  it('returns ~111 km for 1 degree of latitude at the equator', () => {
    const d = haversineDistance(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

// ===========================================================================
// 2. bearingBetween
// ===========================================================================
describe('bearingBetween', () => {
  const origin: StreetPoint = { latitude: 44.0, longitude: -123.0 };

  it('returns ~0 for due north', () => {
    expect(bearingBetween(origin, { latitude: 44.1, longitude: -123.0 })).toBeCloseTo(0, 0);
  });

  it('returns ~90 for due east', () => {
    expect(bearingBetween(origin, { latitude: 44.0, longitude: -122.9 })).toBeCloseTo(90, 0);
  });

  it('returns ~180 for due south', () => {
    expect(bearingBetween(origin, { latitude: 43.9, longitude: -123.0 })).toBeCloseTo(180, 0);
  });

  it('returns ~270 for due west', () => {
    expect(bearingBetween(origin, { latitude: 44.0, longitude: -123.1 })).toBeCloseTo(270, 0);
  });
});

// ===========================================================================
// 3. cardinalDirection
// ===========================================================================
describe('cardinalDirection', () => {
  it('maps due-north to N', () => {
    expect(cardinalDirection(44.0, -123.0, 44.1, -123.0)).toBe('N');
  });

  it('maps due-east to E', () => {
    expect(cardinalDirection(44.0, -123.0, 44.0, -122.9)).toBe('E');
  });

  it('maps due-south to S', () => {
    expect(cardinalDirection(44.0, -123.0, 43.9, -123.0)).toBe('S');
  });

  it('maps due-west to W', () => {
    expect(cardinalDirection(44.0, -123.0, 44.0, -123.1)).toBe('W');
  });

  it('maps NE diagonal correctly', () => {
    expect(cardinalDirection(44.0, -123.0, 44.1, -122.9)).toBe('NE');
  });
});

// ===========================================================================
// 4. closestPointOnSegment
// ===========================================================================
describe('closestPointOnSegment', () => {
  it('returns Infinity for an empty polyline', () => {
    const { distance } = closestPointOnSegment({ latitude: 0, longitude: 0 }, []);
    expect(distance).toBe(Infinity);
  });

  it('returns distance 0 when query point is a vertex', () => {
    const pts: StreetPoint[] = [
      { latitude: 44.0, longitude: -123.0 },
      { latitude: 44.1, longitude: -123.0 },
    ];
    expect(closestPointOnSegment(pts[0]!, pts).distance).toBe(0);
  });

  it('finds a projected point closer than either endpoint', () => {
    // N–S segment; query point east of midpoint
    const pts: StreetPoint[] = [
      { latitude: 44.0, longitude: -123.0 },
      { latitude: 44.1, longitude: -123.0 },
    ];
    const query: StreetPoint = { latitude: 44.05, longitude: -122.999 };
    const { distance } = closestPointOnSegment(query, pts);
    const distToStart = haversineDistance(44.05, -122.999, 44.0, -123.0);
    expect(distance).toBeLessThan(distToStart);
  });

  it('handles a single-point polyline', () => {
    const pts: StreetPoint[] = [{ latitude: 44.0, longitude: -123.0 }];
    const { closest, distance } = closestPointOnSegment(
      { latitude: 44.001, longitude: -123.0 },
      pts
    );
    expect(closest).toEqual(pts[0]);
    expect(distance).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 5. computeSegmentLength
// ===========================================================================
describe('computeSegmentLength', () => {
  it('returns 0 for empty array', () => {
    expect(computeSegmentLength([])).toBe(0);
  });

  it('returns 0 for single point', () => {
    expect(computeSegmentLength([{ latitude: 44.0, longitude: -123.0 }])).toBe(0);
  });

  it('returns positive length for two-point segment', () => {
    const len = computeSegmentLength([
      { latitude: 44.0444, longitude: -123.0236 },
      { latitude: 44.0462, longitude: -123.0236 },
    ]);
    expect(len).toBeGreaterThan(150);
    expect(len).toBeLessThan(250);
  });

  it('sums edge lengths for a 3-point polyline', () => {
    const pts: StreetPoint[] = [
      { latitude: 44.0, longitude: -123.0 },
      { latitude: 44.001, longitude: -123.0 },
      { latitude: 44.002, longitude: -123.0 },
    ];
    const total = computeSegmentLength(pts);
    const edge1 = haversineDistance(44.0, -123.0, 44.001, -123.0);
    const edge2 = haversineDistance(44.001, -123.0, 44.002, -123.0);
    expect(total).toBeCloseTo(edge1 + edge2, 0);
  });
});

// ===========================================================================
// 6. getSampleStreetData – structural invariants
// ===========================================================================
describe('getSampleStreetData', () => {
  it('returns 9 intersections and 12 segments', () => {
    const { segments, intersections } = getSampleStreetData();
    expect(intersections).toHaveLength(9);
    expect(segments).toHaveLength(12);
  });

  it('has 6 E-W and 6 N-S segments', () => {
    const { segments } = getSampleStreetData();
    expect(segments.filter((s) => s.id.startsWith('ew_'))).toHaveLength(6);
    expect(segments.filter((s) => s.id.startsWith('ns_'))).toHaveLength(6);
  });

  it('every segment has positive lengthMeters', () => {
    getSampleStreetData().segments.forEach((seg) => {
      expect(seg.lengthMeters).toBeGreaterThan(0);
    });
  });

  it('every intersection has ≥ 2 connected segments', () => {
    getSampleStreetData().intersections.forEach((i) => {
      expect(i.connectedSegmentIds.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('has exactly 4 corner intersections (degree 2)', () => {
    const corners = getSampleStreetData().intersections.filter(
      (i) => i.connectedSegmentIds.length === 2
    );
    expect(corners).toHaveLength(4);
  });

  it('has exactly 1 centre intersection (degree 4)', () => {
    const centres = getSampleStreetData().intersections.filter(
      (i) => i.connectedSegmentIds.length === 4
    );
    expect(centres).toHaveLength(1);
    expect(centres[0]?.latitude).toBeCloseTo(44.0462, 4);
  });

  it('all segment node IDs reference existing intersections', () => {
    const { segments, intersections } = getSampleStreetData();
    const ids = new Set(intersections.map((i) => i.id));
    segments.forEach((seg) => {
      expect(ids.has(seg.startNodeId)).toBe(true);
      expect(ids.has(seg.endNodeId)).toBe(true);
    });
  });

  it('connected-segment IDs on each intersection reference real segments', () => {
    const { segments, intersections } = getSampleStreetData();
    const segIds = new Set(segments.map((s) => s.id));
    intersections.forEach((i) => {
      i.connectedSegmentIds.forEach((sid) => {
        expect(segIds.has(sid)).toBe(true);
      });
    });
  });
});

// ===========================================================================
// 7. findClosestStreets
// ===========================================================================
describe('findClosestStreets', () => {
  const { segments, intersections: _ints } = getSampleStreetData();
  const exploredIds = ['ew_0_0', 'ns_0_0'];
  const centre: StreetPoint = { latitude: 44.0462, longitude: -123.0236 };

  it('returns the requested number of results', () => {
    const results = findClosestStreets({
      segments,
      exploredIds,
      comparisonPoint: centre,
      numResults: 3,
    });
    expect(results).toHaveLength(3);
  });

  it('results are sorted by distance ascending', () => {
    const results = findClosestStreets({
      segments,
      exploredIds,
      comparisonPoint: centre,
      numResults: 5,
    });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]?.distance).toBeGreaterThanOrEqual(results[i - 1]?.distance ?? 0);
    }
  });

  it('filter=explored returns only explored streets', () => {
    const results = findClosestStreets({
      segments,
      exploredIds,
      comparisonPoint: centre,
      numResults: 12,
      filter: 'explored',
    });
    expect(results.length).toBeLessThanOrEqual(exploredIds.length);
    results.forEach((r) => expect(r.isExplored).toBe(true));
  });

  it('filter=unexplored excludes explored streets', () => {
    const results = findClosestStreets({
      segments,
      exploredIds,
      comparisonPoint: centre,
      numResults: 12,
      filter: 'unexplored',
    });
    expect(results.length).toBe(segments.length - exploredIds.length);
    results.forEach((r) => expect(r.isExplored).toBe(false));
  });

  it('returns an empty array when segments is empty', () => {
    expect(
      findClosestStreets({ segments: [], exploredIds: [], comparisonPoint: centre, numResults: 3 })
    ).toHaveLength(0);
  });

  it('each result includes a valid cardinal direction', () => {
    const validDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const results = findClosestStreets({
      segments,
      exploredIds,
      comparisonPoint: centre,
      numResults: 4,
    });
    results.forEach((r) => expect(validDirs).toContain(r.direction));
  });
});

// ===========================================================================
// 8. findClosestIntersections
// ===========================================================================
describe('findClosestIntersections', () => {
  const { intersections } = getSampleStreetData();
  const centre: StreetPoint = { latitude: 44.0462, longitude: -123.0236 };
  const exploredIds = ['44.04620_-123.02360']; // centre intersection ID

  it('returns the requested number of results', () => {
    const results = findClosestIntersections({
      intersections,
      exploredIds,
      comparisonPoint: centre,
      numResults: 3,
    });
    expect(results).toHaveLength(3);
  });

  it('places the centre intersection first (distance 0)', () => {
    const results = findClosestIntersections({
      intersections,
      exploredIds,
      comparisonPoint: centre,
      numResults: 1,
    });
    expect(results[0]?.distance).toBe(0);
  });

  it('filter=explored returns only the explored intersection', () => {
    const results = findClosestIntersections({
      intersections,
      exploredIds,
      comparisonPoint: centre,
      numResults: 9,
      filter: 'explored',
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.isExplored).toBe(true);
  });

  it('filter=unexplored returns the other 8', () => {
    const results = findClosestIntersections({
      intersections,
      exploredIds,
      comparisonPoint: centre,
      numResults: 9,
      filter: 'unexplored',
    });
    expect(results).toHaveLength(8);
    results.forEach((r) => expect(r.isExplored).toBe(false));
  });

  it('each result includes streetNames and coordinates', () => {
    const results = findClosestIntersections({
      intersections,
      exploredIds,
      comparisonPoint: centre,
      numResults: 2,
    });
    results.forEach((r) => {
      expect(r.streetNames.length).toBeGreaterThan(0);
      expect(r.coordinates.latitude).toBeDefined();
      expect(r.coordinates.longitude).toBeDefined();
    });
  });
});

// ===========================================================================
// 9. findShortestLoop
// ===========================================================================
describe('findShortestLoop', () => {
  const { segments: segArr, intersections: intArr } = getSampleStreetData();
  const segments = Object.fromEntries(segArr.map((s) => [s.id, s]));
  const intersections = Object.fromEntries(intArr.map((i) => [i.id, i]));
  const centre: StreetPoint = { latitude: 44.0462, longitude: -123.0236 };

  it('finds a valid closed loop on the sample 3×3 grid', () => {
    const result = findShortestLoop({
      segments,
      intersections,
      startPoint: centre,
      maxDistanceMiles: 3,
    });
    expect(result.success).toBe(true);
    expect(result.waypoints.length).toBeGreaterThanOrEqual(3);
    expect(result.totalDistanceMiles).toBeGreaterThan(0);
  });

  it('returns dead_end when no segments exist', () => {
    const result = findShortestLoop({
      segments: {},
      intersections: {},
      startPoint: centre,
      maxDistanceMiles: 3,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('dead_end');
    expect(result.waypoints).toHaveLength(0);
  });

  it('respects maxDistanceMiles — fails when limit is tiny', () => {
    // 0.001 miles ≈ 1.6 m — no segment can fit
    const result = findShortestLoop({
      segments,
      intersections,
      startPoint: centre,
      maxDistanceMiles: 0.001,
    });
    expect(result.success).toBe(false);
  });

  it('waypoints reference valid segment and intersection IDs', () => {
    const result = findShortestLoop({
      segments,
      intersections,
      startPoint: centre,
      maxDistanceMiles: 3,
    });
    if (result.success) {
      result.waypoints.forEach((wp) => {
        expect(intersections[wp.intersectionId]).toBeDefined();
        expect(segments[wp.segmentId]).toBeDefined();
      });
    }
  });

  it('waypoint distances are monotonically increasing', () => {
    const result = findShortestLoop({
      segments,
      intersections,
      startPoint: centre,
      maxDistanceMiles: 3,
    });
    if (result.success) {
      for (let i = 1; i < result.waypoints.length; i++) {
        expect(result.waypoints[i]?.distanceFromStart).toBeGreaterThan(
          result.waypoints[i - 1]?.distanceFromStart ?? 0
        );
      }
    }
  });

  it('the last waypoint loops back to the starting intersection', () => {
    const result = findShortestLoop({
      segments,
      intersections,
      startPoint: centre,
      maxDistanceMiles: 3,
    });
    if (result.success) {
      // The loop closes at the start intersection; find it by checking the nearest intersection to centre
      const startIntId = intArr.find(
        (i) => haversineDistance(centre.latitude, centre.longitude, i.latitude, i.longitude) === 0
      )?.id;
      const lastWp = result.waypoints[result.waypoints.length - 1];
      expect(lastWp?.intersectionId).toBe(startIntId);
    }
  });
});

// ===========================================================================
// 10. computeExploredIds
// ===========================================================================
describe('computeExploredIds', () => {
  const { segments, intersections } = getSampleStreetData();

  it('returns IDs for segments and intersections near the path', () => {
    // Centre intersection — should be within 30 m of the segments meeting there
    const path = [{ latitude: 44.0462, longitude: -123.0236 }];
    const { segmentIds, intersectionIds } = computeExploredIds(path, segments, intersections);
    expect(segmentIds.length).toBeGreaterThan(0);
    expect(intersectionIds.length).toBeGreaterThan(0);
  });

  it('returns empty arrays when the path is far from all streets', () => {
    // Point at lat 0 — thousands of km from Eugene
    const path = [{ latitude: 0, longitude: 0 }];
    const { segmentIds, intersectionIds } = computeExploredIds(path, segments, intersections);
    expect(segmentIds).toHaveLength(0);
    expect(intersectionIds).toHaveLength(0);
  });
});
