import {
  createBinding,
  createDocument,
  createEffect,
  createModifier,
  createShapeLayer,
  defaultShapeParams,
  getShape,
  insertLayer,
  renderDocument,
  vnodeToDom,
  type Binding,
  type Layer,
  type Modifier,
  type ShapeDefinition,
} from '../core';
import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { allowedEffectTypes } from './features';
import { button } from './fields';
import { icon } from './icons';

type Motion = 'still' | 'spin' | 'pulse' | 'blink';
type Look = 'outline' | 'rounded' | 'glow' | 'shadow';

/**
 * Adding a shape: a popup with a live preview and the three tool tabs in a sentence each (a short
 * tour), with their most useful settings to set before it goes in: its size and shape settings
 * (Layer), how it's drawn (Modifiers), and a first animation (Variables). Preferences → Canvas &
 * view → Shape popup turns it off (shapes then go straight in).
 */
export class ShapePopup {
  readonly el: HTMLDivElement;
  private def: ShapeDefinition;
  private size = 0.4;
  private params: Record<string, number>;
  private looks = new Set<Look>();
  private motion: Motion = 'still';
  private preview: HTMLDivElement;
  private body: HTMLDivElement;
  private timer: ReturnType<typeof setInterval> | null = null;
  private skip = false;

  constructor(private editor: SvgLayEditor, shapeId: string, private onClose: () => void) {
    this.def = getShape(shapeId);
    this.params = { ...defaultShapeParams(this.def) };
    this.preview = el('div', { class: 'slt-shapepop-preview', 'aria-hidden': 'true' });
    this.body = el('div', { class: 'slt-shapepop-body' });
    const skip = el('input', { type: 'checkbox' });
    skip.addEventListener('change', () => (this.skip = skip.checked));
    const panel = el('div', { class: 'slt-shapepop', role: 'dialog', 'aria-modal': 'true', 'aria-label': `New shape: ${this.def.name}` }, [
      el('div', { class: 'slt-prefs-head' }, [
        el('span', { class: 'slt-prefs-title' }, [`New shape: ${this.def.name}`]),
        button(icon('close'), () => this.close(), { title: 'Close', cls: 'slt-icon-only' }),
      ]),
      el('div', { class: 'slt-shapepop-scroll' }, [this.preview, this.body]),
      el('div', { class: 'slt-prefs-foot' }, [
        el('label', { class: 'slt-check slt-shapepop-skip', title: 'Shapes go straight in from now on (Preferences → Canvas & view turns this back on)' }, [skip, 'Skip this next time']),
        el('span', { class: 'slt-spacer' }),
        button([icon('plus'), 'Add to the drawing'], () => this.add(), { cls: 'slt-primary' }),
      ]),
    ]);
    this.el = el('div', { class: 'slt-prefs-backdrop' }, [panel]);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    this.render();
  }

  /** The shape as it will go in (size aside: addShape sizes it to the view). */
  private init(size: number): Partial<Layer> {
    const modifiers: Modifier[] = [];
    if (this.looks.has('rounded')) modifiers.push(createModifier('round', { radius: 20 }));
    if (this.looks.has('outline')) modifiers.push(createModifier('fill', { fill: { type: 'none' } }), createModifier('stroke', { color: null, width: Math.max(2, Math.round(size * 0.06)) }));
    if (this.looks.has('glow')) modifiers.push(createModifier('effect', { effect: createEffect('glow') }));
    if (this.looks.has('shadow')) modifiers.push(createModifier('effect', { effect: createEffect('shadow') }));
    const bindings: Binding[] = [];
    if (this.motion === 'spin') bindings.push(createBinding('rotation', 't * 60'));
    if (this.motion === 'pulse') bindings.push(createBinding('width', `${size} * (1 + 0.08 * sin(t * 4))`), createBinding('height', `${size} * (1 + 0.08 * sin(t * 4))`));
    if (this.motion === 'blink') bindings.push(createBinding('opacity', '0.65 + 0.35 * sin(t * 4)'));
    return { params: { ...this.params }, modifiers, ...(bindings.length ? { bindings } : {}) } as Partial<Layer>;
  }

