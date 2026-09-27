import { renderDocumentToString } from './render';
import type { SvgDocument } from './types';

export interface PngExportOptions {
  /** Pixel scale factor (2 = double resolution). Default 1. */
  scale?: number;
  /** Override output width in pixels (height follows the aspect ratio). */
  width?: number;
  /** Fill colour behind the image; default keeps transparency. */
  background?: string | null;
}

/** Standalone SVG markup with XML declaration. */
export function documentToSvgString(doc: SvgDocument): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderDocumentToString(doc)}`;
}

export function documentToSvgBlob(doc: SvgDocument): Blob {
  return new Blob([documentToSvgString(doc)], { type: 'image/svg+xml;charset=utf-8' });
}

export function documentToJson(doc: SvgDocument, pretty = true): string {
  return JSON.stringify(doc, null, pretty ? 2 : undefined);
}

/** Rasterise to a canvas. Browser only. */
export async function documentToCanvas(doc: SvgDocument, opts: PngExportOptions = {}): Promise<HTMLCanvasElement> {
  const scale = opts.width ? opts.width / doc.width : opts.scale ?? 1;
  const width = Math.max(1, Math.round(doc.width * scale));
  const height = Math.max(1, Math.round(doc.height * scale));
  const svg = renderDocumentToString(doc);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2D canvas not available');
    if (opts.background) {
      g.fillStyle = opts.background;
      g.fillRect(0, 0, width, height);
    }
    g.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function documentToPngBlob(doc: SvgDocument, opts: PngExportOptions = {}): Promise<Blob> {
  const canvas = await documentToCanvas(doc, opts);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

export async function documentToPngDataUrl(doc: SvgDocument, opts: PngExportOptions = {}): Promise<string> {
  const canvas = await documentToCanvas(doc, opts);
  return canvas.toDataURL('image/png');
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterise SVG'));
    img.src = url;
  });
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
