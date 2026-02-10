import { configureStore } from '@reduxjs/toolkit';
import skinReducer, {
  setSkin,
  clearSkin,
  setInitializing,
  loadSkinMetadata,
  markSkinDownloaded,
  setError,
  AVAILABLE_SKINS,
} from '../skinSlice';
import type { SkinId, SkinDefinition } from '../skinSlice';

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('skinSlice', () => {
  const store = configureStore({
    reducer: { skin: skinReducer },
  });

  beforeEach(() => {
    store.dispatch(clearSkin());
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('has activeSkin as none', () => {
      expect(store.getState().skin.activeSkin).toBe('none');
    });

    it('has isInitializing as false', () => {
      expect(store.getState().skin.isInitializing).toBe(false);
    });
  });

  describe('setSkin', () => {
    it('sets the active skin to cartoon', () => {
      store.dispatch(setSkin('cartoon'));
      expect(store.getState().skin.activeSkin).toBe('cartoon');
    });

    it('sets the active skin back to none', () => {
      store.dispatch(setSkin('cartoon'));
      store.dispatch(setSkin('none'));
      expect(store.getState().skin.activeSkin).toBe('none');
    });

    it('accepts all valid SkinId values', () => {
      const validSkins: SkinId[] = ['none', 'cartoon'];
      for (const skin of validSkins) {
        store.dispatch(setSkin(skin));
        expect(store.getState().skin.activeSkin).toBe(skin);
      }
    });
  });

  describe('clearSkin', () => {
    it('resets activeSkin to none', () => {
      store.dispatch(setSkin('cartoon'));
      store.dispatch(clearSkin());
      expect(store.getState().skin.activeSkin).toBe('none');
    });
  });

  describe('setInitializing', () => {
    it('sets isInitializing to true', () => {
      store.dispatch(setInitializing(true));
      expect(store.getState().skin.isInitializing).toBe(true);
    });

    it('sets isInitializing to false', () => {
      store.dispatch(setInitializing(true));
      store.dispatch(setInitializing(false));
      expect(store.getState().skin.isInitializing).toBe(false);
    });
  });

  describe('AVAILABLE_SKINS', () => {
    it('contains none skin', () => {
      const noneSkin = AVAILABLE_SKINS.find((s) => s.id === 'none');
      expect(noneSkin).toBeDefined();
      expect(noneSkin?.label).toBe('Standard');
    });

    it('contains cartoon skin', () => {
      const cartoonSkin = AVAILABLE_SKINS.find((s) => s.id === 'cartoon');
      expect(cartoonSkin).toBeDefined();
      expect(cartoonSkin?.label).toBe('Cartoon');
    });

    it('has label and description for all skins', () => {
      for (const skin of AVAILABLE_SKINS) {
        expect(skin.label).toBeTruthy();
        expect(skin.description).toBeTruthy();
      }
    });

    it('has isDownloaded and coverage for all skins', () => {
      for (const skin of AVAILABLE_SKINS) {
        expect(typeof skin.isDownloaded).toBe('boolean');
        expect(['local', 'remote']).toContain(skin.coverage);
      }
    });
  });

  describe('initial state extensions', () => {
    it('has availableSkins populated from AVAILABLE_SKINS', () => {
      expect(store.getState().skin.availableSkins).toEqual(AVAILABLE_SKINS);
    });

    it('has error as null', () => {
      expect(store.getState().skin.error).toBeNull();
    });
  });

  describe('setSkin validation', () => {
    it('sets error when skin is not in availableSkins', () => {
      // Force an unknown skin ID through the type system
      store.dispatch(setSkin('nonexistent' as SkinId));
      expect(store.getState().skin.error).toBe('Skin not found: nonexistent');
      // activeSkin should remain unchanged
      expect(store.getState().skin.activeSkin).toBe('none');
    });

    it('sets error when skin is not downloaded', () => {
      // Load a skin that is not yet downloaded
      const undownloaded: SkinDefinition[] = [
        ...AVAILABLE_SKINS,
        {
          id: 'vintage' as SkinId,
          label: 'Vintage',
          description: 'Sepia tones',
          isDownloaded: false,
          coverage: 'remote',
        },
      ];
      store.dispatch(loadSkinMetadata(undownloaded));
      store.dispatch(setSkin('vintage' as SkinId));
      expect(store.getState().skin.error).toBe('Skin not downloaded: vintage');
      expect(store.getState().skin.activeSkin).toBe('none');
    });

    it('clears error on successful skin set', () => {
      store.dispatch(setError('some previous error'));
      store.dispatch(setSkin('cartoon'));
      expect(store.getState().skin.error).toBeNull();
    });
  });

  describe('loadSkinMetadata', () => {
    it('replaces availableSkins with provided list', () => {
      const custom: SkinDefinition[] = [
        {
          id: 'none',
          label: 'Default',
          description: 'Plain map',
          isDownloaded: true,
          coverage: 'local',
        },
      ];
      store.dispatch(loadSkinMetadata(custom));
      expect(store.getState().skin.availableSkins).toEqual(custom);
    });

    it('clears error on load', () => {
      store.dispatch(setError('stale error'));
      store.dispatch(loadSkinMetadata(AVAILABLE_SKINS));
      expect(store.getState().skin.error).toBeNull();
    });
  });

  describe('markSkinDownloaded', () => {
    it('marks a skin as downloaded', () => {
      const withUndownloaded: SkinDefinition[] = [
        ...AVAILABLE_SKINS,
        {
          id: 'vintage' as SkinId,
          label: 'Vintage',
          description: 'Sepia tones',
          isDownloaded: false,
          coverage: 'remote',
        },
      ];
      store.dispatch(loadSkinMetadata(withUndownloaded));
      store.dispatch(markSkinDownloaded('vintage' as SkinId));
      const vintage = store.getState().skin.availableSkins.find((s) => s.id === ('vintage' as any));
      expect(vintage?.isDownloaded).toBe(true);
    });

    it('does nothing for unknown skin id', () => {
      const before = store.getState().skin.availableSkins;
      store.dispatch(markSkinDownloaded('unknown' as SkinId));
      expect(store.getState().skin.availableSkins).toEqual(before);
    });
  });

  describe('setError', () => {
    it('sets an error message', () => {
      store.dispatch(setError('Something went wrong'));
      expect(store.getState().skin.error).toBe('Something went wrong');
    });

    it('clears error with null', () => {
      store.dispatch(setError('error'));
      store.dispatch(setError(null));
      expect(store.getState().skin.error).toBeNull();
    });
  });

  describe('clearSkin with error state', () => {
    it('clears error when clearing skin', () => {
      store.dispatch(setError('some error'));
      store.dispatch(clearSkin());
      expect(store.getState().skin.error).toBeNull();
    });
  });
});
