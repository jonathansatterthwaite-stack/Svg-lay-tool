import { fmt } from './matrix';
import { starBendForPolygon } from './modifiers';

/** A numeric parameter a shape exposes (corner radius, star points ...). */
export interface ShapeParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface ShapeDefinition {
  id: string;
  name: string;
  category: string;
  params?: ShapeParam[];
  /** Use `evenodd` for shapes with holes (ring, gear). */
  fillRule?: 'nonzero' | 'evenodd';
  /**
   * Produce SVG path data for the shape at the given size, centred on the
   * origin (x from -w/2..w/2, y from -h/2..h/2).
   */
  path: (width: number, height: number, params: Record<string, number>) => string;
}

const registry = new Map<string, ShapeDefinition>();

export function registerShape(def: ShapeDefinition): void {
  registry.set(def.id, def);
}

export function unregisterShape(id: string): void {
  registry.delete(id);
}

export function getShape(id: string): ShapeDefinition {
  return registry.get(id) ?? registry.get(SHAPE_ALIASES[id]?.id ?? '') ?? registry.get('polygon')!;
}

export function hasShape(id: string): boolean {
  return registry.has(id);
}

export function listShapes(): ShapeDefinition[] {
  return [...registry.values()];
}

export function defaultShapeParams(def: ShapeDefinition): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of def.params ?? []) out[p.key] = p.default;
  return out;
}

/** Path data for a shape with defaults filled in for missing params. */
export function shapePath(
  shapeId: string,
  width: number,
  height: number,
  params: Record<string, number> = {},
): string {
  const def = getShape(shapeId);
  return def.path(width, height, { ...defaultShapeParams(def), ...params });
}

// ---------------------------------------------------------------------------
// Helpers

type Pt = [number, number];

function poly(points: Pt[]): string {
  if (points.length === 0) return '';
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join(' ') + ' Z';
}

/** Map normalised (0..1) coordinates to a centred box. */
function norm(w: number, h: number, pts: Pt[]): Pt[] {
  return pts.map(([nx, ny]) => [nx * w - w / 2, ny * h - h / 2]);
}

/**
 * Regular polygon with a flat bottom edge, stretched to fill the w×h box
 * (so 4 sides is an axis-aligned rectangle and 3 an isosceles triangle).
 */
function regularPolygonPoints(w: number, h: number, sides: number): Pt[] {
  const n = Math.max(3, Math.round(sides));
  const startDeg = 90 + 180 / n; // symmetric about straight down → horizontal bottom edge
  const raw: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180;
    raw.push([Math.cos(a), Math.sin(a)]);
  }
  return fitToBox(raw, w, h);
}

/** Scale/translate points so their bounding box becomes the centred w×h box. */
function fitToBox(pts: Pt[], w: number, h: number): Pt[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const sw = maxX - minX || 1;
  const sh = maxY - minY || 1;
  return pts.map(([x, y]) => [((x - minX) / sw - 0.5) * w, ((y - minY) / sh - 0.5) * h]);
}

/**
 * Path for a closed polygon with rounded corners. `radius` is the distance
 * cut back along each edge; it is clamped to half of the shorter adjacent edge.
 */
