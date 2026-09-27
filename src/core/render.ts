import { recolor, toGray } from './color';
import { buildFilter, effectSpill, effectsForColorMode } from './effects';
import { childrenBounds, isIdentity2, layerLocalBounds, layerLocalMatrix } from './document';
import { expandRect, fmt, invert, type Mat, multiply, IDENTITY, transformRect } from './matrix';
import { getShape, shapePath } from './shapes';
import type { ColorMode, Effect, Fill, Layer, Rect, ShapeLayer, SvgDocument } from './types';
import { cloneVNode, h, vnodeToDom, vnodeToString, type VNode } from './vnode';

export interface RenderOptions {
  /** Prefix for generated ids (gradients, filters, masks). Use a unique one per rendered instance. */
  idPrefix?: string;
  /** Add `data-layer-id` attributes and draw hidden mask shapes as dashed ghosts (editor use). */
  interactive?: boolean;
  /** Draw the document background (default true). */
  background?: boolean;
  /**
   * Restrict output colours: `grayscale` converts every colour to a gray of
   * the same lightness; `monochrome` paints everything in `monoColor`.
   * Effects that would introduce colour are skipped. Default `full`.
   */
  colorMode?: ColorMode;
  /** The single colour used in `monochrome` mode (default white). */
  monoColor?: string;
  /**
   * Editor aid: layers (and their descendants) painted in `highlightColor`
   * instead of the monochrome colour, so a selection stays visible when every
   * shape is the same colour. Only applies in `monochrome` mode.
   */
  highlightIds?: Iterable<string>;
  highlightColor?: string;
  /**
   * Editor aid (interactive only): draw the content a clip mask hides at this
   * opacity, and fill hidden mask shapes faintly, so the effect of editing a
   * mask can be seen. 0 disables. Default 0.25 when interactive.
   */
  maskPreviewOpacity?: number;
  /**
   * Editor aid (interactive only): layers that may be grabbed on the canvas.
   * They receive `pointer-events: all` so transparent or unfilled shapes can
   * still be picked up; every other layer gets `pointer-events: none`.
   */
  activeIds?: Iterable<string>;
}

/** Paint overrides used when drawing a layer as mask content or as an editor ghost. */
interface PaintOverride {
  fill: string;
  stroke: string;
  ghost?: boolean;
}

interface Ctx {
  doc: SvgDocument;
  defs: VNode[];
  prefix: string;
  interactive: boolean;
  counter: number;
  /** World matrix of the coordinate frame currently being rendered into. */
  frame: Mat;
  colorMode: ColorMode;
  monoColor: string;
  highlight: Set<string>;
  highlightColor: string;
  maskPreview: number;
  active: Set<string> | null;
  /** Depth inside an active layer's subtree (children inherit grabbability). */
  activeDepth: number;
}

/** Apply the colour mode to a single paint colour. */
export function applyColorMode(color: string, mode: ColorMode, monoColor = '#ffffff'): string {
  if (mode === 'grayscale') return toGray(color);
  if (mode === 'monochrome') return recolor(color, monoColor);
  return color;
}

function modeEffects(effects: Effect[], ctx: Ctx): Effect[] {
  if (ctx.colorMode === 'full') return effects;
  return effectsForColorMode(effects, ctx.colorMode).map((e) =>
    'color' in e ? ({ ...e, color: applyColorMode(e.color, ctx.colorMode, ctx.monoColor) } as Effect) : e,
  );
}

function nextId(ctx: Ctx, kind: string): string {
  return `${ctx.prefix}${kind}${ctx.counter++}`;
}

/** Full standalone `<svg>` element for a document. */
export function renderDocument(doc: SvgDocument, opts: RenderOptions = {}): VNode {
  const { defs, body } = renderDocumentParts(doc, opts);
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: fmt(doc.width),
      height: fmt(doc.height),
      viewBox: `0 0 ${fmt(doc.width)} ${fmt(doc.height)}`,
    },
    [defs.length ? h('defs', {}, defs) : null, ...body],
  );
}

