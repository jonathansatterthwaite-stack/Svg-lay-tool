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
import { MODIFIER_DEFS, createModifier } from './modifiers';
import { defaultShapeParams, getShape, resolveShapeAlias } from './shapes';
import type { Action, Binding, Effect, Fill, Gesture, GridSettings, GroupLayer, Hotspot, Layer, Mat2, MaskSettings, Modifier, Rect, ShapeLayer, SvgDocument, Variable } from './types';

// ---------------------------------------------------------------------------
// Creation

export interface CreateDocumentOptions {
  width?: number;
  height?: number;
  background?: string | null;
  layers?: Layer[];
  variables?: Variable[];
  grid?: Partial<GridSettings>;
}

export const DEFAULT_GRID: GridSettings = { width: 32, height: 32, visible: false, opacity: 0.25 };

export function createDocument(opts: CreateDocumentOptions = {}): SvgDocument {
  return {
    version: 1,
    width: opts.width ?? 512,
    height: opts.height ?? 512,
    background: opts.background === undefined ? null : opts.background,
    layers: opts.layers ?? [],
    variables: opts.variables ?? [],
    grid: { ...DEFAULT_GRID, ...(opts.grid ?? {}) },
  };
}

/** Snap a value to the nearest multiple of `step` (step ≤ 0 returns the value). */
export function snapTo(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

export type ShapeLayerInit = Partial<Omit<ShapeLayer, 'type' | 'id'>> & { shape?: string };
export type GroupLayerInit = Partial<Omit<GroupLayer, 'type' | 'id'>>;

export function createShapeLayer(init: ShapeLayerInit = {}): ShapeLayer {
  const resolved = resolveShapeAlias(init.shape ?? 'polygon', init.params ?? {});
  const def = getShape(resolved.id);
  const aliasMods = (resolved.modifiers ?? []).map((m) => normalizeModifier(m)).filter((m): m is Modifier => !!m);
  // Params merged with defaults so a partial override never drops one.
  init = {
    ...init,
    shape: def.id,
    params: { ...defaultShapeParams(def), ...resolved.params },
    modifiers: [...aliasMods, ...(init.modifiers ?? [])],
  };
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
    modifiers: [],
    shape: def.id,
    params: init.params ?? defaultShapeParams(def),
    width: 100,
    height: 100,
    stretch: { ...IDENTITY2 },
    flipX: false,
    flipY: false,
    color: '#e8e8e8',
    ...stripUndefined(init),
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
    modifiers: [],
    scale: 1,
    stretch: { ...IDENTITY2 },
    children: [],
    ...stripUndefined(init),
  };
}

export function createMaskSettings(overrides: Partial<MaskSettings> = {}): MaskSettings {
  return { mode: 'clip', effects: [], showShape: false, ...overrides };
}

/** Add a modifier to a layer (appended, or replacing an existing one when only one is allowed). */
export function addModifier(layer: Layer, modifier: Modifier): Layer {
  const def = MODIFIER_DEFS[modifier.type];
  const rest = def.single ? (layer.modifiers ?? []).filter((m) => m.type !== modifier.type) : layer.modifiers ?? [];
  return { ...layer, modifiers: [...rest, modifier] };
}

export function updateModifier(layer: Layer, id: string, patch: Partial<Modifier> | ((m: Modifier) => Modifier)): Layer {
  return {
    ...layer,
    modifiers: (layer.modifiers ?? []).map((m) => (m.id === id ? (typeof patch === 'function' ? patch(m) : ({ ...m, ...patch } as Modifier)) : m)),
  };
}

export function removeModifier(layer: Layer, id: string): Layer {
  return { ...layer, modifiers: (layer.modifiers ?? []).filter((m) => m.id !== id) };
}

export function setBinding(layer: Layer, binding: Binding): Layer {
  const rest = (layer.bindings ?? []).filter((b) => b.id !== binding.id && b.target !== binding.target);
  return { ...layer, bindings: [...rest, binding] };
}

export function removeBinding(layer: Layer, id: string): Layer {
  const bindings = (layer.bindings ?? []).filter((b) => b.id !== id);
  return bindings.length ? { ...layer, bindings } : { ...layer, bindings: undefined };
}

