/**
 * Types for street-level data integration.
 * Streets are sourced from OpenStreetMap via the Overpass API
 * and cached locally for offline / dev use.
 */

// ---------------------------------------------------------------------------
// OpenStreetMap / Overpass Types
// ---------------------------------------------------------------------------

/**
 * OSM highway classifications from the Overpass API.
 * These map to the OSM `highway` tag values we query for.
 * @see https://wiki.openstreetmap.org/wiki/Key:highway
 */
export enum StreetType {
  /** Major divided highway (limited access) */
  MOTORWAY = 'motorway',
  /** Major highway links / ramps */
  MOTORWAY_LINK = 'motorway_link',
  /** Major arterial roads */
  PRIMARY = 'primary',
  /** Collector roads */
  SECONDARY = 'secondary',
  /** Minor through roads */
  TERTIARY = 'tertiary',
  /** Residential streets */
  RESIDENTIAL = 'residential',
  /** Minor public roads with no specific classification */
  UNCLASSIFIED = 'unclassified',
  /** Access roads (driveways, parking lots, alleys) */
  SERVICE = 'service',
  /** Low-speed residential areas (shared space) */
  LIVING_STREET = 'living_street',
  /** Pedestrian-only ways */
  PEDESTRIAN = 'pedestrian',
  /** Designated foot paths */
  FOOTWAY = 'footway',
  /** Designated cycle paths */
  CYCLEWAY = 'cycleway',
  /** Unpaved rural roads */
  TRACK = 'track',
  /** Generic path (walking, cycling) */
  PATH = 'path',
}

/**
 * Base OSM element returned from Overpass API.
 * All elements (nodes, ways, relations) share these fields.
 */
export interface OSMElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
}

/** OSM node element — a single point */
export interface OSMNodeElement extends OSMElement {
  type: 'node';
  lat: number;
  lon: number;
}

/** OSM way element — an ordered list of node references with inline geometry */
export interface OSMWayElement extends OSMElement {
  type: 'way';
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
}

/** OSM way element with guaranteed geometry (for type guards after filtering) */
export interface OSMWayElementWithGeometry extends OSMWayElement {
  geometry: { lat: number; lon: number }[];
}

/** Full Overpass API JSON response envelope */
export interface OSMResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OSMElement[];
}

// ---------------------------------------------------------------------------
// Street Domain Types
// ---------------------------------------------------------------------------

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
  /** OSM highway classification (optional — populated from Overpass data) */
  streetType?: StreetType;
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
