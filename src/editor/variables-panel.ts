import {
  anchorAxes,
  bindableTargets,
  createBinding,
  evaluate,
  evaluateVariable,
  EXPR_REFERENCE,
  removeBinding,
  removeVariable,
  setBinding,
  TIME_VARIABLES,
  upsertVariable,
  type Binding,
  type Layer,
  type SvgDocument,
  type Variable,
  updateLayer,
} from '../core';
import { el, isTypingInside } from './dom';
import type { SvgLayEditor } from './editor';
import { button, miniField, numberInput, row, section, slider, textInput } from './fields';
import { icon } from './icons';
import { interactSection } from './interact-panel';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Variables (document-level sliders), the time built-ins, and the selected
 * layer's bindings: expressions that drive its properties.
 */
export class VariablesPanel {
  readonly el: HTMLDivElement;
  /** Ids of expanded reference lists ('time' or a group id). */
  private expanded = new Set<string>();

  constructor(private editor: SvgLayEditor) {
    this.el = el('div', { class: 'slt-props slt-variables' });
  }

  render(): void {
    if (isTypingInside(this.el, this.editor.root instanceof ShadowRoot ? this.editor.root : document)) return;
    this.el.replaceChildren();
    this.el.appendChild(this.variablesSection());
    this.el.appendChild(this.bindingsSection());
    // What touching the selected layer does (hotspots: see interact-panel.ts).
    const sel = this.editor.selectedLayers();
    if (sel.length === 1) this.el.appendChild(interactSection(this.editor, sel[0]));
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
    const add = button([icon('plus'), 'Add variable'], () => this.editor.addVariable({ name: 'value1' }), { cls: 'slt-small' });
    const children: (HTMLElement | null)[] = [];
    // App-specific "+ add" buttons registered by the host.
    if (this.editor.variablePresets.length) {
      children.push(
        el(
          'div',
          { class: 'slt-btn-row slt-var-presets' },
          this.editor.variablePresets.map((p) => button([icon('plus'), p.label], () => this.editor.addVariable(p), { cls: 'slt-small', title: p.title ?? `Add a "${p.label}" variable` })),
        ),
      );
    }
    if (vars.length === 0) {
      children.push(el('div', { class: 'slt-hint' }, ['Variables are numbers you (or the app using this editor) can change, or formulas over time and other variables. Bind layer properties to formulas that use them.']));
    }
    for (const v of vars) children.push(this.variableCard(v, vars));

    // Reference lists: the formula functions, the time built-ins and any groups the host app registered.
    const env = this.editor.env();
    const functionCount = EXPR_REFERENCE.filter((r) => r.name).length;
    children.push(this.referenceList('functions', 'Functions', EXPR_REFERENCE.map((r) => ({ name: r.signature, label: r.label })), functionCount));
    children.push(this.referenceList('time', 'Time', TIME_VARIABLES.map((t) => ({ name: t.name, label: t.label, value: fmtValue(env[t.name]) }))));
    for (const g of this.editor.variableGroups) {
      children.push(this.referenceList(g.id, g.title, g.variables.map((v) => ({ name: v.name, label: v.label ?? '', value: fmtValue(env[v.name]) }))));
    }
    return section('Variables', children, add);
  }

  /** A collapsible read-only list of names (or signatures), descriptions and optional current values. */
  private referenceList(id: string, title: string, items: { name: string; label: string; value?: string }[], count = items.length): HTMLElement {
    const open = this.expanded.has(id);
    const toggle = button([icon(open ? 'chevronDown' : 'chevronRight'), title, el('span', { class: 'slt-ref-count' }, [String(count)])], () => {
      if (open) this.expanded.delete(id);
      else this.expanded.add(id);
      this.render();
    }, { cls: 'slt-small slt-ref-toggle' });
    const wrap = el('div', { class: 'slt-ref-list', dataset: { group: id } }, [toggle]);
    if (open) {
      wrap.appendChild(
        el(
          'div',
          { class: 'slt-time-list' },
          items.map((t) =>
            el('div', { class: 'slt-time-row', title: t.label }, [
              el('code', {}, [t.name]),
              el('span', { class: 'slt-grow' }, [t.label]),
              t.value === undefined ? null : el('span', { class: 'slt-time-value' }, [t.value]),
            ]),
          ),
        ),
      );
    }
    return wrap;
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
    const isFormula = v.expression !== undefined;
    const formulaBtn = button(el('span', { class: 'slt-fx' }, ['ƒ']), () => {
      if (isFormula) {
        // Back to a plain value: keep whatever the formula currently produces, within the range.
        let value = v.value;
        try {
          value = Math.min(v.max, Math.max(v.min, evaluateVariable(this.editor.document, v, this.editor.env())));
        } catch {
          /* keep the stored value */
        }
        const { expression: _drop, ...rest } = v;
        this.commitDoc((d) => upsertVariable(d, { ...rest, value: Number.isFinite(value) ? value : v.value }));
      } else {
        set({ expression: String(v.value) });
      }
    }, { title: isFormula ? 'Use a fixed value (slider)' : 'Compute the value with a formula', cls: 'slt-small slt-icon-only slt-formula-toggle' });
    if (isFormula) formulaBtn.dataset.active = '';
    const head = el('div', { class: 'slt-effect-head' }, [
      nameInput,
      formulaBtn,
      button(icon('close'), () => this.commitDoc((d) => removeVariable(d, v.id)), { title: 'Remove variable', cls: 'slt-small slt-icon-only slt-danger' }),
    ]);
    const body: (HTMLElement | null)[] = isFormula
      ? [this.variableFormula(v)]
      : [
          row('Value', slider(v.value, (val, c) => set({ value: val }, c), { min: v.min, max: v.max, step: v.step, digits: 3 })),
          el('div', { class: 'slt-grid3' }, [
            miniField('Min', numberInput(v.min, (n) => set({ min: Math.min(n, v.max), value: Math.max(n, v.value) }), { digits: 3 })),
            miniField('Max', numberInput(v.max, (n) => set({ max: Math.max(n, v.min), value: Math.min(n, v.value) }), { digits: 3 })),
            miniField('Step', numberInput(v.step, (n) => set({ step: Math.max(0.0001, n) }), { min: 0.0001, step: 0.01, digits: 4 })),
          ]),
        ];
    return el('div', { class: 'slt-effect slt-variable' }, [head, ...body]);
  }

