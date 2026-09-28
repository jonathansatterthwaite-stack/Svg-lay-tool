/**
 * Core data model for svg-lay-tool.
 *
 * A document is a stack of layers (bottom first). A layer is either a shape
 * from the shape library or a group containing further layers. Any layer can
 * be flagged as a mask, in which case it stops drawing itself and instead
 * affects the layers below it inside the same parent.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

export interface GradientStop {
  /** 0..1 */
  offset: number;
  color: string;
}

export type Fill =
  | { type: 'solid'; color: string }
  | { type: 'linear'; angle: number; stops: GradientStop[] }
  | { type: 'radial'; stops: GradientStop[] }
  | { type: 'none' };

export interface Stroke {
  color: string;
  width: number;
}

/** Effects are applied to a layer itself, or (through a mask) to the layers below it. */
export interface EffectBase {
  id: string;
  enabled: boolean;
}

export type Effect = EffectBase &
  (
    | { type: 'blur'; radius: number }
    | { type: 'brightness'; amount: number }
    | { type: 'contrast'; amount: number }
    | { type: 'saturate'; amount: number }
    | { type: 'hue-rotate'; degrees: number }
    | { type: 'grayscale'; amount: number }
    | { type: 'sepia'; amount: number }
    | { type: 'invert'; amount: number }
    | { type: 'tint'; color: string; amount: number }
    | { type: 'shadow'; dx: number; dy: number; blur: number; color: string; opacity: number }
    | { type: 'glow'; radius: number; color: string; strength: number }
    | { type: 'outline'; width: number; color: string }
  );

export type EffectType = Effect['type'];

/**
 * Output colour restriction. `grayscale` keeps lightness only; `monochrome`
 * paints everything in one colour (shapes become a coloured alpha mask that a
 * host app can tint however it likes).
 */
export type ColorMode = 'full' | 'grayscale' | 'monochrome';

/**
 * How a mask layer affects the layers below it (within the same parent):
 * - `clip`: layers below are only visible inside the mask shape.
 * - `clip-inverse`: layers below are only visible outside the mask shape.
 * - `filter`: layers below stay visible; inside the mask shape the mask's
 *   effects are applied to them (blur, tint, invert ...).
 */
export type MaskMode = 'clip' | 'clip-inverse' | 'filter';

export interface MaskSettings {
  mode: MaskMode;
  /** Effects applied to the masked region of the layers below. */
  effects: Effect[];
  /** Also draw the mask layer's own shape on top (normally hidden). */
  showShape: boolean;
}

/**
 * Modifiers are stacked on a layer and change how it looks or behaves.
 * Geometry modifiers (`deform`, `edges`) reshape the outline in order;
 * `fill`/`stroke` paint it (the last enabled one wins; without a fill
 * modifier the layer's `color` is used); `effect` entries build the filter
 * chain; `mask` turns the layer into a mask over the layers below it.
 */
export interface ModifierBase {
  id: string;
  enabled: boolean;
}

export type Modifier = ModifierBase &
  (
    | { type: 'fill'; fill: Fill }
    | { type: 'stroke'; color: string | null; width: number }
    | { type: 'effect'; effect: Effect }
    | { type: 'mask'; mode: MaskMode; showShape: boolean; effects: Effect[] }
    | {
        /** Trapezoid / skew warp of the outline within its box. Widths are % of the box width. */
        type: 'deform';
        top: number;
        bottom: number;
        /** Horizontal offset of the top edge as % of the box width. */
        skew: number;
      }
    | {
        /** Round every corner of the outline; radius is % of half the shorter box side. */
        type: 'round';
        radius: number;
      }
    | {
        /**
         * Subdivide every straight edge of the outline and push the new points
         * inwards (negative) or outwards (positive), as % of half the edge length.
         */
        type: 'edges';
        subdivisions: number;
        bend: number;
        /** Draw the result with smooth curves instead of straight segments. */
        smooth: boolean;
      }
  );

export type ModifierType = Modifier['type'];

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1 */
  opacity: number;
  blendMode: BlendMode;
  /** Position of the layer origin in the parent's coordinate system. */
  x: number;
  y: number;
  /** Rotation in degrees, clockwise, about the layer origin. */
  rotation: number;
  /** Stacked modifiers: paint, effects, mask and geometry changes. */
  modifiers: Modifier[];
  /** Properties driven by expressions over the document's variables (see bindings.ts). */
  bindings?: Binding[];
}

/** A user-editable number the document exposes (a slider in the editor, an input for a host app). */
export interface Variable {
  id: string;
  /** Identifier used in expressions: letters, digits and underscores. */
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /**
   * Optional formula computing the value from time, app variables and the
   * variables declared before this one, e.g. `minutes / 60`. When set (and it
   * evaluates), it replaces `value`; on an error the last `value` is used.
   */
  expression?: string;
}

/** A layer property driven by an expression, e.g. `{ target: 'rotation', expression: 'hours12 * 30 + minutes / 2' }`. */
export interface Binding {
  id: string;
  /** Property path: `x`, `rotation`, `visible`, `params.sides`, `modifiers.<id>.<field>` … */
  target: string;
  expression: string;
  enabled: boolean;
  /**
   * Reference point for rotation, size and scale bindings, as fractions of
   * the layer's box (0,0 = top-left, 0.5,0.5 = centre, 1,1 = bottom-right).
   * Rotation turns about it; a height binding grows away from it; a scale
   * binding scales about it. Default centre.
   */
  anchor?: { x: number; y: number };
}

/** 2×2 linear map (no translation): [a c; b d]. */
export interface Mat2 {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  /** Id of a shape in the shape library. */
  shape: string;
  /** Shape specific parameters (corner radius, star points ...). */
  params: Record<string, number>;
  /**
   * Intrinsic size the geometry is generated at. The origin is the shape
   * centre. The visible box in the parent is `stretch · rotate(rotation)`
   * applied to this rectangle.
   */
  width: number;
  height: number;
  /**
   * Canvas-axis stretch applied after rotation. Resizing a rotated shape along
   * the canvas axes ends up here; rotating a shape keeps its look by
   * conjugating this matrix. Identity for an unstretched shape.
   */
  stretch: Mat2;
  flipX: boolean;
  flipY: boolean;
  /** Base colour: the solid fill unless a fill modifier overrides it, and the default stroke colour. */
  color: string;
}

export interface GroupLayer extends LayerBase {
  type: 'group';
  /** Uniform scale applied to the children. */
  scale: number;
  /** Canvas-axis stretch applied after rotation (see ShapeLayer.stretch). */
  stretch: Mat2;
  /** Bottom first. */
  children: Layer[];
}

export type Layer = ShapeLayer | GroupLayer;

export interface SvgDocument {
  version: 1;
  width: number;
  height: number;
  /** CSS colour or null for transparent. */
  background: string | null;
  /** Bottom first. */
  layers: Layer[];
  /** Variables available to bindings. */
  variables?: Variable[];
  /** Editing grid (never rendered into exports). */
  grid?: GridSettings;
}

export interface GridSettings {
  /** Cell size in document units. */
  width: number;
  height: number;
  /** Draw the grid on the canvas. */
  visible: boolean;
  /** Line opacity 0..1. */
  opacity: number;
}
