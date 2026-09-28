import { hasMaskModifier, locateLayer, moveLayer, removeLayers, type Layer } from '../core';
import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { button } from './fields';
import { icon, type IconName } from './icons';

interface Row {
  layer: Layer;
  depth: number;
  parentId: string | null;
}

type DropZone = 'before' | 'after' | 'into';

/**
 * Layer tree: top-most layer first, groups expandable, a toolbar for the
 * selection, a delete button per row, and pointer-based drag reordering
 * (grab the grip) that works with mouse and touch alike.
 */
export class LayersPanel {
  readonly el: HTMLDivElement;
  private list: HTMLDivElement;
  private tools = new Map<string, HTMLButtonElement>();
  private tips = new Map<string, [label: string, keys: string]>();

  /** Re-write tooltips for the current input mode (shortcuts only when a keyboard is expected). */
  updateTips(): void {
    for (const [key, [label, keys]] of this.tips) this.tools.get(key)?.setAttribute('title', this.editor.tip(label, keys));
  }
  private collapsed = new Set<string>();
  private renaming: string | null = null;
  private drag: { id: string; pointerId: number; ghost: HTMLElement; target: { id: string; zone: DropZone } | null } | null = null;

  constructor(private editor: SvgLayEditor) {
    this.list = el('div', { class: 'slt-layers-list' });
    const ed = editor;
    const tool = (key: string, ic: IconName, label: string, keys: string, fn: () => void) => {
      const b = button(icon(ic), fn, { title: ed.tip(label, keys), cls: 'slt-small slt-icon-only' });
      this.tools.set(key, b);
      this.tips.set(key, [label, keys]);
      return b;
    };
    const toolbar = el('div', { class: 'slt-layers-tools' }, [
      tool('group', 'group', 'Group', 'Mod+G', () => ed.groupSelection()),
      tool('ungroup', 'ungroup', 'Ungroup', 'Mod+Shift+G', () => ed.ungroupSelection()),
      tool('duplicate', 'duplicate', 'Duplicate', 'Mod+D', () => ed.duplicateSelection()),
      el('span', { class: 'slt-sep' }),
      tool('front', 'front', 'Bring to front', 'Mod+]', () => ed.reorderSelection('front')),
      tool('forward', 'forward', 'Bring forward', ']', () => ed.reorderSelection('forward')),
      tool('backward', 'backward', 'Send backward', '[', () => ed.reorderSelection('backward')),
      tool('back', 'back', 'Send to back', 'Mod+[', () => ed.reorderSelection('back')),
    ]);
    this.el = el('div', { class: 'slt-layers' }, [el('div', { class: 'slt-panel-title' }, ['Layers']), toolbar, this.list]);
  }

  render(): void {
    const ed = this.editor;
    const sel = ed.selectedLayers();
    const set = (key: string, on: boolean) => {
      const b = this.tools.get(key);
      if (b) b.disabled = !on;
    };
    const f = ed.features;
    set('group', sel.length > 0 && f.groups);
    set('ungroup', sel.some((l) => l.type === 'group') && f.groups);
    this.tools.get('group')!.style.display = f.groups ? '' : 'none';
    this.tools.get('ungroup')!.style.display = f.groups ? '' : 'none';
    set('duplicate', sel.length > 0);
    for (const k of ['front', 'forward', 'backward', 'back']) set(k, sel.length > 0);

    const active = ed.root instanceof ShadowRoot ? ed.root.activeElement : document.activeElement;
    if (this.renaming && active && this.list.contains(active)) return;
    if (this.drag) return; // keep the DOM stable while dragging
    this.list.replaceChildren();
    const rows: Row[] = [];
    const walk = (layers: Layer[], depth: number, parentId: string | null) => {
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        rows.push({ layer, depth, parentId });
        if (layer.type === 'group' && !this.collapsed.has(layer.id)) walk(layer.children, depth + 1, layer.id);
      }
    };
    walk(ed.document.layers, 0, null);
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

    const grip = el('span', { class: 'slt-grip', title: 'Drag to reorder' }, [icon('grip')]);
    grip.addEventListener('pointerdown', (e) => this.startDrag(e, layer.id, grip));

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

    const rowBtn = (ic: IconName, title: string, fn: () => void, active = false, cls = '') => {
      const b = el('button', { class: `slt-row-btn ${cls}`, type: 'button', title }, [icon(ic)]);
      if (active) b.dataset.active = '';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      return b;
    };

