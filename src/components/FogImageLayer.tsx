/**
 * FogImageLayer — Renders fog as a native MapLibre FillLayer (zero pan/zoom lag)
 *
 * ARCHITECTURE: Uses a GeoJSON polygon-with-holes rendered by MapLibre's native
 * FillLayer pipeline. A world-covering polygon provides the fog; holes are
 * punched where GPS paths have cleared it. Because the GeoJSON lives inside
 * MapLibre's own source/layer system, all pan/zoom transforms happen on the
 * GPU in the same render pass as the base map tiles — zero bridge crossings,
 * zero frame lag.
 *
 * WHY NOT ImageSource? MapLibre iOS delegates image loading to mbgl's C++
 * resource pipeline which only supports HTTP URLs. Both data: URIs and file://
 * URIs fail on iOS (NSHTTPURLResponse cast error). The GeoJSON approach avoids
 * image transfer entirely.
 *
 * RENDERING PIPELINE:
 *   1. GPS points from Redux → @turf/buffer → cleared-area polygon
 *   2. World polygon − cleared polygon → @turf/difference → fog GeoJSON
 *   3. <ShapeSource shape={fogGeoJSON}> + <FillLayer> → native rendering
 *
 * PERFORMANCE: turf.buffer + difference runs only when GPS data changes
 * (every few seconds), NOT on every pan/zoom frame. MapLibre handles all
 * visual updates natively at 60fps.
 */
import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { ShapeSource, FillLayer } from '@maplibre/maplibre-react-native';
import buffer from '@turf/buffer';
import difference from '@turf/difference';
import { multiPoint, polygon, featureCollection } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { RootState } from '../store';
import { logger } from '../utils/logger';
import type { MapRegion } from '../types/map';
import { FOG_CONFIG } from '../config/fogConfig';
import type { GeoPoint } from '../types/user';
import type { FogRenderConfig } from '../types/graphics';

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Number of vertices per circle in the buffer polygon.
 * Lower = faster computation + fewer vertices for MapLibre to render.
 * 8 steps = octagon per point; visually smooth enough at map zoom levels.
 */
const BUFFER_STEPS = 8;

// ─── Types ──────────────────────────────────────────────────────────────────

interface FogImageLayerProps {
  /** Current map region (threshold-gated by parent — doesn't change every frame) */
  mapRegion: MapRegion & { width: number; height: number };
  /** Safe area insets for vertical correction */
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number } | undefined;
  /** Optional graphics effect config for custom fog appearance */
  fogEffectConfig?: FogRenderConfig;
}

// ─── GeoJSON Fog Construction ───────────────────────────────────────────────

/**
 * World-covering polygon used as the exterior ring of the fog.
 * Uses ±85° latitude (Web Mercator limit) to avoid projection artifacts.
 * Counter-clockwise winding per GeoJSON spec (RFC 7946).
 */
const WORLD_POLYGON: Feature<Polygon> = polygon([
  [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ],
]);

/**
 * Build the fog GeoJSON: a world-covering polygon with holes where GPS
 * points have cleared the fog.
 *
 * Pipeline: MultiPoint → turf.buffer (creates one polygon per point,
 * internally unioned by JSTS) → turf.difference from world polygon.
 *
 * @returns Feature<Polygon|MultiPolygon> for the fog, or the full world
 *          polygon when no GPS points exist.
 */
function buildFogGeoJSON(
  pathPoints: GeoPoint[],
  radiusMeters: number
): Feature<Polygon | MultiPolygon> {
  if (pathPoints.length === 0) {
    return WORLD_POLYGON;
  }

  const startTime = performance.now();

  // Convert GeoPoints to [longitude, latitude] coordinate pairs
  const coords: [number, number][] = pathPoints.map((p) => [p.longitude, p.latitude]);

  // Create a MultiPoint and buffer it — turf handles union of overlapping circles
  const mp = multiPoint(coords);
  const buffered = buffer(mp, radiusMeters, { units: 'meters', steps: BUFFER_STEPS });

  if (!buffered) {
    logger.warn('FogImageLayer: turf.buffer returned null', {
      component: 'FogImageLayer',
      action: 'buildFogGeoJSON',
      pointCount: pathPoints.length,
    });
    return WORLD_POLYGON;
  }

  // Subtract the cleared area from the world polygon
  const fog = difference(featureCollection([WORLD_POLYGON, buffered]));

  const elapsed = performance.now() - startTime;
  if (elapsed > 50) {
    logger.debug(
      `FogImageLayer: GeoJSON build took ${elapsed.toFixed(1)}ms (${pathPoints.length} points)`,
      {
        component: 'FogImageLayer',
        action: 'buildFogGeoJSON',
        buildTimeMs: elapsed,
        pointCount: pathPoints.length,
      }
    );
  }

  return fog ?? WORLD_POLYGON;
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * FogImageLayer renders fog as a native MapLibre ShapeSource + FillLayer.
 *
 * Must be rendered as a CHILD of <MapView> so MapLibre handles all
 * pan/zoom transforms natively with zero lag.
 */
const FogImageLayer: React.FC<FogImageLayerProps> = ({
  mapRegion,
  safeAreaInsets: _safeAreaInsets,
  fogEffectConfig,
}) => {
  // GPS points from Redux
  const pathPoints = useSelector((state: RootState) => state.exploration.path);

  // Fog appearance
  const fogColor = fogEffectConfig?.fogColor ?? FOG_CONFIG.COLOR;
  const fogOpacity = fogEffectConfig?.fogOpacity ?? FOG_CONFIG.OPACITY;

  // Build fog GeoJSON — only recomputes when GPS points change
  const fogGeoJSON = useMemo(
    () => buildFogGeoJSON(pathPoints, FOG_CONFIG.RADIUS_METERS),
    [pathPoints]
  );

  // Don't render if viewport dimensions are zero (pre-layout)
  if (!mapRegion.width || !mapRegion.height) {
    return null;
  }

  return (
    <ShapeSource id="fog-shape-source" shape={fogGeoJSON}>
      <FillLayer
        id="fog-fill-layer"
        style={{
          fillColor: fogColor,
          fillOpacity: fogOpacity,
        }}
        layerIndex={999}
      />
    </ShapeSource>
  );
};

export default React.memo(FogImageLayer);

// ─── Exported for testing ───────────────────────────────────────────────────
export { buildFogGeoJSON, WORLD_POLYGON, BUFFER_STEPS };
