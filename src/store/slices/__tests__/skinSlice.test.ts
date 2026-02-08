import { configureStore } from '@reduxjs/toolkit';
import skinReducer, { setSkin, clearSkin, setInitializing, AVAILABLE_SKINS } from '../skinSlice';
import type { SkinId } from '../skinSlice';

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
  });
});
