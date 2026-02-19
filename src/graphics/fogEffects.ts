/**
 * Built-in fog effects catalogue
 *
 * Each effect is a pure object implementing FogEffect.
 * The getRenderConfig() function returns a FogRenderConfig that
 * FogImageLayer uses to configure its MapLibre FillLayer style and
 * optional animation (opacity pulse, colour tint-cycle).
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
    fogColor: 'black',
    fogOpacity: 1.0,
    edgeBlurSigma: 0,
    animationType: 'none',
    animationDuration: 0,
    animationAmplitude: 0,
  }),
};

/**
 * Vignette — static
 * Softens the boundary between explored and unexplored space using a
 * Skia MaskFilter blur (edgeBlurSigma > 0).  The fog holes fade out
 * at their edges rather than ending abruptly.
 */
export const fogVignette: FogEffect = {
  id: 'fog-vignette',
  name: 'Vignette',
  kind: 'fog',
  type: 'static',
  description: 'Black fog with softened, blurred edges around revealed areas',
  getRenderConfig: () => ({
    fogColor: 'black',
    fogOpacity: 1.0,
    edgeBlurSigma: 8, // pixels — applied to mask path via MaskFilter
    animationType: 'none',
    animationDuration: 0,
    animationAmplitude: 0,
  }),
};

/**
 * Pulse — animated
 * Fog opacity oscillates sinusoidally at ±12% around the base value.
 * The breathing effect is subtle so it is comfortable over long sessions
 * without causing motion sickness. Driven by a ~24fps rAF loop in
 * FogImageLayer that updates the FillLayer fillOpacity style prop.
 */
export const fogPulse: FogEffect = {
  id: 'fog-pulse',
  name: 'Pulse',
  kind: 'fog',
  type: 'animated',
  description: 'Fog holes breathe in and out rhythmically',
  getRenderConfig: () => ({
    fogColor: 'black',
    fogOpacity: 1.0,
    edgeBlurSigma: 3,
    animationType: 'pulse',
    animationDuration: 2400, // ms per cycle
    animationAmplitude: 0.12, // ±12% of computed stroke width
  }),
};

/**
 * Haunted — animated
 * A deep indigo fog with a slow, oscillating tint colour blend.
 * FillLayer fillColor cycles between the base indigo and a violet tint,
 * giving a paranormal atmosphere.
 */
export const fogHaunted: FogEffect = {
  id: 'fog-haunted',
  name: 'Haunted',
  kind: 'fog',
  type: 'animated',
  description: 'Deep indigo fog that pulses with an eerie tint',
  getRenderConfig: () => ({
    fogColor: '#0a0020', // near-black deep indigo
    fogOpacity: 1.0,
    edgeBlurSigma: 5,
    tintColor: '#1a0050', // deep violet tint rect
    tintOpacity: 0.35,
    animationType: 'tint-cycle',
    animationDuration: 4000,
    animationAmplitude: 0.2,
  }),
};

/** All fog effects for bulk registration. */
export const ALL_FOG_EFFECTS: FogEffect[] = [fogClassic, fogVignette, fogPulse, fogHaunted];
