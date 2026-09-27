import { describe, expect, it, vi } from 'vitest';
import { createDocument } from '../document';
import { DocumentStore } from '../store';

describe('DocumentStore', () => {
  it('records history on commit and supports undo/redo', () => {
    const store = new DocumentStore(createDocument({ width: 10 }));
    const changes = vi.fn();
    store.on('change', changes);
    store.commit((d) => ({ ...d, width: 20 }));
    store.commit((d) => ({ ...d, width: 30 }));
    expect(store.doc.width).toBe(30);
    expect(store.undo()).toBe(true);
    expect(store.doc.width).toBe(20);
    expect(store.undo()).toBe(true);
    expect(store.doc.width).toBe(10);
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(true);
    expect(store.doc.width).toBe(20);
    expect(changes).toHaveBeenCalledTimes(5);
  });

  it('collapses a transaction into one undo step', () => {
    const store = new DocumentStore(createDocument({ width: 10 }));
    store.beginTransaction();
    store.update((d) => ({ ...d, width: 11 }));
    store.update((d) => ({ ...d, width: 12 }));
    expect(store.canUndo).toBe(false);
    store.endTransaction();
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.doc.width).toBe(10);
  });

  it('cancels a transaction', () => {
    const store = new DocumentStore(createDocument({ width: 10 }));
    store.beginTransaction();
    store.update((d) => ({ ...d, width: 99 }));
    store.cancelTransaction();
    expect(store.doc.width).toBe(10);
    expect(store.canUndo).toBe(false);
  });

  it('load clears history', () => {
    const store = new DocumentStore(createDocument({ width: 10 }));
    store.commit((d) => ({ ...d, width: 20 }));
    store.load(createDocument({ width: 5 }));
    expect(store.canUndo).toBe(false);
    expect(store.doc.width).toBe(5);
  });
});
