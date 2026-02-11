/**
 * Built-in map effects catalogue
 *
 * Each effect is a pure object implementing MapEffect.
 * The getRenderConfig() function returns a MapRenderConfig that
 * MapEffectOverlay uses to render its Skia canvas.
 *
 * Minimum DoD requirement: ≥2 effects (1 static, 1 animated).
 * Delivered: 4 effects (2 static, 2 animated).
 */
import type { MapEffect } from '../types/graphics';

/**
 * None — static
 * No overlay.  MapEffectOverlay renders nothing when this effect is active,
 * meaning zero GPU work above the baseline.  This is the default.
 */
export const mapNone: MapEffect = {
  id: 'map-none',
  name: 'None',
  kind: 'map',
  type: 'static',
  description: 'No additional map overlay',
  getRenderConfig: () => ({
    overlayOpacity: 0,
    animationType: 'none',
    animationDuration: 0,
  }),
};

/**
 * Sepia Veil — static
 * A warm amber tint at low opacity (≈12%) applied uniformly over the entire
 * map surface.  Evokes vintage maps; works well with the "cartoon" skin.
 */
export const mapSepia: MapEffect = {
  id: 'map-sepia',
  name: 'Sepia Veil',
  kind: 'map',
  type: 'static',
  description: 'Subtle warm amber tint over the entire map',
  getRenderConfig: () => ({
    overlayColor: '#c8820a', // warm amber
    overlayOpacity: 0.12,
    animationType: 'none',
    animationDuration: 0,
  }),
};

/**
 * Heat Glow — animated
 * A warm orange glow that pulses softly across the whole map canvas,
 * simulating the thermal "heat" of recently explored territory.
 * Amplitude is kept gentle so it does not distract from navigation.
 */
export const mapHeatGlow: MapEffect = {
  id: 'map-heat-glow',
  name: 'Heat Glow',
  kind: 'map',
  type: 'animated',
  description: 'Warm glow pulsing softly across the map',
  getRenderConfig: () => ({
    overlayColor: '#ff6a00',
    overlayOpacity: 0.08, // base opacity; pulse adds up to +0.08 on top
    animationType: 'pulse',
    animationDuration: 3000,
  }),
};

/**
 * Radar Sweep — animated
 * A rotating arc overlay that sweeps 360° like a radar screen.
 * The arc originates from the user's current position and fades
 * along its trailing edge for a classic radar phosphor look.
 */
export const mapRadar: MapEffect = {
  id: 'map-radar',
  name: 'Radar Sweep',
  kind: 'map',
  type: 'animated',
  description: 'Rotating radar arc sweeps across the map',
  getRenderConfig: () => ({
    overlayColor: '#00ff41', // phosphor green
    overlayOpacity: 0.18,
    animationType: 'radar',
    animationDuration: 3500, // ms per full revolution
  }),
};

/** All map effects for bulk registration. */
export const ALL_MAP_EFFECTS: MapEffect[] = [mapNone, mapSepia, mapHeatGlow, mapRadar];
