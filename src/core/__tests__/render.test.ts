import { describe, expect, it } from 'vitest';
import { createDocument, createShapeLayer, groupLayers, insertLayer, rotateShape, scaleShapeBox } from '../document';
import { createEffectModifier, createMaskModifier, createModifier } from '../modifiers';
import { buildFilterPrimitives, createEffect } from '../effects';
import { renderDocument, renderDocumentToString } from '../render';
import type { VNode } from '../vnode';

function find(node: VNode, pred: (n: VNode) => boolean): VNode[] {
  const out: VNode[] = [];
  const walk = (n: VNode) => {
    if (pred(n)) out.push(n);
    for (const c of n.children) if (typeof c !== 'string') walk(c);
  };
  walk(node);
  return out;
}

describe('renderer', () => {
  it('renders a standalone svg with background and shapes', () => {
    let doc = createDocument({ width: 200, height: 100, background: '#123456' });
    doc = insertLayer(doc, createShapeLayer({ shape: 'ellipse', x: 50, y: 50, width: 40, height: 20, rotation: 10 }));
    const svg = renderDocumentToString(doc);
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('transform="translate(50 50) rotate(10)"');
    const stretched = renderDocumentToString(
      insertLayer(createDocument(), scaleShapeBox(rotateShape(createShapeLayer({ x: 5, y: 6 }), 45), 2, 1)),
    );
    expect(stretched).toMatch(/transform="translate\(5 6\) matrix\(2 0 0 1 0 0\) rotate\(45\)"/);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('data-layer-id');
  });

  it('adds data-layer-id in interactive mode and ghosts hidden masks', () => {
    let doc = createDocument();
    const a = createShapeLayer({ name: 'a' });
    const m = createShapeLayer({ name: 'm', modifiers: [createMaskModifier({ mode: 'clip' })] });
    doc = insertLayer(doc, a);
    doc = insertLayer(doc, m);
    const tree = renderDocument(doc, { interactive: true });
    expect(find(tree, (n) => n.attrs['data-layer-id'] === a.id)).toHaveLength(1);
    const ghosts = find(tree, (n) => n.attrs['data-ghost'] !== undefined);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].attrs['data-layer-id']).toBe(m.id);
    expect(ghosts[0].attrs.fill).toBe('rgba(120,200,255,0.16)'); // faint fill shows the mask extent
    expect(ghosts[0].attrs['pointer-events']).toBe('stroke'); // but only its outline is hittable
    const noPreview = renderDocument(doc, { interactive: true, maskPreviewOpacity: 0 });
    expect(find(noPreview, (n) => n.attrs['data-ghost'] !== undefined)[0].attrs.fill).toBe('none');
  });

  it('interactive clip masks preview the hidden content faintly; exports do not', () => {
    let doc = createDocument();
    const below = createShapeLayer({ name: 'below' });
    doc = insertLayer(doc, below);
    doc = insertLayer(doc, createShapeLayer({ modifiers: [createMaskModifier({ mode: 'clip-inverse' })] }));
    const tree = renderDocument(doc, { interactive: true });
    const preview = find(tree, (n) => n.attrs['data-mask-preview'] !== undefined);
    expect(preview).toHaveLength(1);
    expect(preview[0].attrs.opacity).toBe('0.25');
    expect(preview[0].attrs['pointer-events']).toBe('none');
    // the faint copy carries no layer id, the real one does
    expect(find(preview[0], (n) => n.attrs['data-layer-id'] !== undefined)).toHaveLength(0);
    expect(find(tree, (n) => n.attrs['data-layer-id'] === below.id)).toHaveLength(1);
    expect(find(renderDocument(doc), (n) => n.attrs['data-mask-preview'] !== undefined)).toHaveLength(0);
  });

  it('activeIds make only those layers (and their children) take pointer events', () => {
    let doc = createDocument();
    const a = createShapeLayer({ name: 'a', modifiers: [createModifier('fill', { fill: { type: 'none' } })] });
    const b = createShapeLayer({ name: 'b' });
    const locked = createShapeLayer({ name: 'locked', locked: true });
    doc = insertLayer(doc, a);
    doc = insertLayer(doc, b);
    doc = insertLayer(doc, locked);
    const g = groupLayers(doc, [a.id, b.id])!;
    const tree = renderDocument(g.doc, { interactive: true, activeIds: [g.groupId] });
    const pe = (id: string) => find(tree, (n) => n.attrs['data-layer-id'] === id)[0].attrs['pointer-events'];
    expect(pe(g.groupId)).toBe('all');
    expect(pe(a.id)).toBe('all'); // transparent child of the selected group is grabbable
    expect(pe(locked.id)).toBe('none');
    const other = renderDocument(g.doc, { interactive: true, activeIds: [locked.id] });
    expect(find(other, (n) => n.attrs['data-layer-id'] === locked.id)[0].attrs['pointer-events']).toBe('none'); // locked never grabbable
    expect(find(other, (n) => n.attrs['data-layer-id'] === b.id)[0].attrs['pointer-events']).toBe('none');
    // without activeIds nothing is touched; exports never carry it
    expect(find(renderDocument(g.doc, { interactive: true }), (n) => n.attrs['pointer-events'] !== undefined)).toHaveLength(0);
    expect(renderDocumentToString(g.doc, { activeIds: [a.id] })).not.toContain('pointer-events');
  });

  it('highlights selected layers in monochrome mode only', () => {
    let doc = createDocument();
    const a = createShapeLayer({ name: 'a', color: '#ff0000' });
    const b = createShapeLayer({ name: 'b', color: '#00ff00' });
    doc = insertLayer(doc, a);
    doc = insertLayer(doc, b);
    const opts = { colorMode: 'monochrome' as const, monoColor: '#ffffff', highlightIds: [b.id], highlightColor: '#4da3ff', interactive: true };
    const tree = renderDocument(doc, opts);
    expect(find(tree, (n) => n.attrs['data-layer-id'] === a.id)[0].attrs.fill).toBe('#ffffff');
    expect(find(tree, (n) => n.attrs['data-layer-id'] === b.id)[0].attrs.fill).toBe('#4da3ff');
    // a group highlight covers its children
    const g = groupLayers(doc, [a.id, b.id])!;
    const gt = renderDocument(g.doc, { ...opts, highlightIds: [g.groupId] });
    expect(find(gt, (n) => n.attrs['data-layer-id'] === a.id)[0].attrs.fill).toBe('#4da3ff');
    // grayscale/full ignore it
    expect(renderDocumentToString(doc, { ...opts, colorMode: 'full' })).toContain('#00ff00');
  });

  it('clip mask wraps the layers below in a masked group', () => {
    let doc = createDocument();
    const below = createShapeLayer({ name: 'below' });
    const above = createShapeLayer({ name: 'above' });
    const mask = createShapeLayer({ name: 'mask', shape: 'ellipse', modifiers: [createMaskModifier({ mode: 'clip' })] });
    doc = insertLayer(doc, below);
    doc = insertLayer(doc, mask);
    doc = insertLayer(doc, above);
    const tree = renderDocument(doc, { interactive: true });
    const masked = find(tree, (n) => n.tag === 'g' && typeof n.attrs.mask === 'string');
    expect(masked).toHaveLength(1);
    // 'below' is inside the masked group, 'above' is not
    expect(find(masked[0], (n) => n.attrs['data-layer-id'] === below.id)).toHaveLength(1);
    expect(find(masked[0], (n) => n.attrs['data-layer-id'] === above.id)).toHaveLength(0);
    const defs = find(tree, (n) => n.tag === 'mask');
    expect(defs).toHaveLength(1);
    expect(defs[0].attrs.id).toBe((masked[0].attrs.mask as string).slice(5, -1));
    // mask content is painted white
    expect(find(defs[0], (n) => n.tag === 'path')[0].attrs.fill).toBe('#fff');
  });

  it('inverse mask starts with a white rect and black shape', () => {
    let doc = createDocument();
    doc = insertLayer(doc, createShapeLayer());
    doc = insertLayer(doc, createShapeLayer({ modifiers: [createMaskModifier({ mode: 'clip-inverse' })] }));
    const tree = renderDocument(doc);
    const mask = find(tree, (n) => n.tag === 'mask')[0];
    expect(mask.children[0]).toMatchObject({ tag: 'rect', attrs: { fill: '#fff' } });
    expect((mask.children[1] as VNode).attrs.fill).toBe('#000');
  });

  it('filter mask draws the stack twice: plain plus filtered copy', () => {
    let doc = createDocument();
    const below = createShapeLayer();
    doc = insertLayer(doc, below);
    doc = insertLayer(
      doc,
      createShapeLayer({ modifiers: [createMaskModifier({ mode: 'filter', effects: [createEffect('blur', { radius: 6 })] })] }),
    );
    const tree = renderDocument(doc, { interactive: true });
    const paths = find(tree, (n) => n.tag === 'path' && n.attrs['data-ghost'] === undefined);
    // original + clone inside the masked/filtered group (mask def content excluded from body count)
    const bodyPaths = paths.filter((p) => p.attrs.fill !== '#fff');
    expect(bodyPaths).toHaveLength(2);
    const filtered = find(tree, (n) => n.tag === 'g' && !!n.attrs.filter && !!n.attrs.mask);
    expect(filtered).toHaveLength(1);
    // the clone never captures pointer events nor claims the id
    const clonePath = find(filtered[0], (n) => n.tag === 'path')[0];
    expect(clonePath.attrs['pointer-events']).toBe('none');
    expect(clonePath.attrs['data-layer-id']).toBeUndefined();
    expect(find(tree, (n) => n.tag === 'feGaussianBlur')[0].attrs.stdDeviation).toBe('6');
  });

  it('filter mask with no effects leaves the stack untouched', () => {
    let doc = createDocument();
    doc = insertLayer(doc, createShapeLayer());
    doc = insertLayer(doc, createShapeLayer({ modifiers: [createMaskModifier({ mode: 'filter' })] }));
    const tree = renderDocument(doc);
    expect(find(tree, (n) => n.tag === 'g' && !!n.attrs.mask)).toHaveLength(0);
  });

  it('a mask inside a group only affects its siblings', () => {
    let doc = createDocument();
    const root = createShapeLayer({ name: 'root' });
    const a = createShapeLayer({ name: 'a' });
    const m = createShapeLayer({ name: 'm', modifiers: [createMaskModifier()] });
    doc = insertLayer(doc, root);
    doc = insertLayer(doc, a);
    doc = insertLayer(doc, m);
    const g = groupLayers(doc, [a.id, m.id])!;
    const tree = renderDocument(g.doc, { interactive: true });
    const masked = find(tree, (n) => n.tag === 'g' && !!n.attrs.mask)[0];
    expect(find(masked, (n) => n.attrs['data-layer-id'] === a.id)).toHaveLength(1);
    expect(find(masked, (n) => n.attrs['data-layer-id'] === root.id)).toHaveLength(0);
  });

  it('renders gradients, strokes, effects and blend modes', () => {
    let doc = createDocument();
    doc = insertLayer(
      doc,
      createShapeLayer({
        blendMode: 'multiply',
        opacity: 0.5,
        modifiers: [
          createModifier('fill', { fill: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] } }),
          createModifier('stroke', { color: '#f0f', width: 3 }),
          createEffectModifier('shadow'),
          createEffectModifier('outline', { enabled: false }),
        ],
      }),
    );
    const s = renderDocumentToString(doc);
    expect(s).toContain('<linearGradient');
    expect(s).toContain('stroke="#f0f"');
    expect(s).toContain('mix-blend-mode:multiply');
    expect(s).toContain('opacity="0.5"');
    expect(s).toContain('<feOffset');
    expect(s).not.toContain('feMorphology');
  });

  it('escapes attribute values', () => {
    let doc = createDocument({ background: '"><script>' });
    doc = insertLayer(doc, createShapeLayer());
    expect(renderDocumentToString(doc)).toContain('fill="&quot;&gt;&lt;script&gt;"');
  });
});

