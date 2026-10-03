import { describe, expect, it } from 'vitest';
import { createDocument, createShapeLayer, insertLayer, normalizeDocument, MAX_SOUNDS, MAX_SOUND_CHARS } from '../document';
import { evaluate } from '../expr';
import { documentEnv, resolveDocument } from '../bindings';
import { createGesture, createHotspot, createInteraction, runActions, type ActionEffect } from '../interaction';
import { BUILTIN_SOUNDS, playSound, soundLabel } from '../sounds';
import type { Action, Gesture, SvgDocument } from '../types';
import type { Env } from '../expr';

const wav = (n = 40) => `data:audio/wav;base64,${'A'.repeat(n)}`;

describe('phase 2 in documents', () => {
  it('loads the new gestures and actions, and refuses what makes no sense', () => {
    const doc = normalizeDocument({
      layers: [{
        type: 'shape', shape: 'rect', hotspot: { gestures: [
          { on: 'doubletap', actions: [{ do: 'random', var: 'die', from: 1, to: 6, step: 1 }, { do: 'sound', sound: 'dice', volume: 0.5 }, { do: 'vibrate', ms: 99999 }] },
          { on: 'swipe', dir: 'sideways', actions: [{ do: 'drag', var: 'x', from: 0, to: 1 }, { do: 'sound', sound: '../evil' }] },
          { on: 'dial', turns: 500, actions: [{ do: 'drag', var: 'heat', from: 0, to: 1 }] },
          { on: 'hold', actions: [{ do: 'set', var: 'pressed', to: '1' }], release: [{ do: 'set', var: 'pressed', to: '0' }] },
          { on: 'longpress', actions: [] },
        ] },
      }],
    });
    const g = doc.layers[0].hotspot!.gestures;
    expect(g.map((x) => x.on)).toEqual(['doubletap', 'swipe', 'dial', 'hold', 'longpress']);
    expect(g[0].actions).toEqual([
      expect.objectContaining({ do: 'random', var: 'die', from: 1, to: 6, step: 1 }),
      expect.objectContaining({ do: 'sound', sound: 'dice', volume: 0.5 }),
      expect.objectContaining({ do: 'vibrate', ms: 1000 }),
    ]);
    expect(g[1].dir).toBe('any');
    expect(g[1].actions).toHaveLength(0); // no drag on a swipe; no sound with a bad name
    expect(g[2].turns).toBe(20);
    expect(g[3].release).toEqual([expect.objectContaining({ do: 'set', var: 'pressed', to: '0' })]);
  });

  it('keeps a few short sounds of its own, audio only', () => {
    const doc = normalizeDocument({
      layers: [],
      sounds: [
        { id: 'boom', name: 'Boom', data: wav() },
        { id: 'img', name: 'Not a sound', data: 'data:image/png;base64,AAAA' },
        { id: 'huge', name: 'Too long', data: wav(MAX_SOUND_CHARS) },
        { id: 'js', name: 'Script', data: 'javascript:alert(1)' },
        ...[1, 2, 3, 4].map((i) => ({ id: `s${i}`, name: `S${i}`, data: wav() })),
      ],
    });
    expect(doc.sounds!.map((s) => s.id)).toEqual(['boom', 's1', 's2', 's3'].slice(0, MAX_SOUNDS));
    expect(soundLabel(doc, 'boom')).toBe('Boom');
    expect(soundLabel(doc, 'drum')).toBe('Drum');
    expect(normalizeDocument({ layers: [] }).sounds).toBeUndefined();
  });

  it('playing a sound with no audio about does nothing (and never throws)', () => {
    expect(() => playSound(null, 'drum')).not.toThrow();
    expect(() => playSound(null, 'nothing')).not.toThrow();
    expect(BUILTIN_SOUNDS.map((s) => s.name)).toEqual(['drum', 'bell', 'click', 'chime', 'pour', 'tick', 'whoosh', 'dice']);
  });
});

describe('easing', () => {
  it('bounce and spring go from 0 to 1; a spring overshoots', () => {
    for (const f of ['bounce', 'spring']) {
      expect(evaluate(`${f}(0)`, {})).toBeCloseTo(0);
      expect(evaluate(`${f}(1)`, {})).toBeCloseTo(1);
      expect(evaluate(`${f}(2)`, {})).toBeCloseTo(1);
    }
    expect(Math.max(...[0.1, 0.2, 0.3, 0.4].map((t) => evaluate(`spring(${t})`, {})))).toBeGreaterThan(1);
  });
});

