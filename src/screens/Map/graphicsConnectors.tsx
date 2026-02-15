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
import OptimizedFogOverlay from '../../components/OptimizedFogOverlay';
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

/** Fog overlay wired to active fog effect from Redux. */
export const FogOverlayConnected: React.FC<{
  mapRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: SafeAreaInsets;
}> = ({ mapRegion, safeAreaInsets }) => {
  const activeFogId = useAppSelector((s) => s.graphics.activeFogEffectId);
  const fogEffectConfig = React.useMemo(
    () => GraphicsService.getFogRenderConfig(activeFogId) ?? undefined,
    [activeFogId]
  );
  return (
    <OptimizedFogOverlay
      mapRegion={mapRegion}
      {...(safeAreaInsets !== undefined ? { safeAreaInsets } : {})}
      {...(fogEffectConfig !== undefined ? { fogEffectConfig } : {})}
    />
  );
};

/** Map effect overlay wired to active map effect from Redux. */
export const MapEffectOverlayConnected: React.FC<{
  fogRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: SafeAreaInsets;
  currentLocation: GeoPoint | null;
}> = ({ fogRegion, safeAreaInsets, currentLocation }) => {
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
};

/** Scent trail wired to active scent effect from Redux. */
export const ScentTrailConnected: React.FC<{
  fogRegion: MapRegion & { width: number; height: number };
  safeAreaInsets?: SafeAreaInsets;
}> = ({ fogRegion, safeAreaInsets }) => {
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
};