  /** Formula input with a live result for a computed variable. */
  private variableFormula(v: Variable): HTMLElement {
    const doc = this.editor.document;
    const overrides = this.editor.env();
    const result = el('span', { class: 'slt-binding-result' });
    const showResult = (expr: string) => {
      try {
        result.textContent = `= ${fmtValue(evaluateVariable(doc, { ...v, expression: expr }, overrides))}`;
        result.classList.remove('slt-binding-error');
      } catch (err) {
        result.textContent = err instanceof Error ? err.message : String(err);
        result.classList.add('slt-binding-error');
      }
    };
    const input = el('input', { class: 'slt-input slt-binding-expr', type: 'text', value: v.expression ?? '', spellcheck: false, placeholder: 'formula' });
    input.addEventListener('input', () => showResult(input.value));
    input.addEventListener('change', () => this.commitDoc((d) => upsertVariable(d, { ...v, expression: input.value })));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      e.stopPropagation();
    });
    showResult(v.expression ?? '');
    return el('div', { class: 'slt-variable-formula' }, [
      el('div', { class: 'slt-row' }, [el('span', { class: 'slt-fx' }, ['ƒ']), input]),
      result,
      el('div', { class: 'slt-hint' }, ['Uses time, app variables and the variables above this one.']),
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
    const env = this.editor.env();
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
    const axes = anchorAxes(b.target);
    if (axes) {
      const anchor = b.anchor ?? { x: 0.5, y: 0.5 };
      const setAnchor = (p: Partial<{ x: number; y: number }>, commit: boolean) => {
        const next = { ...anchor, ...p };
        const fn = (l: Layer) => setBinding(l, { ...b, anchor: next });
        const store = this.editor.store;
        if (!commit) {
          store.beginTransaction();
          store.update((d) => updateLayerIn(d, layer.id, fn));
        } else {
          store.update((d) => updateLayerIn(d, layer.id, fn));
          store.endTransaction();
        }
      };
      const what = b.target === 'rotation' ? 'Pivot' : b.target === 'scale' ? 'Scale about' : 'Fixed edge';
      const fields: HTMLElement[] = [];
      if (axes.includes('x')) fields.push(row(`${what} X %`, slider(anchor.x * 100, (v, c) => setAnchor({ x: v / 100 }, c), { min: -50, max: 150, step: 1 })));
      if (axes.includes('y')) fields.push(row(`${what} Y %`, slider(anchor.y * 100, (v, c) => setAnchor({ y: v / 100 }, c), { min: -50, max: 150, step: 1 })));
      const presets = el('div', { class: 'slt-anchor-presets' });
      const points: [number, number, string][] = [[0, 0, 'top left'], [0.5, 0, 'top'], [1, 0, 'top right'], [0, 0.5, 'left'], [0.5, 0.5, 'centre'], [1, 0.5, 'right'], [0, 1, 'bottom left'], [0.5, 1, 'bottom'], [1, 1, 'bottom right']];
      for (const [px, py, title] of points) {
        const dot = el('button', { class: 'slt-anchor-preset', type: 'button', title });
        if (Math.abs(anchor.x - px) < 1e-6 && Math.abs(anchor.y - py) < 1e-6) dot.dataset.active = '';
        dot.addEventListener('click', () => setAnchor({ x: axes.includes('x') ? px : anchor.x, y: axes.includes('y') ? py : anchor.y }, true));
        presets.appendChild(dot);
      }
      card.appendChild(el('div', { class: 'slt-row slt-anchor-row' }, [el('label', {}, [what]), presets, el('div', { class: 'slt-grow' }, fields)]));
      card.appendChild(el('div', { class: 'slt-hint' }, ['0 % is the left/top of the layer box, 100 % the right/bottom. Drag the marker on the canvas while this tab is open.']));
    }
    if (!b.enabled) card.dataset.disabled = '';
    return card;
  }
}

function updateLayerIn(doc: SvgDocument, id: string, fn: (l: Layer) => Layer): SvgDocument {
  return updateLayer(doc, id, fn);
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

