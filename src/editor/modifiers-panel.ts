import {
  addModifier,
  createEffect,
  createModifier,
  EFFECT_DEFS,
  MODIFIER_DEFS,
  moveModifier,
  removeModifier,
  updateLayer,
  updateModifier,
  type Effect,
  type EffectType,
  type Fill,
  type Layer,
  type MaskMode,
  type Modifier,
  type ModifierType,
} from '../core';
import { el, isTypingInside } from './dom';
import type { SvgLayEditor } from './editor';
import { effectParamRows, effectsEditor } from './effects-editor';
import { allowedEffectTypes, type EditorFeatures } from './features';
import { button, checkbox, colorField, row, section, select, slider } from './fields';
import { icon } from './icons';


/** Stack of modifiers on the selected layer with an "add" menu. */
export class ModifiersPanel {
  readonly el: HTMLDivElement;

  constructor(private editor: SvgLayEditor) {
    this.el = el('div', { class: 'slt-props slt-modifiers' });
  }

  render(): void {
    // Never yank a text field out from under the user's cursor; the next commit re-renders.
    if (isTypingInside(this.el, this.editor.root instanceof ShadowRoot ? this.editor.root : document)) return;
    this.el.replaceChildren();
    const layers = this.editor.selectedLayers();
    if (layers.length !== 1) {
      this.el.appendChild(
        section('Modifiers', [el('div', { class: 'slt-hint' }, [layers.length === 0 ? 'Select a layer to add modifiers.' : 'Select a single layer to edit its modifiers.'])]),
      );
      return;
    }
    this.el.appendChild(this.renderLayer(layers[0]));
  }

  private applyDoc(fn: (l: Layer) => Layer, id: string, commit: boolean): void {
    const store = this.editor.store;
    const op = (d: typeof store.doc) => updateLayer(d, id, fn);
    if (!commit) {
      store.beginTransaction();
      store.update(op);
    } else {
      store.update(op);
      store.endTransaction();
    }
  }

  private availableTypes(layer: Layer): ModifierType[] {
    const f = this.editor.features;
    const out: ModifierType[] = [];
    const isShape = layer.type === 'shape';
    if (isShape) out.push('fill');
    if (isShape && f.strokes) out.push('stroke');
    if (isShape) out.push('round', 'deform', 'edges');
    if (f.effects !== false && allowedEffectTypes(f).length) out.push('effect');
    if (f.masks) out.push('mask');
    return out;
  }

  private renderLayer(layer: Layer): HTMLElement {
    const f = this.editor.features;
    const id = layer.id;
    const apply = (fn: (l: Layer) => Layer, commit = true) => this.applyDoc(fn, id, commit);

    // Add menu: one entry per modifier type; effects expand to one entry per effect kind.
    const add = el('select', { class: 'slt-select' }, [el('option', { value: '' }, ['+ Add modifier…'])]);
    for (const t of this.availableTypes(layer)) {
      if (t === 'effect') {
        const grp = el('optgroup', { label: 'Effects' });
        for (const e of allowedEffectTypes(f)) grp.appendChild(el('option', { value: `effect:${e}` }, [EFFECT_DEFS[e].label]));
        add.appendChild(grp);
      } else {
        add.appendChild(el('option', { value: t }, [MODIFIER_DEFS[t].label]));
      }
    }
    add.addEventListener('change', () => {
      const v = add.value;
      add.value = '';
      if (!v) return;
      const mod = v.startsWith('effect:')
        ? createModifier('effect', { effect: createEffect(v.slice(7) as EffectType) })
        : createModifier(v as Exclude<ModifierType, 'effect'>);
      apply((l) => addModifier(l, mod));
    });
    add.addEventListener('keydown', (e) => e.stopPropagation());

    const list = el('div', { class: 'slt-modifier-list' });
    const mods = layer.modifiers ?? [];
    if (mods.length === 0) {
      list.appendChild(
        el('div', { class: 'slt-hint slt-modifiers-empty' }, [
          layer.type === 'shape'
            ? 'No modifiers yet. Add a fill, stroke or effect, deform the shape, bend its edges, or turn it into a mask.'
            : 'No modifiers yet. Add an effect or turn the group into a mask.',
        ]),
      );
    }
    mods.forEach((m, i) => list.appendChild(this.card(layer, m, i, mods.length, apply)));
    return section('Modifiers', [el('div', { class: 'slt-row' }, [add]), list]);
  }

