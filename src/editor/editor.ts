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
  DEFAULT_GRID,
  documentUsesTime,
  documentEnv,
  resolveDocument,
  createVariable,
  upsertVariable,
  type Env,
  type Variable,
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
import { ModifiersPanel } from './modifiers-panel';
import { VariablesPanel } from './variables-panel';
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
  /** Variables the host app exposes to formulas, grouped for the Variables panel. */
  variableGroups?: VariableGroup[];
  /** App-specific "+ add variable" buttons for the Variables panel. */
  variablePresets?: VariablePreset[];
  /** Hide parts of the UI for tighter embedding. */
  panels?: { toolbar?: boolean; library?: boolean; layers?: boolean; properties?: boolean };
  /**
   * Initial widths (px) of the desktop side panels; the user can drag their
   * borders. Listen to `panelresize` to persist the result.
   */
  panelWidths?: Partial<PanelWidths>;
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

export type MobileTab = 'shapes' | 'layers' | 'canvas' | 'layer' | 'modifiers' | 'variables';

/** A variable an embedding app exposes to formulas. */
export interface AppVariable {
  /** Identifier used in expressions: letters, digits and underscores. */
  name: string;
  /** Shown in the Variables panel next to the name. */
  label?: string;
  value: number;
}

/** A named, collapsible list of app variables (shown like the Time list). */
export interface VariableGroup {
  id: string;
  title: string;
  variables: AppVariable[];
}

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface EditorEvents extends Record<string, unknown[]> {
  change: [doc: SvgDocument];
  selectionchange: [ids: string[]];
  viewchange: [view: ViewState];
  previewchange: [on: boolean];
  snapchange: [on: boolean];
  panelresize: [widths: PanelWidths];
}

/**
 * An app-specific "+ add" button for the Variables panel. Clicking it inserts
 * a variable built from `variable` (name made unique if taken).
 */
export interface VariablePreset {
  id: string;
  /** Button text, e.g. "Battery %". */
  label: string;
  /** Tooltip. */
  title?: string;
  /** The variable to create; a function receives the document and can compute it. */
  variable: Partial<Variable> | ((doc: SvgDocument) => Partial<Variable>);
}

/** Widths (px) of the desktop panels: the shape library and the side panel. */
export interface PanelWidths {
  library: number;
  side: number;
}

const DEFAULT_PANEL_WIDTHS: PanelWidths = { library: 200, side: 280 };
const PANEL_MIN: PanelWidths = { library: 140, side: 220 };
/** Room the canvas always keeps between the panels. */
const CANVAS_MIN_WIDTH = 240;

