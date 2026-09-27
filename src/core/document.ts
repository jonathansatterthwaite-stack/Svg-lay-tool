import { createId } from './ids';
import {
  applyToPoint,
  compose,
  type Mat,
  multiply,
  rotate,
  scale,
  transformRect,
  translate,
  unionRects,
  IDENTITY,
} from './matrix';
import { EFFECT_DEFS } from './effects';
import { defaultShapeParams, getShape, resolveShapeAlias } from './shapes';
import type { Effect, GroupLayer, Layer, Mat2, MaskSettings, Rect, ShapeLayer, SvgDocument } from './types';

// ---------------------------------------------------------------------------
// Creation

export interface CreateDocumentOptions {
  width?: number;
  height?: number;
  background?: string | null;
  layers?: Layer[];
}

export function createDocument(opts: CreateDocumentOptions = {}): SvgDocument {
  return {
    version: 1,
    width: opts.width ?? 512,
    height: opts.height ?? 512,
    background: opts.background === undefined ? null : opts.background,
    layers: opts.layers ?? [],
  };
}

export type ShapeLayerInit = Partial<Omit<ShapeLayer, 'type' | 'id'>> & { shape?: string };
export type GroupLayerInit = Partial<Omit<GroupLayer, 'type' | 'id'>>;

export function createShapeLayer(init: ShapeLayerInit = {}): ShapeLayer {
  const resolved = resolveShapeAlias(init.shape ?? 'polygon', init.params ?? {});
  const def = getShape(resolved.id);
  init = { ...init, shape: def.id, params: resolved.params };
  return {
    type: 'shape',
    id: createId('l'),
    name: init.name ?? def.name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    rotation: 0,
    effects: [],
    mask: null,
    shape: def.id,
    params: { ...defaultShapeParams(def), ...(init.params ?? {}) },
    width: 100,
    height: 100,
    stretch: { ...IDENTITY2 },
    flipX: false,
    flipY: false,
    fill: { type: 'solid', color: '#e8e8e8' },
    stroke: null,
    ...stripUndefined(init),
    // params merged above; never let a partial override drop defaults
    ...(init.params ? { params: { ...defaultShapeParams(def), ...init.params } } : {}),
  };
}

export function createGroupLayer(init: GroupLayerInit = {}): GroupLayer {
  return {
    type: 'group',
    id: createId('g'),
    name: init.name ?? 'Group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    rotation: 0,
    effects: [],
    mask: null,
    scale: 1,
    children: [],
    ...stripUndefined(init),
  };
}

