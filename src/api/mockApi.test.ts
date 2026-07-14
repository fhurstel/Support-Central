import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Receipt } from '../types';
import { buildSeedReceipts } from './seed';

// The API layer now talks to the Express backend over fetch. These tests run in
// node with no server, so we stub `fetch` with a tiny in-memory implementation
// of the REST endpoints to exercise the client's request/response handling.

function sortByDateDesc(rs: Receipt[]): Receipt[] {
  return [...rs].sort((a, b) => {
    if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
    return b.date.localeCompare(a.date);
  });
}

function makeFetchStub() {
  let db: Receipt[] = buildSeedReceipts();

  const json = (body: unknown, status = 200) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, '');

    // /api/extract
    if (path === '/api/extract' && method === 'POST') {
      return json({
        vendor: 'Starbucks',
        amount: 12.5,
        currency: 'USD',
        date: '2026-07-10',
        category: 'Meals',
        taxAmount: 1,
      });
    }

    // /api/receipts collection
    if (path === '/api/receipts') {
      if (method === 'GET') return json(sortByDateDesc(db));
      if (method === 'POST') {
        const receipt = JSON.parse(init!.body as string) as Receipt;
        db.unshift(receipt);
        return json(receipt, 201);
      }
    }

    // /api/receipts/:id
    const m = path.match(/^\/api\/receipts\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const idx = db.findIndex((r) => r.id === id);
      if (method === 'GET') {
        return idx === -1 ? json({ error: 'Not found' }, 404) : json(db[idx]);
      }
      if (method === 'PATCH') {
        if (idx === -1) return json({ error: 'Not found' }, 404);
        const patch = JSON.parse(init!.body as string) as Partial<Receipt>;
        db[idx] = { ...db[idx], ...patch, id };
        return json(db[idx]);
      }
      if (method === 'DELETE') {
        db = db.filter((r) => r.id !== id);
        return json(null, 204);
      }
    }

    return json({ error: 'Unhandled route' }, 500);
  };
}

vi.stubGlobal('fetch', makeFetchStub());

const api = await import('./mockApi');
const { extractReceipt } = await import('./mockExtraction');
const { CATEGORIES } = await import('../constants');

describe('receipts api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetchStub());
  });

  it('lists seeded receipts', async () => {
    const receipts = await api.listReceipts();
    expect(receipts.length).toBeGreaterThanOrEqual(10);
    expect(receipts.some((r) => r.source === 'email')).toBe(true);
    expect(receipts.some((r) => r.source === 'upload')).toBe(true);
  });

  it('returns receipts sorted by date descending', async () => {
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

describe('extraction api client', () => {
  it('returns extracted fields from the endpoint', async () => {
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });
    const fields = await extractReceipt(file);
    expect(typeof fields.vendor).toBe('string');
    expect(fields.amount).toBeGreaterThan(0);
    expect(CATEGORIES).toContain(fields.category);
    expect(fields.currency).toBe('USD');
    expect(fields.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }, 5000);
});
