import { describe, expect, it } from 'vitest';
import { BUILTIN_SHAPE_IDS, defaultShapeParams, getShape, listShapes, registerShape, resolveShapeAlias, shapePath } from '../shapes';

describe('shape library', () => {
  it('has the built-in shapes', () => {
    expect(BUILTIN_SHAPE_IDS.length).toBeGreaterThan(10);
    expect(listShapes().map((s) => s.id)).toEqual(expect.arrayContaining(['polygon', 'ellipse', 'quad', 'star', 'gear']));
  });

  it('every shape produces finite path data at several sizes', () => {
    for (const def of listShapes()) {
      for (const [w, h] of [
        [100, 100],
        [1, 1],
        [300, 40],
        [0, 0],
      ]) {
        const d = def.path(w, h, defaultShapeParams(def));
        expect(d, def.id).toMatch(/^M/);
        expect(d, def.id).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it('param extremes stay valid', () => {
    for (const def of listShapes()) {
      for (const p of def.params ?? []) {
        for (const v of [p.min, p.max]) {
          const d = def.path(120, 80, { ...defaultShapeParams(def), [p.key]: v });
          expect(d, `${def.id}.${p.key}=${v}`).not.toMatch(/NaN|Infinity/);
        }
      }
    }
  });

  it('falls back to polygon for unknown ids and supports custom shapes', () => {
    expect(getShape('nope').id).toBe('polygon');
    expect(getShape('hexagon').id).toBe('polygon');
    registerShape({ id: 'custom', name: 'Custom', category: 'X', path: (w, h) => `M0 0 L${w} ${h} Z` });
    expect(shapePath('custom', 10, 20)).toBe('M0 0 L10 20 Z');
  });

  it('4-sided polygon is an axis-aligned rectangle filling the box', () => {
    const d = shapePath('polygon', 100, 40, { sides: 4, radius: 0 });
    const pts = d.replace(/[MLZ]/g, '').trim().split(/\s+/).map(Number);
    expect(pts).toHaveLength(8);
    expect(new Set(pts.filter((_, i) => i % 2 === 0))).toEqual(new Set([-50, 50]));
    expect(new Set(pts.filter((_, i) => i % 2 === 1))).toEqual(new Set([-20, 20]));
  });

  it('3-sided polygon is an upright isosceles triangle', () => {
    const d = shapePath('polygon', 100, 100, { sides: 3 });
    expect(d).toMatch(/^M50 50 L-50 50 L0 -50 Z$|^M-50 50 L0 -50 L50 50 Z$|^M0 -50 L50 50 L-50 50 Z$/);
  });

  it('corner radius rounds polygon corners with arcs and clamps to the edge', () => {
    const d = shapePath('polygon', 100, 40, { sides: 4, radius: 50 }); // 50% of min/2 → r = 10
    expect(d).toContain('A10 10');
    expect(d.match(/A/g)).toHaveLength(4);
    const clamped = shapePath('polygon', 100, 20, { sides: 4, radius: 100 }); // r would be 10 = half the short edge
    expect(clamped).not.toMatch(/NaN/);
  });

  it('ellipse covers disc, ring, pie and annular sector', () => {
    expect(shapePath('ellipse', 100, 100, { sweep: 360, hole: 0 }).match(/A/g)).toHaveLength(2);
    expect(shapePath('ellipse', 100, 100, { sweep: 360, hole: 50 }).match(/A/g)).toHaveLength(4);
    expect(shapePath('ellipse', 100, 100, { sweep: 90, hole: 0 })).toMatch(/^M0 0 L/);
    expect(shapePath('ellipse', 100, 100, { sweep: 90, hole: 50 }).match(/A/g)).toHaveLength(2);
  });

  it('maps legacy shape ids onto the consolidated shapes', () => {
    expect(resolveShapeAlias('rect')).toEqual({ id: 'polygon', params: { sides: 4 } });
    expect(resolveShapeAlias('ring', { thickness: 30 })).toEqual({ id: 'ellipse', params: { hole: 70 } });
    expect(resolveShapeAlias('right-triangle')).toEqual({ id: 'quad', params: { top: 0, offset: -100 } });
    expect(resolveShapeAlias('star', { points: 6 })).toEqual({ id: 'star', params: { points: 6 } });
    expect(resolveShapeAlias('custom-unknown')).toEqual({ id: 'custom-unknown', params: {} });
  });
});
