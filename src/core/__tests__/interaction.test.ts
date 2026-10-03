import { describe, expect, it } from 'vitest';
import { createDocument, createGroupLayer, createShapeLayer, insertLayer, normalizeDocument, cloneLayer } from '../document';
import { evaluate, referencedNames } from '../expr';
import { documentUsesTime, resolveDocument, documentEnv } from '../bindings';
import { renderDocumentToString } from '../render';
import {
  createAction,
  createGesture,
  createHotspot,
  createInteraction,
  documentHasHotspots,
  hotspotAt,
  hotspotsOf,
  runActions,
} from '../interaction';
import type { Action, Hotspot, SvgDocument } from '../types';
import type { Env } from '../expr';

const rod = (hotspot: Hotspot, init = {}) =>
  createShapeLayer({ shape: 'rect', name: 'Rod', x: 100, y: 50, width: 200, height: 10, hotspot, ...init });

describe('hotspots in documents', () => {
  it('load from untrusted JSON: unknown gestures and actions dropped, the rest kept', () => {
    const doc = normalizeDocument({
      layers: [
        {
          type: 'shape', shape: 'rect', hotspot: {
            hidden: true,
            gestures: [
              { on: 'tap', actions: [{ do: 'set', var: 'lit', to: '1 - lit' }, { do: 'evil', var: 'x' }, { do: 'set', var: 'bad name', to: '1' }] },
              { on: 'shake', actions: [] },
              { on: 'drag', axis: 'sideways', actions: [{ do: 'drag', var: 'rod', from: 0, to: 10, step: 1 }, { do: 'add', var: 'n', by: '1', min: 0, max: 5, wrap: true }, { do: 'mark', var: 'at' }] },
            ],
          },
        },
        { type: 'shape', shape: 'rect', hotspot: 'nonsense' },
      ],
    });
    const hs = doc.layers[0].hotspot!;
    expect(hs.hidden).toBe(true);
    expect(hs.gestures.map((g) => g.on)).toEqual(['tap', 'drag']);
    expect(hs.gestures[0].actions).toEqual([expect.objectContaining({ do: 'set', var: 'lit', to: '1 - lit' })]);
    expect(hs.gestures[1].axis).toBe('x');
    expect(hs.gestures[1].actions.map((a) => a.do)).toEqual(['drag', 'add', 'mark']);
    expect(doc.layers[1].hotspot).toBeUndefined();
    // Round trip: a normalised document normalises to itself.
    expect(normalizeDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('copies of a layer get their own gesture and action ids', () => {
    const g = createGesture('tap', { actions: [createAction('set', 'lit')] });
    const l = createShapeLayer({ hotspot: createHotspot({ gestures: [g] }) });
    const c = cloneLayer(l);
    expect(c.hotspot!.gestures[0].id).not.toBe(g.id);
    expect(c.hotspot!.gestures[0].actions[0].id).not.toBe(g.actions[0].id);
    expect(c.hotspot!.gestures[0].actions[0]).toMatchObject({ do: 'set', var: 'lit' });
  });

  it('hidden hotspots are not drawn, except (hatched) while editing', () => {
    let doc = createDocument({ width: 200, height: 100 });
    doc = insertLayer(doc, rod(createHotspot({ hidden: true, gestures: [createGesture('tap')] }), { color: '#ff0000' }));
    doc = insertLayer(doc, createShapeLayer({ color: '#00ff00', hotspot: createHotspot({ gestures: [createGesture('tap')] }) }));
    const shown = renderDocumentToString(doc);
    expect(shown).not.toContain('#ff0000');
    expect(shown).toContain('#00ff00'); // a hotspot that's also drawn
    const editing = renderDocumentToString(doc, { interactive: true });
    expect(editing).toContain('rgba(255,170,30,0.95)');
  });

  it('documentHasHotspots: only when a gesture does something', () => {
    let doc = insertLayer(createDocument(), rod(createHotspot({ gestures: [createGesture('tap')] })));
    expect(documentHasHotspots(doc)).toBe(false);
    doc = insertLayer(doc, rod(createHotspot({ gestures: [createGesture('tap', { actions: [createAction('mark', 'at')] })] })));
    expect(documentHasHotspots(doc)).toBe(true);
  });
});

describe('since()', () => {
  it('is seconds from a marked time to now, and counts as time', () => {
    expect(evaluate('since(at)', { at: 1000, now: 4000 })).toBe(3);
    expect(referencedNames('clamp(since(flipped) / 60, 0, 1)')).toContain('now');
    let doc = createDocument();
    doc = insertLayer(doc, createShapeLayer({ bindings: [{ id: 'b', target: 'opacity', expression: 'clamp(since(at), 0, 1)', enabled: true }] }));
    expect(documentUsesTime(doc)).toBe(true);
  });
});

describe('finding hotspots', () => {
  const tap = () => createHotspot({ gestures: [createGesture('tap', { actions: [createAction('mark', 'at')] })] });

  it('the topmost under a point, as the layer is now (bindings, groups)', () => {
    let doc = createDocument({ width: 200, height: 100 });
    doc = insertLayer(doc, { ...rod(tap()), id: 'under' });
    doc = insertLayer(doc, { ...createShapeLayer({ shape: 'ellipse', x: 100, y: 50, width: 20, height: 20, hotspot: tap() }), id: 'over' });
    expect(hotspotAt(doc, { x: 100, y: 50 })?.layerId).toBe('over');
    expect(hotspotAt(doc, { x: 180, y: 50 })?.layerId).toBe('under');
    expect(hotspotAt(doc, { x: 100, y: 90 })).toBeNull();
    // A bound position moves the hit area.
    const moving = { ...createShapeLayer({ shape: 'ellipse', x: 20, y: 20, width: 10, height: 10, hotspot: tap() }), id: 'bead',
      bindings: [{ id: 'b', target: 'x', expression: 'pos', enabled: true }] };
    doc = insertLayer(doc, moving);
    const resolved = resolveDocument(doc, { ...documentEnv(doc), pos: 150 });
    expect(hotspotAt(resolved, { x: 150, y: 20 })?.layerId).toBe('bead');
    // A group's hit area is its shapes', in the group's frame.
    const grp = createGroupLayer({ x: 50, y: 80, children: [createShapeLayer({ shape: 'ellipse', x: 0, y: 0, width: 10, height: 10 })] });
    doc = insertLayer(doc, { ...grp, id: 'grp', hotspot: tap() });
    expect(hotspotAt(doc, { x: 50, y: 80 })?.layerId).toBe('grp');
  });

  it('hidden layers have none; thin hotspots can be reached within a tolerance', () => {
    let doc = createDocument({ width: 200, height: 100 });
    doc = insertLayer(doc, { ...rod(tap()), id: 'rod' });
    expect(hotspotAt(doc, { x: 100, y: 60 })).toBeNull();
    expect(hotspotAt(doc, { x: 100, y: 60 }, 8)?.layerId).toBe('rod');
    doc = { ...doc, layers: doc.layers.map((l) => ({ ...l, visible: false })) };
    expect(hotspotsOf(doc)).toHaveLength(0);
  });
});

describe('actions', () => {
  const act = (a: Partial<Action> & { do: Action['do'] }) => ({ id: 'a', var: 'v', ...a }) as Action;

  it('set, add (kept in range, or wrapping), mark, in order', () => {
    expect(runActions([act({ do: 'set', to: '1 - v' })], { v: 0 }, 0)).toEqual({ v: 1 });
    expect(runActions([act({ do: 'add', by: '2', max: 3 })], { v: 2 }, 0)).toEqual({ v: 3 });
    expect(runActions([act({ do: 'add', by: '1', min: 0, max: 3, wrap: true })], { v: 3 }, 0)).toEqual({ v: 0 });
    expect(runActions([act({ do: 'add', by: '-1', min: 0, max: 3, wrap: true })], { v: 0 }, 0)).toEqual({ v: 3 });
    expect(runActions([act({ do: 'mark' })], {}, 1234)).toEqual({ v: 1234 });
    // A later action sees an earlier one; a broken formula skips only its own action.
    expect(runActions([act({ do: 'set', to: '5' }), act({ do: 'set', var: 'w', to: 'v * 2' }), act({ do: 'set', var: 'x', to: 'nope(' })], {}, 0)).toEqual({ v: 5, w: 10 });
  });

  it('drag: from..to across the hotspot, snapped to its step', () => {
    const d = act({ do: 'drag', from: 0, to: 10, step: 1 });
    expect(runActions([d], {}, 0, 0.44)).toEqual({ v: 4 });
    expect(runActions([d], {}, 0, 2)).toEqual({ v: 10 });
    expect(runActions([d], {}, 0)).toEqual({}); // not dragging: nothing
  });
});

// The plan's examples, start to finish.
function interact(doc: SvgDocument, start: Env = {}) {
  let values: Env = { ...start };
  let clock = 0;
  const log: { values: Env; done: boolean }[] = [];
  const ix = createInteraction({
    document: () => resolveDocument(doc, { ...documentEnv(doc), ...values }),
    env: () => ({ ...documentEnv(doc), ...values }),
    onChange: (v, done) => { values = { ...values, ...v }; log.push({ values: v, done }); },
    now: () => clock,
  });
  return { ix, log, get values() { return values; }, tick: (ms: number) => { clock += ms; } };
}

describe('gestures', () => {
  it('an abacus rod: drag the count along it; a tap does nothing', () => {
    const doc = insertLayer(createDocument({ width: 200, height: 100 }), rod(createHotspot({
      hidden: true,
      gestures: [createGesture('drag', { axis: 'x', actions: [{ id: 'a', do: 'drag', var: 'local_rod1', from: 0, to: 10, step: 1 }] })],
    })));
    const t = interact(doc, { local_rod1: 0 });
    expect(t.ix.down({ x: 5, y: 50 })).toBe(true);
    t.ix.move({ x: 80, y: 51 });
    expect(t.values.local_rod1).toBe(4);
    expect(t.log[t.log.length - 1].done).toBe(false);
    t.ix.up({ x: 200, y: 52 });
    expect(t.values.local_rod1).toBe(10);
    expect(t.log[t.log.length - 1].done).toBe(true);
    const before = t.log.length;
    t.ix.down({ x: 100, y: 50 });
    t.ix.up({ x: 101, y: 50 });
    expect(t.log.length).toBe(before);
    expect(t.ix.down({ x: 100, y: 95 })).toBe(false); // not on it: the host can pan
  });

  it('an hourglass: flip it any time; the sand on top is what was below', () => {
    const hourglass = createShapeLayer({ shape: 'ellipse', x: 50, y: 50, width: 60, height: 90, hotspot: createHotspot({
      gestures: [createGesture('tap', { actions: [
        { id: '1', do: 'set', var: 'local_top', to: '1 - clamp(local_top - since(local_flippedAt) / 60, 0, 1)' },
        { id: '2', do: 'mark', var: 'local_flippedAt' },
        { id: '3', do: 'add', var: 'local_flips', by: '1' },
      ] })],
    }) });
    const doc = insertLayer(createDocument({ width: 100, height: 100 }), hourglass);
    const t = interact(doc, { local_top: 0, local_flippedAt: 0, local_flips: 0 });
    let now = 0; // (the same clock the interaction uses: see tick)
    const top = () => evaluate('clamp(local_top - since(local_flippedAt) / 60, 0, 1)', { ...t.values, now });
    const press = () => { t.ix.down({ x: 50, y: 50 }); t.ix.up({ x: 50, y: 50 }); };
    press(); // flipped while empty on top: it all goes on top
    expect(t.values.local_top).toBe(1);
    expect(t.values.local_flips).toBe(1);
    t.tick(15000); now += 15000; // a quarter of a minute later
    expect(top()).toBeCloseTo(0.75);
    press(); // flipped mid-way: the quarter that ran down is now on top
    expect(t.values.local_top).toBeCloseTo(0.25);
    expect(t.values.local_flippedAt).toBe(15000);
    expect(t.values.local_flips).toBe(2);
  });

  it('a slow press is not a tap; a press that moves without a drag does nothing', () => {
    const doc = insertLayer(createDocument(), rod(createHotspot({ gestures: [createGesture('tap', { actions: [createAction('mark', 'at')] })] })));
    const t = interact(doc);
    t.ix.down({ x: 100, y: 50 });
    t.tick(900);
    t.ix.up({ x: 100, y: 50 });
    t.ix.down({ x: 100, y: 50 });
    t.ix.move({ x: 160, y: 50 });
    t.ix.up({ x: 160, y: 50 });
    expect(t.log).toHaveLength(0);
  });
});
