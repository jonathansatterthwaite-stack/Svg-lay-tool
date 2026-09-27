/**
 * A tiny virtual node tree used by the renderer so the same output can be
 * serialised to a string (export, tests, server side) or turned into live
 * SVG DOM (editor canvas).
 */
export type Attrs = Record<string, string | number | boolean | null | undefined>;

export interface VNode {
  tag: string;
  attrs: Attrs;
  children: (VNode | string)[];
}

export function h(tag: string, attrs: Attrs = {}, children: (VNode | string | null | undefined | false)[] = []): VNode {
  return {
    tag,
    attrs,
    children: children.filter((c): c is VNode | string => c !== null && c !== undefined && c !== false),
  };
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function attrString(attrs: Attrs): string {
  let out = '';
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    out += ` ${k}="${escapeXml(String(v === true ? '' : v))}"`;
  }
  return out;
}

export function vnodeToString(node: VNode | string, indent = ''): string {
  if (typeof node === 'string') return escapeXml(node);
  const open = `${indent}<${node.tag}${attrString(node.attrs)}`;
  if (node.children.length === 0) return `${open}/>`;
  const inner = node.children.map((c) => vnodeToString(c, indent + '  ')).join('\n');
  return `${open}>\n${inner}\n${indent}</${node.tag}>`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function vnodeToDom(node: VNode, doc: Document = document): SVGElement {
  const el = doc.createElementNS(SVG_NS, node.tag);
  for (const [k, v] of Object.entries(node.attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'xmlns') continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const child of node.children) {
    if (typeof child === 'string') el.appendChild(doc.createTextNode(child));
    else el.appendChild(vnodeToDom(child, doc));
  }
  return el;
}

export function cloneVNode(node: VNode): VNode {
  return {
    tag: node.tag,
    attrs: { ...node.attrs },
    children: node.children.map((c) => (typeof c === 'string' ? c : cloneVNode(c))),
  };
}
