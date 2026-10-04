import { el, svgEl } from './dom';
import type { SvgLayEditor } from './editor';
import { button } from './fields';
import { icon } from './icons';

/**
 * How the editor feels to use: handle sizes, what touching the canvas does,
 * the view pad. They belong to the person, not the drawing: the host app
 * passes saved ones in (`preferences` option) and saves them again on
 * `preferenceschange`.
 */
export interface EditorPreferences {
  /** Resize handles' size in px; null picks by pointer (8 with a mouse, 16 on touch). */
  handleSize: number | null;
  /** Opacity of the selection box, resize and rotate handles (0.2 to 1). */
  handleOpacity: number;
  /** Opacity of origin, pivot and anchor markers (0.2 to 1). */
  markerOpacity: number;
  /** Px beyond what's drawn that a handle still catches a touch or click. */
  touchArea: number;
  /** A grab point in the middle of the selection, to move it without press and hold. */
  moveHandle: 'always' | 'touch' | 'off';
  /** On touch: whether a finger dragging the canvas moves the view, or only the view pad does (pinching always zooms). */
  canvasTouch: 'pan' | 'pad';
  /** The view pad: shown on touch (auto), always on one side, or hidden. */
  viewPad: 'auto' | 'right' | 'left' | 'hidden';
  /** Nothing on the canvas pans or zooms the view (the pad and the toolbar still do). */
  lockView: boolean;
  /** Values beside the pointer while dragging: x and y, width and height, the angle. */
  readout: boolean;
  /** How fast a fine drag goes (Ctrl/⌘ held, or the nudge pad's Fine on touch). */
  fineFactor: 0.5 | 0.25 | 0.1;
  /** On touch, a magnified view of what's under the finger, beside it, while dragging. */
  magnifier: boolean;
  /** On touch, arrows that move the selection by 1 (or 10) while a layer is selected. */
  nudgePad: boolean;
  /** A tap or click on the canvas selects what's there; again on the same spot, what's underneath. */
  tapSelect: boolean;
}

export const DEFAULT_PREFERENCES: EditorPreferences = {
  handleSize: null,
  handleOpacity: 1,
  markerOpacity: 1,
  touchArea: 6,
  moveHandle: 'always',
  canvasTouch: 'pad',
  viewPad: 'auto',
  lockView: false,
  readout: true,
  fineFactor: 0.25,
  magnifier: true,
  nudgePad: true,
  tapSelect: true,
};

const clampNum = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Saved preferences, checked: anything unknown or out of range falls back to the default. */
export function resolvePreferences(p: Partial<EditorPreferences> | null | undefined = {}): EditorPreferences {
  const d = DEFAULT_PREFERENCES;
  const q = (p ?? {}) as Partial<Record<keyof EditorPreferences, unknown>>;
  return {
    handleSize: q.handleSize == null ? null : clampNum(q.handleSize, 6, 28, 8),
    handleOpacity: clampNum(q.handleOpacity, 0.2, 1, d.handleOpacity),
    markerOpacity: clampNum(q.markerOpacity, 0.2, 1, d.markerOpacity),
    touchArea: clampNum(q.touchArea, 0, 24, d.touchArea),
    moveHandle: oneOf(q.moveHandle, ['always', 'touch', 'off'] as const, d.moveHandle),
    canvasTouch: oneOf(q.canvasTouch, ['pan', 'pad'] as const, d.canvasTouch),
    viewPad: oneOf(q.viewPad, ['auto', 'right', 'left', 'hidden'] as const, d.viewPad),
    lockView: q.lockView === true,
    readout: q.readout !== false,
    fineFactor: ([0.5, 0.25, 0.1] as const).includes(q.fineFactor as never) ? (q.fineFactor as 0.5 | 0.25 | 0.1) : d.fineFactor,
    magnifier: q.magnifier !== false,
    nudgePad: q.nudgePad !== false,
    tapSelect: q.tapSelect !== false,
  };
}

type PageId = 'handles' | 'view' | 'precision';
const PAGES: { id: PageId; label: string }[] = [
  { id: 'handles', label: 'Handles' },
  { id: 'view', label: 'Canvas & view' },
  { id: 'precision', label: 'Precision' },
];

/** The Preferences window (a dialog on desktop, a sheet from the bottom on mobile). */
export class PreferencesDialog {
  readonly el: HTMLDivElement;
  private body: HTMLDivElement;
  private nav: HTMLDivElement;
  private page: PageId = 'handles';
  private previewSlot: HTMLElement | null = null;