function cloneGroup(g: VariableGroup): VariableGroup {
  return { id: g.id, title: g.title, variables: g.variables.map((v) => ({ ...v })) };
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
  /** When true the canvas shows the exact output: no handles, ghosts or editing aids. */
  preview = false;
  /** Snap moves, resizes and nudges to the document grid. */
  snap = false;
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
  private panelWidths: PanelWidths = { ...DEFAULT_PANEL_WIDTHS };
  private toolbar: Toolbar | null = null;
  private library: LibraryPanel | null = null;
  private layersPanel: LayersPanel | null = null;
  private strip: LayerStrip | null = null;
  private propsPanel: PropertiesPanel | null = null;
  private modifiersPanel: ModifiersPanel | null = null;
  private variablesPanel: VariablesPanel | null = null;
  private animTimer: ReturnType<typeof setInterval> | null = null;
  /** Variable values supplied by the host app; they override the document's own. */
  variableOverrides: Env = {};
  /** Host-registered variable groups (see registerVariables). */
  variableGroups: VariableGroup[] = [];
  /** Host-registered "+ add variable" buttons (see registerVariablePresets). */
  variablePresets: VariablePreset[] = [];
  private coarsePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
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
    this.variableGroups = (options.variableGroups ?? []).map(cloneGroup);
    this.variablePresets = (options.variablePresets ?? []).map((p) => ({ ...p }));

    const useShadow = options.shadow !== false;
    this.root = useShadow ? (host.shadowRoot ?? host.attachShadow({ mode: 'open' })) : host;
    if (!useShadow) host.replaceChildren();

    const style = document.createElement('style');
    style.textContent = EDITOR_STYLES;
    this.rootEl = el('div', { class: 'slt-root', dataset: { theme: options.theme ?? 'dark' } });
    if (options.colors) this.setColors(options.colors);
    const panels = { toolbar: true, library: true, layers: true, properties: true, ...(options.panels ?? {}) };
    if (!panels.toolbar) this.rootEl.dataset.noToolbar = '';
    if (!panels.library) this.rootEl.dataset.noLibrary = '';
    if (!panels.layers && !panels.properties) this.rootEl.dataset.noSide = '';
    this.setPanelWidths(options.panelWidths ?? {}, false);

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
    this.updateTips();
    // Detach everything, then rebuild.
    for (const child of [...this.rootEl.children]) child.remove();
    this.sideEl = null;
    this.sheetEl = null;
    this.tabsEl = null;
    this.tabButtons.clear();
    if (this.propsPanel) this.propsPanel.mode = 'auto';

    if (this.toolbar) this.rootEl.appendChild(this.toolbar.el);
    const allTabs: { id: MobileTab; label: string; ic: Parameters<typeof icon>[0]; show: boolean }[] = [
      { id: 'shapes', label: 'Shapes', ic: 'shape', show: !!this.library },
      { id: 'layers', label: 'Layers', ic: 'folder', show: !!this.layersPanel },
      { id: 'canvas', label: 'Canvas', ic: 'fit', show: !!this.propsPanel },
      { id: 'layer', label: 'Layer', ic: 'settings', show: !!this.propsPanel },
      { id: 'modifiers', label: 'Modifiers', ic: 'modifiers', show: !!this.propsPanel },
      { id: 'variables', label: 'Variables', ic: 'variables', show: !!this.propsPanel && this.features.variables },
    ];
    const buildTabs = (ids: MobileTab[]) => {
      this.tabsEl = el('div', { class: 'slt-tabs', role: 'tablist' });
      for (const t of allTabs) {
        if (!t.show || !ids.includes(t.id)) continue;
        const b = el('button', { class: 'slt-tab', type: 'button', role: 'tab', dataset: { tab: t.id } }, [icon(t.ic), el('span', {}, [t.label])]);
        b.addEventListener('click', () => this.toggleTab(t.id));
        this.tabButtons.set(t.id, b);
        this.tabsEl.appendChild(b);
      }
      this.sheetEl = el('div', { class: 'slt-sheet' });
    };
    if (mode === 'desktop') {
      if (this.library) {
        this.rootEl.appendChild(this.library.el);
        this.library.el.appendChild(this.panelResizer('library'));
      }
      this.rootEl.appendChild(this.canvas.el);
      if (this.layersPanel || this.propsPanel) {
        // Layers stay visible; the tool panels share a tabbed area beneath them.
        buildTabs(['canvas', 'layer', 'modifiers', 'variables']);
        this.sideEl = el('div', { class: 'slt-side' }, [this.layersPanel?.el ?? null, this.tabsEl, this.sheetEl, this.panelResizer('side')]);
        this.rootEl.appendChild(this.sideEl);
        if (!this.tabButtons.has(this.activeTab)) this.activeTab = this.selection.length ? 'layer' : 'canvas';
        this.showTab(this.activeTab, true);
      }
    } else {
      this.rootEl.appendChild(this.canvas.el);
      buildTabs(['shapes', 'layers', 'canvas', 'layer', 'modifiers', 'variables']);
      this.rootEl.appendChild(this.sheetEl!);
      this.rootEl.appendChild(this.tabsEl!);
      if (!this.tabButtons.has(this.activeTab)) this.activeTab = this.tabButtons.keys().next().value ?? 'shapes';
      this.showTab(this.activeTab);
    }
    this.refresh(false);
    requestAnimationFrame(() => {
      if (!this.destroyed) this.canvas.fitToView();
    });
  }

  /** Current widths of the desktop panels. */
  getPanelWidths(): PanelWidths {
    return { ...this.panelWidths };
  }

  /** Set the desktop panel widths (px); values are clamped so the canvas keeps some room. */
  setPanelWidths(widths: Partial<PanelWidths>, notify = true): void {
    const next = { ...this.panelWidths, ...widths };
    for (const k of ['library', 'side'] as const) {
      const w = next[k];
      next[k] = Number.isFinite(w) ? Math.max(PANEL_MIN[k], Math.round(w)) : DEFAULT_PANEL_WIDTHS[k];
    }
    // Never let the two panels squeeze the canvas out (when the editor has a measurable width).
    const total = this.rootEl.clientWidth;
    if (total > 0) {
      const hasLibrary = !!this.library && this.rootEl.dataset.noLibrary === undefined;
      const hasSide = (!!this.layersPanel || !!this.propsPanel) && this.rootEl.dataset.noSide === undefined;
      const spare = total - CANVAS_MIN_WIDTH - (hasLibrary ? PANEL_MIN.library : 0) - (hasSide ? PANEL_MIN.side : 0);
      if (spare > 0) {
        if (hasLibrary) next.library = Math.min(next.library, PANEL_MIN.library + Math.max(0, spare - (hasSide ? next.side - PANEL_MIN.side : 0)));
        if (hasSide) next.side = Math.min(next.side, PANEL_MIN.side + Math.max(0, spare - (hasLibrary ? next.library - PANEL_MIN.library : 0)));
      }
    }
    const changed = next.library !== this.panelWidths.library || next.side !== this.panelWidths.side;
    this.panelWidths = next;
    this.rootEl.style.setProperty('--_slt-library-w', `${next.library}px`);
    this.rootEl.style.setProperty('--_slt-side-w', `${next.side}px`);
    if (changed && notify) this.emit('panelresize', this.getPanelWidths());
  }

  /** A draggable border on a desktop panel; double-click restores the default width. */
  private panelResizer(panel: keyof PanelWidths): HTMLElement {
    const handle = el('div', { class: 'slt-resizer', dataset: { panel }, title: 'Drag to resize · double-click to reset' });
    let startX = 0;
    let startW = 0;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      this.setPanelWidths({ [panel]: startW + (panel === 'library' ? dx : -dx) } as Partial<PanelWidths>, false);
    };
    const end = (e: PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      delete handle.dataset.active;
      delete this.rootEl.dataset.resizing;
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      this.emit('panelresize', this.getPanelWidths());
      this.canvas.fitToView();
    };
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startX = e.clientX;
      startW = this.panelWidths[panel];
      handle.dataset.active = '';
      this.rootEl.dataset.resizing = '';
      handle.setPointerCapture(e.pointerId);
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
    handle.addEventListener('dblclick', () => {
      this.setPanelWidths({ [panel]: DEFAULT_PANEL_WIDTHS[panel] } as Partial<PanelWidths>);
      this.canvas.fitToView();
    });
    return handle;
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
      let panel: HTMLElement | undefined;
      if (tab === 'shapes') panel = this.library?.el;
      else if (tab === 'layers') panel = this.layersPanel?.el;
      else if (tab === 'modifiers') {
        this.modifiersPanel ??= new ModifiersPanel(this);
        this.modifiersPanel.render();
        panel = this.modifiersPanel.el;
      } else if (tab === 'variables') {
        this.variablesPanel ??= new VariablesPanel(this);
        this.variablesPanel.render();
        panel = this.variablesPanel.el;
      } else {
        panel = this.propsPanel?.el;
        if (this.propsPanel) {
          this.propsPanel.mode = tab === 'canvas' ? 'document' : 'layer';
          this.propsPanel.render();
        }
      }
      if (panel) this.sheetEl.appendChild(panel);
      delete this.rootEl.dataset.sheetClosed;
    } else {
      this.rootEl.dataset.sheetClosed = '';
    }
    this.canvas.renderOverlay();
    requestAnimationFrame(() => {
      if (!this.destroyed) this.canvas.renderOverlay();
    });
  }

  private toggleTab(tab: MobileTab): void {
    // Desktop tabs cannot collapse (the side column keeps its width); mobile ones can.
    if (this.layout === 'mobile' && this.activeTab === tab && this.sheetOpen) this.showTab(tab, false);
    else this.showTab(tab, true);
  }

  /** True while the given tool tab is the visible one (either layout). */
  isTabOpen(tab: MobileTab): boolean {
    return this.sheetOpen && this.activeTab === tab && this.tabButtons.has(tab);
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
    // Selecting something while looking at canvas settings jumps to the layer settings.
    if (ids.length && this.activeTab === 'canvas' && this.sheetOpen && this.tabButtons.has('layer')) this.showTab('layer');
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
      color: this.nextColor(count),
      ...(init as object),
    });
    this.store.commit((d) => insertLayer(d, layer, parentId, index));
    this.select([layer.id]);
    if (this.tabButtons.has('layer')) this.showTab('layer');
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
    this.updateTips();
    this.refresh(false);
  }

  /** Renderer options that enforce the current colour mode (used for canvas and export). */
  renderOptions(): RenderOptions {
    const f = this.features;
    const out: RenderOptions = f.colorMode === 'full' ? {} : { colorMode: f.colorMode, monoColor: f.monoColor };
    const vars = { ...this.appVariableValues(), ...this.variableOverrides };
    if (Object.keys(vars).length) out.variables = vars;
    return out;
  }

  /** Toggle snapping to the document grid. */
  setSnap(on: boolean): void {
    if (this.snap === on) return;
    this.snap = on;
    this.toolbar?.render();
    this.emit('snapchange', on);
  }

  /** The document grid (defaults when a loaded file has none). */
  get grid() {
    return this.store.doc.grid ?? DEFAULT_GRID;
  }

  /** Toggle the exact-output preview on the canvas. */
  setPreview(on: boolean): void {
    if (this.preview === on) return;
    this.preview = on;
    this.refresh(false);
    this.emit('previewchange', on);
  }

  /** Extra, editor-only render options for the canvas (never applied to exports). */
  canvasRenderOptions(): RenderOptions {
    const f = this.features;
    const out: RenderOptions = { ...this.renderOptions(), maskPreviewOpacity: f.maskPreview ? 0.25 : 0, activeIds: this.selection };
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
    if (this.sheetOpen) {
      if (this.activeTab === 'modifiers') this.modifiersPanel?.render();
      if (this.activeTab === 'variables') this.variablesPanel?.render();
    }
    this.syncAnimation();
  }

  // -------------------------------------------------------------------------
  // Variables

  /**
   * Feed live values for variables (by name) from the host app; the canvas
   * updates immediately. Values for names in a registered group update that
   * group's displayed value as well.
   */
  setVariables(values: Env): void {
    this.variableOverrides = { ...this.variableOverrides, ...values };
    for (const g of this.variableGroups) {
      for (const v of g.variables) if (v.name in values) v.value = values[v.name];
    }
    this.canvas.render();
    this.refreshVariablesPanel();
  }

  clearVariables(): void {
    this.variableOverrides = {};
    this.canvas.render();
    this.refreshVariablesPanel();
  }

  /**
   * Register (or replace, by id) a group of app variables. They appear as a
   * collapsible list in the Variables panel and are defined in every formula
   * environment, so formulas can use them without errors.
   */
  registerVariables(group: VariableGroup): void {
    const copy = cloneGroup(group);
    const i = this.variableGroups.findIndex((g) => g.id === group.id);
    if (i < 0) this.variableGroups.push(copy);
    else this.variableGroups[i] = copy;
    this.canvas.render();
    this.refreshVariablesPanel();
  }

  unregisterVariables(groupId: string): void {
    this.variableGroups = this.variableGroups.filter((g) => g.id !== groupId);
    this.canvas.render();
    this.refreshVariablesPanel();
  }

  /** Add (or replace, by id) app-specific "+ add variable" buttons in the Variables panel. */
  registerVariablePresets(presets: VariablePreset[]): void {
    for (const p of presets) {
      const i = this.variablePresets.findIndex((x) => x.id === p.id);
      if (i < 0) this.variablePresets.push({ ...p });
      else this.variablePresets[i] = { ...p };
    }
    this.refreshVariablesPanel();
  }

  /** Remove presets by id, or all of them when no ids are given. */
  unregisterVariablePresets(ids?: string[]): void {
    this.variablePresets = ids ? this.variablePresets.filter((p) => !ids.includes(p.id)) : [];
    this.refreshVariablesPanel();
  }

  /** Insert a variable from a preset (or a partial), making its name unique; returns the variable. */
  addVariable(init: Partial<Variable> | VariablePreset = {}): Variable {
    const doc = this.store.doc;
    const isPreset = (x: Partial<Variable> | VariablePreset): x is VariablePreset => 'variable' in x && 'label' in x;
    const partial = isPreset(init) ? (typeof init.variable === 'function' ? init.variable(doc) : init.variable) : init;
    const names = new Set((doc.variables ?? []).map((v) => v.name));
    const base = (partial.name ?? 'value').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(?=\d)/, '_') || 'value';
    let name = base;
    for (let i = 1; names.has(name); i++) name = `${base}${i}`;
    const { id: _ignored, ...rest } = partial;
    const v = createVariable({ ...rest, name });
    if (v.min > v.max) [v.min, v.max] = [v.max, v.min];
    if (v.expression === undefined) v.value = Math.min(v.max, Math.max(v.min, v.value));
    this.store.update((d) => upsertVariable(d, v));
    this.store.endTransaction();
    return v;
  }

  /** Re-write the canvas hint and tooltips for the current input mode. */
  private updateTips(): void {
    this.canvas.updateHint();
    this.toolbar?.updateTips();
    this.layersPanel?.updateTips();
  }

  /** Whether hints are written for touch or for keyboard and mouse (see `features.input`). */
  inputMode(): 'touch' | 'mouse' {
    const f = this.features.input;
    if (f !== 'auto') return f;
    return this.layout === 'mobile' || this.coarsePointer ? 'touch' : 'mouse';
  }

  /** The platform's command modifier as shown in tips: ⌘ on Apple devices, Ctrl elsewhere. */
  modKey(): string {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl';
  }

  /** Append the shortcut to a tooltip when a keyboard is expected: `tip('Undo', 'Z')` → "Undo (Ctrl+Z)". */
  tip(label: string, keys?: string): string {
    if (!keys || this.inputMode() === 'touch') return label;
    return `${label} (${keys.replace(/Mod/g, this.modKey())})`;
  }

  /** Values of all registered app variables, by name (overrides applied on top by env()). */
  appVariableValues(): Env {
    const out: Env = {};
    for (const g of this.variableGroups) for (const v of g.variables) out[v.name] = v.value;
    return out;
  }

  /** Current expression environment: time built-ins, document variables, app variables, host overrides. */
  env(): Env {
    return documentEnv(this.store.doc, { ...this.appVariableValues(), ...this.variableOverrides });
  }

  private refreshVariablesPanel(): void {
    if (this.sheetOpen && this.activeTab === 'variables') this.variablesPanel?.render();
    if (this.propsPanel && this.propsPanel.mode === 'auto') this.propsPanel.render();
  }

  /** The document with all bindings evaluated (what the canvas shows and geometry uses). */
  resolvedDocument(): SvgDocument {
    return resolveDocument(this.store.doc, this.env());
  }

  /** Re-render on a timer while any binding depends on the time built-ins. */
  private syncAnimation(): void {
    const wants = this.features.variables && documentUsesTime(this.store.doc) && !this.destroyed;
    if (wants && !this.animTimer) {
      this.animTimer = setInterval(() => {
        if (this.destroyed) return;
        this.canvas.render();
      }, 200);
    } else if (!wants && this.animTimer) {
      clearInterval(this.animTimer);
      this.animTimer = null;
    }
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
      const g = this.grid;
      const step = this.snap ? (key === 'arrowleft' || key === 'arrowright' ? g.width : g.height) : e.shiftKey ? 10 : 1;
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
    if (this.animTimer) clearInterval(this.animTimer);
    this.layoutObserver?.disconnect();
    this.canvas.destroy();
    this.toolbar?.destroy();
    this.removeAllListeners();
    this.rootEl.remove();
    if (this.root instanceof ShadowRoot) this.root.replaceChildren();
  }
}
