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
  grid-template-columns: 200px minmax(0, 1fr) 280px;
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
.slt-root[data-no-library] { grid-template-columns: minmax(0, 1fr) 280px; grid-template-areas: "toolbar toolbar" "canvas side"; }
.slt-root[data-no-side] { grid-template-columns: 200px minmax(0, 1fr); grid-template-areas: "toolbar toolbar" "library canvas"; }
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
.slt-root[data-layout="mobile"] .slt-toolbar { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
.slt-root[data-layout="mobile"] .slt-toolbar::-webkit-scrollbar { display: none; }
.slt-root[data-layout="mobile"] .slt-toolbar .slt-btn { flex: none; }
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

.slt-library { grid-area: library; display: flex; flex-direction: column; min-height: 0; background: var(--_slt-panel); border-right: 1px solid var(--_slt-border); }
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
.slt-overlay .slt-sel-outline { fill: none; stroke: var(--_slt-accent); stroke-width: 1.5; }
.slt-overlay .slt-hover-outline { fill: none; stroke: var(--_slt-accent); stroke-width: 1; opacity: 0.6; stroke-dasharray: 4 3; }
.slt-overlay .slt-handle { fill: #fff; stroke: var(--_slt-accent); stroke-width: 1.5; pointer-events: all; }
.slt-overlay .slt-handle-rotate { fill: #fff; stroke: var(--_slt-accent); stroke-width: 1.5; pointer-events: all; cursor: grab; }
.slt-overlay .slt-handle-active { fill: var(--_slt-accent); stroke: #fff; stroke-width: 2; filter: drop-shadow(0 0 4px var(--_slt-accent)); }
.slt-overlay .slt-lifted { stroke-width: 3; stroke-dasharray: none; filter: drop-shadow(0 0 6px var(--_slt-accent)); }
.slt-overlay .slt-press-ring { fill: var(--_slt-selected); stroke: var(--_slt-accent); stroke-width: 2; opacity: 0; animation: slt-press 0.6s linear forwards; }
@keyframes slt-press { from { opacity: 0; transform: none; } 30% { opacity: 0.6; } to { opacity: 1; } }
.slt-overlay .slt-rotate-line { stroke: var(--_slt-accent); stroke-width: 1; }
.slt-overlay .slt-rotate-ring { fill: none; stroke: var(--_slt-accent); stroke-width: 1; stroke-dasharray: 3 4; opacity: 0.55; }
.slt-overlay .slt-rotate-ring-active { stroke-dasharray: none; opacity: 0.9; }
.slt-overlay .slt-rotate-label { fill: var(--_slt-text); font: 600 12px var(--_slt-font); paint-order: stroke; stroke: var(--_slt-canvas); stroke-width: 3px; }
.slt-overlay .slt-pivot { stroke: var(--_slt-accent); stroke-width: 1; }
.slt-overlay .slt-marquee { fill: var(--_slt-selected); stroke: var(--_slt-accent); stroke-width: 1; stroke-dasharray: 4 3; }
.slt-canvas-hint { position: absolute; left: 8px; bottom: 6px; font-size: 11px; color: var(--_slt-muted); pointer-events: none; }

.slt-side { grid-area: side; display: flex; flex-direction: column; min-height: 0; background: var(--_slt-panel); border-left: 1px solid var(--_slt-border); }
.slt-layers { display: flex; flex-direction: column; flex: 0 0 42%; min-height: 120px; border-bottom: 1px solid var(--_slt-border); }
.slt-panel-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-right: 8px; }
.slt-preview-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--_slt-muted); cursor: pointer; }
.slt-preview-toggle input { appearance: none; -webkit-appearance: none; width: 30px; height: 16px; margin: 0; border-radius: 8px; background: var(--_slt-border); position: relative; cursor: pointer; transition: background 0.15s; }
.slt-preview-toggle input::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: left 0.15s; }
.slt-preview-toggle input:checked { background: var(--_slt-accent); }
.slt-preview-toggle input:checked::after { left: 16px; }
.slt-layers.slt-previewing .slt-preview-toggle { color: var(--_slt-accent); }
.slt-stage.slt-preview .slt-doc-frame { stroke: var(--_slt-accent); }
.slt-stage.slt-preview [data-layer-id] { cursor: default; }
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
.slt-var-name { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; }
.slt-time-list { display: flex; flex-direction: column; gap: 2px; margin: 4px 0; }
.slt-time-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--_slt-muted); }
.slt-time-row code { color: var(--_slt-text); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; min-width: 78px; }
.slt-time-row .slt-grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slt-time-value { font-variant-numeric: tabular-nums; color: var(--_slt-text); }
.slt-fx { color: var(--_slt-accent); font-weight: 700; font-style: italic; width: 14px; flex: none; }
.slt-binding-expr { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.slt-binding-result { display: block; font-size: 11px; color: var(--_slt-muted); padding: 0 0 2px 20px; font-variant-numeric: tabular-nums; }
.slt-binding-error { color: var(--_slt-danger); }
.slt-bound-hint { color: var(--_slt-accent); }
.slt-effect-head { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
.slt-effect-head .slt-grow { flex: 1; font-weight: 600; }
.slt-effect .slt-row > label { flex-basis: 64px; }
`;
