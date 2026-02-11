/**
 * GraphicsService
 *
 * Central registry for graphics effects used by the fog overlay, map layer,
 * and scent trail.  Follows the project's static-class service pattern —
 * all methods are pure or manage module-level state with no React coupling.
 *
 * Usage:
 *   1. Default effects are initialised as a side-effect of importing
 *      graphicsConnectors.tsx (module-scope call to initializeDefaultEffects()).
 *      This runs once when the MapScreen mounts for the first time.
 *   2. Components read the active effect ID from Redux (graphicsSlice) and
 *      call GraphicsService.getFogRenderConfig(id) / getMapRenderConfig(id)
 *      / getScentRenderConfig(id) to get the render config.
 *   3. Additional effects can be registered at runtime with registerEffect().
 */

import { logger } from '../utils/logger';
import type {
  AnyGraphicsEffect,
  EffectKind,
  FogEffect,
  FogRenderConfig,
  MapEffect,
  MapRenderConfig,
  ScentEffect,
  ScentRenderConfig,
} from '../types/graphics';
import { ALL_FOG_EFFECTS } from '../graphics/fogEffects';
import { ALL_MAP_EFFECTS } from '../graphics/mapEffects';
import { ALL_SCENT_EFFECTS } from '../graphics/scentEffects';

export class GraphicsService {
  /** Registry keyed by effect id. */
  private static registry: Map<string, AnyGraphicsEffect> = new Map();
  /** Currently active effect id per kind. */
  private static activeEffects: Map<EffectKind, string> = new Map();

  // ─── Registration ───────────────────────────────────────────────────────────

  /**
   * Register an effect.  If an effect with the same id is already registered,
   * it is overwritten (idempotent re-registration is expected during HMR).
   */
  static registerEffect(effect: AnyGraphicsEffect): void {
    this.registry.set(effect.id, effect);
    logger.debug(
      `GraphicsService: registered effect "${effect.id}" (${effect.kind}/${effect.type})`,
      {
        component: 'GraphicsService',
        action: 'registerEffect',
        id: effect.id,
        kind: effect.kind,
      }
    );
  }

  // ─── Activation ─────────────────────────────────────────────────────────────

  /**
   * Set the active effect for a given kind.
   * Throws if the effect is not in the registry (fail-fast for development).
   */
  static activateEffect(kind: EffectKind, effectId: string): void {
    if (!this.registry.has(effectId)) {
      throw new Error(
        `GraphicsService.activateEffect: effect "${effectId}" is not registered.  ` +
          `Call registerEffect() before activating.`
      );
    }
    this.activeEffects.set(kind, effectId);
    logger.info(`GraphicsService: activated "${effectId}" for kind "${kind}"`, {
      component: 'GraphicsService',
      action: 'activateEffect',
      kind,
      effectId,
    });
  }

  /** Clear the active effect for a kind.  Safe to call when nothing is active. */
  static deactivateEffect(kind: EffectKind): void {
    this.activeEffects.delete(kind);
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  /**
   * Return the currently active effect for a kind, or null when none is set.
   */
  static getActiveEffect(kind: EffectKind): AnyGraphicsEffect | null {
    const id = this.activeEffects.get(kind);
    if (!id) return null;
    return this.registry.get(id) ?? null;
  }

  /** Return the effect object for a given id, or null if not registered. */
  static getEffectById(id: string): AnyGraphicsEffect | null {
    return this.registry.get(id) ?? null;
  }

  /** Return all registered effects of a specific kind. */
  static getEffectsByKind(kind: EffectKind): AnyGraphicsEffect[] {
    return Array.from(this.registry.values()).filter((e) => e.kind === kind);
  }

  /** Return all registered effects. */
  static getAllEffects(): AnyGraphicsEffect[] {
    return Array.from(this.registry.values());
  }

  /** True when the specified effect is currently active for its kind. */
  static isEffectActive(kind: EffectKind, effectId: string): boolean {
    return this.activeEffects.get(kind) === effectId;
  }

  // ─── Render-config accessors ────────────────────────────────────────────────

  /**
   * Return the FogRenderConfig for a registered fog effect id.
   * Returns null when the id is not registered or is not a fog effect.
   */
  static getFogRenderConfig(effectId: string): FogRenderConfig | null {
    const effect = this.registry.get(effectId);
    if (!effect || effect.kind !== 'fog') return null;
    return (effect as FogEffect).getRenderConfig();
  }

  /**
   * Return the MapRenderConfig for a registered map effect id.
   * Returns null when the id is not registered or is not a map effect.
   */
  static getMapRenderConfig(effectId: string): MapRenderConfig | null {
    const effect = this.registry.get(effectId);
    if (!effect || effect.kind !== 'map') return null;
    return (effect as MapEffect).getRenderConfig();
  }

  /**
   * Return the ScentRenderConfig for a registered scent effect id.
   * Returns null when the id is not registered or is not a scent effect.
   */
  static getScentRenderConfig(effectId: string): ScentRenderConfig | null {
    const effect = this.registry.get(effectId);
    if (!effect || effect.kind !== 'scent') return null;
    return (effect as ScentEffect).getRenderConfig();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Register all built-in effects and set default active effects.
   * Idempotent: re-calling overwrites existing registrations with the same ids,
   * which is safe (the configs are deterministic pure objects).
   */
  static initializeDefaultEffects(): void {
    // Register all built-in fog effects
    for (const effect of ALL_FOG_EFFECTS) {
      this.registerEffect(effect);
    }
    // Register all built-in map effects
    for (const effect of ALL_MAP_EFFECTS) {
      this.registerEffect(effect);
    }
    // Register all built-in scent effects
    for (const effect of ALL_SCENT_EFFECTS) {
      this.registerEffect(effect);
    }

    // Activate defaults (match graphicsSlice initialState)
    this.activateEffect('fog', 'fog-classic');
    this.activateEffect('map', 'map-none');
    this.activateEffect('scent', 'scent-dotted');

    logger.info(
      `GraphicsService: initialized ${this.registry.size} effects ` +
        `(fog: ${this.getEffectsByKind('fog').length}, ` +
        `map: ${this.getEffectsByKind('map').length}, ` +
        `scent: ${this.getEffectsByKind('scent').length})`,
      { component: 'GraphicsService', action: 'initializeDefaultEffects' }
    );
  }

  /** Clear registry and active effect state.  Called in tests and on logout. */
  static dispose(): void {
    this.registry.clear();
    this.activeEffects.clear();
  }
}
