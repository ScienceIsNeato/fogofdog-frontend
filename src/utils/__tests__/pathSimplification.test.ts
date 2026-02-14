/**
 * @jest-environment node
 */

import { PathSimplificationService } from '../pathSimplification';
import type { Point2D } from '../pathSimplification';

describe('PathSimplificationService', () => {
  describe('simplifyPath', () => {
    it('should return same points for arrays with 2 or fewer points', () => {
      const singlePoint: Point2D[] = [{ x: 0, y: 0 }];
      const twoPoints: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ];

      expect(PathSimplificationService.simplifyPath(singlePoint, 1)).toEqual(singlePoint);
      expect(PathSimplificationService.simplifyPath(twoPoints, 1)).toEqual(twoPoints);
    });

    it('should simplify a straight line to just endpoints', () => {
      const straightLine: Point2D[] = [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 },
        { x: 15, y: 15 },
      ];

      const result = PathSimplificationService.simplifyPath(straightLine, 1);
      expect(result).toEqual([
        { x: 0, y: 0 },
        { x: 15, y: 15 },
      ]);
    });

    it('should preserve important points in a curved path', () => {
      const curvedPath: Point2D[] = [
        { x: 0, y: 0 },
        { x: 5, y: 1 },
        { x: 10, y: 10 }, // Important turn
        { x: 15, y: 11 },
        { x: 20, y: 20 },
      ];

      const result = PathSimplificationService.simplifyPath(curvedPath, 1);
      expect(result.length).toBeGreaterThan(2);
      expect(result[0]).toEqual({ x: 0, y: 0 });
      expect(result[result.length - 1]).toEqual({ x: 20, y: 20 });
    });
  });

  describe('buildPathChains', () => {
    it('should create separate chains for disconnected segments', () => {
      const segments = [
        { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
        { start: { x: 10, y: 10 }, end: { x: 11, y: 11 } },
      ];

      const chains = PathSimplificationService.buildPathChains(segments);
      expect(chains).toHaveLength(2);
      expect(chains[0]).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]);
      expect(chains[1]).toEqual([
        { x: 10, y: 10 },
        { x: 11, y: 11 },
      ]);
    });

    it('should connect segments that touch at endpoints', () => {
      const segments = [
        { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
        { start: { x: 1, y: 1 }, end: { x: 2, y: 2 } },
      ];

      const chains = PathSimplificationService.buildPathChains(segments);
      expect(chains).toHaveLength(1);
      expect(chains[0]).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]);
    });

    it('should not chain segments in reverse order (prevents spurious diagonal connections)', () => {
      // GPS segments arrive in temporal order. Reverse-matching by pixel proximity
      // caused spurious diagonal connections between unrelated walk sessions.
      const segments = [
        { start: { x: 1, y: 1 }, end: { x: 2, y: 2 } },
        { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      ];

      const chains = PathSimplificationService.buildPathChains(segments);
      // Should be separate chains — not stitched together by proximity
      expect(chains).toHaveLength(2);
      expect(chains[0]).toEqual([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]);
      expect(chains[1]).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]);
    });

    it('should return empty array for empty segments', () => {
      const chains = PathSimplificationService.buildPathChains([]);
      expect(chains).toEqual([]);
    });
  });
});
