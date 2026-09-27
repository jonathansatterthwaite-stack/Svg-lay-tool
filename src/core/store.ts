import type { SvgDocument } from './types';

export type Listener<T extends unknown[]> = (...args: T) => void;

/** Minimal typed event emitter. */
export class Emitter<Events extends Record<string, unknown[]>> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) (fn as Listener<Events[K]>)(...args);
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

export interface ChangeMeta {
  /** True while a transaction is in progress (e.g. dragging); history is not touched. */
  transient: boolean;
  source: 'set' | 'commit' | 'transaction' | 'undo' | 'redo' | 'load';
}

export interface StoreEvents extends Record<string, unknown[]> {
  change: [doc: SvgDocument, meta: ChangeMeta];
  history: [canUndo: boolean, canRedo: boolean];
}

/**
 * Holds the current document with undo/redo history. Documents are treated as
 * immutable values: every change produces a new document object.
 */
export class DocumentStore extends Emitter<StoreEvents> {
  private current: SvgDocument;
  private undoStack: SvgDocument[] = [];
  private redoStack: SvgDocument[] = [];
  private txStart: SvgDocument | null = null;
  readonly historyLimit: number;

  constructor(doc: SvgDocument, historyLimit = 200) {
    super();
    this.current = doc;
    this.historyLimit = historyLimit;
  }

  get doc(): SvgDocument {
    return this.current;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get inTransaction(): boolean {
    return this.txStart !== null;
  }

  /** Replace the document and record history. */
  commit(next: SvgDocument | ((doc: SvgDocument) => SvgDocument)): void {
    const doc = typeof next === 'function' ? next(this.current) : next;
    if (doc === this.current) return;
    if (this.txStart) {
      this.current = doc;
      this.emit('change', doc, { transient: true, source: 'transaction' });
      return;
    }
    this.pushUndo(this.current);
    this.redoStack = [];
    this.current = doc;
    this.emit('change', doc, { transient: false, source: 'commit' });
    this.emitHistory();
  }

  /** Replace the document and clear history (e.g. loading a file). */
  load(doc: SvgDocument): void {
    this.undoStack = [];
    this.redoStack = [];
    this.txStart = null;
    this.current = doc;
    this.emit('change', doc, { transient: false, source: 'load' });
    this.emitHistory();
  }

  /**
   * Start a transaction: subsequent `commit`/`update` calls change the
   * document without adding history until `endTransaction` records a single
   * undo step for the whole thing.
   */
  beginTransaction(): void {
    if (!this.txStart) this.txStart = this.current;
  }

  /** Transient update (alias of commit inside a transaction). */
  update(next: SvgDocument | ((doc: SvgDocument) => SvgDocument)): void {
    this.commit(next);
  }

  endTransaction(): void {
    const start = this.txStart;
    if (!start) return;
    this.txStart = null;
    if (start === this.current) return;
    this.pushUndo(start);
    this.redoStack = [];
    this.emit('change', this.current, { transient: false, source: 'commit' });
    this.emitHistory();
  }

  cancelTransaction(): void {
    const start = this.txStart;
    if (!start) return;
    this.txStart = null;
    if (start !== this.current) {
      this.current = start;
      this.emit('change', start, { transient: false, source: 'set' });
    }
  }

  undo(): boolean {
    if (this.txStart) this.cancelTransaction();
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.current);
    this.current = prev;
    this.emit('change', prev, { transient: false, source: 'undo' });
    this.emitHistory();
    return true;
  }

  redo(): boolean {
    if (this.txStart) this.cancelTransaction();
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.current);
    this.current = next;
    this.emit('change', next, { transient: false, source: 'redo' });
    this.emitHistory();
    return true;
  }

  private pushUndo(doc: SvgDocument): void {
    this.undoStack.push(doc);
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
  }

  private emitHistory(): void {
    this.emit('history', this.canUndo, this.canRedo);
  }
}
