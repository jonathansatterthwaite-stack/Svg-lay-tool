import {
  applyToPoint,
  applyToVector,
  findLayer,
  invert,
  layerFrameBounds,
  layerFrameMatrix,
  layerWorldBounds,
  locateLayer,
  multiply,
  parentWorldMatrix,
  rectCorners,
  rectsIntersect,
  renderDocumentParts,
  rotate,
  updateLayer,
  vnodeToDom,
  type GroupLayer,
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
  | { kind: 'rotate'; id: string; origDoc: SvgDocument; layer: Layer; pivotWorld: Point; startAngle: number }
  | { kind: 'pan'; startScreen: Point; startPan: Point }
  | { kind: 'pinch'; startDist: number; startZoom: number; startPan: Point; startMid: Point }
  | { kind: 'press'; startScreen: Point; deepId: string | null; timer: ReturnType<typeof setTimeout> }
  | { kind: 'marquee'; startWorld: Point; currentWorld: Point; additive: boolean };

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
  private staticDefs: SVGDefsElement;
  private docDefs: SVGDefsElement;
  private viewG: SVGGElement;
  private checker: SVGRectElement;
  private pattern: SVGPatternElement;
  private clipRect: SVGRectElement;
  private docG: SVGGElement;
  private frameRect: SVGRectElement;
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
    this.viewG = svgEl('g', { class: 'slt-view' }, [this.checker, this.docG, this.frameRect]);
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
    on(this.stage, 'dblclick', (e) => this.onDoubleClick(e));
    on(this.stage, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(this.stage, 'pointerleave', () => this.editor.setHover(null));
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
    for (const r of [this.checker, this.clipRect, this.frameRect]) {
      r.setAttribute('width', String(doc.width));
      r.setAttribute('height', String(doc.height));
    }

    const { defs, body } = renderDocumentParts(doc, { idPrefix: this.idPrefix, interactive: true, ...this.editor.renderOptions() });
    clear(this.docDefs);
    for (const d of defs) this.docDefs.appendChild(vnodeToDom(d));
    clear(this.docG);
    for (const b of body) this.docG.appendChild(vnodeToDom(b));
    this.renderOverlay();
  }

  /** Frame (translation + rotation) of a layer in screen space, plus its axis-aligned box in that frame. */
  private screenFrame(id: string): { toScreen: (p: Point) => Point; box: Rect; layer: Layer } | null {
    const doc = this.editor.document;
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
    const pts = (corners: Point[]) => corners.map((p) => `${p.x},${p.y}`).join(' ');

    if (ed.hoverId && !ed.selection.includes(ed.hoverId) && !this.drag) {
      const f = this.screenFrame(ed.hoverId);
      if (f) this.overlay.appendChild(svgEl('polygon', { class: 'slt-hover-outline', points: pts(rectCorners(f.box).map(f.toScreen)) }));
    }

    for (const id of ed.selection) {
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
    }

    if (this.drag?.kind === 'marquee') {
      const a = this.worldToScreen(this.drag.startWorld);
      const b = this.worldToScreen(this.drag.currentWorld);
      this.overlay.appendChild(
        svgEl('rect', {
          class: 'slt-marquee',
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
        }),
      );
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

    // Rotation handle above the top edge (in screen space along the frame's up direction).
    const top = toScreen({ x: cx, y: box.y });
    const up = normalize({ x: top.x - o.x, y: top.y - o.y }) ?? { x: 0, y: -1 };
    const reach = this.coarse ? 36 : 24;
    const rp = { x: top.x + up.x * reach, y: top.y + up.y * reach };
    this.overlay.appendChild(svgEl('line', { class: 'slt-rotate-line', x1: top.x, y1: top.y, x2: rp.x, y2: rp.y }));
    const rotActive = this.activeHandle === 'rotate';
    const rr = (this.coarse ? 11 : 5.5) * (rotActive ? 1.5 : 1);
    this.overlay.appendChild(
      svgEl('circle', { class: rotActive ? 'slt-handle-rotate slt-handle-active' : 'slt-handle-rotate', cx: rp.x, cy: rp.y, r: rr, 'data-handle': 'rotate' }),
    );

    if (layer.type === 'group') {
      const piv = toScreen({ x: 0, y: 0 });
      this.overlay.appendChild(svgEl('circle', { class: 'slt-pivot', cx: piv.x, cy: piv.y, r: 4, fill: 'none' }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-pivot', x1: piv.x - 7, y1: piv.y, x2: piv.x + 7, y2: piv.y }));
      this.overlay.appendChild(svgEl('line', { class: 'slt-pivot', x1: piv.x, y1: piv.y - 7, x2: piv.x, y2: piv.y + 7 }));
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
   * Decide which layer a click on `deepId` selects: normally the root-level
   * ancestor, unless the user is already working inside that group.
   */
  private resolveHit(deepId: string): string {
    const doc = this.editor.document;
    const loc = locateLayer(doc, deepId);
    if (!loc) return deepId;
    const chain = [...loc.ancestors.map((a) => a.id), deepId];
    const selected = this.editor.selection;
    for (let i = chain.length - 1; i >= 0; i--) {
      if (selected.includes(chain[i])) return chain[i];
    }
    for (let i = chain.length - 1; i >= 1; i--) {
      const parentId = chain[i - 1];
      if (selected.some((s) => locateLayer(doc, s)?.parent?.id === parentId)) return chain[i];
    }
    return chain[0];
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

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const deep = this.hitLayerId(e.target);
    if (this.editor.features.canvasInteraction === 'hold') {
      // Nothing happens until the hold completes; a drag before that pans the view.
      const timer = setTimeout(() => this.completeHold(), this.editor.features.holdDelay);
      this.drag = { kind: 'press', startScreen: screen, deepId: deep, timer };
      this.stage.setPointerCapture(e.pointerId);
      this.renderOverlay();
      e.preventDefault();
      return;
    }
    if (deep) {
      const id = this.resolveHit(deep);
      if (additive) this.editor.toggleSelect(id);
      else if (!this.editor.selection.includes(id)) this.editor.select([id]);
      this.startMoveDrag(screen);
    } else {
      if (!additive) this.editor.clearSelection();
      const w = this.screenToWorld(screen);
      this.drag = { kind: 'marquee', startWorld: w, currentWorld: w, additive };
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
    const layer = findLayer(this.editor.document, id);
    if (!layer || layer.locked) {
      this.drag = null;
      this.renderOverlay();
      return;
    }
    if (!this.editor.selection.includes(id)) this.editor.select([id]);
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
    if (!d) {
      const deep = this.hitLayerId(e.target);
      this.editor.setHover(deep ? this.resolveHit(deep) : null);
      return;
    }
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
        for (const item of d.items) {
          const dl = applyToVector(item.parentInv, delta);
          doc = updateLayer(doc, item.id, { x: round(item.x + dl.x), y: round(item.y + dl.y) });
        }
        this.editor.store.update(doc);
        break;
      }
      case 'scale': {
        this.applyScale(d, this.screenToWorld(screen), e.shiftKey, e.altKey);
        break;
      }
      case 'rotate': {
        const p = this.screenToWorld(screen);
        const angle = Math.atan2(p.y - d.pivotWorld.y, p.x - d.pivotWorld.x);
        let rotation = d.layer.rotation + ((angle - d.startAngle) * 180) / Math.PI;
        if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
        rotation = Math.round((((rotation % 360) + 360) % 360) * 10) / 10;
        this.editor.store.update(updateLayer(d.origDoc, d.id, { rotation }));
        break;
      }
      case 'marquee': {
        d.currentWorld = this.screenToWorld(screen);
        this.renderOverlay();
        break;
      }
    }
  }

  private applyScale(d: Extract<DragState, { kind: 'scale' }>, worldPointer: Point, keepAspect: boolean, fromCentre: boolean): void {
    const u = applyToPoint(d.frameInv, worldPointer);
    const { frame, dir, layer } = d;
    const left = frame.x;
    const right = frame.x + frame.width;
    const top = frame.y;
    const bottom = frame.y + frame.height;
    const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };

    if (layer.type === 'shape') {
      let nl = left;
      let nr = right;
      let nt = top;
      let nb = bottom;
      if (fromCentre) {
        if (dir.hx !== 0) {
          nl = centre.x - Math.abs(u.x - centre.x);
          nr = centre.x + Math.abs(u.x - centre.x);
        }
        if (dir.hy !== 0) {
          nt = centre.y - Math.abs(u.y - centre.y);
          nb = centre.y + Math.abs(u.y - centre.y);
        }
      } else {
        if (dir.hx > 0) nr = u.x;
        else if (dir.hx < 0) nl = u.x;
        if (dir.hy > 0) nb = u.y;
        else if (dir.hy < 0) nt = u.y;
      }
      let w = Math.abs(nr - nl);
      let h = Math.abs(nb - nt);
      if (keepAspect && frame.width > 0 && frame.height > 0) {
        const kx = w / frame.width;
        const ky = h / frame.height;
        const k = dir.hx === 0 ? ky : dir.hy === 0 ? kx : Math.abs(kx - 1) > Math.abs(ky - 1) ? kx : ky;
        w = frame.width * k;
        h = frame.height * k;
        // Re-anchor on the fixed edge/centre.
        const ax = fromCentre || dir.hx === 0 ? centre.x : dir.hx > 0 ? left : right;
        const ay = fromCentre || dir.hy === 0 ? centre.y : dir.hy > 0 ? top : bottom;
        const sx = fromCentre || dir.hx === 0 ? 0 : dir.hx;
        const sy = fromCentre || dir.hy === 0 ? 0 : dir.hy;
        nl = sx === 0 ? ax - w / 2 : sx > 0 ? ax : ax - w;
        nr = nl + w;
        nt = sy === 0 ? ay - h / 2 : sy > 0 ? ay : ay - h;
        nb = nt + h;
      }
      w = Math.max(1, w);
      h = Math.max(1, h);
      const newCentre = { x: (Math.min(nl, nr) + Math.max(nl, nr)) / 2, y: (Math.min(nt, nb) + Math.max(nt, nb)) / 2 };
      const shift = applyToVector(rotate(layer.rotation), { x: newCentre.x - centre.x, y: newCentre.y - centre.y });
      this.editor.store.update(
        updateLayer(d.origDoc, d.id, {
          width: round(w),
          height: round(h),
          x: round(layer.x + shift.x),
          y: round(layer.y + shift.y),
        }),
      );
      return;
    }

    // Groups scale uniformly about the opposite edge/corner (or the centre with Alt).
    const F = fromCentre
      ? centre
      : { x: dir.hx > 0 ? left : dir.hx < 0 ? right : centre.x, y: dir.hy > 0 ? top : dir.hy < 0 ? bottom : centre.y };
    const H = { x: dir.hx > 0 ? right : dir.hx < 0 ? left : centre.x, y: dir.hy > 0 ? bottom : dir.hy < 0 ? top : centre.y };
    let k: number;
    if (dir.hx !== 0 && dir.hy !== 0) {
      const hv = { x: H.x - F.x, y: H.y - F.y };
      const len2 = hv.x * hv.x + hv.y * hv.y || 1;
      k = ((u.x - F.x) * hv.x + (u.y - F.y) * hv.y) / len2;
    } else if (dir.hx !== 0) {
      k = (u.x - F.x) / (H.x - F.x || 1);
    } else {
      k = (u.y - F.y) / (H.y - F.y || 1);
    }
    k = Math.max(0.01, k);
    const shiftFrame = { x: F.x * (1 - k), y: F.y * (1 - k) };
    const shift = applyToVector(rotate(layer.rotation), shiftFrame);
    this.editor.store.update(
      updateLayer<GroupLayer>(d.origDoc, d.id, {
        scale: Math.round(layer.scale * k * 10000) / 10000,
        x: round(layer.x + shift.x),
        y: round(layer.y + shift.y),
      }),
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
      case 'move':
      case 'scale':
      case 'rotate':
        this.editor.store.endTransaction();
        break;
      case 'marquee': {
        const a = d.startWorld;
        const b = d.currentWorld;
        const rect: Rect = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
        };
        if (rect.width * this.view.zoom > 3 || rect.height * this.view.zoom > 3) {
          const doc = this.editor.document;
          const ids = doc.layers
            .filter((l) => l.visible && !l.locked)
            .filter((l) => {
              const wb = layerWorldBounds(doc, l.id);
              return wb && rectsIntersect(wb, rect);
            })
            .map((l) => l.id);
          this.editor.select(ids, d.additive);
        }
        this.renderOverlay();
        break;
      }
      default:
        break;
    }
  }

  private onDoubleClick(e: MouseEvent): void {
    // The first click re-renders the drawing, so `e.target` may be a detached
    // node; hit-test by position instead.
    const root = this.editor.root;
    const under = root instanceof ShadowRoot ? root.elementFromPoint(e.clientX, e.clientY) : document.elementFromPoint(e.clientX, e.clientY);
    const deep = this.hitLayerId(under);
    if (!deep) return;
    // Drill one level into the group under the pointer.
    const doc = this.editor.document;
    const loc = locateLayer(doc, deep);
    if (!loc) return;
    const chain = [...loc.ancestors.map((a) => a.id), deep];
    const current = this.editor.selection[0];
    const idx = current ? chain.indexOf(current) : -1;
    const next = chain[Math.min(chain.length - 1, idx + 1)];
    this.editor.select([next]);
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

function normalize(v: Point): Point | null {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-9) return null;
  return { x: v.x / len, y: v.y / len };
}

function resizeCursor(angleDeg: number): string {
  const a = ((angleDeg % 180) + 180) % 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

