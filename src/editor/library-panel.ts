import { defaultShapeParams, listShapes, type ShapeDefinition } from '../core';
import { el, svgEl } from './dom';
import type { SvgLayEditor } from './editor';

/** Palette of shapes; click one to add it to the document. */
export class LibraryPanel {
  readonly el: HTMLDivElement;
  private scroll: HTMLDivElement;
  private filter = '';

  constructor(private editor: SvgLayEditor, private allowed?: string[]) {
    const search = el('input', { class: 'slt-input slt-library-search', type: 'search', placeholder: 'Search shapes…' });
    search.addEventListener('input', () => {
      this.filter = search.value.trim().toLowerCase();
      this.renderGrid();
    });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    this.scroll = el('div', { class: 'slt-library-scroll' });
    this.el = el('div', { class: 'slt-library' }, [el('div', { class: 'slt-panel-title' }, ['Shapes']), search, this.scroll]);
    this.renderGrid();
  }

  /** Re-read the registry (call after registering custom shapes). */
  refresh(): void {
    this.renderGrid();
  }

  private shapes(): ShapeDefinition[] {
    let shapes = listShapes();
    if (this.allowed) shapes = shapes.filter((s) => this.allowed!.includes(s.id));
    if (this.filter) shapes = shapes.filter((s) => s.name.toLowerCase().includes(this.filter) || s.id.includes(this.filter));
    return shapes;
  }

  private renderGrid(): void {
    this.scroll.replaceChildren();
    const byCat = new Map<string, ShapeDefinition[]>();
    for (const s of this.shapes()) {
      const list = byCat.get(s.category) ?? [];
      list.push(s);
      byCat.set(s.category, list);
    }
    if (byCat.size === 0) {
      this.scroll.appendChild(el('div', { class: 'slt-empty' }, ['No shapes match.']));
      return;
    }
    for (const [cat, shapes] of byCat) {
      this.scroll.appendChild(el('div', { class: 'slt-library-cat' }, [cat]));
      const grid = el('div', { class: 'slt-library-grid' });
      for (const s of shapes) grid.appendChild(this.shapeButton(s));
      this.scroll.appendChild(grid);
    }
  }

  private shapeButton(def: ShapeDefinition): HTMLButtonElement {
    const d = def.path(28, 28, defaultShapeParams(def));
    const preview = svgEl('svg', { viewBox: '-16 -16 32 32', 'aria-hidden': 'true' }, [
      svgEl('path', { d, fill: 'currentColor', 'fill-rule': def.fillRule ?? 'nonzero' }),
    ]);
    const btn = el('button', { class: 'slt-shape-btn', type: 'button', title: def.name, 'aria-label': `Add ${def.name}` }, [preview]);
    btn.addEventListener('click', () => this.editor.addShape(def.id));
    return btn;
  }
}
