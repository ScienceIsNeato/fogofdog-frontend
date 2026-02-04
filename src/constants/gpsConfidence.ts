/**
 * GPS Confidence Constants
 *
 * These thresholds control how GPS accuracy affects exploration tracking
 * and path recording. Points with poor accuracy can be filtered out to
 * prevent jitter from poisoning the exploration path.
 *
 * Accuracy values are in metres — smaller is better.
 */

/**
 * Maximum acceptable GPS accuracy (in metres) for a fix to be considered
 * high-confidence. Fixes with accuracy <= this value are always accepted.
 */
export const GPS_CONFIDENCE_THRESHOLD = 20;

/**
 * Maximum acceptable GPS accuracy (in metres) for a fix to count as
 * "exploration" progress (marking streets as explored). This is stricter
 * than general tracking because we don't want to award exploration credit
 * for noisy fixes that might be off the actual street.
 */
export const EXPLORATION_CONFIDENCE_THRESHOLD = 15;

/**
 * Minimum acceptable GPS accuracy (in metres). Fixes with accuracy worse
 * than this are considered too unreliable and should be filtered out
 * entirely from path tracking.
 */
export const GPS_NOISE_THRESHOLD = 50;

/**
 * Number of consecutive high-confidence fixes required before trusting
 * a position change. Helps filter out transient GPS spikes.
 */
export const GPS_CONFIDENCE_STREAK_REQUIRED = 2;

/**
 * Utility function to classify a GPS fix based on its accuracy.
 *
 * @param accuracy - The horizontal accuracy in metres (undefined = unknown)
 * @returns Classification level: 'high' | 'medium' | 'low' | 'noise'
 */
export function classifyGPSConfidence(
  accuracy: number | undefined
): 'high' | 'medium' | 'low' | 'noise' {
  if (accuracy === undefined) return 'medium'; // Unknown, assume medium
  if (accuracy <= EXPLORATION_CONFIDENCE_THRESHOLD) return 'high';
  if (accuracy <= GPS_CONFIDENCE_THRESHOLD) return 'medium';
  if (accuracy <= GPS_NOISE_THRESHOLD) return 'low';
  return 'noise';
}

/**
 * Determines whether a GPS fix should be used for exploration credit.
 *
 * @param accuracy - The horizontal accuracy in metres
 * @returns true if the fix is reliable enough to mark streets as explored
 */
export function isExplorationQualityFix(accuracy: number | undefined): boolean {
  if (accuracy === undefined) return true; // If no accuracy info, accept it
  return accuracy <= EXPLORATION_CONFIDENCE_THRESHOLD;
}

/**
 * Determines whether a GPS fix should be recorded in the path at all.
 *
 * @param accuracy - The horizontal accuracy in metres
 * @returns true if the fix is reliable enough to include in path tracking
 */
export function isTrackableQualityFix(accuracy: number | undefined): boolean {
  if (accuracy === undefined) return true; // If no accuracy info, accept it
  return accuracy <= GPS_NOISE_THRESHOLD;
}
