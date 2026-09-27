import { createId } from './ids';
import { fmt } from './matrix';
import type { Effect, EffectType, Rect } from './types';
import { h, type VNode } from './vnode';

export interface EffectParamDef {
  key: string;
  label: string;
  kind: 'number' | 'color';
  min?: number;
  max?: number;
  step?: number;
}

export interface EffectDefinition {
  type: EffectType;
  label: string;
  params: EffectParamDef[];
  defaults: Omit<Effect, 'id' | 'enabled' | 'type'>;
}

export const EFFECT_DEFS: Record<EffectType, EffectDefinition> = {
  blur: {
    type: 'blur',
    label: 'Blur',
    params: [{ key: 'radius', label: 'Radius', kind: 'number', min: 0, max: 100, step: 0.5 }],
    defaults: { radius: 4 },
  },
  brightness: {
    type: 'brightness',
    label: 'Brightness',
    params: [{ key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 3, step: 0.05 }],
    defaults: { amount: 1.3 },
  },
  contrast: {
    type: 'contrast',
    label: 'Contrast',
    params: [{ key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 3, step: 0.05 }],
    defaults: { amount: 1.3 },
  },
  saturate: {
    type: 'saturate',
    label: 'Saturation',
    params: [{ key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 3, step: 0.05 }],
    defaults: { amount: 1.5 },
  },
  'hue-rotate': {
    type: 'hue-rotate',
    label: 'Hue rotate',
    params: [{ key: 'degrees', label: 'Degrees', kind: 'number', min: -180, max: 180, step: 1 }],
    defaults: { degrees: 90 },
  },
  grayscale: {
    type: 'grayscale',
    label: 'Grayscale',
    params: [{ key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 1, step: 0.01 }],
    defaults: { amount: 1 },
  },
  sepia: {
    type: 'sepia',
    label: 'Sepia',
    params: [{ key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 1, step: 0.01 }],
    defaults: { amount: 1 },
  },
  invert: {
    type: 'invert',
    label: 'Invert',
    params: [{ key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 1, step: 0.01 }],
    defaults: { amount: 1 },
  },
  tint: {
    type: 'tint',
    label: 'Tint',
    params: [
      { key: 'color', label: 'Colour', kind: 'color' },
      { key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 1, step: 0.01 },
    ],
    defaults: { color: '#ff6a00', amount: 0.6 },
  },
  shadow: {
    type: 'shadow',
    label: 'Drop shadow',
    params: [
      { key: 'dx', label: 'Offset X', kind: 'number', min: -100, max: 100, step: 1 },
      { key: 'dy', label: 'Offset Y', kind: 'number', min: -100, max: 100, step: 1 },
      { key: 'blur', label: 'Blur', kind: 'number', min: 0, max: 50, step: 0.5 },
      { key: 'color', label: 'Colour', kind: 'color' },
      { key: 'opacity', label: 'Opacity', kind: 'number', min: 0, max: 1, step: 0.01 },
    ],
    defaults: { dx: 4, dy: 4, blur: 3, color: '#000000', opacity: 0.6 },
  },
  glow: {
    type: 'glow',
    label: 'Glow',
    params: [
      { key: 'radius', label: 'Radius', kind: 'number', min: 0, max: 60, step: 0.5 },
      { key: 'color', label: 'Colour', kind: 'color' },
      { key: 'strength', label: 'Strength', kind: 'number', min: 0, max: 5, step: 0.1 },
    ],
    defaults: { radius: 6, color: '#ffffff', strength: 2 },
  },
  outline: {
    type: 'outline',
    label: 'Outline',
    params: [
      { key: 'width', label: 'Width', kind: 'number', min: 0, max: 50, step: 0.5 },
      { key: 'color', label: 'Colour', kind: 'color' },
    ],
    defaults: { width: 3, color: '#ffffff' },
  },
};

export const EFFECT_TYPES = Object.keys(EFFECT_DEFS) as EffectType[];

