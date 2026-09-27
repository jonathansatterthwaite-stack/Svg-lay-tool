import { EFFECTS_BY_COLOR_MODE, type ColorMode, type EffectType } from '../core';

/**
 * Switches a host app uses to tailor the editor to its purpose. Everything
 * defaults to on / `full`.
 */
export interface EditorFeatures {
  /**
   * `full`: any colour. `grayscale`: colours are picked and rendered as gray
   * lightness values. `monochrome`: one colour for everything; the picture is
   * effectively an alpha mask the host app can tint (typically built from clip
   * masks, opacity and layering).
   */
  colorMode: ColorMode;
  /** The colour used for all paint in `monochrome` mode. */
  monoColor: string;
  /** Offer linear/radial gradient fills. */
  gradients: boolean;
  /** Offer strokes on shapes. */
  strokes: boolean;
  /** Effects: `true` for all, `false` for none, or a whitelist of effect types. */
  effects: boolean | EffectType[];
  /** Allow layers to act as masks. */
  masks: boolean;
  /** Allow grouping / ungrouping. */
  groups: boolean;
  /** Offer blend modes. */
  blendModes: boolean;
  /** Offer the layer opacity slider. */
  opacity: boolean;
  /** Show the export / save / open menu. */
  export: boolean;
  /** Let the user change the canvas size. */
  canvasSize: boolean;
  /** Let the user change the canvas background. */
  background: boolean;
  /** Restrict the shape library to these ids (undefined = all registered shapes). */
  shapes?: string[];
  /** Show the thumbnail strip beside the canvas for switching layers. */
  layerStrip: boolean;
  /**
   * How the canvas moves the selected layer. Selection itself only ever
   * changes from the layer strip or the Layers panel, never from the canvas.
   * `hold` (default): dragging pans the view; press-and-hold on the selected
   * layer picks it up to move it. `direct`: dragging the selected layer moves
   * it straight away; dragging anywhere else pans.
   */
  canvasInteraction: 'hold' | 'direct';
  /** Milliseconds a press must last to pick a layer up in `hold` mode. */
  holdDelay: number;
  /** Show what clip masks hide at reduced opacity, and fill hidden mask shapes faintly (editor only). */
  maskPreview: boolean;
  /** In monochrome mode, paint the selected layer in a contrasting colour on the canvas (editor only). */
  highlightSelection: boolean;
  /** Allow corner handles to stretch groups non-uniformly (edge handles always can). */
  groupStretch: boolean;
}

export const DEFAULT_FEATURES: EditorFeatures = {
  colorMode: 'full',
  monoColor: '#ffffff',
  gradients: true,
  strokes: true,
  effects: true,
  masks: true,
  groups: true,
  blendModes: true,
  opacity: true,
  export: true,
  canvasSize: true,
  background: true,
  layerStrip: true,
  canvasInteraction: 'hold',
  holdDelay: 600,
  maskPreview: true,
  highlightSelection: true,
  groupStretch: true,
};

export function resolveFeatures(partial: Partial<EditorFeatures> = {}): EditorFeatures {
  const out = { ...DEFAULT_FEATURES, ...partial };
  if (out.colorMode === 'monochrome') {
    // Gradients and blend modes cannot be expressed in a single colour.
    out.gradients = false;
    out.blendModes = false;
  }
  return out;
}

/** Effect types the UI may offer, after the colour mode and whitelist are applied. */
export function allowedEffectTypes(features: EditorFeatures): EffectType[] {
  if (features.effects === false) return [];
  const byMode = EFFECTS_BY_COLOR_MODE[features.colorMode];
  if (features.effects === true) return [...byMode];
  return byMode.filter((t) => (features.effects as EffectType[]).includes(t));
}

/** Names of the theme tokens a host app can override (`--slt-<name>`). */
export const THEME_TOKENS = [
  'bg',
  'panel',
  'panel-2',
  'border',
  'text',
  'muted',
  'accent',
  'accent-text',
  'input-bg',
  'hover',
  'selected',
  'danger',
  'canvas',
  'checker-a',
  'checker-b',
  'radius',
  'font',
  'font-size',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

/** Colour/style overrides keyed by token name, e.g. `{ accent: '#ff0080', radius: '2px' }`. */
export type ThemeColors = Partial<Record<ThemeToken, string>>;

export type ThemeName = 'dark' | 'light' | 'auto';
