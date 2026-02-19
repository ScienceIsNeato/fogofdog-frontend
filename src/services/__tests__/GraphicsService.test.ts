/**
 * GraphicsService — TDD test suite
 *
 * Tests are written before the implementation (red-green-refactor cycle).
 * Each describe block targets one public method of GraphicsService.
 */
import { GraphicsService } from '../GraphicsService';
import type { FogEffect, MapEffect, ScentEffect } from '../../types/graphics';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const makeFogEffect = (id: string): FogEffect => ({
  id,
  name: `Fog ${id}`,
  kind: 'fog',
  type: 'static',
  description: `Test fog effect ${id}`,
  getRenderConfig: () => ({
    fogColor: 'black',
    fogOpacity: 1.0,
    edgeBlurSigma: 0,
    animationType: 'none',
    animationDuration: 0,
    animationAmplitude: 0,
  }),
});

const makeMapEffect = (id: string): MapEffect => ({
  id,
  name: `Map ${id}`,
  kind: 'map',
  type: 'static',
  description: `Test map effect ${id}`,
  getRenderConfig: () => ({
    overlayOpacity: 0,
    animationType: 'none',
    animationDuration: 0,
  }),
});

const makeScentEffect = (id: string): ScentEffect => ({
  id,
  name: `Scent ${id}`,
  kind: 'scent',
  type: 'animated',
  description: `Test scent effect ${id}`,
  getRenderConfig: () => ({
    trailColor: '#5AC8FA',
    trailWidth: 3,
    trailStyle: 'dotted',
    showEndpoint: true,
    animationType: 'none',
    animationDuration: 1500,
    particleCount: 6,
  }),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GraphicsService', () => {
  beforeEach(() => {
    // Each test gets a fresh registry
    GraphicsService.dispose();
  });

  // ── registerEffect ──────────────────────────────────────────────────────────

  describe('registerEffect', () => {
    it('registers a fog effect and makes it retrievable', () => {
      const effect = makeFogEffect('fog-a');
      GraphicsService.registerEffect(effect);
      const retrieved = GraphicsService.getEffectById('fog-a');
      expect(retrieved).toBe(effect);
    });

    it('registers a map effect', () => {
      const effect = makeMapEffect('map-a');
      GraphicsService.registerEffect(effect);
      expect(GraphicsService.getEffectById('map-a')).toBe(effect);
    });

    it('registers a scent effect', () => {
      const effect = makeScentEffect('scent-a');
      GraphicsService.registerEffect(effect);
      expect(GraphicsService.getEffectById('scent-a')).toBe(effect);
    });

    it('overwrites an effect registered with the same id', () => {
      const first = makeFogEffect('dup');
      const second: FogEffect = { ...makeFogEffect('dup'), name: 'Replaced' };
      GraphicsService.registerEffect(first);
      GraphicsService.registerEffect(second);
      expect(GraphicsService.getEffectById('dup')!.name).toBe('Replaced');
    });

    it('can register multiple effects of different kinds', () => {
      GraphicsService.registerEffect(makeFogEffect('fog-1'));
      GraphicsService.registerEffect(makeMapEffect('map-1'));
      GraphicsService.registerEffect(makeScentEffect('scent-1'));
      expect(GraphicsService.getAllEffects()).toHaveLength(3);
    });
  });

  // ── getEffectsByKind ────────────────────────────────────────────────────────

  describe('getEffectsByKind', () => {
    beforeEach(() => {
      GraphicsService.registerEffect(makeFogEffect('fog-1'));
      GraphicsService.registerEffect(makeFogEffect('fog-2'));
      GraphicsService.registerEffect(makeMapEffect('map-1'));
      GraphicsService.registerEffect(makeScentEffect('scent-1'));
    });

    it('returns only fog effects', () => {
      const effects = GraphicsService.getEffectsByKind('fog');
      expect(effects).toHaveLength(2);
      expect(effects.every((e) => e.kind === 'fog')).toBe(true);
    });

    it('returns only map effects', () => {
      const effects = GraphicsService.getEffectsByKind('map');
      expect(effects).toHaveLength(1);
      expect(effects[0]!.kind).toBe('map');
    });

    it('returns only scent effects', () => {
      const effects = GraphicsService.getEffectsByKind('scent');
      expect(effects).toHaveLength(1);
      expect(effects[0]!.kind).toBe('scent');
    });

    it('returns empty array when no effects of that kind are registered', () => {
      GraphicsService.dispose();
      GraphicsService.registerEffect(makeFogEffect('fog-only'));
      expect(GraphicsService.getEffectsByKind('scent')).toHaveLength(0);
    });
  });

  // ── activateEffect / deactivateEffect / getActiveEffect ────────────────────

  describe('activateEffect', () => {
    beforeEach(() => {
      GraphicsService.registerEffect(makeFogEffect('fog-classic'));
      GraphicsService.registerEffect(makeFogEffect('fog-pulse'));
      GraphicsService.registerEffect(makeMapEffect('map-none'));
    });

    it('sets the active effect for a given kind', () => {
      GraphicsService.activateEffect('fog', 'fog-classic');
      expect(GraphicsService.getActiveEffect('fog')!.id).toBe('fog-classic');
    });

    it('replaces the previously active effect for the same kind', () => {
      GraphicsService.activateEffect('fog', 'fog-classic');
      GraphicsService.activateEffect('fog', 'fog-pulse');
      expect(GraphicsService.getActiveEffect('fog')!.id).toBe('fog-pulse');
    });

    it('does not affect active effects of other kinds', () => {
      GraphicsService.activateEffect('fog', 'fog-classic');
      GraphicsService.activateEffect('map', 'map-none');
      expect(GraphicsService.getActiveEffect('fog')!.id).toBe('fog-classic');
      expect(GraphicsService.getActiveEffect('map')!.id).toBe('map-none');
    });

    it('throws when activating an effect that is not registered', () => {
      expect(() => GraphicsService.activateEffect('fog', 'non-existent')).toThrow();
    });
  });

  describe('deactivateEffect', () => {
    beforeEach(() => {
      GraphicsService.registerEffect(makeFogEffect('fog-classic'));
      GraphicsService.activateEffect('fog', 'fog-classic');
    });

    it('clears the active effect for the given kind', () => {
      GraphicsService.deactivateEffect('fog');
      expect(GraphicsService.getActiveEffect('fog')).toBeNull();
    });

    it('is idempotent — deactivating with no active effect does not throw', () => {
      GraphicsService.deactivateEffect('map'); // was never activated
      expect(GraphicsService.getActiveEffect('map')).toBeNull();
    });
  });

  // ── getActiveEffect ─────────────────────────────────────────────────────────

  describe('getActiveEffect', () => {
    it('returns null when no effect is active for the kind', () => {
      expect(GraphicsService.getActiveEffect('scent')).toBeNull();
    });

    it('returns the effect object, not just the id', () => {
      const effect = makeFogEffect('fog-test');
      GraphicsService.registerEffect(effect);
      GraphicsService.activateEffect('fog', 'fog-test');
      const active = GraphicsService.getActiveEffect('fog');
      expect(active).toBe(effect);
    });
  });

  // ── isEffectActive ──────────────────────────────────────────────────────────

  describe('isEffectActive', () => {
    beforeEach(() => {
      GraphicsService.registerEffect(makeFogEffect('fog-classic'));
      GraphicsService.activateEffect('fog', 'fog-classic');
    });

    it('returns true when the specified effect is the active one', () => {
      expect(GraphicsService.isEffectActive('fog', 'fog-classic')).toBe(true);
    });

    it('returns false when a different effect is active', () => {
      expect(GraphicsService.isEffectActive('fog', 'fog-pulse')).toBe(false);
    });

    it('returns false when nothing is active', () => {
      expect(GraphicsService.isEffectActive('map', 'map-none')).toBe(false);
    });
  });

  // ── getAllEffects ───────────────────────────────────────────────────────────

  describe('getAllEffects', () => {
    it('returns empty array when registry is empty', () => {
      expect(GraphicsService.getAllEffects()).toHaveLength(0);
    });

    it('returns all registered effects regardless of kind', () => {
      GraphicsService.registerEffect(makeFogEffect('f'));
      GraphicsService.registerEffect(makeMapEffect('m'));
      GraphicsService.registerEffect(makeScentEffect('s'));
      expect(GraphicsService.getAllEffects()).toHaveLength(3);
    });
  });

  // ── dispose ─────────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('clears the registry', () => {
      GraphicsService.registerEffect(makeFogEffect('fog-1'));
      GraphicsService.dispose();
      expect(GraphicsService.getAllEffects()).toHaveLength(0);
    });

    it('clears all active effects', () => {
      GraphicsService.registerEffect(makeFogEffect('fog-1'));
      GraphicsService.activateEffect('fog', 'fog-1');
      GraphicsService.dispose();
      expect(GraphicsService.getActiveEffect('fog')).toBeNull();
    });

    it('allows re-registration after dispose', () => {
      GraphicsService.registerEffect(makeFogEffect('fog-1'));
      GraphicsService.dispose();
      const newEffect = makeFogEffect('fog-1');
      expect(() => GraphicsService.registerEffect(newEffect)).not.toThrow();
      expect(GraphicsService.getEffectById('fog-1')).toBe(newEffect);
    });
  });

  // ── initializeDefaultEffects ────────────────────────────────────────────────

  describe('initializeDefaultEffects', () => {
    it('registers fog, map, and scent effects', () => {
      GraphicsService.initializeDefaultEffects();
      expect(GraphicsService.getEffectsByKind('fog').length).toBeGreaterThanOrEqual(2);
      expect(GraphicsService.getEffectsByKind('map').length).toBeGreaterThanOrEqual(2);
      expect(GraphicsService.getEffectsByKind('scent').length).toBeGreaterThanOrEqual(2);
    });

    it('activates default effects for each kind', () => {
      GraphicsService.initializeDefaultEffects();
      expect(GraphicsService.getActiveEffect('fog')).not.toBeNull();
      expect(GraphicsService.getActiveEffect('map')).not.toBeNull();
      expect(GraphicsService.getActiveEffect('scent')).not.toBeNull();
    });

    it('includes at least 1 static and 1 animated effect per kind', () => {
      GraphicsService.initializeDefaultEffects();

      const fogEffects = GraphicsService.getEffectsByKind('fog');
      expect(fogEffects.some((e) => e.type === 'static')).toBe(true);
      expect(fogEffects.some((e) => e.type === 'animated')).toBe(true);

      const mapEffects = GraphicsService.getEffectsByKind('map');
      expect(mapEffects.some((e) => e.type === 'static')).toBe(true);
      expect(mapEffects.some((e) => e.type === 'animated')).toBe(true);

      const scentEffects = GraphicsService.getEffectsByKind('scent');
      expect(scentEffects.some((e) => e.type === 'static')).toBe(true);
      expect(scentEffects.some((e) => e.type === 'animated')).toBe(true);
    });

    it('is idempotent — calling twice does not duplicate effects', () => {
      GraphicsService.initializeDefaultEffects();
      const countAfterFirst = GraphicsService.getAllEffects().length;
      GraphicsService.initializeDefaultEffects();
      expect(GraphicsService.getAllEffects().length).toBe(countAfterFirst);
    });
  });

  // ── getRenderConfig (fog) ───────────────────────────────────────────────────

  describe('getFogRenderConfig', () => {
    beforeEach(() => {
      GraphicsService.initializeDefaultEffects();
    });

    it('returns a valid config for the active fog effect', () => {
      const config = GraphicsService.getFogRenderConfig('fog-classic');
      expect(config).toBeDefined();
      expect(config!.fogColor).toBeDefined();
      expect(typeof config!.fogOpacity).toBe('number');
    });

    it('returns null for an unregistered id', () => {
      expect(GraphicsService.getFogRenderConfig('unknown-id')).toBeNull();
    });
  });

  // ── getRenderConfig (map) ───────────────────────────────────────────────────

  describe('getMapRenderConfig', () => {
    beforeEach(() => {
      GraphicsService.initializeDefaultEffects();
    });

    it('returns a valid config for a map effect', () => {
      const config = GraphicsService.getMapRenderConfig('map-none');
      expect(config).toBeDefined();
      expect(typeof config!.overlayOpacity).toBe('number');
    });
  });

  // ── getRenderConfig (scent) ─────────────────────────────────────────────────

  describe('getScentRenderConfig', () => {
    beforeEach(() => {
      GraphicsService.initializeDefaultEffects();
    });

    it('returns a valid config for a scent effect', () => {
      const config = GraphicsService.getScentRenderConfig('scent-dotted');
      expect(config).toBeDefined();
      expect(config!.trailColor).toBeDefined();
      expect(typeof config!.trailWidth).toBe('number');
    });
  });

  // ── Effect render configs produce expected visual properties ────────────────

  describe('effect render config integrity', () => {
    beforeEach(() => {
      GraphicsService.initializeDefaultEffects();
    });

    it('fog-pulse effect has animationType pulse', () => {
      const config = GraphicsService.getFogRenderConfig('fog-pulse');
      expect(config!.animationType).toBe('pulse');
    });

    it('fog-vignette effect has reduced opacity for semi-transparent fog', () => {
      const config = GraphicsService.getFogRenderConfig('fog-vignette');
      expect(config!.fogOpacity).toBeLessThan(1);
    });

    it('fog-haunted effect has a tintColor', () => {
      const config = GraphicsService.getFogRenderConfig('fog-haunted');
      expect(config!.tintColor).toBeDefined();
    });

    it('map-sepia has an overlayColor', () => {
      const config = GraphicsService.getMapRenderConfig('map-sepia');
      expect(config!.overlayColor).toBeDefined();
    });

    it('map-radar has animationType radar', () => {
      const config = GraphicsService.getMapRenderConfig('map-radar');
      expect(config!.animationType).toBe('radar');
    });

    it('scent-flowing has animationType flow', () => {
      const config = GraphicsService.getScentRenderConfig('scent-flowing');
      expect(config!.animationType).toBe('flow');
    });

    it('scent-pulse-wave has animationType pulse', () => {
      const config = GraphicsService.getScentRenderConfig('scent-pulse-wave');
      expect(config!.animationType).toBe('pulse');
    });
  });
});