  private card(layer: Layer, m: Modifier, index: number, count: number, apply: (fn: (l: Layer) => Layer, commit?: boolean) => void): HTMLElement {
    const f = this.editor.features;
    const def = MODIFIER_DEFS[m.type];
    const patch = (p: Partial<Modifier>, commit = true) => apply((l) => updateModifier(l, m.id, p), commit);
    const enabled = el('input', { type: 'checkbox', checked: m.enabled, title: 'Enable' });
    enabled.addEventListener('change', () => patch({ enabled: enabled.checked }));
    const title = m.type === 'effect' ? `Effect · ${EFFECT_DEFS[m.effect.type].label}` : def.label;
    const head = el('div', { class: 'slt-effect-head' }, [
      enabled,
      el('span', { class: 'slt-grow' }, [title]),
      button(icon('up'), () => apply((l) => moveModifier(l, m.id, -1)), { title: 'Move up', cls: 'slt-small slt-icon-only' }),
      button(icon('down'), () => apply((l) => moveModifier(l, m.id, 1)), { title: 'Move down', cls: 'slt-small slt-icon-only' }),
      button(icon('close'), () => apply((l) => removeModifier(l, m.id)), { title: 'Remove', cls: 'slt-small slt-icon-only slt-danger' }),
    ]);
    (head.children[2] as HTMLButtonElement).disabled = index === 0;
    (head.children[3] as HTMLButtonElement).disabled = index === count - 1;
    const card = el('div', { class: 'slt-effect slt-modifier', dataset: { type: m.type } }, [head]);
    if (!m.enabled) card.dataset.disabled = '';
    if (def.shapeOnly && layer.type !== 'shape') {
      card.appendChild(el('div', { class: 'slt-hint' }, ['Only applies to shapes; ignored on a group.']));
    }
    for (const r of this.fields(layer, m, patch, f)) card.appendChild(r);
    return card;
  }

