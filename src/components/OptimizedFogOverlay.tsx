import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { Skia, Canvas, Path, Fill, Mask, Rect, Group } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { calculateMetersPerPixel, geoPointToPixel } from '../utils/mapUtils';
import { logger } from '../utils/logger';
import type { MapRegion } from '../types/map';
import { FOG_CONFIG } from '../config/fogConfig';
import { GPSConnectionService } from '../services/GPSConnectionService';
import { PathSimplificationService } from '../utils/pathSimplification';
import { GeoPoint } from '../types/user';

/**
 * CRITICAL: Custom hook to manage Skia path lifecycle (React 19 safe)
 *
 * Skia paths created with Skia.Path.Make() allocate native memory that is NOT
 * garbage collected by JavaScript. They MUST be explicitly disposed with .dispose().
 *
 * IMPORTANT: In React 19, useMemo can run during aborted renders (concurrent mode,
 * StrictMode double-render). Native memory mutations (delete/allocate) MUST happen
 * in useEffect, not useMemo, to avoid corrupting paths that are still referenced
 * by committed renders.
 *
 * DISPOSAL SAFETY: Uses a two-effect pattern with an intendedPathRef guard to
 * prevent disposing a path that's still being rendered by the native thread:
 *   Effect 1 (on factory change): Creates the new path, sets intendedPathRef
 *       synchronously as a guard, then swaps it into state via batched setPath
 *   Effect 2 (on path state change): Disposes previous paths AFTER the new path
 *       is committed to the render tree — guaranteed safe from native thread races
 *
 * MOUNT RACE FIX: On mount, React runs both effects in the same commit cycle.
 * Without the intendedPathRef guard, Effect 2 would see the newly created path
 * in createdPathsRef, find it !== path (still emptyPath due to batched setPath),
 * and dispose it before React commits the render. The intendedPathRef is set
 * synchronously in Effect 1 before setPath, so Effect 2 can skip it.
 *
 * This also handles StrictMode double-fire via a createdPaths Set that tracks all
 * allocated paths and cleans up any orphans after the final state is committed.
 */
const useManagedSkiaPath = (createPath: () => SkPath, deps: React.DependencyList): SkPath => {
  // Stable empty path as initial value — avoids null checks downstream
  const emptyPath = useMemo(() => Skia.Path.Make(), []);
  const [path, setPath] = useState<SkPath>(emptyPath);
  // Track all paths created by Effect 1 so Effect 2 can dispose them safely
  const createdPathsRef = useRef<Set<SkPath>>(new Set());
  // Synchronous guard: prevents Effect 2 from disposing a path that Effect 1
  // just created but setPath hasn't committed yet (batched state update race).
  // On mount, both effects run in the same commit cycle — without this guard,
  // Effect 2 sees the new path in createdPathsRef, finds it !== path (still
  // emptyPath due to batching), and disposes it before it's ever rendered.
  const intendedPathRef = useRef<SkPath>(emptyPath);

  // Memoize the path factory to detect dependency changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedFactory = useCallback(createPath, deps);

  // Effect 1: Create new path and swap into state
  // No disposal here — the old path may still be referenced by the committed render tree.
  // Disposal is deferred to Effect 2 which runs after the new state is committed.
  useEffect(() => {
    const newPath = memoizedFactory();
    createdPathsRef.current.add(newPath);
    intendedPathRef.current = newPath; // Synchronous guard before batched setPath
    setPath(newPath);
  }, [memoizedFactory]);

  // Effect 2: Dispose previous paths AFTER new path is committed to the render tree
  // This runs when `path` state changes, meaning React has committed the new path
  // and the native thread is no longer referencing the old one.
  useEffect(() => {
    // Capture ref value for stable cleanup (react-hooks/exhaustive-deps)
    const createdPaths = createdPathsRef.current;

    // Dispose all tracked paths except the current one and the intended next one.
    // The intendedPathRef guard prevents disposing a path that Effect 1 created
    // but React hasn't yet committed via the batched setPath call.
    for (const p of createdPaths) {
      if (p !== path && p !== emptyPath && p !== intendedPathRef.current) {
        try {
          p.dispose();
        } catch {
          // Path may already be disposed - ignore
        }
        createdPaths.delete(p);
      }
    }

    // On unmount: dispose current path, all tracked paths, and emptyPath
    return () => {
      try {
        path.dispose();
      } catch {
        // Path may already be disposed - ignore
      }
      for (const p of createdPaths) {
        try {
          p.dispose();
        } catch {
          // Path may already be disposed - ignore
        }
      }
      createdPaths.clear();
      try {
        emptyPath.dispose();
      } catch {
        // Path may already be disposed - ignore
      }
    };
  }, [path, emptyPath]);

  return path;
};

