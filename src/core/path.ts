/**
 * Minimal SVG path tooling used by geometry modifiers: parse path data,
 * flatten it to closed polygons, warp points, and serialise again.
 */
import { fmt } from './matrix';
import type { Point } from './types';

export type Polygon = Point[];

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/**
 * Flatten path data into polygons (one per subpath). Curves and arcs are
 * sampled; `tolerance` is the target segment length in user units.
 */
export function flattenPath(d: string, tolerance = 2): Polygon[] {
  const polys: Polygon[] = [];
  let cur: Polygon = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastCtrl: Point | null = null;
  let lastCmd = '';
  const push = (p: Point) => {
    const last = cur[cur.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) cur.push(p);
  };
  const close = () => {
    if (cur.length >= 3) {
      const a = cur[0];
      const b = cur[cur.length - 1];
      if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) cur.pop();
      if (cur.length >= 3) polys.push(cur);
    }
    cur = [];
  };
  const segs = (len: number) => Math.max(2, Math.min(96, Math.ceil(len / tolerance)));

  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const nums = (m[2].match(NUM) ?? []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    let i = 0;
    const take = (n: number) => {
      const out = nums.slice(i, i + n);
      i += n;
      return out;
    };
    if (C === 'Z') {
      close();
      x = sx;
      y = sy;
      lastCmd = 'Z';
      continue;
    }
    while (i < nums.length || (C === 'Z' && i === 0)) {
      switch (C) {
        case 'M': {
          const [px, py] = take(2);
          if (cur.length) close();
          x = rel ? x + px : px;
          y = rel ? y + py : py;
          sx = x;
          sy = y;
          cur = [{ x, y }];
          break;
        }
        case 'L': {
          const [px, py] = take(2);
          x = rel ? x + px : px;
          y = rel ? y + py : py;
          push({ x, y });
          break;
        }
        case 'H': {
          const [px] = take(1);
          x = rel ? x + px : px;
          push({ x, y });
          break;
        }
        case 'V': {
          const [py] = take(1);
          y = rel ? y + py : py;
          push({ x, y });
          break;
        }
        case 'C':
        case 'S': {
          let c1: Point;
          let c2: Point;
          let end: Point;
          if (C === 'C') {
            const [a, b, c, dd, e, f] = take(6);
            c1 = { x: rel ? x + a : a, y: rel ? y + b : b };
            c2 = { x: rel ? x + c : c, y: rel ? y + dd : dd };
            end = { x: rel ? x + e : e, y: rel ? y + f : f };
          } else {
            const [c, dd, e, f] = take(4);
            c1 = lastCtrl && (lastCmd === 'C' || lastCmd === 'S') ? { x: 2 * x - lastCtrl.x, y: 2 * y - lastCtrl.y } : { x, y };
            c2 = { x: rel ? x + c : c, y: rel ? y + dd : dd };
            end = { x: rel ? x + e : e, y: rel ? y + f : f };
          }
          const n = segs(dist({ x, y }, c1) + dist(c1, c2) + dist(c2, end));
          for (let k = 1; k <= n; k++) push(cubic({ x, y }, c1, c2, end, k / n));
          lastCtrl = c2;
          x = end.x;
          y = end.y;
          break;
        }
        case 'Q':
        case 'T': {
          let c1: Point;
          let end: Point;
          if (C === 'Q') {
            const [a, b, e, f] = take(4);
            c1 = { x: rel ? x + a : a, y: rel ? y + b : b };
            end = { x: rel ? x + e : e, y: rel ? y + f : f };
          } else {
            const [e, f] = take(2);
            c1 = lastCtrl && (lastCmd === 'Q' || lastCmd === 'T') ? { x: 2 * x - lastCtrl.x, y: 2 * y - lastCtrl.y } : { x, y };
            end = { x: rel ? x + e : e, y: rel ? y + f : f };
          }
          const n = segs(dist({ x, y }, c1) + dist(c1, end));
          for (let k = 1; k <= n; k++) push(quad({ x, y }, c1, end, k / n));
          lastCtrl = c1;
          x = end.x;
          y = end.y;
          break;
        }
        case 'A': {
          const [rx, ry, rot, large, sweep, ex, ey] = take(7);
          const end = { x: rel ? x + ex : ex, y: rel ? y + ey : ey };
          const pts = arcPoints({ x, y }, rx, ry, rot, !!large, !!sweep, end, tolerance);
          for (const p of pts) push(p);
          x = end.x;
          y = end.y;
          break;
        }
        default:
          i = nums.length;
      }
      if (C !== 'C' && C !== 'S' && C !== 'Q' && C !== 'T') lastCtrl = null;
      lastCmd = C;
      if (C === 'M' && !rel) {
        // subsequent pairs after M are implicit L
        while (i < nums.length) {
          const [px, py] = take(2);
          x = px;
          y = py;
          push({ x, y });
        }
      }
    }
  }
  if (cur.length) close();
  return polys;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function quad(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
}

/** Sample an SVG elliptical arc (endpoint parameterisation) into points, excluding the start point. */
function arcPoints(p0: Point, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, p1: Point, tolerance: number): Point[] {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-9 || ry < 1e-9 || (p0.x === p1.x && p0.y === p1.y)) return [p1];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    lambda = Math.sqrt(lambda);
    rx *= lambda;
    ry *= lambda;
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0.x + p1.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0.y + p1.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const d = ux * vx + uy * vy;
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, d / l)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const len = Math.abs(delta) * Math.max(rx, ry);
  const n = Math.max(3, Math.min(128, Math.ceil(len / tolerance)));
  const out: Point[] = [];
  for (let k = 1; k <= n; k++) {
    const t = theta1 + (delta * k) / n;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
  out[out.length - 1] = p1;
  return out;
}

/** Serialise polygons as straight-edged closed subpaths. */
export function polygonsToPath(polys: Polygon[]): string {
  return polys
    .filter((p) => p.length >= 3)
    .map((p) => p.map((pt, i) => `${i === 0 ? 'M' : 'L'}${fmt(pt.x)} ${fmt(pt.y)}`).join(' ') + ' Z')
    .join(' ');
}

/** Serialise polygons whose edges are quadratic curves through the vertices (smooth). */
export function polygonsToSmoothPath(polys: Polygon[]): string {
  return polys
    .filter((p) => p.length >= 3)
    .map((p) => {
      const n = p.length;
      const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      let d = '';
      const start = mid(p[n - 1], p[0]);
      d += `M${fmt(start.x)} ${fmt(start.y)}`;
      for (let i = 0; i < n; i++) {
        const ctrl = p[i];
        const next = mid(p[i], p[(i + 1) % n]);
        d += ` Q${fmt(ctrl.x)} ${fmt(ctrl.y)} ${fmt(next.x)} ${fmt(next.y)}`;
      }
      return d + ' Z';
    })
    .join(' ');
}

export function polygonCentroid(p: Polygon): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    const cross = q.x * r.y - r.x * q.y;
    a += cross;
    cx += (q.x + r.x) * cross;
    cy += (q.y + r.y) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const n = p.length;
    return { x: p.reduce((s, q) => s + q.x, 0) / n, y: p.reduce((s, q) => s + q.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Axis-aligned bounds of a set of polygons. */
export function polygonsBounds(polys: Polygon[]): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polys) {
    for (const q of p) {
      if (q.x < minX) minX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.x > maxX) maxX = q.x;
      if (q.y > maxY) maxY = q.y;
    }
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
