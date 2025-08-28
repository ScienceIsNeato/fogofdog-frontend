/**
 * Map Display Constants
 *
 * Constants for map visualization elements like distance scales,
 * coordinate calculations, and display parameters.
 */

export const MAP_DISPLAY_CONFIG = {
  // Distance scale configuration
  METERS_PER_DEGREE_LATITUDE: 111320, // Approximate meters per degree of latitude (derived from Earth's circumference)
  TARGET_SCALE_PIXEL_WIDTH: 120, // Target pixel width for distance scale bar
  FALLBACK_SCALE_PIXEL_WIDTH: 100, // Fallback pixel width when no config found
  FALLBACK_SCALE_LABEL: '100m', // Fallback label when no config found
} as const;

/**
 * Earth's circumference constants for geographic calculations
 */
export const EARTH_CONSTANTS = {
  // Earth's circumference at equator: ~40,075 km
  // Degrees in circle: 360°
  // Therefore: 40,075,000m ÷ 360° ≈ 111,320 meters per degree
  CIRCUMFERENCE_METERS: 40075000,
  DEGREES_IN_CIRCLE: 360,
  METERS_PER_DEGREE: 40075000 / 360, // 111,319.44... ≈ 111,320
} as const;
