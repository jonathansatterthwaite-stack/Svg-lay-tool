/**
 * Variables and bindings: a document declares numeric variables (with
 * sliders in the editor), the environment adds time built-ins, and layers
 * bind properties to expressions that are evaluated when rendering.
 */
import { evaluate, referencedNames, type Env } from './expr';
import { createId } from './ids';
import { layerLinear, layerLocalBounds, rotateLayer } from './document';
import { applyToVector } from './matrix';
import { MODIFIER_DEFS } from './modifiers';
import type { Binding, Layer, Modifier, SvgDocument, Variable } from './types';

export const TIME_VARIABLES: { name: string; label: string }[] = [
  { name: 'hours', label: 'Hour of day, 0–23 (whole)' },
  { name: 'hours12', label: 'Hour on a 12-hour clock, 0–11 (whole)' },
  { name: 'minutes', label: 'Minute, 0–59 (whole)' },
  { name: 'seconds', label: 'Second, 0–59 (whole)' },
  { name: 'time', label: 'Seconds since midnight, fractional (smooth hands)' },
  { name: 'dayFraction', label: 'Fraction of the day elapsed, 0–1' },
  { name: 'weekday', label: 'Day of week, 0 = Sunday' },
  { name: 'date', label: 'Day of month, 1–31' },
  { name: 'month', label: 'Month, 1–12' },
  { name: 'year', label: 'Year' },
  { name: 't', label: 'Seconds since the document was opened (for loops)' },
  { name: 'now', label: 'Milliseconds since 1970' },
];

export const TIME_VARIABLE_NAMES = TIME_VARIABLES.map((v) => v.name);

/** Time built-ins for a moment (default: now). `start` is when the session began, for `t`. */
export function timeEnv(at: Date | number = Date.now(), start: number = sessionStart): Env {
  const d = at instanceof Date ? at : new Date(at);
  const ms = d.getTime();
  const seconds = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
  return {
    hours: d.getHours(),
    hours12: d.getHours() % 12,
    minutes: d.getMinutes(),
    seconds: d.getSeconds(),
    time: seconds,
    dayFraction: seconds / 86400,
    weekday: d.getDay(),
    date: d.getDate(),
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    t: (ms - start) / 1000,
    now: ms,
  };
}

const sessionStart = Date.now();

export function createVariable(init: Partial<Variable> = {}): Variable {
  return { id: createId('v'), name: 'value', value: 0.5, min: 0, max: 1, step: 0.01, ...init };
}

export function createBinding(target: string, expression: string, anchor?: { x: number; y: number }): Binding {
  return { id: createId('b'), target, expression, enabled: true, ...(anchor ? { anchor } : {}) };
}

/** Which anchor axes a target uses: rotation and scale both, width only x, height only y. */
export function anchorAxes(target: string): 'xy' | 'x' | 'y' | null {
  switch (target) {
    case 'rotation':
    case 'scale':
      return 'xy';
    case 'width':
      return 'x';
    case 'height':
      return 'y';
    default:
      return null;
  }
}

/** The anchor as a point in the layer's local (pre-transform) coordinates. */
export function anchorLocalPoint(layer: Layer, anchor: { x: number; y: number } = { x: 0.5, y: 0.5 }): { x: number; y: number } {
  const b = layerLocalBounds(layer) ?? { x: 0, y: 0, width: 0, height: 0 };
  return { x: b.x + b.width * anchor.x, y: b.y + b.height * anchor.y };
}

/** Move a layer so that the local point `p` (of `before`) stays at the same parent position in `after`. */
function keepPointFixed<T extends Layer>(before: Layer, after: T, pBefore: { x: number; y: number }, pAfter: { x: number; y: number }): T {
  const w0 = applyToVector(layerLinear(before), pBefore);
  const w1 = applyToVector(layerLinear(after), pAfter);
  return { ...after, x: after.x + (w0.x - w1.x), y: after.y + (w0.y - w1.y) };
}

