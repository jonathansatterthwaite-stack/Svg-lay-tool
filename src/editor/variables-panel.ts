import {
  bindableTargets,
  createBinding,
  createVariable,
  documentEnv,
  evaluate,
  EXPR_FUNCTION_NAMES,
  removeBinding,
  removeVariable,
  setBinding,
  TIME_VARIABLES,
  upsertVariable,
  type Binding,
  type Layer,
  type Variable,
} from '../core';
import { el, isTypingInside } from './dom';
import type { SvgLayEditor } from './editor';
import { button, miniField, numberInput, row, section, slider, textInput } from './fields';
import { icon } from './icons';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Variables (document-level sliders), the time built-ins, and the selected
 * layer's bindings: expressions that drive its properties.
 */
export class VariablesPanel {
  readonly el: HTMLDivElement;
  private showTime = false;

  constructor(private editor: SvgLayEditor) {
    this.el = el('div', { class: 'slt-props slt-variables' });
  }

  render(): void {
    if (isTypingInside(this.el, this.editor.root instanceof ShadowRoot ? this.editor.root : document)) return;
    this.el.replaceChildren();
    this.el.appendChild(this.variablesSection());
    this.el.appendChild(this.bindingsSection());
  }

  // -------------------------------------------------------------------------

  private commitDoc(fn: (d: typeof this.editor.document) => typeof this.editor.document, commit = true): void {
    const store = this.editor.store;
    if (!commit) {
      store.beginTransaction();
      store.update(fn);
    } else {
      store.update(fn);
      store.endTransaction();
    }
  }

  private variablesSection(): HTMLElement {
    const doc = this.editor.document;
    const vars = doc.variables ?? [];
    const add = button([icon('plus'), 'Add variable'], () => {
      const names = new Set(vars.map((v) => v.name));
      let i = 1;
      while (names.has(`value${i}`)) i++;
      this.commitDoc((d) => upsertVariable(d, createVariable({ name: `value${i}` })));
    }, { cls: 'slt-small' });
    const children: (HTMLElement | null)[] = [];
    if (vars.length === 0) {
      children.push(el('div', { class: 'slt-hint' }, ['Variables are numbers you (or the app using this editor) can change. Bind layer properties to formulas that use them.']));
    }
    for (const v of vars) children.push(this.variableCard(v, vars));

    const toggle = button([icon(this.showTime ? 'chevronDown' : 'chevronRight'), 'Time built-ins'], () => {
      this.showTime = !this.showTime;
      this.render();
    }, { cls: 'slt-small' });
    children.push(el('div', { class: 'slt-btn-row' }, [toggle]));
    if (this.showTime) {
      const env = documentEnv(doc);
      children.push(
        el(
          'div',
          { class: 'slt-time-list' },
          TIME_VARIABLES.map((t) =>
            el('div', { class: 'slt-time-row', title: t.label }, [
              el('code', {}, [t.name]),
              el('span', { class: 'slt-grow' }, [t.label]),
              el('span', { class: 'slt-time-value' }, [fmtValue(env[t.name])]),
            ]),
          ),
        ),
      );
      children.push(el('div', { class: 'slt-hint' }, [`Functions: ${EXPR_FUNCTION_NAMES.join(', ')}. Constants: pi, e. Comparisons give 1 or 0; use cond ? a : b.`]));
    }
    return section('Variables', children, add);
  }

  private variableCard(v: Variable, all: Variable[]): HTMLElement {
    const set = (patch: Partial<Variable>, commit = true) => this.commitDoc((d) => upsertVariable(d, { ...v, ...patch }), commit);
    const nameInput = textInput(v.name, (name) => {
      const clean = name.trim();
      if (!IDENT.test(clean) || all.some((o) => o.id !== v.id && o.name === clean)) {
        this.render(); // reject: revert display
        return;
      }
      set({ name: clean });
    });
    nameInput.classList.add('slt-var-name');
    const head = el('div', { class: 'slt-effect-head' }, [
      nameInput,
      button(icon('close'), () => this.commitDoc((d) => removeVariable(d, v.id)), { title: 'Remove variable', cls: 'slt-small slt-icon-only slt-danger' }),
    ]);
    return el('div', { class: 'slt-effect slt-variable' }, [
      head,
      row('Value', slider(v.value, (val, c) => set({ value: val }, c), { min: v.min, max: v.max, step: v.step, digits: 3 })),
      el('div', { class: 'slt-grid3' }, [
        miniField('Min', numberInput(v.min, (n) => set({ min: Math.min(n, v.max), value: Math.max(n, v.value) }), { digits: 3 })),
        miniField('Max', numberInput(v.max, (n) => set({ max: Math.max(n, v.min), value: Math.min(n, v.value) }), { digits: 3 })),
        miniField('Step', numberInput(v.step, (n) => set({ step: Math.max(0.0001, n) }), { min: 0.0001, step: 0.01, digits: 4 })),
      ]),
    ]);
  }

