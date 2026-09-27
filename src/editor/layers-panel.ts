import { locateLayer, moveLayer, type Layer } from '../core';
import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { icon } from './icons';

interface Row {
  layer: Layer;
  depth: number;
  parentId: string | null;
}

/** Layer tree: top-most layer first, groups expandable, drag to reorder. */
export class LayersPanel {
  readonly el: HTMLDivElement;
  private list: HTMLDivElement;
  private collapsed = new Set<string>();
  private renaming: string | null = null;
  private dragId: string | null = null;

  constructor(private editor: SvgLayEditor) {
    this.list = el('div', { class: 'slt-layers-list' });
    this.el = el('div', { class: 'slt-layers' }, [el('div', { class: 'slt-panel-title' }, ['Layers']), this.list]);
    this.list.addEventListener('dragover', (e) => {
      // Allow dropping at the very bottom of the list (below everything).
      if (this.dragId && e.target === this.list) e.preventDefault();
    });
    this.list.addEventListener('drop', (e) => {
      if (this.dragId && e.target === this.list) {
        e.preventDefault();
        this.editor.store.commit((d) => moveLayer(d, this.dragId!, null, 0));
        this.dragId = null;
      }
    });
  }

  render(): void {
    const active = this.editor.root instanceof ShadowRoot ? this.editor.root.activeElement : document.activeElement;
    if (this.renaming && active && this.list.contains(active)) return;
    this.list.replaceChildren();
    const rows: Row[] = [];
    const walk = (layers: Layer[], depth: number, parentId: string | null) => {
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        rows.push({ layer, depth, parentId });
        if (layer.type === 'group' && !this.collapsed.has(layer.id)) walk(layer.children, depth + 1, layer.id);
      }
    };
    walk(this.editor.document.layers, 0, null);
    if (rows.length === 0) {
      this.list.appendChild(el('div', { class: 'slt-empty' }, ['No layers yet. Add a shape from the library.']));
      return;
    }
    for (const r of rows) this.list.appendChild(this.renderRow(r));
  }

  private renderRow({ layer, depth }: Row): HTMLDivElement {
    const ed = this.editor;
    const selected = ed.selection.includes(layer.id);
    const isGroup = layer.type === 'group';

    const expander = el('span', { class: 'slt-expander' });
    if (isGroup) {
      expander.appendChild(icon(this.collapsed.has(layer.id) ? 'chevronRight' : 'chevronDown'));
      expander.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.collapsed.has(layer.id)) this.collapsed.delete(layer.id);
        else this.collapsed.add(layer.id);
        this.render();
      });
    }

    const name = el('span', { class: 'slt-layer-name', title: layer.name }, [layer.name]);
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.startRename(layer, name);
    });

    const eye = el('button', { class: 'slt-row-btn', type: 'button', title: layer.visible ? 'Hide' : 'Show' }, [
      icon(layer.visible ? 'eye' : 'eyeOff'),
    ]);
    if (layer.visible) eye.dataset.active = '';
    eye.addEventListener('click', (e) => {
      e.stopPropagation();
      ed.toggleVisible(layer.id);
    });
    const lock = el('button', { class: 'slt-row-btn', type: 'button', title: layer.locked ? 'Unlock' : 'Lock' }, [
      icon(layer.locked ? 'lock' : 'unlock'),
    ]);
    if (layer.locked) lock.dataset.active = '';
    lock.addEventListener('click', (e) => {
      e.stopPropagation();
      ed.toggleLocked(layer.id);
    });

    const row = el(
      'div',
      {
        class: 'slt-layer-row',
        draggable: true,
        style: { paddingLeft: `${4 + depth * 14}px` },
        dataset: { id: layer.id },
      },
      [
        expander,
        el('span', { class: 'slt-type-icon' }, [icon(isGroup ? 'folder' : 'shape')]),
        name,
        layer.mask ? el('span', { class: 'slt-badge', title: 'Mask' }, [icon('mask')]) : null,
        eye,
        lock,
      ],
    );
    if (selected) row.dataset.selected = '';
    if (!layer.visible) row.dataset.hidden = '';

    row.addEventListener('click', (e) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) ed.toggleSelect(layer.id);
      else ed.select([layer.id]);
    });
    row.addEventListener('mouseenter', () => ed.setHover(layer.id));
    row.addEventListener('mouseleave', () => ed.setHover(null));

    // Drag and drop reordering
    row.addEventListener('dragstart', (e) => {
      this.dragId = layer.id;
      e.dataTransfer?.setData('text/plain', layer.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      this.dragId = null;
      this.clearDropMarkers();
    });
    row.addEventListener('dragover', (e) => {
      if (!this.dragId || this.dragId === layer.id) return;
      const doc = ed.document;
      const dragLoc = locateLayer(doc, this.dragId);
      if (!dragLoc) return;
      if (dragLoc.layer.type === 'group' && (layer.id === this.dragId || locateLayer(doc, layer.id)?.ancestors.some((a) => a.id === this.dragId))) {
        return;
      }
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      this.clearDropMarkers();
      row.dataset.drop = this.dropZone(e, row, isGroup);
    });
    row.addEventListener('dragleave', () => {
      delete row.dataset.drop;
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const dragId = this.dragId;
      this.dragId = null;
      this.clearDropMarkers();
      if (!dragId || dragId === layer.id) return;
      const zone = this.dropZone(e, row, isGroup);
      ed.store.commit((d) => {
        const target = locateLayer(d, layer.id);
        if (!target) return d;
        if (zone === 'into' && layer.type === 'group') {
          return moveLayer(d, dragId, layer.id, Infinity);
        }
        // Compute the index in the target sibling array *after* removing the dragged layer.
        const siblingsWithout = target.siblings.filter((l) => l.id !== dragId);
        const targetIdx = siblingsWithout.findIndex((l) => l.id === layer.id);
        // The list is displayed top-most first: "before" (above) means a higher index.
        const index = zone === 'before' ? targetIdx + 1 : targetIdx;
        return moveLayer(d, dragId, target.parent?.id ?? null, index);
      });
    });
    return row;
  }

  private dropZone(e: DragEvent, row: HTMLElement, isGroup: boolean): 'before' | 'after' | 'into' {
    const r = row.getBoundingClientRect();
    const t = (e.clientY - r.top) / r.height;
    if (isGroup && t > 0.3 && t < 0.7) return 'into';
    return t < 0.5 ? 'before' : 'after';
  }

  private clearDropMarkers(): void {
    for (const r of this.list.querySelectorAll<HTMLElement>('[data-drop]')) delete r.dataset.drop;
  }

  private startRename(layer: Layer, nameEl: HTMLElement): void {
    this.renaming = layer.id;
    const input = el('input', { type: 'text', value: layer.name, spellcheck: false });
    const finish = (save: boolean) => {
      if (this.renaming !== layer.id) return;
      this.renaming = null;
      const v = input.value.trim();
      if (save && v && v !== layer.name) this.editor.updateLayer(layer.id, { name: v });
      else this.render();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('click', (e) => e.stopPropagation());
    nameEl.replaceChildren(input);
    input.focus();
    input.select();
  }
}
