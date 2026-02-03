import { GeoPoint } from './user';

/**
 * Road classification based on OSM highway types
 */
export enum StreetType {
  Residential = 'residential',
  Primary = 'primary',
  Secondary = 'secondary',
  Tertiary = 'tertiary',
  Path = 'path',
  Track = 'track',
}

/**
 * Core street segment representation from OpenStreetMap
 */
export interface StreetSegment {
  id: string; // OSM way ID
  name: string; // Street name (e.g., "Main St")
  type: StreetType; // Road classification
  coordinates: GeoPoint[]; // Array of points forming the segment
  isExplored: boolean; // Whether user has traveled this segment
  exploredAt?: number; // Timestamp when first explored (Unix ms)
}

/**
 * Street intersection (where 2+ streets meet)
 */
export interface StreetIntersection {
  id: string; // Unique identifier (OSM node ID)
  location: GeoPoint; // Intersection center point
  streetNames: string[]; // Names of intersecting streets (2+)
  streetIds: string[]; // IDs of intersecting street segments
  isExplored: boolean; // Whether user has visited
  exploredAt?: number; // Timestamp when first explored (Unix ms)
}

/**
 * Result from getClosestStreets method
 */
export interface ClosestStreetResult {
  street: StreetSegment;
  distance: number; // Distance in meters
  direction: string; // Cardinal direction (N, NE, E, SE, S, SW, W, NW)
  bearing: number; // Bearing in degrees (0-359)
}

/**
 * Result from getClosestIntersections method
 */
export interface ClosestIntersectionResult {
  intersection: StreetIntersection;
  distance: number; // Distance in meters
  direction: string; // Cardinal direction
  bearing: number; // Bearing in degrees (0-359)
}

/**
 * Turn instruction for navigation
 */
export interface TurnInstruction {
  location: GeoPoint;
  instruction: string; // "Turn left on Main St"
  direction: 'left' | 'right' | 'straight';
  streetName: string;
}

/**
 * Loop path result from getShortestLoop method
 */
export interface LoopPath {
  segments: StreetSegment[]; // Ordered street segments forming the loop
  totalDistance: number; // Total distance in meters
  estimatedTime: number; // Estimated time in minutes (at walking speed)
  turns: TurnInstruction[]; // Turn-by-turn directions
  isPossible: boolean; // Whether loop is feasible
  reason?: string; // If not possible, explanation why
}

/**
 * Bounding box for geographic queries
 */
export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Filter options for street/intersection queries
 */
export type ExplorationFilter = 'explored' | 'unexplored' | 'all';

/**
 * Options for getClosestStreets method
 */
export interface GetClosestStreetsOptions {
  numResults?: number; // Default: 1
  comparisonPoint?: GeoPoint; // Default: current location
  filter?: ExplorationFilter; // Default: 'all'
}

/**
 * Options for getClosestIntersections method
 */
export interface GetClosestIntersectionsOptions {
  numResults?: number; // Default: 1
  comparisonPoint?: GeoPoint; // Default: current location
  filter?: ExplorationFilter; // Default: 'all'
}

/**
 * Options for getShortestLoop method
 */
export interface GetShortestLoopOptions {
  maxDistanceMiles?: number; // Default: 3
  direction?: 'left' | 'right'; // Default: 'right'
  startLocation?: GeoPoint; // Default: current location
}

/**
 * OSM Overpass API response element
 */
export interface OSMElement {
  type: 'way' | 'node';
  id: number;
  tags?: {
    name?: string;
    highway?: string;
    [key: string]: string | undefined;
  };
  geometry?: { lat: number; lon: number }[];
  lat?: number;
  lon?: number;
}

/**
 * OSM Overpass API response
 */
export interface OSMResponse {
  version: number;
  generator: string;
  elements: OSMElement[];
}
