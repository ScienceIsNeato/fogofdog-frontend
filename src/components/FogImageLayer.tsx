/**
 * FogImageLayer — Renders fog as a native MapLibre layer (zero pan/zoom lag)
 *
 * ARCHITECTURE: Instead of rendering fog in a sibling Skia Canvas (which always
 * lags 1-3 frames behind the map due to JS bridge crossings), this component
 * renders the fog mask to an offscreen Skia surface → PNG → MapLibre ImageSource.
 * MapLibre moves the image with its camera natively — same GPU, same frame.
 *
 * REGENERATION STRATEGY:
 *   - The fog image covers OVERSCAN_FACTOR × the viewport in each direction
 *   - Between regenerations, MapLibre handles all pan/zoom transforms natively
 *   - Regeneration triggers: new GPS points, zoom threshold, pan beyond buffer
 *   - Image resolution matches device viewport pixels for sharp rendering
 *
 * RENDERING PIPELINE:
 *   1. useOptimizedFogCalculations → Skia path (same existing logic)
 *   2. Offscreen Skia.Surface.Make(w, h) → draw fog mask → makeImageSnapshot()
 *   3. SkImage.encodeToBase64() → data:image/png;base64,... URI
 *   4. <ImageSource coordinates={geoBounds} url={dataUri}> + <RasterLayer>
 */
import React, { useMemo, useRef, useEffect } from 'react';
import { Skia, PaintStyle, StrokeCap, StrokeJoin, BlendMode } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { useSelector } from 'react-redux';
import { ImageSource, RasterLayer } from '@maplibre/maplibre-react-native';
import type { RootState } from '../store';
import { logger } from '../utils/logger';
import type { MapRegion } from '../types/map';
import { FOG_CONFIG } from '../config/fogConfig';
import { GPSConnectionService } from '../services/GPSConnectionService';
import { PathSimplificationService } from '../utils/pathSimplification';
import type { GeoPoint } from '../types/user';
import type { FogRenderConfig } from '../types/graphics';

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Overscan multiplier: the fog image covers this many times the viewport
 * in each direction. 2.0 means the image is 2× wider and 2× taller than
 * the screen, giving 50% buffer on each side before regeneration is needed.
 */
const OVERSCAN_FACTOR = 2.0;

/**
 * Regeneration trigger: when the viewport center has panned more than this
 * fraction of the image extent from its center, regenerate. With OVERSCAN_FACTOR=2,
 * a threshold of 0.3 means we regenerate when ~30% of the overscan buffer is consumed.
 */
const PAN_REGEN_THRESHOLD = 0.3;

/**
 * Zoom change threshold for regeneration (fraction of latitudeDelta).
 * Prevents regeneration on minor zoom jitter.
 */
const ZOOM_REGEN_THRESHOLD = 0.15;

/**
 * Maximum image dimension in pixels. Caps memory usage on high-res devices.
 * A 1024×1024 PNG at 32bpp = ~4MB uncompressed.
 */
const MAX_IMAGE_DIMENSION = 1024;

// ─── Types ──────────────────────────────────────────────────────────────────

interface FogImageLayerProps {
  /** Current map region (threshold-gated by parent — doesn't change every frame) */
  mapRegion: MapRegion & { width: number; height: number };
  /** Safe area insets for vertical correction */
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number } | undefined;
  /** Optional graphics effect config for custom fog appearance */
  fogEffectConfig?: FogRenderConfig;
}

/** Geographic bounds of the rendered fog image */
interface ImageBounds {
  centerLat: number;
  centerLng: number;
  latDelta: number;
  lngDelta: number;
}

// ─── Offscreen Rendering ────────────────────────────────────────────────────

/** Config for the offscreen fog rendering pass */
interface RenderFogConfig {
  skiaPath: SkPath;
  strokeWidth: number;
  width: number;
  height: number;
  fogColor: string;
  fogOpacity: number;
}

/**
 * Render the fog mask to an offscreen Skia surface and return a base64 PNG URI.
 *
 * The image is RGBA: semi-transparent fog color everywhere, with transparent
 * holes where GPS paths have cleared the fog.
 */
