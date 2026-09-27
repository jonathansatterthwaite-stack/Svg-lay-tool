import type { Point, Rect } from './types';

/** 2D affine matrix in SVG order: [a c e; b d f; 0 0 1]. */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const DEG = Math.PI / 180;

export function translate(tx: number, ty: number): Mat {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scale(sx: number, sy = sx): Mat {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotate(degrees: number): Mat {
  const r = degrees * DEG;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** `multiply(m1, m2)` applies m2 first, then m1 (same as SVG `m1 m2`). */
export function multiply(m1: Mat, m2: Mat): Mat {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

/** Compose left to right: `compose(A, B, C)` === A·B·C (C applied first). */
export function compose(...ms: Mat[]): Mat {
  return ms.reduce((acc, m) => multiply(acc, m), IDENTITY);
}

export function invert(m: Mat): Mat {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) {
    return IDENTITY;
  }
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function applyToPoint(m: Mat, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** Applies only the linear part (no translation) - use for deltas. */
export function applyToVector(m: Mat, v: Point): Point {
  return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
}

export function matrixToString(m: Mat): string {
  return `matrix(${fmt(m.a)} ${fmt(m.b)} ${fmt(m.c)} ${fmt(m.d)} ${fmt(m.e)} ${fmt(m.f)})`;
}

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1000) / 1000;
  return String(r === 0 ? 0 : r);
}

export function rectCorners(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

export function boundsOfPoints(points: Point[]): Rect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Axis-aligned bounds of a rectangle after transformation. */
export function transformRect(r: Rect, m: Mat): Rect {
  return boundsOfPoints(rectCorners(r).map((p) => applyToPoint(m, p)))!;
}

export function unionRects(rects: (Rect | null)[]): Rect | null {
  const valid = rects.filter((r): r is Rect => r !== null);
  if (valid.length === 0) return null;
  return boundsOfPoints(valid.flatMap(rectCorners));
}

export function expandRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
