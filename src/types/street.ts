/**
 * Types for street-level data integration.
 * Streets are sourced from OpenStreetMap via the Overpass API
 * and cached locally for offline / dev use.
 */

/** A geographic coordinate on a street */
export interface StreetPoint {
  latitude: number;
  longitude: number;
}

/** A street segment between two intersections or dead ends */
export interface StreetSegment {
  /** Unique identifier (OSM way ID or synthetic) */
  id: string;
  /** Human-readable street name */
  name: string;
  /** Ordered geometry points forming the polyline */
  points: StreetPoint[];
  /** ID of the intersection / endpoint at the start of `points` */
  startNodeId: string;
  /** ID of the intersection / endpoint at the end of `points` */
  endNodeId: string;
  /** Length of the segment in metres */
  lengthMeters: number;
}

/** A point where two or more street segments meet */
export interface Intersection {
  /** Unique identifier (coordinate-derived key) */
  id: string;
  latitude: number;
  longitude: number;
  /** Names of streets that meet here */
  streetNames: string[];
  /** IDs of segments incident on this intersection */
  connectedSegmentIds: string[];
}

/** Envelope for a fetched / cached street-data set */
export interface StreetDataCache {
  center: StreetPoint;
  radiusMiles: number;
  segments: StreetSegment[];
  intersections: Intersection[];
  fetchedAt: number;
}

/** Limits query results to one exploration state */
export type ExplorationFilter = 'explored' | 'unexplored';

/** Single entry returned by `get_closest_streets` */
export interface ClosestStreetResult {
  segmentId: string;
  streetName: string;
  /** Distance in metres from comparison point to the nearest point on the segment */
  distance: number;
  /** The nearest point on the segment */
  closestPoint: StreetPoint;
  /** Cardinal direction (N, NE, E, …) from comparison point to `closestPoint` */
  direction: string;
  isExplored: boolean;
}

/** Single entry returned by `get_closest_intersections` */
export interface ClosestIntersectionResult {
  intersectionId: string;
  /** Names of streets meeting at this intersection */
  streetNames: string[];
  /** GPS coordinates of the intersection */
  coordinates: StreetPoint;
  /** Distance in metres from comparison point */
  distance: number;
  /** Cardinal direction from comparison point */
  direction: string;
  isExplored: boolean;
}

/** One step in a loop route */
export interface LoopWaypoint {
  intersectionId: string;
  segmentId: string;
  /** Cardinal direction of travel along this segment */
  direction: string;
  /** Cumulative metres from loop start */
  distanceFromStart: number;
}

/** Return value of `get_shortest_loop` */
export interface LoopResult {
  /** Whether a valid closed loop was found */
  success: boolean;
  /** Ordered waypoints forming the route */
  waypoints: LoopWaypoint[];
  /** Total loop distance in miles */
  totalDistanceMiles: number;
  /** Present only when `success` is false */
  error?: 'dead_end' | 'max_distance_exceeded';
}
