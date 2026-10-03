import {
  ACTION_TYPES,
  actionChangesVariable,
  BUILTIN_SOUNDS,
  createAction,
  createGesture,
  createHotspot,
  createId,
  GESTURE_TYPES,
  MAX_SOUND_CHARS,
  MAX_SOUNDS,
  playSound,
  type Action,
  type ActionType,
  type AppActionPreset,
  type Gesture,
  type GestureType,
  type Hotspot,
  type Layer,
  type SoundAsset,
  type SwipeDirection,
} from '../core';
import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { button, checkbox, miniField, numberInput, section, select, textInput } from './fields';
import { icon } from './icons';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Gestures where the finger's position means something: they can drag a value. */
const POSITIONAL: GestureType[] = ['drag', 'dial'];

/**
 * The selected layer's hotspot: what touching it does (see core/interaction.ts).
 * Gestures each run a list of actions that change variables (or play a sound, or
 * buzz); Preview (top bar) makes them work on the canvas, so a drawing can be
 * tried as it's made.
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
        'Make this layer a hotspot: tapping, dragging or turning it in the finished picture changes variables (or plays a sound), and its bindings (above) redraw it. Try it out with Preview in the top bar.',
      ]),
      el('div', { class: 'slt-row' }, [
        button([icon('plus'), 'Make it a hotspot'], () => save(createHotspot({ gestures: [createGesture('tap')] })), { cls: 'slt-small' }),
      ]),
    ]);
  }

  const doc = editor.document;
  // The names an action can change: the document's variables and the host app's.
  const names = new Set<string>([...(doc.variables ?? []).map((v) => v.name), ...Object.keys(editor.appVariableValues())]);
  const listId = `slt-interact-vars-${layer.id}`;
  const datalist = el('datalist', { id: listId }, [...names].sort().map((n) => el('option', { value: n })));

  type Which = 'actions' | 'release';
  const setGesture = (g: Gesture, patch: Partial<Gesture>) => save({ ...hs, gestures: hs.gestures.map((x) => (x.id === g.id ? { ...x, ...patch } : x)) });
  const setAction = (g: Gesture, which: Which, a: Action, next: Action | null) => {
    const list = g[which] ?? [];
    setGesture(g, { [which]: next ? list.map((x) => (x.id === a.id ? next : x)) : list.filter((x) => x.id !== a.id) });
  };

  // The actions offered: the built-in ones (drag values only where the finger's position counts),
  // then the host app's own (as "app:<name>").
  const kinds = (g: Gesture) => [
    ...ACTION_TYPES.filter((t) => t.type !== 'drag' || POSITIONAL.includes(g.on)).map((t) => ({ value: t.type as string, label: t.label, hint: t.hint })),
    ...editor.appActions.map((p) => ({ value: `app:${p.app}`, label: p.label, hint: p.hint ?? '' })),
  ];
  const appPreset = (name: string): AppActionPreset | undefined => editor.appActions.find((p) => p.app === name);
  const makeAction = (kind: string, varName: string): Action => {
    if (!kind.startsWith('app:')) return createAction(kind as ActionType, varName);
    const p = appPreset(kind.slice(4));
    return { id: createId('a'), do: 'app', app: kind.slice(4), ...(p?.key?.options[0] ? { key: p.key.options[0].value } : {}), ...(p?.value ? { value: p.value.default } : {}) };
  };

  const formula = (value: string, placeholder: string, onSet: (v: string) => void) => {
    const input = textInput(value, onSet);
    input.classList.add('slt-binding-expr');
    input.placeholder = placeholder;
    return el('div', { class: 'slt-row' }, [el('span', { class: 'slt-fx' }, ['ƒ']), input]);
  };

  const actionCard = (g: Gesture, which: Which, a: Action): HTMLElement => {
    const lastVar = actionChangesVariable(a) ? a.var : [...names][0] ?? 'value';
    const current = a.do === 'app' ? `app:${a.app}` : a.do;
    const options = kinds(g);
    if (!options.some((o) => o.value === current)) options.push({ value: current, label: a.do === 'app' ? `App: ${a.app}` : a.do, hint: '' });
    const typeSel = select(current, options.map((o) => ({ value: o.value, label: o.label })), (kind) => setAction(g, which, a, { ...makeAction(kind, lastVar), id: a.id }));
    typeSel.title = options.find((o) => o.value === current)?.hint ?? '';
    const head: (HTMLElement | null)[] = [typeSel];
    if (actionChangesVariable(a)) {
      const varInput = textInput(a.var, (v) => {
        const clean = v.trim();
        if (IDENT.test(clean)) setAction(g, which, a, { ...a, var: clean });
        else editor.refresh(false); // reject: show the old name again
      });
      varInput.setAttribute('list', listId);
      varInput.placeholder = 'variable';
      head.push(varInput);
    } else head.push(el('span', { class: 'slt-grow' }));
    head.push(button(icon('close'), () => setAction(g, which, a, null), { title: 'Remove action', cls: 'slt-small slt-icon-only slt-danger' }));
    const body: HTMLElement[] = [];
    const range = (a2: Extract<Action, { from: number }>) =>
      el('div', { class: 'slt-grid3' }, [
        miniField('From', numberInput(a2.from, (n) => setAction(g, which, a, { ...a2, from: n }), { digits: 3 })),
        miniField('To', numberInput(a2.to, (n) => setAction(g, which, a, { ...a2, to: n }), { digits: 3 })),
        miniField('Step', numberInput(a2.step ?? 0, (n) => setAction(g, which, a, { ...a2, ...(n > 0 ? { step: n } : { step: undefined }) }), { min: 0, step: 0.1, digits: 3 })),
      ]);
    switch (a.do) {
      case 'set':
        body.push(formula(a.to, 'formula, e.g. 1 - lit', (to) => setAction(g, which, a, { ...a, to })));
        break;
      case 'add': {
        body.push(formula(a.by, 'how much, e.g. 1', (by) => setAction(g, which, a, { ...a, by })));
        // Optional limits: empty means none.
        const limit = (key: 'min' | 'max') => {
          const input = numberInput(a[key] ?? 0, (n) => setAction(g, which, a, { ...a, [key]: n }), { digits: 3 });
          if (a[key] === undefined) input.value = '';
          input.placeholder = 'none';
          input.addEventListener('change', () => {
            if (input.value.trim() === '' && a[key] !== undefined) setAction(g, which, a, { ...a, [key]: undefined });
          });
          return input;
        };
        body.push(
          el('div', { class: 'slt-grid3' }, [
            miniField('Lowest', limit('min')),
            miniField('Highest', limit('max')),
            checkbox('Wrap round', !!a.wrap, (wrap) => setAction(g, which, a, { ...a, ...(wrap ? { wrap: true } : { wrap: undefined }) })),
          ]),
        );
        break;
      }
      case 'mark':
        body.push(el('div', { class: 'slt-hint' }, [`${a.var} becomes the time now: bind something to since(${a.var}) to animate after a touch.`]));
        break;
      case 'drag':
      case 'random':
        body.push(range(a));
        break;
      case 'sound': {
        const options = [...(doc.sounds ?? []).map((s) => ({ value: s.id, label: s.name })), ...BUILTIN_SOUNDS.map((s) => ({ value: s.name, label: s.label }))];
        const sel = select(a.sound, options, (sound) => setAction(g, which, a, { ...a, sound }));
        body.push(
          el('div', { class: 'slt-row' }, [
            sel,
            button(icon('play'), () => playSound(doc, a.sound, a.volume ?? 1), { title: 'Play it', cls: 'slt-small slt-icon-only' }),
          ]),
          el('div', { class: 'slt-grid3' }, [
            miniField('Volume %', numberInput(Math.round((a.volume ?? 1) * 100), (n) => setAction(g, which, a, { ...a, ...(n < 100 ? { volume: Math.max(0, n) / 100 } : { volume: undefined }) }), { min: 0, max: 100, step: 5, digits: 0 })),
          ]),
        );
        break;
      }
      case 'vibrate':
        body.push(el('div', { class: 'slt-grid3' }, [miniField('ms', numberInput(a.ms, (n) => setAction(g, which, a, { ...a, ms: Math.round(Math.min(1000, Math.max(1, n))) }), { min: 1, max: 1000, step: 10, digits: 0 }))]));
        break;
      case 'app': {
        const p = appPreset(a.app);
        if (!p) {
          body.push(el('div', { class: 'slt-hint' }, [`An action of the app this drawing was made for (${a.app}): it does nothing here.`]));
          break;
        }
        if (p.hint) body.push(el('div', { class: 'slt-hint' }, [p.hint]));
        if (p.key) body.push(el('div', { class: 'slt-row' }, [el('label', {}, [p.key.label]), select(a.key ?? p.key.options[0]?.value ?? '', p.key.options, (key) => setAction(g, which, a, { ...a, key }))]));
        if (p.value) body.push(formula(a.value ?? p.value.default, p.value.placeholder ?? p.value.label, (value) => setAction(g, which, a, { ...a, value })));
        break;
      }
    }
    if (actionChangesVariable(a) && !names.has(a.var)) {
      body.push(el('div', { class: 'slt-hint' }, [`${a.var} isn't a variable yet: add it in Variables to give it a starting value (else it starts at 0).`]));
    }
    return el('div', { class: 'slt-effect slt-action' }, [el('div', { class: 'slt-effect-head' }, head), ...body]);
  };

  const actionList = (g: Gesture, which: Which, label?: string): HTMLElement[] => {
    const list = g[which] ?? [];
    const addSel = el('select', { class: 'slt-select' }, [el('option', { value: '' }, [label ?? '+ Add an action…'])]);
    for (const k of kinds(g)) addSel.appendChild(el('option', { value: k.value, title: k.hint }, [k.label]));
    addSel.addEventListener('change', () => {
      const kind = addSel.value;
      addSel.value = '';
      if (!kind) return;
      const prev = [...list].reverse().find(actionChangesVariable);
      const guess = prev?.var ?? [...names][0] ?? 'value';
      setGesture(g, { [which]: [...list, makeAction(kind, guess)] });
    });
    addSel.addEventListener('keydown', (e) => e.stopPropagation());
    return [...list.map((a) => actionCard(g, which, a)), el('div', { class: 'slt-row' }, [addSel])];
  };

  const gestureCard = (g: Gesture): HTMLElement => {
    const typeSel = select(g.on, GESTURE_TYPES.map((t) => ({ value: t.type, label: t.label })), (on) => {
      const next = createGesture(on as GestureType);
      const keep = (list: Action[]) => (POSITIONAL.includes(on as GestureType) ? list : list.filter((a) => a.do !== 'drag'));
      // Keep its actions (those that still make sense); a hold keeps its release ones.
      setGesture(g, { ...next, id: g.id, actions: keep(g.actions), ...(on === 'hold' ? { release: keep(g.release ?? []) } : { release: undefined }) });
    });
    typeSel.title = GESTURE_TYPES.find((t) => t.type === g.on)?.hint ?? '';
    let option: HTMLElement = el('span', { class: 'slt-grow' });
    if (g.on === 'drag') option = select(g.axis ?? 'x', [{ value: 'x', label: 'Left to right' }, { value: 'y', label: 'Top to bottom' }], (axis) => setGesture(g, { axis: axis as 'x' | 'y' }));
    if (g.on === 'swipe') {
      option = select(g.dir ?? 'any', [
        { value: 'any', label: 'Any way' }, { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
      ], (dir) => setGesture(g, { dir: dir as SwipeDirection }));
    }
    if (g.on === 'dial') {
      const turns = numberInput(g.turns ?? 1, (n) => setGesture(g, { turns: Math.min(20, Math.max(0.1, n)) }), { min: 0.1, max: 20, step: 0.25, digits: 2 });
      turns.title = 'Turns of the finger for the whole range of its drag values';
      option = miniField('Turns', turns);
    }
    const head = el('div', { class: 'slt-effect-head' }, [
      typeSel,
      option,
      button(icon('close'), () => save({ ...hs, gestures: hs.gestures.filter((x) => x.id !== g.id) }), { title: 'Remove gesture', cls: 'slt-small slt-icon-only slt-danger' }),
    ]);
    const hint = g.on === 'dial' ? 'Add a Drag value action: turning the finger round the middle moves it from where it is.' : g.on === 'hold' ? 'As the finger goes down:' : null;
    return el('div', { class: 'slt-effect slt-gesture' }, [
      head,
      hint ? el('div', { class: 'slt-hint' }, [hint]) : null,
      ...actionList(g, 'actions'),
      ...(g.on === 'hold' ? [el('div', { class: 'slt-hint' }, ['As it lets go:']), ...actionList(g, 'release', '+ Add an action for letting go…')] : []),
      g.actions.length === 0 && !(g.release ?? []).length && g.on !== 'hold' && g.on !== 'dial'
        ? el('div', { class: 'slt-hint' }, ['No actions yet: add one, e.g. Set lit to 1 - lit to switch something on and off.'])
        : null,
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
      soundsBlock(editor),
      el('div', { class: 'slt-hint' }, ['Try it in Preview (top bar): tap, drag or turn the hotspot on the canvas. Values changed there are only for trying out; leaving Preview resets them.']),
    ],
    button(icon('close'), () => save(undefined), { title: 'Stop being a hotspot', cls: 'slt-small slt-icon-only slt-danger' }),
  );
}

/** The drawing's own sounds (for Sound actions): add a short file, play, rename, remove. */
function soundsBlock(editor: SvgLayEditor): HTMLElement {
  const sounds = editor.document.sounds ?? [];
  const setSounds = (next: SoundAsset[]) => editor.store.commit((d) => ({ ...d, sounds: next }));
  const note = el('div', { class: 'slt-hint' });
  const file = el('input', { type: 'file', accept: 'audio/*', hidden: true });
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      if (!/^data:audio\//.test(data)) return void (note.textContent = 'That isn’t a sound file.');
      if (data.length > MAX_SOUND_CHARS) return void (note.textContent = `Too long: sounds can be about ${Math.round((MAX_SOUND_CHARS * 0.75) / 1024)} KB (a second or two). Try a shorter clip, or a compressed format (OGG, MP3).`);
      const id = `s_${createId('s').replace(/[^A-Za-z0-9_]/g, '')}`;
      setSounds([...sounds, { id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Sound', data }]);
    };
    reader.readAsDataURL(f);
  });
  const rows = sounds.map((s) =>
    el('div', { class: 'slt-row' }, [
      button(icon('play'), () => playSound(editor.document, s.id), { title: 'Play it', cls: 'slt-small slt-icon-only' }),
      textInput(s.name, (name) => setSounds(sounds.map((x) => (x.id === s.id ? { ...x, name: name.trim().slice(0, 60) || x.name } : x)))),
      button(icon('close'), () => setSounds(sounds.filter((x) => x.id !== s.id)), { title: 'Remove sound', cls: 'slt-small slt-icon-only slt-danger' }),
    ]),
  );
  return el('div', { class: 'slt-effect slt-sounds' }, [
    el('div', { class: 'slt-effect-head' }, [el('span', { class: 'slt-grow' }, ['Sounds of its own']), file]),
    ...rows,
    sounds.length < MAX_SOUNDS
      ? el('div', { class: 'slt-row' }, [button([icon('plus'), 'Add a sound file…'], () => file.click(), { cls: 'slt-small', title: `Up to ${MAX_SOUNDS} short sounds, kept in the drawing` })])
      : el('div', { class: 'slt-hint' }, [`That's the most (${MAX_SOUNDS}).`]),
    note,
  ]);
}
