import { describe, expect, it } from 'vitest';
import { anchorAxes, anchorLocalPoint, applyBoundValue, bindableTargets, createBinding, type BindingError, createVariable, documentEnv, documentHasBindings, documentUsesTime, evaluateVariable, resolveDocument, timeEnv } from '../bindings';
import { createDocument, createGroupLayer, createShapeLayer, insertLayer, layerWorldMatrix, normalizeDocument, setBinding, upsertVariable } from '../document';
import { applyToPoint } from '../matrix';
import { evaluate, ExprError, referencedNames } from '../expr';
import { createModifier } from '../modifiers';
import { renderDocumentToString } from '../render';

describe('expressions', () => {
  const env = { a: 2, b: 3, hours12: 10, minutes: 30 };
  it('evaluates arithmetic with precedence', () => {
    expect(evaluate('1 + 2 * 3', env)).toBe(7);
    expect(evaluate('(1 + 2) * 3', env)).toBe(9);
    expect(evaluate('2 ^ 3 ^ 2', env)).toBe(512);
    expect(evaluate('-a ^ 2', env)).toBe(-4);
    expect(evaluate('7 % 3', env)).toBe(1);
    expect(evaluate('a / 0', env)).toBe(0); // never NaN/Infinity
  });
  it('handles comparisons, logic and ternaries as numbers', () => {
    expect(evaluate('a < b', env)).toBe(1);
    expect(evaluate('a >= b', env)).toBe(0);
    expect(evaluate('a == 2 && b == 3', env)).toBe(1);
    expect(evaluate('!(a == 2) || b == 3', env)).toBe(1);
    expect(evaluate('a > b ? 10 : 20', env)).toBe(20);
    expect(evaluate('true + false', env)).toBe(1);
  });
  it('supports functions and constants', () => {
    expect(evaluate('clamp(5, 0, 1)', env)).toBe(1);
    expect(evaluate('lerp(0, 10, 0.25)', env)).toBe(2.5);
    expect(evaluate('round(sin(pi / 2) * 100)', env)).toBe(100);
    expect(evaluate('mod(-1, 12)', env)).toBe(11);
    expect(evaluate('wrap(370, 0, 360)', env)).toBe(10);
    expect(evaluate('hours12 * 30 + minutes / 2', env)).toBe(315);
  });
  it('reports errors instead of throwing generic ones', () => {
    expect(() => evaluate('1 +', env)).toThrow(ExprError);
    expect(() => evaluate('nope * 2', env)).toThrow(/Unknown variable 'nope'/);
    expect(() => evaluate('foo(1)', env)).toThrow(/Unknown function/);
    expect(() => evaluate('1 $ 2', env)).toThrow(ExprError);
  });
  it('lists referenced names', () => {
    expect(referencedNames('hours12 * 30 + level').sort()).toEqual(['hours12', 'level']);
    expect(referencedNames('1 +')).toEqual([]);
  });
});

