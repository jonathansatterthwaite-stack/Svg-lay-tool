/**
 * Interaction: hotspots, gestures and actions (see `Hotspot` in types.ts).
 *
 * A gesture on a hotspot runs actions that change variables; bindings then redraw
 * the picture. This module is host-independent: give it pointer positions in
 * document coordinates and it reports the variables that changed. The editor uses
 * it in Preview; a host app uses it wherever it shows a drawing.
 */
import { applyGeometryModifiers } from './modifiers';
import { applyToPoint, boundsOfPoints, IDENTITY, multiply } from './matrix';
import type { Mat } from './matrix';
import { layerLocalMatrix } from './document';
import { evaluate } from './expr';
import type { Env } from './expr';
import { flattenPath } from './path';
import type { Polygon } from './path';
import { createId } from './ids';
import { shapePath } from './shapes';
import type { Action, ActionType, Gesture, GestureType, Hotspot, Layer, Point, Rect, SvgDocument } from './types';

// ---------------------------------------------------------------------------
// Making them

export function createHotspot(init: Partial<Hotspot> = {}): Hotspot {
  return { hidden: false, gestures: [], ...init };
}

export function createGesture(on: GestureType, init: Partial<Gesture> = {}): Gesture {
  return { id: createId('g'), on, ...(on === 'drag' ? { axis: 'x' as const } : {}), actions: [], ...init };
}

export function createAction(type: ActionType, varName = 'value'): Action {
  const id = createId('a');
  switch (type) {
    case 'set':
      return { id, do: 'set', var: varName, to: `1 - ${varName}` };
    case 'add':
      return { id, do: 'add', var: varName, by: '1' };
    case 'mark':
      return { id, do: 'mark', var: varName };
    case 'drag':
      return { id, do: 'drag', var: varName, from: 0, to: 1 };
  }
}

/** Descriptions for an editor or a host's help. */
export const GESTURE_TYPES: { type: GestureType; label: string; hint: string }[] = [
  { type: 'tap', label: 'Tap', hint: 'A quick touch (or click) on the hotspot' },
  { type: 'drag', label: 'Drag', hint: 'Slide a finger across the hotspot: its position along the axis sets a value' },
];

export const ACTION_TYPES: { type: ActionType; label: string; hint: string }[] = [
  { type: 'set', label: 'Set', hint: 'The variable becomes the formula, e.g. 1 - lit to switch it on and off' },
  { type: 'add', label: 'Add', hint: 'Adds the formula to the variable, kept between a lowest and highest value (or wrapping round)' },
  { type: 'mark', label: 'Mark the time', hint: 'The variable becomes now, so formulas can use since(variable) for an animation or a timer' },
  { type: 'drag', label: 'Drag value', hint: 'While dragging, the variable follows the finger across the hotspot, from one value to another' },
];

/** Does the document have any hotspot that does something? */
export function documentHasHotspots(doc: SvgDocument): boolean {
  let found = false;
  const walk = (layers: Layer[]) => {
    for (const l of layers) {
      if (found) return;
      if (l.hotspot?.gestures.some((g) => g.actions.length)) found = true;
      else if (l.type === 'group') walk(l.children);
    }
  };
  walk(doc.layers);
  return found;
}

// ---------------------------------------------------------------------------
// Where they are

export interface HotspotTarget {
  layerId: string;
  hotspot: Hotspot;
  /** The hit area in document coordinates (a group's: its shapes'). */
  polygons: Polygon[];
  bounds: Rect;
}

function shapePolygons(layer: Layer, world: Mat, out: Polygon[]): void {
  if (!layer.visible) return;
  if (layer.type === 'group') {
    for (const c of layer.children) shapePolygons(c, multiply(world, layerLocalMatrix(c)), out);
    return;
  }
  const d = applyGeometryModifiers(shapePath(layer.shape, layer.width, layer.height, layer.params), layer.modifiers ?? [], layer.width, layer.height);
  for (const poly of flattenPath(d)) out.push(poly.map((p) => applyToPoint(world, p)));
}

/**
 * Every hotspot in a (resolved) document, bottom first, with its hit area as it
 * is now. Hidden layers have none.
 */
export function hotspotsOf(doc: SvgDocument): HotspotTarget[] {
  const out: HotspotTarget[] = [];
  const walk = (layers: Layer[], parent: Mat) => {
    for (const l of layers) {
      if (!l.visible) continue;
      const world = multiply(parent, layerLocalMatrix(l));
      if (l.hotspot) {
        const polygons: Polygon[] = [];
        shapePolygons(l, world, polygons);
        const bounds = boundsOfPoints(polygons.flat());
        if (bounds) out.push({ layerId: l.id, hotspot: l.hotspot, polygons, bounds });
      }
      if (l.type === 'group') walk(l.children, world);
    }
  };
  walk(doc.layers, IDENTITY);
  return out;
}

function insidePolygons(polys: Polygon[], p: Point): boolean {
  // Even-odd over all the outlines: holes (a ring's middle) aren't part of it.
  let inside = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

function distanceToPolygons(polys: Polygon[], p: Point): number {
  let best = Infinity;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i];
      const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
  }
  return best;
}

/**
 * The topmost hotspot under a point (document coordinates). Within `tolerance`
 * of an outline counts too, so a thin hotspot (an abacus rod) is easy to touch.
 */
export function hotspotAt(doc: SvgDocument, p: Point, tolerance = 0): HotspotTarget | null {
  const all = hotspotsOf(doc).filter((h) => h.hotspot.gestures.length);
  for (let i = all.length - 1; i >= 0; i--) if (insidePolygons(all[i].polygons, p)) return all[i];
  if (tolerance > 0) {
    let best: HotspotTarget | null = null, bd = tolerance;
    for (let i = all.length - 1; i >= 0; i--) {
      const d = distanceToPolygons(all[i].polygons, p);
      if (d < bd) { bd = d; best = all[i]; }
    }
    return best;
  }
  return null;
}