  // -------------------------------------------------------------------------

  private bindingsSection(): HTMLElement {
    const layers = this.editor.selectedLayers();
    if (layers.length !== 1) {
      return section('Bindings', [el('div', { class: 'slt-hint' }, [layers.length ? 'Select a single layer to bind its properties.' : 'Select a layer to bind its properties to formulas.'])]);
    }
    const layer = layers[0];
    const targets = bindableTargets(layer);
    const bindings = layer.bindings ?? [];
    const used = new Set(bindings.map((b) => b.target));
    const addSel = el('select', { class: 'slt-select' }, [el('option', { value: '' }, ['+ Bind a property…'])]);
    for (const t of targets) if (!used.has(t.key)) addSel.appendChild(el('option', { value: t.key }, [t.label]));
    addSel.addEventListener('change', () => {
      const target = addSel.value;
      addSel.value = '';
      if (!target) return;
      const t = targets.find((x) => x.key === target);
      const current = currentValue(layer, target);
      const expr = t?.kind === 'boolean' ? (current ? 'true' : 'false') : String(current ?? 0);
      this.editor.updateLayer(layer.id, (l) => setBinding(l, createBinding(target, expr)));
    });
    addSel.addEventListener('keydown', (e) => e.stopPropagation());
    const children: HTMLElement[] = [el('div', { class: 'slt-row' }, [addSel])];
    if (bindings.length === 0) {
      children.push(el('div', { class: 'slt-hint' }, ['No bindings. Example: bind Rotation to  hours12 * 30 + minutes / 2  for an hour hand, or Visible to  count >= 3 .']));
    }
    const env = documentEnv(this.editor.document, this.editor.variableOverrides);
    for (const b of bindings) children.push(this.bindingCard(layer, b, targets, env));
    return section(`Bindings · ${layer.name}`, children);
  }

  private bindingCard(layer: Layer, b: Binding, targets: ReturnType<typeof bindableTargets>, env: Record<string, number>): HTMLElement {
    const t = targets.find((x) => x.key === b.target);
    const patch = (p: Partial<Binding>) => this.editor.updateLayer(layer.id, (l) => setBinding(l, { ...b, ...p }));
    const enabled = el('input', { type: 'checkbox', checked: b.enabled, title: 'Enable' });
    enabled.addEventListener('change', () => patch({ enabled: enabled.checked }));
    const head = el('div', { class: 'slt-effect-head' }, [
      enabled,
      el('span', { class: 'slt-grow' }, [t?.label ?? b.target]),
      button(icon('close'), () => this.editor.updateLayer(layer.id, (l) => removeBinding(l, b.id)), { title: 'Remove binding', cls: 'slt-small slt-icon-only slt-danger' }),
    ]);
    const result = el('span', { class: 'slt-binding-result' });
    const showResult = (expr: string) => {
      try {
        const v = evaluate(expr, env);
        result.textContent = t?.kind === 'boolean' ? (v ? '= visible' : '= hidden') : `= ${fmtValue(v)}`;
        result.classList.remove('slt-binding-error');
      } catch (err) {
        result.textContent = err instanceof Error ? err.message : String(err);
        result.classList.add('slt-binding-error');
      }
    };
    const input = el('input', { class: 'slt-input slt-binding-expr', type: 'text', value: b.expression, spellcheck: false, placeholder: 'formula' });
    input.addEventListener('input', () => showResult(input.value));
    input.addEventListener('change', () => patch({ expression: input.value }));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      e.stopPropagation();
    });
    showResult(b.expression);
    const card = el('div', { class: 'slt-effect slt-binding' }, [head, el('div', { class: 'slt-row' }, [el('span', { class: 'slt-fx' }, ['ƒ']), input]), result]);
    if (!b.enabled) card.dataset.disabled = '';
    return card;
  }
}

function fmtValue(v: number | undefined): string {
  if (v === undefined) return '';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

/** Current (unbound) value of a target, used as the starting expression. */
function currentValue(layer: Layer, target: string): number | boolean | undefined {
  const parts = target.split('.');
  if (parts[0] === 'modifiers') {
    const m = (layer.modifiers ?? []).find((x) => x.id === parts[1]) as unknown as Record<string, unknown> | undefined;
    if (!m) return undefined;
    const v = parts[2] === 'effect' ? (m.effect as Record<string, unknown>)[parts[3]] : m[parts[2]];
    return typeof v === 'number' || typeof v === 'boolean' ? v : undefined;
  }
  if (parts[0] === 'params' && layer.type === 'shape') return layer.params[parts[1]];
  const v = (layer as unknown as Record<string, unknown>)[target];
  return typeof v === 'number' || typeof v === 'boolean' ? v : undefined;
}

