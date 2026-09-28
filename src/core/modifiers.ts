import { createEffect } from './effects';
import { createId } from './ids';
import { flattenPath, polygonCentroid, polygonsToPath, polygonsToRoundedPath, polygonsToSmoothPath, type Polygon } from './path';
import type { Effect, EffectType, Fill, Layer, MaskSettings, Modifier, ModifierType, Point, Stroke } from './types';

export interface ModifierDefinition {
  type: ModifierType;
  label: string;
  /** Applies to shape layers only (groups have no outline or paint of their own). */
  shapeOnly: boolean;
  /** Only one of these makes sense per layer. */
  single: boolean;
  /** Changes the outline geometry (applied in list order before painting). */
  geometry: boolean;
}

export const MODIFIER_DEFS: Record<ModifierType, ModifierDefinition> = {
  fill: { type: 'fill', label: 'Fill', shapeOnly: true, single: true, geometry: false },
  stroke: { type: 'stroke', label: 'Stroke', shapeOnly: true, single: true, geometry: false },
  deform: { type: 'deform', label: 'Deform', shapeOnly: true, single: false, geometry: true },
  round: { type: 'round', label: 'Round corners', shapeOnly: true, single: false, geometry: true },
  edges: { type: 'edges', label: 'Edges', shapeOnly: true, single: false, geometry: true },
  effect: { type: 'effect', label: 'Effect', shapeOnly: false, single: false, geometry: false },
  mask: { type: 'mask', label: 'Mask', shapeOnly: false, single: true, geometry: false },
};

export const MODIFIER_TYPES = Object.keys(MODIFIER_DEFS) as ModifierType[];

type ModifierInit<T extends ModifierType> = Partial<Omit<Extract<Modifier, { type: T }>, 'type' | 'id'>>;

/** Build a modifier with sensible defaults. `createModifier('effect', { effect: createEffect('blur') })`. */
export function createModifier<T extends ModifierType>(type: T, init: ModifierInit<T> = {}): Extract<Modifier, { type: T }> {
  const base = { id: createId('m'), enabled: true };
  let m: Modifier;
  switch (type) {
    case 'fill':
      m = { ...base, type: 'fill', fill: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] } };
      break;
    case 'stroke':
      m = { ...base, type: 'stroke', color: null, width: 4 };
      break;
    case 'effect':
      m = { ...base, type: 'effect', effect: createEffect('blur') };
      break;
    case 'mask':
      m = { ...base, type: 'mask', mode: 'clip', showShape: false, effects: [] };
      break;
    case 'deform':
      m = { ...base, type: 'deform', top: 60, bottom: 100, skew: 0 };
      break;
    case 'round':
      m = { ...base, type: 'round', radius: 20 };
      break;
    case 'edges':
      m = { ...base, type: 'edges', subdivisions: 1, bend: -40, smooth: false };
      break;
    default:
      throw new Error(`Unknown modifier type ${String(type)}`);
  }
  return { ...m, ...(init as object) } as Extract<Modifier, { type: T }>;
}

/** Shorthand: an effect modifier for the given effect type. */
export function createEffectModifier(type: EffectType, overrides: Record<string, unknown> = {}): Modifier {
  return createModifier('effect', { effect: createEffect(type, overrides) });
}

export function createMaskModifier(init: Partial<MaskSettings> = {}): Modifier {
  return createModifier('mask', init);
}

// ---------------------------------------------------------------------------
// Reading a layer's modifiers

export function enabledModifiers(layer: Layer): Modifier[] {
  return (layer.modifiers ?? []).filter((m) => m.enabled);
}

/** The effective fill: the last enabled fill modifier, else the layer colour. */
export function layerFill(layer: Layer): Fill {
  if (layer.type !== 'shape') return { type: 'none' };
  let fill: Fill = { type: 'solid', color: layer.color };
  for (const m of enabledModifiers(layer)) if (m.type === 'fill') fill = m.fill;
  return fill;
}

/** The effective stroke (colour falls back to the layer colour), or null. */
export function layerStroke(layer: Layer): Stroke | null {
  if (layer.type !== 'shape') return null;
  let stroke: Stroke | null = null;
  for (const m of enabledModifiers(layer)) {
    if (m.type === 'stroke') stroke = { color: m.color ?? layer.color, width: m.width };
  }
  return stroke;
}