    const row = el(
      'div',
      { class: 'slt-layer-row', style: { paddingLeft: `${depth * 14}px` }, dataset: { id: layer.id } },
      [
        grip,
        expander,
        el('span', { class: 'slt-type-icon' }, [icon(isGroup ? 'folder' : 'shape')]),
        name,
        hasMaskModifier(layer) ? el('span', { class: 'slt-badge', title: 'Mask' }, [icon('mask')]) : null,
        rowBtn(layer.visible ? 'eye' : 'eyeOff', layer.visible ? 'Hide' : 'Show', () => ed.toggleVisible(layer.id), layer.visible),
        rowBtn(layer.locked ? 'lock' : 'unlock', layer.locked ? 'Unlock' : 'Lock', () => ed.toggleLocked(layer.id), layer.locked),
        rowBtn('close', 'Delete layer', () => this.deleteLayer(layer.id), false, 'slt-row-delete'),
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
    return row;
  }

  private deleteLayer(id: string): void {
    const ed = this.editor;
    ed.store.commit((d) => removeLayers(d, [id]));
    if (ed.selection.includes(id)) ed.select(ed.selection.filter((s) => s !== id));
  }

  // -------------------------------------------------------------------------
  // Drag to reorder (pointer events, so touch works too)

  private startDrag(e: PointerEvent, id: string, grip: HTMLElement): void {
    if (this.drag || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const row = grip.closest<HTMLElement>('.slt-layer-row')!;
    const ghost = el('div', { class: 'slt-drag-ghost' }, [row.querySelector('.slt-layer-name')?.textContent ?? '']);
    this.list.appendChild(ghost);
    this.drag = { id, pointerId: e.pointerId, ghost, target: null };
    grip.setPointerCapture(e.pointerId);
    this.list.classList.add('slt-dragging');
    const move = (ev: PointerEvent) => this.onDragMove(ev);
    const up = (ev: PointerEvent) => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      this.finishDrag(ev.type === 'pointerup');
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    this.onDragMove(e);
  }

  private onDragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const listRect = this.list.getBoundingClientRect();
    d.ghost.style.transform = `translate(${e.clientX - listRect.left + 12}px, ${e.clientY - listRect.top + this.list.scrollTop - 12}px)`;
    // Auto-scroll near the edges.
    if (e.clientY < listRect.top + 24) this.list.scrollTop -= 6;
    else if (e.clientY > listRect.bottom - 24) this.list.scrollTop += 6;

    // Probe inside the visible list even when the finger has slipped past its edge,
    // so the edge rows stay reachable while the list scrolls.
    const px = Math.min(Math.max(e.clientX, listRect.left + 2), listRect.right - 2);
    const py = Math.min(Math.max(e.clientY, listRect.top + 2), listRect.bottom - 2);
    const root = this.editor.root instanceof ShadowRoot ? this.editor.root : document;
    const under = root.elementFromPoint(px, py);
    const row = under?.closest<HTMLElement>('.slt-layer-row') ?? null;
    this.clearDropMarkers();
    d.target = null;
    if (!row || row.dataset.id === d.id) {
      // Below the last row: drop at the very bottom of the root.
      if (!row) {
        const last = this.list.querySelector<HTMLElement>('.slt-layer-row:last-of-type');
        if (last && py > last.getBoundingClientRect().bottom) {
          d.target = { id: '', zone: 'after' };
          last.dataset.drop = 'after';
        }
      }
      return;
    }
    const doc = this.editor.document;
    const targetId = row.dataset.id!;
    const dragLoc = locateLayer(doc, d.id);
    if (!dragLoc) return;
    // Never drop a group into itself or its own descendants.
    if (dragLoc.layer.type === 'group' && locateLayer(doc, targetId)?.ancestors.some((a) => a.id === d.id)) return;
    const target = locateLayer(doc, targetId);
    const zone = this.dropZone(py, row, target?.layer.type === 'group');
    row.dataset.drop = zone;
    d.target = { id: targetId, zone };
  }

  private finishDrag(commit: boolean): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost.remove();
    this.list.classList.remove('slt-dragging');
    this.clearDropMarkers();
    if (!commit || !d.target) {
      this.render();
      return;
    }
    const { id: targetId, zone } = d.target;
    this.editor.store.commit((doc) => {
      if (targetId === '') return moveLayer(doc, d.id, null, 0); // bottom of the root stack
      const target = locateLayer(doc, targetId);
      if (!target) return doc;
      if (zone === 'into' && target.layer.type === 'group') return moveLayer(doc, d.id, targetId, Infinity);
      // Index in the target sibling array *after* removing the dragged layer.
      const siblingsWithout = target.siblings.filter((l) => l.id !== d.id);
      const targetIdx = siblingsWithout.findIndex((l) => l.id === targetId);
      // The list shows top-most first: "before" (above) means a higher index.
      const index = zone === 'before' ? targetIdx + 1 : targetIdx;
      return moveLayer(doc, d.id, target.parent?.id ?? null, index);
    });
    this.render();
  }

  private dropZone(clientY: number, row: HTMLElement, isGroup: boolean): DropZone {
    const r = row.getBoundingClientRect();
    const t = (clientY - r.top) / r.height;
    if (isGroup && t > 0.3 && t < 0.7) return 'into';
    return t < 0.5 ? 'before' : 'after';
  }

  private clearDropMarkers(): void {
    for (const r of this.list.querySelectorAll<HTMLElement>('[data-drop]')) delete r.dataset.drop;
  }

  // -------------------------------------------------------------------------

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
