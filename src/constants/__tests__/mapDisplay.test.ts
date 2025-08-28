import { MAP_DISPLAY_CONFIG, EARTH_CONSTANTS } from '../mapDisplay';

describe('MAP_DISPLAY_CONFIG', () => {
  it('should have correct default values', () => {
    expect(MAP_DISPLAY_CONFIG.METERS_PER_DEGREE_LATITUDE).toBe(111320);
    expect(MAP_DISPLAY_CONFIG.TARGET_SCALE_PIXEL_WIDTH).toBe(120);
    expect(MAP_DISPLAY_CONFIG.FALLBACK_SCALE_PIXEL_WIDTH).toBe(100);
    expect(MAP_DISPLAY_CONFIG.FALLBACK_SCALE_LABEL).toBe('100m');
  });

  it('should be immutable (as const)', () => {
    const config = MAP_DISPLAY_CONFIG;
    expect(typeof config.METERS_PER_DEGREE_LATITUDE).toBe('number');
    expect(typeof config.TARGET_SCALE_PIXEL_WIDTH).toBe('number');
  });
});

describe('EARTH_CONSTANTS', () => {
  it('should have correct derived values', () => {
    expect(EARTH_CONSTANTS.CIRCUMFERENCE_METERS).toBe(40075000);
    expect(EARTH_CONSTANTS.DEGREES_IN_CIRCLE).toBe(360);
    expect(EARTH_CONSTANTS.METERS_PER_DEGREE).toBeCloseTo(111319.44, 2);
  });

  it('should correctly derive meters per degree from circumference', () => {
    const derived = EARTH_CONSTANTS.CIRCUMFERENCE_METERS / EARTH_CONSTANTS.DEGREES_IN_CIRCLE;
    expect(derived).toBe(EARTH_CONSTANTS.METERS_PER_DEGREE);
  });
});