describe('modifiers', () => {
  it('layer colour is the fill unless a fill modifier overrides it; stroke defaults to the layer colour', () => {
    let doc = createDocument();
    const a = createShapeLayer({ name: 'a', color: '#123456', modifiers: [createModifier('stroke', { color: null, width: 2 })] });
    const b = createShapeLayer({ name: 'b', color: '#123456', modifiers: [createModifier('fill', { fill: { type: 'none' } }), createModifier('stroke', { color: '#abcdef', width: 2, enabled: false })] });
    doc = insertLayer(doc, a);
    doc = insertLayer(doc, b);
    const tree = renderDocument(doc, { interactive: true });
    const pa = find(tree, (n) => n.attrs['data-layer-id'] === a.id)[0];
    const pb = find(tree, (n) => n.attrs['data-layer-id'] === b.id)[0];
    expect(pa.attrs.fill).toBe('#123456');
    expect(pa.attrs.stroke).toBe('#123456');
    expect(pb.attrs.fill).toBe('none');
    expect(pb.attrs.stroke).toBeUndefined(); // disabled modifier
  });

  it('deform turns a rectangle into a trapezoid', () => {
    const rect = createShapeLayer({ width: 100, height: 100, modifiers: [createModifier('deform', { top: 50, bottom: 100, skew: 0 })] });
    const tree = renderDocument(insertLayer(createDocument(), rect), { interactive: true });
    const d = find(tree, (n) => n.attrs['data-layer-id'] === rect.id)[0].attrs.d as string;
    const xs = [...d.matchAll(/([ML])(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[2]), Number(m[3])]);
    const top = xs.filter(([, y]) => Math.abs(y + 50) < 1e-6).map(([x]) => x);
    const bottom = xs.filter(([, y]) => Math.abs(y - 50) < 1e-6).map(([x]) => x);
    expect(Math.max(...top) - Math.min(...top)).toBeCloseTo(50, 6);
    expect(Math.max(...bottom) - Math.min(...bottom)).toBeCloseTo(100, 6);
  });

  it('edges with one inward subdivision turn a pentagon into a star', () => {
    const star = createShapeLayer({ shape: 'star', params: { points: 5, inner: 45 }, width: 200, height: 200 });
    expect(star.shape).toBe('polygon');
    expect(star.params.sides).toBe(5);
    expect(star.modifiers[0]).toMatchObject({ type: 'edges', subdivisions: 1 });
    const tree = renderDocument(insertLayer(createDocument(), star), { interactive: true });
    const d = find(tree, (n) => n.attrs['data-layer-id'] === star.id)[0].attrs.d as string;
    const pts = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Math.hypot(Number(m[1]), Number(m[2])));
    expect(pts).toHaveLength(10);
    const outer = pts.filter((r) => r > 90);
    const inner = pts.filter((r) => r <= 90);
    expect(outer).toHaveLength(5);
    expect(inner).toHaveLength(5);
    // inner radius well inside the outer points (the polygon is box-fitted, so the ratio is approximate)
    const ratio = Math.min(...inner) / Math.max(...outer);
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.6);
  });

  it('round modifier rounds corners with arcs; strokes otherwise keep sharp joins', () => {
    const rect = createShapeLayer({ width: 100, height: 40, modifiers: [createModifier('round', { radius: 50 }), createModifier('stroke', { color: '#000', width: 2 })] });
    const tree = renderDocument(insertLayer(createDocument(), rect), { interactive: true });
    const path = find(tree, (n) => n.attrs['data-layer-id'] === rect.id)[0];
    expect(path.attrs.d as string).toContain('A10 10'); // 50% of half the short side
    expect(((path.attrs.d as string).match(/A/g) ?? []).length).toBe(4);
    expect(path.attrs['stroke-linejoin']).toBe('miter');
    // rounding after edges gives a star with soft tips
    const star = createShapeLayer({ shape: 'star', width: 200, height: 200, modifiers: [createModifier('round', { radius: 10 })] });
    const st = renderDocument(insertLayer(createDocument(), star), { interactive: true });
    const d = find(st, (n) => n.attrs['data-layer-id'] === star.id)[0].attrs.d as string;
    expect(star.modifiers.map((m) => m.type)).toEqual(['edges', 'round']);
    expect((d.match(/A/g) ?? []).length).toBe(10);
  });

  it('smooth edges emit quadratic curves', () => {
    const wavy = createShapeLayer({ params: { sides: 6 }, modifiers: [createModifier('edges', { subdivisions: 1, bend: 40, smooth: true })] });
    const tree = renderDocument(insertLayer(createDocument(), wavy), { interactive: true });
    expect(find(tree, (n) => n.attrs['data-layer-id'] === wavy.id)[0].attrs.d as string).toContain('Q');
  });
});

describe('effects', () => {
  it('chains primitives through results', () => {
    const prims = buildFilterPrimitives([createEffect('blur'), createEffect('tint'), createEffect('invert')]);
    expect(prims[0].attrs.in).toBe('SourceGraphic');
    const last = prims[prims.length - 1];
    expect(last.tag).toBe('feComponentTransfer');
    expect(last.attrs.in).toBe(prims[prims.length - 2].attrs.result);
  });

  it('skips disabled effects', () => {
    expect(buildFilterPrimitives([createEffect('blur', { enabled: false })])).toEqual([]);
  });
});
