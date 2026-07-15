import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, applyFilters, filtersActive, type DatePreset } from '../store';
import type { Receipt } from '../types';
import { CATEGORIES, formatAmount, formatDate } from '../constants';
import { Button, CategoryChip, StatusBadge, SourceIcon, Skeleton } from '../components/ui';

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
];

function StatTiles({ receipts }: { receipts: Receipt[] }) {
  const now = new Date();
  const thisMonthTotal = receipts
    .filter((r) => {
      const d = new Date(`${r.date}T00:00:00`);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, r) => sum + r.amount, 0);

  const pending = receipts.filter((r) => r.status === 'needs_review').length;

  const byCat = new Map<string, number>();
  receipts.forEach((r) => byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount));
  let topCategory = '—';
  let topVal = -1;
  byCat.forEach((v, k) => {
    if (v > topVal) {
      topVal = v;
      topCategory = k;
    }
  });

  const tiles = [
    { k: 'Total this month', v: formatAmount(thisMonthTotal, 'USD'), amber: false },
    { k: 'Receipts', v: String(receipts.length), amber: false },
    { k: 'Pending review', v: String(pending), amber: pending > 0 },
    { k: 'Top category', v: topCategory, amber: false },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {tiles.map((t) => (
        <div key={t.k} className="bg-white border border-border rounded-card shadow-card p-4">
          <div className="text-xs text-ink-2 mb-1">{t.k}</div>
          <div
            className={`text-xl font-bold tabular-nums ${t.amber ? 'text-amber' : ''}`}
          >
            {t.v}
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 border-b border-border last:border-0">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { receipts, loading, error, filters, loadReceipts, setFilter, clearFilters } = useStore();

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const vendors = useMemo(
    () => Array.from(new Set(receipts.map((r) => r.vendor))).sort(),
    [receipts],
  );

  const filtered = useMemo(() => applyFilters(receipts, filters), [receipts, filters]);

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <h1 className="text-xl font-bold">Receipts</h1>
        <div className="flex-1 min-w-[180px] max-w-[340px] relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 text-sm">🔍</span>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Search vendor…"
            className="w-full bg-white border border-border rounded-[10px] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>
        <Button onClick={() => navigate('/upload')} className="ml-auto">
          + Add Receipt
        </Button>
      </div>

      {error ? (
        <div className="bg-amber-soft border border-amber/30 text-amber rounded-card p-4 flex items-center justify-between">
          <span>Couldn't load receipts.</span>
          <Button variant="ghost" onClick={() => loadReceipts()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          {loading && receipts.length === 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[70px] rounded-card" />
              ))}
            </div>
          ) : (
            <StatTiles receipts={filtered} />
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 mb-3.5 flex-wrap">
            {(['All', ...CATEGORIES] as const).map((cat) => {
              const on = filters.category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setFilter('category', cat)}
                  className={`text-[12.5px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
                    on
                      ? 'bg-brand border-brand text-white font-semibold'
                      : 'bg-white border-border text-ink-2 hover:bg-canvas'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
            <span className="w-px h-5 bg-border mx-1 hidden sm:block" />
            <select
              value={filters.datePreset}
              onChange={(e) => setFilter('datePreset', e.target.value as DatePreset)}
              className="text-[12.5px] px-3 py-1.5 rounded-lg bg-white border border-border cursor-pointer"
            >
              {DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              value={filters.vendor}
              onChange={(e) => setFilter('vendor', e.target.value)}
              className="text-[12.5px] px-3 py-1.5 rounded-lg bg-white border border-border cursor-pointer max-w-[160px]"
            >
              <option value="All">All vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {filtersActive(filters) && (
              <button
                onClick={clearFilters}
                className="text-[12.5px] text-brand font-medium hover:underline px-1"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* List */}
          {loading && receipts.length === 0 ? (
            <SkeletonRows />
          ) : filtered.length === 0 ? (
            <EmptyState anyReceipts={receipts.length > 0} onClear={clearFilters} onAdd={() => navigate('/upload')} />
          ) : (
            <ReceiptTable receipts={filtered} onOpen={(id) => navigate(`/receipts/${id}`)} />
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
  anyReceipts,
  onClear,
  onAdd,
}: {
  anyReceipts: boolean;
  onClear: () => void;
  onAdd: () => void;
}) {
  const navigate = useNavigate();
  if (anyReceipts) {
    return (
      <div className="bg-white border border-border rounded-card shadow-card p-10 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-ink-2 mb-4">No receipts match your filters.</p>
        <Button variant="ghost" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    );
  }
  return (
    <div className="bg-white border border-border rounded-card shadow-card p-12 text-center">
      <div className="text-5xl mb-4">🧾</div>
      <p className="text-lg font-semibold mb-1">No receipts yet.</p>
      <p className="text-ink-2 mb-5">Snap a photo or upload a file to get started.</p>
      <Button onClick={onAdd}>+ Add Receipt</Button>
      <div className="mt-4">
        <button onClick={() => navigate('/inbox')} className="text-sm text-brand hover:underline">
          Or connect your email inbox
        </button>
      </div>
    </div>
  );
}

function ReceiptTable({
  receipts,
  onOpen,
}: {
  receipts: Receipt[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
      {/* Desktop header */}
      <div className="hidden md:grid grid-cols-[52px_1.5fr_1fr_1.1fr_1fr_0.9fr_40px] gap-3 items-center px-4 py-2.5 bg-[#FBFDFC] text-[11.5px] font-semibold uppercase tracking-wider text-ink-3 border-b border-border">
        <div />
        <div>Vendor</div>
        <div>Date</div>
        <div>Category</div>
        <div>Status</div>
        <div className="text-right">Amount</div>
        <div />
      </div>

      {receipts.map((r) => {
        const review = r.status === 'needs_review';
        const processing = r.status === 'processing';
        return (
          <div
            key={r.id}
            onClick={() => onOpen(r.id)}
            className={`grid grid-cols-[44px_1fr_auto] md:grid-cols-[52px_1.5fr_1fr_1.1fr_1fr_0.9fr_40px] gap-3 items-center px-4 py-3 border-b border-border last:border-0 text-[13.5px] cursor-pointer hover:bg-[#FAFCFB] ${
              review ? 'shadow-[inset_3px_0_0_#D97706] bg-[#FFFDF8]' : ''
            }`}
          >
            <div className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-lg overflow-hidden bg-white">
              {processing ? (
                '⏳'
              ) : r.imageUrl ? (
                <img src={r.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                '🧾'
              )}
            </div>

            <div className="min-w-0">
              <div className={`font-semibold truncate ${processing ? 'text-ink-3' : ''}`}>
                {processing ? 'Processing…' : r.vendor}
              </div>
              <div className="text-[11.5px] text-ink-3 truncate">
                {r.source === 'email'
                  ? r.emailSubject
                    ? `via email · ${r.emailSubject}`
                    : 'via email'
                  : 'uploaded'}
              </div>
            </div>

            {/* Date — hidden on mobile */}
            <div className="hidden md:block text-ink-3">
              {processing ? '—' : formatDate(r.date)}
            </div>

            {/* Category — hidden on mobile */}
            <div className="hidden md:block">
              {processing ? <span className="text-ink-3">—</span> : <CategoryChip category={r.category} />}
            </div>

            {/* Status — hidden on mobile (shown via amount stack instead) */}
            <div className="hidden md:block">
              <StatusBadge status={r.status} />
            </div>

            {/* Amount */}
            <div className="text-right font-bold tabular-nums flex flex-col items-end gap-1">
              <span className={processing ? 'text-ink-3' : ''}>
                {processing ? '—' : formatAmount(r.amount, r.currency)}
              </span>
              <span className="md:hidden">
                <StatusBadge status={r.status} />
              </span>
            </div>

            {/* Source icon — desktop */}
            <div className="hidden md:block text-center text-[15px]">
              <SourceIcon source={r.source} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