/** Defs and body separately, for embedding the drawing inside another SVG. */
export function renderDocumentParts(doc: SvgDocument, opts: RenderOptions = {}): { defs: VNode[]; body: VNode[] } {
  const ctx: Ctx = {
    doc,
    defs: [],
    prefix: opts.idPrefix ?? 'slt-',
    interactive: !!opts.interactive,
    counter: 0,
    frame: IDENTITY,
    colorMode: opts.colorMode ?? 'full',
    monoColor: opts.monoColor ?? '#ffffff',
    highlight: new Set(opts.highlightIds ?? []),
    highlightColor: opts.highlightColor ?? '#4da3ff',
    maskPreview: opts.interactive ? opts.maskPreviewOpacity ?? 0.25 : 0,
    active: opts.interactive && opts.activeIds ? new Set(opts.activeIds) : null,
    activeDepth: 0,
  };
  const body: VNode[] = [];
  if (doc.background && opts.background !== false) {
    const fill = applyColorMode(doc.background, ctx.colorMode, ctx.monoColor);
    body.push(h('rect', { x: 0, y: 0, width: fmt(doc.width), height: fmt(doc.height), fill }));
  }
  body.push(...renderChildren(doc.layers, ctx));
  return { defs: ctx.defs, body };
}

export function renderDocumentToString(doc: SvgDocument, opts: RenderOptions = {}): string {
  return vnodeToString(renderDocument(doc, opts));
}

export function renderDocumentToElement(doc: SvgDocument, opts: RenderOptions = {}): SVGSVGElement {
  return vnodeToDom(renderDocument(doc, opts)) as SVGSVGElement;
}

// ---------------------------------------------------------------------------

/** Document rectangle expressed in the current frame (covers everything visible). */
function visibleRegion(ctx: Ctx): Rect {
  const docRect = { x: 0, y: 0, width: ctx.doc.width, height: ctx.doc.height };
  return transformRect(docRect, invert(ctx.frame));
}

/**
 * Render a list of sibling layers (bottom first). Mask layers fold the layers
 * rendered so far into a masked group instead of drawing themselves.
 */
function renderChildren(layers: Layer[], ctx: Ctx): VNode[] {
  let acc: VNode[] = [];
  const below: Layer[] = [];
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.mask) {
      acc = applyMask(layer, acc, below, ctx);
      if (layer.mask.showShape) {
        acc.push(renderLayer(layer, ctx));
      } else if (ctx.interactive) {
        // Hidden mask shape: dashed outline plus a faint fill so its extent is visible.
        const fill = ctx.maskPreview > 0 ? 'rgba(120,200,255,0.16)' : 'none';
        acc.push(renderLayer(layer, ctx, { fill, stroke: 'rgba(120,200,255,0.9)', ghost: true }));
      }
      // The mask shape itself is not part of the stack below later masks.
      continue;
    }
    acc.push(renderLayer(layer, ctx));
    below.push(layer);
  }
  return acc;
}

function applyMask(maskLayer: Layer, acc: VNode[], below: Layer[], ctx: Ctx): VNode[] {
  const settings = maskLayer.mask!;
  if (acc.length === 0) return acc;
  const region = expandRect(visibleRegion(ctx), 2);
  const maskId = nextId(ctx, 'm');
  const white: PaintOverride = { fill: '#fff', stroke: '#fff' };
  const black: PaintOverride = { fill: '#000', stroke: '#000' };

  const maskContent: VNode[] = [];
  if (settings.mode === 'clip-inverse') {
    maskContent.push(
      h('rect', { x: fmt(region.x), y: fmt(region.y), width: fmt(region.width), height: fmt(region.height), fill: '#fff' }),
    );
    maskContent.push(renderLayer(maskLayer, ctx, black));
  } else {
    maskContent.push(renderLayer(maskLayer, ctx, white));
  }
  ctx.defs.push(
    h(
      'mask',
      {
        id: maskId,
        maskUnits: 'userSpaceOnUse',
        x: fmt(region.x),
        y: fmt(region.y),
        width: fmt(region.width),
        height: fmt(region.height),
      },
      maskContent,
    ),
  );

  let filterUrl: string | undefined;
  const maskEffects = modeEffects(settings.effects, ctx);
  if (maskEffects.length) {
    const contentBounds = childrenBounds(below) ?? region;
    const filter = buildFilter(nextId(ctx, 'f'), maskEffects, contentBounds);
    if (filter) {
      ctx.defs.push(filter);
      filterUrl = `url(#${filter.attrs.id})`;
    }
  }

  if (settings.mode === 'filter') {
    if (!filterUrl) return acc; // nothing to do: layers below stay untouched
    const copy = acc.map(cloneVNode);
    if (ctx.interactive) for (const c of copy) markClone(c);
    return [h('g', {}, acc), h('g', { mask: `url(#${maskId})`, filter: filterUrl }, copy)];
  }
  const out: VNode[] = [];
  if (ctx.maskPreview > 0) {
    // Editor aid: what the clip hides, drawn faintly underneath the real result.
    const faint = acc.map(cloneVNode);
    for (const c of faint) markClone(c);
    out.push(h('g', { opacity: fmt(ctx.maskPreview), 'pointer-events': 'none', 'data-mask-preview': '' }, faint));
  }
  out.push(h('g', { mask: `url(#${maskId})`, filter: filterUrl }, acc));
  return out;
}

