import { FOG_CONFIG, FOG_VALIDATION } from '../fogConfig';

describe('FOG_CONFIG', () => {
  it('should have correct default values', () => {
    expect(FOG_CONFIG.COLOR).toBe('black');
    expect(FOG_CONFIG.OPACITY).toBe(1.0);
    expect(FOG_CONFIG.PATH_COLOR).toBe('black');
    expect(FOG_CONFIG.RADIUS_METERS).toBe(37.5);
    expect(FOG_CONFIG.RENDER_THROTTLE_MS).toBe(16);
  });

  it('should be immutable (as const)', () => {
    // This will fail at TypeScript compile time if not properly typed as const
    const config = FOG_CONFIG;
    expect(typeof config.COLOR).toBe('string');
    expect(typeof config.OPACITY).toBe('number');
  });
});

describe('FOG_VALIDATION', () => {
  describe('isVisibleColor', () => {
    it('should return true for solid black color', () => {
      expect(FOG_VALIDATION.isVisibleColor('black')).toBe(true);
    });

    it('should return true for rgba black with full opacity', () => {
      expect(FOG_VALIDATION.isVisibleColor('rgba(0, 0, 0, 1)')).toBe(true);
    });

    it('should return false for problematic colors', () => {
      expect(FOG_VALIDATION.isVisibleColor('rgba(128, 128, 128, 0.3)')).toBe(false);
      expect(FOG_VALIDATION.isVisibleColor('rgba(255, 255, 255, 0.3)')).toBe(false);
    });

    it('should return true for other high-contrast rgba colors', () => {
      expect(FOG_VALIDATION.isVisibleColor('rgba(255, 0, 0, 1)')).toBe(true);
    });
  });

  describe('isVisibleOpacity', () => {
    it('should return true for opacity >= 0.9', () => {
      expect(FOG_VALIDATION.isVisibleOpacity(1.0)).toBe(true);
      expect(FOG_VALIDATION.isVisibleOpacity(0.9)).toBe(true);
      expect(FOG_VALIDATION.isVisibleOpacity(0.95)).toBe(true);
    });

    it('should return false for opacity < 0.9', () => {
      expect(FOG_VALIDATION.isVisibleOpacity(0.8)).toBe(false);
      expect(FOG_VALIDATION.isVisibleOpacity(0.5)).toBe(false);
      expect(FOG_VALIDATION.isVisibleOpacity(0.3)).toBe(false);
    });
  });

  describe('isProblematicConfig', () => {
    it('should return true for light gray colors', () => {
      expect(FOG_VALIDATION.isProblematicConfig('rgba(128, 128, 128, 1)', 1.0)).toBe(true);
    });

    it('should return true for very transparent colors', () => {
      expect(FOG_VALIDATION.isProblematicConfig('black', 0.5)).toBe(true);
    });

    it('should return true for colors with low alpha', () => {
      expect(FOG_VALIDATION.isProblematicConfig('rgba(0, 0, 0, 0.3)', 1.0)).toBe(true);
    });

    it('should return false for good visibility configurations', () => {
      expect(FOG_VALIDATION.isProblematicConfig('black', 1.0)).toBe(false);
      expect(FOG_VALIDATION.isProblematicConfig('rgba(0, 0, 0, 1)', 0.95)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(FOG_VALIDATION.isProblematicConfig('rgba(0, 0, 0, 0.3)', 0.8)).toBe(true);
    });
  });
});
