import {
  findLayer,
  referencedNames,
  anchorAttachable,
  anchorAxes,
  anchorLocalPoint,
  anchorUnits,
  anchorWorldPoint,
  applyToPoint,
  bindableTargets,
  invert,
  layerCentreWorld,
  layerLocalBounds,
  layerWorldMatrix,
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
  type BindingAnchor,
  type Layer,
  type SvgDocument,
  type Variable,
  updateLayer,
} from '../core';
import { el, isTypingInside } from './dom';
import type { SvgLayEditor } from './editor';
import { button, miniField, numberInput, row, section, select, slider, textInput } from './fields';
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
    this.el.addEventListener('focusin', (e) => {
      const key = (e.target as HTMLElement).dataset?.formula;
      if (key) this.lastFormula = key;
    });
  }

  render(): void {
    if (isTypingInside(this.el, this.editor.root instanceof ShadowRoot ? this.editor.root : document)) return;
    this.el.replaceChildren();
    this.el.appendChild(this.variablesSection());
    this.el.appendChild(this.bindingsSection());
    // What touching the selected layer does (hotspots: see interact-panel.ts).
    const sel = this.editor.selectedLayers();
    if (sel.length === 1) {
      const tryIt = this.tryItSection(sel[0].id);
      if (tryIt) this.el.appendChild(tryIt);
      this.el.appendChild(interactSection(this.editor, sel[0]));
    }
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
    // Functions in three lists; a click puts one into the formula being written (see insertSnippet).
    const groups: [string, string, 'math' | 'logic' | 'animation'][] = [['fn-math', 'Math', 'math'], ['fn-logic', 'Logic', 'logic'], ['fn-animation', 'Animation', 'animation']];
    for (const [id, title, group] of groups) {
      const refs = EXPR_REFERENCE.filter((r) => r.group === group);
      children.push(this.referenceList(id, title, refs.map((r) => ({ name: r.signature, label: r.label, insert: r.name ? r.signature : undefined })), refs.length));
    }
    children.push(this.referenceList('time', 'Time', TIME_VARIABLES.map((t) => ({ name: t.name, label: t.label, value: fmtValue(env[t.name]), insert: t.name }))));
    for (const g of this.editor.variableGroups) {
      children.push(this.referenceList(g.id, g.title, g.variables.map((v) => ({ name: v.name, label: v.label ?? '', value: fmtValue(env[v.name]), insert: /^[A-Za-z_]\w*$/.test(v.name) ? v.name : undefined }))));
    }
    return section('Variables', children, add);
  }

  /** The formula box last written in (its data-formula key), where clicked functions and names go. */
  private lastFormula: string | null = null;

  /**
   * Put a function (or a name) into the formula being written, at its caret, replacing what's
   * selected; a function's first argument is left selected, to type over. With no formula written in
   * yet, the first one in the panel.
   */
  private insertSnippet(text: string): void {
    const boxes = [...this.el.querySelectorAll<HTMLInputElement>('input[data-formula]')];
    const input = boxes.find((b) => b.dataset.formula === this.lastFormula) ?? boxes[0];
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const open = text.indexOf('(');
    let selA = start + text.length, selB = selA;
    if (open >= 0 && !text.endsWith('()')) {
      const close = text.search(/[,)]/);
      selA = start + open + 1;
      selB = start + (close > open ? close : text.length - 1);
    }
    input.focus();
    input.setSelectionRange(selA, selB);
    this.lastFormula = input.dataset.formula ?? null;
    input.dispatchEvent(new Event('input')); // its result updates; it's saved when you leave it
    // (a change made here doesn't raise "change" by itself on leaving: do it then)
    if (!input.dataset.pending) {
      input.dataset.pending = '1';
      input.addEventListener('blur', () => {
        delete input.dataset.pending;
        input.dispatchEvent(new Event('change'));
      }, { once: true });
    }
  }

  /** A collapsible read-only list of names (or signatures), descriptions and optional current values. */
  private referenceList(id: string, title: string, items: { name: string; label: string; value?: string; insert?: string }[], count = items.length): HTMLElement {
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
          items.map((t) => {
            const parts = [
              el('code', {}, [t.name]),
              el('span', { class: 'slt-grow' }, [t.label]),
              t.value === undefined ? null : el('span', { class: 'slt-time-value' }, [t.value]),
            ];
            if (!t.insert) return el('div', { class: 'slt-time-row', title: t.label }, parts);
            const b = el('button', { type: 'button', class: 'slt-time-row slt-snippet', title: `${t.label}. Click to put it into the formula you're writing.` }, parts);
            // (keep the formula's caret: don't take the focus on press)
            b.addEventListener('mousedown', (e) => e.preventDefault());
            b.addEventListener('click', () => this.insertSnippet(t.insert!));
            return b;
          }),
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
    const input = el('input', { class: 'slt-input slt-binding-expr', type: 'text', value: v.expression ?? '', spellcheck: false, placeholder: 'formula', dataset: { formula: `v:${v.id}` } });
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
    const input = el('input', { class: 'slt-input slt-binding-expr', type: 'text', value: b.expression, spellcheck: false, placeholder: 'formula', dataset: { formula: `b:${b.id}` } });
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
      const anchor: BindingAnchor = b.anchor ?? { x: 0.5, y: 0.5 };
      const setAnchor = (p: Partial<BindingAnchor>, commit: boolean, replace = false) => {
        const next: BindingAnchor = replace ? (p as BindingAnchor) : { ...anchor, ...p };
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
      const mode: 'box' | 'px' | 'layer' = anchor.layer ? 'layer' : anchor.unit === 'px' ? 'px' : 'box';
      const fields: HTMLElement[] = [];
      const doc = this.editor.document;
      const span = Math.max(doc.width, doc.height);
      if (mode === 'box') {
        if (axes.includes('x')) fields.push(row(`${what} X %`, slider(anchor.x * 100, (v, c) => setAnchor({ x: v / 100 }, c), { min: -50, max: 150, step: 1 })));
        if (axes.includes('y')) fields.push(row(`${what} Y %`, slider(anchor.y * 100, (v, c) => setAnchor({ y: v / 100 }, c), { min: -50, max: 150, step: 1 })));
      } else {
        const label = mode === 'layer' ? 'Offset' : what;
        fields.push(row(`${label} X`, slider(anchor.x, (v, c) => setAnchor({ x: v }, c), { min: -span, max: span, step: 0.5, digits: 1 })));
        fields.push(row(`${label} Y`, slider(anchor.y, (v, c) => setAnchor({ y: v }, c), { min: -span, max: span, step: 0.5, digits: 1 })));
      }
      const presets = el('div', { class: 'slt-anchor-presets' });
      const points: [number, number, string][] = [[0, 0, 'top left'], [0.5, 0, 'top'], [1, 0, 'top right'], [0, 0.5, 'left'], [0.5, 0.5, 'centre'], [1, 0.5, 'right'], [0, 1, 'bottom left'], [0.5, 1, 'bottom'], [1, 1, 'bottom right']];
      for (const [px, py, title] of points) {
        const dot = el('button', { class: 'slt-anchor-preset', type: 'button', title });
        if (Math.abs(anchor.x - px) < 1e-6 && Math.abs(anchor.y - py) < 1e-6) dot.dataset.active = '';
        dot.addEventListener('click', () => setAnchor({ x: axes.includes('x') ? px : anchor.x, y: axes.includes('y') ? py : anchor.y }, true));
        presets.appendChild(dot);
      }
      // The point where it is now, so switching how it's given doesn't move it.
      const ed = this.editor;
      const here = () => anchorWorldPoint(ed.document, layer.id, anchor, ed.resolvedDocument());
      const toLocalPx = (): BindingAnchor => {
        const w = here();
        const p = w ? applyToPoint(invert(layerWorldMatrix(ed.document, layer.id)), w) : anchorLocalPoint(layer, anchor);
        return { x: round1(p.x), y: round1(p.y), unit: 'px' };
      };
      if (mode === 'box') presets.style.display = '';
      else presets.style.display = 'none';
      card.appendChild(el('div', { class: 'slt-row slt-anchor-row' }, [el('label', {}, [what]), presets, el('div', { class: 'slt-grow' }, fields)]));
      if (anchorUnits(b.target)) {
        const unit = el('span', { class: 'slt-seg slt-anchor-unit', role: 'radiogroup', 'aria-label': `${what} given as` });
        const units: ['box' | 'px', string, string][] = [['box', 'of its box', 'X and Y as % of the layer box'], ['px', 'pixels', "X and Y in the layer's own units, from its middle: anywhere, even outside it"]];
        for (const [u, text, title] of units) {
          const btn = el('button', { type: 'button', role: 'radio', title, 'aria-checked': mode === u ? 'true' : 'false' }, [text]);
          if (mode === u) btn.dataset.active = '';
          btn.disabled = mode === 'layer';
          btn.addEventListener('click', () => {
            if (u === mode) return;
            if (u === 'px') setAnchor(toLocalPx(), true, true);
            else {
              const p = anchorLocalPoint(layer, anchor);
              const bx = layerLocalBounds(layer) ?? { x: 0, y: 0, width: 1, height: 1 };
              setAnchor({ x: round2(bx.width ? (p.x - bx.x) / bx.width : 0.5), y: round2(bx.height ? (p.y - bx.y) / bx.height : 0.5) }, true, true);
            }
          });
          unit.appendChild(btn);
        }
        card.appendChild(el('div', { class: 'slt-row' }, [el('label', {}, ['Given as']), unit]));
        const others = anchorAttachable(ed.document, layer.id);
        const attachOptions = [{ value: '', label: 'Nothing (its own)' }, ...others.map((l) => ({ value: l.id, label: `${l.name || l.id} · its centre` }))];
        const attach = select(anchor.layer && others.some((l) => l.id === anchor.layer) ? anchor.layer : '', attachOptions, (id) => {
          if (id) setAnchor({ x: 0, y: 0, layer: id }, true, true);
          else setAnchor(toLocalPx(), true, true);
        });
        attach.classList.add('slt-grow');
        card.appendChild(el('div', { class: 'slt-row' }, [el('label', {}, ['Attach to']), attach]));
        if (mode === 'layer') {
          const other = others.find((l) => l.id === anchor.layer);
          const c = other ? layerCentreWorld(ed.resolvedDocument(), other.id) : null;
          card.appendChild(el('div', { class: 'slt-hint' }, [other && c
            ? `Follows ${other.name || other.id} wherever it goes; X and Y move the ${what.toLowerCase()} away from its centre (in the drawing's units).`
            : 'The layer it was attached to is gone: it uses its own centre. Attach it to another, or pick Nothing.']));
        }
      }
      card.appendChild(el('div', { class: 'slt-hint' }, [mode === 'box'
        ? '0 % is the left/top of the layer box, 100 % the right/bottom. Drag the marker on the canvas while this tab is open.'
        : 'Drag the marker on the canvas while this tab is open.']));
    }
    if (!b.enabled) card.dataset.disabled = '';
    return card;
  }

  /** Try it: scrub a variable the layer's animation reads (not saved), with a motion trail on the canvas. */
  private tryItSection(id: string): HTMLElement | null {
    const ed = this.editor;
    const layer = findLayer(ed.document, id);
    if (!layer?.bindings?.length) return null;
    const vars = tryableVariables(ed.document, layer);
    if (!vars.length) return null;
    const cur = vars.find((v) => v.name === ed.tryVariable) ?? vars[0];
    const rows: HTMLElement[] = [];
    if (vars.length > 1) {
      const pick = select(cur.name, vars.map((v) => ({ value: v.name, label: v.name })), (name) => {
        ed.tryVariable = name;
        this.render();
        ed.refreshCanvas();
      });
      pick.classList.add('slt-grow');
      rows.push(el('div', { class: 'slt-row' }, [el('label', {}, ['Variable']), pick]));
    }
    const value = tryItValue(ed, cur.name);
    rows.push(row(cur.name, slider(value, (v) => ed.setTryValue(cur.name, v), { min: cur.min, max: cur.max, step: cur.step, digits: cur.step < 1 ? 2 : 0 })));
    const trail = el('input', { type: 'checkbox', role: 'switch', checked: ed.preferences.motionTrail });
    trail.addEventListener('change', () => ed.setPreferences({ motionTrail: trail.checked }));
    rows.push(el('div', { class: 'slt-row' }, [
      el('label', { class: 'slt-switch slt-try-trail' }, [trail, el('span', {}, ['Motion trail'])]),
      el('span', { class: 'slt-spacer' }),
      button('Reset', () => {
        ed.tryValues = {};
        this.render();
        ed.refreshCanvas();
      }, { cls: 'slt-small', title: 'Back to the real values' }),
    ]));
    rows.push(el('div', { class: 'slt-hint' }, ['Try values to see the animation: nothing is saved. The trail shows where the layer goes across the range.']));
    return section('Try it', rows);
  }
}

