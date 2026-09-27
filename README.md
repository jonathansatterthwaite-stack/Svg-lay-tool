# svg-lay-tool

An embeddable, framework-agnostic image editor that builds pictures from a
**library of shapes stacked on layers** — in the spirit of the emblem/decal
editor in Armored Core VI and the layer editor in KWGT.

Shapes can be coloured (solid or gradient), resized, positioned, rotated and
flipped. Any layer can act as a **mask** that clips, or applies effects to, the
layers below it. Layers can be **grouped** and moved, scaled and rotated
together. Everything renders to clean SVG and exports to SVG, PNG or JSON.

![svg-lay-tool editor](docs/screenshot.png)

- Zero runtime dependencies, ~22 kB gzipped for the full editor.
- Drop it into any app: plain `new SvgLayEditor(element)`, a
  `<svg-lay-editor>` custom element, or a `<script>` tag.
- Styles live in a shadow root so your CSS and the editor's never collide.
- A headless `core` entry renders documents to SVG strings anywhere
  (browser, Node, workers) — useful for thumbnails or server-side export.

## Install

```sh
npm install svg-lay-tool
```

Or build from this repository (`npm install && npm run build`) and copy `dist/`.

## Quick start

### With a bundler (Vite, webpack, Next, SvelteKit …)

```ts
import { SvgLayEditor } from 'svg-lay-tool';

const editor = new SvgLayEditor(document.querySelector('#host')!, {
  width: 512,
  height: 512,
  background: null, // transparent
  theme: 'dark',    // or 'light'
});

editor.on('change', (doc) => localStorage.setItem('emblem', JSON.stringify(doc)));

// Later…
const svg = editor.exportSvg();          // string
const png = await editor.exportPng({ scale: 2 }); // Blob
```

The host element needs a size; the editor fills it (`min-height: 420px`).

### As a custom element

```html
<script type="module">
  import { defineSvgLayEditor } from 'svg-lay-tool';
  defineSvgLayEditor(); // registers <svg-lay-editor>
</script>

<svg-lay-editor width="512" height="512" theme="dark" style="height: 600px"></svg-lay-editor>

<script type="module">
  const el = document.querySelector('svg-lay-editor');
  el.addEventListener('change', (e) => console.log(e.detail)); // the document
  el.document = savedDocument;     // load
  el.editor.exportSvg();           // full API via .editor
</script>
```

### With a plain `<script>` tag

```html
<script src="svg-lay-tool.iife.js"></script>
<script>
  const editor = new SvgLayTool.SvgLayEditor(document.getElementById('host'));
</script>
```

### React / Vue / Svelte

Mount it in an effect and destroy it on unmount:

```tsx
function Emblem({ value, onChange }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const editor = new SvgLayEditor(ref.current!, { document: value, onChange });
    return () => editor.destroy();
  }, []);
  return <div ref={ref} style={{ height: 600 }} />;
}
```

## Concepts

### Document

```ts
interface SvgDocument {
  version: 1;
  width: number;
  height: number;
  background: string | null; // CSS colour or null = transparent
  layers: Layer[];           // bottom first
}
```

