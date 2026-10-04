import { describe, expect, it } from 'vitest';
import { anchorAttachable, anchorUnits, anchorLocalPoint, anchorWorldPoint, applyBoundValue, createBinding, layerCentreWorld, resolveDocument } from '../bindings';
import { createDocument, createGroupLayer, createShapeLayer, findLayer, insertLayer, layerWorldMatrix, normalizeDocument, setBinding } from '../document';
import { applyToPoint } from '../matrix';
import type { SvgDocument } from '../types';

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 5);
  expect(p.y).toBeCloseTo(y, 5);
};

describe('binding anchors in pixels and attached to layers', () => {
  it('a pixel anchor is a point in the layer\'s own coordinates, even outside its box', () => {
    const bar = createShapeLayer({ x: 100, y: 100, width: 10, height: 100 });
    expect(anchorLocalPoint(bar, { x: 0, y: -80, unit: 'px' })).toEqual({ x: 0, y: -80 });
    // a pendulum: turning about a point 80 above the middle (above the bar) keeps that point still
    const swung = applyBoundValue(bar, 'rotation', 30, { x: 0, y: -80, unit: 'px' });
    const doc = insertLayer(createDocument(), swung);
    close(applyToPoint(layerWorldMatrix(doc, swung.id), { x: 0, y: -80 }), 100, 20);
  });

  it('pixel and attached anchors are for turning and scaling: a size binding keeps its edge fractions', () => {
    expect(anchorUnits('rotation')).toBe(true);
    expect(anchorUnits('scale')).toBe(true);
    expect(anchorUnits('height')).toBe(false);
  });

  it('an anchor attached to another layer turns about that layer\'s centre, and follows it', () => {
    const pin = createShapeLayer({ name: 'Pin', x: 128, y: 128, width: 10, height: 10 });
    const hand = createShapeLayer({ name: 'Hand', x: 128, y: 88, width: 8, height: 80 }); // base at the pin
    let doc: SvgDocument = insertLayer(insertLayer(createDocument(), pin), hand);
    doc = { ...doc, layers: doc.layers.map((l) => (l.id === hand.id ? setBinding(l, createBinding('rotation', '90', { x: 0, y: 0, layer: pin.id })) : l)) };
    let r = resolveDocument(doc);
    // turned 90° about the pin: the hand's middle swings from above the pin to its right
    close(layerCentreWorld(r, hand.id)!, 168, 128);
    // the pin moves (its own binding): the pivot follows it
    doc = { ...doc, layers: doc.layers.map((l) => (l.id === pin.id ? setBinding(l, createBinding('x', '28', undefined)) : l)) };
    r = resolveDocument(doc);
    // pivot now (28,128); the hand (still stored at 128,88) turns 90° about it
    const c = layerCentreWorld(r, hand.id)!;
    expect(Math.hypot(c.x - 28, c.y - 128)).toBeCloseTo(Math.hypot(100, 40), 4);
    expect(anchorWorldPoint(doc, hand.id, { x: 0, y: 0, layer: pin.id }, r)).toEqual({ x: 28, y: 128 });
  });

  it('an offset moves the attached point; a missing layer falls back to the centre', () => {
    const pin = createShapeLayer({ x: 50, y: 50, width: 10, height: 10 });
    const bar = createShapeLayer({ x: 50, y: 100, width: 10, height: 40 });
    const doc = insertLayer(insertLayer(createDocument(), pin), bar);
    expect(anchorWorldPoint(doc, bar.id, { x: 5, y: -5, layer: pin.id })).toEqual({ x: 55, y: 45 });
    close(anchorWorldPoint(doc, bar.id, { x: 0, y: 0, layer: 'gone' })!, 50, 100);
    const lone = setBinding(bar, createBinding('rotation', '45', { x: 0, y: 0, layer: 'gone' }));
    const r = resolveDocument(insertLayer(createDocument(), lone));
    expect(findLayer(r, lone.id)!.x).toBeCloseTo(50, 6); // turned about its own centre
  });

  it('two layers attached to each other resolve without looping', () => {
    const a = createShapeLayer({ x: 50, y: 50, width: 10, height: 10 });
    const b = createShapeLayer({ x: 150, y: 50, width: 10, height: 10 });
    let doc: SvgDocument = insertLayer(insertLayer(createDocument(), a), b);
    doc = { ...doc, layers: [setBinding(doc.layers[0], createBinding('rotation', '90', { x: 0, y: 0, layer: b.id })), setBinding(doc.layers[1], createBinding('rotation', '90', { x: 0, y: 0, layer: a.id }))] };
    const r = resolveDocument(doc);
    expect(r.layers).toHaveLength(2);
    close(layerCentreWorld(r, a.id)!, 150, -50);
  });

  it('attachable layers leave out the layer itself and what is inside it', () => {
    const inner = createShapeLayer({ name: 'inner' });
    const g = createGroupLayer({ name: 'g', children: [inner] });
    const other = createShapeLayer({ name: 'other' });
    const doc = insertLayer(insertLayer(createDocument(), g), other);
    expect(anchorAttachable(doc, g.id).map((l) => l.name)).toEqual(['other']);
    expect(anchorAttachable(doc, inner.id).map((l) => l.name).sort()).toEqual(['g', 'other']);
  });

  it('pixel and attached anchors survive a save/load round trip', () => {
    const doc = insertLayer(createDocument(), setBinding(setBinding(createShapeLayer(), createBinding('rotation', '1', { x: 3, y: -4, unit: 'px' })), createBinding('scale', '1', { x: 1, y: 2, layer: 'L1' })));
    const back = normalizeDocument(JSON.parse(JSON.stringify(doc)));
    expect(back.layers[0].bindings!.map((b) => b.anchor)).toEqual([{ x: 3, y: -4, unit: 'px' }, { x: 1, y: 2, layer: 'L1' }]);
  });
});
