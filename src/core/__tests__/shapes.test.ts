import { describe, expect, it } from 'vitest';
import { BUILTIN_SHAPE_IDS, defaultShapeParams, getShape, listShapes, registerShape, shapePath } from '../shapes';

describe('shape library', () => {
  it('has the built-in shapes', () => {
    expect(BUILTIN_SHAPE_IDS.length).toBeGreaterThan(20);
    expect(listShapes().map((s) => s.id)).toEqual(expect.arrayContaining(['rect', 'ellipse', 'star', 'ring', 'gear']));
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

  it('falls back to rect for unknown ids and supports custom shapes', () => {
    expect(getShape('nope').id).toBe('rect');
    registerShape({ id: 'custom', name: 'Custom', category: 'X', path: (w, h) => `M0 0 L${w} ${h} Z` });
    expect(shapePath('custom', 10, 20)).toBe('M0 0 L10 20 Z');
  });

  it('rounded rect clamps radius', () => {
    const d = shapePath('rounded-rect', 100, 20, { radius: 50 });
    expect(d).toContain('A10 10');
  });
});
