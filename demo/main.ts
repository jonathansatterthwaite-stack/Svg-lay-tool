import { SvgLayEditor, defineSvgLayEditor } from '../src';
import { sampleDocument } from './sample';

defineSvgLayEditor();

const host = document.getElementById('editor')!;
host.replaceChildren(); // remove the loading/fallback message
const editor = new SvgLayEditor(host, {
  document: sampleDocument(),
  theme: (localStorage.getItem('slt-theme') as 'dark' | 'light' | 'auto' | null) ?? 'dark',
});

// --- Host-app integration examples -------------------------------------------
// 1. Theme colours: the page owns a CSS variable and the editor follows it.
const accent = document.getElementById('accent') as HTMLInputElement;
const applyAccent = () => document.documentElement.style.setProperty('--slt-accent', accent.value);
accent.addEventListener('input', applyAccent);
applyAccent();

// 2. Theme preset (dark / light / auto).
const themeSel = document.getElementById('theme') as HTMLSelectElement;
themeSel.value = editor.theme;
themeSel.addEventListener('change', () => {
  editor.setTheme(themeSel.value as 'dark' | 'light' | 'auto');
  localStorage.setItem('slt-theme', themeSel.value);
});

// 3. Feature switches: colour mode and optional capabilities.
const modeSel = document.getElementById('mode') as HTMLSelectElement;
modeSel.addEventListener('change', () => editor.setFeatures({ colorMode: modeSel.value as 'full' | 'grayscale' | 'monochrome' }));
for (const key of ['gradients', 'masks', 'groups', 'effects', 'strokes', 'blendModes'] as const) {
  const box = document.getElementById(`f-${key}`) as HTMLInputElement | null;
  box?.addEventListener('change', () => editor.setFeatures({ [key]: box.checked }));
}

editor.on('change', (doc) => {
  // Persist the working document so a reload keeps your work.
  try {
    localStorage.setItem('slt-demo-doc', JSON.stringify(doc));
  } catch {
    /* ignore quota errors */
  }
});

const saved = localStorage.getItem('slt-demo-doc');
if (saved && new URLSearchParams(location.search).get('fresh') === null) {
  try {
    editor.loadDocument(saved);
  } catch {
    /* fall back to the sample */
  }
}

document.getElementById('reset')!.addEventListener('click', () => {
  localStorage.removeItem('slt-demo-doc');
  editor.loadDocument(sampleDocument());
});


// Expose for poking around in the console.
(window as unknown as { editor: SvgLayEditor }).editor = editor;