Documents are plain JSON: save them, diff them, generate them. Load untrusted
JSON through `normalizeDocument()` (the editor's `loadDocument()` does this).

### Layers

Every layer has `x`, `y` (its origin in the parent's space), `rotation`
(degrees), `opacity`, `blendMode`, `visible`, `locked`, a list of `effects`
and an optional `mask`.

- **Shape layers** reference a shape from the library by id, with `width`,
  `height`, `flipX`/`flipY`, shape `params` (corner radius, star points …), a
  `fill` (solid, linear or radial gradient, or none) and an optional `stroke`.
  The origin is the centre of the shape.
- **Group layers** hold `children` and a uniform `scale`. Children are
  positioned relative to the group's origin. When you group a selection the
  origin is placed at the selection's centre so rotation and scaling behave
  intuitively.

### Masks

Set `layer.mask` and the layer stops drawing itself; instead it affects the
layers **below it inside the same parent** (so a mask inside a group only
touches that group's siblings):

| mode           | what happens to the layers below                                   |
| -------------- | ------------------------------------------------------------------ |
| `clip`         | only visible inside the mask shape                                 |
| `clip-inverse` | only visible outside the mask shape                                |
| `filter`       | stay visible; inside the shape the mask's `effects` are applied    |

`mask.effects` is a list of the same effects available on layers — so
"blur everything under this circle", "invert inside this star" or "clip the
stripes to the shield" are all one layer each. The mask layer's own opacity and
effects apply to the mask itself (blur the mask for a soft edge). A group can be
a mask too: the union of its children is the mask shape. Tick `showShape` to
also draw the mask layer normally.

### Effects

`blur`, `brightness`, `contrast`, `saturate`, `hue-rotate`, `grayscale`,
`sepia`, `invert`, `tint`, `shadow`, `glow`, `outline`. Each is a small object
(`{ type: 'blur', radius: 4, enabled: true }` …); `createEffect(type)` gives
you one with defaults. They compile to SVG `<filter>` primitives, so exported
files look identical to the canvas.

### Shape library

Built in: rectangle, rounded rectangle, ellipse, triangle, right triangle,
diamond, trapezoid, parallelogram, semicircle, pie/sector, ring, polygon,
pentagon, hexagon, octagon, star, gear, arrow, chevron, plus, crescent, heart,
lightning, teardrop, shield. Several expose parameters (star points, gear
teeth, ring thickness …) that are editable in the properties panel.

Add your own — a shape is just a function from size to path data, centred on
the origin:

```ts
import { registerShape } from 'svg-lay-tool';

registerShape({
  id: 'kite',
  name: 'Kite',
  category: 'Custom',
  params: [{ key: 'waist', label: 'Waist %', min: 10, max: 90, step: 1, default: 35 }],
  path: (w, h, p) => {
    const y = -h / 2 + h * (p.waist / 100);
    return `M0 ${-h / 2} L${w / 2} ${y} L0 ${h / 2} L${-w / 2} ${y} Z`;
  },
});
```

Register shapes before creating the editor, or call `editor.refreshLibrary()`
afterwards. Restrict the palette with `shapes: ['rect', 'ellipse', 'star']` in
the options.

## Editor API

```ts
new SvgLayEditor(host: HTMLElement, options?: EditorOptions)
```

| option              | description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `document`          | initial document (otherwise built from `width`/`height`/`background`)         |
| `theme`             | `'dark'` (default) or `'light'`                                                |
| `panels`            | `{ toolbar, library, layers, properties }` booleans to hide UI parts          |
| `shapes`            | list of shape ids allowed in the library                                       |
| `shadow`            | `false` to render into light DOM instead of a shadow root                      |
| `onChange`          | called with the document after every committed change                          |
| `onSelectionChange` | called with the selected layer ids                                             |

Methods (all changes are undoable):

- Document: `document`, `getDocument()`, `loadDocument(docOrJson)`, `toJson()`
- Selection: `select(ids, additive?)`, `toggleSelect(id)`, `clearSelection()`, `selectAll()`, `selectedLayers()`
- Editing: `addShape(shapeId, init?)`, `deleteSelection()`, `duplicateSelection()`, `groupSelection()`,
  `ungroupSelection()`, `reorderSelection('forward' | 'backward' | 'front' | 'back')`,
  `updateSelected(patch)`, `updateLayer(id, patch)`, `nudgeSelection(dx, dy)`, `undo()`, `redo()`
- View: `setZoom(z)`, `zoomBy(f)`, `fitToView()`
- Export: `exportSvg()`, `exportPng({ scale | width, background })`, `downloadSvg()`, `downloadPng()`,
  `downloadJson()`, `openJsonFile()`
- Events: `on('change' | 'selectionchange' | 'viewchange', fn)` returns an unsubscribe function
- `store` — the underlying `DocumentStore` (`commit`, `beginTransaction`/`endTransaction`, history)
- `destroy()`

### Keyboard & mouse

| action                        | input                                                  |
| ----------------------------- | ------------------------------------------------------ |
| select / add to selection     | click / Shift+click; drag on empty canvas for a marquee |
| select inside a group         | double-click                                           |
| move                          | drag (Shift constrains to an axis); arrow keys nudge   |
| resize                        | corner/edge handles (Shift keeps ratio, Alt from centre) |
| rotate                        | round handle above the box (Shift snaps to 15°)        |
| group / ungroup               | Ctrl+G / Ctrl+Shift+G                                  |
| duplicate / delete            | Ctrl+D / Delete                                        |
| reorder                       | `[` `]` (with Ctrl: to back / front); drag rows in the layer list |
| undo / redo                   | Ctrl+Z / Ctrl+Y                                        |
| pan / zoom                    | scroll or Space+drag / Ctrl+scroll, Ctrl+0 to fit       |

## Headless core

`svg-lay-tool/core` has no UI and no DOM requirements except for PNG export.

```ts
import {
  createDocument, createShapeLayer, createGroupLayer, createMaskSettings, createEffect,
  insertLayer, groupLayers, renderDocumentToString, normalizeDocument,
} from 'svg-lay-tool/core';

let doc = createDocument({ width: 256, height: 256 });
doc = insertLayer(doc, createShapeLayer({ shape: 'shield', x: 128, y: 128, width: 200, height: 220, fill: { type: 'solid', color: '#334' } }));
doc = insertLayer(doc, createShapeLayer({ shape: 'star', x: 128, y: 120, width: 120, height: 120, fill: { type: 'solid', color: '#fc5' },
  effects: [createEffect('outline', { width: 3, color: '#000' })] }));
doc = insertLayer(doc, createShapeLayer({ shape: 'ellipse', x: 170, y: 90, width: 90, height: 90,
  mask: createMaskSettings({ mode: 'filter', effects: [createEffect('blur', { radius: 3 })] }) }));

const svg = renderDocumentToString(doc); // '<svg xmlns=…'
```

Other useful pieces: `DocumentStore` (undo/redo + change events), immutable
tree helpers (`updateLayer`, `moveLayer`, `reorderLayers`, `duplicateLayers`,
`ungroupLayer`, `locateLayer`, `walkLayers`), geometry (`layerWorldBounds`,
`layerWorldMatrix`), `documentToPngBlob`, and the shape and effect registries.

## Development

```sh
npm install
npm run dev        # demo at http://localhost:5173
npm test           # vitest unit tests for the core
npm run typecheck
npm run build      # dist/svg-lay-tool.js (ESM), dist/core.js, dist/svg-lay-tool.iife.js, dist/types
```

Project layout:

```
src/core     data model, shape library, effects → SVG filters, renderer, store, export
src/editor   UI: canvas (selection, transform handles), layers, properties, library, toolbar
demo         the demo page (index.html loads demo/main.ts)
```

## License

MIT