export function createEffect(type: EffectType, overrides: Record<string, unknown> = {}): Effect {
  const def = EFFECT_DEFS[type];
  return { id: createId('e'), enabled: true, type, ...def.defaults, ...overrides } as Effect;
}

/** How far (in user units) an effect chain may paint outside its source bounds. */
export function effectSpill(effects: Effect[]): number {
  let spill = 0;
  for (const e of effects) {
    if (!e.enabled) continue;
    switch (e.type) {
      case 'blur':
        spill += e.radius * 3;
        break;
      case 'shadow':
        spill += e.blur * 3 + Math.max(Math.abs(e.dx), Math.abs(e.dy));
        break;
      case 'glow':
        spill += e.radius * 3;
        break;
      case 'outline':
        spill += e.width;
        break;
      default:
        break;
    }
  }
  return spill;
}

function grayscaleMatrix(a: number): string {
  const i = 1 - a;
  return [
    0.2126 + 0.7874 * i,
    0.7152 - 0.7152 * i,
    0.0722 - 0.0722 * i,
    0,
    0,
    0.2126 - 0.2126 * i,
    0.7152 + 0.2848 * i,
    0.0722 - 0.0722 * i,
    0,
    0,
    0.2126 - 0.2126 * i,
    0.7152 - 0.7152 * i,
    0.0722 + 0.9278 * i,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ]
    .map(fmt)
    .join(' ');
}

function sepiaMatrix(a: number): string {
  const i = 1 - a;
  return [
    0.393 + 0.607 * i,
    0.769 - 0.769 * i,
    0.189 - 0.189 * i,
    0,
    0,
    0.349 - 0.349 * i,
    0.686 + 0.314 * i,
    0.168 - 0.168 * i,
    0,
    0,
    0.272 - 0.272 * i,
    0.534 - 0.534 * i,
    0.131 + 0.869 * i,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ]
    .map(fmt)
    .join(' ');
}

/**
 * Build the primitives of an SVG `<filter>` implementing the effect chain.
 * Returns an empty list when nothing is enabled.
 */
