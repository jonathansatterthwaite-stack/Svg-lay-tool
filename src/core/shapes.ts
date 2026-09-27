import { fmt } from './matrix';

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
  return registry.get(id) ?? registry.get('rect')!;
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

function regularPolygonPoints(w: number, h: number, sides: number, startDeg = -90): Pt[] {
  const pts: Pt[] = [];
  const rx = w / 2;
  const ry = h / 2;
  for (let i = 0; i < sides; i++) {
    const a = ((startDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  return pts;
}

function ellipsePath(rx: number, ry: number, reverse = false): string {
  const sweep = reverse ? 0 : 1;
  return `M${fmt(-rx)} 0 A${fmt(rx)} ${fmt(ry)} 0 1 ${sweep} ${fmt(rx)} 0 A${fmt(rx)} ${fmt(ry)} 0 1 ${sweep} ${fmt(-rx)} 0 Z`;
}

function roundedRectPath(w: number, h: number, r: number): string {
  const hw = w / 2;
  const hh = h / 2;
  r = Math.max(0, Math.min(r, hw, hh));
  if (r === 0) {
    return poly([
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ]);
  }
  const a = (x: number, y: number) => `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x)} ${fmt(y)}`;
  return [
    `M${fmt(-hw + r)} ${fmt(-hh)}`,
    `L${fmt(hw - r)} ${fmt(-hh)}`,
    a(hw, -hh + r),
    `L${fmt(hw)} ${fmt(hh - r)}`,
    a(hw - r, hh),
    `L${fmt(-hw + r)} ${fmt(hh)}`,
    a(-hw, hh - r),
    `L${fmt(-hw)} ${fmt(-hh + r)}`,
    a(-hw + r, -hh),
    'Z',
  ].join(' ');
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
    id: 'rect',
    name: 'Rectangle',
    category: 'Basic',
    path: (w, h) => roundedRectPath(w, h, 0),
  },
  {
    id: 'rounded-rect',
    name: 'Rounded rectangle',
    category: 'Basic',
    params: [{ key: 'radius', label: 'Corner radius', min: 0, max: 50, step: 1, default: 15 }],
    path: (w, h, p) => roundedRectPath(w, h, (Math.min(w, h) * p.radius) / 100),
  },
  {
    id: 'ellipse',
    name: 'Ellipse',
    category: 'Basic',
    path: (w, h) => ellipsePath(w / 2, h / 2),
  },
  {
    id: 'triangle',
    name: 'Triangle',
    category: 'Basic',
    path: (w, h) =>
      poly([
        [0, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ]),
  },
  {
    id: 'right-triangle',
    name: 'Right triangle',
    category: 'Basic',
    path: (w, h) =>
      poly([
        [-w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ]),
  },
  {
    id: 'diamond',
    name: 'Diamond',
    category: 'Basic',
    path: (w, h) =>
      poly([
        [0, -h / 2],
        [w / 2, 0],
        [0, h / 2],
        [-w / 2, 0],
      ]),
  },
  {
    id: 'trapezoid',
    name: 'Trapezoid',
    category: 'Basic',
    params: [{ key: 'top', label: 'Top width %', min: 0, max: 100, step: 1, default: 60 }],
    path: (w, h, p) => {
      const t = (w / 2) * (p.top / 100);
      return poly([
        [-t, -h / 2],
        [t, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ]);
    },
  },
  {
    id: 'parallelogram',
    name: 'Parallelogram',
    category: 'Basic',
    params: [{ key: 'skew', label: 'Skew %', min: 0, max: 90, step: 1, default: 25 }],
    path: (w, h, p) => {
      const s = w * (p.skew / 100);
      return poly([
        [-w / 2 + s, -h / 2],
        [w / 2, -h / 2],
        [w / 2 - s, h / 2],
        [-w / 2, h / 2],
      ]);
    },
  },
  {
    id: 'semicircle',
    name: 'Semicircle',
    category: 'Basic',
    path: (w, h) => `M${fmt(-w / 2)} ${fmt(h / 2)} A${fmt(w / 2)} ${fmt(h)} 0 0 1 ${fmt(w / 2)} ${fmt(h / 2)} Z`,
  },
  {
    id: 'pie',
    name: 'Pie / sector',
    category: 'Basic',
    params: [
      { key: 'sweep', label: 'Sweep angle', min: 1, max: 359, step: 1, default: 90 },
      { key: 'start', label: 'Start angle', min: 0, max: 359, step: 1, default: 0 },
    ],
    path: (w, h, p) => {
      const rx = w / 2;
      const ry = h / 2;
      const a0 = ((p.start - 90) * Math.PI) / 180;
      const a1 = ((p.start + p.sweep - 90) * Math.PI) / 180;
      const large = p.sweep > 180 ? 1 : 0;
      return `M0 0 L${fmt(rx * Math.cos(a0))} ${fmt(ry * Math.sin(a0))} A${fmt(rx)} ${fmt(ry)} 0 ${large} 1 ${fmt(
        rx * Math.cos(a1),
      )} ${fmt(ry * Math.sin(a1))} Z`;
    },
  },
  {
    id: 'ring',
    name: 'Ring',
    category: 'Basic',
    fillRule: 'evenodd',
    params: [{ key: 'thickness', label: 'Thickness %', min: 1, max: 100, step: 1, default: 30 }],
    path: (w, h, p) => {
      const k = 1 - p.thickness / 100;
      return `${ellipsePath(w / 2, h / 2)} ${ellipsePath((w / 2) * k, (h / 2) * k, true)}`;
    },
  },
  {
    id: 'polygon',
    name: 'Polygon',
    category: 'Geometric',
    params: [{ key: 'sides', label: 'Sides', min: 3, max: 16, step: 1, default: 6 }],
    path: (w, h, p) => poly(regularPolygonPoints(w, h, Math.round(p.sides))),
  },
  {
    id: 'pentagon',
    name: 'Pentagon',
    category: 'Geometric',
    path: (w, h) => poly(regularPolygonPoints(w, h, 5)),
  },
  {
    id: 'hexagon',
    name: 'Hexagon',
    category: 'Geometric',
    path: (w, h) => poly(regularPolygonPoints(w, h, 6, 0)),
  },
  {
    id: 'octagon',
    name: 'Octagon',
    category: 'Geometric',
    path: (w, h) => poly(regularPolygonPoints(w, h, 8, 22.5)),
  },
  {
    id: 'star',
    name: 'Star',
    category: 'Geometric',
    params: [
      { key: 'points', label: 'Points', min: 3, max: 16, step: 1, default: 5 },
      { key: 'inner', label: 'Inner radius %', min: 5, max: 95, step: 1, default: 45 },
    ],
    path: (w, h, p) => {
      const n = Math.round(p.points);
      const k = p.inner / 100;
      const pts: Pt[] = [];
      for (let i = 0; i < n * 2; i++) {
        const a = (-90 + (180 / n) * i) * (Math.PI / 180);
        const r = i % 2 === 0 ? 1 : k;
        pts.push([(w / 2) * r * Math.cos(a), (h / 2) * r * Math.sin(a)]);
      }
      return poly(pts);
    },
  },
  {
    id: 'gear',
    name: 'Gear',
    category: 'Geometric',
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
      { key: 'shaft', label: 'Shaft thickness %', min: 1, max: 100, step: 1, default: 40 },
    ],
    path: (w, h, p) => {
      const hw = w / 2;
      const hh = h / 2;
      const x1 = hw - w * (p.head / 100);
      const s = hh * (p.shaft / 100);
      return poly([
        [-hw, -s],
        [x1, -s],
        [x1, -hh],
        [hw, 0],
        [x1, hh],
        [x1, s],
        [-hw, s],
      ]);
    },
  },
  {
    id: 'chevron',
    name: 'Chevron',
    category: 'Symbols',
    params: [{ key: 'thickness', label: 'Thickness %', min: 5, max: 95, step: 1, default: 40 }],
    path: (w, h, p) => {
      const hw = w / 2;
      const hh = h / 2;
      const d = w * (p.thickness / 100);
      return poly([
        [-hw, -hh],
        [-hw + d, -hh],
        [hw, 0],
        [-hw + d, hh],
        [-hw, hh],
        [hw - d, 0],
      ]);
    },
  },
  {
    id: 'plus',
    name: 'Plus / cross',
    category: 'Symbols',
    params: [{ key: 'thickness', label: 'Arm thickness %', min: 5, max: 100, step: 1, default: 30 }],
    path: (w, h, p) => {
      const hw = w / 2;
      const hh = h / 2;
      const ax = (w * (p.thickness / 100)) / 2;
      const ay = (h * (p.thickness / 100)) / 2;
      return poly([
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
      ]);
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
    path: (w, h) =>
      poly(
        norm(w, h, [
          [0.6, 0],
          [0.15, 0.58],
          [0.45, 0.58],
          [0.3, 1],
          [0.85, 0.4],
          [0.55, 0.4],
          [0.75, 0],
        ]),
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