function roundedPoly(points: Pt[], radius: number): string {
  if (radius <= 0.01 || points.length < 3) return poly(points);
  const n = points.length;
  const segs: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const d1 = dist(prev, cur);
    const d2 = dist(cur, next);
    const cut = Math.min(radius, d1 / 2, d2 / 2);
    if (cut < 0.01 || d1 === 0 || d2 === 0) {
      segs.push(`${i === 0 ? 'M' : 'L'}${fmt(cur[0])} ${fmt(cur[1])}`);
      continue;
    }
    const p1: Pt = [cur[0] + ((prev[0] - cur[0]) / d1) * cut, cur[1] + ((prev[1] - cur[1]) / d1) * cut];
    const p2: Pt = [cur[0] + ((next[0] - cur[0]) / d2) * cut, cur[1] + ((next[1] - cur[1]) / d2) * cut];
    // Interior angle → circular arc radius that meets both edges tangentially.
    const v1 = [prev[0] - cur[0], prev[1] - cur[1]];
    const v2 = [next[0] - cur[0], next[1] - cur[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (d1 * d2);
    const theta = Math.acos(Math.max(-1, Math.min(1, cos)));
    const r = cut * Math.tan(theta / 2);
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    const sweep = cross > 0 ? 0 : 1;
    segs.push(`${i === 0 ? 'M' : 'L'}${fmt(p1[0])} ${fmt(p1[1])}`);
    if (Number.isFinite(r) && r > 0.01) segs.push(`A${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(p2[0])} ${fmt(p2[1])}`);
    else segs.push(`Q${fmt(cur[0])} ${fmt(cur[1])} ${fmt(p2[0])} ${fmt(p2[1])}`);
  }
  return segs.join(' ') + ' Z';
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function arcPoint(rx: number, ry: number, deg: number): Pt {
  const a = ((deg - 90) * Math.PI) / 180;
  return [rx * Math.cos(a), ry * Math.sin(a)];
}

const RADIUS_PARAM: ShapeParam = { key: 'radius', label: 'Corner radius %', min: 0, max: 100, step: 1, default: 0 };

function cornerRadius(w: number, h: number, pct: number): number {
  return (Math.min(w, h) / 2) * (pct / 100);
}

function ellipsePath(rx: number, ry: number, reverse = false): string {
  const sweep = reverse ? 0 : 1;
  return `M${fmt(-rx)} 0 A${fmt(rx)} ${fmt(ry)} 0 1 ${sweep} ${fmt(rx)} 0 A${fmt(rx)} ${fmt(ry)} 0 1 ${sweep} ${fmt(-rx)} 0 Z`;
}

/** Cubic path from normalised coordinates: array of ['M'|'L'|'C'|'Z', ...numbers]. */
function normPath(w: number, h: number, cmds: (string | number)[][]): string {
  return cmds
    .map((cmd) => {
      const [op, ...nums] = cmd as [string, ...number[]];
      const coords: string[] = [];
      for (let i = 0; i < nums.length; i += 2) {
        coords.push(`${fmt(nums[i] * w - w / 2)} ${fmt(nums[i + 1] * h - h / 2)}`);
      }
      return op + coords.join(' ');
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Built-in library

const builtin: ShapeDefinition[] = [
  {
    id: 'polygon',
    name: 'Polygon',
    category: 'Basic',
    params: [{ key: 'sides', label: 'Sides', min: 3, max: 24, step: 1, default: 4 }, RADIUS_PARAM],
    path: (w, h, p) => roundedPoly(regularPolygonPoints(w, h, p.sides), cornerRadius(w, h, p.radius)),
  },
  {
    id: 'ellipse',
    name: 'Ellipse / arc',
    category: 'Basic',
    fillRule: 'evenodd',
    params: [
      { key: 'sweep', label: 'Sweep angle', min: 1, max: 360, step: 1, default: 360 },
      { key: 'start', label: 'Start angle', min: 0, max: 359, step: 1, default: 0 },
      { key: 'hole', label: 'Hole %', min: 0, max: 99, step: 1, default: 0 },
    ],
    path: (w, h, p) => {
      const rx = w / 2;
      const ry = h / 2;
      const k = p.hole / 100;
      const full = p.sweep >= 360;
      if (full) {
        const outer = ellipsePath(rx, ry);
        return k > 0 ? `${outer} ${ellipsePath(rx * k, ry * k, true)}` : outer;
      }
      const large = p.sweep > 180 ? 1 : 0;
      const [x0, y0] = arcPoint(rx, ry, p.start);
      const [x1, y1] = arcPoint(rx, ry, p.start + p.sweep);
      if (k <= 0) {
        return `M0 0 L${fmt(x0)} ${fmt(y0)} A${fmt(rx)} ${fmt(ry)} 0 ${large} 1 ${fmt(x1)} ${fmt(y1)} Z`;
      }
      const [ix0, iy0] = arcPoint(rx * k, ry * k, p.start);
      const [ix1, iy1] = arcPoint(rx * k, ry * k, p.start + p.sweep);
      return `M${fmt(x0)} ${fmt(y0)} A${fmt(rx)} ${fmt(ry)} 0 ${large} 1 ${fmt(x1)} ${fmt(y1)} L${fmt(ix1)} ${fmt(iy1)} A${fmt(
        rx * k,
      )} ${fmt(ry * k)} 0 ${large} 0 ${fmt(ix0)} ${fmt(iy0)} Z`;
    },
  },
  {
    id: 'gear',
    name: 'Gear',
    category: 'Basic',
    fillRule: 'evenodd',
    params: [
      { key: 'teeth', label: 'Teeth', min: 4, max: 24, step: 1, default: 8 },
      { key: 'depth', label: 'Tooth depth %', min: 5, max: 50, step: 1, default: 25 },
      { key: 'hole', label: 'Hole %', min: 0, max: 80, step: 1, default: 30 },
    ],
    path: (w, h, p) => {
      const n = Math.round(p.teeth);
      const outer = 1;
      const inner = 1 - p.depth / 100;
      const period = (Math.PI * 2) / n;
      const pts: Pt[] = [];
      const at = (r: number, a: number): Pt => [(w / 2) * r * Math.cos(a), (h / 2) * r * Math.sin(a)];
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * period;
        pts.push(at(inner, a0));
        pts.push(at(outer, a0 + period * 0.15));
        pts.push(at(outer, a0 + period * 0.35));
        pts.push(at(inner, a0 + period * 0.5));
      }
      let d = poly(pts);
      if (p.hole > 0) {
        const k = (p.hole / 100) * inner;
        d += ' ' + ellipsePath((w / 2) * k, (h / 2) * k, true);
      }
      return d;
    },
  },
  {
    id: 'arrow',
    name: 'Arrow',
    category: 'Symbols',
    params: [
      { key: 'head', label: 'Head length %', min: 5, max: 100, step: 1, default: 40 },
      { key: 'shaft', label: 'Shaft thickness %', min: 0, max: 100, step: 1, default: 40 },
      RADIUS_PARAM,
    ],
    path: (w, h, p) => {
      const hw = w / 2;
      const hh = h / 2;
      const x1 = hw - w * (p.head / 100);
      const s = hh * (p.shaft / 100);
      const pts: Pt[] =
        s < 0.01
          ? [
              [x1, -hh],
              [hw, 0],
              [x1, hh],
            ]
          : [
              [-hw, -s],
              [x1, -s],
              [x1, -hh],
              [hw, 0],
              [x1, hh],
              [x1, s],
              [-hw, s],
            ];
      return roundedPoly(pts, cornerRadius(w, h, p.radius));
    },
  },
  {
    id: 'chevron',
    name: 'Chevron',
    category: 'Symbols',
    params: [{ key: 'thickness', label: 'Thickness %', min: 5, max: 100, step: 1, default: 40 }, RADIUS_PARAM],
    path: (w, h, p) => {
      const hw = w / 2;
      const hh = h / 2;
      const d = w * (p.thickness / 100);
      const pts: Pt[] =
        p.thickness >= 100
          ? [
              [-hw, -hh],
              [hw, 0],
              [-hw, hh],
            ]
          : [
              [-hw, -hh],
              [-hw + d, -hh],
              [hw, 0],
              [-hw + d, hh],
              [-hw, hh],
              [hw - d, 0],
            ];
      return roundedPoly(pts, cornerRadius(w, h, p.radius));
    },
  },
  {
    id: 'plus',
    name: 'Plus / cross',
    category: 'Symbols',
    params: [{ key: 'thickness', label: 'Arm thickness %', min: 5, max: 100, step: 1, default: 30 }, RADIUS_PARAM],
    path: (w, h, p) => {
      const hw = w / 2;
      const hh = h / 2;
      const ax = (w * (p.thickness / 100)) / 2;
      const ay = (h * (p.thickness / 100)) / 2;
      return roundedPoly(
        [
          [-ax, -hh],
          [ax, -hh],
          [ax, -ay],
          [hw, -ay],
          [hw, ay],
          [ax, ay],
          [ax, hh],
          [-ax, hh],
          [-ax, ay],
          [-hw, ay],
          [-hw, -ay],
          [-ax, -ay],
        ],
        cornerRadius(w, h, p.radius),
      );
    },
  },
  {
    id: 'crescent',
    name: 'Crescent',
    category: 'Symbols',
    params: [{ key: 'thickness', label: 'Thickness %', min: 5, max: 95, step: 1, default: 50 }],
    path: (w, h, p) => {
      const hw = w / 2;
      const hh = h / 2;
      const innerRx = hw * (1 - p.thickness / 100);
      return `M0 ${fmt(-hh)} A${fmt(hw)} ${fmt(hh)} 0 0 1 0 ${fmt(hh)} A${fmt(innerRx)} ${fmt(hh)} 0 0 0 0 ${fmt(-hh)} Z`;
    },
  },
  {
    id: 'heart',
    name: 'Heart',
    category: 'Symbols',
    path: (w, h) =>
      normPath(w, h, [
        ['M', 0.5, 1],
        ['C', 0.2, 0.75, 0, 0.55, 0, 0.32],
        ['C', 0, 0.14, 0.14, 0, 0.3, 0],
        ['C', 0.39, 0, 0.46, 0.05, 0.5, 0.13],
        ['C', 0.54, 0.05, 0.61, 0, 0.7, 0],
        ['C', 0.86, 0, 1, 0.14, 1, 0.32],
        ['C', 1, 0.55, 0.8, 0.75, 0.5, 1],
        ['Z'],
      ]),
  },
  {
    id: 'lightning',
    name: 'Lightning',
    category: 'Symbols',
    params: [RADIUS_PARAM],
    path: (w, h, p) =>
      roundedPoly(
        norm(w, h, [
          [0.6, 0],
          [0.15, 0.58],
          [0.45, 0.58],
          [0.3, 1],
          [0.85, 0.4],
          [0.55, 0.4],
          [0.75, 0],
        ]),
        cornerRadius(w, h, p.radius),
      ),
  },
  {
    id: 'teardrop',
    name: 'Teardrop',
    category: 'Symbols',
    path: (w, h) => {
      const hw = w / 2;
      const hh = h / 2;
      return `M0 ${fmt(-hh)} C${fmt(hw * 1.05)} ${fmt(-hh * 0.15)} ${fmt(hw * 0.95)} ${fmt(hh)} 0 ${fmt(hh)} C${fmt(
        -hw * 0.95,
      )} ${fmt(hh)} ${fmt(-hw * 1.05)} ${fmt(-hh * 0.15)} 0 ${fmt(-hh)} Z`;
    },
  },
  {
    id: 'shield',
    name: 'Shield',
    category: 'Symbols',
    path: (w, h) =>
      normPath(w, h, [
        ['M', 0.5, 0],
        ['L', 1, 0.15],
        ['L', 1, 0.5],
        ['C', 1, 0.75, 0.8, 0.92, 0.5, 1],
        ['C', 0.2, 0.92, 0, 0.75, 0, 0.5],
        ['L', 0, 0.15],
        ['Z'],
      ]),
  },
];

for (const def of builtin) registerShape(def);

export const BUILTIN_SHAPE_IDS: readonly string[] = builtin.map((d) => d.id);

/**
 * Ids from earlier versions (and handy names) mapped onto the consolidated
 * shapes. `resolveShapeAlias` is applied when creating or loading layers, so
 * old documents keep rendering the same picture.
 */
export interface ShapeAlias {
  id: string;
  params: Record<string, number>;
  /** Modifiers (as plain init objects) that reproduce the old shape from the new one. */
  modifiers?: Record<string, unknown>[];
}

export const SHAPE_ALIASES: Record<string, ShapeAlias> = {
  rect: { id: 'polygon', params: { sides: 4 } },
  rectangle: { id: 'polygon', params: { sides: 4 } },
  square: { id: 'polygon', params: { sides: 4 } },
  'rounded-rect': { id: 'polygon', params: { sides: 4, radius: 30 } },
  triangle: { id: 'polygon', params: { sides: 3 } },
  pentagon: { id: 'polygon', params: { sides: 5 } },
  hexagon: { id: 'polygon', params: { sides: 6 } },
  octagon: { id: 'polygon', params: { sides: 8 } },
  diamond: { id: 'polygon', params: { sides: 4 } },
  circle: { id: 'ellipse', params: {} },
  ring: { id: 'ellipse', params: { hole: 70 } },
  pie: { id: 'ellipse', params: { sweep: 90 } },
  semicircle: { id: 'ellipse', params: { sweep: 180, start: 270 } },
  trapezoid: { id: 'polygon', params: { sides: 4 }, modifiers: [{ type: 'deform', top: 60, bottom: 100, skew: 0 }] },
  quad: { id: 'polygon', params: { sides: 4 }, modifiers: [{ type: 'deform', top: 60, bottom: 100, skew: 0 }] },
  parallelogram: { id: 'polygon', params: { sides: 4 }, modifiers: [{ type: 'deform', top: 75, bottom: 100, skew: 12.5 }] },
  'right-triangle': { id: 'polygon', params: { sides: 4 }, modifiers: [{ type: 'deform', top: 0, bottom: 100, skew: -50 }] },
  star: { id: 'polygon', params: { sides: 5 }, modifiers: [{ type: 'edges', subdivisions: 1, bend: -63.9, smooth: false }] },
};

/** Map legacy/alias shape ids onto registered shapes, translating parameters. */
export function resolveShapeAlias(
  shapeId: string,
  params: Record<string, number> = {},
): { id: string; params: Record<string, number>; modifiers?: Record<string, unknown>[] } {
  if (registry.has(shapeId)) return { id: shapeId, params };
  const alias = SHAPE_ALIASES[shapeId];
  if (!alias) return { id: shapeId, params };
  const out = { ...alias.params };
  let modifiers = alias.modifiers?.map((m) => ({ ...m }));
  if (shapeId === 'star') {
    const points = typeof params.points === 'number' ? Math.round(params.points) : 5;
    const inner = typeof params.inner === 'number' ? params.inner / 100 : 0.45;
    out.sides = points;
    modifiers = [{ type: 'edges', subdivisions: 1, bend: starBendForPolygon(points, inner), smooth: false }];
  }
  if ((shapeId === 'quad' || shapeId === 'trapezoid') && modifiers) {
    if (typeof params.top === 'number') modifiers[0].top = params.top;
    if (typeof params.offset === 'number') modifiers[0].skew = (params.offset / 100) * (1 - (Number(modifiers[0].top) || 0) / 100) * 50;
  }
  // Old ring/rounded-rect parameters were expressed differently.
  if (shapeId === 'ring' && typeof params.thickness === 'number') out.hole = 100 - params.thickness;
  if (shapeId === 'rounded-rect' && typeof params.radius === 'number') out.radius = params.radius * 2;
  if (shapeId === 'pie') {
    if (typeof params.sweep === 'number') out.sweep = params.sweep;
    if (typeof params.start === 'number') out.start = params.start;
  }
  return { id: alias.id, params: out, modifiers };
}
