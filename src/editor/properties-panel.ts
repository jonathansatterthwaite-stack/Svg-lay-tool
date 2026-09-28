import {
  BLEND_MODES,
  getShape,
  listShapes,
  defaultShapeParams,
  type BlendMode,
  type GroupLayer,
  type Layer,
  type ShapeLayer,
  layerBox,
  rotateLayer,
  setLayerBoxSize,
  updateLayer,
} from '../core';
import { el, isTypingInside } from './dom';
import type { SvgLayEditor } from './editor';
import { button, checkbox, colorField, miniField, numberInput, row, section, select, slider, textInput } from './fields';
import { icon } from './icons';
import { ModifiersPanel } from './modifiers-panel';
import { VariablesPanel } from './variables-panel';

export type PropertiesMode = 'auto' | 'document' | 'layer';

export class PropertiesPanel {
  readonly el: HTMLDivElement;
  /** `auto` shows canvas settings when nothing is selected; the others pin one view (mobile tabs). */
  mode: PropertiesMode = 'auto';
  /** In `auto` mode the modifiers stack is shown under the layer settings (desktop). */
  private modifiers: ModifiersPanel;
  private variables: VariablesPanel;

  constructor(private editor: SvgLayEditor) {
    this.el = el('div', { class: 'slt-props' });
    this.modifiers = new ModifiersPanel(editor);
    this.variables = new VariablesPanel(editor);
  }

  render(): void {
    // Never yank a text field out from under the user's cursor; the next commit re-renders.
    if (isTypingInside(this.el, this.editor.root instanceof ShadowRoot ? this.editor.root : document)) return;
    this.el.replaceChildren();
    const layers = this.editor.selectedLayers();
    if (this.mode === 'document') {
      this.renderDocument();
      return;
    }
    if (layers.length === 0) {
      if (this.mode === 'layer') {
        this.el.appendChild(
          section('Layer', [el('div', { class: 'slt-hint' }, ['Nothing selected. Tap a shape on the canvas or pick one in the Layers tab.'])]),
        );
      } else this.renderDocument();
    } else if (layers.length === 1) this.renderLayer(layers[0]);
    else this.renderMulti(layers);
    if (this.mode === 'auto' && layers.length === 1) {
      this.modifiers.render();
      this.el.appendChild(this.modifiers.el);
    }
    if (this.mode === 'auto' && this.editor.features.variables) {
      this.variables.render();
      this.el.appendChild(this.variables.el);
    }
  }

  // -------------------------------------------------------------------------

  private renderDocument(): void {
    const doc = this.editor.document;
    const commitDoc = (patch: Partial<typeof doc>) => this.editor.store.commit((d) => ({ ...d, ...patch }));
    const f = this.editor.features;
    const bgTransparent = doc.background === null;
    const canvasChildren: (HTMLElement | null)[] = [];
    if (f.canvasSize) {
      canvasChildren.push(
        el('div', { class: 'slt-grid2' }, [
          miniField('W', numberInput(doc.width, (v) => commitDoc({ width: Math.max(1, Math.round(v)) }), { min: 1, max: 8192 })),
          miniField('H', numberInput(doc.height, (v) => commitDoc({ height: Math.max(1, Math.round(v)) }), { min: 1, max: 8192 })),
        ]),
      );
    }
    if (f.background) {
      canvasChildren.push(
        row('Background', checkbox('Transparent', bgTransparent, (c) => commitDoc({ background: c ? null : f.colorMode === 'monochrome' ? f.monoColor : '#1a1a1a' }))),
      );
      if (!bgTransparent) {
        const field = colorField(f.colorMode, doc.background ?? '#000000', (v, commit) => this.applyDoc((d) => ({ ...d, background: v }), commit));
        if (field) canvasChildren.push(row('Colour', field));
      }
    }
    if (f.colorMode !== 'full') {
      canvasChildren.push(
        el('div', { class: 'slt-hint' }, [
          f.colorMode === 'monochrome'
            ? 'Monochrome mode: every shape is drawn in one colour. Build the image with shapes, opacity and clip masks.'
            : 'Grayscale mode: colours are picked as lightness values.',
        ]),
      );
    }
    canvasChildren.push(el('div', { class: 'slt-hint' }, ['Select a layer to edit it, or pick a shape from the library to add one.']));
    this.el.appendChild(section('Canvas', canvasChildren));
    this.el.appendChild(
      section('Shortcuts', [
        el('div', { class: 'slt-hint' }, ['Hold a layer to pick it up · handles resize along the canvas axes (Shift keeps ratio, Alt from centre) · ring handle rotates (Shift snaps 15°)']),
        el('div', { class: 'slt-hint' }, [`${f.groups ? 'Ctrl+G group · Ctrl+Shift+G ungroup · ' : ''}Ctrl+D duplicate · [ ] reorder · Del delete · Ctrl+Z / Ctrl+Y undo/redo`]),
        el('div', { class: 'slt-hint' }, ['Select layers in the strip or the Layers panel; the corner button on a group thumbnail opens it. Shift+click adds to the selection.']),
      ]),
    );
  }