  private drawPreview(): void {
    const s = 256 * this.size;
    let doc = createDocument({ width: 256, height: 256, background: null });
    doc = insertLayer(doc, createShapeLayer({ shape: this.def.id, x: 128, y: 128, width: s, height: s, color: this.editor.nextColor(0), ...this.init(s) }));
    const svg = vnodeToDom(renderDocument(doc, { ...this.editor.renderOptions(), background: false, idPrefix: 'slt-shapepop-' })) as SVGSVGElement;
    this.preview.replaceChildren(svg);
  }

  private render(): void {
    const ed = this.editor;
    const effects = allowedEffectTypes(ed.features);
    const chip = <T extends string>(value: T, active: boolean, label: string, onPick: (v: T) => void) => {
      const b = el('button', { type: 'button', 'aria-pressed': active ? 'true' : 'false' }, [label]);
      if (active) b.dataset.active = '';
      b.addEventListener('click', () => onPick(value));
      return b;
    };
    const step = (n: number, title: string, text: string, controls: HTMLElement[]) =>
      el('div', { class: 'slt-shapepop-step' }, [
        el('span', { class: 'slt-shapepop-n' }, [String(n)]),
        el('div', {}, [el('b', {}, [title]), el('small', {}, [text]), ...controls]),
      ]);
    const slider = (label: string, value: number, min: number, max: number, stepBy: number, onInput: (v: number) => void) => {
      const input = el('input', { class: 'slt-range', type: 'range', min, max, step: stepBy, value, 'aria-label': label });
      const out = el('span', { class: 'slt-prefs-value' }, [String(value)]);
      input.addEventListener('input', () => {
        out.textContent = String(Number(input.value));
        onInput(Number(input.value));
        this.drawPreview();
      });
      return el('div', { class: 'slt-shapepop-row' }, [el('label', {}, [label]), input, out]);
    };
    const looks: [Look, string][] = [['outline', 'Outline only'], ['rounded', 'Rounded'], ...(effects.includes('glow') ? [['glow', 'Glow'] as [Look, string]] : []), ...(effects.includes('shadow') ? [['shadow', 'Shadow'] as [Look, string]] : [])];
    const motions: [Motion, string][] = [['still', 'Still'], ['spin', 'Spin'], ['pulse', 'Pulse'], ['blink', 'Blink']];
    const redraw = () => {
      this.render();
    };
    this.body.replaceChildren(
      step(1, 'Layer', "Its size and shape settings. You can drag and turn it on the canvas later, and the Layer tab has the rest.", [
        slider('Size', Math.round(this.size * 100), 10, 90, 5, (v) => (this.size = v / 100)),
        ...(this.def.params ?? []).slice(0, 2).map((p) => slider(p.label, this.params[p.key], p.min, p.max, p.step, (v) => (this.params[p.key] = v))),
      ]),
      step(2, 'Modifiers', "Change how it's drawn without changing the shape: just an outline, rounded corners, a glow. The Modifiers tab has many more.", [
        el('div', { class: 'slt-chips' }, looks.map(([k, label]) => chip(k, this.looks.has(k), label, (v) => {
          if (this.looks.has(v)) this.looks.delete(v);
          else this.looks.add(v);
          redraw();
        }))),
      ]),
      ...(ed.features.variables ? [step(3, 'Variables', 'Make it move: tie a property to the time (or to a value). Pick one to start; the Variables tab can change it, or tie it to anything.', [
        el('div', { class: 'slt-chips' }, motions.map(([k, label]) => chip(k, this.motion === k, label, (v) => {
          this.motion = v;
          redraw();
        }))),
      ])] : []),
    );
    this.drawPreview();
    if (this.timer) clearInterval(this.timer);
    this.timer = this.motion === 'still' ? null : setInterval(() => this.drawPreview(), 50);
  }

  private add(): void {
    const ed = this.editor;
    const doc = ed.document;
    const size = Math.round(Math.min(doc.width, doc.height) * this.size);
    ed.addShape(this.def.id, { width: size, height: size, ...this.init(size) });
    if (this.skip) ed.setPreferences({ shapePopup: false });
    this.close();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.el.remove();
    this.onClose();
  }
}