function renderFogToBase64(config: RenderFogConfig): string | null {
  const { skiaPath, strokeWidth, width, height, fogColor, fogOpacity } = config;
  const surface = Skia.Surface.Make(width, height);
  if (!surface) {
    logger.warn('FogImageLayer: failed to create offscreen Skia surface', {
      component: 'FogImageLayer',
      action: 'renderFogToBase64',
      width,
      height,
    });
    return null;
  }

  const canvas = surface.getCanvas();

  // Step 1: Fill entire surface with fog color at desired opacity
  const fogPaint = Skia.Paint();
  fogPaint.setColor(Skia.Color(fogColor));
  fogPaint.setAlphaf(fogOpacity);
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), fogPaint);

  // Step 2: Punch transparent holes where GPS paths are (DstOut blending)
  const pathPaint = Skia.Paint();
  pathPaint.setBlendMode(BlendMode.DstOut);
  pathPaint.setColor(Skia.Color('white'));
  pathPaint.setAlphaf(1.0);
  pathPaint.setStyle(PaintStyle.Stroke);
  pathPaint.setStrokeWidth(strokeWidth);
  pathPaint.setStrokeCap(StrokeCap.Round);
  pathPaint.setStrokeJoin(StrokeJoin.Round);
  canvas.drawPath(skiaPath, pathPaint);

  // Step 3: Snapshot → base64 PNG
  surface.flush();
  const image = surface.makeImageSnapshot();
  const base64 = image.encodeToBase64();

  // Clean up native resources
  image.dispose();
  surface.flush();

  if (!base64) {
    logger.warn('FogImageLayer: encodeToBase64 returned null', {
      component: 'FogImageLayer',
      action: 'renderFogToBase64',
    });
    return null;
  }

  return `data:image/png;base64,${base64}`;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Computes the geographic bounds of the fog image with overscan buffer.
 * Returns null if the image needs regeneration.
 */
function useImageBounds(mapRegion: MapRegion & { width: number; height: number }): ImageBounds {
  const boundsRef = useRef<ImageBounds | null>(null);

  return useMemo(() => {
    const current = boundsRef.current;

    if (current) {
      // Check if we need to regenerate
      const panFractionLat = Math.abs(mapRegion.latitude - current.centerLat) / current.latDelta;
      const panFractionLng = Math.abs(mapRegion.longitude - current.centerLng) / current.lngDelta;
      const zoomFraction =
        Math.abs(mapRegion.latitudeDelta - current.latDelta / OVERSCAN_FACTOR) /
        (current.latDelta / OVERSCAN_FACTOR);

      if (
        panFractionLat < PAN_REGEN_THRESHOLD &&
        panFractionLng < PAN_REGEN_THRESHOLD &&
        zoomFraction < ZOOM_REGEN_THRESHOLD
      ) {
        // Still within buffer — reuse current bounds
        return current;
      }
    }

    // Create new bounds centered on current region with overscan
    const newBounds: ImageBounds = {
      centerLat: mapRegion.latitude,
      centerLng: mapRegion.longitude,
      latDelta: mapRegion.latitudeDelta * OVERSCAN_FACTOR,
      lngDelta: mapRegion.longitudeDelta * OVERSCAN_FACTOR,
    };
    boundsRef.current = newBounds;
    return newBounds;
  }, [mapRegion]);
}

/**
 * Culls GPS points to the image bounds (viewport + overscan).
 */
function cullPointsToImageBounds(points: GeoPoint[], bounds: ImageBounds): GeoPoint[] {
  const halfLat = bounds.latDelta / 2;
  const halfLng = bounds.lngDelta / 2;

  return points.filter(
    (p) =>
      p.latitude <= bounds.centerLat + halfLat &&
      p.latitude >= bounds.centerLat - halfLat &&
      p.longitude <= bounds.centerLng + halfLng &&
      p.longitude >= bounds.centerLng - halfLng
  );
}

/**
 * Convert geoPoint to pixel position within the overscan image.
 * Same math as geoPointToPixel but using image bounds instead of viewport.
 */
function geoPointToImagePixel(
  point: GeoPoint,
  bounds: ImageBounds,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } {
  const x =
    ((point.longitude - (bounds.centerLng - bounds.lngDelta / 2)) / bounds.lngDelta) * imageWidth;
  const y =
    ((bounds.centerLat + bounds.latDelta / 2 - point.latitude) / bounds.latDelta) * imageHeight;
  return { x, y };
}

/**
 * Builds the Skia path for the fog image using GPS points projected into image coordinates.
 */
interface FogImagePathConfig {
  pathPoints: GeoPoint[];
  bounds: ImageBounds;
  imageWidth: number;
  imageHeight: number;
  radiusPixels: number;
}