/** Environment for a document: time built-ins, then the document's variables, then overrides. */
export function documentEnv(doc: SvgDocument, overrides: Env = {}, at?: Date | number): Env {
  const env: Env = timeEnv(at);
  // Host values first so formulas can use app variables; a host override of a
  // document variable also wins over that variable's own value or formula.
  Object.assign(env, overrides);
  for (const v of doc.variables ?? []) {
    if (v.name in overrides) continue;
    env[v.name] = variableValue(v, env);
  }
  return env;
}

/** Current value of a variable: its formula evaluated against `env` (falling back to `value` on error), or `value`. */
export function variableValue(v: Variable, env: Env): number {
  if (!v.expression?.trim()) return v.value;
  try {
    return evaluate(v.expression, env);
  } catch {
    return v.value;
  }
}

/** Evaluate a variable's formula, throwing on error (for editor feedback). Variables after `v` are not visible to it. */
export function evaluateVariable(doc: SvgDocument, v: Variable, overrides: Env = {}, at?: Date | number): number {
  const env: Env = timeEnv(at);
  Object.assign(env, overrides);
  for (const o of doc.variables ?? []) {
    if (o.id === v.id) break;
    if (!(o.name in overrides)) env[o.name] = variableValue(o, env);
  }
  return evaluate(v.expression ?? String(v.value), env);
}

// ---------------------------------------------------------------------------
// Bindable targets

export interface BindableTarget {
  /** Path used in `Binding.target`. */
  key: string;
  label: string;
  /** Boolean targets treat non-zero as true. */
  kind: 'number' | 'boolean';
}

/** Properties of a layer that can be bound to an expression. */
export function bindableTargets(layer: Layer): BindableTarget[] {
  const out: BindableTarget[] = [
    { key: 'x', label: 'X', kind: 'number' },
    { key: 'y', label: 'Y', kind: 'number' },
    { key: 'rotation', label: 'Rotation', kind: 'number' },
    { key: 'opacity', label: 'Opacity', kind: 'number' },
    { key: 'visible', label: 'Visible', kind: 'boolean' },
  ];
  if (layer.type === 'shape') {
    out.push({ key: 'width', label: 'Width', kind: 'number' }, { key: 'height', label: 'Height', kind: 'number' });
    for (const k of Object.keys(layer.params)) out.push({ key: `params.${k}`, label: `Shape · ${k}`, kind: 'number' });
  } else {
    out.push({ key: 'scale', label: 'Scale', kind: 'number' });
  }
  (layer.modifiers ?? []).forEach((m, i) => {
    const label = `${MODIFIER_DEFS[m.type].label} ${i + 1}`;
    out.push({ key: `modifiers.${m.id}.enabled`, label: `${label} · enabled`, kind: 'boolean' });
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === 'number' && k !== 'id') out.push({ key: `modifiers.${m.id}.${k}`, label: `${label} · ${k}`, kind: 'number' });
    }
    if (m.type === 'effect') {
      for (const [k, v] of Object.entries(m.effect)) {
        if (typeof v === 'number') out.push({ key: `modifiers.${m.id}.effect.${k}`, label: `${label} · ${k}`, kind: 'number' });
      }
    }
  });
  return out;
}

/**
 * Write a bound value into a layer copy. Unknown targets are ignored. For
 * rotation, size and scale the optional anchor (box fractions) is the point
 * that stays put.
 */
