/**
 * Fog Overlay Configuration Constants
 *
 * This file defines the visual appearance of the fog overlay.
 * Centralizing these values ensures consistency between implementation
 * and tests, and makes it easier to adjust fog visibility.
 */

export const FOG_CONFIG = {
  // Fog appearance - should be highly visible
  COLOR: 'black', // Completely opaque black fog for maximum visibility
  OPACITY: 1.0, // Completely opaque (1.0 = 100%, 0.0 = transparent)

  // Path/hole appearance
  PATH_COLOR: 'black', // Black areas in mask create transparency
  RADIUS_METERS: 75, // Radius in meters for cleared areas around path points

  // Performance
  RENDER_THROTTLE_MS: 16, // Throttle to ~60fps
} as const;

/**
 * Validation helpers for fog configuration
 */
export const FOG_VALIDATION = {
  /**
   * Check if fog color provides sufficient visibility
   */
  isVisibleColor: (color: string): boolean => {
    // Should be solid black or other high-contrast color
    // Not light gray or very transparent colors
    return (
      color === 'black' ||
      color === 'rgba(0, 0, 0, 1)' ||
      (color.includes('rgba') && !color.includes('0.3') && !color.includes('128, 128, 128'))
    );
  },

  /**
   * Check if fog opacity provides sufficient visibility
   */
  isVisibleOpacity: (opacity: number): boolean => {
    return opacity >= 0.9; // Should be at least 90% opaque
  },

  /**
   * Check if fog configuration is problematic (barely visible)
   */
  isProblematicConfig: (color: string, opacity: number): boolean => {
    const isLightGray = color.includes('rgba(128, 128, 128');
    const isVeryTransparent = opacity < 0.9;
    const hasLowAlpha = color.includes('0.3');

    return isLightGray || isVeryTransparent || hasLowAlpha;
  },
} as const;
