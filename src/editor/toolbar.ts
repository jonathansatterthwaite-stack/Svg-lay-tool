import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { button } from './fields';
import { icon, type IconName } from './icons';

export class Toolbar {
  readonly el: HTMLDivElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private zoomLabel: HTMLSpanElement;
  private menu: HTMLDivElement;

  constructor(private editor: SvgLayEditor) {
    const ed = editor;
    const b = (key: string, ic: IconName, title: string, fn: () => void, label?: string) => {
      const btn = button(label ? [icon(ic), label] : icon(ic), fn, { title, cls: label ? '' : 'slt-icon-only' });
      this.buttons.set(key, btn);
      return btn;
    };
    const sep = () => el('span', { class: 'slt-sep' });
    this.zoomLabel = el('span', { class: 'slt-zoom-label' }, ['100%']);

    this.menu = el('div', { class: 'slt-menu' }, [
      button([icon('download'), 'Export'], () => this.toggleMenu(), { title: 'Export / save' }),
      el('div', { class: 'slt-menu-list' }, [
        button('Download SVG', () => this.run(() => ed.downloadSvg())),
        button('Download PNG (1×)', () => this.run(() => ed.downloadPng('image.png', { scale: 1 }))),
        button('Download PNG (2×)', () => this.run(() => ed.downloadPng('image@2x.png', { scale: 2 }))),
        button('Download PNG (4×)', () => this.run(() => ed.downloadPng('image@4x.png', { scale: 4 }))),
        button('Save project (JSON)', () => this.run(() => ed.downloadJson())),
        button([icon('upload'), 'Open project (JSON)'], () => this.run(() => ed.openJsonFile())),
      ]),
    ]);

    this.el = el('div', { class: 'slt-toolbar' }, [
      b('undo', 'undo', 'Undo (Ctrl+Z)', () => ed.undo()),
      b('redo', 'redo', 'Redo (Ctrl+Y)', () => ed.redo()),
      sep(),
      b('group', 'group', 'Group (Ctrl+G)', () => ed.groupSelection()),
      b('ungroup', 'ungroup', 'Ungroup (Ctrl+Shift+G)', () => ed.ungroupSelection()),
      b('duplicate', 'duplicate', 'Duplicate (Ctrl+D)', () => ed.duplicateSelection()),
      b('delete', 'trash', 'Delete (Del)', () => ed.deleteSelection()),
      sep(),
      b('front', 'front', 'Bring to front (Ctrl+])', () => ed.reorderSelection('front')),
      b('forward', 'forward', 'Bring forward (])', () => ed.reorderSelection('forward')),
      b('backward', 'backward', 'Send backward ([)', () => ed.reorderSelection('backward')),
      b('back', 'back', 'Send to back (Ctrl+[)', () => ed.reorderSelection('back')),
      el('span', { class: 'slt-spacer' }),
      b('zoomOut', 'zoomOut', 'Zoom out (Ctrl+-)', () => ed.zoomBy(0.8)),
      this.zoomLabel,
      b('zoomIn', 'zoomIn', 'Zoom in (Ctrl+=)', () => ed.zoomBy(1.25)),
      b('fit', 'fit', 'Fit to view (Ctrl+0)', () => ed.fitToView()),
      sep(),
      this.menu,
    ]);
    this.zoomLabel.addEventListener('click', () => ed.setZoom(1));
    this.zoomLabel.style.cursor = 'pointer';
    this.zoomLabel.title = 'Reset zoom to 100%';

    document.addEventListener('pointerdown', this.closeMenuOnOutside, true);
  }

  private closeMenuOnOutside = (e: Event) => {
    if (!e.composedPath().includes(this.menu)) delete this.menu.dataset.open;
  };

  private toggleMenu(): void {
    if (this.menu.dataset.open !== undefined) delete this.menu.dataset.open;
    else this.menu.dataset.open = '';
  }

  private run(fn: () => unknown): void {
    delete this.menu.dataset.open;
    Promise.resolve(fn()).catch((err) => console.error('svg-lay-tool:', err));
  }

  render(): void {
    const ed = this.editor;
    const sel = ed.selectedLayers();
    const set = (key: string, enabled: boolean) => {
      const btn = this.buttons.get(key);
      if (btn) btn.disabled = !enabled;
    };
    set('undo', ed.store.canUndo);
    set('redo', ed.store.canRedo);
    const f = ed.features;
    set('group', sel.length > 0 && f.groups);
    set('ungroup', sel.some((l) => l.type === 'group') && f.groups);
    this.buttons.get('group')!.style.display = f.groups ? '' : 'none';
    this.buttons.get('ungroup')!.style.display = f.groups ? '' : 'none';
    this.menu.style.display = f.export ? '' : 'none';
    set('duplicate', sel.length > 0);
    set('delete', sel.length > 0);
    for (const k of ['front', 'forward', 'backward', 'back']) set(k, sel.length > 0);
    this.zoomLabel.textContent = `${Math.round(ed.view.zoom * 100)}%`;
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.closeMenuOnOutside, true);
  }
}