export function createMaskSettings(overrides: Partial<MaskSettings> = {}): MaskSettings {
  return { mode: 'clip', effects: [], showShape: false, ...overrides };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Traversal

export interface LayerLocation {
  layer: Layer;
  /** Parent group, or null when at the root. */
  parent: GroupLayer | null;
  /** The array the layer lives in. */
  siblings: Layer[];
  index: number;
  /** Root first. */
  ancestors: GroupLayer[];
}

export function locateLayer(doc: SvgDocument, id: string): LayerLocation | null {
  const walk = (layers: Layer[], parent: GroupLayer | null, ancestors: GroupLayer[]): LayerLocation | null => {
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (layer.id === id) return { layer, parent, siblings: layers, index: i, ancestors };
      if (layer.type === 'group') {
        const found = walk(layer.children, layer, [...ancestors, layer]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(doc.layers, null, []);
}

export function findLayer(doc: SvgDocument, id: string): Layer | null {
  return locateLayer(doc, id)?.layer ?? null;
}

/** Depth-first, bottom to top, parents before children. */
export function walkLayers(layers: Layer[], fn: (layer: Layer, depth: number, parent: GroupLayer | null) => void): void {
  const walk = (ls: Layer[], depth: number, parent: GroupLayer | null) => {
    for (const l of ls) {
      fn(l, depth, parent);
      if (l.type === 'group') walk(l.children, depth + 1, l);
    }
  };
  walk(layers, 0, null);
}

export function allLayerIds(doc: SvgDocument): Set<string> {
  const ids = new Set<string>();
  walkLayers(doc.layers, (l) => ids.add(l.id));
  return ids;
}

export function isDescendantOf(doc: SvgDocument, id: string, ancestorId: string): boolean {
  const loc = locateLayer(doc, id);
  return !!loc && loc.ancestors.some((a) => a.id === ancestorId);
}

// ---------------------------------------------------------------------------
// Immutable tree edits

function mapTree(layers: Layer[], id: string, fn: (layer: Layer) => Layer | null): Layer[] {
  let changed = false;
  const out: Layer[] = [];
  for (const layer of layers) {
    if (layer.id === id) {
      changed = true;
      const next = fn(layer);
      if (next) out.push(next);
      continue;
    }
    if (layer.type === 'group') {
      const children = mapTree(layer.children, id, fn);
      if (children !== layer.children) {
        changed = true;
        out.push({ ...layer, children });
        continue;
      }
    }
    out.push(layer);
  }
  return changed ? out : layers;
}

function insertTree(layers: Layer[], parentId: string | null, index: number, layer: Layer): Layer[] {
  if (parentId === null) {
    const out = [...layers];
    out.splice(clampIndex(index, out.length), 0, layer);
    return out;
  }
  return mapTree(layers, parentId, (p) => {
    if (p.type !== 'group') return p;
    const children = [...p.children];
    children.splice(clampIndex(index, children.length), 0, layer);
    return { ...p, children };
  });
}

function clampIndex(i: number, len: number): number {
  if (!Number.isFinite(i)) return len;
  return Math.max(0, Math.min(len, Math.round(i)));
}

export function updateLayer<T extends Layer = Layer>(
  doc: SvgDocument,
  id: string,
  patch: Partial<T> | ((layer: T) => T),
): SvgDocument {
  const layers = mapTree(doc.layers, id, (l) =>
    typeof patch === 'function' ? patch(l as T) : ({ ...l, ...patch } as Layer),
  );
  return layers === doc.layers ? doc : { ...doc, layers };
}

export function updateLayers(
  doc: SvgDocument,
  ids: Iterable<string>,
  patch: Partial<Layer> | ((layer: Layer) => Layer),
): SvgDocument {
  let out = doc;
  for (const id of ids) out = updateLayer(out, id, patch);
  return out;
}

/** Insert `layer` into `parentId` (null = root) at `index` (default: on top). */
export function insertLayer(doc: SvgDocument, layer: Layer, parentId: string | null = null, index = Infinity): SvgDocument {
  return { ...doc, layers: insertTree(doc.layers, parentId, index, layer) };
}

export function removeLayers(doc: SvgDocument, ids: Iterable<string>): SvgDocument {
  let layers = doc.layers;
  for (const id of ids) layers = mapTree(layers, id, () => null);
  return layers === doc.layers ? doc : { ...doc, layers };
}

/**
 * Move a layer to a new parent/index. `index` is the position in the target
 * array *after* the layer has been removed from its old location.
 */
export function moveLayer(doc: SvgDocument, id: string, parentId: string | null, index: number): SvgDocument {
  const loc = locateLayer(doc, id);
  if (!loc) return doc;
  if (parentId === id || (parentId && isDescendantOf(doc, parentId, id))) return doc;
  const without = mapTree(doc.layers, id, () => null);
  return { ...doc, layers: insertTree(without, parentId, index, loc.layer) };
}

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

/** Reorder a layer within its siblings. */
export function reorderLayer(doc: SvgDocument, id: string, direction: ReorderDirection): SvgDocument {
  const loc = locateLayer(doc, id);
  if (!loc) return doc;
  const last = loc.siblings.length - 1;
  let target = loc.index;
  switch (direction) {
    case 'forward':
      target = Math.min(last, loc.index + 1);
      break;
    case 'backward':
      target = Math.max(0, loc.index - 1);
      break;
    case 'front':
      target = last;
      break;
    case 'back':
      target = 0;
      break;
  }
  if (target === loc.index) return doc;
  return moveLayer(doc, id, loc.parent?.id ?? null, target);
}

/** Reorder several layers, preserving their relative order. */
export function reorderLayers(doc: SvgDocument, ids: string[], direction: ReorderDirection): SvgDocument {
  const ordered = sortByStackOrder(doc, ids);
  // Moving forward: process from top-most down so items do not leapfrog each other.
  const seq = direction === 'forward' || direction === 'front' ? [...ordered].reverse() : ordered;
  let out = doc;
  for (const id of seq) out = reorderLayer(out, id, direction);
  return out;
}

/** Sort ids bottom-to-top in document traversal order. */
export function sortByStackOrder(doc: SvgDocument, ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  const out: string[] = [];
  walkLayers(doc.layers, (l) => {
    if (wanted.has(l.id)) out.push(l.id);
  });
  return out;
}

/** Deep clone with fresh ids (layers and effects). */
export function cloneLayer(layer: Layer): Layer {
  const cloneEffects = (effects: Effect[]) => effects.map((e) => ({ ...e, id: createId('e') }));
  const base = {
    ...layer,
    id: createId(layer.type === 'group' ? 'g' : 'l'),
    effects: cloneEffects(layer.effects),
    mask: layer.mask ? { ...layer.mask, effects: cloneEffects(layer.mask.effects) } : null,
  };
  if (base.type === 'group') {
    return { ...base, children: base.children.map(cloneLayer) };
  }
  return { ...base, params: { ...base.params }, stretch: { ...(base.stretch ?? IDENTITY2) }, fill: { ...base.fill }, stroke: base.stroke ? { ...base.stroke } : null };
}

/** Duplicate layers in place (each copy goes directly above its source). Returns new ids. */
export function duplicateLayers(doc: SvgDocument, ids: Iterable<string>): { doc: SvgDocument; ids: string[] } {
  let out = doc;
  const newIds: string[] = [];
  for (const id of sortByStackOrder(doc, ids)) {
    const loc = locateLayer(out, id);
    if (!loc) continue;
    const copy = cloneLayer(loc.layer);
    copy.name = nextCopyName(copy.name);
    out = insertLayer(out, copy, loc.parent?.id ?? null, loc.index + 1);
    newIds.push(copy.id);
  }
  return { doc: out, ids: newIds };
}

function nextCopyName(name: string): string {
  const m = /^(.*?)(?: copy(?: (\d+))?)?$/.exec(name);
  if (!m) return `${name} copy`;
  const base = m[1];
  if (m[0] === base) return `${base} copy`;
  const n = m[2] ? parseInt(m[2], 10) + 1 : 2;
  return `${base} copy ${n}`;
}

// ---------------------------------------------------------------------------
// Geometry

export const IDENTITY2: Mat2 = { a: 1, b: 0, c: 0, d: 1 };

function mat2ToMat(m: Mat2): Mat {
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: 0, f: 0 };
}

function mul2(m1: Mat2, m2: Mat2): Mat2 {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
  };
}

function rot2(deg: number): Mat2 {
  const r = (deg * Math.PI) / 180;
  return { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r) };
}

export function isIdentity2(m: Mat2, eps = 1e-6): boolean {
  return Math.abs(m.a - 1) < eps && Math.abs(m.b) < eps && Math.abs(m.c) < eps && Math.abs(m.d - 1) < eps;
}

/** The linear part of a shape's transform: stretch · rotation · flip. */
export function shapeLinear(layer: ShapeLayer): Mat {
  return compose(
    mat2ToMat(layer.stretch ?? IDENTITY2),
    rotate(layer.rotation),
    scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1),
  );
}

