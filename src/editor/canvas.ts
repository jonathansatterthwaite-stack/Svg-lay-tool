import {
  applyToPoint,
  applyToVector,
  anchorAxes,
  anchorLocalPoint,
  layerWorldMatrix,
  layerLocalBounds,
  setBinding,
  snapTo,
  layerBox,
  findLayer,
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
  | { kind: 'anchor'; id: string; bindingId: string; localInv: Mat; box: Rect };

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
  private drag: DragState | null = null;
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
    this.stage = svgEl('svg', { class: 'slt-stage' }, [this.staticDefs, this.docDefs, this.viewG, this.overlay]);
    this.hint = el('div', { class: 'slt-canvas-hint' }, ['Scroll to pan · Ctrl+scroll to zoom · Space+drag to pan']);
    this.stripSlot = el('div', { class: 'slt-strip-slot' });
    this.stageWrap = el('div', { class: 'slt-stage-wrap' }, [this.stage, this.hint]);
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
    this.hint.textContent = hold
      ? 'Drag to pan · Ctrl+scroll or pinch to zoom · hold a layer to pick it up'
      : 'Scroll to pan · Ctrl+scroll to zoom · Space+drag to pan';
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

  // -------------------------------------------------------------------------
  // Rendering

  render(): void {
    const doc = this.editor.document;
    const v = this.view;
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
    const ed = this.editor;
    if (ed.preview) return;
    const pts = (corners: Point[]) => corners.map((p) => `${p.x},${p.y}`).join(' ');

    if (ed.hoverId && !ed.selection.includes(ed.hoverId) && !this.drag) {
      const f = this.screenFrame(ed.hoverId);
      if (f) this.overlay.appendChild(svgEl('polygon', { class: 'slt-hover-outline', points: pts(rectCorners(f.box).map(f.toScreen)) }));
    }

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

  }

  private renderHandles(f: { toScreen: (p: Point) => Point; box: Rect; layer: Layer }): void {
    const { box, toScreen, layer } = f;
    const size = this.coarse ? 16 : 8;
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
    const rr = (this.coarse ? 11 : 6) * (rotActive ? 1.4 : 1);
    this.overlay.appendChild(
      svgEl('circle', { class: rotActive ? 'slt-handle-rotate slt-handle-active' : 'slt-handle-rotate', cx: hp.x, cy: hp.y, r: rr, 'data-handle': 'rotate' }),
    );
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
    }

    if (layer.type === 'group') {
      const piv = toScreen({ x: 0, y: 0 });
      this.overlay.appendChild(svgEl('circle', { class: 'slt-pivot', cx: piv.x, cy: piv.y, r: 4, fill: 'none' }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-pivot', x1: piv.x - 7, y1: piv.y, x2: piv.x + 7, y2: piv.y }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-pivot', x1: piv.x, y1: piv.y - 7, x2: piv.x, y2: piv.y + 7 }));
    }
  }

  /** Markers for binding anchors (pivot / fixed edge) of the selected layer, drawn from the resolved geometry. */
  private renderAnchors(id: string): void {
    // Anchors are points of the stored (unbound) layer; the binding keeps them fixed,
    // so their position is taken from the unresolved geometry.
    const doc = this.editor.document;
    const layer = findLayer(doc, id);
    if (!layer) return;
    const world = layerWorldMatrix(doc, id);
    for (const b of layer.bindings ?? []) {
      const axes = anchorAxes(b.target);
      if (!axes || !b.enabled) continue;
      const p = this.worldToScreen(applyToPoint(world, anchorLocalPoint(layer, b.anchor)));
      const r = this.coarse ? 10 : 6;
      this.overlay.appendChild(svgEl('circle', { class: 'slt-anchor-ring', cx: p.x, cy: p.y, r: r + 5 }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-anchor-ring', x1: p.x - r - 9, y1: p.y, x2: p.x + r + 9, y2: p.y }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-anchor-ring', x1: p.x, y1: p.y - r - 9, x2: p.x, y2: p.y + r + 9 }));
      this.overlay.appendChild(svgEl('circle', { class: 'slt-anchor', cx: p.x, cy: p.y, r, 'data-handle': `anchor:${b.id}` }));
      const label = b.target === 'rotation' ? 'pivot' : b.target === 'scale' ? 'scale about' : `${b.target} from`;
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
    if (this.pointers.size === 2) {
      // Second finger: abandon whatever single-finger gesture was in progress and pinch instead.
      if (this.drag && (this.drag.kind === 'move' || this.drag.kind === 'scale' || this.drag.kind === 'rotate')) {
        this.editor.store.cancelTransaction();
      }
      if (this.drag?.kind === 'press') clearTimeout(this.drag.timer);
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

    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.drag = { kind: 'pan', startScreen: screen, startPan: { x: this.view.panX, y: this.view.panY } };
      this.stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const handleEl = e.target instanceof Element ? e.target.closest('[data-handle]') : null;
    if (handleEl && this.editor.selection.length === 1) {
      const name = handleEl.getAttribute('data-handle')!;
      if (name.startsWith('anchor:')) {
        this.startAnchorDrag(name.slice(7));
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
    if (!this.drag) {
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
    this.editor.store.beginTransaction();
    this.drag = { kind: 'anchor', id, bindingId, localInv: invert(layerWorldMatrix(doc, id)), box };
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
    const screen = this.eventScreen(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen);
    const d = this.drag;
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
      case 'press': {
        // Moved before the hold completed: this is a pan.
        if (Math.hypot(screen.x - d.startScreen.x, screen.y - d.startScreen.y) > (this.coarse ? 10 : 5)) {
          clearTimeout(d.timer);
          this.drag = { kind: 'pan', startScreen: d.startScreen, startPan: { x: this.view.panX, y: this.view.panY } };
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
            nx = snapTo(nx + ox, snap.width) - ox;
            ny = snapTo(ny + oy, snap.height) - oy;
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
        if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
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
    if (!d) return;
    if (d.kind === 'pinch') {
      if (this.pointers.size === 0) this.drag = null;
      return;
    }
    this.drag = null;
    this.activeHandle = null;
    this.lifted = false;
    switch (d.kind) {
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