describe('bindings', () => {
  it('time env has the documented built-ins', () => {
    const env = timeEnv(new Date(2026, 0, 2, 13, 45, 30), 0);
    expect(env.hours).toBe(13);
    expect(env.hours12).toBe(1);
    expect(env.minutes).toBe(45);
    expect(env.seconds).toBe(30);
    expect(env.time).toBeCloseTo(13 * 3600 + 45 * 60 + 30, 3);
    expect(env.date).toBe(2);
    expect(env.month).toBe(1);
  });

  it('resolves bound properties from variables and leaves the source untouched', () => {
    const jar = createShapeLayer({ name: 'water', width: 100, height: 200, y: 100 });
    const bound = setBinding(setBinding(jar, createBinding('height', 'level * 200')), createBinding('y', '200 - level * 100'));
    let doc = createDocument({ variables: [createVariable({ name: 'level', value: 0.25 })] });
    doc = insertLayer(doc, bound);
    expect(documentHasBindings(doc)).toBe(true);
    expect(documentUsesTime(doc)).toBe(false);
    const resolved = resolveDocument(doc, documentEnv(doc));
    const w = resolved.layers[0];
    expect(w.type === 'shape' && w.height).toBe(50);
    expect(w.y).toBe(175);
    expect(doc.layers[0].type === 'shape' && doc.layers[0].height).toBe(200); // source unchanged
    // host overrides win over the document value
    const hot = resolveDocument(doc, documentEnv(doc, { level: 1 }));
    expect(hot.layers[0].type === 'shape' && hot.layers[0].height).toBe(200);
    // rendering applies bindings too
    expect(renderDocumentToString(doc, { variables: { level: 0.5 } })).toContain('translate(0 150)');
  });

  it('binds visibility, modifier fields and group scale; errors are collected', () => {
    const mod = createModifier('deform', { top: 100 });
    const shape = createShapeLayer({ modifiers: [mod] });
    const apple = setBinding(shape, createBinding('visible', 'count >= 2'));
    const squash = setBinding(apple, createBinding(`modifiers.${mod.id}.top`, 'count * 10'));
    const group = setBinding(createGroupLayer({ children: [squash] }), createBinding('scale', 'bogus + 1'));
    let doc = createDocument({ variables: [createVariable({ name: 'count', value: 1, min: 0, max: 5, step: 1 })] });
    doc = insertLayer(doc, group);
    const errors: BindingError[] = [];
    const r1 = resolveDocument(doc, documentEnv(doc), errors);
    const g1 = r1.layers[0];
    const c1 = g1.type === 'group' ? g1.children[0] : g1;
    expect(c1.visible).toBe(false);
    expect((c1.modifiers[0] as { top: number }).top).toBe(10);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/bogus/);
    expect(g1.type === 'group' && g1.scale).toBe(1); // failing binding leaves the value alone
    const r2 = resolveDocument(upsertVariable(doc, { ...doc.variables![0], value: 3 }));
    const g2 = r2.layers[0];
    expect((g2.type === 'group' ? g2.children[0] : g2).visible).toBe(true);
  });

  it('computes variables from formulas in declaration order', () => {
    let doc = createDocument({});
    doc = upsertVariable(doc, createVariable({ name: 'base', value: 2 }));
    doc = upsertVariable(doc, createVariable({ name: 'twice', value: 0, expression: 'base * 2' }));
    doc = upsertVariable(doc, createVariable({ name: 'later', value: 7, expression: 'missing + 1' }));
    const env = documentEnv(doc, { app: 5 });
    expect(env.twice).toBe(4);
    expect(env.later).toBe(7); // bad formula falls back to the stored value
    // a host override of the source variable flows into the formula
    expect(documentEnv(doc, { base: 10 }).twice).toBe(20);
    // an override of the computed variable itself wins
    expect(documentEnv(doc, { twice: 1 }).twice).toBe(1);
    // formulas can use app variables and only the variables above them
    expect(evaluateVariable(doc, { ...doc.variables![1], expression: 'base + app' }, { app: 5 })).toBe(7);
    expect(() => evaluateVariable(doc, { ...doc.variables![0], expression: 'twice' })).toThrow();
    expect(() => evaluateVariable(doc, doc.variables![2])).toThrow(/missing/);
    // legacy / JSON round trip keeps the expression and drops blank ones
    const round = normalizeDocument(JSON.parse(JSON.stringify({ ...doc, variables: [...doc.variables!, { name: 'blank', value: 1, expression: '  ' }] })));
    expect(round.variables![1].expression).toBe('base * 2');
    expect(round.variables![3].expression).toBeUndefined();
  });

  it('a binding using a time-derived variable animates', () => {
    let doc = createDocument({});
    doc = upsertVariable(doc, createVariable({ name: 'angle', value: 0, expression: 'seconds * 6' }));
    const l = createShapeLayer({ shape: 'polygon', x: 0, y: 0, width: 10, height: 10 });
    doc = insertLayer(doc, setBinding(l, createBinding('rotation', 'angle')));
    expect(documentUsesTime(doc)).toBe(true);
    expect(resolveDocument(doc, documentEnv(doc, {}, new Date(2024, 0, 1, 0, 0, 15))).layers[0].rotation).toBe(90);
  });

  it('detects time usage and lists bindable targets', () => {
    const hand = setBinding(createShapeLayer({ params: { sides: 4 } }), createBinding('rotation', 'hours12 * 30 + minutes / 2'));
    const doc = insertLayer(createDocument(), hand);
    expect(documentUsesTime(doc)).toBe(true);
    const keys = bindableTargets(hand).map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(['x', 'y', 'rotation', 'opacity', 'visible', 'width', 'height', 'params.sides']));
    expect(keys).not.toContain('scale');
  });

  it('rotation binding pivots about its anchor', () => {
    const bar = createShapeLayer({ x: 100, y: 100, width: 10, height: 100 }); // bottom centre at (100,150)
    const turned = applyBoundValue(bar, 'rotation', 90, { x: 0.5, y: 1 });
    expect(turned.rotation).toBe(90);
    const doc = insertLayer(createDocument(), turned);
    const bottom = applyToPoint(layerWorldMatrix(doc, turned.id), anchorLocalPoint(turned, { x: 0.5, y: 1 }));
    expect(bottom.x).toBeCloseTo(100, 6);
    expect(bottom.y).toBeCloseTo(150, 6); // the base stayed on the clock centre
    // default anchor is the centre: origin does not move
    expect(applyBoundValue(bar, 'rotation', 45).x).toBe(100);
  });

  it('height binding grows away from its anchor edge; scale about an anchor corner', () => {
    const water = createShapeLayer({ x: 0, y: 0, width: 60, height: 60 }); // bottom edge at y = 30
    const half = applyBoundValue(water, 'height', 30, { x: 0.5, y: 1 });
    expect(half.type === 'shape' && half.height).toBe(30);
    expect(half.y).toBeCloseTo(15, 6); // bottom still at 30
    expect(applyBoundValue(water, 'height', 30).y).toBe(0); // centred by default
    const g = createGroupLayer({ x: 0, y: 0, children: [createShapeLayer({ x: 50, y: 50, width: 100, height: 100 })] }); // box 0..100
    const big = applyBoundValue(g, 'scale', 2, { x: 0, y: 0 });
    expect(big.type === 'group' && big.scale).toBe(2);
    expect([big.x, big.y]).toEqual([0, 0]); // top-left corner stays
    const bigCentre = applyBoundValue(g, 'scale', 2, { x: 0.5, y: 0.5 });
    expect(bigCentre.x).toBeCloseTo(-50, 6);
    expect(anchorAxes('rotation')).toBe('xy');
    expect(anchorAxes('height')).toBe('y');
    expect(anchorAxes('opacity')).toBeNull();
  });

  it('anchors survive a save/load round trip', () => {
    const doc = insertLayer(createDocument(), setBinding(createShapeLayer(), createBinding('rotation', 'time', { x: 0.5, y: 1 })));
    const back = normalizeDocument(JSON.parse(JSON.stringify(doc)));
    expect(back.layers[0].bindings![0].anchor).toEqual({ x: 0.5, y: 1 });
  });

  it('survives a save/load round trip', () => {
    const hand = setBinding(createShapeLayer(), createBinding('rotation', 'time / 10'));
    const doc = insertLayer(createDocument({ variables: [createVariable({ name: 'level', value: 0.3 })] }), hand);
    const back = normalizeDocument(JSON.parse(JSON.stringify(doc)));
    expect(back.variables).toHaveLength(1);
    expect(back.layers[0].bindings).toHaveLength(1);
    expect(back.layers[0].bindings![0]).toMatchObject({ target: 'rotation', expression: 'time / 10', enabled: true });
    // invalid variable names are dropped
    expect(normalizeDocument({ variables: [{ name: 'bad name', value: 1 }, { name: 'ok', value: 1 }] }).variables).toHaveLength(1);
  });
});
