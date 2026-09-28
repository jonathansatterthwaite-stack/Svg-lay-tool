import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { button } from './fields';
import { icon, type IconName } from './icons';

export class Toolbar {
  readonly el: HTMLDivElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private zoomLabel: HTMLSpanElement;
  private menu: HTMLDivElement;
  private previewToggle: HTMLInputElement;
  private snapToggle: HTMLInputElement;

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

    this.previewToggle = el('input', { type: 'checkbox', role: 'switch' });
    this.previewToggle.addEventListener('change', () => ed.setPreview(this.previewToggle.checked));
    this.snapToggle = el('input', { type: 'checkbox', role: 'switch' });
    this.snapToggle.addEventListener('change', () => ed.setSnap(this.snapToggle.checked));
    const switchRow = (label: string, ic: IconName, input: HTMLInputElement, title: string) =>
      el('label', { class: 'slt-switch', title }, [icon(ic), el('span', {}, [label]), input]);

    this.el = el('div', { class: 'slt-toolbar' }, [
      b('undo', 'undo', 'Undo (Ctrl+Z)', () => ed.undo()),
      b('redo', 'redo', 'Redo (Ctrl+Y)', () => ed.redo()),
      sep(),
      switchRow('Snap', 'grid', this.snapToggle, 'Snap moves and resizes to the grid (set the grid in the Canvas tab)'),
      switchRow('Preview', 'eye', this.previewToggle, 'Show the image exactly as it will be produced'),
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
    const set = (key: string, enabled: boolean) => {
      const btn = this.buttons.get(key);
      if (btn) btn.disabled = !enabled;
    };
    set('undo', ed.store.canUndo);
    set('redo', ed.store.canRedo);
    this.menu.style.display = ed.features.export ? '' : 'none';
    this.zoomLabel.textContent = `${Math.round(ed.view.zoom * 100)}%`;
    this.previewToggle.checked = ed.preview;
    this.snapToggle.checked = ed.snap;
    this.el.classList.toggle('slt-previewing', ed.preview);
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.closeMenuOnOutside, true);
  }
}