export function upsertVariable(doc: SvgDocument, variable: Variable): SvgDocument {
  const vars = doc.variables ?? [];
  const i = vars.findIndex((v) => v.id === variable.id);
  return { ...doc, variables: i < 0 ? [...vars, variable] : vars.map((v, j) => (j === i ? variable : v)) };
}

export function removeVariable(doc: SvgDocument, id: string): SvgDocument {
  return { ...doc, variables: (doc.variables ?? []).filter((v) => v.id !== id) };
}

export function moveModifier(layer: Layer, id: string, delta: number): Layer {
  const mods = [...(layer.modifiers ?? [])];
  const i = mods.findIndex((m) => m.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= mods.length) return layer;
  [mods[i], mods[j]] = [mods[j], mods[i]];
  return { ...layer, modifiers: mods };
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
  const cloneModifier = (m: Modifier): Modifier => {
    const copy = { ...m, id: createId('m') } as Modifier;
    if (copy.type === 'effect') copy.effect = { ...copy.effect, id: createId('e') };
    if (copy.type === 'mask') copy.effects = cloneEffects(copy.effects);
    if (copy.type === 'fill') copy.fill = { ...copy.fill };
    return copy;
  };
  const base = {
    ...layer,
    id: createId(layer.type === 'group' ? 'g' : 'l'),
    modifiers: (layer.modifiers ?? []).map(cloneModifier),
    ...(layer.bindings ? { bindings: layer.bindings.map((b) => ({ ...b, id: createId('b') })) } : {}),
    ...(layer.hotspot ? { hotspot: cloneHotspot(layer.hotspot) } : {}),
  };
  if (base.type === 'group') {
    return { ...base, stretch: { ...(base.stretch ?? IDENTITY2) }, children: base.children.map(cloneLayer) };
  }
  return { ...base, params: { ...base.params }, stretch: { ...(base.stretch ?? IDENTITY2) } };
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

/** The linear part of a layer's transform in its parent: stretch · rotation · (flip | uniform scale). */
export function layerLinear(layer: Layer): Mat {
  const K = mat2ToMat(layer.stretch ?? IDENTITY2);
  if (layer.type === 'shape') {
    return compose(K, rotate(layer.rotation), scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1));
  }
  return compose(K, rotate(layer.rotation), scale(layer.scale, layer.scale));
}

/** @deprecated use layerLinear */
export function shapeLinear(layer: ShapeLayer): Mat {
  return layerLinear(layer);
}

/**
 * The layer's axis-aligned box in the parent, relative to its origin. For a
 * shape this is centred on the origin; a group's box is wherever its children
 * are around the group's pivot. Null for an empty group.
 */
export function layerBox(layer: Layer): Rect | null {
  const local = layerLocalBounds(layer);
  if (!local) return null;
  return transformRect(local, layerLinear(layer));
}

export function shapeBox(layer: ShapeLayer): Rect {
  return layerBox(layer)!;
}

/**
 * Rotate a layer rigidly to `rotation` degrees about its origin: the picture
 * turns, nothing stretches. The canvas-axis stretch is carried along by
 * conjugation.
 */
export function rotateLayer<T extends Layer>(layer: T, rotation: number): T {
  const delta = rotation - layer.rotation;
  if (delta === 0) return layer;
  const K = layer.stretch ?? IDENTITY2;
  const stretch = isIdentity2(K) ? K : mul2(mul2(rot2(delta), K), rot2(-delta));
  return normalizeLayerStretch({ ...layer, rotation, stretch });
}

export function rotateShape(layer: ShapeLayer, rotation: number): ShapeLayer {
  return rotateLayer(layer, rotation);
}

/** Scale a layer's box along the parent's axes about the layer origin. */
export function scaleLayerBox<T extends Layer>(layer: T, kx: number, ky: number): T {
  const K = layer.stretch ?? IDENTITY2;
  const stretch = mul2({ a: kx, b: 0, c: 0, d: ky }, K);
  return normalizeLayerStretch({ ...layer, stretch });
}

export function scaleShapeBox(layer: ShapeLayer, kx: number, ky: number): ShapeLayer {
  return scaleLayerBox(layer, kx, ky);
}

