import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createGroupLayer,
  createShapeLayer,
  duplicateLayers,
  findLayer,
  groupLayers,
  insertLayer,
  layerWorldBounds,
  layerWorldMatrix,
  locateLayer,
  moveLayer,
  normalizeDocument,
  removeLayers,
  reorderLayers,
  rotateLayer,
  rotateShape,
  scaleLayerBox,
  scaleShapeBox,
  setShapeBoxSize,
  shapeBox,
  layerBox,
  ungroupLayer,
  updateLayer,
} from '../document';
import { applyToPoint } from '../matrix';
import type { GroupLayer, ShapeLayer } from '../types';

function sample() {
  const a = createShapeLayer({ name: 'A', x: 100, y: 100, width: 50, height: 50 });
  const b = createShapeLayer({ name: 'B', x: 200, y: 100, width: 50, height: 50, rotation: 45 });
  const c = createShapeLayer({ name: 'C', x: 300, y: 300, width: 20, height: 20 });
  let doc = createDocument({ width: 400, height: 400 });
  doc = insertLayer(doc, a);
  doc = insertLayer(doc, b);
  doc = insertLayer(doc, c);
  return { doc, a, b, c };
}

describe('document ops', () => {
  it('inserts, updates and removes immutably', () => {
    const { doc, a } = sample();
    const next = updateLayer(doc, a.id, { x: 5 });
    expect(next).not.toBe(doc);
    expect(findLayer(doc, a.id)!.x).toBe(100);
    expect(findLayer(next, a.id)!.x).toBe(5);
    const removed = removeLayers(next, [a.id]);
    expect(findLayer(removed, a.id)).toBeNull();
    expect(removed.layers).toHaveLength(2);
    expect(updateLayer(doc, 'missing', { x: 1 })).toBe(doc);
  });

  it('groups and ungroups without moving anything on screen', () => {
    const { doc, a, b, c } = sample();
    const before = [a, b, c].map((l) => layerWorldBounds(doc, l.id)!);
    const res = groupLayers(doc, [a.id, b.id], 'G')!;
    expect(res).not.toBeNull();
    const group = findLayer(res.doc, res.groupId) as GroupLayer;
    expect(group.type).toBe('group');
    expect(group.children.map((l) => l.id)).toEqual([a.id, b.id]);
    // group sits where the top member was (index 1), c stays on top
    expect(res.doc.layers.map((l) => l.id)).toEqual([res.groupId, c.id]);
    // origin at the selection centre (b is rotated 45°, so its box is its diagonal)
    expect(group.x).toBeCloseTo((75 + 200 + 25 * Math.SQRT2) / 2, 5);
    for (const [i, l] of [a, b].entries()) {
      const wb = layerWorldBounds(res.doc, l.id)!;
      expect(wb.x).toBeCloseTo(before[i].x, 6);
      expect(wb.y).toBeCloseTo(before[i].y, 6);
    }
    // Scale + move the group, then ungroup; children keep world positions exactly.
    const scaled = updateLayer<GroupLayer>(res.doc, res.groupId, { scale: 1.5, x: group.x + 10 });
    const worldBefore = [a, b].map((l) => layerWorldMatrix(scaled, l.id));
    const un = ungroupLayer(scaled, res.groupId)!;
    expect(un.ids).toEqual([a.id, b.id]);
    expect(un.doc.layers.map((l) => l.id)).toEqual([a.id, b.id, c.id]);
    for (const [i, l] of [a, b].entries()) {
      // The child's local space is rescaled by the group scale, so a local point
      // (10,5) before corresponds to (15,7.5) after; both must land on the same world point.
      const p0 = applyToPoint(worldBefore[i], { x: 10, y: 5 });
      const p1 = applyToPoint(layerWorldMatrix(un.doc, l.id), { x: 15, y: 7.5 });
      expect(p1.x).toBeCloseTo(p0.x, 6);
      expect(p1.y).toBeCloseTo(p0.y, 6);
      const wb0 = layerWorldBounds(scaled, l.id)!;
      const wb1 = layerWorldBounds(un.doc, l.id)!;
      expect(wb1.x).toBeCloseTo(wb0.x, 6);
      expect(wb1.width).toBeCloseTo(wb0.width, 6);
    }
    const bAfter = findLayer(un.doc, b.id)!;
    expect(bAfter.type === 'shape' && bAfter.width).toBeCloseTo(75, 6);
    expect(bAfter.rotation).toBeCloseTo(45, 6);
    // A rotated + scaled group ungroups exactly too (rigid rotation keeps every point).
    const rotated = updateLayer<GroupLayer>(res.doc, res.groupId, { rotation: 30, scale: 1.5 });
    const un2 = ungroupLayer(rotated, res.groupId)!;
    for (const l of [a, b]) {
      const before = layerWorldMatrix(rotated, l.id);
      const after = layerWorldMatrix(un2.doc, l.id);
      // The group's uniform scale is folded into the child's intrinsic size, so the same
      // geometric point is at 1.5× the local coordinates afterwards.
      const k = (findLayer(un2.doc, l.id) as ShapeLayer).width / (findLayer(rotated, l.id) as ShapeLayer).width;
      expect(k).toBeCloseTo(1.5, 6);
      for (const q of [{ x: 0, y: 0 }, { x: 25, y: -25 }, { x: -10, y: 20 }]) {
        const p0 = applyToPoint(before, q);
        const p1 = applyToPoint(after, { x: q.x * k, y: q.y * k });
        expect(p1.x).toBeCloseTo(p0.x, 6);
        expect(p1.y).toBeCloseTo(p0.y, 6);
      }
    }
    expect(findLayer(un2.doc, a.id)!.rotation).toBeCloseTo(30, 6);
  });

  it('rotating a shape is rigid; its box is recomputed from the turned geometry', () => {
    const wide = createShapeLayer({ x: 0, y: 0, width: 300, height: 100 });
    const turned = rotateShape(wide, 45);
    expect(turned.width).toBe(300); // intrinsic size untouched
    expect(turned.stretch).toEqual({ a: 1, b: 0, c: 0, d: 1 });
    const box = shapeBox(turned);
    const d = (300 + 100) / Math.SQRT2;
    expect(box.width).toBeCloseTo(d, 6);
    expect(box.height).toBeCloseTo(d, 6);
    // a corner of the geometry lands where a rigid rotation puts it
    const m = layerWorldMatrix(insertLayer(createDocument(), turned), turned.id);
    const p = applyToPoint(m, { x: 150, y: 0 });
    expect(p.x).toBeCloseTo(150 / Math.SQRT2, 6);
    expect(p.y).toBeCloseTo(150 / Math.SQRT2, 6);
  });

  it('scaling a rotated shape stretches along the canvas axes and survives further rotation', () => {
    const sq = rotateShape(createShapeLayer({ width: 100, height: 100 }), 45);
    const wideDiamond = scaleShapeBox(sq, 2, 1);
    let box = shapeBox(wideDiamond);
    expect(box.width).toBeCloseTo(200 * Math.SQRT2, 6);
    expect(box.height).toBeCloseTo(100 * Math.SQRT2, 6);
    // the far right point of the diamond moved out to 2x, the top point stayed
    const m = layerWorldMatrix(insertLayer(createDocument(), wideDiamond), wideDiamond.id);
    const right = applyToPoint(m, { x: 50, y: -50 }); // the corner that sits at +x after 45°
    expect(right.x).toBeCloseTo(100 * Math.SQRT2, 6);
    expect(right.y).toBeCloseTo(0, 6);
    // rotate the wide diamond by 90°: rigid, so its box swaps dimensions
    const turned = rotateShape(wideDiamond, 135);
    box = shapeBox(turned);
    expect(box.width).toBeCloseTo(100 * Math.SQRT2, 6);
    expect(box.height).toBeCloseTo(200 * Math.SQRT2, 6);
    // setting the box size directly
    const sized = setShapeBoxSize(turned, 70, 140);
    expect(shapeBox(sized).width).toBeCloseTo(70, 6);
    expect(shapeBox(sized).height).toBeCloseTo(140, 6);
  });

  it('axis-aligned stretch at 0° / 90° folds back into the intrinsic size', () => {
    const rect = createShapeLayer({ width: 100, height: 50 });
    const wider = setShapeBoxSize(rect, 300, 50);
    expect(wider.width).toBe(300);
    expect(wider.stretch).toEqual({ a: 1, b: 0, c: 0, d: 1 });
    const turned = rotateShape(rect, 90);
    expect(shapeBox(turned)).toEqual(expect.objectContaining({ width: expect.closeTo(50, 6), height: expect.closeTo(100, 6) }));
    const stretched = setShapeBoxSize(turned, 50, 400); // canvas-axis: taller
    expect(stretched.stretch).toEqual({ a: 1, b: 0, c: 0, d: 1 });
    expect(stretched.width).toBeCloseTo(400, 6); // intrinsic width is what points up at 90°
    expect(stretched.height).toBeCloseTo(50, 6);
  });

  it('groups rotate rigidly and scale along canvas axes like shapes', () => {
    const { doc, a, b } = sample();
    const res = groupLayers(doc, [a.id, b.id])!;
    const g0 = findLayer(res.doc, res.groupId) as GroupLayer;
    const box0 = layerBox(g0)!;
    // rigid rotation: box corners after == rotated corners before (about the pivot)
    const g45 = rotateLayer(g0, 45);
    expect(g45.stretch).toEqual({ a: 1, b: 0, c: 0, d: 1 });
    const d45 = updateLayer(res.doc, res.groupId, g45);
    const before = layerWorldMatrix(res.doc, a.id);
    const after = layerWorldMatrix(d45, a.id);
    const p0 = applyToPoint(before, { x: 10, y: 0 });
    const p1 = applyToPoint(after, { x: 10, y: 0 });
    // distance from the group's pivot is preserved (rigid)
    expect(Math.hypot(p1.x - g0.x, p1.y - g0.y)).toBeCloseTo(Math.hypot(p0.x - g0.x, p0.y - g0.y), 6);
    // box is axis aligned and recomputed
    const box45 = layerBox(g45)!;
    expect(box45.width).toBeGreaterThan(box0.width * 0.9);
    // canvas-axis stretch of the rotated group, then rotate again: look preserved (points keep their distance)
    const wide = scaleLayerBox(g45, 2, 1);
    expect(layerBox(wide)!.width).toBeCloseTo(box45.width * 2, 6);
    expect(layerBox(wide)!.height).toBeCloseTo(box45.height, 6);
    const dw = updateLayer(res.doc, res.groupId, wide);
    const turned = rotateLayer(wide, 135);
    const dt = updateLayer(res.doc, res.groupId, turned);
    const q = { x: 10, y: 5 };
    const pw = applyToPoint(layerWorldMatrix(dw, b.id), q);
    const pt = applyToPoint(layerWorldMatrix(dt, b.id), q);
    expect(Math.hypot(pt.x - g0.x, pt.y - g0.y)).toBeCloseTo(Math.hypot(pw.x - g0.x, pw.y - g0.y), 6);
    // uniform stretch folds into the group scale
    const bigger = scaleLayerBox(g45, 1.5, 1.5);
    expect(bigger.scale).toBeCloseTo(1.5, 9);
    expect(bigger.stretch).toEqual({ a: 1, b: 0, c: 0, d: 1 });
    // ungrouping a stretched, rotated group is exact (compare world boxes: a child's
    // stretch may fold into its intrinsic size, which rescales its local coordinates)
    const un = ungroupLayer(dt, res.groupId)!;
    for (const l of [a, b]) {
      const wb0 = layerWorldBounds(dt, l.id)!;
      const wb1 = layerWorldBounds(un.doc, l.id)!;
      for (const k of ['x', 'y', 'width', 'height'] as const) expect(wb1[k]).toBeCloseTo(wb0[k], 5);
      const c0 = applyToPoint(layerWorldMatrix(dt, l.id), { x: 0, y: 0 });
      const c1 = applyToPoint(layerWorldMatrix(un.doc, l.id), { x: 0, y: 0 });
      expect(c1.x).toBeCloseTo(c0.x, 5);
      expect(c1.y).toBeCloseTo(c0.y, 5);
    }
  });

  it('refuses to group layers from different parents', () => {
    const { doc, a, b, c } = sample();
    const res = groupLayers(doc, [a.id, b.id])!;
    expect(groupLayers(res.doc, [a.id, c.id])).toBeNull();
  });

  it('moves and reorders', () => {
    const { doc, a, b, c } = sample();
    const res = groupLayers(doc, [a.id])!;
    let d = moveLayer(res.doc, c.id, res.groupId, 0);
    const g = findLayer(d, res.groupId) as GroupLayer;
    expect(g.children.map((l) => l.id)).toEqual([c.id, a.id]);
    expect(locateLayer(d, c.id)!.parent!.id).toBe(res.groupId);
    // cannot move a group into itself
    expect(moveLayer(d, res.groupId, res.groupId, 0)).toBe(d);
    d = reorderLayers(d, [c.id], 'front');
    expect((findLayer(d, res.groupId) as GroupLayer).children.map((l) => l.id)).toEqual([a.id, c.id]);
    d = reorderLayers(d, [res.groupId], 'front');
    expect(d.layers.map((l) => l.id)).toEqual([b.id, res.groupId]);
    d = reorderLayers(d, [res.groupId], 'backward');
    expect(d.layers.map((l) => l.id)).toEqual([res.groupId, b.id]);
  });

  it('reorders several layers without leapfrogging', () => {
    const { doc, a, b, c } = sample();
    const d = reorderLayers(doc, [a.id, b.id], 'forward');
    expect(d.layers.map((l) => l.id)).toEqual([c.id, a.id, b.id]);
  });

  it('duplicates with fresh ids above the source', () => {
    const { doc, a } = sample();
    const res = duplicateLayers(doc, [a.id]);
    expect(res.ids).toHaveLength(1);
    expect(res.doc.layers[1].id).toBe(res.ids[0]);
    expect(res.doc.layers[1].name).toBe('A copy');
    const again = duplicateLayers(res.doc, res.ids);
    expect(again.doc.layers[2].name).toBe('A copy 2');
  });

  it('normalises loose json', () => {
    const doc = normalizeDocument({
      width: 100,
      layers: [
        { type: 'shape', shape: 'star', fill: '#f00', effects: [{ type: 'blur' }, { type: 'bogus' }] },
        { type: 'group', children: [{ type: 'shape', shape: 'unknown-shape' }], mask: { mode: 'weird' } },
        'junk',
      ],
    });
    expect(doc.height).toBe(512);
    expect(doc.layers).toHaveLength(2);
    const star = doc.layers[0];
    // legacy fields are converted: solid fill → colour, effects → effect modifiers, star → polygon + edges
    expect(star.type === 'shape' && star.color).toBe('#f00');
    expect(star.type === 'shape' && star.shape).toBe('polygon');
    expect(star.type === 'shape' && star.params.sides).toBe(5);
    expect(star.modifiers.map((m) => m.type)).toEqual(['edges', 'effect']);
    expect(star.modifiers[1]).toMatchObject({ type: 'effect', effect: { type: 'blur', radius: 4, enabled: true } });
    const g = doc.layers[1] as GroupLayer;
    expect(g.modifiers[0]).toMatchObject({ type: 'mask', mode: 'clip' });
    expect(g.children[0].type === 'shape' && g.children[0].shape).toBe('polygon');
  });

  it('createShapeLayer merges params with defaults and resolves aliases', () => {
    const l = createShapeLayer({ shape: 'star', params: { points: 8 } });
    expect(l.shape).toBe('polygon');
    expect(l.params).toEqual({ sides: 8 });
    expect(l.modifiers[0].type).toBe('edges');
    const legacy = createShapeLayer({ shape: 'hexagon' });
    expect(legacy.shape).toBe('polygon');
    expect(legacy.params.sides).toBe(6);
    expect(legacy.name).toBe('Polygon');
    expect(createGroupLayer().children).toEqual([]);
  });

  it('converts a legacy corner radius parameter into a round modifier', () => {
    const doc = normalizeDocument({ layers: [{ type: 'shape', shape: 'polygon', params: { sides: 4, radius: 40 } }] });
    const l = doc.layers[0];
    expect(l.type === 'shape' && l.params).toEqual({ sides: 4 });
    expect(l.modifiers[0]).toMatchObject({ type: 'round', radius: 40 });
    const rr = createShapeLayer({ shape: 'rounded-rect', params: { radius: 25 } });
    expect(rr.modifiers[0]).toMatchObject({ type: 'round', radius: 50 });
  });

  it('normalises legacy shape ids in loaded documents', () => {
    const doc = normalizeDocument({ layers: [{ type: 'shape', shape: 'ring', params: { thickness: 20 } }] });
    const l = doc.layers[0];
    expect(l.type === 'shape' && l.shape).toBe('ellipse');
    expect(l.type === 'shape' && l.params).toEqual({ sweep: 360, start: 0, hole: 80 });
  });
});