  private applyDoc(fn: (d: typeof this.editor.document) => typeof this.editor.document, commit: boolean): void {
    const store = this.editor.store;
    if (!commit) {
      store.beginTransaction();
      store.update(fn);
    } else {
      store.update(fn);
      store.endTransaction();
    }
  }

  // -------------------------------------------------------------------------

  private renderMulti(layers: Layer[]): void {
    this.el.appendChild(
      section(`${layers.length} layers selected`, [
        el('div', { class: 'slt-btn-row' }, [
          this.editor.features.groups ? button([icon('group'), 'Group'], () => this.editor.groupSelection(), { title: 'Group (Ctrl+G)' }) : null,
          button([icon('duplicate'), 'Duplicate'], () => this.editor.duplicateSelection()),
          button([icon('trash'), 'Delete'], () => this.editor.deleteSelection(), { cls: 'slt-danger' }),
        ]),
        this.editor.features.opacity
          ? row(
              'Opacity',
              slider(avg(layers.map((l) => l.opacity)), (v, c) => this.applyAll((l) => ({ ...l, opacity: v }), c), {
                min: 0,
                max: 1,
                step: 0.01,
              }),
            )
          : null,
        this.editor.features.blendModes
          ? row(
              'Blend',
              select(commonValue(layers.map((l) => l.blendMode)) ?? 'normal', BLEND_MODES.map((b) => ({ value: b, label: b })), (v) =>
                this.applyAll((l) => ({ ...l, blendMode: v }), true),
              ),
            )
          : null,
        el('div', { class: 'slt-hint' }, ['Drag to move all selected layers together. Resize and rotate work on a single layer or a group.']),
      ]),
    );
  }

  private applyAll(fn: (l: Layer) => Layer, commit: boolean): void {
    const ids = this.editor.selection;
    this.applyDoc((d) => {
      let out = d;
      for (const id of ids) out = updateLayer(out, id, fn);
      return out;
    }, commit);
  }

  // -------------------------------------------------------------------------

