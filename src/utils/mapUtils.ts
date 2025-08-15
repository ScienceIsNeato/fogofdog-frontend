import { MapRegion } from '../types/navigation';
import { GeoPoint } from '../types/user';
import { logger } from './logger';

/**
 * Converts a geographic point (lat/lon) to pixel coordinates relative to the map view
 *
 * VERTICAL SLOP FIX: This function includes safe area compensation to prevent
 * coordinate drift during map panning. The issue occurred because MapView reports
 * the full screen dimensions, but the actual renderable area is smaller due to
 * safe area insets (status bar, home indicator, etc.).
 *
 * The solution dynamically calculates a vertical scaling factor based on the
 * ratio of effective viewport height to reported height, ensuring fog overlay
 * coordinates remain accurate across all device configurations.
 *
 * @param point - Geographic coordinate (latitude/longitude)
 * @param region - Current map region with dimensions
 * @param safeAreaInsets - Optional safe area insets for accurate scaling (recommended)
 * @returns {x, y} pixel coordinates where the point should be drawn with safe area compensation
 */
export function geoPointToPixel(
  point: GeoPoint,
  region: MapRegion & { width: number; height: number },
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number }
): { x: number; y: number } {
  const { latitude, longitude } = point;
  const {
    latitude: centerLat,
    longitude: centerLon,
    latitudeDelta,
    longitudeDelta,
    width,
    height,
  } = region;

  if (!region || !point) {
    logger.warn('geoPointToPixel received invalid parameters', {
      component: 'mapUtils',
      action: 'geoPointToPixel',
      region,
      point,
    });
    return { x: 0, y: 0 };
  }

  // Safety check for invalid inputs
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(centerLat) ||
    !Number.isFinite(centerLon) ||
    !Number.isFinite(latitudeDelta) ||
    !Number.isFinite(longitudeDelta) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    latitudeDelta === 0 ||
    longitudeDelta === 0
  ) {
    logger.warn('geoPointToPixel received invalid parameters:', {
      point,
      region,
    });
    // Return center of screen as fallback
    return { x: width / 2, y: height / 2 };
  }

  // Calculate how far the point is from the center, as a fraction of the total span
  // For latitude: negative means south of center, positive means north of center
  const latFraction = (centerLat - latitude) / latitudeDelta;
  // For longitude: negative means west of center, positive means east of center
  const lonFraction = (longitude - centerLon) / longitudeDelta;

  // Calculate viewport scaling factor to account for safe area insets
  // Problem: MapView reports full screen height, but actual renderable area is smaller
  // due to status bar, home indicator, etc. This causes "vertical slop" where fog
  // overlay coordinates drift during map panning.
  // Solution: Scale Y coordinates based on the ratio of effective vs full height
  let verticalScaleFactor = 1.0;
  if (safeAreaInsets) {
    // Calculate the actual renderable height by subtracting safe area insets
    const effectiveHeight = height - safeAreaInsets.top - safeAreaInsets.bottom;
    // Scale factor compensates for the difference between reported and actual height
    verticalScaleFactor = effectiveHeight / height;
  }

  // Convert these fractions to pixel coordinates
  // For y: positive latFraction (north) should decrease y (move up on screen)
  const y = height / 2 + latFraction * height * verticalScaleFactor;
  // For x: positive lonFraction (east) should increase x (move right on screen)
  const x = width / 2 + lonFraction * width;

  return { x, y };
}

/**
 * Calculates meters per pixel at a given latitude and zoom level
 *
 * @param region - Current map region with dimensions
 * @returns meters per pixel (horizontal)
 */
export function calculateMetersPerPixel(region: MapRegion & { width: number }): number {
  const { latitude, longitudeDelta, width } = region;

  if (!region) {
    logger.warn('calculateMetersPerPixel received invalid parameters', {
      component: 'mapUtils',
      action: 'calculateMetersPerPixel',
      region,
    });
    return 1;
  }

  // Safety check for invalid inputs
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitudeDelta) ||
    !Number.isFinite(width) ||
    width === 0
  ) {
    logger.warn('calculateMetersPerPixel received invalid parameters:', {
      region: {
        latitude: region.latitude,
        longitude: region.longitude,
        width: region.width,
      },
      component: 'mapUtils',
      action: 'calculateMetersPerPixel',
    });
    return 1; // Return a safe default
  }

  // At equator, 1 degree longitude is ~111,320 meters
  // At latitude φ, it's ~111,320 * cos(φ)
  const METERS_PER_DEGREE_LONGITUDE = 111320;
  const latitudeRadians = (latitude * Math.PI) / 180;

  // Ensure reasonable values even near the poles
  const cosLat = Math.max(0.01, Math.cos(latitudeRadians));

  return (longitudeDelta * METERS_PER_DEGREE_LONGITUDE * cosLat) / width;
}

/**
 * Calculates the pixel width that corresponds to a given real-world distance
 * at the current zoom level
 *
 * @param meters - Desired width in meters
 * @param region - Current map region with dimensions
 * @returns width in pixels that represents the specified real-world meters
 */
export function metersToPixels(meters: number, region: MapRegion & { width: number }): number {
  if (!Number.isFinite(meters) || meters <= 0) {
    logger.warn('metersToPixels received invalid meters value', {
      component: 'mapUtils',
      action: 'metersToPixels',
      meters,
    });
    return 0;
  }

  const metersPerPixel = calculateMetersPerPixel(region);

  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    logger.warn('metersToPixels received invalid metersPerPixel', {
      component: 'mapUtils',
      action: 'metersToPixels',
      metersPerPixel,
    });
    return 0;
  }

  return meters / metersPerPixel;
}