/** The shape's axis-aligned box in the parent, centred on its origin. */
export function shapeBox(layer: ShapeLayer): Rect {
  return transformRect({ x: -layer.width / 2, y: -layer.height / 2, width: layer.width, height: layer.height }, shapeLinear(layer));
}

/**
 * Rotate a shape rigidly to `rotation` degrees: the picture turns, nothing
 * stretches. The canvas-axis stretch is carried along by conjugation.
 */
export function rotateShape(layer: ShapeLayer, rotation: number): ShapeLayer {
  const delta = rotation - layer.rotation;
  if (delta === 0) return layer;
  const K = layer.stretch ?? IDENTITY2;
  const stretch = isIdentity2(K) ? K : mul2(mul2(rot2(delta), K), rot2(-delta));
  return normalizeShape({ ...layer, rotation, stretch });
}

/** Scale a shape's box along the parent's axes by the given factors. */
export function scaleShapeBox(layer: ShapeLayer, kx: number, ky: number): ShapeLayer {
  const K = layer.stretch ?? IDENTITY2;
  const stretch = mul2({ a: kx, b: 0, c: 0, d: ky }, K);
  return normalizeShape({ ...layer, stretch });
}

/** Resize a shape's box to the given parent-axis dimensions. */
export function setShapeBoxSize(layer: ShapeLayer, width: number, height: number): ShapeLayer {
  const box = shapeBox(layer);
  const kx = box.width > 1e-9 ? width / box.width : 1;
  const ky = box.height > 1e-9 ? height / box.height : 1;
  return scaleShapeBox(layer, kx, ky);
}

