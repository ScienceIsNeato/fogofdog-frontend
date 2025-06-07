import React, { useMemo, useRef, useEffect } from 'react';
import {
  Skia,
  Canvas,
  Path,
  Fill,
  Circle,
  Mask,
  Rect,
  Group,
  RadialGradient,
  vec,
  BlurMask,
} from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { calculateMetersPerPixel, geoPointToPixel } from '../utils/mapUtils';
import { logger } from '../utils/logger';
import type { Region as MapRegion } from 'react-native-maps';
import { FOG_CONFIG } from '../config/fogConfig';

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface FogOverlayProps {
  mapRegion: MapRegion & { width: number; height: number };
  // New prop to control the blur style
  blurStyle?: 'none' | 'gradient' | 'blur' | 'layered' | 'combined';
  // New prop to control the blur intensity
  blurIntensity?: number;
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
    return FOG_CONFIG.RADIUS_METERS / metersPerPixel;
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

  // Filter out very frequent updates to avoid over-rendering during fast pans
  const shouldSkipRender = () => {
    const now = Date.now();
    if (now - lastRenderTime.current < FOG_CONFIG.RENDER_THROTTLE_MS) {
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
 * Original hard-edge FogMask for comparison
 */
const FogMaskHardEdge: React.FC<{
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
            color={FOG_CONFIG.PATH_COLOR}
          />
        );
      })}

      {/* Also draw the path to connect the holes */}
      {pathPoints.length > 1 && (
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
 * FogMask with radial gradients for soft edges
 */
const FogMaskGradient: React.FC<{
  pathPoints: GeoPoint[];
  mapRegion: MapRegion & { width: number; height: number };
  radiusPixels: number;
  skiaPath: SkPath;
  strokeWidth: number;
  blurIntensity: number;
}> = ({ pathPoints, mapRegion, radiusPixels, skiaPath, strokeWidth, blurIntensity }) => {
  const gradientRadius = radiusPixels * (1 + blurIntensity * 0.5);
  
  const maskContent = (
    <>
      {/* Start with all-white mask (showing fog everywhere) */}
      <Fill color="white" />

      {/* Draw gradient circles at each point for soft edges */}
      {pathPoints.map((point) => {
        const { x, y } = geoPointToPixel(point, mapRegion);
        return (
          <Circle
            key={`circle-${point.latitude}-${point.longitude}`}
            cx={x}
            cy={y}
            r={gradientRadius}
          >
            <RadialGradient
              c={vec(x, y)}
              r={gradientRadius}
              colors={['black', 'black', 'rgba(0,0,0,0.5)', 'transparent']}
              positions={[0, 0.6, 0.8, 1]}
            />
          </Circle>
        );
      })}

      {/* Draw the path with gradient effect */}
      {pathPoints.length > 1 && (
        <Path
          path={skiaPath}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
          strokeJoin="round"
          color="black"
          opacity={0.8}
        />
      )}
    </>
  );

  return <Group>{maskContent}</Group>;
};

/**
 * FogMask with blur filter for soft edges
 */
const FogMaskBlur: React.FC<{
  pathPoints: GeoPoint[];
  mapRegion: MapRegion & { width: number; height: number };
  radiusPixels: number;
  skiaPath: SkPath;
  strokeWidth: number;
  blurIntensity: number;
}> = ({ pathPoints, mapRegion, radiusPixels, skiaPath, strokeWidth, blurIntensity }) => {
  const blurAmount = 10 * blurIntensity;
  
  const maskContent = (
    <>
      {/* Start with all-white mask (showing fog everywhere) */}
      <Fill color="white" />

      {/* Draw circles with blur mask */}
      <Group>
        <BlurMask blur={blurAmount} style="normal" />
        {pathPoints.map((point) => {
          const { x, y } = geoPointToPixel(point, mapRegion);
          return (
            <Circle
              key={`circle-${point.latitude}-${point.longitude}`}
              cx={x}
              cy={y}
              r={radiusPixels}
              color="black"
            />
          );
        })}

        {/* Also draw the path with blur */}
        {pathPoints.length > 1 && (
          <Path
            path={skiaPath}
            color="black"
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />
        )}
      </Group>
    </>
  );

  return <Group>{maskContent}</Group>;
};

/**
 * FogMask with layered opacity for gradual fade
 */
const FogMaskLayered: React.FC<{
  pathPoints: GeoPoint[];
  mapRegion: MapRegion & { width: number; height: number };
  radiusPixels: number;
  skiaPath: SkPath;
  strokeWidth: number;
  blurIntensity: number;
}> = ({ pathPoints, mapRegion, radiusPixels, skiaPath, strokeWidth, blurIntensity }) => {
  const layers = 5;
  const layerStep = (radiusPixels * blurIntensity * 0.3) / layers;
  
  const maskContent = (
    <>
      {/* Start with all-white mask (showing fog everywhere) */}
      <Fill color="white" />

      {/* Draw multiple layers of circles with decreasing opacity */}
      {Array.from({ length: layers }).map((_, layerIndex) => {
        const opacity = 1 - (layerIndex / layers) * 0.8;
        const layerRadius = radiusPixels + layerIndex * layerStep;
        
        return (
          <Group key={`layer-${layerIndex}`}>
            {pathPoints.map((point) => {
              const { x, y } = geoPointToPixel(point, mapRegion);
              return (
                <Circle
                  key={`circle-${point.latitude}-${point.longitude}-${layerIndex}`}
                  cx={x}
                  cy={y}
                  r={layerRadius}
                  color={`rgba(0,0,0,${opacity})`}
                />
              );
            })}

            {/* Path for this layer */}
            {pathPoints.length > 1 && (
              <Path
                path={skiaPath}
                color={`rgba(0,0,0,${opacity})`}
                style="stroke"
                strokeWidth={strokeWidth + layerIndex * layerStep * 2}
                strokeCap="round"
                strokeJoin="round"
              />
            )}
          </Group>
        );
      })}
    </>
  );

  return <Group>{maskContent}</Group>;
};

/**
 * Combined approach: gradients + blur for the softest effect
 */
const FogMaskCombined: React.FC<{
  pathPoints: GeoPoint[];
  mapRegion: MapRegion & { width: number; height: number };
  radiusPixels: number;
  skiaPath: SkPath;
  strokeWidth: number;
  blurIntensity: number;
}> = ({ pathPoints, mapRegion, radiusPixels, skiaPath, strokeWidth, blurIntensity }) => {
  const gradientRadius = radiusPixels * (1 + blurIntensity * 0.3);
  const blurAmount = 5 * blurIntensity;
  
  const maskContent = (
    <>
      {/* Start with all-white mask (showing fog everywhere) */}
      <Fill color="white" />

      {/* Draw gradient circles with blur */}
      <Group>
        <BlurMask blur={blurAmount} style="normal" />
        {pathPoints.map((point) => {
          const { x, y } = geoPointToPixel(point, mapRegion);
          return (
            <Circle
              key={`circle-${point.latitude}-${point.longitude}`}
              cx={x}
              cy={y}
              r={gradientRadius}
            >
              <RadialGradient
                c={vec(x, y)}
                r={gradientRadius}
                colors={['black', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0.3)', 'transparent']}
                positions={[0, 0.5, 0.8, 1]}
              />
            </Circle>
          );
        })}

        {/* Path with gradient and blur */}
        {pathPoints.length > 1 && (
          <Path
            path={skiaPath}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            strokeJoin="round"
            color="black"
            opacity={0.9}
          />
        )}
      </Group>
    </>
  );

  return <Group>{maskContent}</Group>;
};

/**
 * FogOverlay component renders a fog layer over the map with transparent "holes"
 * along the user's path. Uses Skia for GPU-accelerated rendering.
 * 
 * Now supports multiple blur styles for softer edges!
 */
const FogOverlay: React.FC<FogOverlayProps> = ({ 
  mapRegion, 
  blurStyle = 'gradient', // Default to gradient style
  blurIntensity = 1 
}) => {
  const { pathPoints, skiaPath, radiusPixels, strokeWidth } = useFogCalculations(mapRegion);

  // Performance optimization hook
  useFogPerformance(pathPoints, radiusPixels, strokeWidth);

  // Select the appropriate mask component based on blur style
  const getMaskContent = () => {
    const props = {
      pathPoints,
      mapRegion,
      radiusPixels,
      skiaPath,
      strokeWidth,
      blurIntensity,
    };

    switch (blurStyle) {
      case 'none':
        return <FogMaskHardEdge {...props} />;
      case 'gradient':
        return <FogMaskGradient {...props} />;
      case 'blur':
        return <FogMaskBlur {...props} />;
      case 'layered':
        return <FogMaskLayered {...props} />;
      case 'combined':
        return <FogMaskCombined {...props} />;
      default:
        return <FogMaskGradient {...props} />;
    }
  };

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <Mask
        mode="luminance"
        mask={getMaskContent()}
      >
        {/* Fog overlay rectangle */}
        <Rect
          x={0}
          y={0}
          width={mapRegion.width}
          height={mapRegion.height}
          color={FOG_CONFIG.COLOR}
          opacity={FOG_CONFIG.OPACITY}
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
