import { describe, expect, it } from 'vitest';
import { colorLightness, grayHex, isGray, parseColor, recolor, toGray } from '../color';
import { createDocument, createMaskSettings, createShapeLayer, insertLayer } from '../document';
import { createEffect, effectsForColorMode } from '../effects';
import { renderDocumentToString } from '../render';

describe('colour utilities', () => {
  it('parses hex, rgb, hsl and names', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff000080')!.a).toBeCloseTo(0.5, 1);
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10 20 30 / 0.5)')!.a).toBe(0.5);
    expect(parseColor('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('nonsense')).toBeNull();
  });

  it('converts to gray preserving alpha', () => {
    expect(toGray('#ffffff')).toBe('#ffffff');
    expect(toGray('#000000')).toBe('#000000');
    expect(toGray('#ff0000')).toBe('#363636');
    expect(toGray('#00ff0080')).toBe('#b6b6b680');
    expect(toGray('garbage')).toBe('#808080');
    expect(isGray(toGray('#4da3ff'))).toBe(true);
    expect(grayHex(colorLightness('#7f7f7f'))).toBe('#7f7f7f');
  });

  it('recolours keeping source alpha', () => {
    expect(recolor('#ff000080', '#ffffff')).toBe('#ffffff80');
    expect(recolor('#ff0000', '#00ff00')).toBe('#00ff00');
  });

  it('filters effects per colour mode', () => {
    const effects = [createEffect('blur'), createEffect('hue-rotate'), createEffect('sepia'), createEffect('shadow'), createEffect('brightness')];
    expect(effectsForColorMode(effects, 'full')).toHaveLength(5);
    expect(effectsForColorMode(effects, 'grayscale').map((e) => e.type)).toEqual(['blur', 'shadow', 'brightness']);
    expect(effectsForColorMode(effects, 'monochrome').map((e) => e.type)).toEqual(['blur', 'shadow']);
  });
});

describe('renderer colour modes', () => {
  function doc() {
    let d = createDocument({ background: '#ff0000' });
    d = insertLayer(
      d,
      createShapeLayer({
        fill: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] },
        stroke: { color: '#00ff00', width: 2 },
        effects: [createEffect('sepia'), createEffect('shadow', { color: '#ff00ff' })],
      }),
    );
    d = insertLayer(d, createShapeLayer({ fill: { type: 'solid', color: '#4da3ff' }, mask: createMaskSettings({ mode: 'filter', effects: [createEffect('hue-rotate'), createEffect('blur')] }) }));
    return d;
  }

  it('grayscale converts every colour and drops colour effects', () => {
    const svg = renderDocumentToString(doc(), { colorMode: 'grayscale' });
    expect(svg).not.toMatch(/#ff0000|#0000ff|#00ff00|#4da3ff|#ff00ff/);
    expect(svg).toContain('stop-color="#363636"');
    expect(svg).toContain('stroke="#b6b6b6"');
    expect(svg).toContain('flood-color="#494949"'); // magenta shadow colour grayed
    expect(svg).not.toContain('hueRotate');
    expect(svg).toContain('feGaussianBlur'); // blur inside the mask survives
    // sepia matrix dropped: only the shadow's primitives remain for the layer filter
    expect(svg).not.toContain('type="matrix"');
  });

  it('monochrome paints everything in one colour', () => {
    const svg = renderDocumentToString(doc(), { colorMode: 'monochrome', monoColor: '#ffffff' });
    expect(svg).not.toContain('<linearGradient');
    expect(svg).toMatch(/fill="#ffffff"/);
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('flood-color="#ffffff"');
    expect(svg).not.toMatch(/#ff0000|#0000ff|#00ff00|#4da3ff|#ff00ff/);
    // the whole "filter" mask collapses to just a blur (hue-rotate is dropped)
    expect(svg).not.toContain('hueRotate');
  });

  it('full mode leaves colours alone', () => {
    const svg = renderDocumentToString(doc());
    expect(svg).toContain('stop-color="#ff0000"');
    expect(svg).toContain('flood-color="#ff00ff"');
    expect(svg).toContain('hueRotate');
    expect(svg).toContain('type="matrix"');
  });
});
