import { el, fmtNum, toHex6 } from './dom';

/**
 * Field builders for the properties panel. `onChange(value, commit)` is called
 * with commit=false for live (dragging) updates and commit=true for the final
 * value; callers turn that into a store transaction.
 */
export type Change<T> = (value: T, commit: boolean) => void;

export function row(label: string, ...controls: (HTMLElement | string)[]): HTMLDivElement {
  return el('div', { class: 'slt-row' }, [el('label', {}, [label]), ...controls]);
}

export function section(title: string, children: (HTMLElement | null)[], actions?: HTMLElement): HTMLDivElement {
  return el('div', { class: 'slt-section' }, [
    el('div', { class: 'slt-section-head' }, [el('span', {}, [title]), actions ?? null]),
    ...children,
  ]);
}

export function numberInput(
  value: number,
  onChange: Change<number>,
  opts: { min?: number; max?: number; step?: number; digits?: number } = {},
): HTMLInputElement {
  const input = el('input', {
    class: 'slt-input',
    type: 'number',
    value: fmtNum(value, opts.digits ?? 2),
    step: String(opts.step ?? 1),
    ...(opts.min !== undefined ? { min: String(opts.min) } : {}),
    ...(opts.max !== undefined ? { max: String(opts.max) } : {}),
  });
  const read = () => {
    let v = parseFloat(input.value);
    if (!Number.isFinite(v)) return null;
    if (opts.min !== undefined) v = Math.max(opts.min, v);
    if (opts.max !== undefined) v = Math.min(opts.max, v);
    return v;
  };
  input.addEventListener('change', () => {
    const v = read();
    if (v !== null) onChange(v, true);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    }
    e.stopPropagation();
  });
  return input;
}

/** Labelled mini field like "X [ 120 ]" used in 2-column grids. */
export function miniField(label: string, input: HTMLElement): HTMLDivElement {
  return el('div', { class: 'slt-field' }, [el('span', {}, [label]), input]);
}

export function slider(
  value: number,
  onChange: Change<number>,
  opts: { min: number; max: number; step?: number; digits?: number },
): HTMLDivElement {
  const digits = opts.digits ?? (opts.step && opts.step < 1 ? 2 : 0);
  const range = el('input', {
    class: 'slt-range',
    type: 'range',
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step ?? 1),
    value: String(value),
  });
  const num = numberInput(
    value,
    (v, commit) => {
      range.value = String(v);
      onChange(v, commit);
    },
    { min: opts.min, max: opts.max, step: opts.step, digits },
  );
  range.addEventListener('input', () => {
    const v = parseFloat(range.value);
    num.value = fmtNum(v, digits);
    onChange(v, false);
  });
  range.addEventListener('change', () => onChange(parseFloat(range.value), true));
  range.addEventListener('keydown', (e) => e.stopPropagation());
  return el('div', { class: 'slt-field slt-grow' }, [range, num]);
}

export function colorInput(value: string, onChange: Change<string>): HTMLDivElement {
  const picker = el('input', { class: 'slt-color', type: 'color', value: toHex6(value) });
  const text = el('input', { class: 'slt-input', type: 'text', value, spellcheck: false });
  picker.addEventListener('input', () => {
    text.value = picker.value;
    onChange(picker.value, false);
  });
  picker.addEventListener('change', () => onChange(picker.value, true));
  text.addEventListener('change', () => {
    const v = text.value.trim();
    if (!v) return;
    picker.value = toHex6(v);
    onChange(v, true);
  });
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') text.blur();
    e.stopPropagation();
  });
  return el('div', { class: 'slt-field slt-grow' }, [picker, text]);
}

export function select<T extends string>(
  value: T,
  options: { value: T; label: string }[],
  onChange: (value: T) => void,
): HTMLSelectElement {
  const sel = el('select', { class: 'slt-select' });
  for (const o of options) {
    const opt = el('option', { value: o.value }, [o.label]);
    if (o.value === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value as T));
  sel.addEventListener('keydown', (e) => e.stopPropagation());
  return sel;
}

export function checkbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'slt-check' }, [input, label]);
}

export function textInput(value: string, onChange: (value: string) => void): HTMLInputElement {
  const input = el('input', { class: 'slt-input', type: 'text', value, spellcheck: false });
  input.addEventListener('change', () => onChange(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    e.stopPropagation();
  });
  return input;
}

export function button(
  label: string | HTMLElement | (string | HTMLElement)[],
  onClick: () => void,
  opts: { title?: string; cls?: string } = {},
): HTMLButtonElement {
  const b = el('button', { class: `slt-btn ${opts.cls ?? ''}`, type: 'button', title: opts.title ?? '' }, Array.isArray(label) ? label : [label]);
  b.addEventListener('click', onClick);
  return b;
}
