import {
  ACTION_TYPES,
  createAction,
  createGesture,
  createHotspot,
  GESTURE_TYPES,
  type Action,
  type ActionType,
  type Gesture,
  type GestureType,
  type Hotspot,
  type Layer,
} from '../core';
import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { button, checkbox, miniField, numberInput, section, select, textInput } from './fields';
import { icon } from './icons';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The selected layer's hotspot: what touching it does (see core/interaction.ts).
 * Gestures (tap, drag) each run a list of actions that change variables; Preview
 * (top bar) makes them work on the canvas, so a drawing can be tried as it's made.
 */
export function interactSection(editor: SvgLayEditor, layer: Layer): HTMLElement {
  const hs = layer.hotspot;
  const save = (next: Hotspot | undefined) =>
    editor.updateLayer(layer.id, (l) => {
      const { hotspot: _old, ...rest } = l;
      return (next ? { ...rest, hotspot: next } : rest) as Layer;
    });
  const title = `Interact · ${layer.name}`;
  if (!hs) {
    return section(title, [
      el('div', { class: 'slt-hint' }, [
        'Make this layer a hotspot: tapping or dragging it in the finished picture changes variables, and its bindings (above) redraw it. Try it out with Preview in the top bar.',
      ]),
      el('div', { class: 'slt-row' }, [
        button([icon('plus'), 'Make it a hotspot'], () => save(createHotspot({ gestures: [createGesture('tap')] })), { cls: 'slt-small' }),
      ]),
    ]);
  }

  // The names an action can change: the document's variables and the host app's.
  const names = new Set<string>([...(editor.document.variables ?? []).map((v) => v.name), ...Object.keys(editor.appVariableValues())]);
  const listId = `slt-interact-vars-${layer.id}`;
  const datalist = el('datalist', { id: listId }, [...names].sort().map((n) => el('option', { value: n })));

  const setGesture = (g: Gesture, patch: Partial<Gesture>) => save({ ...hs, gestures: hs.gestures.map((x) => (x.id === g.id ? { ...x, ...patch } : x)) });
  const setAction = (g: Gesture, a: Action, next: Action | null) =>
    setGesture(g, { actions: next ? g.actions.map((x) => (x.id === a.id ? next : x)) : g.actions.filter((x) => x.id !== a.id) });

  const actionCard = (g: Gesture, a: Action): HTMLElement => {
    const typeSel = select(a.do, ACTION_TYPES.filter((t) => t.type !== 'drag' || g.on === 'drag').map((t) => ({ value: t.type, label: t.label })), (type) =>
      setAction(g, a, { ...createAction(type as ActionType, a.var), id: a.id }),
    );
    typeSel.title = ACTION_TYPES.find((t) => t.type === a.do)?.hint ?? '';
    const varInput = textInput(a.var, (v) => {
      const clean = v.trim();
      if (IDENT.test(clean)) setAction(g, a, { ...a, var: clean });
      else editor.refresh(false); // reject: show the old name again
    });
    varInput.setAttribute('list', listId);
    varInput.placeholder = 'variable';
    const head = el('div', { class: 'slt-effect-head' }, [
      typeSel,
      varInput,
      button(icon('close'), () => setAction(g, a, null), { title: 'Remove action', cls: 'slt-small slt-icon-only slt-danger' }),
    ]);
    const formula = (value: string, placeholder: string, onSet: (v: string) => void) => {
      const input = textInput(value, onSet);
      input.classList.add('slt-binding-expr');
      input.placeholder = placeholder;
      return el('div', { class: 'slt-row' }, [el('span', { class: 'slt-fx' }, ['ƒ']), input]);
    };
    const body: HTMLElement[] = [];
    if (a.do === 'set') body.push(formula(a.to, 'formula, e.g. 1 - lit', (to) => setAction(g, a, { ...a, to })));
    if (a.do === 'add') {
      body.push(formula(a.by, 'how much, e.g. 1', (by) => setAction(g, a, { ...a, by })));
      // Optional limits: empty means none.
      const limit = (key: 'min' | 'max') => {
        const input = numberInput(a[key] ?? 0, (n) => setAction(g, a, { ...a, [key]: n }), { digits: 3 });
        if (a[key] === undefined) input.value = '';
        input.placeholder = 'none';
        input.addEventListener('change', () => {
          if (input.value.trim() === '' && a[key] !== undefined) setAction(g, a, { ...a, [key]: undefined });
        });
        return input;
      };
      body.push(
        el('div', { class: 'slt-grid3' }, [
          miniField('Lowest', limit('min')),
          miniField('Highest', limit('max')),
          checkbox('Wrap round', !!a.wrap, (wrap) => setAction(g, a, { ...a, ...(wrap ? { wrap: true } : { wrap: undefined }) })),
        ]),
      );
    }
    if (a.do === 'mark') body.push(el('div', { class: 'slt-hint' }, [`${a.var} becomes the time now: bind something to since(${a.var}) to animate after a touch.`]));
    if (a.do === 'drag') {
      body.push(
        el('div', { class: 'slt-grid3' }, [
          miniField('From', numberInput(a.from, (n) => setAction(g, a, { ...a, from: n }), { digits: 3 })),
          miniField('To', numberInput(a.to, (n) => setAction(g, a, { ...a, to: n }), { digits: 3 })),
          miniField('Step', numberInput(a.step ?? 0, (n) => setAction(g, a, { ...a, ...(n > 0 ? { step: n } : { step: undefined }) }), { min: 0, step: 0.1, digits: 3 })),
        ]),
      );
    }
    if (!names.has(a.var)) {
      body.push(el('div', { class: 'slt-hint' }, [`${a.var} isn't a variable yet: add it in Variables to give it a starting value (else it starts at 0).`]));
    }
    return el('div', { class: 'slt-effect slt-action' }, [head, ...body]);
  };

  const gestureCard = (g: Gesture): HTMLElement => {
    const typeSel = select(g.on, GESTURE_TYPES.map((t) => ({ value: t.type, label: t.label })), (on) =>
      setGesture(g, {
        on: on as GestureType,
        ...(on === 'drag' ? { axis: g.axis ?? 'x' } : { axis: undefined }),
        // A tap can't drag a value: those actions go.
        actions: on === 'tap' ? g.actions.filter((a) => a.do !== 'drag') : g.actions,
      }),
    );
    typeSel.title = GESTURE_TYPES.find((t) => t.type === g.on)?.hint ?? '';
    const head = el('div', { class: 'slt-effect-head' }, [
      typeSel,
      g.on === 'drag'
        ? select(g.axis ?? 'x', [{ value: 'x', label: 'Left to right' }, { value: 'y', label: 'Top to bottom' }], (axis) => setGesture(g, { axis: axis as 'x' | 'y' }))
        : el('span', { class: 'slt-grow' }),
      button(icon('close'), () => save({ ...hs, gestures: hs.gestures.filter((x) => x.id !== g.id) }), { title: 'Remove gesture', cls: 'slt-small slt-icon-only slt-danger' }),
    ]);
    const addSel = el('select', { class: 'slt-select' }, [el('option', { value: '' }, ['+ Add an action…'])]);
    for (const t of ACTION_TYPES) if (t.type !== 'drag' || g.on === 'drag') addSel.appendChild(el('option', { value: t.type, title: t.hint }, [t.label]));
    addSel.addEventListener('change', () => {
      const type = addSel.value as ActionType;
      addSel.value = '';
      if (!type) return;
      const guess = g.actions[g.actions.length - 1]?.var ?? [...names][0] ?? 'value';
      setGesture(g, { actions: [...g.actions, createAction(type, guess)] });
    });
    addSel.addEventListener('keydown', (e) => e.stopPropagation());
    return el('div', { class: 'slt-effect slt-gesture' }, [
      head,
      ...g.actions.map((a) => actionCard(g, a)),
      g.actions.length === 0 ? el('div', { class: 'slt-hint' }, ['No actions yet: add one, e.g. Set lit to 1 - lit to switch something on and off.']) : null,
      el('div', { class: 'slt-row' }, [addSel]),
    ]);
  };

  const addGesture = el('select', { class: 'slt-select' }, [el('option', { value: '' }, ['+ Add a gesture…'])]);
  for (const t of GESTURE_TYPES) addGesture.appendChild(el('option', { value: t.type, title: t.hint }, [t.label]));
  addGesture.addEventListener('change', () => {
    const on = addGesture.value as GestureType;
    addGesture.value = '';
    if (on) save({ ...hs, gestures: [...hs.gestures, createGesture(on)] });
  });
  addGesture.addEventListener('keydown', (e) => e.stopPropagation());

  return section(
    title,
    [
      datalist,
      el('div', { class: 'slt-row' }, [checkbox('Only a hotspot (not drawn in the picture)', hs.hidden, (hidden) => save({ ...hs, hidden }))]),
      ...hs.gestures.map(gestureCard),
      el('div', { class: 'slt-row' }, [addGesture]),
      el('div', { class: 'slt-hint' }, ['Try it in Preview (top bar): tap or drag the hotspot on the canvas. Values changed there are only for trying out; leaving Preview resets them.']),
    ],
    button(icon('close'), () => save(undefined), { title: 'Stop being a hotspot', cls: 'slt-small slt-icon-only slt-danger' }),
  );
}
