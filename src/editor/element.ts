import type { SvgDocument } from '../core';
import { SvgLayEditor, type EditorOptions } from './editor';

/**
 * `<svg-lay-editor>` custom element wrapper.
 *
 *   <svg-lay-editor width="512" height="512" theme="dark"></svg-lay-editor>
 *
 * Properties: `document` (get/set), `editor` (the SvgLayEditor instance).
 * Events: `change` (detail: document), `selectionchange` (detail: ids).
 */
export class SvgLayEditorElement extends HTMLElement {
  static observedAttributes = ['theme', 'color-mode'];

  editor: SvgLayEditor | null = null;
  private pendingDocument: SvgDocument | null = null;
  /** Extra options applied when the editor is created (set before connecting). */
  options: EditorOptions = {};

  connectedCallback(): void {
    if (this.editor) return;
    const num = (name: string) => {
      const v = this.getAttribute(name);
      return v === null ? undefined : Number(v) || undefined;
    };
    this.style.display ||= 'block';
    this.editor = new SvgLayEditor(this, {
      width: num('width'),
      height: num('height'),
      background: this.getAttribute('background'),
      theme: (this.getAttribute('theme') as 'dark' | 'light' | 'auto' | null) ?? undefined,
      ...this.options,
      features: {
        ...(this.getAttribute('color-mode') ? { colorMode: this.getAttribute('color-mode') as 'full' | 'grayscale' | 'monochrome' } : {}),
        ...(this.options.features ?? {}),
      },
      document: this.pendingDocument ?? this.options.document,
    });
    this.pendingDocument = null;
    this.editor.on('change', (doc) => this.dispatchEvent(new CustomEvent('change', { detail: doc, bubbles: true })));
    this.editor.on('selectionchange', (ids) =>
      this.dispatchEvent(new CustomEvent('selectionchange', { detail: ids, bubbles: true })),
    );
  }

  disconnectedCallback(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this.editor) return;
    if (name === 'theme') this.editor.setTheme((value as 'dark' | 'light' | 'auto' | null) ?? 'dark');
    if (name === 'color-mode') this.editor.setFeatures({ colorMode: (value as 'full' | 'grayscale' | 'monochrome' | null) ?? 'full' });
  }

  get document(): SvgDocument | null {
    return this.editor?.document ?? this.pendingDocument;
  }

  set document(doc: SvgDocument | null) {
    if (this.editor) {
      if (doc) this.editor.loadDocument(doc);
    } else this.pendingDocument = doc;
  }
}

/** Register the custom element (idempotent). */
export function defineSvgLayEditor(tagName = 'svg-lay-editor'): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) customElements.define(tagName, SvgLayEditorElement);
}