/** Clones drawn on top of the originals must not steal pointer hits from them. */
function markClone(node: VNode): void {
  node.attrs['pointer-events'] = 'none';
  if ('data-layer-id' in node.attrs) delete node.attrs['data-layer-id'];
  for (const c of node.children) if (typeof c !== 'string') markClone(c);
}

function renderLayer(layer: Layer, ctx: Ctx, override?: PaintOverride): VNode {
  const isActive = ctx.active?.has(layer.id) ?? false;
  if (isActive) ctx.activeDepth++;
  try {
    return renderLayerColored(layer, ctx, override);
  } finally {
    if (isActive) ctx.activeDepth--;
  }
}

function renderLayerColored(layer: Layer, ctx: Ctx, override?: PaintOverride): VNode {
  if (!override && ctx.colorMode === 'monochrome' && ctx.highlight.has(layer.id) && ctx.monoColor !== ctx.highlightColor) {
    const prev = ctx.monoColor;
    ctx.monoColor = ctx.highlightColor;
    try {
      return renderLayerInner(layer, ctx, override);
    } finally {
      ctx.monoColor = prev;
    }
  }
  return renderLayerInner(layer, ctx, override);
}

function renderLayerInner(layer: Layer, ctx: Ctx, override?: PaintOverride): VNode {
  const attrs: Record<string, string | number | undefined> = {};
  const styles: string[] = [];
  if (layer.opacity < 1) attrs.opacity = fmt(layer.opacity);
  if (layer.blendMode !== 'normal' && !override) styles.push(`mix-blend-mode:${layer.blendMode}`);
  const effects = override?.ghost ? [] : modeEffects(layer.effects, ctx);
  if (effects.length) {
    const local = layerLocalBounds(layer) ?? { x: 0, y: 0, width: 0, height: 0 };
    const filter = buildFilter(nextId(ctx, 'f'), effects, local);
    if (filter) {
      ctx.defs.push(filter);
      attrs.filter = `url(#${filter.attrs.id})`;
    }
  }
  if (ctx.interactive) {
    attrs['data-layer-id'] = layer.id;
    attrs['data-layer-type'] = layer.type;
    if (layer.locked) attrs['data-locked'] = '';
    if (override?.ghost) attrs['data-ghost'] = '';
    if (ctx.active) {
      // Only grabbable layers take pointer events; they do so over their whole box even when transparent.
      attrs['pointer-events'] = ctx.activeDepth > 0 && !layer.locked ? 'all' : 'none';
      if (ctx.activeDepth > 0) attrs['data-active'] = '';
    }
  }
  if (styles.length) attrs.style = styles.join(';');

  const m = layerLocalMatrix(layer);
  attrs.transform = transformString(layer);

  if (layer.type === 'group') {
    const prevFrame = ctx.frame;
    ctx.frame = multiply(prevFrame, m);
    const children = renderChildren(layer.children, ctx);
    ctx.frame = prevFrame;
    // Render children with overrides too (mask content of a group is the union of its children).
    const content = override ? children.map((c) => applyOverrideDeep(c, override)) : children;
    return h('g', attrs, content);
  }
  return renderShape(layer, attrs, ctx, override);
}

function transformString(layer: Layer): string | undefined {
  const parts: string[] = [];
  if (layer.x !== 0 || layer.y !== 0) parts.push(`translate(${fmt(layer.x)} ${fmt(layer.y)})`);
  if (layer.type === 'shape') {
    const k = layer.stretch;
    if (k && !isIdentity2(k)) parts.push(`matrix(${fmt(k.a)} ${fmt(k.b)} ${fmt(k.c)} ${fmt(k.d)} 0 0)`);
    if (layer.rotation !== 0) parts.push(`rotate(${fmt(layer.rotation)})`);
    if (layer.flipX || layer.flipY) parts.push(`scale(${layer.flipX ? -1 : 1} ${layer.flipY ? -1 : 1})`);
  } else {
    if (layer.rotation !== 0) parts.push(`rotate(${fmt(layer.rotation)})`);
    if (layer.scale !== 1) parts.push(`scale(${fmt(layer.scale)})`);
  }
  return parts.length ? parts.join(' ') : undefined;
}

