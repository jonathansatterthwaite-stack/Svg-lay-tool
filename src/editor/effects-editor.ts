import { createEffect, EFFECT_DEFS, type Effect, type EffectType } from '../core';
import { el } from './dom';
import { allowedEffectTypes, type EditorFeatures } from './features';
import { button, colorField, row, slider, type Change } from './fields';
import { icon } from './icons';

/** Editable list of effects (used for layer effects and mask effects). */
export function effectsEditor(effects: Effect[], onChange: Change<Effect[]>, features: EditorFeatures): HTMLDivElement {
  const wrap = el('div', { class: 'slt-effects' });
  const allowed = allowedEffectTypes(features);

  const add = el('select', { class: 'slt-select' }, [el('option', { value: '' }, ['+ Add effect…'])]);
  for (const t of allowed) add.appendChild(el('option', { value: t }, [EFFECT_DEFS[t].label]));
  add.addEventListener('change', () => {
    if (!add.value) return;
    onChange([...effects, createEffect(add.value as EffectType)], true);
    add.value = '';
  });
  add.addEventListener('keydown', (e) => e.stopPropagation());
  wrap.appendChild(el('div', { class: 'slt-row' }, [add]));

  effects.forEach((effect, i) => {
    const def = EFFECT_DEFS[effect.type];
    const unsupported = !allowed.includes(effect.type);
    const replace = (patch: Partial<Effect>, commit: boolean) => {
      const next = effects.map((e, j) => (j === i ? ({ ...e, ...patch } as Effect) : e));
      onChange(next, commit);
    };
    const enabled = el('input', { type: 'checkbox', checked: effect.enabled, title: 'Enable' });
    enabled.addEventListener('change', () => replace({ enabled: enabled.checked }, true));
    const head = el('div', { class: 'slt-effect-head' }, [
      enabled,
      el('span', { class: 'slt-grow' }, [def.label]),
      button(icon('up'), () => onChange(swap(effects, i, i - 1), true), { title: 'Move up', cls: 'slt-small slt-icon-only' }),
      button(icon('down'), () => onChange(swap(effects, i, i + 1), true), { title: 'Move down', cls: 'slt-small slt-icon-only' }),
      button(icon('close'), () => onChange(effects.filter((_, j) => j !== i), true), {
        title: 'Remove',
        cls: 'slt-small slt-icon-only slt-danger',
      }),
    ]);
    const card = el('div', { class: 'slt-effect' }, [head]);
    if (!effect.enabled || unsupported) card.dataset.disabled = '';
    for (const r of effectParamRows(effect, (patch, c) => replace(patch, c), features)) card.appendChild(r);
    wrap.appendChild(card);
  });
  return wrap;
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  if (b < 0 || b >= arr.length) return arr;
  const out = [...arr];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

/** Parameter rows for one effect (used by the effects list and by effect modifiers). */
export function effectParamRows(effect: Effect, onChange: Change<Partial<Effect>>, features: EditorFeatures): HTMLElement[] {
  const def = EFFECT_DEFS[effect.type];
  const out: HTMLElement[] = [];
  if (!allowedEffectTypes(features).includes(effect.type)) {
    out.push(el('div', { class: 'slt-hint' }, ['Not available in the current colour mode; ignored when rendering.']));
  }
  for (const p of def.params) {
    const value = (effect as unknown as Record<string, number | string>)[p.key];
    if (p.kind === 'color') {
      const field = colorField(features.colorMode, String(value), (v, c) => onChange({ [p.key]: v } as Partial<Effect>, c));
      if (field) out.push(row(p.label, field));
    } else {
      out.push(
        row(
          p.label,
          slider(Number(value), (v, c) => onChange({ [p.key]: v } as Partial<Effect>, c), {
            min: p.min ?? 0,
            max: p.max ?? 100,
            step: p.step ?? 1,
          }),
        ),
      );
    }
  }
  return out;
}