/** Resize a layer's box to the given parent-axis dimensions (about the origin). */
export function setLayerBoxSize<T extends Layer>(layer: T, width: number, height: number): T {
  const box = layerBox(layer);
  if (!box) return layer;
  const kx = box.width > 1e-9 ? width / box.width : 1;
  const ky = box.height > 1e-9 ? height / box.height : 1;
  return scaleLayerBox(layer, kx, ky);
}

export function setShapeBoxSize(layer: ShapeLayer, width: number, height: number): ShapeLayer {
  return setLayerBoxSize(layer, width, height);
}

/**
 * Fold a stretch back into the layer's own size where that is exact: a
 * uniform scale at any angle (shape size, or group scale), or an axis-aligned
 * stretch on a shape when the rotation is a multiple of 90°. Geometry is then
 * regenerated at the new size instead of being stretched.
 */
export function normalizeLayerStretch<T extends Layer>(layer: T): T {
  const K = layer.stretch ?? IDENTITY2;
  if (isIdentity2(K)) return layer.stretch ? layer : { ...layer, stretch: { ...IDENTITY2 } };
  const eps = 1e-6;
  if (Math.abs(K.b) > eps || Math.abs(K.c) > eps || K.a <= 0 || K.d <= 0) return layer;
  if (Math.abs(K.a - K.d) < eps) {
    if (layer.type === 'group') return { ...layer, scale: layer.scale * K.a, stretch: { ...IDENTITY2 } };
    return { ...layer, width: layer.width * K.a, height: layer.height * K.a, stretch: { ...IDENTITY2 } };
  }
  if (layer.type !== 'shape') return layer;
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

export function normalizeShape(layer: ShapeLayer): ShapeLayer {
  return normalizeLayerStretch(layer);
}

export function layerLocalMatrix(layer: Layer): Mat {
  return multiply(translate(layer.x, layer.y), layerLinear(layer));
}

/**
 * The frame in which the layer's handle box is axis aligned: the parent's
 * axes, offset to the layer origin (scaling is always done in canvas axes).
 */
export function layerFrameMatrix(layer: Layer): Mat {
  return translate(layer.x, layer.y);
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
  return layerBox(layer);
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
  const Kg = group.stretch ?? IDENTITY2;
  const children = group.children.map((child): Layer => {
    const p = applyToPoint(m, { x: child.x, y: child.y });
    // G·Lc = Kg·R(g)·s·Kc·R(c)·X = [s·Kg·R(g)·Kc·R(-g)]·R(g+c)·X
    const Kc = child.stretch ?? IDENTITY2;
    const conj = mul2(mul2(rot2(group.rotation), Kc), rot2(-group.rotation));
    const stretch = mul2({ a: group.scale, b: 0, c: 0, d: group.scale }, mul2(Kg, conj));
    return normalizeLayerStretch({ ...child, x: p.x, y: p.y, rotation: child.rotation + group.rotation, stretch });
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
    variables: Array.isArray(raw.variables) ? raw.variables.map(normalizeVariable).filter((v): v is Variable => !!v) : [],
    grid: normalizeGrid(raw.grid),
  };
}

function normalizeGrid(input: unknown): GridSettings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_GRID };
  const raw = input as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    width: Math.max(1, num(raw.width, DEFAULT_GRID.width)),
    height: Math.max(1, num(raw.height, DEFAULT_GRID.height)),
    visible: typeof raw.visible === 'boolean' ? raw.visible : DEFAULT_GRID.visible,
    opacity: Math.min(1, Math.max(0, num(raw.opacity, DEFAULT_GRID.opacity))),
  };
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function normalizeVariable(input: unknown): Variable | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const name = typeof raw.name === 'string' && IDENT.test(raw.name) ? raw.name : null;
  if (!name) return null;
  const min = num(raw.min, 0);
  const max = Math.max(min, num(raw.max, 1));
  return {
    id: typeof raw.id === 'string' ? raw.id : createId('v'),
    name,
    value: Math.min(max, Math.max(min, num(raw.value, min))),
    min,
    max,
    step: Math.max(0, num(raw.step, 0.01)) || 0.01,
    ...(typeof raw.expression === 'string' && raw.expression.trim() ? { expression: raw.expression } : {}),
  };
}

