/**
 * graphicsConnectors.tsx
 *
 * Thin Redux-connected wrapper components for the graphics overlay layer.
 * Each component reads the active effect ID from the graphics Redux slice,
 * retrieves the corresponding render config from GraphicsService, and passes
 * it to the presentational overlay component.
 *
 * Extracted here to keep Map/index.tsx under the 2700-line LOC budget.
 */
import React from 'react';
import FogImageLayer from '../../components/FogImageLayer';
import MapEffectOverlay from '../../components/MapEffectOverlay';
import ScentTrail from '../../components/ScentTrail';
import { useAppSelector } from '../../store/hooks';
import { GraphicsService } from '../../services/GraphicsService';
import { geoPointToPixel } from '../../utils/mapUtils';
import type { MapRegion } from '../../types/map';
import type { GeoPoint } from '../../types/user';

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Initialise the graphics effects registry when this module is first imported.
// initializeDefaultEffects() is idempotent; safe to call at module scope.
GraphicsService.initializeDefaultEffects();

/**
 * Fog image layer wired to active fog effect from Redux.
 *
 * ARCHITECTURE: Renders fog as a native MapLibre ShapeSource + FillLayer.
 * Uses a GeoJSON polygon-with-holes (world polygon minus buffered GPS path).
 * Must be rendered as a CHILD of <MapView> — MapLibre handles all pan/zoom
 * transforms natively with zero lag (no JS bridge crossings during gestures).
 */
export const FogImageLayerConnected: React.FC<{
  mapRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: SafeAreaInsets | undefined;
}> = ({ mapRegion, safeAreaInsets }) => {
  const activeFogId = useAppSelector((s) => s.graphics.activeFogEffectId);
  const fogEffectConfig = React.useMemo(
    () => GraphicsService.getFogRenderConfig(activeFogId) ?? undefined,
    [activeFogId]
  );
  return (
    <FogImageLayer
      mapRegion={mapRegion}
      {...(safeAreaInsets !== undefined ? { safeAreaInsets } : {})}
      {...(fogEffectConfig !== undefined ? { fogEffectConfig } : {})}
    />
  );
};

/** Map effect overlay wired to active map effect from Redux.
 *
 * PERFORMANCE: Wrapped in React.memo. During panning, fogRegion updates at
 * ~60fps but this overlay only needs to re-render when:
 * - dimensions change (width/height)
 * - user location changes (radar sweep center)
 * - active effect changes (Redux selector handles this internally)
 * Pure panning at constant zoom is skipped.
 */
export const MapEffectOverlayConnected: React.FC<{
  fogRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: SafeAreaInsets;
  currentLocation: GeoPoint | null;
}> = React.memo(
  function MapEffectOverlayConnected({ fogRegion, safeAreaInsets, currentLocation }) {
    const activeMapId = useAppSelector((s) => s.graphics.activeMapEffectId);
    const renderConfig = React.useMemo(
      () => GraphicsService.getMapRenderConfig(activeMapId),
      [activeMapId]
    );

    if (!renderConfig) return null;
    if (!renderConfig.overlayColor && renderConfig.animationType === 'none') return null;

    const userPixel = currentLocation
      ? geoPointToPixel(currentLocation, fogRegion, safeAreaInsets)
      : { x: fogRegion.width / 2, y: fogRegion.height / 2 };

    return (
      <MapEffectOverlay
        width={fogRegion.width}
        height={fogRegion.height}
        userX={userPixel.x}
        userY={userPixel.y}
        renderConfig={renderConfig}
      />
    );
  },
  (prev, next) =>
    // Skip re-render during panning — only re-render when meaningful props change
    prev.fogRegion.width === next.fogRegion.width &&
    prev.fogRegion.height === next.fogRegion.height &&
    prev.currentLocation === next.currentLocation &&
    prev.safeAreaInsets === next.safeAreaInsets &&
    Math.abs(prev.fogRegion.latitudeDelta - next.fogRegion.latitudeDelta) <= 0.0001
);

/** Scent trail wired to active scent effect from Redux.
 *
 * PERFORMANCE: Wrapped in React.memo. The trail needs map position for pixel
 * conversion, but during a pure pan (constant zoom), the trail dots shift
 * linearly. We allow re-renders on zoom change or significant pan shift
 * (>5% of viewport delta) rather than every frame.
 */
export const ScentTrailConnected: React.FC<{
  fogRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: SafeAreaInsets;
}> = React.memo(
  function ScentTrailConnected({ fogRegion, safeAreaInsets }) {
    const activeScentId = useAppSelector((s) => s.graphics.activeScentEffectId);
    const isScentVisible = useAppSelector((s) => s.graphics.isScentVisible);
    const renderConfig = React.useMemo(
      () => GraphicsService.getScentRenderConfig(activeScentId),
      [activeScentId]
    );

    if (!renderConfig || !isScentVisible) return null;

    return (
      <ScentTrail
        mapRegion={fogRegion}
        {...(safeAreaInsets !== undefined ? { safeAreaInsets } : {})}
        renderConfig={renderConfig}
      />
    );
  },
  (prev, next) => {
    // Skip re-render during panning — allow on zoom change or significant pan
    const latShift =
      Math.abs(prev.fogRegion.latitude - next.fogRegion.latitude) / prev.fogRegion.latitudeDelta;
    const lngShift =
      Math.abs(prev.fogRegion.longitude - next.fogRegion.longitude) / prev.fogRegion.longitudeDelta;
    return (
      prev.fogRegion.width === next.fogRegion.width &&
      prev.fogRegion.height === next.fogRegion.height &&
      prev.safeAreaInsets === next.safeAreaInsets &&
      Math.abs(prev.fogRegion.latitudeDelta - next.fogRegion.latitudeDelta) <= 0.0001 &&
      latShift <= 0.05 &&
      lngShift <= 0.05
    );
  }
);
