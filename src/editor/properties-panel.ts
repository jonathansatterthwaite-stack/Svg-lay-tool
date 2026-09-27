import {
  BLEND_MODES,
  createMaskSettings,
  getShape,
  listShapes,
  defaultShapeParams,
  type BlendMode,
  type Fill,
  type GroupLayer,
  type Layer,
  type MaskMode,
  type ShapeLayer,
  rotateShape,
  setShapeBoxSize,
  shapeBox,
  updateLayer,
} from '../core';
import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { effectsEditor } from './effects-editor';
import { button, checkbox, colorField, miniField, numberInput, row, section, select, slider, textInput } from './fields';
import { icon } from './icons';

export type PropertiesMode = 'auto' | 'document' | 'layer';

export class PropertiesPanel {
  readonly el: HTMLDivElement;
  /** `auto` shows canvas settings when nothing is selected; the others pin one view (mobile tabs). */
  mode: PropertiesMode = 'auto';

  constructor(private editor: SvgLayEditor) {
    this.el = el('div', { class: 'slt-props' });
  }

  render(): void {
    const active = this.activeElement();
    if (active && this.el.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) {
      // Never yank an input out from under the user's cursor; the next commit re-renders.
      if ((active as HTMLInputElement).type !== 'checkbox') return;
    }
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
  }

