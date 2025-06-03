import React, { useMemo, useRef, useEffect } from 'react';
import { Skia, Canvas, Path, Fill, Circle, Mask, Rect, Group } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { calculateMetersPerPixel, geoPointToPixel } from '../utils/mapUtils';
import { logger } from '../utils/logger';
import type { Region as MapRegion } from 'react-native-maps';

// Constants for fog overlay appearance
const FOG_COLOR = 'rgba(128, 128, 128, 0.3)'; // Light gray
const FOG_OPACITY = 0.85;
const PATH_COLOR = 'black'; // Black areas in mask create transparency
const FOG_RADIUS_METERS = 100; // Radius in meters for cleared areas

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface FogOverlayProps {
  mapRegion: MapRegion & { width: number; height: number };
}

// Hook for calculating fog rendering properties
const useFogCalculations = (mapRegion: MapRegion & { width: number; height: number }) => {
  const pathPoints = useSelector((state: RootState) => state.exploration.path);

  // Compute the Skia path from geo points
  const skiaPath = useMemo(() => {
    const path = Skia.Path.Make();

    if (pathPoints.length === 0) {
      return path;
    }

    // Create the path by connecting all the points
    const firstPoint = pathPoints[0];
    if (!firstPoint) return path; // Type guard for strict null checks

    const firstPixel = geoPointToPixel(firstPoint, mapRegion);
    path.moveTo(firstPixel.x, firstPixel.y);

    for (let i = 1; i < pathPoints.length; i++) {
      const point = pathPoints[i];
      if (!point) continue; // Type guard for strict null checks

      const { x, y } = geoPointToPixel(point, mapRegion);
      path.lineTo(x, y);
    }

    return path;
  }, [pathPoints, mapRegion]);

  // Calculate radius in pixels based on the current zoom level
  const radiusPixels = useMemo(() => {
    const metersPerPixel = calculateMetersPerPixel(mapRegion);
    return FOG_RADIUS_METERS / metersPerPixel;
  }, [mapRegion]);

  // Calculate stroke width for path (can be thinner than the circle diameter)
  const strokeWidth = useMemo(() => {
    return radiusPixels * 1.8; // Use 90% of the full diameter for the path
  }, [radiusPixels]);

  return {
    pathPoints,
    skiaPath,
    radiusPixels,
    strokeWidth,
  };
};

// Hook for performance optimization and debugging
const useFogPerformance = (pathPoints: GeoPoint[], radiusPixels: number, strokeWidth: number) => {
  const lastRenderTime = useRef(0);
  const RENDER_THROTTLE_MS = 16; // Throttle to ~60fps

  // Filter out very frequent updates to avoid over-rendering during fast pans
  const shouldSkipRender = () => {
    const now = Date.now();
    if (now - lastRenderTime.current < RENDER_THROTTLE_MS) {
      return true;
    }
    lastRenderTime.current = now;
    return false;
  };

  // Debug logging
  useEffect(() => {
    if (!shouldSkipRender()) {
      logger.debug(
        `FogOverlay: rendering with ${pathPoints.length} points, radius: ${radiusPixels.toFixed(2)}px, stroke: ${strokeWidth.toFixed(2)}px`,
        { component: 'FogOverlay', action: 'render' }
      );
    }
  }, [pathPoints, radiusPixels, strokeWidth]);
};

/**
 * FogMask component renders the mask content for the fog overlay
 */
const FogMask: React.FC<{
  pathPoints: GeoPoint[];
  mapRegion: MapRegion & { width: number; height: number };
  radiusPixels: number;
  skiaPath: SkPath;
  strokeWidth: number;
}> = ({ pathPoints, mapRegion, radiusPixels, skiaPath, strokeWidth }) => {
  const maskContent = (
    <>
      {/* Start with all-white mask (showing fog everywhere) */}
      <Fill color="white" />

      {/* Draw circles at each point to ensure visible holes */}
      {pathPoints.map((point) => {
        const { x, y } = geoPointToPixel(point, mapRegion);
        return (
          <Circle
            key={`circle-${point.latitude}-${point.longitude}`}
            cx={x}
            cy={y}
            r={radiusPixels}
            color={PATH_COLOR}
          />
        );
      })}

      {/* Also draw the path to connect the holes */}
      {pathPoints.length > 1 && (
        <Path
          path={skiaPath}
          color={PATH_COLOR}
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
 * FogOverlay component renders a fog layer over the map with transparent "holes"
 * along the user's path. Uses Skia for GPU-accelerated rendering.
 */
const FogOverlay: React.FC<FogOverlayProps> = ({ mapRegion }) => {
  const { pathPoints, skiaPath, radiusPixels, strokeWidth } = useFogCalculations(mapRegion);

  // Performance optimization hook
  useFogPerformance(pathPoints, radiusPixels, strokeWidth);

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <Mask
        mode="luminance"
        mask={
          <FogMask
            pathPoints={pathPoints}
            mapRegion={mapRegion}
            radiusPixels={radiusPixels}
            skiaPath={skiaPath}
            strokeWidth={strokeWidth}
          />
        }
      >
        {/* Fog overlay rectangle */}
        <Rect
          x={0}
          y={0}
          width={mapRegion.width}
          height={mapRegion.height}
          color={FOG_COLOR}
          opacity={FOG_OPACITY}
        />
      </Mask>
    </Canvas>
  );
};

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default FogOverlay;
