/**
 * Graphics Layer Type Contracts
 *
 * Defines the effect type system used by GraphicsService.
 * Effects are categorised by kind (fog / map / scent) and type (static / animated).
 *
 * Rendering components read the active effect from Redux (via graphicsSlice),
 * retrieve its render-config from GraphicsService, and apply it to their
 * Skia canvas.  No rendering code lives in this file — pure contracts only.
 */

// ─── Core discriminators ──────────────────────────────────────────────────────

/** Which layer the effect targets. */
export type EffectKind = 'fog' | 'map' | 'scent';

/** Whether the effect is time-invariant or animated. */
export type EffectType = 'static' | 'animated';

// ─── Base ─────────────────────────────────────────────────────────────────────

/** Shared metadata present on every effect. */
export interface GraphicsEffect {
  id: string;
  name: string;
  kind: EffectKind;
  type: EffectType;
  description: string;
}

// ─── Fog effects ─────────────────────────────────────────────────────────────

/**
 * Configuration passed to OptimizedFogOverlay when a fog effect is active.
 * The FogImageLayer uses these values to configure its MapLibre FillLayer
 * style and optional animation (opacity pulse, colour tint-cycle).
 */
export interface FogRenderConfig {
  /** Fog rectangle fill colour (CSS colour string). Default: 'black'. */
  fogColor: string;
  /** Fog rectangle opacity 0–1. Default: 1. */
  fogOpacity: number;
  /**
   * Blur sigma applied to the mask path via MaskFilter.
   * 0 = hard-edge circles (default), >0 = soft vignette fade.
   */
  edgeBlurSigma: number;
  /**
   * Tint colour rendered as a Rect inside the fog Canvas at reduced opacity.
   * Undefined = no tint.
   */
  tintColor?: string;
  /** Opacity of the tint rect 0–1. Ignored when tintColor is undefined. */
  tintOpacity?: number;
  /** Animation type applied to the fog holes. 'none' = static. */
  animationType: 'none' | 'pulse' | 'tint-cycle';
  /** Duration of one animation cycle in ms. */
  animationDuration: number;
  /** Amplitude of animated property change (0–1). E.g. 0.12 = ±12% radius pulse. */
  animationAmplitude: number;
}

export interface FogEffect extends GraphicsEffect {
  kind: 'fog';
  getRenderConfig: () => FogRenderConfig;
}

// ─── Map effects ──────────────────────────────────────────────────────────────

/**
 * Configuration passed to MapEffectOverlay.
 * Describes an optional colour/animation overlay drawn between the map tiles
 * and the fog canvas.
 */
export interface MapRenderConfig {
  /**
   * Solid colour rect tint over the full map surface.
   * Undefined or 'transparent' = no rect (zero-cost path).
   */
  overlayColor?: string;
  /** Opacity of the rect tint 0–1. */
  overlayOpacity: number;
  /** Animation type. 'none' = static tint (or no overlay). */
  animationType: 'none' | 'pulse' | 'radar';
  /** Duration of one animation cycle in ms. */
  animationDuration: number;
}

export interface MapEffect extends GraphicsEffect {
  kind: 'map';
  getRenderConfig: () => MapRenderConfig;
}

// ─── Scent effects ────────────────────────────────────────────────────────────

/**
 * Visual style for the scent trail path drawn by ScentTrail.
 *
 * 'dotted'     — dashed line with round caps
 * 'arrows'     — triangle markers at fixed intervals along the path
 * 'flowing'    — animated dots that shift forward along the path
 * 'pulse-wave' — expanding rings at the waypoint endpoint
 */
export type ScentTrailStyle = 'dotted' | 'arrows' | 'flowing' | 'pulse-wave';

/**
 * Configuration passed to ScentTrail.
 * Describes how to render the path from the user's position to the nearest
 * unexplored waypoint.
 */
export interface ScentRenderConfig {
  /** CSS colour string for the trail. */
  trailColor: string;
  /** Stroke width in pixels. */
  trailWidth: number;
  /** Visual style of the trail path. */
  trailStyle: ScentTrailStyle;
  /** Whether to render a marker circle at the waypoint endpoint. */
  showEndpoint: boolean;
  /** Animation type. 'none' = static. */
  animationType: 'none' | 'flow' | 'pulse';
  /** Duration of one animation cycle in ms. */
  animationDuration: number;
  /** Number of moving particles when animationType is 'flow'. */
  particleCount: number;
}

export interface ScentEffect extends GraphicsEffect {
  kind: 'scent';
  getRenderConfig: () => ScentRenderConfig;
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type AnyGraphicsEffect = FogEffect | MapEffect | ScentEffect;

// ─── Render context passed to overlays ───────────────────────────────────────

/** Pixel-space dimensions of the Skia canvas. */
export interface CanvasDimensions {
  width: number;
  height: number;
}
