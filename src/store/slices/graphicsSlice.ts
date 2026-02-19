/**
 * Graphics Slice
 *
 * Manages active graphics effect IDs for each effect kind (fog / map / scent).
 * Effect rendering configs are derived from these IDs via GraphicsService —
 * only the IDs are stored here so the slice stays serialisable.
 *
 * Default IDs:
 *   fog   → 'fog-classic'   (existing behaviour, no visual change)
 *   map   → 'map-none'      (no overlay)
 *   scent → 'scent-dotted'  (simple dotted trail to waypoint)
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { logger } from '../../utils/logger';
import type { EffectKind } from '../../types/graphics';

export interface GraphicsDefinition {
  id: string;
  label: string;
  description: string;
  kind: EffectKind;
  isAnimated: boolean;
}

/**
 * Hard-coded effect catalogue for the settings UI.
 * The actual render configs live in the GraphicsService registry.
 */
export const AVAILABLE_GRAPHICS: GraphicsDefinition[] = [
  // ── Fog effects ────────────────────────────────────────────────────────────
  {
    id: 'fog-classic',
    label: 'Classic',
    description: 'Solid black fog with crisp circular holes',
    kind: 'fog',
    isAnimated: false,
  },
  {
    id: 'fog-vignette',
    label: 'Vignette',
    description: 'Semi-transparent dark fog — map faintly shows through',
    kind: 'fog',
    isAnimated: false,
  },
  {
    id: 'fog-pulse',
    label: 'Pulse',
    description: 'Fog breathes — thickens and thins rhythmically',
    kind: 'fog',
    isAnimated: true,
  },
  {
    id: 'fog-haunted',
    label: 'Haunted',
    description: 'Dark purple fog that shifts between violet hues',
    kind: 'fog',
    isAnimated: true,
  },
  // ── Map effects ────────────────────────────────────────────────────────────
  {
    id: 'map-none',
    label: 'None',
    description: 'No additional map overlay',
    kind: 'map',
    isAnimated: false,
  },
  {
    id: 'map-sepia',
    label: 'Sepia Veil',
    description: 'Subtle warm amber tint over the entire map',
    kind: 'map',
    isAnimated: false,
  },
  {
    id: 'map-heat-glow',
    label: 'Heat Glow',
    description: 'Warm glow pulsing softly across the map',
    kind: 'map',
    isAnimated: true,
  },
  {
    id: 'map-radar',
    label: 'Radar Sweep',
    description: 'Rotating radar arc sweeps across the map',
    kind: 'map',
    isAnimated: true,
  },
  // ── Scent effects ──────────────────────────────────────────────────────────
  {
    id: 'scent-dotted',
    label: 'Dotted Trail',
    description: 'Simple dotted line pointing toward the nearest unexplored street',
    kind: 'scent',
    isAnimated: false,
  },
  {
    id: 'scent-arrows',
    label: 'Arrow Trail',
    description: 'Direction arrows marking the path to the waypoint',
    kind: 'scent',
    isAnimated: false,
  },
  {
    id: 'scent-flowing',
    label: 'Flowing Particles',
    description: 'Particles drift along the scent trail toward the waypoint',
    kind: 'scent',
    isAnimated: true,
  },
  {
    id: 'scent-pulse-wave',
    label: 'Pulse Wave',
    description: 'Expanding rings pulse from the waypoint',
    kind: 'scent',
    isAnimated: true,
  },
];

interface GraphicsState {
  /** ID of the active fog effect. */
  activeFogEffectId: string;
  /** ID of the active map effect. */
  activeMapEffectId: string;
  /** ID of the active scent effect. */
  activeScentEffectId: string;
  /** Whether the scent trail overlay is visible at all. */
  isScentVisible: boolean;
}

const initialState: GraphicsState = {
  activeFogEffectId: 'fog-classic',
  activeMapEffectId: 'map-none',
  activeScentEffectId: 'scent-dotted',
  isScentVisible: true,
};

const graphicsSlice = createSlice({
  name: 'graphics',
  initialState,
  reducers: {
    setFogEffect: (state, action: PayloadAction<string>) => {
      const effectId = action.payload;
      logger.info(`Fog effect changed to: ${effectId}`, {
        component: 'graphicsSlice',
        action: 'setFogEffect',
        previousId: state.activeFogEffectId,
        newId: effectId,
      });
      state.activeFogEffectId = effectId;
    },
    setMapEffect: (state, action: PayloadAction<string>) => {
      const effectId = action.payload;
      logger.info(`Map effect changed to: ${effectId}`, {
        component: 'graphicsSlice',
        action: 'setMapEffect',
        previousId: state.activeMapEffectId,
        newId: effectId,
      });
      state.activeMapEffectId = effectId;
    },
    setScentEffect: (state, action: PayloadAction<string>) => {
      const effectId = action.payload;
      logger.info(`Scent effect changed to: ${effectId}`, {
        component: 'graphicsSlice',
        action: 'setScentEffect',
        previousId: state.activeScentEffectId,
        newId: effectId,
      });
      state.activeScentEffectId = effectId;
    },
    setScentVisible: (state, action: PayloadAction<boolean>) => {
      state.isScentVisible = action.payload;
    },
    resetEffects: (state) => {
      state.activeFogEffectId = initialState.activeFogEffectId;
      state.activeMapEffectId = initialState.activeMapEffectId;
      state.activeScentEffectId = initialState.activeScentEffectId;
      state.isScentVisible = initialState.isScentVisible;
      logger.info('Graphics effects reset to defaults', {
        component: 'graphicsSlice',
        action: 'resetEffects',
      });
    },
  },
});

export const { setFogEffect, setMapEffect, setScentEffect, setScentVisible, resetEffects } =
  graphicsSlice.actions;
export default graphicsSlice.reducer;
