/**
 * Skin Slice
 *
 * Manages the active map skin state. A "skin" replaces the standard Google Maps
 * view with a custom visual style (e.g. cartoon, illustrated) rendered via tile overlays.
 *
 * When no skin is active ('none'), the default Google Maps view is shown through fog holes.
 * When a skin is active, pre-generated styled tiles are rendered instead.
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { logger } from '../../utils/logger';

/**
 * Available skin identifiers.
 * 'none' = standard Google Maps (default)
 * 'cartoon' = flat-color cartoon style with simplified road structure
 */
export type SkinId = 'none' | 'cartoon';

export interface SkinDefinition {
  id: SkinId;
  label: string;
  description: string;
}

export const AVAILABLE_SKINS: SkinDefinition[] = [
  {
    id: 'none',
    label: 'Standard',
    description: 'Default Google Maps view',
  },
  {
    id: 'cartoon',
    label: 'Cartoon',
    description: 'Bold outlines with flat simplified colors',
  },
];

interface SkinState {
  activeSkin: SkinId;
  isInitializing: boolean;
}

const initialState: SkinState = {
  activeSkin: 'none',
  isInitializing: false,
};

const skinSlice = createSlice({
  name: 'skin',
  initialState,
  reducers: {
    setSkin: (state, action: PayloadAction<SkinId>) => {
      const skinId = action.payload;
      logger.info(`Skin changed to: ${skinId}`, {
        component: 'skinSlice',
        action: 'setSkin',
        previousSkin: state.activeSkin,
        newSkin: skinId,
      });
      state.activeSkin = skinId;
    },
    clearSkin: (state) => {
      logger.info('Skin cleared (reset to standard)', {
        component: 'skinSlice',
        action: 'clearSkin',
        previousSkin: state.activeSkin,
      });
      state.activeSkin = 'none';
    },
    setInitializing: (state, action: PayloadAction<boolean>) => {
      state.isInitializing = action.payload;
    },
  },
});

export const { setSkin, clearSkin, setInitializing } = skinSlice.actions;
export default skinSlice.reducer;
