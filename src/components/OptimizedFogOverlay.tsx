import React, { useMemo, useEffect } from 'react';
import { Skia, Canvas, Path, Fill, Mask, Rect, Group } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { calculateMetersPerPixel, geoPointToPixel } from '../utils/mapUtils';
import { logger } from '../utils/logger';
import type { Region as MapRegion } from 'react-native-maps';
import { FOG_CONFIG } from '../config/fogConfig';
import { PathSimplificationService } from '../utils/pathSimplification';
import { GeoPoint } from '../types/user';

interface OptimizedFogOverlayProps {
  mapRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
}

// Performance constants
const VIEWPORT_BUFFER = 0.5; // Show points 50% outside viewport
const MAX_POINTS_PER_FRAME = 5000; // Limit for performance

// Distance threshold for breaking path segments (in meters)
// If two consecutive points are further apart than this, break the path
const MAX_SEGMENT_DISTANCE_METERS = 500; // 500m - any jump larger is a "teleport"

// Calculate distance between two GPS points in meters (Haversine formula)
const calculateGeoDistance = (p1: GeoPoint, p2: GeoPoint): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (p1.latitude * Math.PI) / 180;
  const φ2 = (p2.latitude * Math.PI) / 180;
  const Δφ = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const Δλ = ((p2.longitude - p1.longitude) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Viewport culling: Only process points visible on screen + buffer
const cullPointsToViewport = (
  points: GeoPoint[],
  mapRegion: MapRegion & { width: number; height: number }
): GeoPoint[] => {
  const latBuffer = mapRegion.latitudeDelta * VIEWPORT_BUFFER;
  const lngBuffer = mapRegion.longitudeDelta * VIEWPORT_BUFFER;
  const bounds = {
    north: mapRegion.latitude + mapRegion.latitudeDelta / 2 + latBuffer,
    south: mapRegion.latitude - mapRegion.latitudeDelta / 2 - latBuffer,
    east: mapRegion.longitude + mapRegion.longitudeDelta / 2 + lngBuffer,
    west: mapRegion.longitude - mapRegion.longitudeDelta / 2 - lngBuffer,
  };
  return points.filter(
    (p) =>
      p.latitude <= bounds.north &&
      p.latitude >= bounds.south &&
      p.longitude <= bounds.east &&
      p.longitude >= bounds.west
  );
};

// Memoized coordinate conversion - simplified, no density reduction (was causing wiggle)
const useOptimizedCoordinates = (
  points: GeoPoint[],
  mapRegion: MapRegion & { width: number; height: number },
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number }
) => {
  return useMemo(() => {
    // Step 1: Viewport culling only (no density reduction - was causing wiggle on zoom)
    const viewportPoints = cullPointsToViewport(points, mapRegion);

    // Step 2: Limit total points for performance
    const finalPoints = viewportPoints.slice(0, MAX_POINTS_PER_FRAME);

    // Step 3: Convert to pixel coordinates
    const pixelCoordinates = finalPoints.map((point) => ({
      point,
      pixel: geoPointToPixel(point, mapRegion, safeAreaInsets),
    }));

    return { finalPoints, pixelCoordinates };
  }, [points, mapRegion, safeAreaInsets]);
};

