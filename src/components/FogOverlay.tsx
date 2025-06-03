import React, { useMemo, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Mask, Group, Fill, Path, Rect, Skia, Circle } from '@shopify/react-native-skia';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { MapRegion } from '../types/navigation';
import { geoPointToPixel, calculateMetersPerPixel } from '../utils/mapUtils';
import { logger } from '../utils/logger';

// Default fog opacity
const FOG_OPACITY = 1.0; // Completely opaque as requested
// Default fog color
const FOG_COLOR = 'black';
// Default path color (should be black for mask)
const PATH_COLOR = 'black';
// Radius of fog hole in meters (matching previous implementation)
const FOG_RADIUS_METERS = 75; // Increased from 50m for better visibility

interface FogOverlayProps {
  mapRegion: MapRegion & { width: number; height: number };
  rotation?: number; // Optional map rotation angle in degrees
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
const useFogPerformance = (pathPoints: any[], radiusPixels: number, strokeWidth: number) => {
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

// Hook for calculating canvas transformations
const useCanvasTransform = (
  rotation: number,
  mapRegion: MapRegion & { width: number; height: number }
) => {
  const currentLocation = useSelector((state: RootState) => state.exploration.currentLocation);

  return useMemo(() => {
    if (rotation === 0) return undefined;

    // Use current location as the center of rotation if available
    // Otherwise fall back to the center of the screen
    let centerX = mapRegion.width / 2;
    let centerY = mapRegion.height / 2;

    if (currentLocation) {
      // Convert GPS coordinates to screen coordinates
      const currentPoint = geoPointToPixel(currentLocation, mapRegion);
      centerX = currentPoint.x;
      centerY = currentPoint.y;
    }

    return [
      { translateX: centerX },
      { translateY: centerY },
      { rotate: (rotation * Math.PI) / 180 }, // Convert degrees to radians
      { translateX: -centerX },
      { translateY: -centerY },
    ];
  }, [rotation, mapRegion, currentLocation]);
};

/**
 * FogMask component renders the mask content for the fog overlay
 */
const FogMask: React.FC<{
  pathPoints: any[];
  mapRegion: MapRegion & { width: number; height: number };
  radiusPixels: number;
  skiaPath: any;
  strokeWidth: number;
  canvasTransform?: any;
}> = ({ pathPoints, mapRegion, radiusPixels, skiaPath, strokeWidth, canvasTransform }) => {
  const maskContent = (
    <>
      {/* Start with all-white mask (showing fog everywhere) */}
      <Fill color="white" />

      {/* Draw circles at each point to ensure visible holes */}
      {pathPoints.map((point, index) => {
        const { x, y } = geoPointToPixel(point, mapRegion);
        return <Circle key={`circle-${index}`} cx={x} cy={y} r={radiusPixels} color={PATH_COLOR} />;
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

  return canvasTransform ? (
    <Group transform={canvasTransform}>{maskContent}</Group>
  ) : (
    <Group>{maskContent}</Group>
  );
};

/**
 * FogOverlay component renders a fog layer over the map with transparent "holes"
 * along the user's path. Uses Skia for GPU-accelerated rendering.
 */
const FogOverlay: React.FC<FogOverlayProps> = ({ mapRegion, rotation = 0 }) => {
  const { pathPoints, skiaPath, radiusPixels, strokeWidth } = useFogCalculations(mapRegion);
  const canvasTransform = useCanvasTransform(rotation, mapRegion);

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
            canvasTransform={canvasTransform}
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
