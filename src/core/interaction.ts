/**
 * Interaction: hotspots, gestures and actions (see `Hotspot` in types.ts).
 *
 * A gesture on a hotspot runs actions that change variables; bindings then redraw
 * the picture. This module is host-independent: give it pointer positions in
 * document coordinates and it reports the variables that changed (and the sounds
 * and buzzes asked for). The editor uses it in Preview; a host app uses it
 * wherever it shows a drawing.
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
  return {
    id: createId('g'),
    on,
    ...(on === 'drag' ? { axis: 'x' as const } : {}),
    ...(on === 'swipe' ? { dir: 'any' as const } : {}),
    ...(on === 'dial' ? { turns: 1 } : {}),
    actions: [],
    ...(on === 'hold' ? { release: [] } : {}),
    ...init,
  };
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
    case 'random':
      return { id, do: 'random', var: varName, from: 1, to: 6, step: 1 };
    case 'sound':
      return { id, do: 'sound', sound: 'click' };
    case 'vibrate':
      return { id, do: 'vibrate', ms: 30 };
  }
}

/** Descriptions for an editor or a host's help. */
export const GESTURE_TYPES: { type: GestureType; label: string; hint: string }[] = [
  { type: 'tap', label: 'Tap', hint: 'A quick touch (or click) on the hotspot' },
  { type: 'doubletap', label: 'Double tap', hint: 'Two quick taps (a single tap then waits a moment, to tell them apart)' },
  { type: 'longpress', label: 'Long press', hint: 'A press held still for about half a second' },
  { type: 'drag', label: 'Drag', hint: 'Slide a finger across the hotspot: its position along the axis sets a value' },
  { type: 'swipe', label: 'Swipe', hint: 'A quick flick across the hotspot, one way or any way' },
  { type: 'dial', label: 'Dial', hint: 'Turn a finger round the hotspot’s middle: the turning changes a value' },
  { type: 'hold', label: 'Hold', hint: 'Actions as the finger goes down, and others as it lets go' },
];

export const ACTION_TYPES: { type: ActionType; label: string; hint: string }[] = [
  { type: 'set', label: 'Set', hint: 'The variable becomes the formula, e.g. 1 - lit to switch it on and off' },
  { type: 'add', label: 'Add', hint: 'Adds the formula to the variable, kept between a lowest and highest value (or wrapping round)' },
  { type: 'mark', label: 'Mark the time', hint: 'The variable becomes now, so formulas can use since(variable) for an animation or a timer' },
  { type: 'drag', label: 'Drag value', hint: 'While dragging (or turning a dial), the variable follows the finger, from one value to another' },
  { type: 'random', label: 'Random', hint: 'The variable becomes a random number between two values (whole numbers with step 1): a die' },
  { type: 'sound', label: 'Sound', hint: 'Plays a sound: a built-in one, or one added to the drawing' },
  { type: 'vibrate', label: 'Vibrate', hint: 'A short buzz, on devices that can' },
];

/** Does the action change a variable (sounds and buzzes don't)? */
export const actionChangesVariable = (a: Action): a is Extract<Action, { var: string }> => a.do !== 'sound' && a.do !== 'vibrate';

