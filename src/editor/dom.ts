export type Child = Node | string | null | undefined | false;

type Props = Record<string, unknown> & {
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  on?: Record<string, EventListener>;
};

/** Small HTML element builder. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyProps(node, props);
  append(node, children);
  return node;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined> = {},
  children: Child[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v));
  append(node, children);
  return node;
}

function applyProps(node: HTMLElement, props: Props): void {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'style') {
      if (typeof v === 'string') node.style.cssText = v;
      else Object.assign(node.style, v);
    } else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'on') {
      for (const [ev, fn] of Object.entries(v as Record<string, EventListener>)) node.addEventListener(ev, fn);
    } else if (k in node) (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, String(v === true ? '' : v));
  }
}

export function append(node: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX3 = /^#([0-9a-f]{3})$/i;
const HEX8 = /^#([0-9a-f]{8})$/i;

/** Best-effort conversion of a CSS colour to #rrggbb for `<input type=color>`. */
export function toHex6(color: string, fallback = '#000000'): string {
  const c = color.trim();
  if (HEX6.test(c)) return c.toLowerCase();
  if (HEX8.test(c)) return c.slice(0, 7).toLowerCase();
  const m3 = HEX3.exec(c);
  if (m3) {
    const [r, g, b] = m3[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
  if (rgb) {
    const hex = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  if (typeof document !== 'undefined') {
    const probe = document.createElement('canvas').getContext('2d');
    if (probe) {
      probe.fillStyle = '#000';
      probe.fillStyle = c;
      const v = probe.fillStyle;
      if (HEX6.test(v)) return v;
    }
  }
  return fallback;
}

export function fmtNum(n: number, digits = 2): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r === 0 ? 0 : r);
}