/**
 * Fold a stretch back into the intrinsic size where that is exact: a uniform
 * scale at any angle, or an axis-aligned stretch when the rotation is a
 * multiple of 90°. Geometry (corner radii, strokes) is then regenerated at
 * the new size instead of being stretched. Other cases are left alone.
 */
export function normalizeShape(layer: ShapeLayer): ShapeLayer {
  const K = layer.stretch ?? IDENTITY2;
  if (isIdentity2(K)) return layer.stretch ? layer : { ...layer, stretch: { ...IDENTITY2 } };
  const eps = 1e-6;
  if (Math.abs(K.b) > eps || Math.abs(K.c) > eps || K.a <= 0 || K.d <= 0) return layer;
  if (Math.abs(K.a - K.d) < eps) {
    // Uniform scale commutes with rotation: fold it at any angle.
    return { ...layer, width: layer.width * K.a, height: layer.height * K.a, stretch: { ...IDENTITY2 } };
  }
  const r = ((layer.rotation % 360) + 360) % 360;
  const quarter = Math.round(r / 90);
  if (Math.abs(r - quarter * 90) > 1e-6) return layer;
  const swap = quarter % 2 === 1;
  return {
    ...layer,
    width: layer.width * (swap ? K.d : K.a),
    height: layer.height * (swap ? K.a : K.d),
    stretch: { ...IDENTITY2 },
  };
}

export function layerLocalMatrix(layer: Layer): Mat {
  if (layer.type === 'shape') {
    return multiply(translate(layer.x, layer.y), shapeLinear(layer));
  }
  return compose(translate(layer.x, layer.y), rotate(layer.rotation), scale(layer.scale, layer.scale));
}

/**
 * The frame in which the layer's handle box is axis aligned: for shapes the
 * parent's axes (translation only, since scaling is done in canvas axes);
 * for groups translation + rotation.
 */
export function layerFrameMatrix(layer: Layer): Mat {
  if (layer.type === 'shape') return translate(layer.x, layer.y);
  return multiply(translate(layer.x, layer.y), rotate(layer.rotation));
}

/** Rotation of the handle frame relative to the parent (0 for shapes). */
export function layerFrameRotation(layer: Layer): number {
  return layer.type === 'shape' ? 0 : layer.rotation;
}

/** Bounds in the layer's own (pre-transform) coordinate system. */
export function layerLocalBounds(layer: Layer): Rect | null {
  if (layer.type === 'shape') {
    return { x: -layer.width / 2, y: -layer.height / 2, width: layer.width, height: layer.height };
  }
  return childrenBounds(layer.children);
}

/** Union of children's bounds in the parent's coordinate system. */
export function childrenBounds(children: Layer[]): Rect | null {
  return unionRects(children.map((c) => layerBoundsInParent(c)));
}

/** Axis-aligned bounds of a layer in its parent's coordinate system. */
export function layerBoundsInParent(layer: Layer): Rect | null {
  const local = layerLocalBounds(layer);
  if (!local) return null;
  return transformRect(local, layerLocalMatrix(layer));
}

/**
 * Bounds in the layer's rotation frame (translation + rotation applied to the
 * frame, scale/flip baked into the rectangle). Handles are drawn on this box.
 */
export function layerFrameBounds(layer: Layer): Rect | null {
  if (layer.type === 'shape') return shapeBox(layer);
  const local = layerLocalBounds(layer);
  if (!local) return null;
  return transformRect(local, scale(layer.scale, layer.scale));
}

