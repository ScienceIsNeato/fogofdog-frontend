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
 * ANIMATION: Fog effects (pulse, tint-cycle) drive FillLayer style props via
 * a throttled requestAnimationFrame loop at ~24fps. Only opacity/colour change;
 * the GeoJSON geometry stays cached. MapLibre handles style property updates
 * efficiently without re-parsing the source data.
 *
 * PERFORMANCE: turf.buffer + difference runs only when GPS data changes
 * (every few seconds), NOT on every pan/zoom frame. MapLibre handles all
 * visual updates natively at 60fps.
 */
import React, { useMemo, useState, useEffect, useRef } from 'react';
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

/**
 * Grid cell size in degrees for spatial downsampling.
 * At 40° latitude, 1° longitude ≈ 85km, 1° latitude ≈ 111km.
 * 0.0003° ≈ 33m at equator — roughly matches FOG_CONFIG.RADIUS_METERS (35m).
 * Points within the same cell produce overlapping circles, so only one
 * representative per cell is needed for visually identical output.
 */
const GRID_CELL_SIZE = 0.0003;

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
 * Spatially downsample GPS points by snapping to a grid.
 * Points that fall in the same grid cell produce overlapping buffer circles,
 * so we only need one representative per cell. This reduces O(n²) union
 * work in turf.buffer/JSTS from thousands of points to a few hundred.
 *
 * Uses string key hashing for O(n) performance regardless of point count.
 */
function downsampleToGrid(points: GeoPoint[]): [number, number][] {
  const seen = new Set<string>();
  const result: [number, number][] = [];

  for (const p of points) {
    // Snap to grid cell
    const cellX = Math.floor(p.longitude / GRID_CELL_SIZE);
    const cellY = Math.floor(p.latitude / GRID_CELL_SIZE);
    const key = `${cellX},${cellY}`;

    if (!seen.has(key)) {
      seen.add(key);
      // Use cell center as representative point
      result.push([(cellX + 0.5) * GRID_CELL_SIZE, (cellY + 0.5) * GRID_CELL_SIZE]);
    }
  }

  return result;
}

/**
 * Build the fog GeoJSON: a world-covering polygon with holes where GPS
 * points have cleared the fog.
 *
 * Pipeline: GPS points → grid downsample → MultiPoint → turf.buffer
 * (internally unioned by JSTS) → turf.difference from world polygon.
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

  // Downsample: 963 raw GPS points → ~100-200 grid-unique points
  const coords = downsampleToGrid(pathPoints);

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
      `FogImageLayer: GeoJSON build took ${elapsed.toFixed(1)}ms (${pathPoints.length} raw → ${coords.length} grid points)`,
      {
        component: 'FogImageLayer',
        action: 'buildFogGeoJSON',
        buildTimeMs: elapsed,
        rawPointCount: pathPoints.length,
        gridPointCount: coords.length,
      }
    );
  }

  return fog ?? WORLD_POLYGON;
}

// ─── Animation Utilities ────────────────────────────────────────────────────

/** Target frame rate for fog animations — 24fps is smooth for subtle effects. */
const ANIMATION_FPS = 24;
const ANIMATION_FRAME_INTERVAL_MS = 1000 / ANIMATION_FPS;

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Linearly interpolate between two hex colours.
 * Both inputs must be 6-digit hex strings (e.g. '#0a0020').
 */
function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${hex(r1 + (r2 - r1) * t)}${hex(g1 + (g2 - g1) * t)}${hex(b1 + (b2 - b1) * t)}`;
}

/**
 * Hook that drives a normalised animation phase (0–1) for fog effects.
 * Runs a requestAnimationFrame loop throttled to ~24fps to keep bridge
 * traffic low. Returns 0 when no animation is active.
 */
function useFogAnimation(
  animationType: 'none' | 'pulse' | 'tint-cycle',
  animationDuration: number
): number {
  const [phase, setPhase] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (animationType === 'none' || animationDuration <= 0) {
      setPhase(0);
      return;
    }

    const start = performance.now();
    let lastFrame = 0;

    const tick = () => {
      const now = performance.now();
      if (now - lastFrame >= ANIMATION_FRAME_INTERVAL_MS) {
        lastFrame = now;
        const elapsed = now - start;
        setPhase((elapsed % animationDuration) / animationDuration);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameRef.current);
  }, [animationType, animationDuration]);

  return phase;
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

  // Base fog appearance (static values from effect config)
  const baseFogColor = fogEffectConfig?.fogColor ?? FOG_CONFIG.COLOR;
  const baseFogOpacity = fogEffectConfig?.fogOpacity ?? FOG_CONFIG.OPACITY;
  const animationType = fogEffectConfig?.animationType ?? 'none';
  const animationDuration = fogEffectConfig?.animationDuration ?? 0;
  const animationAmplitude = fogEffectConfig?.animationAmplitude ?? 0;
  const tintColor = fogEffectConfig?.tintColor;

  // Animation phase (0–1), driven by rAF at ~24fps. Returns 0 when static.
  const animPhase = useFogAnimation(animationType, animationDuration);

  // Compute animated fill style from phase
  let fogColor = baseFogColor;
  let fogOpacity = baseFogOpacity;

  if (animationType === 'pulse' && animationAmplitude > 0) {
    // Sinusoidal opacity oscillation: base ± amplitude
    const sin = Math.sin(animPhase * 2 * Math.PI);
    fogOpacity = clamp(baseFogOpacity + sin * animationAmplitude, 0, 1);
  } else if (animationType === 'tint-cycle' && tintColor) {
    // Sinusoidal colour blend: fogColor ↔ tintColor
    const t = (Math.sin(animPhase * 2 * Math.PI) + 1) / 2; // 0..1
    fogColor = lerpColor(baseFogColor, tintColor, t * animationAmplitude);
  }

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
export {
  buildFogGeoJSON,
  downsampleToGrid,
  WORLD_POLYGON,
  BUFFER_STEPS,
  GRID_CELL_SIZE,
  lerpColor,
  clamp,
  ANIMATION_FPS,
};
