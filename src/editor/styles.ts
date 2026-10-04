export const EDITOR_STYLES = `
/*
 * Theme tokens. Every colour is read from a public custom property
 * (--slt-bg, --slt-accent, ...) that the host page may set on the editor
 * element or any ancestor; custom properties inherit into the shadow root,
 * so when the host app's theme changes the editor follows automatically.
 * The values after the comma are the built-in dark and light presets.
 */
.slt-root, .slt-root[data-theme="dark"] {
  --_slt-bg: var(--slt-bg, #15171c);
  --_slt-panel: var(--slt-panel, #1d2027);
  --_slt-panel-2: var(--slt-panel-2, #23262e);
  --_slt-border: var(--slt-border, #2e323b);
  --_slt-text: var(--slt-text, #e6e8ee);
  --_slt-muted: var(--slt-muted, #8a90a0);
  --_slt-accent: var(--slt-accent, #4da3ff);
  --_slt-accent-text: var(--slt-accent-text, #ffffff);
  --_slt-input-bg: var(--slt-input-bg, #12141a);
  --_slt-hover: var(--slt-hover, rgba(255, 255, 255, 0.06));
  --_slt-selected: var(--slt-selected, rgba(77, 163, 255, 0.18));
  --_slt-danger: var(--slt-danger, #ff5d5d);
  --_slt-canvas: var(--slt-canvas, #0f1013);
  --_slt-checker-a: var(--slt-checker-a, #2a2d35);
  --_slt-checker-b: var(--slt-checker-b, #1f2229);
  --_slt-radius: var(--slt-radius, 6px);
  --_slt-font: var(--slt-font, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  --_slt-font-size: var(--slt-font-size, 12px);
}
.slt-root[data-theme="light"] {
  --_slt-bg: var(--slt-bg, #f2f3f6);
  --_slt-panel: var(--slt-panel, #ffffff);
  --_slt-panel-2: var(--slt-panel-2, #f5f6f9);
  --_slt-border: var(--slt-border, #d9dce3);
  --_slt-text: var(--slt-text, #1c1f26);
  --_slt-muted: var(--slt-muted, #6b7180);
  --_slt-accent: var(--slt-accent, #2f80ed);
  --_slt-accent-text: var(--slt-accent-text, #ffffff);
  --_slt-input-bg: var(--slt-input-bg, #ffffff);
  --_slt-hover: var(--slt-hover, rgba(0, 0, 0, 0.05));
  --_slt-selected: var(--slt-selected, rgba(47, 128, 237, 0.14));
  --_slt-danger: var(--slt-danger, #d93025);
  --_slt-canvas: var(--slt-canvas, #e4e6eb);
  --_slt-checker-a: var(--slt-checker-a, #d7dae1);
  --_slt-checker-b: var(--slt-checker-b, #eef0f4);
  --_slt-radius: var(--slt-radius, 6px);
  --_slt-font: var(--slt-font, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  --_slt-font-size: var(--slt-font-size, 12px);
}
@media (prefers-color-scheme: light) {
  .slt-root[data-theme="auto"] {
    --_slt-bg: var(--slt-bg, #f2f3f6);
    --_slt-panel: var(--slt-panel, #ffffff);
    --_slt-panel-2: var(--slt-panel-2, #f5f6f9);
    --_slt-border: var(--slt-border, #d9dce3);
    --_slt-text: var(--slt-text, #1c1f26);
    --_slt-muted: var(--slt-muted, #6b7180);
    --_slt-accent: var(--slt-accent, #2f80ed);
    --_slt-accent-text: var(--slt-accent-text, #ffffff);
    --_slt-input-bg: var(--slt-input-bg, #ffffff);
    --_slt-hover: var(--slt-hover, rgba(0, 0, 0, 0.05));
    --_slt-selected: var(--slt-selected, rgba(47, 128, 237, 0.14));
    --_slt-danger: var(--slt-danger, #d93025);
    --_slt-canvas: var(--slt-canvas, #e4e6eb);
    --_slt-checker-a: var(--slt-checker-a, #d7dae1);
    --_slt-checker-b: var(--slt-checker-b, #eef0f4);
    --_slt-radius: var(--slt-radius, 6px);
    --_slt-font: var(--slt-font, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    --_slt-font-size: var(--slt-font-size, 12px);
  }
}
.slt-root {
  all: initial;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  --_slt-library-w: 200px;
  --_slt-side-w: 280px;
  grid-template-columns: var(--_slt-library-w) minmax(0, 1fr) var(--_slt-side-w);
  grid-template-areas: "toolbar toolbar toolbar" "library canvas side";
  width: 100%;
  height: 100%;
  min-height: 420px;
  background: var(--_slt-bg);
  color: var(--_slt-text);
  font-family: var(--_slt-font);
  font-size: var(--_slt-font-size);
  line-height: 1.3;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}
.slt-root *, .slt-root *::before, .slt-root *::after { box-sizing: border-box; }
.slt-root[data-no-library] { grid-template-columns: minmax(0, 1fr) var(--_slt-side-w); grid-template-areas: "toolbar toolbar" "canvas side"; }
.slt-root[data-no-side] { grid-template-columns: var(--_slt-library-w) minmax(0, 1fr); grid-template-areas: "toolbar toolbar" "library canvas"; }
.slt-root[data-resizing] { cursor: col-resize; }
.slt-root[data-resizing] .slt-canvas, .slt-root[data-resizing] .slt-library, .slt-root[data-resizing] .slt-side { pointer-events: none; }
.slt-resizer { position: absolute; top: 0; bottom: 0; width: 7px; z-index: 6; cursor: col-resize; touch-action: none; pointer-events: auto !important; }
.slt-resizer::after { content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: var(--_slt-accent); opacity: 0; transition: opacity 0.12s; }
.slt-resizer:hover::after, .slt-resizer[data-active]::after { opacity: 1; }
.slt-resizer[data-panel="library"] { right: -4px; }
.slt-resizer[data-panel="side"] { left: -4px; }
.slt-root[data-layout="mobile"] .slt-resizer { display: none; }
.slt-root[data-no-library][data-no-side] { grid-template-columns: minmax(0, 1fr); grid-template-areas: "toolbar" "canvas"; }
.slt-root[data-no-toolbar] { grid-template-rows: minmax(0, 1fr); }
.slt-root[data-no-toolbar] .slt-toolbar { display: none; }
.slt-root[data-no-toolbar]:not([data-no-library]):not([data-no-side]) { grid-template-areas: "library canvas side"; }
.slt-root[data-no-toolbar][data-no-library]:not([data-no-side]) { grid-template-areas: "canvas side"; }
.slt-root[data-no-toolbar][data-no-side]:not([data-no-library]) { grid-template-areas: "library canvas"; }
.slt-root[data-no-toolbar][data-no-library][data-no-side] { grid-template-areas: "canvas"; }


/* ---- Mobile layout: canvas on top, tabbed bottom sheet ---- */
.slt-root[data-layout="mobile"] {
  grid-template-columns: minmax(0, 1fr) !important;
  grid-template-rows: auto minmax(0, 1fr) minmax(0, 42%) auto !important;
  grid-template-areas: "toolbar" "canvas" "sheet" "tabs" !important;
  min-height: 320px;
}
.slt-root[data-layout="mobile"][data-no-toolbar] { grid-template-rows: minmax(0, 1fr) minmax(0, 42%) auto !important; grid-template-areas: "canvas" "sheet" "tabs" !important; }
.slt-root[data-layout="mobile"][data-sheet-closed] { grid-template-rows: auto minmax(0, 1fr) 0 auto !important; }
.slt-root[data-layout="mobile"][data-sheet-closed][data-no-toolbar] { grid-template-rows: minmax(0, 1fr) 0 auto !important; }
.slt-root[data-layout="mobile"] .slt-toolbar { flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; touch-action: pan-x; min-width: 0; }
.slt-root[data-layout="mobile"] .slt-toolbar::-webkit-scrollbar { display: none; }
.slt-root[data-layout="mobile"] .slt-toolbar > * { flex: none; }
.slt-root[data-layout="mobile"] .slt-toolbar .slt-spacer { flex: 0 0 8px; }
.slt-root[data-layout="mobile"] .slt-menu-list { right: auto; left: 0; }
.slt-root[data-layout="mobile"] .slt-canvas-hint { display: none; }
.slt-sheet { grid-area: sheet; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: var(--_slt-panel); border-top: 1px solid var(--_slt-border); }
.slt-sheet > * { flex: 1 1 auto; min-height: 0; height: 100%; border: 0 !important; }
.slt-sheet .slt-layers { flex: 1 1 auto; }
.slt-sheet .slt-props { padding-bottom: 8px; }
.slt-tabs { grid-area: tabs; display: flex; background: var(--_slt-panel); border-top: 1px solid var(--_slt-border); padding-bottom: env(safe-area-inset-bottom, 0); }
.slt-tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 52px; border: 0; background: transparent; color: var(--_slt-muted); font: inherit; font-size: 11px; cursor: pointer; padding: 6px 4px; border-top: 2px solid transparent; }
.slt-tab .slt-icon, .slt-tab .slt-icon svg { width: 20px; height: 20px; }
.slt-tab[data-active] { color: var(--_slt-accent); border-top-color: var(--_slt-accent); }
.slt-tab:active { background: var(--_slt-hover); }

.slt-toolbar { grid-area: toolbar; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 8px; background: var(--_slt-panel); border-bottom: 1px solid var(--_slt-border); }
.slt-toolbar .slt-sep { width: 1px; height: 20px; background: var(--_slt-border); margin: 0 4px; }
.slt-toolbar .slt-spacer { flex: 1; }
.slt-zoom-label { min-width: 46px; text-align: center; color: var(--_slt-muted); font-variant-numeric: tabular-nums; }

.slt-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; min-width: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--_slt-radius); background: transparent; color: var(--_slt-text); font: inherit; cursor: pointer; white-space: nowrap; }
.slt-btn:hover { background: var(--_slt-hover); }
.slt-btn:active { transform: translateY(1px); }
.slt-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
.slt-btn:disabled:hover { background: transparent; }
.slt-btn.slt-primary { background: var(--_slt-accent); color: var(--_slt-accent-text); }
.slt-btn.slt-icon-only { padding: 0; width: 28px; }
.slt-btn.slt-danger:hover { color: var(--_slt-danger); }
.slt-icon { display: inline-flex; width: 16px; height: 16px; }
.slt-icon svg { width: 16px; height: 16px; }
.slt-btn.slt-small { height: 22px; min-width: 22px; padding: 0 6px; font-size: 11px; }
.slt-btn.slt-small .slt-icon, .slt-btn.slt-small .slt-icon svg { width: 13px; height: 13px; }

.slt-menu { position: relative; }
.slt-menu-list { position: absolute; top: 100%; right: 0; z-index: 20; min-width: 170px; margin-top: 4px; padding: 4px; background: var(--_slt-panel-2); border: 1px solid var(--_slt-border); border-radius: var(--_slt-radius); box-shadow: 0 8px 24px rgba(0,0,0,0.35); display: none; flex-direction: column; }
.slt-menu[data-open] .slt-menu-list { display: flex; }
.slt-menu-list .slt-btn { justify-content: flex-start; width: 100%; }

.slt-library { grid-area: library; position: relative; display: flex; flex-direction: column; min-height: 0; background: var(--_slt-panel); border-right: 1px solid var(--_slt-border); }
.slt-panel-title { padding: 8px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--_slt-muted); }
.slt-library-search { margin: 4px 8px 6px; }
.slt-library-scroll { flex: 1; overflow: auto; padding: 0 8px 8px; }
.slt-library-cat { margin: 6px 0 2px; font-size: 11px; color: var(--_slt-muted); }
.slt-library-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; }
.slt-shape-btn { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; padding: 4px; border: 1px solid var(--_slt-border); border-radius: var(--_slt-radius); background: var(--_slt-panel-2); color: var(--_slt-text); cursor: pointer; }
.slt-shape-btn:hover { border-color: var(--_slt-accent); background: var(--_slt-hover); }
.slt-shape-btn svg { width: 100%; height: 100%; }
.slt-empty { padding: 10px; color: var(--_slt-muted); }

.slt-canvas { grid-area: canvas; position: relative; display: flex; min-width: 0; min-height: 0; background: var(--_slt-canvas); outline: none; overflow: hidden; touch-action: none; }
.slt-canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--_slt-accent); }
.slt-stage-wrap { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; }
.slt-stage { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: default; }
.slt-strip-slot { flex: none; display: flex; }
.slt-strip { width: 56px; display: flex; flex-direction: column; background: var(--_slt-panel); border-right: 1px solid var(--_slt-border); min-height: 0; }
.slt-strip-list { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px 5px; display: flex; flex-direction: column; gap: 6px; scrollbar-width: thin; }
.slt-thumb { position: relative; flex: none; width: 44px; height: 44px; padding: 2px; border: 2px solid var(--_slt-border); border-radius: 6px; background: var(--_slt-input-bg); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.slt-thumb svg { width: 100%; height: 100%; display: block; pointer-events: none; }
.slt-thumb:hover { border-color: var(--_slt-muted); }
.slt-thumb[data-selected] { border-color: var(--_slt-accent); box-shadow: 0 0 0 2px var(--_slt-selected); }
.slt-thumb[data-hidden] svg { opacity: 0.3; }
.slt-thumb[data-locked]::after { content: ""; position: absolute; inset: 0; border-radius: 4px; background: repeating-linear-gradient(45deg, transparent 0 4px, rgba(128,128,128,0.18) 4px 6px); pointer-events: none; }
.slt-thumb-badge { position: absolute; left: 1px; top: 1px; display: inline-flex; color: var(--_slt-accent); }
.slt-thumb-badge svg { width: 10px !important; height: 10px !important; }
.slt-thumb-enter { position: absolute; right: -1px; bottom: -1px; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px 0 4px 0; background: var(--_slt-accent); color: var(--_slt-accent-text); }
.slt-thumb-enter svg { width: 11px !important; height: 11px !important; }
.slt-strip-btn { flex: none; width: 44px; height: 28px; border: 1px solid var(--_slt-border); border-radius: 6px; background: var(--_slt-panel-2); color: var(--_slt-text); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.slt-strip-empty { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: var(--_slt-muted); opacity: 0.5; }
@media (pointer: coarse) { .slt-strip { width: 60px; } .slt-thumb { width: 48px; height: 48px; } .slt-strip-btn { width: 48px; height: 34px; } }
.slt-root[data-layout="mobile"] .slt-strip { width: 52px; }
.slt-root[data-layout="mobile"] .slt-thumb { width: 40px; height: 40px; }
.slt-root[data-layout="mobile"] .slt-strip-btn { width: 40px; }
.slt-stage.slt-panning { cursor: grab; }
.slt-stage.slt-panning:active { cursor: grabbing; }
.slt-stage [data-layer-id] { cursor: move; }
.slt-stage [data-locked] { pointer-events: none; }
.slt-stage [data-ghost] { cursor: pointer; }
.slt-doc-frame { fill: none; stroke: var(--_slt-border); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
.slt-overlay { pointer-events: none; }
.slt-overlay .slt-sel-outline { fill: none; stroke: var(--_slt-accent); stroke-width: 1.5; opacity: var(--_slt-handle-op, 1); }
.slt-overlay .slt-hover-outline { fill: none; stroke: var(--_slt-accent); stroke-width: 1; opacity: 0.6; stroke-dasharray: 4 3; }
.slt-overlay .slt-handle { fill: #fff; stroke: var(--_slt-accent); stroke-width: 1.5; pointer-events: all; opacity: var(--_slt-handle-op, 1); }
.slt-overlay .slt-handle-rotate { fill: #fff; stroke: var(--_slt-accent); stroke-width: 1.5; pointer-events: all; cursor: grab; opacity: var(--_slt-handle-op, 1); }
.slt-overlay .slt-handle-active { fill: var(--_slt-accent); stroke: #fff; stroke-width: 2; filter: drop-shadow(0 0 4px var(--_slt-accent)); opacity: 1; }
/* invisible, larger catch areas around handles (Preferences: Touch area) */
.slt-overlay .slt-hit { fill: transparent; stroke: none; pointer-events: all; }
/* the move handle: always at full strength, it's the thing to grab */
.slt-overlay .slt-move-handle { fill: var(--_slt-accent); stroke: #fff; stroke-width: 1.5; pointer-events: all; cursor: move; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35)); }
.slt-overlay .slt-move-active { filter: drop-shadow(0 0 5px var(--_slt-accent)); }
.slt-overlay .slt-move-arrows { fill: var(--_slt-accent-text); stroke: var(--_slt-accent-text); stroke-width: 1.4; stroke-linejoin: round; }
.slt-overlay .slt-move-link { stroke: var(--_slt-accent); stroke-width: 1.2; stroke-dasharray: 2 3; opacity: var(--_slt-handle-op, 1); }
.slt-overlay .slt-lifted { stroke-width: 3; stroke-dasharray: none; filter: drop-shadow(0 0 6px var(--_slt-accent)); }
.slt-overlay .slt-press-ring { fill: var(--_slt-selected); stroke: var(--_slt-accent); stroke-width: 2; opacity: 0; animation: slt-press 0.6s linear forwards; }
@keyframes slt-press { from { opacity: 0; transform: none; } 30% { opacity: 0.6; } to { opacity: 1; } }
.slt-overlay .slt-rotate-line { stroke: var(--_slt-accent); stroke-width: 1; }
.slt-overlay .slt-rotate-ring { fill: none; stroke: var(--_slt-accent); stroke-width: 1; stroke-dasharray: 3 4; opacity: calc(0.55 * var(--_slt-handle-op, 1)); }
.slt-overlay .slt-rotate-ring-active { stroke-dasharray: none; opacity: 0.9; }
.slt-overlay .slt-rotate-label { fill: var(--_slt-text); font: 600 12px var(--_slt-font); paint-order: stroke; stroke: var(--_slt-canvas); stroke-width: 3px; }
.slt-overlay .slt-pivot { stroke: var(--_slt-accent); stroke-width: 1; opacity: var(--_slt-marker-op, 1); }
.slt-overlay .slt-anchor { fill: var(--_slt-accent); stroke: #fff; stroke-width: 1.5; pointer-events: all; cursor: move; opacity: var(--_slt-marker-op, 1); }
.slt-overlay .slt-readout { fill: var(--_slt-text); font: 600 12px var(--_slt-font); font-variant-numeric: tabular-nums; paint-order: stroke; stroke: var(--_slt-canvas); stroke-width: 4px; stroke-linejoin: round; }
.slt-loupe-bg { fill: var(--_slt-canvas); }
.slt-overlay .slt-guide { stroke: #e0368f; stroke-width: 1; stroke-dasharray: 6 4; }
.slt-overlay .slt-trail { fill: var(--_slt-accent); fill-opacity: 0.12; stroke: var(--_slt-accent); stroke-width: 1; stroke-dasharray: 3 3; }
.slt-overlay .slt-trail-path { fill: none; stroke: var(--_slt-accent); stroke-width: 1.5; stroke-dasharray: 5 4; opacity: 0.8; }
.slt-overlay .slt-trail-end { fill: var(--_slt-accent); }
.slt-prefs-note { margin: 8px 0 0; color: var(--_slt-muted); font-size: 11px; }
.slt-prefs-keys { width: 100%; border-collapse: collapse; font-size: 12px; }
.slt-prefs-keys th { text-align: left; font-weight: 600; padding: 4px 10px 4px 0; white-space: nowrap; vertical-align: top; color: var(--_slt-text); font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
.slt-prefs-keys td { padding: 4px 0; color: var(--_slt-muted); }
.slt-prefs-keys tr + tr { border-top: 1px solid var(--_slt-border); }
.slt-switch.slt-try-trail { padding-left: 0; }
.slt-loupe-ring { fill: none; stroke: var(--_slt-accent); stroke-width: 2.5; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35)); }
.slt-loupe-cross { stroke: var(--_slt-accent); stroke-width: 1.2; }
.slt-overlay .slt-anchor-link { stroke: var(--_slt-accent); stroke-width: 1.2; stroke-dasharray: 4 3; pointer-events: none; opacity: var(--_slt-marker-op, 1); }
.slt-overlay .slt-anchor-ring { fill: none; stroke: var(--_slt-accent); stroke-width: 1.5; pointer-events: none; opacity: var(--_slt-marker-op, 1); }
.slt-overlay .slt-anchor-label { fill: var(--_slt-text); font: 600 11px var(--_slt-font); paint-order: stroke; stroke: var(--_slt-canvas); stroke-width: 3px; pointer-events: none; opacity: var(--_slt-marker-op, 1); }
.slt-overlay .slt-marquee { fill: var(--_slt-selected); stroke: var(--_slt-accent); stroke-width: 1; stroke-dasharray: 4 3; }
.slt-canvas-hint { position: absolute; left: 8px; bottom: 6px; font-size: 11px; color: var(--_slt-muted); pointer-events: none; }
.slt-pad-left .slt-canvas-hint { display: none; }
.slt-btn.slt-on { color: var(--_slt-accent); background: var(--_slt-selected); }

/* The view pad (over the canvas) */
.slt-viewpad { position: absolute; bottom: 10px; right: 10px; display: flex; align-items: center; gap: 6px; padding: 6px; background: var(--_slt-panel); border: 1px solid var(--_slt-border); border-radius: 12px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18); touch-action: none; user-select: none; -webkit-user-select: none; }
.slt-viewpad[data-side="left"] { right: auto; left: 10px; }
.slt-viewpad[hidden], .slt-toolbar [hidden] { display: none !important; }
.slt-viewpad-disc { position: relative; width: 76px; height: 76px; border-radius: 50%; background: var(--_slt-panel-2); border: 1px solid var(--_slt-border); cursor: grab; flex: none; }
.slt-viewpad-disc[data-active] { cursor: grabbing; }
.slt-viewpad-knob { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; margin: -13px; border-radius: 50%; background: var(--_slt-accent); opacity: 0.85; pointer-events: none; }
.slt-viewpad-arrow { position: absolute; width: 22px; height: 22px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: transparent; color: var(--_slt-muted); cursor: pointer; }
.slt-viewpad-arrow:hover { color: var(--_slt-text); background: var(--_slt-hover); }
.slt-viewpad-arrow .slt-icon svg { width: 13px; height: 13px; }
.slt-viewpad-n { left: 26px; top: 1px; } .slt-viewpad-s { left: 26px; bottom: 1px; }
.slt-viewpad-w { left: 1px; top: 26px; transform: rotate(180deg); } .slt-viewpad-e { right: 1px; top: 26px; }
.slt-viewpad-col { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.slt-viewpad-btn { min-width: 26px; height: 22px; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--_slt-border); border-radius: 6px; background: var(--_slt-panel); color: var(--_slt-text); font: 600 10px var(--_slt-font); cursor: pointer; }
.slt-viewpad-btn:hover { background: var(--_slt-hover); }
.slt-viewpad-btn .slt-icon svg { width: 13px; height: 13px; }
input.slt-viewpad-zoom { writing-mode: vertical-lr; direction: rtl; width: 18px; height: 50px; margin: 0; accent-color: var(--_slt-accent); }

/* The nudge pad (touch) */
.slt-nudge { position: absolute; bottom: 10px; left: 10px; display: grid; grid-template-columns: repeat(3, 34px); grid-template-rows: repeat(3, 34px); gap: 3px; padding: 6px; background: var(--_slt-panel); border: 1px solid var(--_slt-border); border-radius: 12px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18); touch-action: none; user-select: none; -webkit-user-select: none; }
.slt-nudge[data-side="right"] { left: auto; right: 10px; }
.slt-nudge[hidden] { display: none; }
.slt-nudge button { display: flex; align-items: center; justify-content: center; padding: 0; border: 1px solid var(--_slt-border); border-radius: 7px; background: var(--_slt-panel-2); color: var(--_slt-text); font: 600 11px var(--_slt-font); cursor: pointer; }
.slt-nudge button:active { background: var(--_slt-selected); }
.slt-nudge .slt-nudge-step { background: var(--_slt-accent); color: var(--_slt-accent-text); border-color: var(--_slt-accent); }
.slt-nudge .slt-nudge-fine { font-size: 10px; }
.slt-nudge .slt-nudge-fine[data-active] { background: var(--_slt-accent); color: var(--_slt-accent-text); border-color: var(--_slt-accent); }
.slt-nudge .slt-nudge-left { transform: rotate(180deg); }
.slt-canvas-toast { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 20px); padding: 6px 12px; border-radius: 16px; background: var(--_slt-text); color: var(--_slt-panel); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; opacity: 0; transition: opacity 0.2s; }
.slt-canvas-toast[data-show] { opacity: 0.94; }

/* Preferences */
.slt-prefs-backdrop { position: absolute; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.35); }
.slt-prefs { width: min(640px, calc(100% - 24px)); max-height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--_slt-panel); color: var(--_slt-text); border: 1px solid var(--_slt-border); border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35); overflow: hidden; }
.slt-prefs-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px 8px 14px; border-bottom: 1px solid var(--_slt-border); }
.slt-prefs-title { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
.slt-prefs-main { display: flex; min-height: 0; flex: 1; }
.slt-prefs-nav { display: flex; flex-direction: column; gap: 2px; padding: 8px; border-right: 1px solid var(--_slt-border); flex: 0 0 150px; }
.slt-prefs-tab { text-align: left; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--_slt-text); font: inherit; cursor: pointer; }
.slt-prefs-tab:hover { background: var(--_slt-hover); }
.slt-prefs-tab[data-active] { background: var(--_slt-selected); color: var(--_slt-accent); font-weight: 600; }
.slt-prefs-body { flex: 1; min-width: 0; overflow: auto; padding: 4px 16px 14px; }
.slt-prefs-body h4 { margin: 12px 0 2px; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--_slt-muted); }
.slt-prefs-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--_slt-border); }
.slt-prefs-label { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.slt-prefs-label small { color: var(--_slt-muted); font-size: 11px; line-height: 1.3; }
.slt-prefs-slider { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; width: 200px; }
.slt-prefs-value { min-width: 70px; text-align: right; color: var(--_slt-muted); font-variant-numeric: tabular-nums; font-size: 12px; }
.slt-seg { display: inline-flex; flex: none; border: 1px solid var(--_slt-border); border-radius: 7px; overflow: hidden; }
.slt-seg button { padding: 4px 9px; border: 0; background: transparent; color: var(--_slt-text); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.slt-seg button + button { border-left: 1px solid var(--_slt-border); }
.slt-seg button[data-active] { background: var(--_slt-accent); color: var(--_slt-accent-text); }
.slt-prefs-preview-slot { margin-top: 10px; }
.slt-prefs-preview { display: block; width: 100%; height: 84px; border-radius: 8px; background: var(--_slt-canvas); border: 1px solid var(--_slt-border); }
.slt-prefs-preview-shape { fill: var(--_slt-muted); opacity: 0.35; }
.slt-prefs-preview-box { fill: none; stroke: var(--_slt-accent); stroke-width: 1.5; }
.slt-prefs-preview-handle { fill: #fff; stroke: var(--_slt-accent); stroke-width: 1.5; }
.slt-prefs-preview .slt-move-handle { fill: var(--_slt-accent); stroke: #fff; stroke-width: 1.5; }
.slt-prefs-preview .slt-move-arrows { fill: var(--_slt-accent-text); stroke: var(--_slt-accent-text); stroke-width: 1.4; }
.slt-prefs-foot { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--_slt-border); }
.slt-prefs-foot .slt-spacer { flex: 1; }
/* On a phone: a sheet from the bottom, the pages as chips */
.slt-root[data-layout="mobile"] .slt-prefs-backdrop { align-items: flex-end; }
.slt-root[data-layout="mobile"] .slt-prefs { width: 100%; max-height: 88%; border-radius: 16px 16px 0 0; }
.slt-root[data-layout="mobile"] .slt-prefs-main { flex-direction: column; }
.slt-root[data-layout="mobile"] .slt-prefs-nav { flex: none; flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--_slt-border); }
.slt-root[data-layout="mobile"] .slt-prefs-tab { white-space: nowrap; border: 1px solid var(--_slt-border); border-radius: 14px; padding: 4px 10px; }
.slt-root[data-layout="mobile"] .slt-prefs-row { flex-wrap: wrap; }
.slt-root[data-layout="mobile"] .slt-prefs-slider { width: 100%; }

.slt-side { grid-area: side; position: relative; display: flex; flex-direction: column; min-height: 0; background: var(--_slt-panel); border-left: 1px solid var(--_slt-border); }
.slt-layers { display: flex; flex-direction: column; flex: 0 0 38%; min-height: 120px; border-bottom: 1px solid var(--_slt-border); }
.slt-side .slt-tabs { border-top: 0; border-bottom: 1px solid var(--_slt-border); }
.slt-side .slt-tab { min-height: 40px; flex-direction: row; gap: 5px; font-size: 11px; border-top: 0; border-bottom: 2px solid transparent; }
.slt-side .slt-tab .slt-icon, .slt-side .slt-tab .slt-icon svg { width: 14px; height: 14px; }
.slt-side .slt-tab[data-active] { border-bottom-color: var(--_slt-accent); }
.slt-side .slt-sheet { flex: 1 1 auto; border-top: 0; }
.slt-switch { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 6px; border-radius: var(--_slt-radius); font-size: 12px; color: var(--_slt-muted); cursor: pointer; white-space: nowrap; }
.slt-switch:hover { background: var(--_slt-hover); }
.slt-switch input { appearance: none; -webkit-appearance: none; width: 30px; height: 16px; margin: 0; border-radius: 8px; background: var(--_slt-border); position: relative; cursor: pointer; transition: background 0.15s; flex: none; }
.slt-switch input::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: left 0.15s; }
.slt-switch input:checked { background: var(--_slt-accent); }
.slt-switch input:checked::after { left: 16px; }
.slt-switch:has(input:checked) { color: var(--_slt-text); }
.slt-toolbar.slt-previewing .slt-switch:has(input:checked) { color: var(--_slt-accent); }
.slt-grid-lines { stroke: var(--_slt-text); vector-effect: non-scaling-stroke; pointer-events: none; }
.slt-stage.slt-preview .slt-doc-frame { stroke: var(--_slt-accent); }
.slt-stage.slt-preview [data-layer-id] { cursor: default; }
.slt-layers-tools { display: flex; align-items: center; gap: 2px; padding: 0 6px 4px; border-bottom: 1px solid var(--_slt-border); }
.slt-layers-tools .slt-sep { width: 1px; height: 16px; background: var(--_slt-border); margin: 0 4px; }
.slt-grip { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 26px; color: var(--_slt-muted); opacity: 0.5; cursor: grab; flex: none; touch-action: none; }
.slt-grip svg { width: 12px; height: 12px; }
.slt-layer-row:hover .slt-grip { opacity: 1; }
.slt-layers-list.slt-dragging { cursor: grabbing; }
.slt-layers-list.slt-dragging .slt-layer-row { cursor: grabbing; }
.slt-layers-list { position: relative; }
.slt-drag-ghost { position: absolute; left: 0; top: 0; z-index: 5; pointer-events: none; padding: 3px 8px; background: var(--_slt-panel-2); border: 1px solid var(--_slt-accent); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 12px; white-space: nowrap; }
.slt-layer-row .slt-row-delete { opacity: 0.35; }
.slt-layer-row .slt-row-delete:hover { color: var(--_slt-danger); opacity: 1; }
.slt-layers-list { flex: 1; overflow: auto; padding: 2px 4px 8px; }
.slt-layer-row { display: flex; align-items: center; gap: 4px; height: 26px; padding: 0 4px 0 0; border-radius: 4px; cursor: pointer; position: relative; }
.slt-layer-row:hover { background: var(--_slt-hover); }
.slt-layer-row[data-selected] { background: var(--_slt-selected); }
.slt-layer-row[data-hidden] .slt-layer-name { opacity: 0.5; }
.slt-layer-row .slt-expander { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; color: var(--_slt-muted); flex: none; }
.slt-layer-row .slt-expander svg { width: 12px; height: 12px; }
.slt-layer-row .slt-type-icon { color: var(--_slt-muted); flex: none; }
.slt-layer-row .slt-layer-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slt-layer-row .slt-layer-name input { width: 100%; font: inherit; color: inherit; background: var(--_slt-input-bg); border: 1px solid var(--_slt-accent); border-radius: 3px; padding: 1px 4px; }
.slt-layer-row .slt-badge { display: inline-flex; color: var(--_slt-accent); flex: none; }
.slt-layer-row .slt-badge svg { width: 12px; height: 12px; }
.slt-layer-row .slt-row-btn { display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--_slt-muted); cursor: pointer; border-radius: 3px; padding: 0; flex: none; opacity: 0.55; }
.slt-layer-row .slt-row-btn:hover { background: var(--_slt-hover); color: var(--_slt-text); opacity: 1; }
.slt-layer-row .slt-row-btn[data-active] { opacity: 1; color: var(--_slt-text); }
.slt-layer-row .slt-row-btn svg { width: 13px; height: 13px; }
.slt-layer-row[data-drop="before"]::before { content: ""; position: absolute; left: 4px; right: 4px; top: -1px; height: 2px; background: var(--_slt-accent); }
.slt-layer-row[data-drop="after"]::after { content: ""; position: absolute; left: 4px; right: 4px; bottom: -1px; height: 2px; background: var(--_slt-accent); }
.slt-layer-row[data-drop="into"] { box-shadow: inset 0 0 0 1.5px var(--_slt-accent); }

@media (pointer: coarse) {
  .slt-layer-row { height: 34px; }
  .slt-grip { width: 24px; height: 34px; opacity: 0.8; }
  .slt-grip svg { width: 14px; height: 14px; }
  .slt-layer-row .slt-row-btn { width: 30px; height: 30px; }
  .slt-input, .slt-select { height: 30px; }
  .slt-btn { height: 34px; min-width: 34px; }
  .slt-shape-btn { min-height: 44px; }
  .slt-library-grid { grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); }
}
.slt-props { flex: 1; min-height: 0; overflow: auto; padding: 0 0 12px; }
.slt-section { border-bottom: 1px solid var(--_slt-border); padding: 4px 10px 8px; }
.slt-section-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 0 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--_slt-muted); }
.slt-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.slt-row > label { flex: 0 0 74px; color: var(--_slt-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slt-row > label.slt-check { flex: 1 1 auto; min-width: 0; white-space: normal; overflow: visible; }
.slt-row > label.slt-switch { flex: 0 0 auto; overflow: visible; color: var(--_slt-text); }
.slt-row .slt-grow { flex: 1; min-width: 0; }
.slt-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
.slt-field { display: flex; align-items: center; gap: 4px; min-width: 0; }
.slt-field > span { color: var(--_slt-muted); width: 14px; text-align: center; flex: none; }
.slt-input, .slt-select { height: 24px; min-width: 0; width: 100%; padding: 0 6px; font: inherit; font-size: 12px; color: var(--_slt-text); background: var(--_slt-input-bg); border: 1px solid var(--_slt-border); border-radius: 4px; outline: none; }
.slt-input:focus, .slt-select:focus { border-color: var(--_slt-accent); }
.slt-input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
.slt-input[type="number"]::-webkit-inner-spin-button { opacity: 0.5; }
input.slt-range { flex: 1; min-width: 0; height: 18px; accent-color: var(--_slt-accent); margin: 0; background: transparent; }
.slt-range + .slt-input { flex: 0 0 58px; }
input.slt-color { width: 26px; height: 24px; padding: 0; border: 1px solid var(--_slt-border); border-radius: 4px; background: transparent; cursor: pointer; flex: none; }
input.slt-color::-webkit-color-swatch-wrapper { padding: 2px; }
input.slt-color::-webkit-color-swatch { border: 0; border-radius: 2px; }
.slt-swatch { width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--_slt-border); flex: none; }
input.slt-gray-range { background: linear-gradient(90deg, #000, #fff); border-radius: 4px; height: 10px; }
.slt-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: var(--_slt-text); }
.slt-check input { accent-color: var(--_slt-accent); margin: 0; }
.slt-hint { color: var(--_slt-muted); font-size: 11px; margin: 4px 0; }
.slt-btn-row { display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0; }

.slt-effect { margin: 6px 0; padding: 6px 8px; background: var(--_slt-panel-2); border: 1px solid var(--_slt-border); border-radius: var(--_slt-radius); }
.slt-effect[data-disabled] { opacity: 0.6; }
.slt-modifier[data-type="mask"] { border-color: var(--_slt-accent); }
.slt-modifiers-empty { padding: 8px 0; }
.slt-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 6px; }
.slt-formula-toggle[data-active] { background: var(--_slt-accent); border-color: var(--_slt-accent); }
.slt-formula-toggle[data-active] .slt-fx { color: var(--_slt-accent-text); }
.slt-variable-formula .slt-hint { padding: 0 0 2px 20px; }
.slt-var-name { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; }
.slt-ref-list { margin: 2px 0; }
.slt-ref-toggle { padding-left: 2px; }
.slt-ref-count { margin-left: 4px; padding: 0 5px; border-radius: 8px; background: var(--_slt-panel-2); color: var(--_slt-muted); font-size: 10px; }
.slt-time-list { display: flex; flex-direction: column; gap: 2px; margin: 4px 0; }
.slt-time-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--_slt-muted); }
.slt-time-row code { color: var(--_slt-text); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; min-width: 78px; flex: none; white-space: nowrap; }
.slt-time-row .slt-grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slt-time-value { font-variant-numeric: tabular-nums; color: var(--_slt-text); }
.slt-anchor-row { align-items: flex-start; }
.slt-anchor-presets { display: grid; grid-template-columns: repeat(3, 12px); gap: 3px; padding: 4px; border: 1px solid var(--_slt-border); border-radius: 4px; flex: none; }
.slt-anchor-preset { width: 12px; height: 12px; padding: 0; border: 1px solid var(--_slt-muted); border-radius: 50%; background: transparent; cursor: pointer; }
.slt-anchor-preset:hover { border-color: var(--_slt-accent); }
.slt-anchor-preset[data-active] { background: var(--_slt-accent); border-color: var(--_slt-accent); }
.slt-anchor-unit button:disabled { opacity: 0.5; cursor: default; }
.slt-fx { color: var(--_slt-accent); font-weight: 700; font-style: italic; width: 14px; flex: none; }
.slt-binding-expr { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.slt-binding-result { display: block; font-size: 11px; color: var(--_slt-muted); padding: 0 0 2px 20px; font-variant-numeric: tabular-nums; }
.slt-binding-error { color: var(--_slt-danger); }
.slt-bound-hint { color: var(--_slt-accent); }
.slt-effect-head { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
.slt-effect-head .slt-grow { flex: 1; font-weight: 600; }
.slt-effect .slt-row > label { flex-basis: 64px; }
`;
