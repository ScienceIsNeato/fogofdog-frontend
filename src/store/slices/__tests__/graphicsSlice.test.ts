import { configureStore } from '@reduxjs/toolkit';
import graphicsReducer, {
  setFogEffect,
  setMapEffect,
  setScentEffect,
  setScentVisible,
  resetEffects,
  AVAILABLE_GRAPHICS,
} from '../graphicsSlice';

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('graphicsSlice', () => {
  const createStore = () =>
    configureStore({
      reducer: { graphics: graphicsReducer },
    });

  describe('initial state', () => {
    it('has fog-classic as activeFogEffectId', () => {
      const store = createStore();
      expect(store.getState().graphics.activeFogEffectId).toBe('fog-classic');
    });

    it('has map-none as activeMapEffectId', () => {
      const store = createStore();
      expect(store.getState().graphics.activeMapEffectId).toBe('map-none');
    });

    it('has scent-dotted as activeScentEffectId', () => {
      const store = createStore();
      expect(store.getState().graphics.activeScentEffectId).toBe('scent-dotted');
    });

    it('has isScentVisible as true', () => {
      const store = createStore();
      expect(store.getState().graphics.isScentVisible).toBe(true);
    });
  });

  describe('setFogEffect', () => {
    it('updates activeFogEffectId', () => {
      const store = createStore();
      store.dispatch(setFogEffect('fog-vignette'));
      expect(store.getState().graphics.activeFogEffectId).toBe('fog-vignette');
    });

    it('accepts all fog effect IDs', () => {
      const store = createStore();
      for (const effect of AVAILABLE_GRAPHICS.filter((g) => g.kind === 'fog')) {
        store.dispatch(setFogEffect(effect.id));
        expect(store.getState().graphics.activeFogEffectId).toBe(effect.id);
      }
    });

    it('does not affect map or scent effect IDs', () => {
      const store = createStore();
      store.dispatch(setFogEffect('fog-pulse'));
      expect(store.getState().graphics.activeMapEffectId).toBe('map-none');
      expect(store.getState().graphics.activeScentEffectId).toBe('scent-dotted');
    });
  });

  describe('setMapEffect', () => {
    it('updates activeMapEffectId', () => {
      const store = createStore();
      store.dispatch(setMapEffect('map-sepia'));
      expect(store.getState().graphics.activeMapEffectId).toBe('map-sepia');
    });

    it('accepts all map effect IDs', () => {
      const store = createStore();
      for (const effect of AVAILABLE_GRAPHICS.filter((g) => g.kind === 'map')) {
        store.dispatch(setMapEffect(effect.id));
        expect(store.getState().graphics.activeMapEffectId).toBe(effect.id);
      }
    });

    it('does not affect fog or scent effect IDs', () => {
      const store = createStore();
      store.dispatch(setMapEffect('map-radar'));
      expect(store.getState().graphics.activeFogEffectId).toBe('fog-classic');
      expect(store.getState().graphics.activeScentEffectId).toBe('scent-dotted');
    });
  });

  describe('setScentEffect', () => {
    it('updates activeScentEffectId', () => {
      const store = createStore();
      store.dispatch(setScentEffect('scent-arrows'));
      expect(store.getState().graphics.activeScentEffectId).toBe('scent-arrows');
    });

    it('accepts all scent effect IDs', () => {
      const store = createStore();
      for (const effect of AVAILABLE_GRAPHICS.filter((g) => g.kind === 'scent')) {
        store.dispatch(setScentEffect(effect.id));
        expect(store.getState().graphics.activeScentEffectId).toBe(effect.id);
      }
    });

    it('does not affect fog or map effect IDs', () => {
      const store = createStore();
      store.dispatch(setScentEffect('scent-flowing'));
      expect(store.getState().graphics.activeFogEffectId).toBe('fog-classic');
      expect(store.getState().graphics.activeMapEffectId).toBe('map-none');
    });
  });

  describe('setScentVisible', () => {
    it('sets isScentVisible to false', () => {
      const store = createStore();
      store.dispatch(setScentVisible(false));
      expect(store.getState().graphics.isScentVisible).toBe(false);
    });

    it('sets isScentVisible back to true', () => {
      const store = createStore();
      store.dispatch(setScentVisible(false));
      store.dispatch(setScentVisible(true));
      expect(store.getState().graphics.isScentVisible).toBe(true);
    });
  });

  describe('resetEffects', () => {
    it('resets all effect IDs to defaults after changes', () => {
      const store = createStore();
      store.dispatch(setFogEffect('fog-haunted'));
      store.dispatch(setMapEffect('map-radar'));
      store.dispatch(setScentEffect('scent-pulse-wave'));
      store.dispatch(setScentVisible(false));

      store.dispatch(resetEffects());

      expect(store.getState().graphics.activeFogEffectId).toBe('fog-classic');
      expect(store.getState().graphics.activeMapEffectId).toBe('map-none');
      expect(store.getState().graphics.activeScentEffectId).toBe('scent-dotted');
      expect(store.getState().graphics.isScentVisible).toBe(true);
    });
  });

  describe('AVAILABLE_GRAPHICS', () => {
    it('contains exactly 12 effects', () => {
      expect(AVAILABLE_GRAPHICS).toHaveLength(12);
    });

    it('contains 4 fog effects', () => {
      const fogEffects = AVAILABLE_GRAPHICS.filter((g) => g.kind === 'fog');
      expect(fogEffects).toHaveLength(4);
    });

    it('contains 4 map effects', () => {
      const mapEffects = AVAILABLE_GRAPHICS.filter((g) => g.kind === 'map');
      expect(mapEffects).toHaveLength(4);
    });

    it('contains 4 scent effects', () => {
      const scentEffects = AVAILABLE_GRAPHICS.filter((g) => g.kind === 'scent');
      expect(scentEffects).toHaveLength(4);
    });

    it('has id, label, description, kind, and isAnimated for every effect', () => {
      for (const effect of AVAILABLE_GRAPHICS) {
        expect(effect.id).toBeTruthy();
        expect(effect.label).toBeTruthy();
        expect(effect.description).toBeTruthy();
        expect(['fog', 'map', 'scent']).toContain(effect.kind);
        expect(typeof effect.isAnimated).toBe('boolean');
      }
    });

    it('includes fog-classic as the default non-animated fog effect', () => {
      const classic = AVAILABLE_GRAPHICS.find((g) => g.id === 'fog-classic');
      expect(classic).toBeDefined();
      expect(classic?.isAnimated).toBe(false);
    });

    it('includes fog-pulse and fog-haunted as animated fog effects', () => {
      const pulse = AVAILABLE_GRAPHICS.find((g) => g.id === 'fog-pulse');
      expect(pulse?.isAnimated).toBe(true);
      const haunted = AVAILABLE_GRAPHICS.find((g) => g.id === 'fog-haunted');
      expect(haunted?.isAnimated).toBe(true);
    });

    it('includes map-none as the default non-animated map effect', () => {
      const none = AVAILABLE_GRAPHICS.find((g) => g.id === 'map-none');
      expect(none).toBeDefined();
      expect(none?.isAnimated).toBe(false);
    });

    it('includes scent-dotted as the default non-animated scent effect', () => {
      const dotted = AVAILABLE_GRAPHICS.find((g) => g.id === 'scent-dotted');
      expect(dotted).toBeDefined();
      expect(dotted?.isAnimated).toBe(false);
    });

    it('has IDs matching their kind prefix', () => {
      for (const effect of AVAILABLE_GRAPHICS) {
        expect(effect.id.startsWith(effect.kind)).toBe(true);
      }
    });
  });
});
