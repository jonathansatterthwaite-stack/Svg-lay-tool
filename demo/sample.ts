import {
  createBinding,
  createDocument,
  createVariable,
  setBinding,
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


/** A working clock: hands are groups whose rotation is bound to the time built-ins. */
export function sampleClock(): SvgDocument {
  const face = createShapeLayer({ name: 'Face', shape: 'ellipse', x: 256, y: 256, width: 440, height: 440, color: '#f4f1ea',
    modifiers: [createModifier('stroke', { color: '#2b2f3a', width: 12 }), createEffectModifier('shadow', { dx: 0, dy: 8, blur: 10, opacity: 0.35 })] });
  const ticks = createGroupLayer({
    name: 'Ticks',
    x: 256,
    y: 256,
    children: Array.from({ length: 12 }, (_, i) =>
      createShapeLayer({ name: `Tick ${i + 1}`, shape: 'polygon', params: { sides: 4 }, x: 0, y: -180, width: i % 3 === 0 ? 10 : 5, height: i % 3 === 0 ? 34 : 18, color: '#2b2f3a',
        // each tick is rotated about the clock centre: the group origin
        modifiers: [] }),
    ).map((tick, i) => {
      // place around the dial by rotating about the group's origin
      const a = (i * 30 * Math.PI) / 180;
      return { ...tick, x: Math.sin(a) * 180, y: -Math.cos(a) * 180, rotation: i * 30 };
    }),
  });
  const hand = (name: string, length: number, width: number, color: string, expr: string) =>
    setBinding(
      createGroupLayer({
        name,
        x: 256,
        y: 256,
        children: [createShapeLayer({ name: `${name} bar`, shape: 'polygon', params: { sides: 4 }, x: 0, y: -length / 2 + 14, width, height: length, color,
          modifiers: [createModifier('round', { radius: 100 })] })],
      }),
      createBinding('rotation', expr),
    );
  const hourHand = hand('Hour hand', 130, 14, '#2b2f3a', 'hours12 * 30 + minutes / 2');
  const minuteHand = hand('Minute hand', 180, 10, '#2b2f3a', 'minutes * 6 + seconds / 10');
  const secondHand = hand('Second hand', 200, 4, '#e0402a', 'mod(time, 60) * 6');
  const pivot = createShapeLayer({ name: 'Pivot', shape: 'ellipse', x: 256, y: 256, width: 22, height: 22, color: '#e0402a',
    modifiers: [createModifier('stroke', { color: '#f4f1ea', width: 3 })] });
  // A "water level" gauge on the face: a rectangle whose height follows a variable, clipped by a rounded window.
  const level = createVariable({ name: 'level', value: 0.6, min: 0, max: 1, step: 0.01 });
  const water = setBinding(
    setBinding(createShapeLayer({ name: 'Water', shape: 'polygon', params: { sides: 4 }, x: 256, y: 356, width: 60, height: 40, color: '#4da3ff' }), createBinding('height', 'level * 60')),
    createBinding('y', '386 - level * 30'),
  );
  const window = createShapeLayer({ name: 'Gauge window', shape: 'polygon', params: { sides: 4 }, x: 256, y: 356, width: 60, height: 60, color: '#ffffff',
    modifiers: [createModifier('round', { radius: 40 }), createMaskModifier({ mode: 'clip' })] });
  const gauge = createGroupLayer({ name: 'Gauge', x: 0, y: 0, children: [water, window] });
  return createDocument({ width: 512, height: 512, background: '#dfe3ea', layers: [face, ticks, gauge, hourHand, minuteHand, secondHand, pivot], variables: [level] });
}