  constructor(private editor: SvgLayEditor, private onClose: () => void) {
    this.nav = el('div', { class: 'slt-prefs-nav', role: 'tablist' });
    this.body = el('div', { class: 'slt-prefs-body' });
    const panel = el('div', { class: 'slt-prefs', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Editor preferences' }, [
      el('div', { class: 'slt-prefs-head' }, [
        el('span', { class: 'slt-prefs-title' }, [icon('gear'), 'Preferences']),
        button(icon('close'), () => this.close(), { title: 'Close', cls: 'slt-icon-only' }),
      ]),
      el('div', { class: 'slt-prefs-main' }, [this.nav, this.body]),
      el('div', { class: 'slt-prefs-foot' }, [
        button('Reset to defaults', () => {
          editor.setPreferences({ ...DEFAULT_PREFERENCES });
          this.render();
        }),
        el('span', { class: 'slt-spacer' }),
        button('Done', () => this.close(), { cls: 'slt-primary' }),
      ]),
    ]);
    this.el = el('div', { class: 'slt-prefs-backdrop' }, [panel]);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    this.render();
  }

  close(): void {
    this.el.remove();
    this.onClose();
  }

  /** Redraw (after a change, so the controls show the current values). */
  render(): void {
    const ed = this.editor;
    const p = ed.preferences;
    this.nav.replaceChildren(
      ...PAGES.map((pg) => {
        const b = el('button', { type: 'button', class: 'slt-prefs-tab', role: 'tab', 'aria-selected': pg.id === this.page ? 'true' : 'false' }, [pg.label]);
        if (pg.id === this.page) b.dataset.active = '';
        b.addEventListener('click', () => {
          this.page = pg.id;
          this.render();
        });
        return b;
      }),
    );
    // Choices redraw the page; sliders only the preview (redrawing would end the drag).
    const set = (patch: Partial<EditorPreferences>) => {
      ed.setPreferences(patch);
      this.render();
    };
    const slide = (patch: Partial<EditorPreferences>) => {
      ed.setPreferences(patch);
      this.previewSlot?.replaceChildren(this.preview());
    };
    const rows: HTMLElement[] = [];
    if (this.page === 'handles') {
      const autoSize = ed.inputMode() === 'touch' ? 16 : 8;
      rows.push(
        el('h4', {}, ['Handles and gizmos']),
        slider('Handle size', 'Bigger is easier to hit on a phone', p.handleSize ?? autoSize, 6, 28, 1, (v) => `${v} px${ed.preferences.handleSize == null ? ' (auto)' : ''}`, (v) => slide({ handleSize: v })),
        slider('Handle opacity', 'The selection box, and the resize and rotate handles', p.handleOpacity, 0.2, 1, 0.05, pct, (v) => slide({ handleOpacity: v })),
        slider('Marker opacity', 'Origins, pivots and anchors', p.markerOpacity, 0.2, 1, 0.05, pct, (v) => slide({ markerOpacity: v })),
        slider('Touch area', "Handles catch a touch or click this far beyond what's drawn", p.touchArea, 0, 24, 1, (v) => `+${v} px`, (v) => slide({ touchArea: v })),
        choice('Move handle', 'A grab point in the middle of the selection (beside it when the shape is small): drag it to move the layer straight away', p.moveHandle,
          [['always', 'Always'], ['touch', 'Touch only'], ['off', 'Off']], (v) => set({ moveHandle: v })),
        (this.previewSlot = el('div', { class: 'slt-prefs-preview-slot' }, [this.preview()])),
      );
    } else if (this.page === 'precision') {
      this.previewSlot = null;
      const m = ed.modKey();
      rows.push(
        el('h4', {}, ['Precision']),
        choice('Fine drag', `Hold ${m} while dragging (on touch, Fine on the nudge pad): moves, resizes and turns at this speed`, String(p.fineFactor) as '0.5' | '0.25' | '0.1',
          [['0.5', '½'], ['0.25', '¼'], ['0.1', '⅒']], (v) => set({ fineFactor: Number(v) as 0.5 | 0.25 | 0.1 })),
        toggle('Readout while dragging', 'x and y, width and height, or the angle beside the pointer', p.readout, (v) => set({ readout: v })),
        toggle('Magnifier (touch)', "While dragging, a close-up of what's under your finger, beside it", p.magnifier, (v) => set({ magnifier: v })),
        toggle('Nudge pad (touch)', 'Arrows that move the selected layer by 1, or 10 (by the grid with Snap on)', p.nudgePad, (v) => set({ nudgePad: v })),
        el('h4', {}, ['Selecting']),
        toggle('Tap to select', "A tap or click on the canvas selects what's there; tap the same spot again for what's underneath", p.tapSelect, (v) => set({ tapSelect: v })),
      );
    } else {
      this.previewSlot = null;
      rows.push(
        el('h4', {}, ['Canvas']),
        choice('Touching the canvas', 'Only the pad: a stray finger never moves the view. Two fingers always pinch to zoom.', p.canvasTouch,
          [['pan', 'Moves the view'], ['pad', 'Only the pad']], (v) => set({ canvasTouch: v })),
        toggle('Lock the view', 'Dragging, pinching and scrolling on the canvas never pan or zoom (the pad and the toolbar still do)', p.lockView, (v) => set({ lockView: v })),
        el('h4', {}, ['View pad']),
        choice('View pad', 'Pan, zoom, fit, zoom to the selection. Auto: shown on touch.', p.viewPad,
          [['auto', 'Auto'], ['right', 'Right'], ['left', 'Left'], ['hidden', 'Hidden']], (v) => set({ viewPad: v })),
      );
    }
    this.body.replaceChildren(...rows);
  }