/** World matrix of a layer's parent (identity at root). */
export function parentWorldMatrix(doc: SvgDocument, id: string): Mat {
  const loc = locateLayer(doc, id);
  if (!loc) return IDENTITY;
  return loc.ancestors.reduce((m, g) => multiply(m, layerLocalMatrix(g)), IDENTITY);
}

export function layerWorldMatrix(doc: SvgDocument, id: string): Mat {
  const loc = locateLayer(doc, id);
  if (!loc) return IDENTITY;
  return multiply(parentWorldMatrix(doc, id), layerLocalMatrix(loc.layer));
}

/** Axis-aligned world bounds of a layer. */
export function layerWorldBounds(doc: SvgDocument, id: string): Rect | null {
  const loc = locateLayer(doc, id);
  if (!loc) return null;
  const local = layerLocalBounds(loc.layer);
  if (!local) return null;
  return transformRect(local, layerWorldMatrix(doc, id));
}

// ---------------------------------------------------------------------------
// Grouping

/**
 * Group layers that share a parent. The group's origin is placed at the
 * centre of the selection so it rotates/scales intuitively. Returns null
 * when the layers do not share a parent.
 */
export function groupLayers(
  doc: SvgDocument,
  ids: Iterable<string>,
  name = 'Group',
): { doc: SvgDocument; groupId: string } | null {
  const ordered = sortByStackOrder(doc, ids);
  if (ordered.length === 0) return null;
  const locs = ordered.map((id) => locateLayer(doc, id)!);
  const parentId = locs[0].parent?.id ?? null;
  if (!locs.every((l) => (l.parent?.id ?? null) === parentId)) return null;

  const members = locs.map((l) => l.layer);
  const bounds = childrenBounds(members) ?? { x: 0, y: 0, width: 0, height: 0 };
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;

  const group = createGroupLayer({
    name,
    x: cx,
    y: cy,
    children: members.map((m) => ({ ...m, x: m.x - cx, y: m.y - cy })),
  });
  const topIndex = Math.max(...locs.map((l) => l.index));
  let out = removeLayers(doc, ordered);
  // After removal, the insertion index is the top member's index minus the members below it.
  const insertAt = topIndex - (ordered.length - 1);
  out = insertLayer(out, group, parentId, insertAt);
  return { doc: out, groupId: group.id };
}

/** Dissolve a group, keeping children exactly where they appear. Returns the children's ids. */
export function ungroupLayer(doc: SvgDocument, groupId: string): { doc: SvgDocument; ids: string[] } | null {
  const loc = locateLayer(doc, groupId);
  if (!loc || loc.layer.type !== 'group') return null;
  const group = loc.layer;
  const m = layerLocalMatrix(group);
  const children = group.children.map((child): Layer => {
    const p = applyToPoint(m, { x: child.x, y: child.y });
    if (child.type === 'shape') {
      // Group linear part is s·R(g); rotate the shape rigidly then scale its box uniformly.
      const rotated = rotateShape({ ...child, x: p.x, y: p.y }, child.rotation + group.rotation);
      return scaleShapeBox(rotated, group.scale, group.scale);
    }
    return { ...child, x: p.x, y: p.y, rotation: child.rotation + group.rotation, scale: child.scale * group.scale };
  });
  let out = removeLayers(doc, [groupId]);
  children.forEach((child, i) => {
    out = insertLayer(out, child, loc.parent?.id ?? null, loc.index + i);
  });
  return { doc: out, ids: children.map((c) => c.id) };
}

// ---------------------------------------------------------------------------
// Loading / validation

/**
 * Coerce untrusted JSON into a valid document, filling defaults for missing
 * fields. Throws when the input is not an object.
 */
export function normalizeDocument(input: unknown): SvgDocument {
  if (!input || typeof input !== 'object') throw new Error('Invalid document');
  const raw = input as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const layers = Array.isArray(raw.layers) ? raw.layers.map(normalizeLayer).filter((l): l is Layer => !!l) : [];
  return {
    version: 1,
    width: Math.max(1, num(raw.width, 512)),
    height: Math.max(1, num(raw.height, 512)),
    background: typeof raw.background === 'string' ? raw.background : null,
    layers,
  };
}

