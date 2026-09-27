import { locateLayer, renderDocument, vnodeToDom, type Layer, type SvgDocument } from '../core';
import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { icon } from './icons';

let stripCounter = 0;

/**
 * Thin vertical bar beside the canvas with a thumbnail per layer. Tapping a
 * thumbnail selects that layer, which makes it the only thing the canvas
 * handles act on; this avoids grabbing the wrong layer while editing.
 *
 * It lists the siblings of the current selection (the root layers, or the
 * children of the group the selection lives in) with an "up" button to leave
 * a group and an "enter" button on group thumbnails.
 */
export class LayerStrip {
  readonly el: HTMLDivElement;
  private list: HTMLDivElement;
  private prefix = `slts${stripCounter++}-`;

  constructor(private editor: SvgLayEditor) {
    this.list = el('div', { class: 'slt-strip-list' });
    this.el = el('div', { class: 'slt-strip', role: 'listbox', 'aria-label': 'Layers' }, [this.list]);
  }

  render(): void {
    const ed = this.editor;
    const doc = ed.document;
    this.list.replaceChildren();
    const selectedId = ed.selection[ed.selection.length - 1];
    const loc = selectedId ? locateLayer(doc, selectedId) : null;
    const parent = loc?.parent ?? null;
    const siblings = parent ? parent.children : doc.layers;

    if (parent) {
      const up = el('button', { class: 'slt-strip-btn', type: 'button', title: `Back to ${parent.name}` }, [icon('up')]);
      up.addEventListener('click', () => ed.select([parent.id]));
      this.list.appendChild(up);
    }
    if (siblings.length === 0) {
      this.list.appendChild(el('div', { class: 'slt-strip-empty', title: 'No layers' }, [icon('shape')]));
      return;
    }
    for (let i = siblings.length - 1; i >= 0; i--) {
      this.list.appendChild(this.thumb(doc, siblings[i]));
    }
  }

  private thumb(doc: SvgDocument, layer: Layer): HTMLElement {
    const ed = this.editor;
    const selected = ed.selection.includes(layer.id);
    const btn = el(
      'button',
      {
        class: 'slt-thumb',
        type: 'button',
        role: 'option',
        title: layer.name,
        'aria-selected': selected ? 'true' : 'false',
        dataset: { id: layer.id },
      },
      [vnodeToDom(renderDocument(soloDocument(doc, layer.id), { idPrefix: `${this.prefix}${layer.id}-`, background: false, ...ed.renderOptions() }))],
    );
    if (selected) btn.dataset.selected = '';
    if (!layer.visible) btn.dataset.hidden = '';
    if (layer.locked) btn.dataset.locked = '';
    if (layer.mask) btn.appendChild(el('span', { class: 'slt-thumb-badge' }, [icon('mask')]));
    btn.addEventListener('click', (e) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) ed.toggleSelect(layer.id);
      else ed.select([layer.id]);
    });
    btn.addEventListener('mouseenter', () => ed.setHover(layer.id));
    btn.addEventListener('mouseleave', () => ed.setHover(null));
    if (layer.type === 'group' && layer.children.length) {
      const enter = el('span', { class: 'slt-thumb-enter', title: 'Open group', role: 'button' }, [icon('chevronRight')]);
      enter.addEventListener('click', (e) => {
        e.stopPropagation();
        ed.select([layer.children[layer.children.length - 1].id]);
      });
      btn.appendChild(enter);
    }
    return btn;
  }
}

/**
 * A copy of the document where only `id` (with its ancestors and descendants)
 * is visible, so a thumbnail shows that layer alone in its real place. Mask
 * layers are drawn as their own shape.
 */
export function soloDocument(doc: SvgDocument, id: string): SvgDocument {
  const loc = locateLayer(doc, id);
  const keep = new Set<string>([id, ...(loc?.ancestors.map((a) => a.id) ?? [])]);
  const walk = (layers: Layer[], inside: boolean): Layer[] =>
    layers.map((l) => {
      const on = inside || keep.has(l.id);
      const isTarget = l.id === id;
      const base: Layer = {
        ...l,
        visible: on && l.visible,
        // Inside the target keep masks working; on the path above it ignore masks so ancestors just wrap.
        mask: isTarget && l.mask ? { ...l.mask, showShape: true } : inside ? l.mask : null,
        effects: inside || isTarget ? l.effects : [],
        opacity: inside || isTarget ? l.opacity : 1,
      };
      if (base.type === 'group') return { ...base, children: walk(base.children, inside || isTarget) };
      return base;
    });
  return { ...doc, background: null, layers: walk(doc.layers, false) };
}
