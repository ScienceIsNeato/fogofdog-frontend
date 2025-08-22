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
import { GPSConnectionService } from '../services/GPSConnectionService';
import { GeoPoint } from '../types/user';

interface OptimizedFogOverlayProps {
  mapRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
}

// Performance constants
const VIEWPORT_BUFFER = 0.5; // Show points 50% outside viewport
const MIN_VISUAL_DISTANCE_PIXELS = 5; // Skip points closer than 5px visually
const MAX_POINTS_PER_FRAME = 5000; // Limit for performance

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
    (point) =>
      point.latitude <= bounds.north &&
      point.latitude >= bounds.south &&
      point.longitude <= bounds.east &&
      point.longitude >= bounds.west
  );
};

// Visual density reduction: Skip points too close together on screen
const reduceVisualDensity = (
  points: GeoPoint[],
  mapRegion: MapRegion & { width: number; height: number },
  minDistancePixels: number,
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number }
): GeoPoint[] => {
  if (points.length === 0) return points;

  const firstPoint = points[0];
  if (!firstPoint) return points;

  const result: GeoPoint[] = [firstPoint]; // Always include first point
  let lastPixel = geoPointToPixel(firstPoint, mapRegion, safeAreaInsets);

  for (let i = 1; i < points.length; i++) {
    const currentPoint = points[i];
    if (!currentPoint) continue;

    const currentPixel = geoPointToPixel(currentPoint, mapRegion, safeAreaInsets);
    const distance = Math.sqrt(
      Math.pow(currentPixel.x - lastPixel.x, 2) + Math.pow(currentPixel.y - lastPixel.y, 2)
    );

    if (distance >= minDistancePixels) {
      result.push(currentPoint);
      lastPixel = currentPixel;
    }
  }

  return result;
};

// Memoized coordinate conversion with region change detection
const useOptimizedCoordinates = (
  points: GeoPoint[],
  mapRegion: MapRegion & { width: number; height: number },
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number }
) => {
  return useMemo(() => {
    const startTime = performance.now();

    // Step 1: Viewport culling
    const viewportPoints = cullPointsToViewport(points, mapRegion);

    // Step 2: Visual density reduction
    const densityReducedPoints = reduceVisualDensity(
      viewportPoints,
      mapRegion,
      MIN_VISUAL_DISTANCE_PIXELS,
      safeAreaInsets
    );

    // Step 3: Limit total points for performance
    const finalPoints = densityReducedPoints.slice(0, MAX_POINTS_PER_FRAME);

    // Step 4: Convert to pixel coordinates once
    const pixelCoordinates = finalPoints.map((point) => ({
      point,
      pixel: geoPointToPixel(point, mapRegion, safeAreaInsets),
    }));

    const processingTime = performance.now() - startTime;

    // Only log processing details when there's significant work or performance issues
    if (processingTime > 10) {
      logger.debug(
        `OptimizedFogOverlay: processed ${points.length} → ${viewportPoints.length} → ${densityReducedPoints.length} → ${finalPoints.length} points in ${processingTime.toFixed(2)}ms`,
        {
          component: 'OptimizedFogOverlay',
          originalPoints: points.length,
          viewportPoints: viewportPoints.length,
          densityReducedPoints: densityReducedPoints.length,
          finalPoints: finalPoints.length,
          processingTimeMs: processingTime,
        }
      );
    }

    return { finalPoints, pixelCoordinates };
  }, [points, mapRegion, safeAreaInsets]);
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

  // Compute the Skia path from optimized points
  const skiaPath = useMemo(() => {
    const path = Skia.Path.Make();

    if (finalPoints.length === 0) {
      return path;
    }

    // Use unified GPS connection logic on optimized points
    const processedPoints = GPSConnectionService.processGPSPoints(finalPoints);
    const connectedSegments = GPSConnectionService.getConnectedSegments(processedPoints);

    // Build path using pre-calculated pixel coordinates
    const pixelMap = new Map(
      pixelCoordinates.map((item) => [`${item.point.latitude}-${item.point.longitude}`, item.pixel])
    );

    let lastPoint: { x: number; y: number } | null = null;

    for (const segment of connectedSegments) {
      const startKey = `${segment.start.latitude}-${segment.start.longitude}`;
      const endKey = `${segment.end.latitude}-${segment.end.longitude}`;

      const startPixel = pixelMap.get(startKey);
      const endPixel = pixelMap.get(endKey);

      if (!startPixel || !endPixel) continue;

      if (!lastPoint || lastPoint.x !== startPixel.x || lastPoint.y !== startPixel.y) {
        path.moveTo(startPixel.x, startPixel.y);
      }

      path.lineTo(endPixel.x, endPixel.y);
      lastPoint = endPixel;
    }

    return path;
  }, [finalPoints, pixelCoordinates]);

  // Calculate radius in pixels based on the current zoom level
  const radiusPixels = useMemo(() => {
    const metersPerPixel = calculateMetersPerPixel(mapRegion);
    return FOG_CONFIG.RADIUS_METERS / metersPerPixel;
  }, [mapRegion]);

  // Calculate stroke width for path
  const strokeWidth = useMemo(() => {
    return radiusPixels * 1.8;
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

// Optimized batch circle rendering using a single path
const createBatchedCirclePath = (
  pixelCoordinates: { point: GeoPoint; pixel: { x: number; y: number } }[],
  radiusPixels: number
): SkPath => {
  const path = Skia.Path.Make();

  for (const { pixel } of pixelCoordinates) {
    // Add circle to path
    path.addCircle(pixel.x, pixel.y, radiusPixels);
  }

  return path;
};

/**
 * OptimizedFogMask component with performance optimizations
 */
const OptimizedFogMask: React.FC<{
  pixelCoordinates: { point: GeoPoint; pixel: { x: number; y: number } }[];
  radiusPixels: number;
  skiaPath: SkPath;
  strokeWidth: number;
}> = ({ pixelCoordinates, radiusPixels, skiaPath, strokeWidth }) => {
  // Create batched circle path for better performance
  const batchedCirclePath = useMemo(
    () => createBatchedCirclePath(pixelCoordinates, radiusPixels),
    [pixelCoordinates, radiusPixels]
  );

  const maskContent = (
    <>
      {/* Start with all-white mask (showing fog everywhere) */}
      <Fill color="white" />

      {/* Batch render all circles in a single path - much faster */}
      <Path path={batchedCirclePath} color={FOG_CONFIG.PATH_COLOR} style="fill" />

      {/* Draw the connecting path */}
      {pixelCoordinates.length > 1 && (
        <Path
          path={skiaPath}
          color={FOG_CONFIG.PATH_COLOR}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
          strokeJoin="round"
        />
      )}
    </>
  );

  return <Group>{maskContent}</Group>;
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
            radiusPixels={radiusPixels}
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