describe('random, sound and vibrate actions', () => {
  it('a die: whole numbers 1 to 6, each as likely; sounds and buzzes go to the effect', () => {
    const die: Action = { id: 'a', do: 'random', var: 'die', from: 1, to: 6, step: 1 };
    expect(runActions([die], {}, 0, undefined, undefined, () => 0)).toEqual({ die: 1 });
    expect(runActions([die], {}, 0, undefined, undefined, () => 0.999)).toEqual({ die: 6 });
    expect(runActions([die], {}, 0, undefined, undefined, () => 0.5)).toEqual({ die: 4 });
    const fx: ActionEffect[] = [];
    runActions([{ id: 's', do: 'sound', sound: 'drum', volume: 0.4 }, { id: 'v', do: 'vibrate', ms: 20 }], {}, 0, undefined, (e) => fx.push(e));
    expect(fx).toEqual([{ sound: 'drum', volume: 0.4 }, { vibrate: 20 }]);
  });
});

// A drawing with one round hotspot in the middle (100, 100), radius 50, with the given gestures.
function setup(gestures: Gesture[], start: Env = {}) {
  let doc: SvgDocument = createDocument({ width: 200, height: 200 });
  doc = insertLayer(doc, createShapeLayer({ shape: 'ellipse', x: 100, y: 100, width: 100, height: 100, hotspot: createHotspot({ gestures }) }));
  let values: Env = { ...start }, clock = 0;
  const timers: { at: number; fn: () => void; on: boolean }[] = [];
  const log: string[] = [];
  const ix = createInteraction({
    document: () => resolveDocument(doc, { ...documentEnv(doc), ...values }),
    env: () => ({ ...documentEnv(doc), ...values }),
    onChange: (v) => { values = { ...values, ...v }; for (const k of Object.keys(v)) log.push(`${k}=${v[k]}`); },
    onSound: (s) => log.push(`sound:${s}`),
    onVibrate: (ms) => log.push(`buzz:${ms}`),
    now: () => clock,
    schedule: (fn, ms) => { const t = { at: clock + ms, fn, on: true }; timers.push(t); return () => { t.on = false; }; },
  });
  const tick = (ms: number) => {
    clock += ms;
    for (const t of timers) if (t.on && t.at <= clock) { t.on = false; t.fn(); }
  };
  const tap = () => { ix.down({ x: 100, y: 100 }); tick(50); ix.up({ x: 100, y: 100 }); };
  return { ix, log, tick, tap, get values() { return values; } };
}
const set = (v: string, to: string): Action => ({ id: v + to, do: 'set', var: v, to });

