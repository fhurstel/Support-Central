import type { Receipt } from '../types';
import { buildSeedReceipts } from './seed';

// Mock backend: async CRUD functions with artificial latency, persisting to
// localStorage. Function signatures mirror a future real REST layer so swapping
// in fetch calls is a one-file change.

const STORAGE_KEY = 'receiptpilot.receipts.v1';

function latency(): number {
  return 300 + Math.random() * 500; // 300–800 ms
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), latency()));
}

function readStore(): Receipt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Receipt[];
  } catch {
    // fall through to seeding
  }
  const seed = buildSeedReceipts();
  writeStore(seed);
  return seed;
}

function writeStore(receipts: Receipt[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts));
  } catch (err) {
    // localStorage can throw on quota (large data-URL images). Keep the app
    // usable; the record still lives in the in-memory store for this session.
    console.warn('ReceiptPilot: failed to persist receipts to localStorage', err);
  }
}

function sortByDateDesc(receipts: Receipt[]): Receipt[] {
  return [...receipts].sort((a, b) => {
    if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
    return b.date.localeCompare(a.date);
  });
}

export async function listReceipts(): Promise<Receipt[]> {
  return delay(sortByDateDesc(readStore()));
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const found = readStore().find((r) => r.id === id) ?? null;
  return delay(found);
}

export async function createReceipt(receipt: Receipt): Promise<Receipt> {
  const receipts = readStore();
  receipts.unshift(receipt);
  writeStore(receipts);
  return delay(receipt);
}

export async function updateReceipt(
  id: string,
  patch: Partial<Receipt>,
): Promise<Receipt> {
  const receipts = readStore();
  const idx = receipts.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`Receipt ${id} not found`);
  const updated = { ...receipts[idx], ...patch, id };
  receipts[idx] = updated;
  writeStore(receipts);
  return delay(updated);
}

export async function deleteReceipt(id: string): Promise<void> {
  const receipts = readStore().filter((r) => r.id !== id);
  writeStore(receipts);
  await delay(null);
}

// Test/utility helper — reset the store to seed data.
export function resetStore(): void {
  writeStore(buildSeedReceipts());
}
