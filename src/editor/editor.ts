import {
  createDocument,
  createShapeLayer,
  documentToJson,
  documentToPngBlob,
  documentToSvgBlob,
  documentToSvgString,
  downloadBlob,
  DocumentStore,
  duplicateLayers,
  Emitter,
  findLayer,
  groupLayers,
  insertLayer,
  invert,
  isDescendantOf,
  layerWorldBounds,
  locateLayer,
  normalizeDocument,
  parentWorldMatrix,
  removeLayers,
  reorderLayers,
  applyToPoint,
  ungroupLayer,
  unionRects,
  updateLayer,
  updateLayers,
  walkLayers,
  getShape,
  type Layer,
  type PngExportOptions,
  type RenderOptions,
  type ReorderDirection,
  type SvgDocument,
} from '../core';
import { grayHex, luminance, parseColor } from '../core/color';
import { CanvasView } from './canvas';
import { el, isEditableTarget } from './dom';
import { icon } from './icons';
import { LayersPanel } from './layers-panel';
import { LayerStrip } from './layer-strip';
import { LibraryPanel } from './library-panel';
import { PropertiesPanel } from './properties-panel';
import { resolveFeatures, THEME_TOKENS, type EditorFeatures, type ThemeColors, type ThemeName } from './features';
import { EDITOR_STYLES } from './styles';
import { Toolbar } from './toolbar';

export interface EditorOptions {
  /** Initial document. Takes precedence over width/height/background. */
  document?: SvgDocument;
  width?: number;
  height?: number;
  background?: string | null;
  /** Colour preset: `dark` (default), `light`, or `auto` to follow the OS setting. */
  theme?: ThemeName;
  /**
   * Token overrides applied inline (`--slt-accent` etc.). Alternatively set the
   * same custom properties in the host page's CSS; they inherit into the editor.
   */
  colors?: ThemeColors;
  /** Feature switches: colour mode, gradients, masks, groups, export ... */
  features?: Partial<EditorFeatures>;
  /** Hide parts of the UI for tighter embedding. */
  panels?: { toolbar?: boolean; library?: boolean; layers?: boolean; properties?: boolean };
  /**
   * `desktop`: side panels. `mobile`: canvas on top with a tabbed bottom sheet
   * (Shapes / Layers / Canvas / Layer). `auto` (default) picks by the editor's
   * own width, switching below `mobileBreakpoint`.
   */
  layout?: 'auto' | 'desktop' | 'mobile';
  /** Width in px under which `auto` uses the mobile layout (default 700). */
  mobileBreakpoint?: number;
  /** Restrict the shape library to these shape ids (same as `features.shapes`). */
  shapes?: string[];
  /** Render into a shadow root (default true) so host CSS cannot leak in. */
  shadow?: boolean;
  onChange?: (doc: SvgDocument) => void;
  onSelectionChange?: (ids: string[]) => void;
}

export type MobileTab = 'shapes' | 'layers' | 'canvas' | 'layer';

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface EditorEvents extends Record<string, unknown[]> {
  change: [doc: SvgDocument];
  selectionchange: [ids: string[]];
  viewchange: [view: ViewState];
}

/**
 * The embeddable editor. Mount it on any element:
 *
 *   const editor = new SvgLayEditor(document.querySelector('#host'), { width: 512, height: 512 });
 *   editor.on('change', doc => save(doc));
 */
export class SvgLayEditor extends Emitter<EditorEvents> {
  readonly host: HTMLElement;
  readonly root: ShadowRoot | HTMLElement;
  readonly store: DocumentStore;
  readonly options: EditorOptions;
  features: EditorFeatures;

  selection: string[] = [];
  hoverId: string | null = null;
  view: ViewState = { zoom: 1, panX: 0, panY: 0 };

  private rootEl: HTMLElement;
  private canvas: CanvasView;
  private sideEl: HTMLElement | null = null;
  private sheetEl: HTMLElement | null = null;
  private tabsEl: HTMLElement | null = null;
  private tabButtons = new Map<MobileTab, HTMLButtonElement>();
  private activeTab: MobileTab = 'shapes';
  private sheetOpen = true;
  private currentLayout: 'desktop' | 'mobile' | null = null;
  private layoutObserver: ResizeObserver | null = null;
  private panelsEnabled = { toolbar: true, library: true, layers: true, properties: true };
  private toolbar: Toolbar | null = null;
  private library: LibraryPanel | null = null;
  private layersPanel: LayersPanel | null = null;
  private strip: LayerStrip | null = null;
  private propsPanel: PropertiesPanel | null = null;
  private disposers: (() => void)[] = [];
  private destroyed = false;