describe('gestures', () => {
  it('double tap: two quick taps; one tap (when there is a double tap too) waits to be sure', () => {
    const t = setup([createGesture('tap', { actions: [set('one', '1')] }), createGesture('doubletap', { actions: [set('two', '1')] })]);
    t.tap(); t.tick(100); t.tap();
    expect(t.log).toEqual(['two=1']);
    t.tick(1000); t.tap();
    expect(t.log).toEqual(['two=1']); // still waiting …
    t.tick(400);
    expect(t.log).toEqual(['two=1', 'one=1']); // … then it was one tap
  });

  it('a tap with no double tap happens at once', () => {
    const t = setup([createGesture('tap', { actions: [set('one', '1'), { id: 's', do: 'sound', sound: 'click' }] })]);
    t.tap();
    expect(t.log).toEqual(['sound:click', 'one=1']); // (sounds as they happen; changes once the actions are done)
  });

  it('long press: held still; then no tap. Moving first: nothing', () => {
    const t = setup([createGesture('longpress', { actions: [set('long', '1'), { id: 'v', do: 'vibrate', ms: 25 }] }), createGesture('tap', { actions: [set('tap', '1')] })]);
    t.ix.down({ x: 100, y: 100 }); t.tick(500);
    expect(t.log).toEqual(['buzz:25', 'long=1']);
    t.ix.up({ x: 100, y: 100 });
    expect(t.log).toEqual(['buzz:25', 'long=1']);
    t.ix.down({ x: 100, y: 100 }); t.ix.move({ x: 130, y: 100 }); t.tick(500); t.ix.up({ x: 130, y: 100 });
    expect(t.log).toEqual(['buzz:25', 'long=1']);
  });

  it('swipe: quick and far enough, by direction; slow is no swipe', () => {
    const t = setup([createGesture('swipe', { dir: 'right', actions: [set('right', '1')] }), createGesture('swipe', { dir: 'up', actions: [set('up', '1')] })]);
    t.ix.down({ x: 80, y: 100 }); t.tick(100); t.ix.up({ x: 130, y: 104 });
    expect(t.log).toEqual(['right=1']);
    t.ix.down({ x: 100, y: 130 }); t.tick(100); t.ix.up({ x: 98, y: 70 });
    expect(t.log).toEqual(['right=1', 'up=1']);
    t.ix.down({ x: 80, y: 100 }); t.tick(900); t.ix.up({ x: 130, y: 100 });
    expect(t.log).toHaveLength(2);
  });

  it('dial: turning round the middle moves the value from where it was', () => {
    const t = setup([createGesture('dial', { turns: 1, actions: [{ id: 'd', do: 'drag', var: 'heat', from: 0, to: 1 }] })], { heat: 0.1 });
    t.ix.down({ x: 100, y: 60 }); // the top
    t.ix.move({ x: 140, y: 100 }); // a quarter turn clockwise
    expect(t.values.heat).toBeCloseTo(0.35);
    t.ix.move({ x: 100, y: 140 }); // half a turn
    t.ix.up({ x: 100, y: 140 });
    expect(t.values.heat).toBeCloseTo(0.6);
    // Anticlockwise takes it back down (and it stops at the ends).
    t.ix.down({ x: 100, y: 60 }); t.ix.move({ x: 60, y: 100 }); t.ix.move({ x: 100, y: 140 }); t.ix.move({ x: 140, y: 100 }); t.ix.up({ x: 140, y: 100 });
    expect(t.values.heat).toBe(0);
  });

  it('hold: as the finger goes down, and as it lets go (or is lost)', () => {
    const t = setup([createGesture('hold', { actions: [set('pressed', '1')], release: [set('pressed', '0')] })]);
    t.ix.down({ x: 100, y: 100 });
    expect(t.values.pressed).toBe(1);
    t.tick(2000);
    t.ix.up({ x: 100, y: 100 });
    expect(t.values.pressed).toBe(0);
    t.ix.down({ x: 100, y: 100 });
    t.ix.cancel();
    expect(t.values.pressed).toBe(0);
    expect(t.log).toEqual(['pressed=1', 'pressed=0', 'pressed=1', 'pressed=0']);
  });

  it('a die: a tap rolls 1..6 and rattles', () => {
    const t = setup([createGesture('tap', { actions: [{ id: 'r', do: 'random', var: 'face', from: 1, to: 6, step: 1 }, { id: 's', do: 'sound', sound: 'dice' }] })]);
    for (let i = 0; i < 20; i++) t.tap();
    const faces = t.log.filter((l) => l.startsWith('face=')).map((l) => +l.slice(5));
    expect(faces.every((f) => Number.isInteger(f) && f >= 1 && f <= 6)).toBe(true);
    expect(t.log.filter((l) => l === 'sound:dice')).toHaveLength(20);
  });
});

describe('app actions (the host app\'s own)', () => {
  it('load checked; run with their value worked out; reach the host', () => {
    const doc = normalizeDocument({ layers: [{ type: 'shape', shape: 'rect', hotspot: { gestures: [{ on: 'tap', actions: [
      { do: 'app', app: 'state', key: 'lit', value: '1 - lit' },
      { do: 'app', app: 'useOne' },
      { do: 'app', app: '<script>' },
      { do: 'app', app: 'state', key: 'a b' },
    ] }] } }] });
    const acts = doc.layers[0].hotspot!.gestures[0].actions;
    expect(acts).toEqual([
      expect.objectContaining({ do: 'app', app: 'state', key: 'lit', value: '1 - lit' }),
      expect.objectContaining({ do: 'app', app: 'useOne' }),
      expect.objectContaining({ do: 'app', app: 'state' }), // a bad key is dropped, the action kept
    ]);
    expect((acts[2] as { key?: string }).key).toBeUndefined();
    const fx: ActionEffect[] = [];
    runActions(acts.slice(0, 2), { lit: 0 }, 0, undefined, (e) => fx.push(e));
    expect(fx).toEqual([{ app: 'state', key: 'lit', value: 1 }, { app: 'useOne' }]);
  });

  it('a tap with an app action calls the host', () => {
    let doc: SvgDocument = createDocument({ width: 200, height: 200 });
    doc = insertLayer(doc, createShapeLayer({ shape: 'ellipse', x: 100, y: 100, width: 100, height: 100, hotspot: createHotspot({ gestures: [
      createGesture('tap', { actions: [{ id: 'a', do: 'app', app: 'draw' }] }),
    ] }) }));
    const calls: string[] = [];
    const ix = createInteraction({ document: () => doc, env: () => ({}), onChange: () => {}, onApp: (app, key, value) => calls.push(`${app}:${key}:${value}`) });
    ix.down({ x: 100, y: 100 });
    ix.up({ x: 100, y: 100 });
    expect(calls).toEqual(['draw:undefined:undefined']);
  });
});
