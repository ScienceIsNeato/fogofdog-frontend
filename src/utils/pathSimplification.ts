/**
 * Path simplification utilities for GPS path rendering
 */

import type { SkPath } from '@shopify/react-native-skia';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Douglas-Peucker line simplification algorithm
 * Reduces the number of points in a path while preserving its essential shape
 */
export class PathSimplificationService {
  /**
   * Calculate perpendicular distance from a point to a line segment
   */
  private static perpendicularDistance(
    point: Point2D,
    lineStart: Point2D,
    lineEnd: Point2D
  ): number {
    // Defensive null checks as recommended by Copilot review
    if (!point || !lineStart || !lineEnd) {
      return 0;
    }

    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;

    if (lenSq === 0) return Math.sqrt(A * A + B * B);

    const param = dot / lenSq;
    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Recursive Douglas-Peucker implementation
   */
  private static douglasPeucker(
    points: Point2D[],
    start: number,
    end: number,
    tolerance: number
  ): Point2D[] {
    let maxDist = 0;
    let index = 0;

    for (let i = start + 1; i < end; i++) {
      const point = points[i];
      const startPoint = points[start];
      const endPoint = points[end];

      if (!point || !startPoint || !endPoint) continue;

      const dist = this.perpendicularDistance(point, startPoint, endPoint);
      if (dist > maxDist) {
        index = i;
        maxDist = dist;
      }
    }

    if (maxDist > tolerance) {
      const recResults1 = this.douglasPeucker(points, start, index, tolerance);
      const recResults2 = this.douglasPeucker(points, index, end, tolerance);
      return [...recResults1.slice(0, -1), ...recResults2];
    } else {
      const startPoint = points[start];
      const endPoint = points[end];
      return startPoint && endPoint ? [startPoint, endPoint] : [];
    }
  }

  /**
   * Simplify a path using Douglas-Peucker algorithm
   */
  static simplifyPath(points: Point2D[], tolerance: number): Point2D[] {
    if (points.length <= 2) return points;
    return this.douglasPeucker(points, 0, points.length - 1, tolerance);
  }

  /**
   * Build continuous path chains from connected segments.
   *
   * Segments arrive in GPS temporal order from GPSConnectionService.
   * Consecutive GPS-adjacent segments share exact pixel coordinates for their
   * shared endpoint (same lat/lon → identical floating-point pixel values).
   *
   * Previous implementation used a <1px proximity tolerance which caused
   * spurious diagonal connections between unrelated walk sessions whose
   * endpoints happened to be pixel-close at certain zoom levels.
   */
  static buildPathChains(
    segments: { start: { x: number; y: number }; end: { x: number; y: number } }[]
  ): Point2D[][] {
    if (segments.length === 0) return [];

    const firstSegment = segments[0]!;
    const pathChains: Point2D[][] = [];
    let currentChain: Point2D[] = [firstSegment.start, firstSegment.end];

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i]!;
      const chainEnd = currentChain[currentChain.length - 1]!;

      // GPS-adjacent segments share the exact same underlying GPS coordinate,
      // so their pixel values are identical (same inputs → same float result).
      // Strict equality prevents false connections between unrelated walk sessions.
      if (chainEnd.x === segment.start.x && chainEnd.y === segment.start.y) {
        currentChain.push(segment.end);
      } else {
        // Gap between segments — start a new chain
        pathChains.push(currentChain);
        currentChain = [segment.start, segment.end];
      }
    }

    // Push the final chain
    pathChains.push(currentChain);

    return pathChains;
  }

  /**
   * Draw a single chain with appropriate curve type
   */
  private static drawChain(path: SkPath, points: Point2D[]): void {
    if (points.length === 0) return;

    const firstPoint = points[0];
    if (!firstPoint) return;

    path.moveTo(firstPoint.x, firstPoint.y);

    if (points.length === 1) {
      return;
    } else if (points.length === 2) {
      const secondPoint = points[1];
      if (!secondPoint) return;
      path.lineTo(secondPoint.x, secondPoint.y);
    } else {
      this.drawCatmullRomCurves(path, points);
    }
  }

  /**
   * Calculate Catmull-Rom control points for a segment
   */
  // eslint-disable-next-line max-params
  private static calculateCatmullRomControlPoints(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    tension: number
  ): { cp1: Point2D; cp2: Point2D } {
    // Calculate tangent vectors for smooth curves
    const t1x = tension * (p2.x - p0.x);
    const t1y = tension * (p2.y - p0.y);
    const t2x = tension * (p3.x - p1.x);
    const t2y = tension * (p3.y - p1.y);

    // Bezier control points
    return {
      cp1: { x: p1.x + t1x / 3, y: p1.y + t1y / 3 },
      cp2: { x: p2.x - t2x / 3, y: p2.y - t2y / 3 },
    };
  }

  /**
   * Draw Catmull-Rom spline curves for multiple points
   */
  private static drawCatmullRomCurves(path: SkPath, points: Point2D[]): void {
    const tension = 0.3; // Reduced tension for smoother, more flowing curves

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i + 2 < points.length ? points[i + 2] : points[i + 1];

      if (!p0 || !p1 || !p2 || !p3) continue;

      const { cp1, cp2 } = this.calculateCatmullRomControlPoints(p0, p1, p2, p3, tension);
      path.cubicTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
    }
  }

  /**
   * Draw smooth Catmull-Rom spline curves on a Skia path
   */
  static drawSmoothPath(path: SkPath, simplifiedChains: Point2D[][]): void {
    for (const chain of simplifiedChains) {
      this.drawChain(path, chain);
    }
  }
}
