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
  it('null handle size means pick by pointer', () => {
    expect(resolvePreferences({ handleSize: null }).handleSize).toBeNull();
  });
});
