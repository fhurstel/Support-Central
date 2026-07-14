import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal localStorage polyfill for the node test environment.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

vi.stubGlobal('localStorage', new MemoryStorage());

const api = await import('./mockApi');
const { extractReceipt } = await import('./mockExtraction');
const { CATEGORIES } = await import('../constants');

describe('mockApi', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds sample receipts on first read', async () => {
    const receipts = await api.listReceipts();
    expect(receipts.length).toBeGreaterThanOrEqual(10);
    expect(receipts.some((r) => r.source === 'email')).toBe(true);
    expect(receipts.some((r) => r.source === 'upload')).toBe(true);
  });

  it('sorts receipts by date descending', async () => {
    const receipts = await api.listReceipts();
    for (let i = 1; i < receipts.length; i++) {
      expect(receipts[i - 1].date >= receipts[i].date).toBe(true);
    }
  });

  it('creates, updates, and deletes a receipt', async () => {
    const created = await api.createReceipt({
      id: 'test-1',
      imageUrl: '',
      vendor: 'Test Vendor',
      amount: 10,
      currency: 'USD',
      date: '2026-07-01',
      category: 'Other',
      taxAmount: null,
      source: 'upload',
      status: 'needs_review',
      createdAt: new Date().toISOString(),
    });
    expect(created.id).toBe('test-1');

    const updated = await api.updateReceipt('test-1', { status: 'confirmed', amount: 20 });
    expect(updated.status).toBe('confirmed');
    expect(updated.amount).toBe(20);

    await api.deleteReceipt('test-1');
    const got = await api.getReceipt('test-1');
    expect(got).toBeNull();
  });
});

describe('mockExtraction', () => {
  it('returns plausible extracted fields', async () => {
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });
    const fields = await extractReceipt(file);
    expect(typeof fields.vendor).toBe('string');
    expect(fields.amount).toBeGreaterThan(0);
    expect(CATEGORIES).toContain(fields.category);
    expect(fields.currency).toBe('USD');
    expect(fields.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }, 5000);
});
