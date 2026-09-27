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
  shapeGeometry,
  ungroupLayer,
  updateLayer,
} from '../document';
import { applyToPoint } from '../matrix';
import type { GroupLayer } from '../types';

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
    // origin at the selection centre (shape boxes are axis aligned regardless of rotation)
    expect(group.x).toBeCloseTo((75 + 225) / 2, 5);
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
    // A rotated group folds its rotation into the children and keeps their centres.
    const rotated = updateLayer<GroupLayer>(res.doc, res.groupId, { rotation: 30 });
    const centreBefore = applyToPoint(layerWorldMatrix(rotated, a.id), { x: 0, y: 0 });
    const un2 = ungroupLayer(rotated, res.groupId)!;
    const aAfter = findLayer(un2.doc, a.id)!;
    expect(aAfter.rotation).toBeCloseTo(30, 6);
    const centreAfter = applyToPoint(layerWorldMatrix(un2.doc, a.id), { x: 0, y: 0 });
    expect(centreAfter.x).toBeCloseTo(centreBefore.x, 6);
    expect(centreAfter.y).toBeCloseTo(centreBefore.y, 6);
  });

  it('shape boxes stay in canvas axes while rotation turns the content inside', () => {
    const square = createShapeLayer({ x: 100, y: 100, width: 100, height: 100, rotation: 45 });
    // world bounds are the box itself, not the rotated square's diagonal
    let doc = insertLayer(createDocument(), square);
    expect(layerWorldBounds(doc, square.id)).toEqual({ x: 50, y: 50, width: 100, height: 100 });
    const g = shapeGeometry(square);
    expect(g.baseWidth).toBeCloseTo(100 * Math.SQRT2, 6); // rotated diagonal fills the box
    expect(g.scaleX).toBeCloseTo(0.5, 6);
    expect(g.scaleY).toBeCloseTo(0.5, 6);
    // at 0° and 90° geometry is generated at the box size with no stretch
    const r0 = shapeGeometry({ ...square, rotation: 0, width: 200, height: 50 });
    expect([r0.baseWidth, r0.baseHeight, r0.scaleX, r0.scaleY]).toEqual([200, 50, 1, 1]);
    const r90 = shapeGeometry({ ...square, rotation: 90, width: 200, height: 50 });
    expect(r90.baseWidth).toBeCloseTo(50, 9);
    expect(r90.baseHeight).toBeCloseTo(200, 9);
    expect(r90.scaleX).toBeCloseTo(1, 9);
    expect(r90.scaleY).toBeCloseTo(1, 9);
    // a wide box with rotated content: the rotated base is stretched to fit, and the corners map to the box
    const wide = createShapeLayer({ x: 0, y: 0, width: 300, height: 100, rotation: 45 });
    doc = insertLayer(createDocument(), wide);
    expect(layerWorldBounds(doc, wide.id)).toEqual({ x: -150, y: -50, width: 300, height: 100 });
    const m = layerWorldMatrix(doc, wide.id);
    const gw = shapeGeometry(wide);
    const corner = applyToPoint(m, { x: gw.baseWidth / 2, y: -gw.baseHeight / 2 });
    expect(Math.abs(corner.x)).toBeLessThanOrEqual(150 + 1e-9);
    expect(Math.abs(corner.y)).toBeLessThanOrEqual(50 + 1e-9);
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
    expect(star.type === 'shape' && star.fill).toEqual({ type: 'solid', color: '#f00' });
    expect(star.type === 'shape' && star.params.points).toBe(5);
    expect(star.effects).toHaveLength(1);
    expect(star.effects[0]).toMatchObject({ type: 'blur', radius: 4, enabled: true });
    const g = doc.layers[1] as GroupLayer;
    expect(g.mask!.mode).toBe('clip');
    expect(g.children[0].type === 'shape' && g.children[0].shape).toBe('polygon');
  });

  it('createShapeLayer merges params with defaults and resolves aliases', () => {
    const l = createShapeLayer({ shape: 'star', params: { points: 8 } });
    expect(l.params).toEqual({ points: 8, inner: 45, radius: 0 });
    const legacy = createShapeLayer({ shape: 'hexagon' });
    expect(legacy.shape).toBe('polygon');
    expect(legacy.params.sides).toBe(6);
    expect(legacy.name).toBe('Polygon');
    expect(createGroupLayer().children).toEqual([]);
  });

  it('normalises legacy shape ids in loaded documents', () => {
    const doc = normalizeDocument({ layers: [{ type: 'shape', shape: 'ring', params: { thickness: 20 } }] });
    const l = doc.layers[0];
    expect(l.type === 'shape' && l.shape).toBe('ellipse');
    expect(l.type === 'shape' && l.params).toEqual({ sweep: 360, start: 0, hole: 80 });
  });
});
