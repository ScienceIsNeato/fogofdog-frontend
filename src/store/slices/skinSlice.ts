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
 *
 * Extend this union type when adding new skins.
 */
export type SkinId = 'none' | 'cartoon';

/**
 * Metadata for a single skin variant.
 * Designed to scale — future skins may be downloaded on-demand
 * or fetched from a remote API.
 */
export interface SkinDefinition {
  id: SkinId;
  label: string;
  description: string;
  /** Whether tile assets are available locally (bundled or previously downloaded) */
  isDownloaded: boolean;
  /** 'local' = bundled in app assets, 'remote' = fetched from server (future) */
  coverage: 'local' | 'remote';
}

/**
 * Hard-coded skin registry for MVP.
 * Future: populated dynamically via loadSkinMetadata() from API or manifest.
 */
export const AVAILABLE_SKINS: SkinDefinition[] = [
  {
    id: 'none',
    label: 'Standard',
    description: 'Default Google Maps view',
    isDownloaded: true,
    coverage: 'local',
  },
  {
    id: 'cartoon',
    label: 'Cartoon',
    description: 'Bold outlines with flat simplified colors',
    isDownloaded: true,
    coverage: 'local',
  },
];

interface SkinState {
  activeSkin: SkinId;
  isInitializing: boolean;
  /** Dynamically populated list of available skins (defaults to AVAILABLE_SKINS) */
  availableSkins: SkinDefinition[];
  /** User-facing error message (null = no error) */
  error: string | null;
}

const initialState: SkinState = {
  activeSkin: 'none',
  isInitializing: false,
  availableSkins: AVAILABLE_SKINS,
  error: null,
};

const skinSlice = createSlice({
  name: 'skin',
  initialState,
  reducers: {
    setSkin: (state, action: PayloadAction<SkinId>) => {
      const skinId = action.payload;

      // Verify skin exists in available skins (skip for 'none')
      if (skinId !== 'none') {
        const skin = state.availableSkins.find((s) => s.id === skinId);
        if (!skin) {
          state.error = `Skin not found: ${skinId}`;
          return;
        }
        if (!skin.isDownloaded) {
          state.error = `Skin not downloaded: ${skinId}`;
          return;
        }
      }

      logger.info(`Skin changed to: ${skinId}`, {
        component: 'skinSlice',
        action: 'setSkin',
        previousSkin: state.activeSkin,
        newSkin: skinId,
      });
      state.activeSkin = skinId;
      state.error = null;
    },
    clearSkin: (state) => {
      logger.info('Skin cleared (reset to standard)', {
        component: 'skinSlice',
        action: 'clearSkin',
        previousSkin: state.activeSkin,
      });
      state.activeSkin = 'none';
      state.error = null;
    },
    setInitializing: (state, action: PayloadAction<boolean>) => {
      state.isInitializing = action.payload;
    },
    /**
     * Replace the available skins list (e.g. from API response or manifest).
     * Future: called during app initialization when skin catalog is fetched.
     */
    loadSkinMetadata: (state, action: PayloadAction<SkinDefinition[]>) => {
      state.availableSkins = action.payload;
      state.error = null;
      logger.info(`Loaded ${action.payload.length} available skins`, {
        component: 'skinSlice',
        action: 'loadSkinMetadata',
        count: action.payload.length,
        skins: action.payload.map((s) => s.id),
      });
    },
    /**
     * Mark a skin as downloaded (e.g. after on-demand tile download completes).
     */
    markSkinDownloaded: (state, action: PayloadAction<SkinId>) => {
      const skin = state.availableSkins.find((s) => s.id === action.payload);
      if (skin) {
        skin.isDownloaded = true;
        logger.info(`Marked skin as downloaded: ${skin.label}`, {
          component: 'skinSlice',
          action: 'markSkinDownloaded',
          skinId: action.payload,
        });
      }
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  setSkin,
  clearSkin,
  setInitializing,
  loadSkinMetadata,
  markSkinDownloaded,
  setError,
} = skinSlice.actions;
export default skinSlice.reducer;
