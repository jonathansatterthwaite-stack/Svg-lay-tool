import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, resolvePreferences } from '../preferences';

describe('resolvePreferences', () => {
  it('fills in defaults', () => {
    expect(resolvePreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(resolvePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });
  it('keeps valid values and clamps numbers', () => {
    const p = resolvePreferences({ handleSize: 40, handleOpacity: 0.05, touchArea: 12, moveHandle: 'touch', canvasTouch: 'pan', viewPad: 'left', lockView: true });
    expect(p).toMatchObject({ handleSize: 28, handleOpacity: 0.2, touchArea: 12, moveHandle: 'touch', canvasTouch: 'pan', viewPad: 'left', lockView: true });
  });
  it('drops what it does not know', () => {
    const p = resolvePreferences({ moveHandle: 'sometimes', handleOpacity: 'x', lockView: 'yes', extra: 1 } as never);
    expect(p).toEqual(DEFAULT_PREFERENCES);
  });
  it('precision settings', () => {
    expect(resolvePreferences({ fineFactor: 0.1, readout: false, tapSelect: false })).toMatchObject({ fineFactor: 0.1, readout: false, tapSelect: false, magnifier: true });
    expect(resolvePreferences({ fineFactor: 0.3 as never }).fineFactor).toBe(0.25);
  });
  it('snapping and animation settings', () => {
    expect(resolvePreferences({ rotationStep: 45, snapToShapes: false, snapStartsOn: true, motionTrail: false })).toMatchObject({ rotationStep: 45, snapToShapes: false, snapStartsOn: true, motionTrail: false });
    expect(resolvePreferences({ rotationStep: 10 as never }).rotationStep).toBe(15);
  });
  it('outline and folding', () => {
    expect(resolvePreferences({})).toMatchObject({ shapeOutline: true, foldTools: true });
    expect(resolvePreferences({ shapeOutline: false, foldTools: false })).toMatchObject({ shapeOutline: false, foldTools: false });
  });
  it('null handle size means pick by pointer', () => {
    expect(resolvePreferences({ handleSize: null }).handleSize).toBeNull();
  });
});