/**
 * Variables a layer's bindings read that can be tried with a slider: the
 * drawing's own (their ranges), and the clock's hours, minutes and seconds.
 */
export function tryableVariables(doc: SvgDocument, layer: Layer): { name: string; min: number; max: number; step: number }[] {
  const names = new Set<string>();
  for (const b of layer.bindings ?? []) {
    if (!b.enabled) continue;
    try {
      for (const n of referencedNames(b.expression)) names.add(n);
    } catch {
      /* a broken formula reads nothing */
    }
  }
  // Variables that are formulas of other variables: try what they're made from too.
  for (const v of doc.variables ?? []) {
    if (names.has(v.name) && v.expression?.trim()) {
      try {
        for (const n of referencedNames(v.expression)) names.add(n);
      } catch {
        /* ignore */
      }
    }
  }
  const clock: Record<string, [number, number, number]> = { seconds: [0, 59, 1], minutes: [0, 59, 1], hours12: [0, 11, 1], hours: [0, 23, 1], time: [0, 43200, 1] };
  const out: { name: string; min: number; max: number; step: number }[] = [];
  for (const v of doc.variables ?? []) {
    if (names.has(v.name) && !v.expression?.trim() && v.max > v.min) out.push({ name: v.name, min: v.min, max: Math.min(v.max, v.min + 1e6), step: v.step || (v.max - v.min) / 100 });
  }
  for (const [n, [min, max, step]] of Object.entries(clock)) if (names.has(n)) out.push({ name: n, min, max, step });
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function tryItValue(ed: SvgLayEditor, name: string): number {
  if (name in ed.tryValues) return ed.tryValues[name];
  return ed.env()[name] ?? 0;
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