/** Effects from enabled effect modifiers, in order. */
export function layerEffects(layer: Layer): Effect[] {
  const out: Effect[] = [];
  for (const m of enabledModifiers(layer)) if (m.type === 'effect') out.push(m.effect);
  return out;
}

/** The mask settings when this layer acts as a mask, else null. */
export function layerMask(layer: Layer): MaskSettings | null {
  for (const m of enabledModifiers(layer)) {
    if (m.type === 'mask') return { mode: m.mode, showShape: m.showShape, effects: m.effects };
  }
  return null;
}

/** Whether any mask modifier exists (even disabled) - used for badges. */
export function hasMaskModifier(layer: Layer): boolean {
  return (layer.modifiers ?? []).some((m) => m.type === 'mask');
}

// ---------------------------------------------------------------------------
// Geometry modifiers

export function geometryModifiers(layer: Layer): Modifier[] {
  return enabledModifiers(layer).filter((m) => MODIFIER_DEFS[m.type].geometry);
}

/**
 * Apply the layer's geometry modifiers to path data generated for a box of
 * `width` × `height` centred on the origin. Returns the original path when
 * there is nothing to do.
 */
export function applyGeometryModifiers(d: string, modifiers: Modifier[], width: number, height: number): string {
  const geo = modifiers.filter((m) => m.enabled && MODIFIER_DEFS[m.type].geometry);
  if (geo.length === 0) return d;
  const tolerance = Math.max(0.5, Math.max(width, height) / 96);
  // Each step works on the flattened outline of the previous result, so
  // curves produced by one modifier (rounded corners, smooth edges) can be
  // reshaped by the next.
  let polys = flattenPath(d, tolerance);
  let out = d;
  for (const m of geo) {
    if (m.type === 'deform') {
      polys = polys.map((p) => p.map((pt) => deformPoint(pt, width, height, m.top, m.bottom, m.skew)));
      out = polygonsToPath(polys);
    } else if (m.type === 'edges') {
      polys = polys.map((p) => bendEdges(p, m.subdivisions, m.bend));
      out = m.smooth ? polygonsToSmoothPath(polys) : polygonsToPath(polys);
      if (m.smooth) polys = flattenPath(out, tolerance);
    } else if (m.type === 'round') {
      out = polygonsToRoundedPath(polys, (Math.min(width, height) / 2) * (m.radius / 100));
      polys = flattenPath(out, tolerance);
    }
  }
  return out;
}

function deformPoint(p: Point, w: number, h: number, top: number, bottom: number, skew: number): Point {
  if (h <= 0) return p;
  const t = Math.max(0, Math.min(1, (p.y + h / 2) / h)); // 0 at the top edge, 1 at the bottom
  const sx = ((top / 100) * (1 - t) + (bottom / 100) * t);
  const offset = ((skew / 100) * w) * (1 - t);
  return { x: p.x * sx + offset, y: p.y };
}

/** Insert `n` points on every edge and push them along the outward normal by bend % of half the edge length. */
export function bendEdges(poly: Polygon, n: number, bend: number): Polygon {
  const count = Math.max(0, Math.round(n));
  if (count === 0 || poly.length < 3) return poly;
  const c = polygonCentroid(poly);
  const out: Polygon = [];
  const len = poly.length;
  for (let i = 0; i < len; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % len];
    out.push(a);
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const L = Math.hypot(ex, ey);
    if (L < 1e-9) continue;
    // Normal pointing away from the centroid.
    let nx = -ey / L;
    let ny = ex / L;
    const mx = (a.x + b.x) / 2 - c.x;
    const my = (a.y + b.y) / 2 - c.y;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }
    const amount = (bend / 100) * (L / 2);
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      // Bulge profile: full displacement in the middle, tapering to the corners.
      const profile = Math.sin(Math.PI * t);
      out.push({ x: a.x + ex * t + nx * amount * profile, y: a.y + ey * t + ny * amount * profile });
    }
  }
  return out;
}

/**
 * Edge bend that turns a regular n-gon into a star whose inner radius is
 * `inner` (0..1) of the outer radius, for one subdivision per edge.
 */
export function starBendForPolygon(sides: number, inner: number): number {
  const half = Math.PI / sides;
  // apothem of the polygon in units of R, minus the desired inner radius, relative to half the edge length
  return (-(Math.cos(half) - inner) / Math.sin(half)) * 100;
}