  constructor(host: HTMLElement, options: EditorOptions = {}) {
    super();
    this.host = host;
    this.options = options;
    const doc =
      options.document ??
      createDocument({ width: options.width, height: options.height, background: options.background });
    this.store = new DocumentStore(doc);
    this.features = resolveFeatures({ ...(options.features ?? {}), ...(options.shapes ? { shapes: options.shapes } : {}) });

    const useShadow = options.shadow !== false;
    this.root = useShadow ? (host.shadowRoot ?? host.attachShadow({ mode: 'open' })) : host;
    if (!useShadow) host.replaceChildren();

    const style = document.createElement('style');
    style.textContent = EDITOR_STYLES;
    this.rootEl = el('div', { class: 'slt-root', dataset: { theme: options.theme ?? 'dark' } });
    if (options.colors) this.setColors(options.colors);
    const panels = { toolbar: true, library: true, layers: true, properties: true, ...(options.panels ?? {}) };
    this.panelsEnabled = panels;
    if (!panels.toolbar) this.rootEl.dataset.noToolbar = '';
    if (!panels.library) this.rootEl.dataset.noLibrary = '';
    if (!panels.layers && !panels.properties) this.rootEl.dataset.noSide = '';

    if (panels.toolbar) this.toolbar = new Toolbar(this);
    if (panels.library) this.library = new LibraryPanel(this);
    this.canvas = new CanvasView(this);
    this.strip = new LayerStrip(this);
    this.canvas.stripSlot.appendChild(this.strip.el);
    this.canvas.updateHint();
    if (panels.layers) this.layersPanel = new LayersPanel(this);
    if (panels.properties) this.propsPanel = new PropertiesPanel(this);
    this.root.appendChild(style);
    this.root.appendChild(this.rootEl);

    const layout = options.layout ?? 'auto';
    if (layout === 'auto' && typeof ResizeObserver !== 'undefined') {
      this.applyLayout(this.host.clientWidth > 0 && this.host.clientWidth < (options.mobileBreakpoint ?? 700) ? 'mobile' : 'desktop');
      this.layoutObserver = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? this.host.clientWidth;
        if (w > 0) this.applyLayout(w < (options.mobileBreakpoint ?? 700) ? 'mobile' : 'desktop');
      });
      this.layoutObserver.observe(this.host);
    } else {
      this.applyLayout(layout === 'mobile' ? 'mobile' : 'desktop');
    }

    this.disposers.push(
      this.store.on('change', (d, meta) => {
        this.pruneSelection();
        this.refresh(meta.transient);
        if (!meta.transient) {
          this.emit('change', d);
          options.onChange?.(d);
        }
      }),
      this.store.on('history', () => this.toolbar?.render()),
    );

    const onKey = (e: Event) => this.handleKey(e as KeyboardEvent);
    this.root.addEventListener('keydown', onKey);
    this.disposers.push(() => this.root.removeEventListener('keydown', onKey));

    this.refresh(false);
    requestAnimationFrame(() => {
      if (!this.destroyed) this.canvas.fitToView();
    });
  }

  // -------------------------------------------------------------------------
  // Layout

  get layout(): 'desktop' | 'mobile' {
    return this.currentLayout ?? 'desktop';
  }

  /** Arrange the panels for the given layout (also called by the auto observer). */
  applyLayout(mode: 'desktop' | 'mobile'): void {
    if (mode === this.currentLayout) return;
    this.currentLayout = mode;
    this.rootEl.dataset.layout = mode;
    // Detach everything, then rebuild.
    for (const child of [...this.rootEl.children]) child.remove();
    this.sideEl = null;
    this.sheetEl = null;
    this.tabsEl = null;
    this.tabButtons.clear();
    if (this.propsPanel) this.propsPanel.mode = 'auto';

    if (this.toolbar) this.rootEl.appendChild(this.toolbar.el);
    if (mode === 'desktop') {
      if (this.library) this.rootEl.appendChild(this.library.el);
      this.rootEl.appendChild(this.canvas.el);
      if (this.layersPanel || this.propsPanel) {
        this.sideEl = el('div', { class: 'slt-side' }, [this.layersPanel?.el ?? null, this.propsPanel?.el ?? null]);
        this.rootEl.appendChild(this.sideEl);
      }
    } else {
      this.rootEl.appendChild(this.canvas.el);
      this.sheetEl = el('div', { class: 'slt-sheet' });
      this.tabsEl = el('div', { class: 'slt-tabs', role: 'tablist' });
      const tabs: { id: MobileTab; label: string; ic: Parameters<typeof icon>[0]; show: boolean }[] = [
        { id: 'shapes', label: 'Shapes', ic: 'shape', show: !!this.library },
        { id: 'layers', label: 'Layers', ic: 'folder', show: !!this.layersPanel },
        { id: 'canvas', label: 'Canvas', ic: 'fit', show: !!this.propsPanel },
        { id: 'layer', label: 'Layer', ic: 'settings', show: !!this.propsPanel },
      ];
      for (const t of tabs) {
        if (!t.show) continue;
        const b = el('button', { class: 'slt-tab', type: 'button', role: 'tab', dataset: { tab: t.id } }, [icon(t.ic), el('span', {}, [t.label])]);
        b.addEventListener('click', () => this.toggleTab(t.id));
        this.tabButtons.set(t.id, b);
        this.tabsEl.appendChild(b);
      }
      this.rootEl.appendChild(this.sheetEl);
      this.rootEl.appendChild(this.tabsEl);
      if (!this.tabButtons.has(this.activeTab)) this.activeTab = this.tabButtons.keys().next().value ?? 'shapes';
      this.showTab(this.activeTab);
    }
    this.refresh(false);
    requestAnimationFrame(() => {
      if (!this.destroyed) this.canvas.fitToView();
    });
  }

  /** Mobile layout: show a tab in the bottom sheet. */
  showTab(tab: MobileTab, open = true): void {
    if (!this.sheetEl || !this.tabsEl) return;
    this.activeTab = tab;
    this.sheetOpen = open;
    for (const [id, b] of this.tabButtons) {
      if (id === tab && open) b.dataset.active = '';
      else delete b.dataset.active;
      b.setAttribute('aria-selected', id === tab && open ? 'true' : 'false');
    }
    this.sheetEl.replaceChildren();
    if (open) {
      const panel = tab === 'shapes' ? this.library?.el : tab === 'layers' ? this.layersPanel?.el : this.propsPanel?.el;
      if (this.propsPanel && (tab === 'canvas' || tab === 'layer')) {
        this.propsPanel.mode = tab === 'canvas' ? 'document' : 'layer';
        this.propsPanel.render();
      }
      if (panel) this.sheetEl.appendChild(panel);
      delete this.rootEl.dataset.sheetClosed;
    } else {
      this.rootEl.dataset.sheetClosed = '';
    }
    requestAnimationFrame(() => {
      if (!this.destroyed) this.canvas.renderOverlay();
    });
  }

  private toggleTab(tab: MobileTab): void {
    if (this.activeTab === tab && this.sheetOpen) this.showTab(tab, false);
    else this.showTab(tab, true);
  }

  // -------------------------------------------------------------------------
  // Document

  get document(): SvgDocument {
    return this.store.doc;
  }

  getDocument(): SvgDocument {
    return this.store.doc;
  }

  /** Replace the document (accepts a document object or JSON string); clears history. */
  loadDocument(input: SvgDocument | string | unknown): void {
    const raw = typeof input === 'string' ? JSON.parse(input) : input;
    const doc = normalizeDocument(raw);
    this.selection = [];
    this.store.load(doc);
    this.emit('selectionchange', []);
    this.canvas.fitToView();
  }

  setDocument(doc: SvgDocument): void {
    this.loadDocument(doc);
  }

  toJson(pretty = true): string {
    return documentToJson(this.store.doc, pretty);
  }

  // -------------------------------------------------------------------------
  // Selection

  select(ids: string[], additive = false): void {
    const valid = ids.filter((id) => findLayer(this.store.doc, id));
    const next = additive ? [...this.selection.filter((id) => !valid.includes(id)), ...valid] : valid;
    this.setSelection(next);
  }

  toggleSelect(id: string): void {
    if (this.selection.includes(id)) this.setSelection(this.selection.filter((s) => s !== id));
    else this.setSelection([...this.selection, id]);
  }

  clearSelection(): void {
    this.setSelection([]);
  }

  selectAll(): void {
    this.setSelection(this.store.doc.layers.filter((l) => !l.locked).map((l) => l.id));
  }

  private setSelection(ids: string[]): void {
    const same = ids.length === this.selection.length && ids.every((id, i) => id === this.selection[i]);
    if (same) return;
    this.selection = ids;
    // On mobile, selecting something while looking at canvas settings jumps to the layer settings.
    if (this.layout === 'mobile' && ids.length && this.activeTab === 'canvas' && this.sheetOpen) this.showTab('layer');
    this.refresh(false);
    this.emit('selectionchange', ids);
    this.options.onSelectionChange?.(ids);
  }

  setHover(id: string | null): void {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.canvas.renderOverlay();
  }

  selectedLayers(): Layer[] {
    return this.selection.map((id) => findLayer(this.store.doc, id)).filter((l): l is Layer => !!l);
  }

  /** Selected ids with any that are inside another selected layer removed. */
  topLevelSelection(): string[] {
    return this.selection.filter((id) => !this.selection.some((o) => o !== id && isDescendantOf(this.store.doc, id, o)));
  }

  private pruneSelection(): void {
    const doc = this.store.doc;
    const next = this.selection.filter((id) => findLayer(doc, id));
    if (next.length !== this.selection.length) {
      this.selection = next;
      this.emit('selectionchange', next);
      this.options.onSelectionChange?.(next);
    }
    if (this.hoverId && !findLayer(doc, this.hoverId)) this.hoverId = null;
  }

  // -------------------------------------------------------------------------
  // Editing commands

  /** Add a shape from the library at the centre of the view; returns its id. */
  addShape(shapeId: string, init: Partial<Layer> = {}): string {
    const doc = this.store.doc;
    const def = getShape(shapeId);
    let count = 0;
    walkLayers(doc.layers, (l) => {
      if (l.type === 'shape' && l.shape === def.id) count++;
    });
    // Insert next to the current selection (same parent, above it) or on top of the root.
    const anchor = this.selection.length ? locateLayer(doc, this.selection[this.selection.length - 1]) : null;
    const parentId = anchor?.parent?.id ?? null;
    const index = anchor ? anchor.index + 1 : Infinity;
    const parentInv = invert(parentWorldMatrix(doc, anchor?.layer.id ?? ''));
    const worldCentre = this.canvas.viewCentreWorld();
    const centre = applyToPoint(parentInv, {
      x: Math.min(Math.max(worldCentre.x, 0), doc.width),
      y: Math.min(Math.max(worldCentre.y, 0), doc.height),
    });
    const parentScale = Math.sqrt(Math.abs(parentInv.a * parentInv.d - parentInv.b * parentInv.c));
    const size = Math.round(Math.min(doc.width, doc.height) * 0.4 * parentScale);
    const layer = createShapeLayer({
      shape: def.id,
      name: `${def.name} ${count + 1}`,
      x: Math.round(centre.x),
      y: Math.round(centre.y),
      width: size,
      height: size,
      fill: { type: 'solid', color: this.nextColor(count) },
      ...(init as object),
    });
    this.store.commit((d) => insertLayer(d, layer, parentId, index));
    this.select([layer.id]);
    if (this.layout === 'mobile' && this.tabButtons.has('layer')) this.showTab('layer');
    return layer.id;
  }

  private nextColor(i: number): string {
    const mode = this.features.colorMode;
    if (mode === 'monochrome') return this.features.monoColor;
    if (mode === 'grayscale') return grayHex([232, 160, 96, 200, 128, 64][i % 6]);
    const palette = ['#e8e8e8', '#ff5d5d', '#4da3ff', '#ffc857', '#5ad27d', '#c77dff', '#ff8f3f', '#59d7e8'];
    return palette[i % palette.length];
  }

  deleteSelection(): void {
    const ids = this.topLevelSelection();
    if (!ids.length) return;
    this.store.commit((d) => removeLayers(d, ids));
    this.clearSelection();
  }

  duplicateSelection(): void {
    const ids = this.topLevelSelection();
    if (!ids.length) return;
    let newIds: string[] = [];
    this.store.commit((d) => {
      const res = duplicateLayers(d, ids);
      newIds = res.ids;
      return res.doc;
    });
    this.select(newIds);
  }

  groupSelection(): void {
    const ids = this.topLevelSelection();
    if (!ids.length || !this.features.groups) return;
    let groupId: string | null = null;
    this.store.commit((d) => {
      const res = groupLayers(d, ids);
      if (!res) return d;
      groupId = res.groupId;
      return res.doc;
    });
    if (groupId) this.select([groupId]);
  }

  ungroupSelection(): void {
    const groups = this.selectedLayers().filter((l) => l.type === 'group');
    if (!groups.length || !this.features.groups) return;
    let ids: string[] = [];
    this.store.commit((d) => {
      let out = d;
      for (const g of groups) {
        const res = ungroupLayer(out, g.id);
        if (res) {
          out = res.doc;
          ids = ids.concat(res.ids);
        }
      }
      return out;
    });
    this.select(ids);
  }

  reorderSelection(direction: ReorderDirection): void {
    const ids = this.topLevelSelection();
    if (!ids.length) return;
    this.store.commit((d) => reorderLayers(d, ids, direction));
  }

  /** Patch every selected layer (recorded as one undo step). */
  updateSelected(patch: Partial<Layer> | ((layer: Layer) => Layer)): void {
    if (!this.selection.length) return;
    this.store.commit((d) => updateLayers(d, this.selection, patch));
  }

  updateLayer(id: string, patch: Partial<Layer> | ((layer: Layer) => Layer)): void {
    this.store.commit((d) => updateLayer(d, id, patch));
  }

  nudgeSelection(dx: number, dy: number): void {
    const ids = this.topLevelSelection();
    if (!ids.length) return;
    this.store.commit((d) => updateLayers(d, ids, (l) => ({ ...l, x: l.x + dx, y: l.y + dy })));
  }

  toggleVisible(id: string): void {
    this.updateLayer(id, (l) => ({ ...l, visible: !l.visible }));
  }

  toggleLocked(id: string): void {
    this.updateLayer(id, (l) => ({ ...l, locked: !l.locked }));
  }

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }

  // -------------------------------------------------------------------------
  // View

  setZoom(zoom: number, aroundScreen?: { x: number; y: number }): void {
    this.canvas.setZoom(zoom, aroundScreen);
  }

  zoomBy(factor: number): void {
    this.canvas.setZoom(this.view.zoom * factor);
  }

  fitToView(): void {
    this.canvas.fitToView();
  }

  /** World bounds of the selection (axis aligned). */
  selectionBounds() {
    return unionRects(this.topLevelSelection().map((id) => layerWorldBounds(this.store.doc, id)));
  }

  // -------------------------------------------------------------------------
  // Export

  /** Standalone SVG markup; the editor's colour mode is applied. */
  exportSvg(): string {
    return documentToSvgString(this.store.doc, this.renderOptions());
  }

  exportPng(opts: PngExportOptions = {}): Promise<Blob> {
    return documentToPngBlob(this.store.doc, { ...opts, render: { ...this.renderOptions(), ...(opts.render ?? {}) } });
  }

  downloadSvg(filename = 'image.svg'): void {
    downloadBlob(documentToSvgBlob(this.store.doc, this.renderOptions()), filename);
  }

  async downloadPng(filename = 'image.png', opts: PngExportOptions = {}): Promise<void> {
    downloadBlob(await this.exportPng(opts), filename);
  }

  downloadJson(filename = 'image.svglay.json'): void {
    downloadBlob(new Blob([this.toJson()], { type: 'application/json' }), filename);
  }

  /** Open a file picker and load the chosen JSON document. */
  openJsonFile(): Promise<boolean> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(false);
        try {
          this.loadDocument(await file.text());
          resolve(true);
        } catch (err) {
          console.error('svg-lay-tool: could not load file', err);
          resolve(false);
        }
      };
      input.click();
    });
  }

  // -------------------------------------------------------------------------
  // Theme & features

  /** Switch the colour preset. */
  setTheme(theme: ThemeName): void {
    this.rootEl.dataset.theme = theme;
  }

  get theme(): ThemeName {
    return (this.rootEl.dataset.theme as ThemeName) ?? 'dark';
  }

  /** Override theme tokens inline; pass `null` values (or call `clearColors`) to fall back to host CSS. */
  setColors(colors: ThemeColors): void {
    for (const [token, value] of Object.entries(colors)) {
      if (!(THEME_TOKENS as readonly string[]).includes(token)) continue;
      if (value) this.rootEl.style.setProperty(`--slt-${token}`, value);
      else this.rootEl.style.removeProperty(`--slt-${token}`);
    }
  }

  clearColors(): void {
    for (const token of THEME_TOKENS) this.rootEl.style.removeProperty(`--slt-${token}`);
  }

  /** Change feature switches at runtime; the UI and rendering update immediately. */
  setFeatures(partial: Partial<EditorFeatures>): void {
    this.features = resolveFeatures({ ...this.features, ...partial });
    this.library?.refresh();
    this.canvas.updateHint();
    this.refresh(false);
  }

  /** Renderer options that enforce the current colour mode (used for canvas and export). */
  renderOptions(): RenderOptions {
    const f = this.features;
    return f.colorMode === 'full' ? {} : { colorMode: f.colorMode, monoColor: f.monoColor };
  }

  /** Extra, editor-only render options for the canvas (never applied to exports). */
  canvasRenderOptions(): RenderOptions {
    const f = this.features;
    const out: RenderOptions = { ...this.renderOptions(), maskPreviewOpacity: f.maskPreview ? 0.25 : 0 };
    if (f.colorMode === 'monochrome' && f.highlightSelection && this.selection.length) {
      out.highlightIds = this.selection;
      out.highlightColor = this.contrastColor(f.monoColor);
    }
    return out;
  }

  /** A saturated colour that reads against the monochrome paint: the theme accent, unless that is too close. */
  private contrastColor(mono: string): string {
    const accent = getComputedStyle(this.rootEl).getPropertyValue('--_slt-accent').trim() || '#4da3ff';
    const a = parseColor(accent);
    const m = parseColor(mono);
    if (a && m) {
      const dist = Math.hypot(a.r - m.r, a.g - m.g, a.b - m.b);
      if (dist < 80) return luminance(m) > 128 ? '#ff5d3a' : '#ffc857';
    }
    return accent;
  }

  // -------------------------------------------------------------------------
  // Internals

  /** Re-render the UI. Transient (mid-drag) refreshes skip the side panels. */
  refresh(transient: boolean): void {
    this.canvas.render();
    if (transient) return;
    this.canvas.stripSlot.style.display = this.features.layerStrip ? '' : 'none';
    if (this.features.layerStrip) this.strip?.render();
    this.toolbar?.render();
    this.layersPanel?.render();
    this.propsPanel?.render();
  }

  /** Re-read the shape registry (call after `registerShape`). */
  refreshLibrary(): void {
    this.library?.refresh();
  }

  /** Called by the canvas after zoom/pan changes. */
  viewChanged(): void {
    this.toolbar?.render();
    this.emit('viewchange', { ...this.view });
  }

  private handleKey(e: KeyboardEvent): void {
    if (isEditableTarget(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = true;
    if (mod && key === 'z' && !e.shiftKey) this.undo();
    else if ((mod && key === 'z' && e.shiftKey) || (mod && key === 'y')) this.redo();
    else if (mod && key === 'd') this.duplicateSelection();
    else if (mod && key === 'g' && !e.shiftKey) this.groupSelection();
    else if (mod && key === 'g' && e.shiftKey) this.ungroupSelection();
    else if (mod && key === 'a') this.selectAll();
    else if (mod && key === '0') this.fitToView();
    else if (mod && (key === '=' || key === '+')) this.zoomBy(1.25);
    else if (mod && key === '-') this.zoomBy(0.8);
    else if (key === 'delete' || key === 'backspace') this.deleteSelection();
    else if (key === 'escape') this.clearSelection();
    else if (key === ']') this.reorderSelection(mod ? 'front' : 'forward');
    else if (key === '[') this.reorderSelection(mod ? 'back' : 'backward');
    else if (key.startsWith('arrow')) {
      const step = e.shiftKey ? 10 : 1;
      const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
      const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
      this.nudgeSelection(dx, dy);
    } else handled = false;
    if (handled) e.preventDefault();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const d of this.disposers) d();
    this.layoutObserver?.disconnect();
    this.canvas.destroy();
    this.toolbar?.destroy();
    this.removeAllListeners();
    this.rootEl.remove();
    if (this.root instanceof ShadowRoot) this.root.replaceChildren();
  }
}