// ---------------------------------------------------------------------------
// What they do

/**
 * Run actions in order and return the variables they changed. `env` is what
 * formulas see (each action sees the ones before it); `drag` is where the finger
 * is along the drag's axis, 0..1 (for drag actions). A formula that doesn't work
 * skips its action.
 */
export function runActions(actions: Action[], env: Env, now: number, drag?: number): Env {
  const changes: Env = {};
  const scope: Env = { ...env, now };
  const put = (name: string, v: number) => {
    if (!Number.isFinite(v)) return;
    changes[name] = v;
    scope[name] = v;
  };
  for (const a of actions) {
    try {
      switch (a.do) {
        case 'set':
          put(a.var, evaluate(a.to, scope));
          break;
        case 'add': {
          let v = (scope[a.var] ?? 0) + evaluate(a.by, scope);
          const lo = a.min ?? -Infinity, hi = a.max ?? Infinity;
          // Wrapping: past the highest comes round to the lowest, and below the lowest to the highest.
          if (a.wrap && Number.isFinite(lo) && Number.isFinite(hi)) v = v > hi ? lo : v < lo ? hi : v;
          else v = Math.min(hi, Math.max(lo, v));
          put(a.var, v);
          break;
        }
        case 'mark':
          put(a.var, now);
          break;
        case 'drag': {
          if (drag === undefined) break;
          let v = a.from + (a.to - a.from) * Math.min(1, Math.max(0, drag));
          if (a.step && a.step > 0) v = a.from + Math.round((v - a.from) / a.step) * a.step;
          put(a.var, Math.round(v * 1e6) / 1e6);
          break;
        }
      }
    } catch {
      /* a formula that doesn't work: skip this action */
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Gestures

export interface InteractionOptions {
  /** The document as it is now (bindings applied), for finding hotspots. */
  document: () => SvgDocument;
  /** What formulas see: the document's variables, the host's, the time. */
  env: () => Env;
  /** Variables changed by a gesture; `done` is false while a drag is still going. */
  onChange: (values: Env, done: boolean) => void;
  /** Movement (document units) before a press counts as a drag rather than a tap. Default 6. */
  slop?: number | (() => number);
  /** Extra reach (document units) around thin hotspots. Default 0. */
  tolerance?: number | (() => number);
  /** A tap's longest press, ms. Default 600. */
  tapMs?: number;
  /** The clock (ms). Default Date.now. */
  now?: () => number;
}

interface Press {
  target: HotspotTarget;
  start: Point;
  startTime: number;
  /** The hotspot's box when the press began: a drag is measured across it (a hotspot may move as it's dragged). */
  box: Rect;
  dragging: Gesture | null;
}

/**
 * Turns pointer events (in document coordinates) into gestures on hotspots.
 * `down` says whether a hotspot took the press (if not, the host can pan, scroll …).
 */
export class Interaction {
  private press: Press | null = null;
  constructor(private readonly opts: InteractionOptions) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private slop(): number {
    const s = this.opts.slop;
    return typeof s === 'function' ? s() : (s ?? 6);
  }

  private tolerance(): number {
    const t = this.opts.tolerance;
    return typeof t === 'function' ? t() : (t ?? 0);
  }

  /** A press: true when it's on a hotspot (follow it with move and up). */
  down(p: Point): boolean {
    const target = hotspotAt(this.opts.document(), p, this.tolerance());
    if (!target) return false;
    this.press = { target, start: p, startTime: this.now(), box: target.bounds, dragging: null };
    return true;
  }

  get active(): boolean {
    return !!this.press;
  }

  move(p: Point): void {
    const pr = this.press;
    if (!pr) return;
    if (!pr.dragging) {
      if (Math.hypot(p.x - pr.start.x, p.y - pr.start.y) <= this.slop()) return;
      pr.dragging = pr.target.hotspot.gestures.find((g) => g.on === 'drag') ?? null;
      if (!pr.dragging) return; // moved too far for a tap, and there's no drag: nothing
    }
    this.runDrag(pr, pr.dragging, p, false);
  }

  up(p: Point): void {
    const pr = this.press;
    this.press = null;
    if (!pr) return;
    if (pr.dragging) return this.runDrag(pr, pr.dragging, p, true);
    const moved = Math.hypot(p.x - pr.start.x, p.y - pr.start.y) > this.slop();
    if (moved || this.now() - pr.startTime > (this.opts.tapMs ?? 600)) return;
    const changes: Env = {};
    let env = this.opts.env();
    for (const g of pr.target.hotspot.gestures) {
      if (g.on !== 'tap') continue;
      const c = runActions(g.actions, env, this.now());
      Object.assign(changes, c);
      env = { ...env, ...c };
    }
    if (Object.keys(changes).length) this.opts.onChange(changes, true);
  }

  /** The press was interrupted (the pointer was lost): a drag keeps what it had reached. */
  cancel(): void {
    const pr = this.press;
    this.press = null;
    if (pr?.dragging) this.opts.onChange({}, true);
  }

  private runDrag(pr: Press, g: Gesture, p: Point, done: boolean): void {
    const b = pr.box;
    const t = g.axis === 'y' ? (b.height ? (p.y - b.y) / b.height : 0) : b.width ? (p.x - b.x) / b.width : 0;
    const changes = runActions(g.actions, this.opts.env(), this.now(), t);
    if (Object.keys(changes).length || done) this.opts.onChange(changes, done);
  }
}

export function createInteraction(opts: InteractionOptions): Interaction {
  return new Interaction(opts);
}
