/**
 * Geometry helpers for the dashboard's hand-rolled SVG charts (no chart lib).
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson): smooth like a spline but
 * never overshoots, so a curve between 0 and 0 stays flat at 0 instead of
 * dipping below the axis or inventing a peak.
 */
export function monotonePath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0].x},${points[0].y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = (points[i + 1].y - points[i].y) / dx[i];
  }
  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${r(points[0].x)},${r(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = points[i].x + dx[i] / 3;
    const c1y = points[i].y + (tangent[i] * dx[i]) / 3;
    const c2x = points[i + 1].x - dx[i] / 3;
    const c2y = points[i + 1].y - (tangent[i + 1] * dx[i]) / 3;
    d += ` C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(points[i + 1].x)},${r(points[i + 1].y)}`;
  }
  return d;
}

/** Closes a line path down to the baseline to make an area. */
export function areaPath(line: string, points: Point[], baseline: number): string {
  if (points.length < 2) return "";
  return `${line} L${r(points[points.length - 1].x)},${baseline} L${r(points[0].x)},${baseline} Z`;
}

/** A "nice" axis maximum (1, 2, 5 × 10^k) at or above `value`. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * exp >= value) return step * exp;
  }
  return 10 * exp;
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}
