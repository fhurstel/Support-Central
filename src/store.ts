import { create } from 'zustand';
import type { Category, Receipt } from './types';
import * as api from './api/mockApi';

export type DatePreset =
  | 'all'
  | 'this_month'
  | 'last_month'
  | 'last_90'
  | 'this_year';

export type Filters = {
  category: Category | 'All';
  datePreset: DatePreset;
  vendor: string | 'All';
  search: string;
};

const DEFAULT_FILTERS: Filters = {
  category: 'All',
  datePreset: 'all',
  vendor: 'All',
  search: '',
};

type ReceiptState = {
  receipts: Receipt[];
  loading: boolean;
  error: string | null;
  filters: Filters;

  loadReceipts: () => Promise<void>;
  addReceipt: (receipt: Receipt) => Promise<void>;
  updateReceipt: (id: string, patch: Partial<Receipt>) => Promise<void>;
  removeReceipt: (id: string) => Promise<void>;

  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clearFilters: () => void;
};

export const useStore = create<ReceiptState>((set, get) => ({
  receipts: [],
  loading: false,
  error: null,
  filters: DEFAULT_FILTERS,

  loadReceipts: async () => {
    set({ loading: true, error: null });
    try {
      const receipts = await api.listReceipts();
      set({ receipts, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load receipts',
      });
    }
  },

  addReceipt: async (receipt) => {
    await api.createReceipt(receipt);
    // Reload to keep sort order consistent with the store.
    const receipts = await api.listReceipts();
    set({ receipts });
  },

  updateReceipt: async (id, patch) => {
    // Optimistic update for snappy inline editing.
    const prev = get().receipts;
    set({
      receipts: prev.map((r) => (r.id === id ? { ...r, ...patch, id } : r)),
    });
    try {
      await api.updateReceipt(id, patch);
    } catch (err) {
      set({ receipts: prev, error: err instanceof Error ? err.message : 'Update failed' });
    }
  },

  removeReceipt: async (id) => {
    const prev = get().receipts;
    set({ receipts: prev.filter((r) => r.id !== id) });
    try {
      await api.deleteReceipt(id);
    } catch (err) {
      set({ receipts: prev, error: err instanceof Error ? err.message : 'Delete failed' });
    }
  },

  setFilter: (key, value) => {
    set({ filters: { ...get().filters, [key]: value } });
  },

  clearFilters: () => set({ filters: DEFAULT_FILTERS }),
}));

export function filtersActive(f: Filters): boolean {
  return (
    f.category !== 'All' ||
    f.datePreset !== 'all' ||
    f.vendor !== 'All' ||
    f.search.trim() !== ''
  );
}

function inDatePreset(dateIso: string, preset: DatePreset): boolean {
  if (preset === 'all') return true;
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return true;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'this_month':
      return d.getFullYear() === y && d.getMonth() === m;
    case 'last_month': {
      const lm = new Date(y, m - 1, 1);
      return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
    }
    case 'last_90': {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      return d >= cutoff;
    }
    case 'this_year':
      return d.getFullYear() === y;
    default:
      return true;
  }
}

export function applyFilters(receipts: Receipt[], f: Filters): Receipt[] {
  const q = f.search.trim().toLowerCase();
  return receipts.filter((r) => {
    if (f.category !== 'All' && r.category !== f.category) return false;
    if (f.vendor !== 'All' && r.vendor !== f.vendor) return false;
    if (!inDatePreset(r.date, f.datePreset)) return false;
    if (q && !r.vendor.toLowerCase().includes(q)) return false;
    return true;
  });
}
