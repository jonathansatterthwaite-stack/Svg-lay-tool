/** Small colour utilities used to enforce grayscale/monochrome rendering. */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  navy: '#000080',
  teal: '#008080',
  lime: '#00ff00',
  maroon: '#800000',
  olive: '#808000',
  gold: '#ffd700',
  transparent: '#00000000',
};

/** Parse #rgb/#rgba/#rrggbb/#rrggbbaa, rgb()/rgba(), hsl()/hsla() and common names. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  const named = NAMED[s];
  if (named) return parseColor(named);
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (![3, 4, 6, 8].includes(hex.length) || /[^0-9a-f]/.test(hex)) return null;
    const full = hex.length <= 4 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (v: string, scale = 1) => (v.endsWith('%') ? (parseFloat(v) / 100) * scale : parseFloat(v));
  const a = parts[3] !== undefined ? Math.max(0, Math.min(1, num(parts[3], 1))) : 1;
  if (fn[1].startsWith('rgb')) {
    return { r: clamp255(num(parts[0], 255)), g: clamp255(num(parts[1], 255)), b: clamp255(num(parts[2], 255)), a };
  }
  const h = ((parseFloat(parts[0]) % 360) + 360) % 360;
  const sat = num(parts[1], 1) > 1 ? num(parts[1], 1) / 100 : num(parts[1], 1);
  const l = num(parts[2], 1) > 1 ? num(parts[2], 1) / 100 : num(parts[2], 1);
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: clamp255((r1 + m) * 255), g: clamp255((g1 + m) * 255), b: clamp255((b1 + m) * 255), a };
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function rgbaToString(c: Rgba): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const base = `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
  return c.a >= 1 ? base : `${base}${hex(Math.round(c.a * 255))}`;
}

/** Perceived lightness 0..255 (Rec. 709 luma). */
export function luminance(c: Rgba): number {
  return clamp255(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
}

/** Convert any colour to a neutral gray of the same lightness (alpha preserved). */
export function toGray(color: string, fallback = '#808080'): string {
  const c = parseColor(color);
  if (!c) return fallback;
  const l = luminance(c);
  return rgbaToString({ r: l, g: l, b: l, a: c.a });
}

/** Gray hex for a lightness value 0..255. */
export function grayHex(lightness: number): string {
  const l = clamp255(lightness);
  return rgbaToString({ r: l, g: l, b: l, a: 1 });
}

/** Lightness 0..255 of a colour (used by the grayscale picker). */
export function colorLightness(color: string): number {
  const c = parseColor(color);
  return c ? luminance(c) : 128;
}

export function isGray(color: string): boolean {
  const c = parseColor(color);
  return !!c && c.r === c.g && c.g === c.b;
}

/** Replace a colour's RGB with another colour's, keeping the original alpha. */
export function recolor(color: string, target: string): string {
  const src = parseColor(color);
  const dst = parseColor(target);
  if (!dst) return target;
  return rgbaToString({ ...dst, a: src ? src.a * dst.a : dst.a });
}