export function buildFilterPrimitives(effects: Effect[]): VNode[] {
  const out: VNode[] = [];
  let cur = 'SourceGraphic';
  let n = 0;
  const next = () => `r${n++}`;

  for (const e of effects) {
    if (!e.enabled) continue;
    switch (e.type) {
      case 'blur': {
        const r = next();
        out.push(h('feGaussianBlur', { in: cur, stdDeviation: fmt(e.radius), result: r }));
        cur = r;
        break;
      }
      case 'brightness': {
        const r = next();
        out.push(
          h('feComponentTransfer', { in: cur, result: r }, [
            h('feFuncR', { type: 'linear', slope: fmt(e.amount) }),
            h('feFuncG', { type: 'linear', slope: fmt(e.amount) }),
            h('feFuncB', { type: 'linear', slope: fmt(e.amount) }),
          ]),
        );
        cur = r;
        break;
      }
      case 'contrast': {
        const r = next();
        const intercept = fmt(-(0.5 * e.amount) + 0.5);
        out.push(
          h('feComponentTransfer', { in: cur, result: r }, [
            h('feFuncR', { type: 'linear', slope: fmt(e.amount), intercept }),
            h('feFuncG', { type: 'linear', slope: fmt(e.amount), intercept }),
            h('feFuncB', { type: 'linear', slope: fmt(e.amount), intercept }),
          ]),
        );
        cur = r;
        break;
      }
      case 'saturate': {
        const r = next();
        out.push(h('feColorMatrix', { in: cur, type: 'saturate', values: fmt(e.amount), result: r }));
        cur = r;
        break;
      }
      case 'hue-rotate': {
        const r = next();
        out.push(h('feColorMatrix', { in: cur, type: 'hueRotate', values: fmt(e.degrees), result: r }));
        cur = r;
        break;
      }
      case 'grayscale': {
        const r = next();
        out.push(h('feColorMatrix', { in: cur, type: 'matrix', values: grayscaleMatrix(e.amount), result: r }));
        cur = r;
        break;
      }
      case 'sepia': {
        const r = next();
        out.push(h('feColorMatrix', { in: cur, type: 'matrix', values: sepiaMatrix(e.amount), result: r }));
        cur = r;
        break;
      }
      case 'invert': {
        const r = next();
        const table = `${fmt(e.amount)} ${fmt(1 - e.amount)}`;
        out.push(
          h('feComponentTransfer', { in: cur, result: r }, [
            h('feFuncR', { type: 'table', tableValues: table }),
            h('feFuncG', { type: 'table', tableValues: table }),
            h('feFuncB', { type: 'table', tableValues: table }),
          ]),
        );
        cur = r;
        break;
      }
      case 'tint': {
        const flood = next();
        const shape = next();
        const r = next();
        out.push(h('feFlood', { 'flood-color': e.color, result: flood }));
        out.push(h('feComposite', { in: flood, in2: cur, operator: 'in', result: shape }));
        out.push(
          h('feComposite', {
            in: shape,
            in2: cur,
            operator: 'arithmetic',
            k1: 0,
            k2: fmt(e.amount),
            k3: fmt(1 - e.amount),
            k4: 0,
            result: r,
          }),
        );
        cur = r;
        break;
      }
      case 'shadow': {
        const blur = next();
        const off = next();
        const flood = next();
        const sh = next();
        const r = next();
        out.push(h('feGaussianBlur', { in: cur, stdDeviation: fmt(e.blur), result: blur }));
        out.push(h('feOffset', { in: blur, dx: fmt(e.dx), dy: fmt(e.dy), result: off }));
        out.push(h('feFlood', { 'flood-color': e.color, 'flood-opacity': fmt(e.opacity), result: flood }));
        out.push(h('feComposite', { in: flood, in2: off, operator: 'in', result: sh }));
        out.push(h('feMerge', { result: r }, [h('feMergeNode', { in: sh }), h('feMergeNode', { in: cur })]));
        cur = r;
        break;
      }
      case 'glow': {
        const blur = next();
        const flood = next();
        const gl = next();
        const strong = next();
        const r = next();
        out.push(h('feGaussianBlur', { in: cur, stdDeviation: fmt(e.radius), result: blur }));
        out.push(h('feFlood', { 'flood-color': e.color, result: flood }));
        out.push(h('feComposite', { in: flood, in2: blur, operator: 'in', result: gl }));
        out.push(
          h('feComponentTransfer', { in: gl, result: strong }, [
            h('feFuncA', { type: 'linear', slope: fmt(e.strength) }),
          ]),
        );
        out.push(h('feMerge', { result: r }, [h('feMergeNode', { in: strong }), h('feMergeNode', { in: cur })]));
        cur = r;
        break;
      }
      case 'outline': {
        const dil = next();
        const flood = next();
        const ol = next();
        const r = next();
        out.push(h('feMorphology', { in: cur, operator: 'dilate', radius: fmt(e.width), result: dil }));
        out.push(h('feFlood', { 'flood-color': e.color, result: flood }));
        out.push(h('feComposite', { in: flood, in2: dil, operator: 'in', result: ol }));
        out.push(h('feMerge', { result: r }, [h('feMergeNode', { in: ol }), h('feMergeNode', { in: cur })]));
        cur = r;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** A complete `<filter>` element for an effect chain over a region (user space). */
export function buildFilter(id: string, effects: Effect[], region: Rect): VNode | null {
  const prims = buildFilterPrimitives(effects);
  if (prims.length === 0) return null;
  const spill = effectSpill(effects) + 2;
  return h(
    'filter',
    {
      id,
      filterUnits: 'userSpaceOnUse',
      x: fmt(region.x - spill),
      y: fmt(region.y - spill),
      width: fmt(region.width + spill * 2),
      height: fmt(region.height + spill * 2),
      'color-interpolation-filters': 'sRGB',
    },
    prims,
  );
}