interface OptimizedFogOverlayProps {
  mapRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
}

// Performance constants
const VIEWPORT_BUFFER = 0.5; // Show points 50% outside viewport
const MIN_VISUAL_DISTANCE_PIXELS = 5; // Skip points closer than 5px visually
const MAX_POINTS_PER_FRAME = 5000; // Limit for performance

// Stable compute region thresholds — controls when fog recomputes vs GPU-transforms
// During a pan at constant zoom, the fog uses a cheap GPU translate instead of
// recomputing all pixel coordinates, Skia paths, and viewport culling from scratch.
const ZOOM_CHANGE_THRESHOLD = 0.02; // 2% zoom change triggers recompute
const PAN_BUFFER_TRIGGER = 0.8; // Recompute when panned 80% of viewport buffer

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
    // Guard: skip processing when dimensions aren't available yet
    if (!mapRegion.width || !mapRegion.height) {
      return { finalPoints: [], pixelCoordinates: [] };
    }

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

  // Calculate radius in pixels based on the current zoom level (needed for path simplification)
  // Guard: return safe default when dimensions aren't available yet (before onLayout)
  const radiusPixels = useMemo(() => {
    if (!mapRegion.width || !mapRegion.height) {
      return 0;
    }
    const metersPerPixel = calculateMetersPerPixel(mapRegion);
    return FOG_CONFIG.RADIUS_METERS / metersPerPixel;
  }, [mapRegion]);

  // Memoize GPS connection processing based on actual GPS points, not map region
  const connectedSegments = useMemo(() => {
    if (finalPoints.length === 0) {
      return [];
    }

    // Use unified GPS connection logic on optimized points
    // Disable logging to prevent spam during map interactions
    const processedPoints = GPSConnectionService.processGPSPoints(finalPoints, {
      enableLogging: false,
    });
    return GPSConnectionService.getConnectedSegments(processedPoints);
  }, [finalPoints]);

  // Compute the Skia path from connected segments with smooth Bezier curves
  // CRITICAL: Use managed hook to properly dispose native Skia memory
  const skiaPath = useManagedSkiaPath(() => {
    const path = Skia.Path.Make();

    if (connectedSegments.length === 0) {
      return path;
    }

    // Build path using pre-calculated pixel coordinates
    const pixelMap = new Map(
      pixelCoordinates.map((item) => [`${item.point.latitude}-${item.point.longitude}`, item.pixel])
    );

    // Build continuous path chains and simplify them using utility service
    const segmentData = connectedSegments
      .map((segment) => ({
        start: pixelMap.get(`${segment.start.latitude}-${segment.start.longitude}`)!,
        end: pixelMap.get(`${segment.end.latitude}-${segment.end.longitude}`)!,
      }))
      .filter((seg) => seg.start && seg.end);

    const pathChains = PathSimplificationService.buildPathChains(segmentData);

    // Use conservative tolerance for simplification
    const tolerance = Math.max(1, radiusPixels * FOG_CONFIG.SIMPLIFICATION_TOLERANCE_FACTOR);
    const simplifiedChains = pathChains.map((chain) =>
      PathSimplificationService.simplifyPath(chain, tolerance)
    );

    // Draw smooth paths using utility service
    PathSimplificationService.drawSmoothPath(path, simplifiedChains);

    return path;
  }, [connectedSegments, pixelCoordinates, radiusPixels]);

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
 *
 * panOffset: GPU translate applied during panning to avoid recomputing
 * pixel coordinates/Skia paths on every frame. Only the transform matrix
 * changes — Skia reuses compiled paths.
 */
const OptimizedFogMask: React.FC<{
  pixelCoordinates: { point: GeoPoint; pixel: { x: number; y: number } }[];
  radiusPixels: number;
  skiaPath: SkPath;
  strokeWidth: number;
  panOffset: { x: number; y: number };
}> = ({ pixelCoordinates, radiusPixels, skiaPath, strokeWidth, panOffset }) => {
  // Create batched circle path for better performance
  // CRITICAL: Use managed hook to properly dispose native Skia memory
  const batchedCirclePath = useManagedSkiaPath(
    () => createBatchedCirclePath(pixelCoordinates, radiusPixels),
    [pixelCoordinates, radiusPixels]
  );

  return (
    <Group>
      {/* Full-canvas white background (fog everywhere) — NOT transformed */}
      <Fill color="white" />

      {/* Fog holes translated to current pan position — GPU transform only */}
      <Group transform={[{ translateX: panOffset.x }, { translateY: panOffset.y }]}>
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
      </Group>
    </Group>
  );
};