/** Build Skia path from pixel coords and connected segments */
function buildFogSkiaPath(
  pixelCoords: { point: GeoPoint; pixel: { x: number; y: number } }[],
  connectedSegments: { start: GeoPoint; end: GeoPoint }[],
  radiusPixels: number
): SkPath {
  const path = Skia.Path.Make();
  if (pixelCoords.length === 0) return path;

  const pixelMap = new Map(
    pixelCoords.map((item) => [`${item.point.latitude}-${item.point.longitude}`, item.pixel])
  );

  // Connected segments → smooth stroke chains
  const connectedPointKeys = new Set<string>();
  const segmentData = connectedSegments
    .map((segment) => {
      const startKey = `${segment.start.latitude}-${segment.start.longitude}`;
      const endKey = `${segment.end.latitude}-${segment.end.longitude}`;
      connectedPointKeys.add(startKey);
      connectedPointKeys.add(endKey);
      return { start: pixelMap.get(startKey)!, end: pixelMap.get(endKey)! };
    })
    .filter((seg) => seg.start && seg.end);

  const pathChains = PathSimplificationService.buildPathChains(segmentData);
  const tolerance = Math.max(1, radiusPixels * FOG_CONFIG.SIMPLIFICATION_TOLERANCE_FACTOR);
  const simplifiedChains = pathChains.map((chain) =>
    PathSimplificationService.simplifyPath(chain, tolerance)
  );
  PathSimplificationService.drawSmoothPath(path, simplifiedChains);

  // Isolated points → zero-length strokes (round dots)
  for (const { point, pixel } of pixelCoords) {
    const key = `${point.latitude}-${point.longitude}`;
    if (!connectedPointKeys.has(key)) {
      path.moveTo(pixel.x, pixel.y);
      path.lineTo(pixel.x, pixel.y);
    }
  }

  return path;
}

function useFogImagePath(config: FogImagePathConfig): { skiaPath: SkPath; strokeWidth: number } {
  const { pathPoints, bounds, imageWidth, imageHeight, radiusPixels } = config;

  // Cull to image bounds
  const culledPoints = useMemo(
    () => cullPointsToImageBounds(pathPoints, bounds),
    [pathPoints, bounds]
  );

  // Compute pixel coordinates in image space
  const pixelCoords = useMemo(
    () =>
      culledPoints.map((point) => ({
        point,
        pixel: geoPointToImagePixel(point, bounds, imageWidth, imageHeight),
      })),
    [culledPoints, bounds, imageWidth, imageHeight]
  );

  // Build connected segments
  const connectedSegments = useMemo(() => {
    if (culledPoints.length === 0) return [];
    const processedPoints = GPSConnectionService.processGPSPoints(culledPoints, {
      enableLogging: false,
    });
    return GPSConnectionService.getConnectedSegments(processedPoints);
  }, [culledPoints]);

  // Build Skia path
  const skiaPath = useMemo(
    () => buildFogSkiaPath(pixelCoords, connectedSegments, radiusPixels),
    [connectedSegments, pixelCoords, radiusPixels]
  );

  const strokeWidth = useMemo(() => radiusPixels * 2, [radiusPixels]);

  // Dispose previous paths on change
  const prevPathRef = useRef<SkPath | null>(null);
  useEffect(() => {
    if (prevPathRef.current && prevPathRef.current !== skiaPath) {
      try {
        prevPathRef.current.dispose();
      } catch {
        // Already disposed
      }
    }
    prevPathRef.current = skiaPath;

    return () => {
      try {
        skiaPath.dispose();
      } catch {
        // Already disposed
      }
    };
  }, [skiaPath]);

  return { skiaPath, strokeWidth };
}

/** Compute geographic corner coordinates for ImageSource [lng, lat] format */
type ImageCoords = [[number, number], [number, number], [number, number], [number, number]];

function computeImageCoordinates(bounds: ImageBounds): ImageCoords {
  const halfLat = bounds.latDelta / 2;
  const halfLng = bounds.lngDelta / 2;
  return [
    [bounds.centerLng - halfLng, bounds.centerLat + halfLat], // top-left
    [bounds.centerLng + halfLng, bounds.centerLat + halfLat], // top-right
    [bounds.centerLng + halfLng, bounds.centerLat - halfLat], // bottom-right
    [bounds.centerLng - halfLng, bounds.centerLat - halfLat], // bottom-left
  ];
}

