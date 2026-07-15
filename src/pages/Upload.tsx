import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { extractReceipt } from '../api/mockExtraction';
import { receiptPaperDataUrl } from '../api/receiptImage';
import type { Receipt } from '../types';
import { Button, CategoryChip } from '../components/ui';
import { formatAmount } from '../constants';

type Stage = 'uploading' | 'extracting' | 'done' | 'failed';

type QueueItem = {
  key: string;
  fileName: string;
  stage: Stage;
  previewUrl: string;
  isPdf: boolean;
  file: File;
  receipt?: Receipt;
  error?: string;
};

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = /^image\/|\.pdf$|application\/pdf/i;

function uid(): string {
  return `rcpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Upload() {
  const navigate = useNavigate();
  const addReceipt = useStore((s) => s.addReceipt);
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = useCallback((key: string, p: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }, []);

  const processItem = useCallback(
    async (item: QueueItem) => {
      try {
        // Uploading stage — short, simulates transfer.
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
        patch(item.key, { stage: 'extracting' });

        const fields = await extractReceipt(item.file);

        // For PDFs and camera captures we render a placeholder receipt image;
        // for real images we keep the file's own data URL.
        let imageUrl = item.previewUrl;
        if (item.isPdf) {
          imageUrl = receiptPaperDataUrl({
            vendor: fields.vendor,
            amount: fields.amount,
            currency: fields.currency,
            date: fields.date,
          });
        }

        const receipt: Receipt = {
          id: uid(),
          imageUrl,
          vendor: fields.vendor,
          amount: fields.amount,
          currency: fields.currency,
          date: fields.date,
          category: fields.category,
          taxAmount: fields.taxAmount,
          source: 'upload',
          status: 'needs_review',
          createdAt: new Date().toISOString(),
          uncertainField: fields.uncertainField ?? null,
        };

        await addReceipt(receipt);
        patch(item.key, { stage: 'done', receipt });
      } catch (err) {
        patch(item.key, {
          stage: 'failed',
          error: err instanceof Error ? err.message : 'Extraction failed',
        });
      }
    },
    [addReceipt, patch],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      for (const file of arr) {
        const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';

        // Validation — bad files enter the queue already failed, others continue.
        if (!ACCEPTED.test(file.type) && !/\.pdf$/i.test(file.name)) {
          setQueue((q) => [
            ...q,
            { key, fileName: file.name, stage: 'failed', previewUrl: '', isPdf, file, error: 'Unsupported file type' },
          ]);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setQueue((q) => [
            ...q,
            { key, fileName: file.name, stage: 'failed', previewUrl: '', isPdf, file, error: 'File exceeds 10 MB' },
          ]);
          continue;
        }

        let previewUrl = '';
        if (!isPdf) {
          try {
            previewUrl = await readAsDataUrl(file);
          } catch {
            previewUrl = '';
          }
        }

        const item: QueueItem = { key, fileName: file.name, stage: 'uploading', previewUrl, isPdf, file };
        setQueue((q) => [...q, item]);
        void processItem(item);
      }
    },
    [processItem],
  );

  const retry = useCallback(
    (item: QueueItem) => {
      patch(item.key, { stage: 'uploading', error: undefined });
      void processItem(item);
    },
    [patch, processItem],
  );

  const remove = useCallback((key: string) => {
    setQueue((q) => q.filter((it) => it.key !== key));
  }, []);

  const allDone = queue.length > 0 && queue.every((it) => it.stage === 'done' || it.stage === 'failed');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">Add receipts</h1>
        <button onClick={() => navigate('/')} className="text-sm text-ink-2 hover:underline">
          ← Back to dashboard
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={`bg-white border-2 border-dashed rounded-card p-10 text-center transition-colors ${
          dragging ? 'border-brand bg-brand-soft/40' : 'border-border'
        }`}
      >
        <div className="text-4xl mb-3">📄</div>
        <p className="text-ink mb-1">
          Drop receipts here or{' '}
          <button
            onClick={() => inputRef.current?.click()}
            className="text-brand font-semibold hover:underline"
          >
            browse files
          </button>
        </p>
        <p className="text-xs text-ink-3">JPG, PNG, HEIC, PDF · max 10 MB each</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="mt-5 space-y-2.5">
          {queue.map((it) => (
            <QueueRow key={it.key} item={it} onRetry={() => retry(it)} onRemove={() => remove(it.key)} />
          ))}
        </div>
      )}

      {allDone && (
        <div className="mt-6 flex justify-end">
          <Button onClick={() => navigate('/')}>View receipts</Button>
        </div>
      )}
    </div>
  );
}

function StageLabel({ item }: { item: QueueItem }) {
  switch (item.stage) {
    case 'uploading':
      return <span className="text-ink-2">Uploading…</span>;
    case 'extracting':
      return <span className="text-brand">🤖 Extracting…</span>;
    case 'done':
      return (
        <span className="text-success font-semibold">
          ✓ {item.receipt?.vendor} · {item.receipt ? formatAmount(item.receipt.amount, item.receipt.currency) : ''}
        </span>
      );
    case 'failed':
      return <span className="text-[#B4232A]">✗ {item.error ?? 'Failed'}</span>;
  }
}

function QueueRow({
  item,
  onRetry,
  onRemove,
}: {
  item: QueueItem;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const progressPct =
    item.stage === 'uploading' ? 35 : item.stage === 'extracting' ? 75 : 100;
  const inFlight = item.stage === 'uploading' || item.stage === 'extracting';

  return (
    <div className="bg-white border border-border rounded-card p-3 flex items-center gap-3">
      <div className="w-11 h-11 rounded-lg border border-border flex items-center justify-center overflow-hidden text-lg bg-white flex-shrink-0">
        {item.isPdf ? '📄' : item.previewUrl ? <img src={item.previewUrl} alt="" className="w-full h-full object-cover" /> : '🧾'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{item.fileName}</div>
        <div className="text-xs mt-0.5">
          <StageLabel item={item} />
        </div>
        {inFlight && (
          <div className="mt-1.5 h-1.5 bg-[#EDF1F0] rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
        {item.stage === 'done' && item.receipt && (
          <div className="mt-1.5">
            <CategoryChip category={item.receipt.category} />
          </div>
        )}
      </div>
      {item.stage === 'failed' && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onRetry} className="text-xs text-brand font-semibold hover:underline">
            Retry
          </button>
          <button onClick={onRemove} className="text-xs text-ink-3 hover:underline">
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
