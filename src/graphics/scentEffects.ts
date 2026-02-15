/**
 * Built-in scent effects catalogue
 *
 * A "scent" is the visual variant of the ExplorationNudge — instead of a
 * simple directional text card it renders a trail along the great-circle path
 * from the user's current GPS position to the nearest unexplored waypoint.
 *
 * Each effect is a pure object implementing ScentEffect.
 * The getRenderConfig() function returns a ScentRenderConfig that
 * ScentTrail uses to render its Skia canvas.
 *
 * Minimum DoD requirement: ≥2 effects (1 static, 1 animated).
 * Delivered: 4 effects (2 static, 2 animated).
 */
import type { ScentEffect } from '../types/graphics';

/**
 * Dotted Trail — static
 * A simple dotted Skia path from the user to the waypoint.
 * Low overhead; the default scent effect.
 */
export const scentDotted: ScentEffect = {
  id: 'scent-dotted',
  name: 'Dotted Trail',
  kind: 'scent',
  type: 'static',
  description: 'Simple dotted line pointing toward the nearest unexplored street',
  getRenderConfig: () => ({
    trailColor: '#5AC8FA', // iOS blue
    trailWidth: 3,
    trailStyle: 'dotted',
    showEndpoint: true,
    animationType: 'none',
    animationDuration: 0,
    particleCount: 0,
  }),
};

/**
 * Arrow Trail — static
 * Directional chevron/arrow markers placed at regular intervals along the
 * great-circle path to the waypoint.  Each marker points "forward"
 * (toward the waypoint) using the bearing between adjacent path points.
 */
export const scentArrows: ScentEffect = {
  id: 'scent-arrows',
  name: 'Arrow Trail',
  kind: 'scent',
  type: 'static',
  description: 'Direction arrows marking the path to the waypoint',
  getRenderConfig: () => ({
    trailColor: '#FFD60A', // amber yellow — high contrast on dark map
    trailWidth: 2,
    trailStyle: 'arrows',
    showEndpoint: true,
    animationType: 'none',
    animationDuration: 0,
    particleCount: 0,
  }),
};

/**
 * Flowing Particles — animated
 * Dots evenly spaced along the trail path drift steadily toward the waypoint.
 * The effect is achieved by animating the dashPhase of a DashPathEffect so that
 * the dots appear to move forward without re-computing path geometry each frame.
 */
export const scentFlowing: ScentEffect = {
  id: 'scent-flowing',
  name: 'Flowing Particles',
  kind: 'scent',
  type: 'animated',
  description: 'Particles drift along the scent trail toward the waypoint',
  getRenderConfig: () => ({
    trailColor: '#30D158', // iOS green — energetic, "alive"
    trailWidth: 4,
    trailStyle: 'flowing',
    showEndpoint: true,
    animationType: 'flow',
    animationDuration: 1200, // ms for one full particle cycle
    particleCount: 8,
  }),
};

/**
 * Pulse Wave — animated
 * Concentric rings expand from the waypoint endpoint at regular intervals,
 * like sonar pings beckoning the player.  Rings fade out as they grow,
 * implemented via animated opacity and radius SharedValues.
 */
export const scentPulseWave: ScentEffect = {
  id: 'scent-pulse-wave',
  name: 'Pulse Wave',
  kind: 'scent',
  type: 'animated',
  description: 'Expanding rings pulse from the waypoint',
  getRenderConfig: () => ({
    trailColor: '#FF375F', // iOS red — urgent, "go here"
    trailWidth: 2,
    trailStyle: 'pulse-wave',
    showEndpoint: true,
    animationType: 'pulse',
    animationDuration: 1800, // ms per ring expansion
    particleCount: 3, // number of concentric rings in flight at once
  }),
};

/** All scent effects for bulk registration. */
export const ALL_SCENT_EFFECTS: ScentEffect[] = [
  scentDotted,
  scentArrows,
  scentFlowing,
  scentPulseWave,
];