  /** How the handles will look, at the chosen size and opacity. */
  private preview(): SVGSVGElement {
    const p = this.editor.preferences;
    const size = p.handleSize ?? (this.editor.inputMode() === 'touch' ? 16 : 8);
    const svg = svgEl('svg', { class: 'slt-prefs-preview', viewBox: '0 0 300 80', role: 'img', 'aria-label': 'Preview' });
    const x0 = 90, y0 = 16, w = 120, h = 48;
    svg.appendChild(svgEl('rect', { x: x0, y: y0, width: w, height: h, class: 'slt-prefs-preview-shape' }));
    const g = svgEl('g', { opacity: String(p.handleOpacity) });
    g.appendChild(svgEl('rect', { x: x0, y: y0, width: w, height: h, class: 'slt-prefs-preview-box' }));
    for (const [hx, hy] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]]) {
      g.appendChild(svgEl('rect', { x: x0 + hx * w - size / 2, y: y0 + hy * h - size / 2, width: size, height: size, class: 'slt-prefs-preview-handle' }));
    }
    svg.appendChild(g);
    if (p.moveHandle !== 'off') {
      const r = Math.max(10, size * 0.8);
      svg.appendChild(svgEl('circle', { cx: x0 + w / 2, cy: y0 + h / 2, r, class: 'slt-move-handle' }));
      svg.appendChild(moveArrows(x0 + w / 2, y0 + h / 2, r));
    }
    return svg;
  }
}

/** The four-way arrows drawn on a move handle. */
export function moveArrows(cx: number, cy: number, r: number): SVGElement {
  const a = r * 0.62, s = Math.max(2.5, r * 0.26);
  const d = [
    `M${cx} ${cy - a} l${-s} ${s} h${2 * s}z`,
    `M${cx} ${cy + a} l${-s} ${-s} h${2 * s}z`,
    `M${cx - a} ${cy} l${s} ${-s} v${2 * s}z`,
    `M${cx + a} ${cy} l${-s} ${-s} v${2 * s}z`,
    `M${cx} ${cy - a + s} V${cy + a - s} M${cx - a + s} ${cy} H${cx + a - s}`,
  ].join(' ');
  return svgEl('path', { d, class: 'slt-move-arrows', 'pointer-events': 'none' });
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function row(label: string, hint: string, control: HTMLElement): HTMLElement {
  return el('div', { class: 'slt-prefs-row' }, [
    el('div', { class: 'slt-prefs-label' }, [el('span', {}, [label]), hint ? el('small', {}, [hint]) : null]),
    control,
  ]);
}

function slider(label: string, hint: string, value: number, min: number, max: number, step: number, show: (v: number) => string, onChange: (v: number) => void): HTMLElement {
  const input = el('input', { class: 'slt-range', type: 'range', min, max, step, value, 'aria-label': label });
  const out = el('span', { class: 'slt-prefs-value' }, [show(value)]);
  input.addEventListener('input', () => {
    out.textContent = show(Number(input.value));
    onChange(Number(input.value));
  });
  return row(label, hint, el('span', { class: 'slt-prefs-slider' }, [input, out]));
}

function choice<T extends string>(label: string, hint: string, value: T, options: [T, string][], onChange: (v: T) => void): HTMLElement {
  const seg = el('span', { class: 'slt-seg', role: 'radiogroup', 'aria-label': label });
  for (const [v, text] of options) {
    const b = el('button', { type: 'button', role: 'radio', 'aria-checked': v === value ? 'true' : 'false' }, [text]);
    if (v === value) b.dataset.active = '';
    b.addEventListener('click', () => onChange(v));
    seg.appendChild(b);
  }
  return row(label, hint, seg);
}

function toggle(label: string, hint: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox', role: 'switch', checked: value, 'aria-label': label });
  input.addEventListener('change', () => onChange(input.checked));
  return row(label, hint, el('label', { class: 'slt-switch' }, [input]));
}