  private renderLayer(layer: Layer): void {
    const id = layer.id;
    const f = this.editor.features;
    const apply = <T extends Layer>(fn: (l: T) => T, commit = true) => this.applyDoc((d) => updateLayer<T>(d, id, fn), commit);
    const patch = <T extends Layer>(p: Partial<T>, commit = true) => apply<T>((l) => ({ ...l, ...p }), commit);

    // Layer
    const transformChildren: HTMLElement[] = [
      row('Name', textInput(layer.name, (v) => patch({ name: v || layer.name }))),
      el('div', { class: 'slt-grid2' }, [
        miniField('X', numberInput(layer.x, (v) => patch({ x: v }))),
        miniField('Y', numberInput(layer.y, (v) => patch({ y: v }))),
      ]),
    ];
    const box = layerBox(layer);
    if (box) {
      transformChildren.push(
        el('div', { class: 'slt-grid2' }, [
          miniField('W', numberInput(box.width, (v) => apply((l) => setLayerBoxSize(l, Math.max(1, v), layerBox(l)?.height ?? 1), true), { min: 1 })),
          miniField('H', numberInput(box.height, (v) => apply((l) => setLayerBoxSize(l, layerBox(l)?.width ?? 1, Math.max(1, v)), true), { min: 1 })),
        ]),
      );
    }
    if (layer.type === 'group') {
      transformChildren.push(
        row('Scale', slider(layer.scale, (v, c) => patch<GroupLayer>({ scale: Math.max(0.01, v) }, c), { min: 0.05, max: 5, step: 0.01 })),
      );
    }
    transformChildren.push(
      row(
        'Rotation',
        slider(layer.rotation, (v, c) => apply((l) => rotateLayer(l, v), c), { min: -180, max: 180, step: 1 }),
      ),
    );
    if (layer.type === 'shape') {
      transformChildren.push(
        el('div', { class: 'slt-btn-row' }, [
          button([icon('flipH'), 'Flip H'], () => patch<ShapeLayer>({ flipX: !layer.flipX })),
          button([icon('flipV'), 'Flip V'], () => patch<ShapeLayer>({ flipY: !layer.flipY })),
        ]),
      );
    }
    if (layer.type === 'shape') {
      const field = colorField(f.colorMode, layer.color, (v, c) => patch<ShapeLayer>({ color: v }, c));
      if (field) transformChildren.push(row('Colour', field));
    }
    if (f.opacity) {
      transformChildren.push(row('Opacity', slider(layer.opacity, (v, c) => patch({ opacity: v }, c), { min: 0, max: 1, step: 0.01 })));
    }
    if (f.blendModes) {
      transformChildren.push(
        row('Blend', select<BlendMode>(layer.blendMode, BLEND_MODES.map((b) => ({ value: b, label: b })), (v) => patch({ blendMode: v }))),
      );
    }
    transformChildren.push(
      el('div', { class: 'slt-btn-row' }, [
        checkbox('Visible', layer.visible, (c) => patch({ visible: c })),
        checkbox('Locked', layer.locked, (c) => patch({ locked: c })),
      ]),
    );
    const bound = (layer.bindings ?? []).filter((b) => b.enabled);
    if (bound.length) {
      transformChildren.push(
        el('div', { class: 'slt-hint slt-bound-hint' }, [
          'ƒ Driven by formulas: ',
          bound.map((b) => `${b.target} = ${b.expression}`).join(' · '),
          '. Edits to those properties are overridden while the binding is enabled.',
        ]),
      );
    }
    this.el.appendChild(section(layer.type === 'group' ? 'Group' : 'Layer', transformChildren));

    // Shape
    if (layer.type === 'shape') {
      const def = getShape(layer.shape);
      const shapeChildren: HTMLElement[] = [
        row(
          'Shape',
          select(
            layer.shape,
            listShapes().map((s) => ({ value: s.id, label: s.name })),
            (v) => {
              const nd = getShape(v);
              patch<ShapeLayer>({ shape: nd.id, params: { ...defaultShapeParams(nd), ...pickKnown(layer.params, nd) } });
            },
          ),
        ),
      ];
      for (const p of def.params ?? []) {
        shapeChildren.push(
          row(
            p.label,
            slider(layer.params[p.key] ?? p.default, (v, c) => apply<ShapeLayer>((l) => ({ ...l, params: { ...l.params, [p.key]: v } }), c), {
              min: p.min,
              max: p.max,
              step: p.step,
            }),
          ),
        );
      }
      this.el.appendChild(section('Shape', shapeChildren));
    }
  }

}

function pickKnown(params: Record<string, number>, def: ReturnType<typeof getShape>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of def.params ?? []) if (p.key in params) out[p.key] = params[p.key];
  return out;
}

function avg(ns: number[]): number {
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
}

function commonValue<T>(vs: T[]): T | null {
  return vs.every((v) => v === vs[0]) ? vs[0] : null;
}