/** Memoized offscreen render → base64 PNG URI */
interface FogImageUriConfig {
  skiaPath: SkPath;
  strokeWidth: number;
  imageWidth: number;
  imageHeight: number;
  fogColor: string;
  fogOpacity: number;
  pointCount: number;
}

function useFogImageUri(config: FogImageUriConfig): string | null {
  const { skiaPath, strokeWidth, imageWidth, imageHeight, fogColor, fogOpacity, pointCount } =
    config;

  return useMemo(() => {
    if (!imageWidth || !imageHeight) return null;
    const startTime = performance.now();
    const uri = renderFogToBase64({
      skiaPath,
      strokeWidth,
      width: imageWidth,
      height: imageHeight,
      fogColor,
      fogOpacity,
    });
    const elapsed = performance.now() - startTime;
    if (elapsed > 16) {
      logger.debug(
        `FogImageLayer: offscreen render took ${elapsed.toFixed(1)}ms (${imageWidth}×${imageHeight})`,
        {
          component: 'FogImageLayer',
          action: 'renderFogToBase64',
          renderTimeMs: elapsed,
          width: imageWidth,
          height: imageHeight,
          pointCount,
        }
      );
    }
    return uri;
  }, [skiaPath, strokeWidth, imageWidth, imageHeight, fogColor, fogOpacity, pointCount]);
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * FogImageLayer renders fog as a native MapLibre ImageSource + RasterLayer.
 *
 * Must be rendered as a CHILD of <MapView> so MapLibre handles all
 * pan/zoom transforms natively with zero lag.
 */
const FogImageLayer: React.FC<FogImageLayerProps> = ({
  mapRegion,
  safeAreaInsets: _safeAreaInsets,
  fogEffectConfig,
}) => {
  // Compute image bounds with overscan (only changes on threshold)
  const imageBounds = useImageBounds(mapRegion);

  // Image dimensions: match viewport pixels, capped at MAX_IMAGE_DIMENSION
  const { imageWidth, imageHeight } = useMemo(() => {
    if (!mapRegion.width || !mapRegion.height) return { imageWidth: 0, imageHeight: 0 };
    const w = Math.min(Math.round(mapRegion.width), MAX_IMAGE_DIMENSION);
    const h = Math.min(Math.round(mapRegion.height), MAX_IMAGE_DIMENSION);
    return { imageWidth: w, imageHeight: h };
  }, [mapRegion.width, mapRegion.height]);

  // Calculate radius in image pixels (accounts for overscan scaling)
  const radiusPixels = useMemo(() => {
    if (!imageWidth || !imageHeight) return 0;
    const metersPerPixelLat = (imageBounds.latDelta * 111320) / imageHeight;
    const metersPerPixelLng =
      (imageBounds.lngDelta * 111320 * Math.cos((imageBounds.centerLat * Math.PI) / 180)) /
      imageWidth;
    const metersPerPixel = (metersPerPixelLat + metersPerPixelLng) / 2;
    return FOG_CONFIG.RADIUS_METERS / metersPerPixel;
  }, [imageBounds, imageWidth, imageHeight]);

  // GPS points from Redux
  const pathPoints = useSelector((state: RootState) => state.exploration.path);

  // Build Skia path in image coordinates
  const { skiaPath, strokeWidth } = useFogImagePath({
    pathPoints,
    bounds: imageBounds,
    imageWidth,
    imageHeight,
    radiusPixels,
  });

  // Fog appearance
  const fogColor = fogEffectConfig?.fogColor ?? FOG_CONFIG.COLOR;
  const fogOpacity = fogEffectConfig?.fogOpacity ?? FOG_CONFIG.OPACITY;

  // Render offscreen → base64 PNG (memoized on all inputs)
  const imageUri = useFogImageUri({
    skiaPath,
    strokeWidth,
    imageWidth,
    imageHeight,
    fogColor,
    fogOpacity,
    pointCount: pathPoints.length,
  });

  // Geographic corner coordinates for ImageSource [lng, lat] format:
  // [topLeft, topRight, bottomRight, bottomLeft]
  const coordinates = useMemo(() => computeImageCoordinates(imageBounds), [imageBounds]);

  if (!imageUri) {
    return null;
  }

  return (
    <ImageSource id="fog-image-source" url={imageUri} coordinates={coordinates}>
      <RasterLayer id="fog-raster-layer" style={{ rasterOpacity: 1.0 }} layerIndex={999} />
    </ImageSource>
  );
};

export default React.memo(FogImageLayer);
