import { SvgLayEditor, defineSvgLayEditor } from '../src';
import { sampleDocument } from './sample';

defineSvgLayEditor();

const host = document.getElementById('editor')!;
const editor = new SvgLayEditor(host, {
  document: sampleDocument(),
  theme: (localStorage.getItem('slt-theme') as 'dark' | 'light' | null) ?? 'dark',
});

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

document.getElementById('theme')!.addEventListener('click', () => {
  const root = (editor.root as ShadowRoot).querySelector('.slt-root') as HTMLElement;
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  localStorage.setItem('slt-theme', next);
});

// Expose for poking around in the console.
(window as unknown as { editor: SvgLayEditor }).editor = editor;