function normalizeBinding(input: unknown): Binding | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.target !== 'string' || typeof raw.expression !== 'string') return null;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const rawAnchor = raw.anchor as Record<string, unknown> | undefined;
  return {
    id: typeof raw.id === 'string' ? raw.id : createId('b'),
    target: raw.target,
    expression: raw.expression,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    ...(rawAnchor && typeof rawAnchor === 'object' ? { anchor: { x: num(rawAnchor.x, 0.5), y: num(rawAnchor.y, 0.5) } } : {}),
  };
}

/** A copy of a hotspot with fresh ids (a duplicated layer gets its own gestures and actions). */
export function cloneHotspot(h: Hotspot): Hotspot {
  return {
    hidden: h.hidden,
    gestures: h.gestures.map((g) => ({ ...g, id: createId('g'), actions: g.actions.map((a) => ({ ...a, id: createId('a') })) })),
  };
}

/** Coerce an untrusted hotspot (a drawing may come from anyone): unknown gestures and actions are dropped. */
export function normalizeHotspot(input: unknown): Hotspot | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const gestures = Array.isArray(raw.gestures) ? raw.gestures.map(normalizeGesture).filter((g): g is Gesture => !!g) : [];
  return { hidden: raw.hidden === true, gestures };
}

function normalizeGesture(input: unknown): Gesture | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (raw.on !== 'tap' && raw.on !== 'drag') return null;
  const actions = Array.isArray(raw.actions) ? raw.actions.map(normalizeAction).filter((a): a is Action => !!a) : [];
  return {
    id: typeof raw.id === 'string' ? raw.id : createId('g'),
    on: raw.on,
    ...(raw.on === 'drag' ? { axis: raw.axis === 'y' ? ('y' as const) : ('x' as const) } : {}),
    actions,
  };
}

function normalizeAction(input: unknown): Action | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const formula = (v: unknown) => (typeof v === 'string' ? v.slice(0, 500) : '0');
  if (typeof raw.var !== 'string' || !IDENT.test(raw.var)) return null;
  const id = typeof raw.id === 'string' ? raw.id : createId('a');
  switch (raw.do) {
    case 'set':
      return { id, do: 'set', var: raw.var, to: formula(raw.to) };
    case 'add':
      return {
        id,
        do: 'add',
        var: raw.var,
        by: formula(raw.by),
        ...(typeof raw.min === 'number' && Number.isFinite(raw.min) ? { min: raw.min } : {}),
        ...(typeof raw.max === 'number' && Number.isFinite(raw.max) ? { max: raw.max } : {}),
        ...(raw.wrap === true ? { wrap: true } : {}),
      };
    case 'mark':
      return { id, do: 'mark', var: raw.var };
    case 'drag': {
      const step = num(raw.step, 0);
      return { id, do: 'drag', var: raw.var, from: num(raw.from, 0), to: num(raw.to, 1), ...(step > 0 ? { step } : {}) };
    }
    default:
      return null;
  }
}