/**
 * OptimizedFogOverlay component with performance optimizations for many GPS points
 *
 * PAN OPTIMIZATION: During a constant-zoom pan, geoPointToPixel is a linear
 * transform — ALL points shift by the same pixel offset. Instead of recomputing
 * viewport culling, density reduction, pixel conversion, and Skia path
 * allocation/deallocation on every 16ms frame, we:
 *   1. Compute fog paths once at a "stable compute region"
 *   2. During panning, apply a cheap Skia Group translate(dx, dy)
 *   3. Recompute only when zoom changes, viewport exceeds buffer, or new GPS points arrive
 *
 * This transforms panning from O(n) per frame → O(1) GPU matrix transform.
 */
const OptimizedFogOverlay: React.FC<OptimizedFogOverlayProps> = ({ mapRegion, safeAreaInsets }) => {
  // --- Stable "compute region": only updates when fog needs full recomputation ---
  const computeRegionRef = useRef(mapRegion);
  const [computeRegion, setComputeRegion] = useState(mapRegion);

  useEffect(() => {
    const prev = computeRegionRef.current;

    // Zoom changed significantly? (latDelta or lonDelta shifted >2%)
    const zoomChanged =
      Math.abs(prev.latitudeDelta - mapRegion.latitudeDelta) / prev.latitudeDelta >
        ZOOM_CHANGE_THRESHOLD ||
      Math.abs(prev.longitudeDelta - mapRegion.longitudeDelta) / prev.longitudeDelta >
        ZOOM_CHANGE_THRESHOLD;

    // Viewport panned beyond 80% of the pre-culled buffer?
    const latShift = Math.abs(mapRegion.latitude - prev.latitude) / prev.latitudeDelta;
    const lngShift = Math.abs(mapRegion.longitude - prev.longitude) / prev.longitudeDelta;
    const beyondBuffer =
      latShift > VIEWPORT_BUFFER * PAN_BUFFER_TRIGGER ||
      lngShift > VIEWPORT_BUFFER * PAN_BUFFER_TRIGGER;

    // Dimensions changed? (device rotation)
    const dimensionsChanged = prev.width !== mapRegion.width || prev.height !== mapRegion.height;

    if (zoomChanged || beyondBuffer || dimensionsChanged) {
      computeRegionRef.current = mapRegion;
      setComputeRegion(mapRegion);
    }
  }, [mapRegion]);

  // Calculate pixel offset from compute region to current map region.
  // geoPointToPixel is linear: x = w/2 + (lon-center)/delta*w, y = h/2 + (center-lat)/delta*h*vScale
  // So all points shift by the same (dx, dy) during a pan — pure GPU translate.
  const panOffset = useMemo(() => {
    if (!computeRegion.width || !computeRegion.height) return { x: 0, y: 0 };

    let verticalScale = 1.0;
    if (safeAreaInsets) {
      const effectiveHeight = computeRegion.height - safeAreaInsets.top - safeAreaInsets.bottom;
      verticalScale = effectiveHeight / computeRegion.height;
    }

    return {
      x:
        ((computeRegion.longitude - mapRegion.longitude) / computeRegion.longitudeDelta) *
        computeRegion.width,
      y:
        ((mapRegion.latitude - computeRegion.latitude) / computeRegion.latitudeDelta) *
        computeRegion.height *
        verticalScale,
    };
  }, [mapRegion, computeRegion, safeAreaInsets]);

  // Heavy computation uses STABLE compute region — not the every-frame mapRegion.
  // useMemo deps inside useOptimizedFogCalculations only invalidate when
  // computeRegion reference changes (zoom/buffer/dimension triggers) or
  // when new GPS points arrive from Redux.
  const { originalPointCount, finalPoints, pixelCoordinates, skiaPath, radiusPixels, strokeWidth } =
    useOptimizedFogCalculations(computeRegion, safeAreaInsets);

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

  // Guard: Don't render Skia Canvas into zero-sized surface
  // This can happen before onLayout fires, especially with React 19's
  // changed effect scheduling and Expo 54's startup timing
  if (!mapRegion.width || !mapRegion.height) {
    return null;
  }

  return (
    <View style={styles.canvasWrapper} pointerEvents="none">
      <Canvas style={styles.canvas} testID="optimized-fog-overlay-canvas">
        <Mask
          mode="luminance"
          mask={
            <OptimizedFogMask
              pixelCoordinates={pixelCoordinates}
              radiusPixels={radiusPixels}
              skiaPath={skiaPath}
              strokeWidth={strokeWidth}
              panOffset={panOffset}
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
    </View>
  );
};

const styles = StyleSheet.create({
  canvasWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
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
