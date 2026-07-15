import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useStore } from '../store';
import * as api from '../api/mockApi';
import type { Category, Receipt } from '../types';
import { CATEGORIES, CURRENCIES, formatDateTime } from '../constants';
import { Button, StatusBadge, Skeleton } from '../components/ui';

function CheckFlag() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber bg-amber-soft rounded-full px-2 py-0.5 ml-2">
      ⚠ Check this
    </span>
  );
}

export default function ReceiptDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const storeUpdate = useStore((s) => s.updateReceipt);
  const storeRemove = useStore((s) => s.removeReceipt);

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getReceipt(id).then((r) => {
      if (!active) return;
      if (!r) {
        setNotFound(true);
      } else {
        setReceipt(r);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  async function save(patch: Partial<Receipt>) {
    if (!receipt) return;
    const next = { ...receipt, ...patch };
    setReceipt(next);
    await storeUpdate(receipt.id, patch);
    flashSaved();
  }

  async function confirm() {
    await save({ status: 'confirmed' });
  }

  async function reopen() {
    await save({ status: 'needs_review' });
  }

  async function doDelete() {
    if (!receipt) return;
    await storeRemove(receipt.id);
    navigate('/');
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="flex flex-col md:flex-row gap-6">
          <Skeleton className="md:flex-[1.15] h-[420px] rounded-card" />
          <div className="flex-1 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-card" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !receipt) {
    return (
      <div className="max-w-md mx-auto text-center bg-white border border-border rounded-card shadow-card p-12 mt-8">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-lg font-semibold mb-1">Receipt not found</p>
        <p className="text-ink-2 mb-5">This receipt may have been deleted.</p>
        <Link to="/" className="text-brand font-semibold hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const processing = receipt.status === 'processing';
  const confirmed = receipt.status === 'confirmed';
  const unsure = receipt.uncertainField;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-sm text-ink-3 mb-4">
        <Link to="/" className="hover:underline">
          ← Receipts
        </Link>
        {'  /  '}
        <b className="text-ink font-semibold">{receipt.vendor}</b>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Image pane */}
        <div className="w-full md:flex-[1.15] bg-white border border-border rounded-card shadow-card p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-ink-2 font-semibold uppercase tracking-wide">
              Original receipt
            </span>
            <span>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-white text-ink-2 ml-1.5 hover:bg-canvas"
              >
                ⟲ Rotate
              </button>
              <button
                onClick={() => setZoom((z) => !z)}
                className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-white text-ink-2 ml-1.5 hover:bg-canvas"
              >
                {zoom ? '－ Zoom out' : '＋ Zoom'}
              </button>
            </span>
          </div>
          <div className="bg-canvas rounded-lg p-4 overflow-auto flex items-center justify-center min-h-[280px]">
            {receipt.imageUrl ? (
              <img
                src={receipt.imageUrl}
                alt={`${receipt.vendor} receipt`}
                className="transition-transform duration-200 max-w-full"
                style={{
                  transform: `rotate(${rotation}deg) scale(${zoom ? 1.6 : 1})`,
                }}
              />
            ) : (
              <div className="text-ink-3">No image available</div>
            )}
          </div>
        </div>

        {/* Data pane */}
        <div className="w-full md:flex-1 min-w-0">
          <div className="bg-white border border-border rounded-card shadow-card p-5">
            <div className="flex items-center gap-2.5 mb-5 flex-wrap">
              <StatusBadge status={receipt.status} />
              <span className="text-xs text-ink-3">
                Source: {receipt.source === 'email' ? 'Email ✉' : 'Upload ⬆'} · Added{' '}
                {formatDateTime(receipt.createdAt)}
              </span>
            </div>

            {processing ? (
              <div className="py-8 text-center">
                <div className="text-2xl mb-2 animate-pulse">🤖</div>
                <p className="text-ink-2">AI is reading this receipt…</p>
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <Field label="Vendor" flag={unsure === 'vendor'}>
                  <input
                    type="text"
                    value={receipt.vendor}
                    onChange={(e) => setReceipt({ ...receipt, vendor: e.target.value })}
                    onBlur={(e) => save({ vendor: e.target.value })}
                    className={inputCls}
                  />
                </Field>

                <div className="grid grid-cols-[2fr_1fr] gap-3">
                  <Field label="Amount" flag={unsure === 'amount'}>
                    <input
                      type="number"
                      step="0.01"
                      value={receipt.amount}
                      onChange={(e) => setReceipt({ ...receipt, amount: Number(e.target.value) })}
                      onBlur={(e) => save({ amount: Number(e.target.value) })}
                      className={`${inputCls} tabular-nums`}
                    />
                  </Field>
                  <Field label="Currency">
                    <select
                      value={receipt.currency}
                      onChange={(e) => save({ currency: e.target.value })}
                      className={inputCls}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date" flag={unsure === 'date'}>
                    <input
                      type="date"
                      value={receipt.date}
                      onChange={(e) => setReceipt({ ...receipt, date: e.target.value })}
                      onBlur={(e) => save({ date: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Tax amount" flag={unsure === 'taxAmount'}>
                    <input
                      type="number"
                      step="0.01"
                      value={receipt.taxAmount ?? ''}
                      placeholder="—"
                      onChange={(e) =>
                        setReceipt({
                          ...receipt,
                          taxAmount: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      onBlur={(e) =>
                        save({ taxAmount: e.target.value === '' ? null : Number(e.target.value) })
                      }
                      className={`${inputCls} tabular-nums`}
                    />
                  </Field>
                </div>

                <Field label="Category · auto-sorted, editable" flag={unsure === 'category'}>
                  <select
                    value={receipt.category}
                    onChange={(e) => save({ category: e.target.value as Category })}
                    className={inputCls}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="flex gap-2.5 mt-5 items-center flex-wrap">
                  {confirmed ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-success font-semibold text-sm">
                        ✓ Confirmed
                      </span>
                      <Button variant="ghost" onClick={reopen}>
                        Re-open for edits
                      </Button>
                    </>
                  ) : (
                    <Button onClick={confirm}>✓ Confirm receipt</Button>
                  )}
                  <Button variant="ghost" onClick={() => navigate('/')}>
                    Back
                  </Button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-[#B4232A] font-medium text-sm ml-auto hover:underline"
                  >
                    Delete
                  </button>
                </div>

                {saved && (
                  <div className="inline-flex items-center gap-1.5 text-xs text-success bg-success-soft rounded-full px-3 py-1 mt-4">
                    ✓ Changes saved
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-white rounded-card shadow-soft p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold text-lg mb-1">Delete this receipt?</p>
            <p className="text-ink-2 text-sm mb-5">
              This removes {receipt.vendor} from your records. This can't be undone.
            </p>
            <div className="flex justify-end gap-2.5">
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <button
                onClick={doDelete}
                className="bg-[#B4232A] hover:bg-[#93191f] text-white rounded-[10px] px-5 py-2.5 text-sm font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full border border-border rounded-[9px] bg-white px-3 py-2 text-sm font-medium text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15';

function Field({
  label,
  flag,
  children,
}: {
  label: string;
  flag?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label className="block text-[11.5px] font-semibold uppercase tracking-wider text-ink-3 mb-1.5">
        {label}
        {flag ? <CheckFlag /> : null}
      </label>
      {children}
    </div>
  );
}
