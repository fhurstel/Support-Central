import type { Receipt } from '../types';

// Real backend client. Function signatures mirror the previous localStorage mock
// so the store and components didn't need to change. Requests go to the Express
// API, which Vite proxies from /api to the server in dev (see vite.config.ts).

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors, keep default message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function listReceipts(): Promise<Receipt[]> {
  return request<Receipt[]>('/receipts');
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const res = await fetch(`${BASE}/receipts/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as Receipt;
}

export async function createReceipt(receipt: Receipt): Promise<Receipt> {
  return request<Receipt>('/receipts', {
    method: 'POST',
    body: JSON.stringify(receipt),
  });
}

export async function updateReceipt(id: string, patch: Partial<Receipt>): Promise<Receipt> {
  return request<Receipt>(`/receipts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteReceipt(id: string): Promise<void> {
  await request<void>(`/receipts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
