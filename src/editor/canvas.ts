import {
  applyToPoint,
  applyToVector,
  anchorAxes,
  anchorWorldPoint,
  layerCentreWorld,
  layerWorldMatrix,
  layerLocalBounds,
  setBinding,
  snapTo,
  layerBox,
  findLayer,
  documentEnv,
  layerWorldBounds,
  resolveDocument,
  TIME_VARIABLE_NAMES,
  unionRects,
  invert,
  layerFrameBounds,
  layerFrameMatrix,
  rotateLayer,
  scaleLayerBox,
  locateLayer,
  multiply,
  parentWorldMatrix,
  rectCorners,
  renderDocumentParts,
  updateLayer,
  vnodeToDom,
  type Layer,
  type Mat,
  type Point,
  type Rect,
  type SvgDocument,
} from '../core';
import { clear, el, svgEl } from './dom';
import type { SvgLayEditor } from './editor';
import { icon } from './icons';
import { moveArrows } from './preferences';
import { tryableVariables } from './variables-panel';

type HandleDir = { hx: -1 | 0 | 1; hy: -1 | 0 | 1 };

const HANDLES: Record<string, HandleDir> = {
  nw: { hx: -1, hy: -1 },
  n: { hx: 0, hy: -1 },
  ne: { hx: 1, hy: -1 },
  e: { hx: 1, hy: 0 },
  se: { hx: 1, hy: 1 },
  s: { hx: 0, hy: 1 },
  sw: { hx: -1, hy: 1 },
  w: { hx: -1, hy: 0 },
};

type DragState =
  | {
      kind: 'move';
      startWorld: Point;
      origDoc: SvgDocument;
      items: { id: string; x: number; y: number; parentInv: Mat }[];
      moved: boolean;
      /** Lines to snap to (world x and y of other layers' edges and centres, and the canvas's), found once. */
      targets?: { xs: number[]; ys: number[]; box: Rect | null };
    }
  | {
      kind: 'scale';
      id: string;
      dir: HandleDir;
      origDoc: SvgDocument;
      layer: Layer;
      frameInv: Mat;
      frame: Rect;
    }
  | { kind: 'rotate'; id: string; origDoc: SvgDocument; layer: Layer; pivotWorld: Point; startAngle: number; ringR: number }
  | { kind: 'pan'; startScreen: Point; startPan: Point }
  | { kind: 'pinch'; startDist: number; startZoom: number; startPan: Point; startMid: Point }
  | { kind: 'press'; startScreen: Point; deepId: string | null; timer: ReturnType<typeof setTimeout> }
  | { kind: 'anchor'; id: string; bindingId: string; localInv: Mat; box: Rect; mode: 'box' | 'px' | 'layer'; centre: Point | null }
  /** Preview: a press on a hotspot, handed to the editor's interaction. */
  | { kind: 'interact' };

let instanceCounter = 0;

/** The interactive drawing surface. */
export class CanvasView {
  readonly el: HTMLDivElement;
  /** Host for the layer strip (filled by the editor). */
  readonly stripSlot: HTMLDivElement;
  private stageWrap: HTMLDivElement;
  private stage: SVGSVGElement;
  private activeHandle: string | null = null;
  private lifted = false;
  private lastRingR = 0;
  private staticDefs: SVGDefsElement;
  private docDefs: SVGDefsElement;
  private viewG: SVGGElement;
  private checker: SVGRectElement;
  private pattern: SVGPatternElement;
  private clipRect: SVGRectElement;
  private docG: SVGGElement;
  private frameRect: SVGRectElement;
  private gridPattern: SVGPatternElement;
  private gridPath: SVGPathElement;
  private gridRect: SVGRectElement;
  private overlay: SVGGElement;
  private hint: HTMLDivElement;
  private pad: HTMLDivElement;
  private padKnob: HTMLSpanElement;
  private padZoom: HTMLInputElement;
  private drag: DragState | null = null;
  /** The pointer type of the press in progress (touch rules differ: see EditorPreferences.canvasTouch). */
  private pointerType = 'mouse';
  /** Where a drag acts: the pointer, or (fine drag) a point that follows it more slowly. */
  private virt: { last: Point; at: Point } | null = null;
  /** Fine drag switched on from the nudge pad (touch); Ctrl/⌘ does it with a mouse. */
  private fineOn = false;
  private fineHeld = false;
  /** A press that may turn out to be a tap (tap to select). */
  private tapStart: { screen: Point; client: Point; time: number } | null = null;
  private loupe: SVGGElement;
  private nudge: HTMLDivElement;
  private nudgeBig = false;
  private toast: HTMLDivElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** Guide lines shown while a move snaps to other shapes (world x / y). */
  private guides: { x?: number; y?: number } = {};
  private trailCache: { doc: SvgDocument; key: string; polys: Point[][] } | null = null;
  private pointers = new Map<number, Point>();
  private coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  private spaceDown = false;
  private resizeObserver: ResizeObserver | null = null;
  private readonly idPrefix: string;
  private disposers: (() => void)[] = [];

  constructor(private editor: SvgLayEditor) {
    this.idPrefix = `slt${instanceCounter++}-`;
    this.pattern = svgEl('pattern', { id: `${this.idPrefix}checker`, patternUnits: 'userSpaceOnUse', width: 24, height: 24 }, [
      svgEl('rect', { width: 24, height: 24, fill: 'var(--_slt-checker-b)' }),
      svgEl('rect', { width: 12, height: 12, fill: 'var(--_slt-checker-a)' }),
      svgEl('rect', { x: 12, y: 12, width: 12, height: 12, fill: 'var(--_slt-checker-a)' }),
    ]);
    this.clipRect = svgEl('rect', { x: 0, y: 0, width: 1, height: 1 });
    this.staticDefs = svgEl('defs', {}, [this.pattern, svgEl('clipPath', { id: `${this.idPrefix}clip` }, [this.clipRect])]);
    this.docDefs = svgEl('defs');
    this.checker = svgEl('rect', { fill: `url(#${this.idPrefix}checker)` });
    this.docG = svgEl('g', { class: 'slt-doc', 'clip-path': `url(#${this.idPrefix}clip)` });
    this.frameRect = svgEl('rect', { class: 'slt-doc-frame' });
    this.gridPath = svgEl('path', { class: 'slt-grid-lines', fill: 'none' });
    this.gridPattern = svgEl('pattern', { id: `${this.idPrefix}grid`, patternUnits: 'userSpaceOnUse', width: 32, height: 32 }, [this.gridPath]);
    this.staticDefs.appendChild(this.gridPattern);
    this.gridRect = svgEl('rect', { fill: `url(#${this.idPrefix}grid)`, 'pointer-events': 'none' });
    this.viewG = svgEl('g', { class: 'slt-view' }, [this.checker, this.docG, this.gridRect, this.frameRect]);
    this.overlay = svgEl('g', { class: 'slt-overlay' });
    this.viewG.id = `${this.idPrefix}view`;
    this.overlay.id = `${this.idPrefix}overlay`;
    this.loupe = svgEl('g', { class: 'slt-loupe', 'pointer-events': 'none' });
    this.stage = svgEl('svg', { class: 'slt-stage' }, [this.staticDefs, this.docDefs, this.viewG, this.overlay, this.loupe]);
    this.hint = el('div', { class: 'slt-canvas-hint' }, ['Scroll to pan · Ctrl+scroll to zoom · Space+drag to pan']);
    this.stripSlot = el('div', { class: 'slt-strip-slot' });
    this.padKnob = el('span', { class: 'slt-viewpad-knob' });
    this.padZoom = el('input', { class: 'slt-viewpad-zoom', type: 'range', min: -4.3, max: 5, step: 0.01, value: 0, 'aria-label': 'Zoom' });
    this.pad = this.buildPad();
    this.nudge = this.buildNudge();
    this.toast = el('div', { class: 'slt-canvas-toast', role: 'status', 'aria-live': 'polite' });
    this.stageWrap = el('div', { class: 'slt-stage-wrap' }, [this.stage, this.hint, this.pad, this.nudge, this.toast]);
    this.el = el('div', { class: 'slt-canvas', tabindex: 0 }, [this.stripSlot, this.stageWrap]);

    this.bind();
  }