/**
 * Replace paints on already rendered nodes (used when a group acts as a mask).
 * Filters are kept: a blurred child softens the mask edge as expected.
 */
function applyOverrideDeep(node: VNode, override: PaintOverride): VNode {
  const out: VNode = { tag: node.tag, attrs: { ...node.attrs }, children: [] };
  if (node.tag === 'path' || node.tag === 'rect') {
    if (out.attrs.fill !== undefined && out.attrs.fill !== 'none') out.attrs.fill = override.fill;
    if (out.attrs.stroke !== undefined && out.attrs.stroke !== 'none') out.attrs.stroke = override.stroke;
    if (override.ghost) applyGhost(out);
  }
  if (out.attrs.style) delete out.attrs.style;
  if (node.tag === 'g' && out.attrs.mask) {
    // Masks within a mask are honoured (the def already exists).
  }
  out.children = node.children.map((c) => (typeof c === 'string' ? c : applyOverrideDeep(c, override)));
  return out;
}

function applyGhost(node: VNode): void {
  if (node.attrs['pointer-events'] !== 'all') node.attrs['pointer-events'] = 'stroke';
  node.attrs['stroke-width'] = 1;
  node.attrs['stroke-dasharray'] = '4 3';
  node.attrs['vector-effect'] = 'non-scaling-stroke';
  delete node.attrs.filter;
  delete node.attrs.opacity;
}

function renderShape(
  layer: ShapeLayer,
  attrs: Record<string, string | number | undefined>,
  ctx: Ctx,
  override?: PaintOverride,
): VNode {
  const def = getShape(layer.shape);
  const d = shapePath(layer.shape, layer.width, layer.height, layer.params);
  attrs.d = d;
  if (def.fillRule === 'evenodd') attrs['fill-rule'] = 'evenodd';

  if (override) {
    attrs.fill = layer.fill.type === 'none' ? 'none' : override.fill;
    if (layer.stroke && layer.stroke.width > 0) {
      attrs.stroke = override.stroke;
      attrs['stroke-width'] = fmt(layer.stroke.width);
    }
    if (override.ghost) {
      attrs.stroke = override.stroke;
      if (layer.fill.type === 'none' && !(layer.stroke && layer.stroke.width > 0)) attrs.fill = override.fill;
      applyGhost({ tag: 'path', attrs, children: [] });
    }
  } else {
    attrs.fill = fillValue(layer.fill, ctx);
    if (layer.stroke && layer.stroke.width > 0) {
      attrs.stroke = applyColorMode(layer.stroke.color, ctx.colorMode, ctx.monoColor);
      attrs['stroke-width'] = fmt(layer.stroke.width);
      attrs['stroke-linejoin'] = 'round';
    }
  }
  return h('path', attrs);
}

function fillValue(fill: Fill, ctx: Ctx): string {
  const col = (c: string) => applyColorMode(c, ctx.colorMode, ctx.monoColor);
  if (ctx.colorMode === 'monochrome' && fill.type !== 'none') {
    // A gradient between identical colours is a solid; keep alpha of the first stop.
    return col(fill.type === 'solid' ? fill.color : fill.stops[0]?.color ?? ctx.monoColor);
  }
  switch (fill.type) {
    case 'none':
      return 'none';
    case 'solid':
      return col(fill.color);
    case 'linear': {
      const id = nextId(ctx, 'g');
      const a = ((fill.angle - 90) * Math.PI) / 180;
      // Direction vector inside the object bounding box (0..1).
      const dx = Math.cos(a) / 2;
      const dy = Math.sin(a) / 2;
      ctx.defs.push(
        h(
          'linearGradient',
          { id, x1: fmt(0.5 - dx), y1: fmt(0.5 - dy), x2: fmt(0.5 + dx), y2: fmt(0.5 + dy) },
          fill.stops.map((s) => h('stop', { offset: fmt(s.offset), 'stop-color': col(s.color) })),
        ),
      );
      return `url(#${id})`;
    }
    case 'radial': {
      const id = nextId(ctx, 'g');
      ctx.defs.push(
        h(
          'radialGradient',
          { id },
          fill.stops.map((s) => h('stop', { offset: fmt(s.offset), 'stop-color': col(s.color) })),
        ),
      );
      return `url(#${id})`;
    }
  }
}

/** Spill (in local units) of a layer's own effects; useful for export padding. */
export function layerEffectSpill(layer: Layer): number {
  return effectSpill(layer.effects);
}
