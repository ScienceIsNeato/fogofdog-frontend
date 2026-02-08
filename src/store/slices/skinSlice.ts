import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { logger } from '../../utils/logger';

export interface Skin {
  id: string;
  name: string;
  description: string;
  previewImage: string;
  isDownloaded: boolean;
  coverage: 'local' | 'global'; // local = bundled assets, global = server-generated
}

interface SkinState {
  activeSkin: string | null; // ID of currently active skin, or null for base map
  availableSkins: Skin[];
  isLoading: boolean;
  error: string | null;
}

const initialState: SkinState = {
  activeSkin: null,
  availableSkins: [],
  isLoading: false,
  error: null,
};

const skinSlice = createSlice({
  name: 'skin',
  initialState,
  reducers: {
    reset: () => initialState,

    setActiveSkin: (state, action: PayloadAction<string | null>) => {
      const skinId = action.payload;

      if (skinId === null) {
        state.activeSkin = null;
        logger.info('Cleared active skin - showing base map', {
          component: 'skinSlice',
          action: 'setActiveSkin',
        });
        return;
      }

      // Verify skin exists in available skins
      const skin = state.availableSkins.find((s) => s.id === skinId);
      if (!skin) {
        state.error = `Skin not found: ${skinId}`;
        return;
      }

      if (!skin.isDownloaded) {
        state.error = `Skin not downloaded: ${skinId}`;
        return;
      }

      state.activeSkin = skinId;
      state.error = null;
      logger.info(`Activated skin: ${skin.name}`, {
        component: 'skinSlice',
        action: 'setActiveSkin',
        skinId,
        skinName: skin.name,
      });
    },

    clearActiveSkin: (state) => {
      const previousSkin = state.activeSkin;
      state.activeSkin = null;
      logger.info('Cleared active skin', {
        component: 'skinSlice',
        action: 'clearActiveSkin',
        previousSkin,
      });
    },

    loadSkinMetadata: (state, action: PayloadAction<Skin[]>) => {
      state.availableSkins = action.payload;
      state.error = null;
      logger.info(`Loaded ${action.payload.length} available skins`, {
        component: 'skinSlice',
        action: 'loadSkinMetadata',
        count: action.payload.length,
        skins: action.payload.map((s) => s.id),
      });
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      // Don't log user-facing errors - they're expected and handled
    },

    markSkinDownloaded: (state, action: PayloadAction<string>) => {
      const skinId = action.payload;
      const skin = state.availableSkins.find((s) => s.id === skinId);
      if (skin) {
        skin.isDownloaded = true;
        logger.info(`Marked skin as downloaded: ${skin.name}`, {
          component: 'skinSlice',
          action: 'markSkinDownloaded',
          skinId,
        });
      }
    },
  },
});

export const {
  reset,
  setActiveSkin,
  clearActiveSkin,
  loadSkinMetadata,
  setLoading,
  setError,
  markSkinDownloaded,
} = skinSlice.actions;

export default skinSlice.reducer;
