import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import type { Receipt } from '../types';
import { formatAmount, formatDate } from '../constants';
import { CategoryChip, StatusBadge, Skeleton } from '../components/ui';

export default function Inbox() {
  const navigate = useNavigate();
  const { receipts, loading, error, loadReceipts } = useStore();

  useEffect(() => {
    if (receipts.length === 0) loadReceipts();
  }, [receipts.length, loadReceipts]);

  const emailReceipts = useMemo(
    () => receipts.filter((r) => r.source === 'email'),
    [receipts],
  );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Email Receipts</h1>
      <p className="text-ink-2 text-sm mb-5">
        Receipts scanned from a connected inbox flow into the same list as uploads.
      </p>

      {/* Connection card */}
      <div className="bg-white border border-border rounded-card shadow-card p-4 flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-soft flex items-center justify-center text-brand-dark font-bold">
            ✉
          </div>
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              gmail — hurstel@…
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <span className="w-2 h-2 rounded-full bg-success" /> Connected
              </span>
            </div>
            <div className="text-xs text-ink-3">Scanning for receipts automatically</div>
          </div>
        </div>
        <button
          disabled
          className="text-sm border border-border rounded-[10px] px-3.5 py-2 text-ink-3 cursor-not-allowed"
        >
          Manage connection · Coming soon
        </button>
      </div>

      {/* Preview banner */}
      <div className="bg-brand-soft/60 border border-brand/20 text-brand-dark rounded-card px-4 py-2.5 text-sm mb-5">
        Preview — email scanning ships in a later version. These are sample receipts.
      </div>

      {error ? (
        <div className="bg-amber-soft border border-amber/30 text-amber rounded-card p-4">
          Couldn't load receipts.
        </div>
      ) : loading && receipts.length === 0 ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-card" />
          ))}
        </div>
      ) : emailReceipts.length === 0 ? (
        <div className="bg-white border border-border rounded-card shadow-card p-10 text-center">
          <div className="text-4xl mb-3">✉</div>
          <p className="text-lg font-semibold mb-1">Connect your inbox</p>
          <p className="text-ink-2 mb-5">
            ReceiptPilot will find receipts automatically in your email.
          </p>
          <button
            disabled
            className="border border-border rounded-[10px] px-5 py-2.5 text-sm text-ink-3 cursor-not-allowed"
          >
            Connect · Coming soon
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {emailReceipts.map((r) => (
            <EmailRow key={r.id} receipt={r} onOpen={() => navigate(`/receipts/${r.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmailRow({ receipt, onOpen }: { receipt: Receipt; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      className={`bg-white border border-border rounded-card shadow-card p-3.5 flex items-center gap-3 cursor-pointer hover:bg-[#FAFCFB] ${
        receipt.status === 'needs_review' ? 'shadow-[inset_3px_0_0_#D97706]' : ''
      }`}
    >
      <div className="w-11 h-11 rounded-lg border border-border flex items-center justify-center overflow-hidden bg-white flex-shrink-0">
        {receipt.imageUrl ? (
          <img src={receipt.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          '🧾'
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{receipt.vendor}</div>
        <div className="text-xs text-ink-3 truncate">
          {receipt.emailFrom ? `${receipt.emailFrom} · ` : ''}
          {receipt.emailSubject ?? 'Email receipt'}
        </div>
        <div className="text-[11px] text-ink-3 mt-0.5">Received {formatDate(receipt.date)}</div>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className="font-bold tabular-nums text-sm">
          {formatAmount(receipt.amount, receipt.currency)}
        </span>
        <div className="hidden sm:block">
          <CategoryChip category={receipt.category} />
        </div>
        <StatusBadge status={receipt.status} />
      </div>
    </div>
  );
}
