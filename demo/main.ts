import { SvgLayEditor, defineSvgLayEditor } from '../src';
import { sampleClock, sampleDocument } from './sample';

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

// 4. Device simulation: resize the host; the editor's auto layout follows its own width.
const stage = document.getElementById('stage')!;
const deviceSel = document.getElementById('device') as HTMLSelectElement;
const applyDevice = () => {
  if (deviceSel.value === 'desktop') delete stage.dataset.device;
  else stage.dataset.device = deviceSel.value;
  localStorage.setItem('slt-device', deviceSel.value);
  requestAnimationFrame(() => editor.fitToView());
};
deviceSel.value = localStorage.getItem('slt-device') ?? 'desktop';
deviceSel.addEventListener('change', applyDevice);
applyDevice();

// 3. Feature switches: colour mode and optional capabilities.
const modeSel = document.getElementById('mode') as HTMLSelectElement;
modeSel.addEventListener('change', () => editor.setFeatures({ colorMode: modeSel.value as 'full' | 'grayscale' | 'monochrome' }));
const interactionSel = document.getElementById('interaction') as HTMLSelectElement;
interactionSel.addEventListener('change', () => editor.setFeatures({ canvasInteraction: interactionSel.value as 'hold' | 'direct' }));
for (const key of ['layerStrip', 'gradients', 'masks', 'groups', 'effects', 'strokes', 'blendModes'] as const) {
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

const sampleSel = document.getElementById('sample') as HTMLSelectElement;
const loadSample = () => {
  localStorage.removeItem('slt-demo-doc');
  editor.loadDocument(sampleSel.value === 'clock' ? sampleClock() : sampleDocument());
};
document.getElementById('reset')!.addEventListener('click', loadSample);
sampleSel.addEventListener('change', loadSample);


// Expose for poking around in the console.
(window as unknown as { editor: SvgLayEditor }).editor = editor;
