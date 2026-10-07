import { EXPR_REFERENCE, TIME_VARIABLES } from '../core';
import { el } from './dom';
import type { SvgLayEditor } from './editor';
import { button } from './fields';
import { icon } from './icons';
import { VariablesPanel, type VariablesPage } from './variables-panel';

const PAGES: [VariablesPage, string][] = [
  ['values', 'Values'],
  ['bindings', 'Bindings'],
  ['try', 'Try it'],
  ['interact', 'Interact'],
];

type KeyGroup = 'values' | 'math' | 'logic' | 'animation' | 'time' | string;

/**
 * The Variables tab, larger: full height on a phone (where the tab opens it), a big dialog on a
 * desktop (its Open larger button). Its pages are the tab's sections; under them a keypad puts
 * values, functions and symbols into the formula being written, at its caret, without the phone's
 * keyboard. Back to the canvas closes it.
 */
export class VariablesPopup {
  readonly el: HTMLDivElement;
  readonly panel: VariablesPanel;
  private chips: HTMLDivElement;
  private keys: HTMLDivElement;
  private keyTabs: HTMLDivElement;
  private group: KeyGroup = 'values';

  constructor(private editor: SvgLayEditor, private onClose: () => void) {
    this.panel = new VariablesPanel(editor, editor.selection.length === 1 ? 'bindings' : 'values');
    this.chips = el('div', { class: 'slt-prefs-nav slt-varpop-pages', role: 'tablist' });
    this.keyTabs = el('div', { class: 'slt-varpop-keytabs', role: 'tablist', 'aria-label': 'Keypad' });
    this.keys = el('div', { class: 'slt-varpop-keys' });
    const title = el('span', { class: 'slt-prefs-title' }, [icon('variables'), 'Variables']);
    const panel = el('div', { class: 'slt-varpop', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Variables' }, [
      el('div', { class: 'slt-prefs-head' }, [title, button([icon('down'), 'Back to the canvas'], () => this.close(), { cls: 'slt-small' })]),
      this.chips,
      el('div', { class: 'slt-varpop-body' }, [this.panel.el]),
      el('div', { class: 'slt-varpop-keypad', title: 'Tap to put it into the formula you are writing' }, [this.keyTabs, this.keys]),
    ]);
    this.el = el('div', { class: 'slt-prefs-backdrop slt-varpop-backdrop' }, [panel]);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    this.render();
  }

  render(): void {
    const page = this.panel.page ?? 'values';
    this.chips.replaceChildren(
      ...PAGES.map(([id, label]) => {
        const b = el('button', { type: 'button', class: 'slt-prefs-tab', role: 'tab', 'aria-selected': id === page ? 'true' : 'false' }, [label]);
        if (id === page) b.dataset.active = '';
        b.addEventListener('click', () => {
          this.panel.page = id;
          this.render();
        });
        return b;
      }),
    );
    this.panel.render();
    this.renderKeys();
  }

  /** The keypad: a row of groups, then their keys; the symbols are always there. */
  private renderKeys(): void {
    const ed = this.editor;
    const doc = ed.document;
    const groups: [KeyGroup, string][] = [
      ['values', 'Values'],
      ['math', 'Math'],
      ['logic', 'Logic'],
      ['animation', 'Animation'],
      ['time', 'Time'],
      ...ed.variableGroups.map((g) => [`host:${g.id}`, g.title] as [KeyGroup, string]),
    ];
    if (!groups.some(([g]) => g === this.group)) this.group = 'values';
    this.keyTabs.replaceChildren(
      ...groups.map(([g, label]) => {
        const b = el('button', { type: 'button', role: 'tab', 'aria-selected': g === this.group ? 'true' : 'false' }, [label]);
        if (g === this.group) b.dataset.active = '';
        keepFocus(b);
        b.addEventListener('click', () => {
          this.group = g;
          this.renderKeys();
        });
        return b;
      }),
    );
    const key = (label: string, insert: string, cls = '', title = '') => {
      const b = el('button', { type: 'button', class: `slt-key ${cls}`.trim(), title: title || label }, [label]);
      keepFocus(b);
      b.addEventListener('click', () => this.panel.insertSnippet(insert));
      return b;
    };
    let list: HTMLElement[] = [];
    if (this.group === 'values') list = (doc.variables ?? []).map((v) => key(v.name, v.name, 'slt-key-value'));
    else if (this.group === 'time') list = TIME_VARIABLES.map((t) => key(t.name, t.name, 'slt-key-value', t.label));
    else if (this.group.startsWith('host:')) {
      const g = ed.variableGroups.find((x) => `host:${x.id}` === this.group);
      list = (g?.variables ?? []).filter((v) => /^[A-Za-z_]\w*$/.test(v.name)).map((v) => key(v.name, v.name, 'slt-key-value', v.label ?? ''));
    } else {
      list = EXPR_REFERENCE.filter((r) => r.group === this.group && r.name).map((r) => key(r.name, r.signature, 'slt-key-fn', `${r.signature}: ${r.label}`));
      if (this.group === 'logic') list.push(...['<', '>', '<=', '>=', '==', '!=', '&&', '||', '!', '?', ':'].map((s) => key(s, ` ${s} `.replace(/^ !$/, '!'), 'slt-key-sym')));
    }
    if (!list.length) list = [el('span', { class: 'slt-hint' }, [this.group === 'values' ? 'No values yet: add one on the Values page.' : 'Nothing here.'])];
    const back = el('button', { type: 'button', class: 'slt-key slt-key-sym', title: 'Delete', 'aria-label': 'Delete' }, ['⌫']);
    keepFocus(back);
    back.addEventListener('click', () => this.panel.backspace());
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => key(d, d, 'slt-key-sym'));
    const symbols = [['.', '.'], ['+', ' + '], ['−', ' - '], ['×', ' * '], ['÷', ' / '], ['(', '('], [')', ')'], [',', ', ']].map(([l, s]) => key(l, s, 'slt-key-sym'));
    this.keys.replaceChildren(el('div', { class: 'slt-key-list' }, list), el('div', { class: 'slt-key-symbols' }, [...digits, ...symbols, back]));
  }

  close(): void {
    this.panel.flushPending();
    this.el.remove();
    this.onClose();
  }
}

/** A key mustn't take the focus: the formula keeps its caret. */
function keepFocus(b: HTMLElement): void {
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('mousedown', (e) => e.preventDefault());
}