// Split points into segments at teleportation jumps (large distance gaps)
type PixelCoord = { point: GeoPoint; pixel: { x: number; y: number } };
const splitAtTeleportations = (coords: PixelCoord[], maxDistance: number): PixelCoord[][] => {
  const segments: PixelCoord[][] = [];
  let current: PixelCoord[] = [];

  for (const coord of coords) {
    const prev = current[current.length - 1];
    if (!prev || calculateGeoDistance(prev.point, coord.point) <= maxDistance) {
      current.push(coord);
    } else {
      if (current.length > 0) segments.push(current);
      current = [coord];
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
};

// Draw a simplified segment to the Skia path
const drawSegmentToPath = (path: SkPath, pixels: { x: number; y: number }[]): void => {
  if (pixels.length === 0) return;
  const first = pixels[0];
  if (!first) return;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < pixels.length; i++) {
    const p = pixels[i];
    if (p) path.lineTo(p.x, p.y);
  }
};

// Hook for calculating optimized fog rendering properties
const useOptimizedFogCalculations = (
  mapRegion: MapRegion & { width: number; height: number },
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number }
) => {
  const pathPoints = useSelector((state: RootState) => state.exploration.path);

  // Get optimized coordinates
  const { finalPoints, pixelCoordinates } = useOptimizedCoordinates(
    pathPoints,
    mapRegion,
    safeAreaInsets
  );

  // Calculate radius in pixels based on the current zoom level (needed for path simplification)
  const radiusPixels = useMemo(() => {
    const metersPerPixel = calculateMetersPerPixel(mapRegion);
    return FOG_CONFIG.RADIUS_METERS / metersPerPixel;
  }, [mapRegion]);

  // Build path with teleportation detection - break path at large distance jumps
  const skiaPath = useMemo(() => {
    const path = Skia.Path.Make();
    if (pixelCoordinates.length === 0) return path;

    // Split into continuous segments (break at teleportation jumps > 500m)
    const segments = splitAtTeleportations(pixelCoordinates, MAX_SEGMENT_DISTANCE_METERS);

    // Simplify and draw each segment
    const tolerance = Math.max(1, radiusPixels * FOG_CONFIG.SIMPLIFICATION_TOLERANCE_FACTOR);
    for (const segment of segments) {
      const pixels = segment.map(({ pixel }) => pixel);
      const simplified = PathSimplificationService.simplifyPath(pixels, tolerance);
      drawSegmentToPath(path, simplified);
    }

    return path;
  }, [pixelCoordinates, radiusPixels]);

  // Calculate stroke width for path - match fog radius for smooth connections
  const strokeWidth = useMemo(() => {
    return radiusPixels * 2; // Diameter = radius × 2 for perfect fog hole connections
  }, [radiusPixels]);

  return {
    originalPointCount: pathPoints.length,
    finalPoints,
    pixelCoordinates,
    skiaPath,
    radiusPixels,
    strokeWidth,
  };
};

/**
 * OptimizedFogMask component - uses thick stroke path only
 * No individual circles - the thick stroke with round caps covers everything
 */
const OptimizedFogMask: React.FC<{
  pixelCoordinates: { point: GeoPoint; pixel: { x: number; y: number } }[];
  skiaPath: SkPath;
  strokeWidth: number;
}> = ({ pixelCoordinates, skiaPath, strokeWidth }) => {
  return (
    <Group>
      {/* Start with all-white mask (showing fog everywhere) */}
      <Fill color="white" />

      {/* Draw the stroke path - thick line with round caps reveals the fog */}
      {pixelCoordinates.length > 0 && (
        <Path
          path={skiaPath}
          color={FOG_CONFIG.PATH_COLOR}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
          strokeJoin="round"
        />
      )}
    </Group>
  );
};

/**
 * OptimizedFogOverlay component with performance optimizations for many GPS points
 */
const OptimizedFogOverlay: React.FC<OptimizedFogOverlayProps> = ({ mapRegion, safeAreaInsets }) => {
  const { originalPointCount, finalPoints, pixelCoordinates, skiaPath, radiusPixels, strokeWidth } =
    useOptimizedFogCalculations(mapRegion, safeAreaInsets);

  // Performance logging
  useEffect(() => {
    logger.throttledDebug(
      'OptimizedFogOverlay:render',
      `OptimizedFogOverlay: ${originalPointCount} → ${finalPoints.length} points, radius: ${radiusPixels.toFixed(2)}px`,
      {
        component: 'OptimizedFogOverlay',
        action: 'render',
        originalPoints: originalPointCount,
        optimizedPoints: finalPoints.length,
        radiusPixels: radiusPixels,
      },
      2000 // 2 second interval
    );
  }, [originalPointCount, finalPoints.length, radiusPixels]);

  return (
    <Canvas style={styles.canvas} pointerEvents="none" testID="optimized-fog-overlay-canvas">
      <Mask
        mode="luminance"
        mask={
          <OptimizedFogMask
            pixelCoordinates={pixelCoordinates}
            skiaPath={skiaPath}
            strokeWidth={strokeWidth}
          />
        }
      >
        {/* The actual fog rectangle covering the entire screen */}
        <Rect
          x={0}
          y={0}
          width={mapRegion.width}
          height={mapRegion.height}
          color={FOG_CONFIG.COLOR}
        />
      </Mask>
    </Canvas>
  );
};

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default OptimizedFogOverlay;
