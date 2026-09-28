import {
  createDocument,
  createEffect,
  createEffectModifier,
  createGroupLayer,
  createMaskModifier,
  createModifier,
  createShapeLayer,
  type SvgDocument,
} from '../src/core';

/** A small emblem showing off groups, masks and effects. */
export function sampleDocument(): SvgDocument {
  const backplate = createShapeLayer({
    name: 'Backplate',
    shape: 'polygon',
    params: { sides: 6, radius: 6 },
    x: 256,
    y: 256,
    width: 400,
    height: 400,
    rotation: 90,
    color: '#2a2f3a',
    modifiers: [
      createModifier('fill', { fill: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#3a3f4b' }, { offset: 1, color: '#15171c' }] } }),
      createModifier('stroke', { color: '#9aa3b5', width: 6 }),
      createEffectModifier('shadow', { dx: 0, dy: 10, blur: 10, opacity: 0.6 }),
    ],
  });

  const stripes = createGroupLayer({
    name: 'Stripes',
    x: 256,
    y: 256,
    children: [
      ...[-70, 0, 70].map((y, i) =>
        createShapeLayer({
          name: `Stripe ${i + 1}`,
          shape: 'polygon',
          params: { sides: 4 },
          x: 0,
          y,
          width: 420,
          height: 30,
          rotation: -30,
          color: i === 1 ? '#ff5d3a' : '#e0402a',
        }),
      ),
      createShapeLayer({
        name: 'Stripe clip',
        shape: 'polygon',
        params: { sides: 6 },
        x: 0,
        y: 0,
        width: 360,
        height: 360,
        rotation: 90,
        modifiers: [createMaskModifier({ mode: 'clip' })],
      }),
    ],
  });

  const ring = createShapeLayer({
    name: 'Ring',
    shape: 'ellipse',
    params: { hole: 86 },
    x: 256,
    y: 256,
    width: 250,
    height: 250,
    color: '#dfe3ea',
    modifiers: [
      createModifier('fill', { fill: { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#8a93a6' }] } }),
      createEffectModifier('shadow', { dx: 0, dy: 3, blur: 3, opacity: 0.5 }),
    ],
  });

  // A star is a pentagon whose edges are subdivided once and bent inwards.
  const star = createShapeLayer({
    name: 'Star',
    shape: 'polygon',
    params: { sides: 5 },
    x: 256,
    y: 246,
    width: 170,
    height: 170,
    color: '#ffc857',
    modifiers: [
      createModifier('edges', { subdivisions: 1, bend: -68, smooth: false }),
      createEffectModifier('outline', { width: 4, color: '#15171c' }),
      createEffectModifier('glow', { radius: 8, color: '#ffc857', strength: 1.5 }),
    ],
  });

  const blurRegion = createShapeLayer({
    name: 'Frosted lens',
    shape: 'ellipse',
    x: 370,
    y: 150,
    width: 150,
    height: 150,
    color: '#ffffff',
    modifiers: [
      createMaskModifier({
        mode: 'filter',
        showShape: false,
        effects: [createEffect('blur', { radius: 5 }), createEffect('brightness', { amount: 1.4 })],
      }),
    ],
  });

  const lensRim = createShapeLayer({
    name: 'Lens rim',
    shape: 'ellipse',
    params: { hole: 94 },
    x: 370,
    y: 150,
    width: 150,
    height: 150,
    color: '#ffffff',
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
    color: '#59d7e8',
    blendMode: 'screen',
    modifiers: [createEffectModifier('glow', { radius: 6, color: '#59d7e8', strength: 2 })],
  });

  return createDocument({
    width: 512,
    height: 512,
    background: null,
    layers: [backplate, stripes, ring, star, bolt, blurRegion, lensRim],
  });
}