function normalizeLayer(input: unknown): Layer | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  // Modifiers (new format) plus conversion of the legacy fill/stroke/effects/mask fields.
  const modifiers: Modifier[] = Array.isArray(raw.modifiers)
    ? raw.modifiers.map(normalizeModifier).filter((m): m is Modifier => !!m)
    : [];
  let legacyColor: string | null = null;
  const legacyFill = normalizeFill(raw.fill);
  if (legacyFill) {
    if (legacyFill.type === 'solid') legacyColor = legacyFill.color;
    else modifiers.push(createModifier('fill', { fill: legacyFill }));
  }
  const rawStroke = raw.stroke as Record<string, unknown> | null | undefined;
  if (rawStroke && typeof rawStroke === 'object') {
    modifiers.push(createModifier('stroke', { color: str(rawStroke.color, '#000000'), width: Math.max(0, num(rawStroke.width, 1)) }));
  }
  if (Array.isArray(raw.effects)) {
    for (const e of raw.effects.map(normalizeEffect)) if (e) modifiers.push(createModifier('effect', { effect: e }));
  }
  const rawMask = raw.mask as Record<string, unknown> | null | undefined;
  if (rawMask && typeof rawMask === 'object' && !modifiers.some((m) => m.type === 'mask')) {
    modifiers.push(
      createModifier('mask', {
        mode: (['clip', 'clip-inverse', 'filter'] as const).includes(rawMask.mode as never) ? (rawMask.mode as MaskSettings['mode']) : 'clip',
        effects: Array.isArray(rawMask.effects) ? rawMask.effects.map(normalizeEffect).filter((e): e is Effect => !!e) : [],
        showShape: bool(rawMask.showShape, false),
      }),
    );
  }
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
    modifiers,
    ...(Array.isArray(raw.bindings) ? { bindings: raw.bindings.map(normalizeBinding).filter((b): b is Binding => !!b) } : {}),
    ...(raw.hotspot ? { hotspot: normalizeHotspot(raw.hotspot) ?? undefined } : {}),
  };
  if (raw.type === 'group') {
    const children = Array.isArray(raw.children)
      ? raw.children.map(normalizeLayer).filter((l): l is Layer => !!l)
      : [];
    return { ...base, type: 'group', scale: num(raw.scale, 1) || 1, stretch: parseMat2(raw.stretch), children };
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
  const aliasMods = (resolved.modifiers ?? []).map(normalizeModifier).filter((m): m is Modifier => !!m);
  // Corner radius used to be a shape parameter; it is a `round` modifier now.
  if (typeof rawParams.radius === 'number' && rawParams.radius > 0 && !def.params?.some((p) => p.key === 'radius')) {
    aliasMods.push(createModifier('round', { radius: rawParams.radius }));
    delete params.radius;
  }
  base.modifiers = [...aliasMods, ...base.modifiers];
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
    color: str(raw.color, legacyColor ?? '#e8e8e8'),
  };
}

function normalizeFill(input: unknown): Fill | null {
  if (typeof input === 'string') return { type: 'solid', color: input };
  if (!input || typeof input !== 'object') return null;
  const rawFill = input as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  if (rawFill.type === 'none') return { type: 'none' };
  if (rawFill.type === 'linear' || rawFill.type === 'radial') {
    const stops = Array.isArray(rawFill.stops)
      ? rawFill.stops
          .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
          .map((s) => ({ offset: Math.max(0, Math.min(1, num(s.offset, 0))), color: str(s.color, '#000000') }))
      : [];
    const safeStops = stops.length >= 2 ? stops : [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }];
    return rawFill.type === 'linear'
      ? { type: 'linear', angle: num(rawFill.angle, 0), stops: safeStops }
      : { type: 'radial', stops: safeStops };
  }
  if (typeof rawFill.color === 'string') return { type: 'solid', color: rawFill.color };
  return null;
}

/** Coerce a plain object into a valid modifier (unknown types are dropped). */
export function normalizeModifier(input: unknown): Modifier | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.type !== 'string' || !(raw.type in MODIFIER_DEFS)) return null;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const base = { id: typeof raw.id === 'string' ? raw.id : createId('m'), enabled: bool(raw.enabled, true) };
  switch (raw.type as Modifier['type']) {
    case 'fill': {
      const fill = normalizeFill(raw.fill) ?? createModifier('fill').fill;
      return { ...base, type: 'fill', fill };
    }
    case 'stroke':
      return { ...base, type: 'stroke', color: typeof raw.color === 'string' ? raw.color : null, width: Math.max(0, num(raw.width, 4)) };
    case 'effect': {
      const effect = normalizeEffect(raw.effect);
      return effect ? { ...base, type: 'effect', effect } : null;
    }
    case 'mask':
      return {
        ...base,
        type: 'mask',
        mode: (['clip', 'clip-inverse', 'filter'] as const).includes(raw.mode as never) ? (raw.mode as MaskSettings['mode']) : 'clip',
        showShape: bool(raw.showShape, false),
        effects: Array.isArray(raw.effects) ? raw.effects.map(normalizeEffect).filter((e): e is Effect => !!e) : [],
      };
    case 'deform':
      return { ...base, type: 'deform', top: num(raw.top, 60), bottom: num(raw.bottom, 100), skew: num(raw.skew, 0) };
    case 'round':
      return { ...base, type: 'round', radius: Math.max(0, num(raw.radius, 20)) };
    case 'edges':
      return {
        ...base,
        type: 'edges',
        subdivisions: Math.max(0, Math.min(16, Math.round(num(raw.subdivisions, 1)))),
        bend: num(raw.bend, -40),
        smooth: bool(raw.smooth, false),
      };
    default:
      return null;
  }
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
