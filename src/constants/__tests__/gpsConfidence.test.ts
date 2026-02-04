import {
  GPS_CONFIDENCE_THRESHOLD,
  EXPLORATION_CONFIDENCE_THRESHOLD,
  GPS_NOISE_THRESHOLD,
  GPS_CONFIDENCE_STREAK_REQUIRED,
  classifyGPSConfidence,
  isExplorationQualityFix,
  isTrackableQualityFix,
} from '../gpsConfidence';

describe('GPS Confidence Constants', () => {
  describe('threshold values', () => {
    it('has EXPLORATION_CONFIDENCE_THRESHOLD <= GPS_CONFIDENCE_THRESHOLD', () => {
      expect(EXPLORATION_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(GPS_CONFIDENCE_THRESHOLD);
    });

    it('has GPS_CONFIDENCE_THRESHOLD < GPS_NOISE_THRESHOLD', () => {
      expect(GPS_CONFIDENCE_THRESHOLD).toBeLessThan(GPS_NOISE_THRESHOLD);
    });

    it('has reasonable default values', () => {
      expect(GPS_CONFIDENCE_THRESHOLD).toBe(20);
      expect(EXPLORATION_CONFIDENCE_THRESHOLD).toBe(15);
      expect(GPS_NOISE_THRESHOLD).toBe(50);
      expect(GPS_CONFIDENCE_STREAK_REQUIRED).toBe(2);
    });
  });

  describe('classifyGPSConfidence', () => {
    it('returns "high" for accuracy <= EXPLORATION_CONFIDENCE_THRESHOLD', () => {
      expect(classifyGPSConfidence(5)).toBe('high');
      expect(classifyGPSConfidence(15)).toBe('high');
    });

    it('returns "medium" for accuracy between exploration and confidence thresholds', () => {
      expect(classifyGPSConfidence(16)).toBe('medium');
      expect(classifyGPSConfidence(20)).toBe('medium');
    });

    it('returns "low" for accuracy between confidence and noise thresholds', () => {
      expect(classifyGPSConfidence(21)).toBe('low');
      expect(classifyGPSConfidence(50)).toBe('low');
    });

    it('returns "noise" for accuracy > GPS_NOISE_THRESHOLD', () => {
      expect(classifyGPSConfidence(51)).toBe('noise');
      expect(classifyGPSConfidence(100)).toBe('noise');
    });

    it('returns "medium" for undefined accuracy', () => {
      expect(classifyGPSConfidence(undefined)).toBe('medium');
    });
  });

  describe('isExplorationQualityFix', () => {
    it('returns true for high-accuracy fixes', () => {
      expect(isExplorationQualityFix(5)).toBe(true);
      expect(isExplorationQualityFix(15)).toBe(true);
    });

    it('returns false for medium and low-accuracy fixes', () => {
      expect(isExplorationQualityFix(16)).toBe(false);
      expect(isExplorationQualityFix(50)).toBe(false);
    });

    it('returns true for undefined accuracy (assume good)', () => {
      expect(isExplorationQualityFix(undefined)).toBe(true);
    });
  });

  describe('isTrackableQualityFix', () => {
    it('returns true for fixes below noise threshold', () => {
      expect(isTrackableQualityFix(5)).toBe(true);
      expect(isTrackableQualityFix(20)).toBe(true);
      expect(isTrackableQualityFix(50)).toBe(true);
    });

    it('returns false for fixes above noise threshold', () => {
      expect(isTrackableQualityFix(51)).toBe(false);
      expect(isTrackableQualityFix(100)).toBe(false);
    });

    it('returns true for undefined accuracy (assume good)', () => {
      expect(isTrackableQualityFix(undefined)).toBe(true);
    });
  });
});