  private fields(layer: Layer, m: Modifier, patch: (p: Partial<Modifier>, commit?: boolean) => void, f: EditorFeatures): HTMLElement[] {
    const mode = f.colorMode;
    switch (m.type) {
      case 'fill': {
        const fill = m.fill;
        const setFill = (fl: Fill, c = true) => patch({ fill: fl } as Partial<Modifier>, c);
        const types: { value: Fill['type']; label: string }[] = [{ value: 'solid', label: mode === 'monochrome' ? 'Filled' : 'Solid colour' }];
        if (f.gradients) types.push({ value: 'linear', label: 'Linear gradient' }, { value: 'radial', label: 'Radial gradient' });
        types.push({ value: 'none', label: 'None (no fill)' });
        if (!types.some((t) => t.value === fill.type)) types.push({ value: fill.type, label: `${fill.type} gradient` });
        const out: HTMLElement[] = [row('Type', select<Fill['type']>(fill.type, types, (v) => setFill(convertFill(fill, v, layer))))];
        if (fill.type === 'solid') {
          const field = colorField(mode, fill.color, (v, c) => setFill({ type: 'solid', color: v }, c));
          if (field) out.push(row('Colour', field));
        } else if (fill.type === 'linear' || fill.type === 'radial') {
          fill.stops.forEach((stop, i) => {
            const setStop = (p: Partial<typeof stop>, c: boolean) => setFill({ ...fill, stops: fill.stops.map((s, j) => (j === i ? { ...s, ...p } : s)) }, c);
            const field = colorField(mode, stop.color, (v, c) => setStop({ color: v }, c));
            if (field) out.push(row(`Stop ${i + 1}`, field));
            out.push(row('Position', slider(stop.offset, (v, c) => setStop({ offset: v }, c), { min: 0, max: 1, step: 0.01 })));
          });
          out.push(
            el('div', { class: 'slt-btn-row' }, [
              button('Add stop', () => setFill({ ...fill, stops: [...fill.stops, { offset: 1, color: '#ffffff' }] }), { cls: 'slt-small' }),
              fill.stops.length > 2 ? button('Remove last', () => setFill({ ...fill, stops: fill.stops.slice(0, -1) }), { cls: 'slt-small' }) : el('span'),
            ]),
          );
          if (fill.type === 'linear') out.push(row('Angle', slider(fill.angle, (v, c) => setFill({ ...fill, angle: v }, c), { min: 0, max: 360, step: 1 })));
        }
        return out;
      }
      case 'stroke': {
        const out: HTMLElement[] = [row('Width', slider(m.width, (v, c) => patch({ width: v } as Partial<Modifier>, c), { min: 0, max: 100, step: 0.5 }))];
        if (mode !== 'monochrome') {
          out.push(row('', checkbox('Use layer colour', m.color === null, (on) => patch({ color: on ? null : layer.type === 'shape' ? layer.color : '#ffffff' } as Partial<Modifier>))));
          if (m.color !== null) {
            const field = colorField(mode, m.color, (v, c) => patch({ color: v } as Partial<Modifier>, c));
            if (field) out.push(row('Colour', field));
          }
        }
        return out;
      }
      case 'effect': {
        return effectParamRows(m.effect, (p, c) => patch({ effect: { ...m.effect, ...p } as Effect } as Partial<Modifier>, c), f);
      }
      case 'mask': {
        const out: HTMLElement[] = [
          row(
            'Mode',
            select<MaskMode>(
              m.mode,
              [
                { value: 'clip', label: 'Clip: show below only inside' },
                { value: 'clip-inverse', label: 'Clip inverse: hide inside' },
                { value: 'filter', label: 'Effect region: apply effects inside' },
              ],
              (v) => patch({ mode: v } as Partial<Modifier>),
            ),
          ),
          row('', checkbox('Also draw the shape itself', m.showShape, (c) => patch({ showShape: c } as Partial<Modifier>))),
          el('div', { class: 'slt-hint' }, [
            m.mode === 'filter'
              ? 'The layers below stay visible; inside this shape the effects below are applied to them.'
              : 'Effects below are applied to the clipped result. Add a Blur effect modifier on the layer for a soft edge.',
          ]),
        ];
        if (f.effects !== false) {
          out.push(el('div', { class: 'slt-section-head' }, ['Effects on layers below']));
          out.push(effectsEditor(m.effects, (effects, c) => patch({ effects } as Partial<Modifier>, c), f));
        }
        return out;
      }
      case 'round':
        return [
          row('Radius %', slider(m.radius, (v, c) => patch({ radius: v } as Partial<Modifier>, c), { min: 0, max: 100, step: 1 })),
          el('div', { class: 'slt-hint' }, ['Percent of half the shorter side. Strokes follow the rounded outline; without this modifier corners stay sharp.']),
        ];
      case 'deform':
        return [
          row('Top width %', slider(m.top, (v, c) => patch({ top: v } as Partial<Modifier>, c), { min: 0, max: 200, step: 1 })),
          row('Bottom width %', slider(m.bottom, (v, c) => patch({ bottom: v } as Partial<Modifier>, c), { min: 0, max: 200, step: 1 })),
          row('Top offset %', slider(m.skew, (v, c) => patch({ skew: v } as Partial<Modifier>, c), { min: -100, max: 100, step: 1 })),
          el('div', { class: 'slt-hint' }, ['Narrow the top for a trapezoid, shift it for a parallelogram, or set it to 0 for a triangle.']),
        ];
      case 'edges':
        return [
          row('Subdivisions', slider(m.subdivisions, (v, c) => patch({ subdivisions: Math.round(v) } as Partial<Modifier>, c), { min: 0, max: 8, step: 1 })),
          row('Bend %', slider(m.bend, (v, c) => patch({ bend: v } as Partial<Modifier>, c), { min: -200, max: 200, step: 1 })),
          row('', checkbox('Smooth curves', m.smooth, (c) => patch({ smooth: c } as Partial<Modifier>))),
          el('div', { class: 'slt-hint' }, ['One subdivision bent inwards turns a pentagon into a star; bend outwards with smoothing for petals.']),
        ];
      default:
        return [];
    }
  }
}

function convertFill(fill: Fill, type: Fill['type'], layer: Layer): Fill {
  const base = fill.type === 'solid' ? fill.color : fill.type === 'none' ? (layer.type === 'shape' ? layer.color : '#e8e8e8') : fill.stops[0].color;
  const stops = fill.type === 'linear' || fill.type === 'radial' ? fill.stops : [{ offset: 0, color: base }, { offset: 1, color: '#000000' }];
  switch (type) {
    case 'solid':
      return { type: 'solid', color: base };
    case 'linear':
      return { type: 'linear', angle: fill.type === 'linear' ? fill.angle : 90, stops };
    case 'radial':
      return { type: 'radial', stops };
    case 'none':
      return { type: 'none' };
  }
}
