import type { Region } from 'react-native-maps';

/**
 * Utility functions for converting between map zoom levels and distance scale legends
 */

// Scale configurations matching MapDistanceScale component
const SCALE_CONFIGS = [
  { threshold: 1, meters: 0.5, label: '0.5m' },
  { threshold: 2, meters: 1, label: '1m' },
  { threshold: 5, meters: 2, label: '2m' },
  { threshold: 10, meters: 5, label: '5m' },
  { threshold: 20, meters: 10, label: '10m' },
  { threshold: 50, meters: 20, label: '20m' },
  { threshold: 100, meters: 50, label: '50m' },
  { threshold: 200, meters: 100, label: '100m' },
  { threshold: 500, meters: 200, label: '200m' },
  { threshold: 1000, meters: 500, label: '500m' },
  { threshold: 2000, meters: 1000, label: '1km' },
  { threshold: 5000, meters: 2000, label: '2km' },
  { threshold: 10000, meters: 5000, label: '5km' },
  { threshold: 20000, meters: 10000, label: '10km' },
  { threshold: 50000, meters: 20000, label: '20km' },
  { threshold: Infinity, meters: 50000, label: '50km' },
];

/**
 * Convert a legend scale (like "2km" or "50m") to approximate latitude delta
 * This helps translate visual scale requirements to map zoom levels
 */
export const legendToLatitudeDelta = (legendValue: string, mapWidth: number = 400): number => {
  // Parse the legend value to get meters
  const meters = legendValueToMeters(legendValue);

  // Calculate latitude delta that would produce this scale
  // Working backwards from the scale calculation in MapDistanceScale
  const targetPixelWidth = 120; // Standard scale bar width
  const metersPerPixel = meters / targetPixelWidth;

  // Approximate conversion: 1 degree latitude ≈ 111,320 meters
  const metersPerDegree = 111320;
  const totalMapWidthInMeters = metersPerPixel * mapWidth;
  return totalMapWidthInMeters / metersPerDegree;
};

/**
 * Convert latitude delta to expected legend scale value
 * Useful for understanding what scale will be shown at a given zoom level
 */
export const latitudeDeltaToLegend = (
  latitudeDelta: number,
  mapWidth: number = 400,
  latitude: number = 37.7749
): number => {
  // Calculate meters per pixel at this zoom level
  const metersPerDegree = 111320;
  const mapWidthInDegrees = latitudeDelta;
  const totalMapWidthInMeters =
    mapWidthInDegrees * metersPerDegree * Math.cos((latitude * Math.PI) / 180);
  const metersPerPixel = totalMapWidthInMeters / mapWidth;

  // Target scale bar width
  const targetPixelWidth = 120;
  const targetMeters = metersPerPixel * targetPixelWidth;

  // Find the scale that would be displayed
  const config =
    SCALE_CONFIGS.find((c) => targetMeters < c.threshold) ??
    SCALE_CONFIGS[SCALE_CONFIGS.length - 1];
  return config?.meters ?? 50; // Fallback to 50m if config is undefined
};

/**
 * Convert legend string (like "2km", "50m") to meters
 */
export const legendValueToMeters = (legendValue: string): number => {
  const config = SCALE_CONFIGS.find((c) => c.label === legendValue);
  if (config) {
    return config.meters;
  }

  // Fallback parsing
  const numMatch = legendValue.match(/[\d.]+/);
  const unitMatch = legendValue.match(/(km|m)$/);

  if (numMatch && unitMatch) {
    const num = parseFloat(numMatch[0]);
    const unit = unitMatch[1];
    return unit === 'km' ? num * 1000 : num;
  }

  return 50; // Default fallback
};

/**
 * Create a Gaussian easing function for smooth zoom animation
 * Returns a value between 0 and 1 with Gaussian acceleration curve
 */
export const gaussianEasing = (t: number, intensity: number = 2): number => {
  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t));

  // Use a simpler S-curve that starts at 0 and ends at 1
  // This creates the "slow start, fast middle, slow end" effect
  const smoothstep = t * t * (3 - 2 * t); // Basic smoothstep

  // Apply intensity to make the middle section more pronounced
  const centered = smoothstep - 0.5; // Center around 0
  const intensified = Math.tanh(centered * intensity); // Apply intensity

  // Convert back to [0, 1] range
  return (intensified + Math.tanh(intensity * 0.5)) / (2 * Math.tanh(intensity * 0.5));
};

/**
 * Calculate zoom parameters for cinematic animation
 * From startLegend (e.g., "2km") to endLegend (e.g., "50m")
 */
export const calculateZoomAnimation = (
  startLegend: string,
  endLegend: string,
  centerLocation: { latitude: number; longitude: number },
  mapWidth: number = 400
) => {
  const startLatDelta = legendToLatitudeDelta(startLegend, mapWidth);
  const endLatDelta = legendToLatitudeDelta(endLegend, mapWidth);

  // Calculate corresponding longitude delta (approximate ratio)
  const aspectRatio = 0.457; // Typical map aspect ratio (lng/lat delta ratio)
  const startLngDelta = startLatDelta * aspectRatio;
  const endLngDelta = endLatDelta * aspectRatio;

  const startRegion: Region = {
    latitude: centerLocation.latitude,
    longitude: centerLocation.longitude,
    latitudeDelta: startLatDelta,
    longitudeDelta: startLngDelta,
  };

  const endRegion: Region = {
    latitude: centerLocation.latitude,
    longitude: centerLocation.longitude,
    latitudeDelta: endLatDelta,
    longitudeDelta: endLngDelta,
  };

  return {
    startRegion,
    endRegion,
    startScale: legendValueToMeters(startLegend),
    endScale: legendValueToMeters(endLegend),
  };
};