  private bind(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | SVGElement | Window,
      ev: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(ev, fn as EventListener, opts);
      this.disposers.push(() => target.removeEventListener(ev, fn as EventListener, opts));
    };
    on(this.stage, 'pointerdown', (e) => this.onPointerDown(e));
    on(this.stage, 'pointermove', (e) => this.onPointerMove(e));
    on(this.stage, 'pointerup', (e) => this.onPointerUp(e));
    on(this.stage, 'pointercancel', (e) => this.onPointerUp(e));
    on(this.stage, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(this.el, 'keydown', (e) => {
      if (e.key === ' ' && !this.spaceDown) {
        this.spaceDown = true;
        this.stage.classList.add('slt-panning');
        e.preventDefault();
      }
    });
    on(this.el, 'keyup', (e) => {
      if (e.key === ' ') this.releaseSpace();
    });
    on(window, 'blur', () => this.releaseSpace());
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.renderOverlay());
      this.resizeObserver.observe(this.stageWrap);
    }
  }

  private releaseSpace(): void {
    this.spaceDown = false;
    this.stage.classList.remove('slt-panning');
  }

  destroy(): void {
    if (this.drag?.kind === 'press') clearTimeout(this.drag.timer);
    for (const d of this.disposers) d();
    this.resizeObserver?.disconnect();
  }

  // -------------------------------------------------------------------------
  // Coordinates

  private get view() {
    return this.editor.view;
  }

  screenToWorld(p: Point): Point {
    const v = this.view;
    return { x: (p.x - v.panX) / v.zoom, y: (p.y - v.panY) / v.zoom };
  }

  worldToScreen(p: Point): Point {
    const v = this.view;
    return { x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY };
  }

  private eventScreen(e: MouseEvent): Point {
    const r = this.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  viewCentreWorld(): Point {
    return this.screenToWorld({ x: this.stageWrap.clientWidth / 2, y: this.stageWrap.clientHeight / 2 });
  }

  /** Update the hint text for the current interaction mode. */
  updateHint(): void {
    const hold = this.editor.features.canvasInteraction === 'hold';
    const mod = this.editor.modKey();
    const p = this.editor.preferences;
    this.updatePad();
    if (p.lockView) {
      this.hint.textContent = 'The view is locked: the pad and the toolbar still move it';
    } else if (this.editor.inputMode() === 'touch' && p.canvasTouch === 'pad') {
      this.hint.textContent = 'The pad moves the view · pinch to zoom · drag the ✥ handle to move a layer';
    } else if (this.editor.inputMode() === 'touch') {
      this.hint.textContent = hold
        ? 'Drag to pan · pinch to zoom · hold a layer to pick it up'
        : 'Drag the selected layer to move it · drag elsewhere to pan · pinch to zoom';
    } else {
      this.hint.textContent = hold
        ? `Drag to pan · ${mod}+scroll to zoom · hold a layer to pick it up`
        : `Scroll to pan · ${mod}+scroll to zoom · Space+drag to pan`;
    }
  }

  setZoom(zoom: number, aroundScreen?: Point): void {
    const z = Math.max(0.05, Math.min(32, zoom));
    const v = this.view;
    const c = aroundScreen ?? { x: this.stageWrap.clientWidth / 2, y: this.stageWrap.clientHeight / 2 };
    const f = z / v.zoom;
    v.panX = c.x - (c.x - v.panX) * f;
    v.panY = c.y - (c.y - v.panY) * f;
    v.zoom = z;
    this.render();
    this.editor.viewChanged();
  }

  fitToView(): void {
    const doc = this.editor.document;
    const w = this.stageWrap.clientWidth || 800;
    const h = this.stageWrap.clientHeight || 600;
    const margin = 32;
    const zoom = Math.max(0.05, Math.min((w - margin * 2) / doc.width, (h - margin * 2) / doc.height));
    const v = this.view;
    v.zoom = zoom;
    v.panX = (w - doc.width * zoom) / 2;
    v.panY = (h - doc.height * zoom) / 2;
    this.render();
    this.editor.viewChanged();
  }

  /** Zoom and pan so a world rectangle fills the view (with a margin; at most 8×). */
  fitRect(r: Rect): void {
    const w = this.stageWrap.clientWidth || 800;
    const h = this.stageWrap.clientHeight || 600;
    const margin = 48;
    const zoom = Math.max(0.05, Math.min(8, (w - margin * 2) / Math.max(r.width, 1), (h - margin * 2) / Math.max(r.height, 1)));
    const v = this.view;
    v.zoom = zoom;
    v.panX = w / 2 - (r.x + r.width / 2) * zoom;
    v.panY = h / 2 - (r.y + r.height / 2) * zoom;
    this.render();
    this.editor.viewChanged();
  }

  /** The preferences changed: handles, the hint and the pad follow. */
  preferencesChanged(): void {
    const p = this.editor.preferences;
    this.el.style.setProperty('--_slt-handle-op', String(p.handleOpacity));
    this.el.style.setProperty('--_slt-marker-op', String(p.markerOpacity));
    this.updateHint();
    this.renderOverlay();
  }

  // -------------------------------------------------------------------------
  // The view pad: pan by dragging its disc, zoom with its slider, fit, 1:1, zoom to the selection.

  private buildPad(): HTMLDivElement {
    const ed = this.editor;
    const disc = el('div', { class: 'slt-viewpad-disc', title: 'Drag to move the view' }, [this.padKnob]);
    const step = (dx: number, dy: number) => {
      this.view.panX += dx;
      this.view.panY += dy;
      this.render();
      ed.viewChanged();
    };
    const arrows = [['n', 0, 60, 'up'], ['s', 0, -60, 'down'], ['w', 60, 0, 'left'], ['e', -60, 0, 'right']] as const;
    for (const [cls, dx, dy, label] of arrows) {
      const b = el('button', { type: 'button', class: `slt-viewpad-arrow slt-viewpad-${cls}`, title: `Move the view ${label}`, 'aria-label': `Move the view ${label}` }, [icon(cls === 's' ? 'down' : cls === 'n' ? 'up' : 'chevronRight')]);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => step(dx, dy));
      disc.appendChild(b);
    }
    let start: { x: number; y: number; panX: number; panY: number } | null = null;
    disc.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, panX: this.view.panX, panY: this.view.panY };
      disc.setPointerCapture(e.pointerId);
      disc.dataset.active = '';
      e.preventDefault();
    });
    disc.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      this.view.panX = start.panX + dx;
      this.view.panY = start.panY + dy;
      const k = Math.min(1, 22 / (Math.hypot(dx, dy) || 1));
      this.padKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.render();
      ed.viewChanged();
    });
    const end = () => {
      start = null;
      delete disc.dataset.active;
      this.padKnob.style.transform = '';
    };
    disc.addEventListener('pointerup', end);
    disc.addEventListener('pointercancel', end);
    this.padZoom.addEventListener('input', () => this.setZoom(2 ** Number(this.padZoom.value)));
    const small = (content: string | HTMLElement, title: string, fn: () => void) => {
      const b = el('button', { type: 'button', class: 'slt-viewpad-btn', title, 'aria-label': title }, [content]);
      b.addEventListener('click', fn);
      return b;
    };
    const pad = el('div', { class: 'slt-viewpad', role: 'group', 'aria-label': 'Move and zoom the view' }, [
      disc,
      el('div', { class: 'slt-viewpad-col' }, [
        small(icon('plus'), 'Zoom in', () => ed.zoomBy(1.25)),
        this.padZoom,
        small(icon('minus'), 'Zoom out', () => ed.zoomBy(0.8)),
      ]),
      el('div', { class: 'slt-viewpad-col' }, [
        small(icon('fit'), 'Fit to view', () => ed.fitToView()),
        small('1:1', 'Actual size (100%)', () => ed.setZoom(1)),
        small(icon('target'), 'Zoom to the selection', () => ed.zoomToSelection()),
      ]),
    ]);
    // Keep presses and scrolling on the pad off the canvas underneath.
    pad.addEventListener('pointerdown', (e) => e.stopPropagation());
    pad.addEventListener('wheel', (e) => e.stopPropagation());
    return pad;
  }

  private updatePad(): void {
    const p = this.editor.preferences;
    const show = this.editor.viewPadShown();
    this.pad.hidden = !show;
    this.pad.dataset.side = p.viewPad === 'left' ? 'left' : 'right';
    this.stageWrap.classList.toggle('slt-pad-left', show && p.viewPad === 'left');
  }

  // -------------------------------------------------------------------------
  // The nudge pad (touch): arrows that move the selection by 1 or 10 (the grid with Snap on); Fine.

  private buildNudge(): HTMLDivElement {
    const ed = this.editor;
    const pad = el('div', { class: 'slt-nudge', role: 'group', 'aria-label': 'Nudge the selected layer' });
    const fine = el('button', { type: 'button', class: 'slt-nudge-fine', title: 'Fine drag: moves, resizes and turns more slowly', 'aria-pressed': 'false' }, ['Fine']);
    fine.addEventListener('click', () => {
      this.fineOn = !this.fineOn;
      this.updateNudge();
    });
    const big = el('button', { type: 'button', class: 'slt-nudge-step', title: 'Step: 1 or 10' }, ['×1']);
    big.addEventListener('click', () => {
      this.nudgeBig = !this.nudgeBig;
      this.updateNudge();
    });
    const arrow = (dx: number, dy: number, label: string, ic: 'up' | 'down' | 'chevronRight', cls: string) => {
      const b = el('button', { type: 'button', class: `slt-nudge-arrow ${cls}`, title: `Nudge ${label}`, 'aria-label': `Nudge ${label}` }, [icon(ic)]);
      let timer: ReturnType<typeof setTimeout> | null = null;
      const step = () => {
        const g = ed.grid;
        const n = ed.snap ? (dx ? g.width : g.height) : this.nudgeBig ? 10 : 1;
        ed.nudgeSelection(dx * n, dy * n);
      };
      const stop = () => {
        if (timer) clearTimeout(timer);
        timer = null;
      };
      // Held down, it repeats.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        step();
        stop();
        const again = () => {
          step();
          timer = setTimeout(again, 70);
        };
        timer = setTimeout(again, 400);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') step();
      });
      return b;
    };
    const blank = () => el('span', { class: 'slt-nudge-blank' });
    pad.append(
      fine, arrow(0, -1, 'up', 'up', ''), blank(),
      arrow(-1, 0, 'left', 'chevronRight', 'slt-nudge-left'), big, arrow(1, 0, 'right', 'chevronRight', ''),
      blank(), arrow(0, 1, 'down', 'down', ''), blank(),
    );
    pad.addEventListener('pointerdown', (e) => e.stopPropagation());
    pad.addEventListener('wheel', (e) => e.stopPropagation());
    return pad;
  }

  private updateNudge(): void {
    const ed = this.editor;
    const p = ed.preferences;
    const show = p.nudgePad && ed.inputMode() === 'touch' && ed.selection.length > 0 && !ed.preview;
    this.nudge.hidden = !show;
    this.nudge.dataset.side = p.viewPad === 'left' && ed.viewPadShown() ? 'right' : 'left';
    const fine = this.nudge.querySelector('.slt-nudge-fine') as HTMLButtonElement;
    fine.setAttribute('aria-pressed', this.fineOn ? 'true' : 'false');
    fine.toggleAttribute('data-active', this.fineOn);
    (this.nudge.querySelector('.slt-nudge-step') as HTMLButtonElement).textContent = this.nudgeBig ? '×10' : '×1';
  }

  /** A short message over the canvas (what a tap picked). */
  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.dataset.show = '';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => delete this.toast.dataset.show, 2400);
  }

  /** Layers drawn at a client point, top first (any layer, not just the selected one; locked ones skipped). */
  layersAt(client: Point): string[] {
    const exact: string[] = [];
    const near: string[] = [];
    const tol = this.coarse ? 12 : 6;
    for (const g of this.docG.querySelectorAll('path, rect, ellipse, circle, polygon, polyline, line, text')) {
      if (g.closest('mask, clipPath, defs, pattern, [data-mask-preview]')) continue;
      const holder = g.closest('[data-layer-id]');
      if (!holder || holder.closest('[data-locked]')) continue;
      const id = holder.getAttribute('data-layer-id')!;
      const shape = g as SVGGeometryElement;
      const ctm = shape.getScreenCTM?.();
      if (!ctm) continue;
      const pt = new DOMPoint(client.x, client.y).matrixTransform(ctm.inverse());
      let hit = false;
      try {
        hit = typeof shape.isPointInFill === 'function' && (shape.isPointInFill(pt) || shape.isPointInStroke(pt));
      } catch {
        hit = false;
      }
      if (hit) {
        exact.push(id);
        continue;
      }
      // Thin or tiny things: close enough counts, after anything hit exactly.
      try {
        const b = shape.getBBox();
        const k = tol / Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c) || 1);
        if (pt.x >= b.x - k && pt.x <= b.x + b.width + k && pt.y >= b.y - k && pt.y <= b.y + b.height + k) near.push(id);
      } catch {
        /* not rendered */
      }
    }
    const list = [...exact.reverse(), ...near.reverse()];
    return [...new Set(list)];
  }

  /** A tap or click on the canvas: select what's there, or (again) what's under the selected layer. */
  private tapSelect(client: Point): void {
    const ed = this.editor;
    const ids = this.layersAt(client);
    if (!ids.length) return;
    const cur = ed.selection.length === 1 ? ids.indexOf(ed.selection[0]) : -1;
    const i = cur >= 0 ? (cur + 1) % ids.length : 0;
    if (ids[i] === ed.selection[0] && ed.selection.length === 1) return;
    ed.select([ids[i]]);
    const name = (id: string) => findLayer(ed.document, id)?.name || 'layer';
    this.showToast(ids.length > 1 ? `${name(ids[i])} · ${i + 1} of ${ids.length} here · tap again for ${name(ids[(i + 1) % ids.length])}` : name(ids[i]));
  }

  /** Whether a single pointer dragging the canvas may pan the view. */
  private panAllowed(): boolean {
    const p = this.editor.preferences;
    if (p.lockView) return false;
    return !(this.pointerType !== 'mouse' && p.canvasTouch === 'pad');
  }

  // -------------------------------------------------------------------------
  // Rendering

  render(): void {
    const doc = this.editor.document;
    const v = this.view;
    if (!this.padZoom.matches(':active')) this.padZoom.value = String(Math.log2(v.zoom));
    this.viewG.setAttribute('transform', `translate(${v.panX} ${v.panY}) scale(${v.zoom})`);
    const cell = 24 / v.zoom;
    this.pattern.setAttribute('width', String(cell));
    this.pattern.setAttribute('height', String(cell));
    const rects = this.pattern.children;
    (rects[0] as SVGRectElement).setAttribute('width', String(cell));
    (rects[0] as SVGRectElement).setAttribute('height', String(cell));
    for (const i of [1, 2]) {
      const r = rects[i] as SVGRectElement;
      r.setAttribute('width', String(cell / 2));
      r.setAttribute('height', String(cell / 2));
      if (i === 2) {
        r.setAttribute('x', String(cell / 2));
        r.setAttribute('y', String(cell / 2));
      }
    }
    for (const r of [this.checker, this.clipRect, this.frameRect, this.gridRect]) {
      r.setAttribute('width', String(doc.width));
      r.setAttribute('height', String(doc.height));
    }
    const grid = this.editor.grid;
    const showGrid = grid.visible && !this.editor.preview && grid.opacity > 0;
    this.gridRect.style.display = showGrid ? '' : 'none';
    if (showGrid) {
      this.gridPattern.setAttribute('width', String(grid.width));
      this.gridPattern.setAttribute('height', String(grid.height));
      this.gridPath.setAttribute('d', `M${grid.width} 0 L0 0 0 ${grid.height}`);
      this.gridRect.setAttribute('opacity', String(grid.opacity));
    }

    // Bindings are evaluated by the renderer itself (with the host's variable overrides).
    const { defs, body } = this.editor.preview
      ? renderDocumentParts(doc, { idPrefix: this.idPrefix, ...this.editor.renderOptions() })
      : renderDocumentParts(doc, { idPrefix: this.idPrefix, interactive: true, ...this.editor.canvasRenderOptions() });
    this.stage.classList.toggle('slt-preview', this.editor.preview);
    clear(this.docDefs);
    for (const d of defs) this.docDefs.appendChild(vnodeToDom(d));
    clear(this.docG);
    for (const b of body) this.docG.appendChild(vnodeToDom(b));
    this.renderOverlay();
  }

  /** Frame (translation + rotation) of a layer in screen space, plus its axis-aligned box in that frame. */
  private screenFrame(id: string): { toScreen: (p: Point) => Point; box: Rect; layer: Layer } | null {
    const doc = this.editor.resolvedDocument();
    const layer = findLayer(doc, id);
    if (!layer) return null;
    const box = layerFrameBounds(layer);
    if (!box) return null;
    const frameWorld = multiply(parentWorldMatrix(doc, id), layerFrameMatrix(layer));
    return { toScreen: (p) => this.worldToScreen(applyToPoint(frameWorld, p)), box, layer };
  }

  renderOverlay(): void {
    clear(this.overlay);
    clear(this.loupe);
    const ed = this.editor;
    if (ed.preview) {
      this.updateNudge();
      return;
    }
    const pts = (corners: Point[]) => corners.map((p) => `${p.x},${p.y}`).join(' ');

    if (ed.hoverId && !ed.selection.includes(ed.hoverId) && !this.drag) {
      const f = this.screenFrame(ed.hoverId);
      if (f) this.overlay.appendChild(svgEl('polygon', { class: 'slt-hover-outline', points: pts(rectCorners(f.box).map(f.toScreen)) }));
    }

    if (ed.selection.length === 1 && ed.isTabOpen('variables') && ed.preferences.motionTrail && !this.drag) this.renderTrail(ed.selection[0]);

    const rotating = this.drag?.kind === 'rotate';
    for (const id of ed.selection) {
      if (rotating) break; // the box is meaningless mid-rotation; it is recalculated on release
      const f = this.screenFrame(id);
      if (!f) continue;
      const cls = this.lifted && this.drag?.kind === 'move' ? 'slt-sel-outline slt-lifted' : 'slt-sel-outline';
      this.overlay.appendChild(svgEl('polygon', { class: cls, points: pts(rectCorners(f.box).map(f.toScreen)) }));
    }
    if (this.drag?.kind === 'press') {
      // Feedback while a hold is charging: ring around the press point.
      this.overlay.appendChild(svgEl('circle', { class: 'slt-press-ring', cx: this.drag.startScreen.x, cy: this.drag.startScreen.y, r: this.coarse ? 26 : 16 }));
    }

    if (ed.selection.length === 1) {
      const f = this.screenFrame(ed.selection[0]);
      if (f && !f.layer.locked) this.renderHandles(f);
      if (ed.isTabOpen('variables')) this.renderAnchors(ed.selection[0]);
    }
    this.renderGuides();
    this.renderReadout();
    this.renderLoupe();
    this.updateNudge();

  }

  private renderHandles(f: { toScreen: (p: Point) => Point; box: Rect; layer: Layer }): void {
    const { box, toScreen, layer } = f;
    const prefs = this.editor.preferences;
    const size = prefs.handleSize ?? (this.coarse ? 16 : 8);
    const reachPad = prefs.touchArea;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Screen angle of the frame's x axis, used to pick resize cursors.
    const o = toScreen({ x: cx, y: cy });
    const ax = toScreen({ x: cx + 1, y: cy });
    const frameAngle = (Math.atan2(ax.y - o.y, ax.x - o.x) * 180) / Math.PI;
    const rotating = this.drag?.kind === 'rotate';

    // Rotation ring: independent of the box, centred on the pivot, handle at the current angle.
    const pivot = toScreen({ x: 0, y: 0 });
    const corners = rectCorners(box).map(toScreen);
    const reach = Math.max(...corners.map((c) => Math.hypot(c.x - pivot.x, c.y - pivot.y)));
    // While turning, keep the ring where it was grabbed; it is re-fitted to the new box on release.
    const ringR = this.drag?.kind === 'rotate' ? this.drag.ringR : reach + (this.coarse ? 28 : 18);
    this.lastRingR = ringR;
    const rotActive = this.activeHandle === 'rotate';
    const rotDeg = layer.rotation;
    const worldAngle = (rotDeg - 90) * (Math.PI / 180) + (frameAngle * Math.PI) / 180;
    const hp = { x: pivot.x + Math.cos(worldAngle) * ringR, y: pivot.y + Math.sin(worldAngle) * ringR };
    this.overlay.appendChild(svgEl('circle', { class: rotating ? 'slt-rotate-ring slt-rotate-ring-active' : 'slt-rotate-ring', cx: pivot.x, cy: pivot.y, r: ringR }));
    if (rotating) {
      // zero mark and a spoke to the handle while turning
      const zero = { x: pivot.x + Math.cos((frameAngle - 90) * (Math.PI / 180)) * ringR, y: pivot.y + Math.sin((frameAngle - 90) * (Math.PI / 180)) * ringR };
      this.overlay.appendChild(svgEl('line', { class: 'slt-rotate-line', x1: zero.x, y1: zero.y, x2: zero.x + (zero.x - pivot.x) * 0.06, y2: zero.y + (zero.y - pivot.y) * 0.06 }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-rotate-line', x1: pivot.x, y1: pivot.y, x2: hp.x, y2: hp.y }));
      this.overlay.appendChild(svgEl('circle', { class: 'slt-pivot', cx: pivot.x, cy: pivot.y, r: 3 }));
      const label = svgEl('text', { class: 'slt-rotate-label', x: pivot.x, y: pivot.y - ringR - 10, 'text-anchor': 'middle' }, [`${Math.round(rotDeg)}°`]);
      this.overlay.appendChild(label);
    }
    const rr = Math.max(5, size * 0.72) * (rotActive ? 1.4 : 1);
    this.overlay.appendChild(
      svgEl('circle', { class: rotActive ? 'slt-handle-rotate slt-handle-active' : 'slt-handle-rotate', cx: hp.x, cy: hp.y, r: rr, 'data-handle': 'rotate' }),
    );
    if (reachPad > 0) this.overlay.appendChild(svgEl('circle', { class: 'slt-hit', cx: hp.x, cy: hp.y, r: rr + reachPad, 'data-handle': 'rotate', style: 'cursor:grab' }));
    if (rotating) return; // no scale handles while rotating

    for (const [name, dir] of Object.entries(HANDLES)) {
      const p = toScreen({ x: cx + (dir.hx * box.width) / 2, y: cy + (dir.hy * box.height) / 2 });
      const handleAngle = (Math.atan2(dir.hy, dir.hx) * 180) / Math.PI + frameAngle;
      const active = this.activeHandle === name;
      const sz = active ? size * 1.6 : size;
      const h = svgEl('rect', {
        class: active ? 'slt-handle slt-handle-active' : 'slt-handle',
        x: p.x - sz / 2,
        y: p.y - sz / 2,
        width: sz,
        height: sz,
        rx: active ? 3 : 0,
        'data-handle': name,
        style: `cursor:${resizeCursor(handleAngle)}`,
      });
      this.overlay.appendChild(h);
      if (reachPad > 0) {
        const hs = sz + reachPad * 2;
        this.overlay.appendChild(svgEl('rect', { class: 'slt-hit', x: p.x - hs / 2, y: p.y - hs / 2, width: hs, height: hs, 'data-handle': name, style: `cursor:${resizeCursor(handleAngle)}` }));
      }
    }

    // The move handle: in the middle of the box, or beside it when the box is too small to hold it.
    const showMove = prefs.moveHandle === 'always' || (prefs.moveHandle === 'touch' && this.editor.inputMode() === 'touch');
    if (showMove && this.drag?.kind !== 'scale') {
      const r = Math.max(10, size * 0.85);
      const toward = (hx: number, hy: number) => toScreen({ x: cx + (hx * box.width) / 2, y: cy + (hy * box.height) / 2 });
      const e = toward(1, 0), s = toward(0, 1);
      const wS = Math.hypot(e.x - o.x, e.y - o.y) * 2, hS = Math.hypot(s.x - o.x, s.y - o.y) * 2;
      let m = o;
      if (wS < r * 4 || hS < r * 4) {
        // beside the narrower side: along the frame's x axis for a tall shape, else below
        const [ref, half] = wS <= hS ? [e, wS / 2] : [s, hS / 2];
        const len = Math.hypot(ref.x - o.x, ref.y - o.y);
        const u = len > 1e-6 ? { x: (ref.x - o.x) / len, y: (ref.y - o.y) / len } : wS <= hS ? { x: 1, y: 0 } : { x: 0, y: 1 };
        m = { x: o.x + u.x * (half + r + 10), y: o.y + u.y * (half + r + 10) };
        this.overlay.appendChild(svgEl('line', { class: 'slt-move-link', x1: o.x, y1: o.y, x2: m.x, y2: m.y }));
      }
      const active = this.activeHandle === 'move';
      this.overlay.appendChild(svgEl('circle', { class: active ? 'slt-move-handle slt-move-active' : 'slt-move-handle', cx: m.x, cy: m.y, r, 'data-handle': 'move' }));
      this.overlay.appendChild(moveArrows(m.x, m.y, r));
      if (reachPad > 0) this.overlay.appendChild(svgEl('circle', { class: 'slt-hit', cx: m.x, cy: m.y, r: r + reachPad, 'data-handle': 'move', style: 'cursor:move' }));
    }

    if (layer.type === 'group') {
      const piv = toScreen({ x: 0, y: 0 });
      this.overlay.appendChild(svgEl('circle', { class: 'slt-pivot', cx: piv.x, cy: piv.y, r: 4, fill: 'none' }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-pivot', x1: piv.x - 7, y1: piv.y, x2: piv.x + 7, y2: piv.y }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-pivot', x1: piv.x, y1: piv.y - 7, x2: piv.x, y2: piv.y + 7 }));
    }
  }

  /** Other layers' edges and centres (and the canvas's) to line a moved selection up with. */
  private snapTargets(doc: SvgDocument, moving: string[]): { xs: number[]; ys: number[]; box: Rect | null } {
    const xs = [0, doc.width / 2, doc.width];
    const ys = [0, doc.height / 2, doc.height];
    const skip = new Set(moving);
    const walk = (layers: Layer[], inside: boolean) => {
      for (const l of layers) {
        const own = inside || skip.has(l.id);
        if (!own && l.visible) {
          const b = layerWorldBounds(doc, l.id);
          if (b) {
            xs.push(b.x, b.x + b.width / 2, b.x + b.width);
            ys.push(b.y, b.y + b.height / 2, b.y + b.height);
          }
        }
        if (l.type === 'group') walk(l.children, own);
      }
    };
    walk(doc.layers, false);
    const box = unionRects(moving.map((id) => layerWorldBounds(doc, id)));
    return { xs, ys, box };
  }

  private renderGuides(): void {
    const g = this.guides;
    if (g.x === undefined && g.y === undefined) return;
    const w = this.stageWrap.clientWidth || 2000, h = this.stageWrap.clientHeight || 2000;
    if (g.x !== undefined) {
      const x = this.worldToScreen({ x: g.x, y: 0 }).x;
      this.overlay.appendChild(svgEl('line', { class: 'slt-guide', x1: x, y1: 0, x2: x, y2: h }));
    }
    if (g.y !== undefined) {
      const y = this.worldToScreen({ x: 0, y: g.y }).y;
      this.overlay.appendChild(svgEl('line', { class: 'slt-guide', x1: 0, y1: y, x2: w, y2: y }));
    }
  }

  /** Motion trail: faint outlines of the layer at steps across the Try it variable's range, joined by a path. */
  private renderTrail(id: string): void {
    const ed = this.editor;
    const layer = findLayer(ed.document, id);
    if (!layer?.bindings?.length) return;
    const vars = tryableVariables(ed.document, layer);
    const v = vars.find((x) => x.name === ed.tryVariable) ?? vars[0];
    if (!v) return;
    const over = ed.valueOverrides();
    const key = JSON.stringify([id, v, Object.entries(over).filter(([k]) => !TIME_VARIABLE_NAMES.includes(k))]);
    let polys: Point[][];
    if (this.trailCache && this.trailCache.doc === ed.document && this.trailCache.key === key) polys = this.trailCache.polys;
    else {
      polys = [];
      const steps = 8;
      for (let k = 0; k <= steps; k++) {
        const value = v.min + ((v.max - v.min) * k) / steps;
        const env = documentEnv(ed.document, { ...over, [v.name]: value });
        const doc = resolveDocument(ed.document, env);
        const l = findLayer(doc, id);
        const box = l ? layerFrameBounds(l) : null;
        if (!l || !box) continue;
        const m = multiply(parentWorldMatrix(doc, id), layerFrameMatrix(l));
        polys.push(rectCorners(box).map((p) => applyToPoint(m, p)));
      }
      this.trailCache = { doc: ed.document, key, polys };
    }
    if (polys.length < 2) return;
    const scr = polys.map((poly) => poly.map((p) => this.worldToScreen(p)));
    scr.forEach((poly, i) => {
      this.overlay.appendChild(svgEl('polygon', { class: 'slt-trail', points: poly.map((p) => `${p.x},${p.y}`).join(' '), opacity: String(0.15 + (0.45 * i) / (scr.length - 1)) }));
    });
    const centres = scr.map((poly) => ({ x: poly.reduce((s, p) => s + p.x, 0) / 4, y: poly.reduce((s, p) => s + p.y, 0) / 4 }));
    this.overlay.appendChild(svgEl('polyline', { class: 'slt-trail-path', points: centres.map((p) => `${p.x},${p.y}`).join(' ') }));
    const last = centres[centres.length - 1];
    this.overlay.appendChild(svgEl('circle', { class: 'slt-trail-end', cx: last.x, cy: last.y, r: 3 }));
  }

  /** Values beside the pointer while dragging (Preferences: Readout). */
  private renderReadout(): void {
    const d = this.drag;
    const v = this.virt;
    if (!d || !v || !this.editor.preferences.readout) return;
    const doc = this.editor.document;
    const fmt = (n: number) => String(Math.round(n * 10) / 10);
    let text = '';
    if (d.kind === 'move' && d.moved) {
      const l = findLayer(doc, d.items[0].id);
      if (l) text = `x ${fmt(l.x)} · y ${fmt(l.y)}`;
    } else if (d.kind === 'scale') {
      const l = findLayer(doc, d.id);
      if (l?.type === 'shape') text = `w ${fmt(l.width)} · h ${fmt(l.height)}`;
      else if (l?.type === 'group') text = `scale ${Math.round(l.scale * 100) / 100}`;
    } else if (d.kind === 'anchor') {
      const a = findLayer(doc, d.id)?.bindings?.find((b) => b.id === d.bindingId)?.anchor;
      if (a) text = a.layer || a.unit === 'px' ? `x ${fmt(a.x)} · y ${fmt(a.y)}` : `x ${Math.round(a.x * 100)}% · y ${Math.round(a.y * 100)}%`;
    }
    if (!text) return;
    const touch = this.pointerType !== 'mouse';
    const at = { x: v.at.x + (touch ? -40 : 16), y: v.at.y + (touch ? 56 : -16) };
    if (this.editor.preferences.fineFactor && (this.fineOn || this.fineHeld)) text += ' · fine';
    this.overlay.appendChild(svgEl('text', { class: 'slt-readout', x: Math.max(4, at.x), y: Math.max(14, at.y) }, [text]));
  }

  /** On touch: a close-up of what's under the finger, beside it, while dragging (Preferences: Magnifier). */
  private renderLoupe(): void {
    const d = this.drag;
    const v = this.virt;
    if (!d || !v || this.pointerType === 'mouse' || !this.editor.preferences.magnifier) return;
    if (!(d.kind === 'scale' || d.kind === 'rotate' || d.kind === 'anchor' || (d.kind === 'move' && d.moved))) return;
    const R = this.coarse ? 56 : 48;
    const k = 2.5;
    const w = this.stageWrap.clientWidth || 400;
    const p = v.at;
    const cx = Math.min(Math.max(p.x, R + 6), w - R - 6);
    let cy = p.y - R - 54;
    if (cy < R + 6) cy = p.y + R + 54;
    const clipId = `${this.idPrefix}loupe-clip`;
    this.loupe.append(
      svgEl('clipPath', { id: clipId }, [svgEl('circle', { cx, cy, r: R })]),
      svgEl('circle', { class: 'slt-loupe-bg', cx, cy, r: R }),
      svgEl('g', { 'clip-path': `url(#${clipId})` }, [
        svgEl('g', { transform: `translate(${cx} ${cy}) scale(${k}) translate(${-p.x} ${-p.y})` }, [
          // the drawing only: the handle under the finger would fill it
          svgEl('use', { href: `#${this.viewG.id}` }),
        ]),
      ]),
      svgEl('circle', { class: 'slt-loupe-ring', cx, cy, r: R }),
      svgEl('path', { class: 'slt-loupe-cross', d: `M${cx - 7} ${cy}H${cx + 7}M${cx} ${cy - 7}V${cy + 7}` }),
    );
  }

  /** Markers for binding anchors (pivot / fixed edge) of the selected layer, drawn from the resolved geometry. */
  private renderAnchors(id: string): void {
    // Anchors are points of the stored (unbound) layer; the binding keeps them fixed,
    // so their position is taken from the unresolved geometry.
    const doc = this.editor.document;
    const layer = findLayer(doc, id);
    if (!layer) return;
    const resolved = this.editor.resolvedDocument();
    for (const b of layer.bindings ?? []) {
      const axes = anchorAxes(b.target);
      if (!axes || !b.enabled) continue;
      const w = anchorWorldPoint(doc, id, b.anchor, resolved);
      if (!w) continue;
      const p = this.worldToScreen(w);
      const r = this.coarse ? 10 : 6;
      const on = b.anchor?.layer ? findLayer(doc, b.anchor.layer) : null;
      if (on) {
        // attached: a dashed line to the other layer's centre when it's offset from it
        const c = layerCentreWorld(resolved, on.id);
        if (c && (b.anchor!.x || b.anchor!.y)) {
          const cs = this.worldToScreen(c);
          this.overlay.appendChild(svgEl('line', { class: 'slt-anchor-link', x1: cs.x, y1: cs.y, x2: p.x, y2: p.y }));
        }
      }
      this.overlay.appendChild(svgEl('circle', { class: 'slt-anchor-ring', cx: p.x, cy: p.y, r: r + 5 }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-anchor-ring', x1: p.x - r - 9, y1: p.y, x2: p.x + r + 9, y2: p.y }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-anchor-ring', x1: p.x, y1: p.y - r - 9, x2: p.x, y2: p.y + r + 9 }));
      this.overlay.appendChild(svgEl('circle', { class: 'slt-anchor', cx: p.x, cy: p.y, r, 'data-handle': `anchor:${b.id}` }));
      const reach = this.editor.preferences.touchArea;
      if (reach > 0) this.overlay.appendChild(svgEl('circle', { class: 'slt-hit', cx: p.x, cy: p.y, r: r + reach, 'data-handle': `anchor:${b.id}`, style: 'cursor:move' }));
      const label = (b.target === 'rotation' ? 'pivot' : b.target === 'scale' ? 'scale about' : `${b.target} from`) + (on ? ` · on ${on.name || on.id}` : '');
      this.overlay.appendChild(svgEl('text', { class: 'slt-anchor-label', x: p.x + r + 12, y: p.y - 6 }, [label]));
    }
  }

  // -------------------------------------------------------------------------
  // Hit testing

  private hitLayerId(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const hit = target.closest('[data-layer-id]');
    if (!hit || !this.docG.contains(hit)) return null;
    return hit.getAttribute('data-layer-id');
  }

  /**
   * The canvas never changes the selection: a hit only counts when it lands on
   * a selected layer (or inside a selected group), in which case that selected
   * layer is what gets moved.
   */
  private resolveHit(deepId: string): string | null {
    const doc = this.editor.document;
    const loc = locateLayer(doc, deepId);
    if (!loc) return null;
    const chain = [...loc.ancestors.map((a) => a.id), deepId];
    const selected = this.editor.selection;
    for (let i = chain.length - 1; i >= 0; i--) {
      if (selected.includes(chain[i])) return chain[i];
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Pointer interaction

  private onPointerDown(e: PointerEvent): void {
    const screen = this.eventScreen(e);
    this.pointers.set(e.pointerId, screen);
    if (this.pointers.size === 1) {
      this.pointerType = e.pointerType || 'mouse';
      this.virt = { last: screen, at: screen };
      this.tapStart = e.button === 0 && !this.editor.preview && !this.spaceDown ? { screen, client: { x: e.clientX, y: e.clientY }, time: Date.now() } : null;
    } else this.tapStart = null;
    if (this.pointers.size === 2 && this.editor.preferences.lockView) {
      // Locked: a second finger never zooms; it just ends what the first was doing.
      if (this.drag && (this.drag.kind === 'move' || this.drag.kind === 'scale' || this.drag.kind === 'rotate' || this.drag.kind === 'anchor')) this.editor.store.endTransaction();
      if (this.drag?.kind === 'press') clearTimeout(this.drag.timer);
      if (this.drag?.kind === 'interact') this.editor.interaction.cancel();
      this.drag = null;
      this.activeHandle = null;
      this.lifted = false;
      this.renderOverlay();
      return;
    }
    if (this.pointers.size === 2) {
      // Second finger: abandon whatever single-finger gesture was in progress and pinch instead.
      if (this.drag && (this.drag.kind === 'move' || this.drag.kind === 'scale' || this.drag.kind === 'rotate')) {
        this.editor.store.cancelTransaction();
      }
      if (this.drag?.kind === 'press') clearTimeout(this.drag.timer);
      if (this.drag?.kind === 'interact') this.editor.interaction.cancel();
      this.activeHandle = null;
      this.lifted = false;
      const [a, b] = [...this.pointers.values()];
      this.drag = {
        kind: 'pinch',
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startZoom: this.view.zoom,
        startPan: { x: this.view.panX, y: this.view.panY },
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      this.stage.setPointerCapture(e.pointerId);
      this.renderOverlay();
      e.preventDefault();
      return;
    }
    if (this.drag) return;
    this.el.focus({ preventScroll: true });

    if ((e.button === 1 || (e.button === 0 && this.spaceDown)) && !this.editor.preferences.lockView) {
      this.drag = { kind: 'pan', startScreen: screen, startPan: { x: this.view.panX, y: this.view.panY } };
      this.stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    // Preview: hotspots take presses on them (the rest still pans).
    if (this.editor.preview && this.editor.features.variables && this.editor.interaction.down(this.screenToWorld(screen))) {
      this.drag = { kind: 'interact' };
      this.stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    const handleEl = e.target instanceof Element ? e.target.closest('[data-handle]') : null;
    if (handleEl && this.editor.selection.length === 1) {
      const name = handleEl.getAttribute('data-handle')!;
      if (name !== 'move') this.tapStart = null; // (a still tap on the move handle still selects what's under it)
      if (name.startsWith('anchor:')) {
        this.startAnchorDrag(name.slice(7));
        this.stage.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (name === 'move') {
        // The move handle picks the layer up straight away (no press and hold).
        this.startMoveDrag(screen);
        if (this.drag) {
          this.activeHandle = 'move';
          this.lifted = true;
          this.renderOverlay();
        }
        this.stage.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      this.startHandleDrag(name, screen);
      if (this.drag) {
        // Light the handle up so the user can see what they are about to change.
        this.activeHandle = name;
        this.renderOverlay();
      }
      this.stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    const deep = this.editor.preview ? null : this.hitLayerId(e.target);
    const hit = deep ? this.resolveHit(deep) : null;
    if (hit && this.editor.features.canvasInteraction === 'hold') {
      // Nothing happens until the hold completes; a drag before that pans the view.
      const timer = setTimeout(() => this.completeHold(), this.editor.features.holdDelay);
      this.drag = { kind: 'press', startScreen: screen, deepId: deep, timer };
      this.stage.setPointerCapture(e.pointerId);
      this.renderOverlay();
      e.preventDefault();
      return;
    }
    if (hit) {
      // direct mode: move the selected layer straight away
      this.startMoveDrag(screen);
    }
    if (!this.drag && this.panAllowed()) {
      this.drag = { kind: 'pan', startScreen: screen, startPan: { x: this.view.panX, y: this.view.panY } };
    }
    this.stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  /** The hold timer fired: select the pressed layer and pick it up. */
  private completeHold(): void {
    const d = this.drag;
    if (!d || d.kind !== 'press') return;
    if (!d.deepId) {
      this.drag = null;
      this.renderOverlay();
      return;
    }
    const id = this.resolveHit(d.deepId);
    const layer = id ? findLayer(this.editor.document, id) : null;
    if (!id || !layer || layer.locked) {
      this.drag = null;
      this.renderOverlay();
      return;
    }
    this.drag = null;
    this.startMoveDrag(d.startScreen);
    if (this.drag) {
      this.lifted = true;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(15);
        } catch {
          /* ignore */
        }
      }
    }
    this.renderOverlay();
  }

  private startMoveDrag(screen: Point): void {
    const doc = this.editor.document;
    const items = this.editor
      .topLevelSelection()
      .map((id) => ({ id, layer: findLayer(doc, id)! }))
      .filter((x) => x.layer && !x.layer.locked)
      .map(({ id, layer }) => ({ id, x: layer.x, y: layer.y, parentInv: invert(parentWorldMatrix(doc, id)) }));
    if (!items.length) return;
    this.editor.store.beginTransaction();
    this.drag = { kind: 'move', startWorld: this.screenToWorld(screen), origDoc: doc, items, moved: false };
  }

  private startAnchorDrag(bindingId: string): void {
    const id = this.editor.selection[0];
    const doc = this.editor.document; // unresolved frame, see renderAnchors
    const layer = findLayer(doc, id);
    const box = layer ? layerLocalBounds(layer) : null;
    if (!layer || !box) return;
    const anchor = layer.bindings?.find((b) => b.id === bindingId)?.anchor;
    const centre = anchor?.layer ? layerCentreWorld(this.editor.resolvedDocument(), anchor.layer) : null;
    const mode = anchor?.layer ? (centre ? 'layer' : 'box') : anchor?.unit === 'px' ? 'px' : 'box';
    this.editor.store.beginTransaction();
    this.drag = { kind: 'anchor', id, bindingId, localInv: invert(layerWorldMatrix(doc, id)), box, mode, centre };
  }

  private startHandleDrag(handle: string, screen: Point): void {
    const doc = this.editor.document;
    const id = this.editor.selection[0];
    const layer = findLayer(doc, id);
    if (!layer || layer.locked) return;
    const frame = layerFrameBounds(layer);
    if (!frame) return;
    const parentWorld = parentWorldMatrix(doc, id);
    this.editor.store.beginTransaction();
    if (handle === 'rotate') {
      const pivotWorld = applyToPoint(parentWorld, { x: layer.x, y: layer.y });
      const p = this.screenToWorld(screen);
      this.drag = {
        kind: 'rotate',
        id,
        origDoc: doc,
        layer,
        pivotWorld,
        startAngle: Math.atan2(p.y - pivotWorld.y, p.x - pivotWorld.x),
        ringR: this.lastRingR,
      };
      return;
    }
    const dir = HANDLES[handle];
    if (!dir) return;
    const frameInv = invert(multiply(parentWorld, layerFrameMatrix(layer)));
    this.drag = { kind: 'scale', id, dir, origDoc: doc, layer, frameInv, frame };
  }

  private onPointerMove(e: PointerEvent): void {
    let screen = this.eventScreen(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen);
    const d = this.drag;
    if (this.tapStart && Math.hypot(screen.x - this.tapStart.screen.x, screen.y - this.tapStart.screen.y) > (this.coarse ? 10 : 5)) this.tapStart = null;
    // Fine drag: the point the drag acts on follows the pointer more slowly.
    this.fineHeld = e.ctrlKey || e.metaKey;
    if (this.virt) {
      const slow = d && (d.kind === 'move' || d.kind === 'scale' || d.kind === 'rotate' || d.kind === 'anchor') && (this.fineOn || this.fineHeld);
      const f = slow ? this.editor.preferences.fineFactor : 1;
      const at = { x: this.virt.at.x + (screen.x - this.virt.last.x) * f, y: this.virt.at.y + (screen.y - this.virt.last.y) * f };
      this.virt = { last: screen, at };
      if (d && (d.kind === 'move' || d.kind === 'scale' || d.kind === 'rotate' || d.kind === 'anchor')) screen = at;
    }
    if (d?.kind === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = Math.max(0.05, Math.min(32, d.startZoom * (dist / d.startDist)));
      const f = zoom / d.startZoom;
      // Keep the world point under the initial midpoint anchored, then follow the midpoint.
      this.view.zoom = zoom;
      this.view.panX = d.startMid.x - (d.startMid.x - d.startPan.x) * f + (mid.x - d.startMid.x);
      this.view.panY = d.startMid.y - (d.startMid.y - d.startPan.y) * f + (mid.y - d.startMid.y);
      this.render();
      this.editor.viewChanged();
      return;
    }
    if (!d) return;
    switch (d.kind) {
      case 'interact':
        this.editor.interaction.move(this.screenToWorld(screen));
        break;
      case 'press': {
        // Moved before the hold completed: this is a pan.
        if (Math.hypot(screen.x - d.startScreen.x, screen.y - d.startScreen.y) > (this.coarse ? 10 : 5)) {
          clearTimeout(d.timer);
          this.drag = this.panAllowed() ? { kind: 'pan', startScreen: d.startScreen, startPan: { x: this.view.panX, y: this.view.panY } } : null;
          this.renderOverlay();
        }
        break;
      }
      case 'pan': {
        this.view.panX = d.startPan.x + screen.x - d.startScreen.x;
        this.view.panY = d.startPan.y + screen.y - d.startScreen.y;
        this.render();
        this.editor.viewChanged();
        break;
      }
      case 'move': {
        const w = this.screenToWorld(screen);
        let delta = { x: w.x - d.startWorld.x, y: w.y - d.startWorld.y };
        if (!d.moved && Math.hypot(delta.x, delta.y) * this.view.zoom < 2) return;
        d.moved = true;
        if (e.shiftKey) delta = Math.abs(delta.x) > Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y };
        // Line up with other shapes (not during a fine drag); the grid takes an axis that didn't.
        this.guides = {};
        let snapX = true, snapY = true;
        if (this.editor.preferences.snapToShapes && !(this.fineOn || this.fineHeld)) {
          const t = (d.targets ??= this.snapTargets(d.origDoc, d.items.map((i) => i.id)));
          if (t.box) {
            const tol = (this.coarse ? 10 : 6) / this.view.zoom;
            const b = { x: t.box.x + delta.x, y: t.box.y + delta.y, width: t.box.width, height: t.box.height };
            const best = (mine: number[], lines: number[]) => {
              let out: { line: number; shift: number } | null = null;
              for (const m of mine) for (const l of lines) if (Math.abs(l - m) <= tol && (!out || Math.abs(l - m) < Math.abs(out.shift))) out = { line: l, shift: l - m };
              return out;
            };
            const bx = e.shiftKey && delta.x === 0 ? null : best([b.x, b.x + b.width / 2, b.x + b.width], t.xs);
            const by = e.shiftKey && delta.y === 0 ? null : best([b.y, b.y + b.height / 2, b.y + b.height], t.ys);
            if (bx) { delta = { ...delta, x: delta.x + bx.shift }; this.guides.x = bx.line; snapX = false; }
            if (by) { delta = { ...delta, y: delta.y + by.shift }; this.guides.y = by.line; snapY = false; }
          }
        }
        let doc = d.origDoc;
        const snap = this.editor.snap ? this.editor.grid : null;
        for (const item of d.items) {
          const dl = applyToVector(item.parentInv, delta);
          let nx = item.x + dl.x;
          let ny = item.y + dl.y;
          if (snap) {
            // Snap the box's top-left corner to the grid (in the parent's coordinates).
            const layer = findLayer(d.origDoc, item.id);
            const box = layer ? layerBox(layer) : null;
            const ox = box ? box.x : 0;
            const oy = box ? box.y : 0;
            if (snapX) nx = snapTo(nx + ox, snap.width) - ox;
            if (snapY) ny = snapTo(ny + oy, snap.height) - oy;
          }
          doc = updateLayer(doc, item.id, { x: round(nx), y: round(ny) });
        }
        this.editor.store.update(doc);
        break;
      }
      case 'scale': {
        this.applyScale(d, this.screenToWorld(screen), e.shiftKey, e.altKey);
        break;
      }
      case 'anchor': {
        if (d.mode !== 'box') {
          // Pixels: the layer's own coordinates; attached: the offset from the other layer's centre.
          const world = this.screenToWorld(screen);
          const p = d.mode === 'layer' && d.centre ? { x: world.x - d.centre.x, y: world.y - d.centre.y } : applyToPoint(d.localInv, world);
          const snap = (n: number) => (e.shiftKey ? Math.round(n) : Math.round(n * 10) / 10);
          const next = { x: snap(p.x), y: snap(p.y) };
          this.editor.store.update((doc) =>
            updateLayer(doc, d.id, (l) => {
              const b = (l.bindings ?? []).find((x) => x.id === d.bindingId);
              return b?.anchor ? setBinding(l, { ...b, anchor: { ...b.anchor, ...next } }) : l;
            }),
          );
          break;
        }
        // Pointer → the layer's local space → box fractions.
        const local = applyToPoint(d.localInv, this.screenToWorld(screen));
        let fx = d.box.width > 1e-9 ? (local.x - d.box.x) / d.box.width : 0.5;
        let fy = d.box.height > 1e-9 ? (local.y - d.box.y) / d.box.height : 0.5;
        if (e.shiftKey) {
          fx = Math.round(fx * 2) / 2;
          fy = Math.round(fy * 2) / 2;
        }
        fx = Math.round(fx * 100) / 100;
        fy = Math.round(fy * 100) / 100;
        this.editor.store.update((doc) =>
          updateLayer(doc, d.id, (l) => {
            const b = (l.bindings ?? []).find((x) => x.id === d.bindingId);
            if (!b) return l;
            const axes = anchorAxes(b.target) ?? 'xy';
            const prev = b.anchor ?? { x: 0.5, y: 0.5 };
            return setBinding(l, { ...b, anchor: { x: axes.includes('x') ? fx : prev.x, y: axes.includes('y') ? fy : prev.y } });
          }),
        );
        break;
      }
      case 'rotate': {
        const p = this.screenToWorld(screen);
        const angle = Math.atan2(p.y - d.pivotWorld.y, p.x - d.pivotWorld.x);
        let rotation = d.layer.rotation + ((angle - d.startAngle) * 180) / Math.PI;
        const stepDeg = this.editor.preferences.rotationStep;
        if (e.shiftKey || this.editor.snap) rotation = Math.round(rotation / stepDeg) * stepDeg;
        rotation = Math.round((((rotation % 360) + 360) % 360) * 10) / 10;
        this.editor.store.update(updateLayer(d.origDoc, d.id, (l) => rotateLayer(l, rotation)));
        break;
      }
    }
  }

  private applyScale(d: Extract<DragState, { kind: 'scale' }>, worldPointer: Point, keepAspect: boolean, fromCentre: boolean): void {
    // Everything happens in the frame: the parent's axes with the layer origin at (0,0).
    let u = applyToPoint(d.frameInv, worldPointer);
    const { frame, dir, layer } = d;
    if (this.editor.snap) {
      // Snap the dragged edge/corner to the grid in the parent's coordinates.
      const g = this.editor.grid;
      u = { x: snapTo(u.x + layer.x, g.width) - layer.x, y: snapTo(u.y + layer.y, g.height) - layer.y };
    }
    const left = frame.x;
    const right = frame.x + frame.width;
    const top = frame.y;
    const bottom = frame.y + frame.height;
    const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
    // Fixed point (stays put) and the handle's start position.
    const F = {
      x: fromCentre || dir.hx === 0 ? centre.x : dir.hx > 0 ? left : right,
      y: fromCentre || dir.hy === 0 ? centre.y : dir.hy > 0 ? top : bottom,
    };
    const H = { x: dir.hx > 0 ? right : dir.hx < 0 ? left : centre.x, y: dir.hy > 0 ? bottom : dir.hy < 0 ? top : centre.y };
    let kx = dir.hx !== 0 && Math.abs(H.x - F.x) > 1e-9 ? (u.x - F.x) / (H.x - F.x) : 1;
    let ky = dir.hy !== 0 && Math.abs(H.y - F.y) > 1e-9 ? (u.y - F.y) / (H.y - F.y) : 1;
    kx = Math.max(0.01, kx);
    ky = Math.max(0.01, ky);
    if (keepAspect || (dir.hx !== 0 && dir.hy !== 0 && layer.type === 'group' && !this.editor.features.groupStretch)) {
      const k = dir.hx === 0 ? ky : dir.hy === 0 ? kx : Math.abs(kx - 1) > Math.abs(ky - 1) ? kx : ky;
      kx = k;
      ky = k;
    }
    // Scaling about the origin moves F to (kx·F.x, ky·F.y); shift the layer back so F stays fixed.
    const shift = { x: F.x * (1 - kx), y: F.y * (1 - ky) };
    this.editor.store.update(
      updateLayer(d.origDoc, d.id, (l) => ({
        ...scaleLayerBox(l, kx, ky),
        x: round(layer.x + shift.x),
        y: round(layer.y + shift.y),
      })),
    );
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
    const d = this.drag;
    const tap = this.tapStart;
    this.tapStart = null;
    const tapped = !!tap && e.type === 'pointerup' && Date.now() - tap.time < 500 && this.editor.preferences.tapSelect &&
      (!d || d.kind === 'press' || d.kind === 'pan' || (d.kind === 'move' && !d.moved));
    if (!d) {
      if (tapped) this.tapSelect(tap!.client);
      return;
    }
    if (d.kind === 'pinch') {
      if (this.pointers.size === 0) this.drag = null;
      return;
    }
    this.drag = null;
    this.activeHandle = null;
    this.lifted = false;
    if (this.guides.x !== undefined || this.guides.y !== undefined) {
      this.guides = {};
      this.renderOverlay();
    }
    if (tapped) queueMicrotask(() => this.tapSelect(tap!.client));
    switch (d.kind) {
      case 'interact':
        if (e.type === 'pointercancel') this.editor.interaction.cancel();
        else this.editor.interaction.up(this.screenToWorld(this.eventScreen(e)));
        break;
      case 'press':
        // A tap shorter than the hold: deliberately does nothing to the selection.
        clearTimeout(d.timer);
        this.renderOverlay();
        break;
      case 'anchor':
        this.editor.store.endTransaction();
        break;
      case 'move':
      case 'scale':
      case 'rotate':
        this.editor.store.endTransaction();
        break;
      default:
        break;
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.editor.preferences.lockView) return;
    const screen = this.eventScreen(e);
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.stageWrap.clientHeight : 1;
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * scale * 0.0015);
      this.setZoom(this.view.zoom * factor, screen);
    } else {
      this.view.panX -= e.deltaX * scale;
      this.view.panY -= e.deltaY * scale;
      this.render();
      this.editor.viewChanged();
    }
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function resizeCursor(angleDeg: number): string {
  const a = ((angleDeg % 180) + 180) % 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