  private activeElement(): Element | null {
    const root = this.editor.root;
    return root instanceof ShadowRoot ? root.activeElement : document.activeElement;
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
        el('div', { class: 'slt-hint' }, ['Drag to move · handles to resize (Shift keeps ratio, Alt from centre) · top handle rotates (Shift snaps 15°)']),
        el('div', { class: 'slt-hint' }, [`${f.groups ? 'Ctrl+G group · Ctrl+Shift+G ungroup · ' : ''}Ctrl+D duplicate · [ ] reorder · Del delete · Ctrl+Z / Ctrl+Y undo/redo`]),
        el('div', { class: 'slt-hint' }, ['Double-click a group to select a layer inside it. Shift+click adds to the selection.']),
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
    if (layer.type === 'shape') {
      const box = shapeBox(layer);
      transformChildren.push(
        el('div', { class: 'slt-grid2' }, [
          miniField('W', numberInput(box.width, (v) => apply<ShapeLayer>((l) => setShapeBoxSize(l, Math.max(1, v), shapeBox(l).height), true), { min: 1 })),
          miniField('H', numberInput(box.height, (v) => apply<ShapeLayer>((l) => setShapeBoxSize(l, shapeBox(l).width, Math.max(1, v)), true), { min: 1 })),
        ]),
      );
    } else {
      transformChildren.push(
        row('Scale', slider(layer.scale, (v, c) => patch<GroupLayer>({ scale: Math.max(0.01, v) }, c), { min: 0.05, max: 5, step: 0.01 })),
      );
    }
    transformChildren.push(
      row(
        'Rotation',
        slider(layer.rotation, (v, c) => apply((l) => (l.type === 'shape' ? rotateShape(l, v) : { ...l, rotation: v }), c), { min: -180, max: 180, step: 1 }),
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
      this.el.appendChild(section('Fill', this.fillFields(layer, apply)));
      if (f.strokes) this.el.appendChild(section('Stroke', this.strokeFields(layer, apply)));
    }

    // Effects
    if (f.effects !== false) {
      this.el.appendChild(section('Effects', [effectsEditor(layer.effects, (effects, c) => patch({ effects }, c), f)]));
    }

    // Mask
    if (!f.masks) return;
    const maskChildren: HTMLElement[] = [
      checkbox('Use as mask for layers below', !!layer.mask, (c) => patch({ mask: c ? createMaskSettings() : null })),
    ];
    if (layer.mask) {
      const mask = layer.mask;
      const setMask = (p: Partial<typeof mask>, commit = true) => apply((l) => ({ ...l, mask: { ...l.mask!, ...p } }), commit);
      maskChildren.push(
        row(
          'Mode',
          select<MaskMode>(
            mask.mode,
            [
              { value: 'clip', label: 'Clip: show below only inside' },
              { value: 'clip-inverse', label: 'Clip inverse: hide inside' },
              { value: 'filter', label: 'Effect region: apply effects inside' },
            ],
            (v) => setMask({ mode: v }),
          ),
        ),
        row('', checkbox('Also draw the shape itself', mask.showShape, (c) => setMask({ showShape: c }))),
        el('div', { class: 'slt-hint' }, [
          mask.mode === 'filter'
            ? 'The layers below stay visible; inside this shape the effects below are applied to them.'
            : 'Effects below are applied to the clipped result. Add a Blur on the layer itself for a soft edge.',
        ]),
      );
      if (f.effects !== false) {
        maskChildren.push(
          el('div', { class: 'slt-section-head' }, ['Effects on layers below']),
          effectsEditor(mask.effects, (effects, c) => setMask({ effects }, c), f),
        );
      }
    }
    this.el.appendChild(section('Mask', maskChildren));
  }

  private fillFields(layer: ShapeLayer, apply: <T extends Layer>(fn: (l: T) => T, commit?: boolean) => void): HTMLElement[] {
    const fill = layer.fill;
    const features = this.editor.features;
    const mode = features.colorMode;
    const setFill = (f: Fill, commit = true) => apply<ShapeLayer>((l) => ({ ...l, fill: f }), commit);
    const types: { value: Fill['type']; label: string }[] = [{ value: 'solid', label: mode === 'monochrome' ? 'Filled' : 'Solid' }];
    if (features.gradients) {
      types.push({ value: 'linear', label: 'Linear gradient' }, { value: 'radial', label: 'Radial gradient' });
    }
    types.push({ value: 'none', label: 'None' });
    // A gradient loaded from a file while gradients are disabled still shows so it can be changed.
    if (!types.some((t) => t.value === fill.type)) types.push({ value: fill.type, label: `${fill.type} gradient` });
    const out: HTMLElement[] = [row('Type', select<Fill['type']>(fill.type, types, (v) => setFill(convertFill(fill, v))))];
    if (fill.type === 'solid') {
      const field = colorField(mode, fill.color, (v, c) => setFill({ type: 'solid', color: v }, c));
      if (field) out.push(row('Colour', field));
    } else if (fill.type === 'linear' || fill.type === 'radial') {
      fill.stops.forEach((stop, i) => {
        const setStop = (p: Partial<typeof stop>, c: boolean) =>
          setFill({ ...fill, stops: fill.stops.map((s, j) => (j === i ? { ...s, ...p } : s)) }, c);
        const field = colorField(mode, stop.color, (v, c) => setStop({ color: v }, c));
        if (field) out.push(row(`Stop ${i + 1}`, field));
        out.push(row('Position', slider(stop.offset, (v, c) => setStop({ offset: v }, c), { min: 0, max: 1, step: 0.01 })));
      });
      out.push(
        el('div', { class: 'slt-btn-row' }, [
          button('Add stop', () => setFill({ ...fill, stops: [...fill.stops, { offset: 1, color: '#ffffff' }] }), { cls: 'slt-small' }),
          fill.stops.length > 2
            ? button('Remove last', () => setFill({ ...fill, stops: fill.stops.slice(0, -1) }), { cls: 'slt-small' })
            : el('span'),
        ]),
      );
      if (fill.type === 'linear') {
        out.push(row('Angle', slider(fill.angle, (v, c) => setFill({ ...fill, angle: v }, c), { min: 0, max: 360, step: 1 })));
      }
    }
    return out;
  }

  private strokeFields(layer: ShapeLayer, apply: <T extends Layer>(fn: (l: T) => T, commit?: boolean) => void): HTMLElement[] {
    const stroke = layer.stroke;
    const setStroke = (s: ShapeLayer['stroke'], commit = true) => apply<ShapeLayer>((l) => ({ ...l, stroke: s }), commit);
    const out: HTMLElement[] = [
      row('', checkbox('Enable stroke', !!stroke, (c) => setStroke(c ? { color: '#ffffff', width: 4 } : null))),
    ];
    if (stroke) {
      const field = colorField(this.editor.features.colorMode, stroke.color, (v, c) => setStroke({ ...stroke, color: v }, c));
      if (field) out.push(row('Colour', field));
      out.push(row('Width', slider(stroke.width, (v, c) => setStroke({ ...stroke, width: v }, c), { min: 0, max: 100, step: 0.5 })));
    }
    return out;
  }
}

function convertFill(fill: Fill, type: Fill['type']): Fill {
  const base = fill.type === 'solid' ? fill.color : fill.type === 'none' ? '#e8e8e8' : fill.stops[0].color;
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