export function applyBoundValue(layer: Layer, target: string, value: number, anchor?: { x: number; y: number }): Layer {
  const a = anchor ?? { x: 0.5, y: 0.5 };
  if (target === 'rotation') {
    const p = anchorLocalPoint(layer, a);
    return keepPointFixed(layer, rotateLayer(layer, value), p, p);
  }
  if ((target === 'width' || target === 'height') && layer.type === 'shape') {
    const next = { ...layer, [target]: Math.max(0, value) };
    return keepPointFixed(layer, next, anchorLocalPoint(layer, a), anchorLocalPoint(next, a));
  }
  if (target === 'scale' && layer.type === 'group') {
    const next = { ...layer, scale: Math.max(0.0001, value) };
    const p = anchorLocalPoint(layer, a);
    return keepPointFixed(layer, next, p, p);
  }
  const parts = target.split('.');
  if (parts[0] === 'modifiers' && parts.length >= 3) {
    const [, id, ...rest] = parts;
    return {
      ...layer,
      modifiers: (layer.modifiers ?? []).map((m): Modifier => {
        if (m.id !== id) return m;
        if (rest[0] === 'effect' && m.type === 'effect' && rest.length === 2) {
          return { ...m, effect: { ...m.effect, [rest[1]]: value } } as Modifier;
        }
        if (rest.length === 1) {
          const key = rest[0];
          if (key === 'enabled') return { ...m, enabled: value !== 0 };
          if (typeof (m as unknown as Record<string, unknown>)[key] === 'number') return { ...m, [key]: value } as Modifier;
        }
        return m;
      }),
    };
  }
  if (parts[0] === 'params' && layer.type === 'shape' && parts.length === 2) {
    return { ...layer, params: { ...layer.params, [parts[1]]: value } };
  }
  switch (target) {
    case 'x':
    case 'y':
    case 'rotation':
      return { ...layer, [target]: value };
    case 'opacity':
      return { ...layer, opacity: Math.min(1, Math.max(0, value)) };
    case 'visible':
      return { ...layer, visible: value !== 0 };
    case 'width':
    case 'height':
      return layer.type === 'shape' ? { ...layer, [target]: Math.max(0, value) } : layer;
    case 'scale':
      return layer.type === 'group' ? { ...layer, scale: Math.max(0.0001, value) } : layer;
    default:
      return layer;
  }
}

export interface BindingError {
  layerId: string;
  bindingId: string;
  message: string;
}

/**
 * Evaluate every enabled binding and return a document with the bound values
 * substituted. The input is not modified. Errors are collected, not thrown;
 * a failing binding leaves its property untouched.
 */
export function resolveDocument(
  doc: SvgDocument,
  env: Env = documentEnv(doc),
  errors?: BindingError[],
): SvgDocument {
  if (!documentHasBindings(doc)) return doc;
  const walk = (layers: Layer[]): Layer[] =>
    layers.map((l) => {
      let out: Layer = l.type === 'group' ? { ...l, children: walk(l.children) } : l;
      for (const b of l.bindings ?? []) {
        if (!b.enabled || !b.expression.trim()) continue;
        try {
          out = applyBoundValue(out, b.target, evaluate(b.expression, env), b.anchor);
        } catch (err) {
          errors?.push({ layerId: l.id, bindingId: b.id, message: err instanceof Error ? err.message : String(err) });
        }
      }
      return out;
    });
  return { ...doc, layers: walk(doc.layers) };
}

export function documentHasBindings(doc: SvgDocument): boolean {
  let found = false;
  const walk = (layers: Layer[]) => {
    for (const l of layers) {
      if (found) return;
      if (l.bindings?.some((b) => b.enabled && b.expression.trim())) found = true;
      else if (l.type === 'group') walk(l.children);
    }
  };
  walk(doc.layers);
  return found;
}

/** True when any binding references a time built-in, i.e. the picture changes on its own. */
export function documentUsesTime(doc: SvgDocument): boolean {
  // Names whose value changes with time: the built-ins plus any variable whose
  // formula (transitively) depends on one of them.
  const timeNames = new Set(TIME_VARIABLE_NAMES);
  for (const v of doc.variables ?? []) {
    if (v.expression?.trim() && referencedNames(v.expression).some((n) => timeNames.has(n))) timeNames.add(v.name);
  }
  let found = false;
  const walk = (layers: Layer[]) => {
    for (const l of layers) {
      if (found) return;
      for (const b of l.bindings ?? []) {
        if (b.enabled && referencedNames(b.expression).some((n) => timeNames.has(n))) found = true;
      }
      if (l.type === 'group') walk(l.children);
    }
  };
  walk(doc.layers);
  return found;
}