/** Does the document have any hotspot that does something? */
export function documentHasHotspots(doc: SvgDocument): boolean {
  let found = false;
  const walk = (layers: Layer[]) => {
    for (const l of layers) {
      if (found) return;
      if (l.hotspot?.gestures.some((g) => g.actions.length || g.release?.length)) found = true;
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

/** What actions ask for besides changing variables. */
export type ActionEffect = { sound: string; volume: number } | { vibrate: number };

/**
 * Run actions in order and return the variables they changed. `env` is what
 * formulas see (each action sees the ones before it); `drag` is where the finger
 * is along the drag (0..1, for drag actions). Sounds and buzzes go to `effect`;
 * `random` (default Math.random) picks random values. A formula that doesn't
 * work skips its action.
 */
export function runActions(actions: Action[], env: Env, now: number, drag?: number, effect?: (e: ActionEffect) => void, random: () => number = Math.random): Env {
  const changes: Env = {};
  const scope: Env = { ...env, now };
  const put = (name: string, v: number) => {
    if (!Number.isFinite(v)) return;
    changes[name] = v;
    scope[name] = v;
  };
  const snap = (v: number, from: number, step?: number) => (step && step > 0 ? from + Math.round((v - from) / step) * step : v);
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
          const v = snap(a.from + (a.to - a.from) * Math.min(1, Math.max(0, drag)), a.from, a.step);
          put(a.var, Math.round(v * 1e6) / 1e6);
          break;
        }
        case 'random': {
          const lo = Math.min(a.from, a.to), hi = Math.max(a.from, a.to);
          // With a step, every step from lo to hi equally likely (a die: 1..6 step 1).
          const v = a.step && a.step > 0 ? lo + Math.floor(random() * (Math.floor((hi - lo) / a.step) + 1)) * a.step : lo + random() * (hi - lo);
          put(a.var, Math.round(v * 1e6) / 1e6);
          break;
        }
        case 'sound':
          effect?.({ sound: a.sound, volume: a.volume ?? 1 });
          break;
        case 'vibrate':
          effect?.({ vibrate: a.ms });
          break;
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
  /** A sound action: the sound (a built-in one, or the document's own id) and its volume (0..1). */
  onSound?: (sound: string, volume: number) => void;
  /** A vibrate action: how long, ms. */
  onVibrate?: (ms: number) => void;
  /** Movement (document units) before a press counts as moving rather than a tap. Default 6. */
  slop?: number | (() => number);
  /** Extra reach (document units) around thin hotspots. Default 0. */
  tolerance?: number | (() => number);
  /** A tap's longest press, ms. Default 600 (beyond it, a long press, if there is one, will have fired). */
  tapMs?: number;
  /** How long a long press is held, ms. Default 450. */
  longPressMs?: number;
  /** The most between two taps of a double tap, ms. Default 300. */
  doubleTapMs?: number;
  /** The clock (ms). Default Date.now. */
  now?: () => number;
  /** Timers (default setTimeout): returns a function that cancels it. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** Random numbers 0..1 (default Math.random). */
  random?: () => number;
}

interface Press {
  target: HotspotTarget;
  start: Point;
  startTime: number;
  /** The hotspot's box when the press began: drags are measured across it (a hotspot may move as it's dragged). */
  box: Rect;
  moved: boolean;
  /** The drag or dial following the finger, once it moves. */
  dragging: Gesture | null;
  /** A dial: the finger's angle (turns) last time, how far it has turned, and where the value started (0..1). */
  dial?: { last: number; turned: number; startT: number };
  longFired: boolean;
  cancelLong?: () => void;
}

/**
 * Turns pointer events (in document coordinates) into gestures on hotspots.
 * `down` says whether a hotspot took the press (if not, the host can pan, scroll …).
 */
export class Interaction {
  private press: Press | null = null;
  /** A tap waiting to see whether it's the first of a double tap. */
  private pendingTap: { layerId: string; time: number; fire: () => void; cancel: () => void } | null = null;
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

  private schedule(fn: () => void, ms: number): () => void {
    if (this.opts.schedule) return this.opts.schedule(fn, ms);
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  }

  private gestures(pr: Press, on: GestureType): Gesture[] {
    return pr.target.hotspot.gestures.filter((g) => g.on === on);
  }

  /** Run gestures' actions (in order, each seeing the last) and report what changed. */
  private run(gestures: Gesture[], pick: (g: Gesture) => Action[] = (g) => g.actions, drag?: number, done = true): void {
    const changes: Env = {};
    let env = this.opts.env();
    const effect = (e: ActionEffect) => {
      if ('sound' in e) this.opts.onSound?.(e.sound, e.volume);
      else this.opts.onVibrate?.(e.vibrate);
    };
    for (const g of gestures) {
      const c = runActions(pick(g), env, this.now(), drag, effect, this.opts.random);
      Object.assign(changes, c);
      env = { ...env, ...c };
    }
    if (Object.keys(changes).length || (drag !== undefined && done)) this.opts.onChange(changes, done);
  }

  /** A press: true when it's on a hotspot (follow it with move and up). */
  down(p: Point): boolean {
    const target = hotspotAt(this.opts.document(), p, this.tolerance());
    if (!target) return false;
    const pr: Press = { target, start: p, startTime: this.now(), box: target.bounds, moved: false, dragging: null, longFired: false };
    this.press = pr;
    // Hold: as the finger goes down.
    const holds = this.gestures(pr, 'hold');
    if (holds.length) this.run(holds);
    // Long press: once held still long enough.
    const longs = this.gestures(pr, 'longpress');
    if (longs.length) {
      pr.cancelLong = this.schedule(() => {
        if (this.press !== pr || pr.moved) return;
        pr.longFired = true;
        this.run(longs);
      }, this.opts.longPressMs ?? 450);
    }
    return true;
  }

  get active(): boolean {
    return !!this.press;
  }

  move(p: Point): void {
    const pr = this.press;
    if (!pr) return;
    if (!pr.moved) {
      if (Math.hypot(p.x - pr.start.x, p.y - pr.start.y) <= this.slop()) return;
      pr.moved = true;
      pr.cancelLong?.();
      if (pr.longFired) return; // a long press that then moves: nothing more
      pr.dragging = pr.target.hotspot.gestures.find((g) => g.on === 'drag' || g.on === 'dial') ?? null;
      if (pr.dragging?.on === 'dial') pr.dial = { last: this.angle(pr, pr.start), turned: 0, startT: this.dialStart(pr.dragging) };
    }
    if (pr.dragging) this.follow(pr, pr.dragging, p, false);
  }

  up(p: Point): void {
    const pr = this.press;
    this.press = null;
    if (!pr) return;
    pr.cancelLong?.();
    const holds = this.gestures(pr, 'hold');
    if (holds.length) this.run(holds, (g) => g.release ?? []);
    if (pr.longFired) return;
    if (pr.dragging) this.follow(pr, pr.dragging, p, true);
    const dist = Math.hypot(p.x - pr.start.x, p.y - pr.start.y), took = this.now() - pr.startTime;
    if (pr.moved || dist > this.slop()) {
      // A swipe: quick, and well past the slop.
      if (took <= 350 && dist >= this.slop() * 3) {
        const dx = p.x - pr.start.x, dy = p.y - pr.start.y;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        const swipes = this.gestures(pr, 'swipe').filter((g) => (g.dir ?? 'any') === 'any' || g.dir === dir);
        if (swipes.length) this.run(swipes);
      }
      return;
    }
    if (took > (this.opts.tapMs ?? 600)) return;
    this.tapped(pr);
  }

  private tapped(pr: Press): void {
    const taps = this.gestures(pr, 'tap'), doubles = this.gestures(pr, 'doubletap');
    if (!doubles.length) {
      if (taps.length) this.run(taps);
      return;
    }
    const pending = this.pendingTap;
    if (pending && pending.layerId === pr.target.layerId && this.now() - pending.time <= (this.opts.doubleTapMs ?? 300)) {
      pending.cancel();
      this.pendingTap = null;
      this.run(doubles);
      return;
    }
    // The first tap: wait to see whether a second follows.
    pending?.fire();
    const fire = () => {
      if (this.pendingTap?.fire !== fire) return;
      this.pendingTap = null;
      if (taps.length) this.run(taps);
    };
    this.pendingTap = { layerId: pr.target.layerId, time: this.now(), fire, cancel: this.schedule(fire, this.opts.doubleTapMs ?? 300) };
  }

  /** The press was interrupted (the pointer was lost): a drag keeps what it had reached; a hold lets go. */
  cancel(): void {
    const pr = this.press;
    this.press = null;
    if (!pr) return;
    pr.cancelLong?.();
    const holds = this.gestures(pr, 'hold');
    if (holds.length) this.run(holds, (g) => g.release ?? []);
    if (pr.dragging) this.opts.onChange({}, true);
  }

  /** The finger's angle round the hotspot's middle, in turns (0 at the top, clockwise). */
  private angle(pr: Press, p: Point): number {
    const cx = pr.box.x + pr.box.width / 2, cy = pr.box.y + pr.box.height / 2;
    return Math.atan2(p.x - cx, -(p.y - cy)) / (2 * Math.PI);
  }

  /** Where a dial's first drag value is now, 0..1 of its from..to (the dial turns it from there). */
  private dialStart(g: Gesture): number {
    const a = g.actions.find((x) => x.do === 'drag') as Extract<Action, { do: 'drag' }> | undefined;
    if (!a || a.to === a.from) return 0;
    const v = this.opts.env()[a.var] ?? a.from;
    return Math.min(1, Math.max(0, (v - a.from) / (a.to - a.from)));
  }

  private follow(pr: Press, g: Gesture, p: Point, done: boolean): void {
    let t: number;
    if (g.on === 'dial' && pr.dial) {
      const a = this.angle(pr, p);
      let d = a - pr.dial.last;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      pr.dial.turned += d;
      pr.dial.last = a;
      t = pr.dial.startT + pr.dial.turned / (g.turns ?? 1);
    } else {
      const b = pr.box;
      t = g.axis === 'y' ? (b.height ? (p.y - b.y) / b.height : 0) : b.width ? (p.x - b.x) / b.width : 0;
    }
    this.run([g], (x) => x.actions, Math.min(1, Math.max(0, t)), done);
  }
}

export function createInteraction(opts: InteractionOptions): Interaction {
  return new Interaction(opts);
}
