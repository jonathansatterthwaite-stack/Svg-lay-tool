const wrap = (body: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  undo: wrap('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: wrap('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  group: wrap('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h2a4 4 0 0 1 4 4v2" stroke-dasharray="2 2"/>'),
  ungroup: wrap('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="m14 10 6-6M4 20l6-6"/>'),
  duplicate: wrap('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  trash: wrap('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  forward: wrap('<path d="m12 19V5M5 12l7-7 7 7"/>'),
  backward: wrap('<path d="M12 5v14M5 12l7 7 7-7"/>'),
  front: wrap('<path d="M12 21V8M5 15l7-7 7 7M4 3h16"/>'),
  back: wrap('<path d="M12 3v13M5 9l7 7 7-7M4 21h16"/>'),
  zoomIn: wrap('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>'),
  zoomOut: wrap('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>'),
  fit: wrap('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  download: wrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  upload: wrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>'),
  eye: wrap('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: wrap('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>'),
  lock: wrap('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  unlock: wrap('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'),
  mask: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>'),
  folder: wrap('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
  shape: wrap('<path d="M12 3 21 20H3Z"/>'),
  chevronRight: wrap('<path d="m9 6 6 6-6 6"/>'),
  chevronDown: wrap('<path d="m6 9 6 6 6-6"/>'),
  close: wrap('<path d="M18 6 6 18M6 6l12 12"/>'),
  flipH: wrap('<path d="M12 3v18M8 7 3 12l5 5M16 7l5 5-5 5"/>'),
  flipV: wrap('<path d="M3 12h18M7 8l5-5 5 5M7 16l5 5 5-5"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  settings: wrap('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  modifiers: wrap('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  variables: wrap('<path d="M4 20c3 0 4-3 5-8s2-8 5-8"/><path d="M6 12h6M14 13l6 6M20 13l-6 6"/>'),
  grid: wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
  grip: wrap('<circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/>'),
  up: wrap('<path d="m18 15-6-6-6 6"/>'),
  down: wrap('<path d="m6 9 6 6 6-6"/>'),
};

export type IconName = keyof typeof icons;

export function icon(name: IconName): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'slt-icon';
  span.innerHTML = icons[name];
  return span;
}
