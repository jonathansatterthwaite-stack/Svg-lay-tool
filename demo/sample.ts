import {
  createDocument,
  createEffect,
  createGroupLayer,
  createMaskSettings,
  createShapeLayer,
  type SvgDocument,
} from '../src/core';

/** A small emblem showing off groups, masks and effects. */
export function sampleDocument(): SvgDocument {
  const backplate = createShapeLayer({
    name: 'Backplate',
    shape: 'hexagon',
    x: 256,
    y: 256,
    width: 400,
    height: 400,
    rotation: 90,
    fill: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#3a3f4b' }, { offset: 1, color: '#15171c' }] },
    stroke: { color: '#9aa3b5', width: 6 },
    effects: [createEffect('shadow', { dx: 0, dy: 10, blur: 10, opacity: 0.6 })],
  });

  const stripes = createGroupLayer({
    name: 'Stripes',
    x: 256,
    y: 256,
    children: [
      ...[-70, 0, 70].map((y, i) =>
        createShapeLayer({
          name: `Stripe ${i + 1}`,
          shape: 'rect',
          x: 0,
          y,
          width: 420,
          height: 30,
          rotation: -30,
          fill: { type: 'solid', color: i === 1 ? '#ff5d3a' : '#e0402a' },
        }),
      ),
      createShapeLayer({
        name: 'Stripe clip',
        shape: 'hexagon',
        x: 0,
        y: 0,
        width: 360,
        height: 360,
        rotation: 90,
        mask: createMaskSettings({ mode: 'clip' }),
      }),
    ],
  });

  const ring = createShapeLayer({
    name: 'Ring',
    shape: 'ring',
    params: { thickness: 14 },
    x: 256,
    y: 256,
    width: 250,
    height: 250,
    fill: { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#8a93a6' }] },
    effects: [createEffect('shadow', { dx: 0, dy: 3, blur: 3, opacity: 0.5 })],
  });

  const star = createShapeLayer({
    name: 'Star',
    shape: 'star',
    params: { points: 5, inner: 42 },
    x: 256,
    y: 246,
    width: 170,
    height: 170,
    fill: { type: 'solid', color: '#ffc857' },
    effects: [createEffect('outline', { width: 4, color: '#15171c' }), createEffect('glow', { radius: 8, color: '#ffc857', strength: 1.5 })],
  });

  const blurRegion = createShapeLayer({
    name: 'Frosted lens',
    shape: 'ellipse',
    x: 370,
    y: 150,
    width: 150,
    height: 150,
    fill: { type: 'solid', color: '#ffffff' },
    mask: createMaskSettings({
      mode: 'filter',
      showShape: false,
      effects: [createEffect('blur', { radius: 5 }), createEffect('brightness', { amount: 1.4 })],
    }),
  });

  const lensRim = createShapeLayer({
    name: 'Lens rim',
    shape: 'ring',
    params: { thickness: 6 },
    x: 370,
    y: 150,
    width: 150,
    height: 150,
    fill: { type: 'solid', color: '#ffffff' },
    opacity: 0.8,
  });

  const bolt = createShapeLayer({
    name: 'Bolt',
    shape: 'lightning',
    x: 130,
    y: 360,
    width: 70,
    height: 120,
    rotation: 15,
    fill: { type: 'solid', color: '#59d7e8' },
    blendMode: 'screen',
    effects: [createEffect('glow', { radius: 6, color: '#59d7e8', strength: 2 })],
  });

  return createDocument({
    width: 512,
    height: 512,
    background: null,
    layers: [backplate, stripes, ring, star, bolt, blurRegion, lensRim],
  });
}
