/**
 * Built-in fog effects catalogue
 *
 * Each effect is a pure object implementing FogEffect.
 * The getRenderConfig() function returns a FogRenderConfig that
 * FogImageLayer uses to configure its MapLibre FillLayer style and
 * optional animation (opacity pulse, colour tint-cycle).
 *
 * RENDERING CONTEXT: Fog is rendered as a GeoJSON polygon-with-holes via
 * MapLibre's native FillLayer. The ONLY visual tools available are:
 *   - fillColor (solid colour)
 *   - fillOpacity (0–1 transparency)
 *
 * Edge blur, gradients, and shaders are NOT supported — those were Skia
 * concepts from the previous rendering approach. Effects must create
 * visually distinct results using just colour and opacity.
 *
 * Minimum DoD requirement: ≥2 effects (1 static, 1 animated).
 * Delivered: 4 effects (2 static, 2 animated).
 */
import type { FogEffect } from '../types/graphics';

/**
 * Classic — static
 * The original fog behaviour: solid black fog with crisp circular holes.
 * Zero overhead vs baseline; this is the default.
 */
export const fogClassic: FogEffect = {
  id: 'fog-classic',
  name: 'Classic',
  kind: 'fog',
  type: 'static',
  description: 'Solid black fog with crisp circular holes',
  getRenderConfig: () => ({
    fogColor: '#000000',
    fogOpacity: 1.0,
    edgeBlurSigma: 0,
    animationType: 'none',
    animationDuration: 0,
    animationAmplitude: 0,
  }),
};

/**
 * Vignette — static
 * Semi-transparent charcoal fog that lets the underlying map show through
 * faintly. Creates a softer, less oppressive feel than the solid Classic fog.
 * The muted transparency hints at what lies beneath the fog without fully
 * revealing it — like peering through a heavy mist.
 */
export const fogVignette: FogEffect = {
  id: 'fog-vignette',
  name: 'Vignette',
  kind: 'fog',
  type: 'static',
  description: 'Semi-transparent dark fog — map faintly shows through',
  getRenderConfig: () => ({
    fogColor: '#1a1a2e', // dark blue-grey (visibly different from pure black)
    fogOpacity: 0.8, // 80% — map features shimmer through
    edgeBlurSigma: 0,
    animationType: 'none',
    animationDuration: 0,
    animationAmplitude: 0,
  }),
};

/**
 * Pulse — animated
 * Fog opacity oscillates sinusoidally between 0.55 and 0.95.
 * The breathing effect creates a dramatic "fog clearing then thickening"
 * visual that is unmistakable yet comfortable over long sessions.
 * Driven by a ~24fps rAF loop in FogImageLayer that updates the
 * FillLayer fillOpacity style prop.
 */
export const fogPulse: FogEffect = {
  id: 'fog-pulse',
  name: 'Pulse',
  kind: 'fog',
  type: 'animated',
  description: 'Fog breathes — thickens and thins rhythmically',
  getRenderConfig: () => ({
    fogColor: '#0d0d1a', // very dark navy (distinct from pure black)
    fogOpacity: 0.75, // base opacity — animation swings ±0.2 around this
    edgeBlurSigma: 0,
    animationType: 'pulse',
    animationDuration: 3000, // ms per cycle (slower = more atmospheric)
    animationAmplitude: 0.2, // ±20% → opacity range 0.55 – 0.95
  }),
};

/**
 * Haunted — animated
 * A visibly purple fog with a slow, oscillating tint colour blend.
 * FillLayer fillColor cycles between a dark purple base and a brighter
 * violet tint, giving a paranormal atmosphere. The colour shift is large
 * enough to be unmistakable at a glance.
 */
export const fogHaunted: FogEffect = {
  id: 'fog-haunted',
  name: 'Haunted',
  kind: 'fog',
  type: 'animated',
  description: 'Dark purple fog that shifts between violet hues',
  getRenderConfig: () => ({
    fogColor: '#1a0040', // dark purple (clearly NOT black)
    fogOpacity: 0.9,
    edgeBlurSigma: 0,
    tintColor: '#4a0080', // vivid violet — visible tint target
    tintOpacity: 0.35,
    animationType: 'tint-cycle',
    animationDuration: 4000,
    animationAmplitude: 0.6, // 60% blend toward tint — dramatic colour shift
  }),
};

/** All fog effects for bulk registration. */
export const ALL_FOG_EFFECTS: FogEffect[] = [fogClassic, fogVignette, fogPulse, fogHaunted];
