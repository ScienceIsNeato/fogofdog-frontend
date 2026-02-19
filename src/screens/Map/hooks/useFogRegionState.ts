/**
 * Fog region state management hook.
 * Gates React state updates via threshold checks so the FogImageLayer only
 * recomputes GeoJSON polygons when zoom/extent/dimensions change significantly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRegion } from '../../../types/map';
import type { GeoPoint } from '../../../types/user';
import { DEFAULT_ZOOM_DELTAS } from '../utils/mapCamera';

/**
 * Custom hook for fog region initialization and management.
 *
 * ARCHITECTURE: The fog is rendered via a GeoJSON-driven pipeline using
 * a MapLibre ShapeSource + FillLayer stack. MapLibre still handles all
 * pan/zoom transforms natively with zero lag; we do not drive per-frame
 * updates from React. This hook gates React state updates via threshold
 * checks so the FogImageLayer only recomputes and pushes new GeoJSON
 * polygons when the effective fog region (zoom/extent/dimensions) changes
 * enough to matter.
 */
export const useFogRegionState = (
  currentLocation: GeoPoint | null,
  mapDimensions: { width: number; height: number },
  currentRegion: MapRegion | undefined
) => {
  // Threshold ref: only update React state on zoom/buffer/dimension changes
  const computeRegionRef = useRef<(MapRegion & { width: number; height: number }) | undefined>(
    undefined
  );

  // Initialize worklet-based map region for immediate synchronization
  const initialWorkletRegion = useMemo(() => {
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta,
        longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
        width: mapDimensions.width,
        height: mapDimensions.height,
      };
    }
    return undefined;
  }, [currentLocation, mapDimensions]);

  // Fog region state for FogImageLayer — only updates on threshold changes
  const [currentFogRegion, setCurrentFogRegion] = useState<
    (MapRegion & { width: number; height: number }) | undefined
  >(undefined);

  // Memoized map region with worklet support
  const memoizedMapRegion = useMemo(() => {
    if (!currentRegion) return undefined;

    return {
      ...currentRegion,
      width: mapDimensions.width,
      height: mapDimensions.height,
    };
  }, [currentRegion, mapDimensions]);

  // Initialize currentFogRegion when memoizedMapRegion is first available
  useEffect(() => {
    if (memoizedMapRegion && !currentFogRegion) {
      setCurrentFogRegion(memoizedMapRegion);
    }
  }, [memoizedMapRegion, currentFogRegion]);

  // Also initialize currentFogRegion from initialWorkletRegion if available
  useEffect(() => {
    if (initialWorkletRegion && !currentFogRegion && !memoizedMapRegion) {
      setCurrentFogRegion(initialWorkletRegion);
    }
  }, [initialWorkletRegion, currentFogRegion, memoizedMapRegion]);

  // Threshold-gated state update: only triggers FogImageLayer regeneration
  // for significant changes (zoom >2%, pan >40% viewport, dimension change).
  const updateFogRegion = useCallback((region: MapRegion & { width: number; height: number }) => {
    // First region? Initialize React state + compute ref
    const prev = computeRegionRef.current;
    if (!prev) {
      computeRegionRef.current = region;
      setCurrentFogRegion(region);
      return;
    }

    // Threshold check: only trigger React re-render for significant changes
    const zoomChanged =
      Math.abs(prev.latitudeDelta - region.latitudeDelta) / prev.latitudeDelta > 0.02 ||
      Math.abs(prev.longitudeDelta - region.longitudeDelta) / prev.longitudeDelta > 0.02;

    const latShift = Math.abs(region.latitude - prev.latitude) / prev.latitudeDelta;
    const lngShift = Math.abs(region.longitude - prev.longitude) / prev.longitudeDelta;
    const beyondBuffer = latShift > 0.4 || lngShift > 0.4;

    const dimensionsChanged = prev.width !== region.width || prev.height !== region.height;

    if (zoomChanged || beyondBuffer || dimensionsChanged) {
      computeRegionRef.current = region;
      setCurrentFogRegion(region);
    }
  }, []);

  return {
    currentFogRegion,
    setCurrentFogRegion,
    memoizedMapRegion,
    updateFogRegion,
  };
};
