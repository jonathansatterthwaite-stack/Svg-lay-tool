export const EDITOR_STYLES = `
:host, .slt-root {
  --slt-bg: #15171c;
  --slt-panel: #1d2027;
  --slt-panel-2: #23262e;
  --slt-border: #2e323b;
  --slt-text: #e6e8ee;
  --slt-muted: #8a90a0;
  --slt-accent: #4da3ff;
  --slt-accent-text: #ffffff;
  --slt-input-bg: #12141a;
  --slt-hover: rgba(255, 255, 255, 0.06);
  --slt-selected: rgba(77, 163, 255, 0.18);
  --slt-danger: #ff5d5d;
  --slt-canvas: #0f1013;
  --slt-checker-a: #2a2d35;
  --slt-checker-b: #1f2229;
  --slt-radius: 6px;
  --slt-font: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --slt-font-size: 12px;
}
.slt-root[data-theme="light"] {
  --slt-bg: #f2f3f6;
  --slt-panel: #ffffff;
  --slt-panel-2: #f5f6f9;
  --slt-border: #d9dce3;
  --slt-text: #1c1f26;
  --slt-muted: #6b7180;
  --slt-accent: #2f80ed;
  --slt-input-bg: #ffffff;
  --slt-hover: rgba(0, 0, 0, 0.05);
  --slt-selected: rgba(47, 128, 237, 0.14);
  --slt-canvas: #e4e6eb;
  --slt-checker-a: #d7dae1;
  --slt-checker-b: #eef0f4;
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
  background: var(--slt-bg);
  color: var(--slt-text);
  font-family: var(--slt-font);
  font-size: var(--slt-font-size);
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

@media (max-width: 760px) {
  .slt-root { grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: auto minmax(0, 1fr) auto auto !important;
    grid-template-areas: "toolbar" "canvas" "library" "side" !important; overflow: auto; }
  .slt-library { max-height: 160px; }
  .slt-side { max-height: 45vh; }
}

.slt-toolbar { grid-area: toolbar; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 8px; background: var(--slt-panel); border-bottom: 1px solid var(--slt-border); }
.slt-toolbar .slt-sep { width: 1px; height: 20px; background: var(--slt-border); margin: 0 4px; }
.slt-toolbar .slt-spacer { flex: 1; }
.slt-zoom-label { min-width: 46px; text-align: center; color: var(--slt-muted); font-variant-numeric: tabular-nums; }

.slt-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; min-width: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--slt-radius); background: transparent; color: var(--slt-text); font: inherit; cursor: pointer; white-space: nowrap; }
.slt-btn:hover { background: var(--slt-hover); }
.slt-btn:active { transform: translateY(1px); }
.slt-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
.slt-btn:disabled:hover { background: transparent; }
.slt-btn.slt-primary { background: var(--slt-accent); color: var(--slt-accent-text); }
.slt-btn.slt-icon-only { padding: 0; width: 28px; }
.slt-btn.slt-danger:hover { color: var(--slt-danger); }
.slt-icon { display: inline-flex; width: 16px; height: 16px; }
.slt-icon svg { width: 16px; height: 16px; }
.slt-btn.slt-small { height: 22px; min-width: 22px; padding: 0 6px; font-size: 11px; }
.slt-btn.slt-small .slt-icon, .slt-btn.slt-small .slt-icon svg { width: 13px; height: 13px; }

.slt-menu { position: relative; }
.slt-menu-list { position: absolute; top: 100%; right: 0; z-index: 20; min-width: 170px; margin-top: 4px; padding: 4px; background: var(--slt-panel-2); border: 1px solid var(--slt-border); border-radius: var(--slt-radius); box-shadow: 0 8px 24px rgba(0,0,0,0.35); display: none; flex-direction: column; }
.slt-menu[data-open] .slt-menu-list { display: flex; }
.slt-menu-list .slt-btn { justify-content: flex-start; width: 100%; }

.slt-library { grid-area: library; display: flex; flex-direction: column; min-height: 0; background: var(--slt-panel); border-right: 1px solid var(--slt-border); }
.slt-panel-title { padding: 8px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--slt-muted); }
.slt-library-search { margin: 4px 8px 6px; }
.slt-library-scroll { flex: 1; overflow: auto; padding: 0 8px 8px; }
.slt-library-cat { margin: 6px 0 2px; font-size: 11px; color: var(--slt-muted); }
.slt-library-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; }
.slt-shape-btn { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; padding: 4px; border: 1px solid var(--slt-border); border-radius: var(--slt-radius); background: var(--slt-panel-2); color: var(--slt-text); cursor: pointer; }
.slt-shape-btn:hover { border-color: var(--slt-accent); background: var(--slt-hover); }
.slt-shape-btn svg { width: 100%; height: 100%; }
.slt-empty { padding: 10px; color: var(--slt-muted); }

.slt-canvas { grid-area: canvas; position: relative; min-width: 0; min-height: 0; background: var(--slt-canvas); outline: none; overflow: hidden; touch-action: none; }
.slt-canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--slt-accent); }
.slt-stage { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: default; }
.slt-stage.slt-panning { cursor: grab; }
.slt-stage.slt-panning:active { cursor: grabbing; }
.slt-stage [data-layer-id] { cursor: move; }
.slt-stage [data-locked] { pointer-events: none; }
.slt-stage [data-ghost] { cursor: pointer; }
.slt-doc-frame { fill: none; stroke: var(--slt-border); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
.slt-overlay { pointer-events: none; }
.slt-overlay .slt-sel-outline { fill: none; stroke: var(--slt-accent); stroke-width: 1.5; }
.slt-overlay .slt-hover-outline { fill: none; stroke: var(--slt-accent); stroke-width: 1; opacity: 0.6; stroke-dasharray: 4 3; }
.slt-overlay .slt-handle { fill: #fff; stroke: var(--slt-accent); stroke-width: 1.5; pointer-events: all; }
.slt-overlay .slt-handle-rotate { fill: #fff; stroke: var(--slt-accent); stroke-width: 1.5; pointer-events: all; cursor: grab; }
.slt-overlay .slt-rotate-line { stroke: var(--slt-accent); stroke-width: 1; }
.slt-overlay .slt-pivot { stroke: var(--slt-accent); stroke-width: 1; }
.slt-overlay .slt-marquee { fill: var(--slt-selected); stroke: var(--slt-accent); stroke-width: 1; stroke-dasharray: 4 3; }
.slt-canvas-hint { position: absolute; left: 8px; bottom: 6px; font-size: 11px; color: var(--slt-muted); pointer-events: none; }

.slt-side { grid-area: side; display: flex; flex-direction: column; min-height: 0; background: var(--slt-panel); border-left: 1px solid var(--slt-border); }
.slt-layers { display: flex; flex-direction: column; flex: 0 0 42%; min-height: 120px; border-bottom: 1px solid var(--slt-border); }
.slt-layers-list { flex: 1; overflow: auto; padding: 2px 4px 8px; }
.slt-layer-row { display: flex; align-items: center; gap: 4px; height: 26px; padding: 0 4px 0 0; border-radius: 4px; cursor: pointer; position: relative; }
.slt-layer-row:hover { background: var(--slt-hover); }
.slt-layer-row[data-selected] { background: var(--slt-selected); }
.slt-layer-row[data-hidden] .slt-layer-name { opacity: 0.5; }
.slt-layer-row .slt-expander { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; color: var(--slt-muted); flex: none; }
.slt-layer-row .slt-expander svg { width: 12px; height: 12px; }
.slt-layer-row .slt-type-icon { color: var(--slt-muted); flex: none; }
.slt-layer-row .slt-layer-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slt-layer-row .slt-layer-name input { width: 100%; font: inherit; color: inherit; background: var(--slt-input-bg); border: 1px solid var(--slt-accent); border-radius: 3px; padding: 1px 4px; }
.slt-layer-row .slt-badge { display: inline-flex; color: var(--slt-accent); flex: none; }
.slt-layer-row .slt-badge svg { width: 12px; height: 12px; }
.slt-layer-row .slt-row-btn { display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--slt-muted); cursor: pointer; border-radius: 3px; padding: 0; flex: none; opacity: 0.55; }
.slt-layer-row .slt-row-btn:hover { background: var(--slt-hover); color: var(--slt-text); opacity: 1; }
.slt-layer-row .slt-row-btn[data-active] { opacity: 1; color: var(--slt-text); }
.slt-layer-row .slt-row-btn svg { width: 13px; height: 13px; }
.slt-layer-row[data-drop="before"]::before { content: ""; position: absolute; left: 4px; right: 4px; top: -1px; height: 2px; background: var(--slt-accent); }
.slt-layer-row[data-drop="after"]::after { content: ""; position: absolute; left: 4px; right: 4px; bottom: -1px; height: 2px; background: var(--slt-accent); }
.slt-layer-row[data-drop="into"] { box-shadow: inset 0 0 0 1.5px var(--slt-accent); }

.slt-props { flex: 1; min-height: 0; overflow: auto; padding: 0 0 12px; }
.slt-section { border-bottom: 1px solid var(--slt-border); padding: 4px 10px 8px; }
.slt-section-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 0 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--slt-muted); }
.slt-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.slt-row > label { flex: 0 0 74px; color: var(--slt-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slt-row .slt-grow { flex: 1; min-width: 0; }
.slt-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
.slt-field { display: flex; align-items: center; gap: 4px; min-width: 0; }
.slt-field > span { color: var(--slt-muted); width: 14px; text-align: center; flex: none; }
.slt-input, .slt-select { height: 24px; min-width: 0; width: 100%; padding: 0 6px; font: inherit; font-size: 12px; color: var(--slt-text); background: var(--slt-input-bg); border: 1px solid var(--slt-border); border-radius: 4px; outline: none; }
.slt-input:focus, .slt-select:focus { border-color: var(--slt-accent); }
.slt-input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
.slt-input[type="number"]::-webkit-inner-spin-button { opacity: 0.5; }
input.slt-range { flex: 1; min-width: 0; height: 18px; accent-color: var(--slt-accent); margin: 0; background: transparent; }
.slt-range + .slt-input { flex: 0 0 58px; }
input.slt-color { width: 26px; height: 24px; padding: 0; border: 1px solid var(--slt-border); border-radius: 4px; background: transparent; cursor: pointer; flex: none; }
input.slt-color::-webkit-color-swatch-wrapper { padding: 2px; }
input.slt-color::-webkit-color-swatch { border: 0; border-radius: 2px; }
.slt-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: var(--slt-text); }
.slt-check input { accent-color: var(--slt-accent); margin: 0; }
.slt-hint { color: var(--slt-muted); font-size: 11px; margin: 4px 0; }
.slt-btn-row { display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0; }

.slt-effect { margin: 6px 0; padding: 6px 8px; background: var(--slt-panel-2); border: 1px solid var(--slt-border); border-radius: var(--slt-radius); }
.slt-effect[data-disabled] { opacity: 0.6; }
.slt-effect-head { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
.slt-effect-head .slt-grow { flex: 1; font-weight: 600; }
.slt-effect .slt-row > label { flex-basis: 64px; }
`;