function normalizeLayer(input: unknown): Layer | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  const effects = Array.isArray(raw.effects) ? raw.effects.map(normalizeEffect).filter((e): e is Effect => !!e) : [];
  const rawMask = raw.mask as Record<string, unknown> | null | undefined;
  const mask: MaskSettings | null =
    rawMask && typeof rawMask === 'object'
      ? {
          mode: (['clip', 'clip-inverse', 'filter'] as const).includes(rawMask.mode as never)
            ? (rawMask.mode as MaskSettings['mode'])
            : 'clip',
          effects: Array.isArray(rawMask.effects)
            ? rawMask.effects.map(normalizeEffect).filter((e): e is Effect => !!e)
            : [],
          showShape: bool(rawMask.showShape, false),
        }
      : null;
  const base = {
    id: str(raw.id, createId('l')),
    name: str(raw.name, 'Layer'),
    visible: bool(raw.visible, true),
    locked: bool(raw.locked, false),
    opacity: Math.max(0, Math.min(1, num(raw.opacity, 1))),
    blendMode: str(raw.blendMode, 'normal') as Layer['blendMode'],
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    rotation: num(raw.rotation, 0),
    effects,
    mask,
  };
  if (raw.type === 'group') {
    const children = Array.isArray(raw.children)
      ? raw.children.map(normalizeLayer).filter((l): l is Layer => !!l)
      : [];
    return { ...base, type: 'group', scale: num(raw.scale, 1) || 1, children };
  }
  const rawParams: Record<string, number> = {};
  if (raw.params && typeof raw.params === 'object') {
    for (const [k, v] of Object.entries(raw.params as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) rawParams[k] = v;
    }
  }
  const resolved = resolveShapeAlias(str(raw.shape, 'polygon'), rawParams);
  const def = getShape(resolved.id);
  const params: Record<string, number> = { ...defaultShapeParams(def), ...resolved.params };
  const rawFill = raw.fill as Record<string, unknown> | undefined;
  let fill: ShapeLayer['fill'] = { type: 'solid', color: '#e8e8e8' };
  if (rawFill && typeof rawFill === 'object') {
    if (rawFill.type === 'none') fill = { type: 'none' };
    else if (rawFill.type === 'linear' || rawFill.type === 'radial') {
      const stops = Array.isArray(rawFill.stops)
        ? rawFill.stops
            .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
            .map((s) => ({ offset: Math.max(0, Math.min(1, num(s.offset, 0))), color: str(s.color, '#000000') }))
        : [];
      const safeStops = stops.length >= 2 ? stops : [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }];
      fill =
        rawFill.type === 'linear'
          ? { type: 'linear', angle: num(rawFill.angle, 0), stops: safeStops }
          : { type: 'radial', stops: safeStops };
    } else if (typeof rawFill.color === 'string') fill = { type: 'solid', color: rawFill.color };
  } else if (typeof raw.fill === 'string') {
    fill = { type: 'solid', color: raw.fill };
  }
  const rawStroke = raw.stroke as Record<string, unknown> | null | undefined;
  const stroke =
    rawStroke && typeof rawStroke === 'object'
      ? { color: str(rawStroke.color, '#000000'), width: Math.max(0, num(rawStroke.width, 1)) }
      : null;
  return {
    ...base,
    type: 'shape',
    shape: def.id,
    params,
    width: Math.max(0, num(raw.width, 100)),
    height: Math.max(0, num(raw.height, 100)),
    stretch: parseMat2(raw.stretch),
    flipX: bool(raw.flipX, false),
    flipY: bool(raw.flipY, false),
    fill,
    stroke,
  };
}

function parseMat2(input: unknown): Mat2 {
  if (!input || typeof input !== 'object') return { ...IDENTITY2 };
  const r = input as Record<string, unknown>;
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const m = { a: n(r.a, 1), b: n(r.b, 0), c: n(r.c, 0), d: n(r.d, 1) };
  return Math.abs(m.a * m.d - m.b * m.c) < 1e-9 ? { ...IDENTITY2 } : m;
}

function normalizeEffect(input: unknown): Effect | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.type !== 'string' || !(raw.type in EFFECT_DEFS)) return null;
  const def = EFFECT_DEFS[raw.type as Effect['type']];
  return {
    ...def.defaults,
    ...raw,
    type: def.type,
    id: typeof raw.id === 'string' ? raw.id : createId('e'),
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
  } as Effect;
}
