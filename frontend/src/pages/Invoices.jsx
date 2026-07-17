import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, X, Send, AlertCircle, DollarSign, Eye, Trash2, Printer,
  CheckCircle, FileText, BarChart3, Clock,
} from 'lucide-react';
import {
  getClients, getInvoices, getInvoice, createInvoice, sendInvoice,
  deleteInvoice, markInvoicePaid, getUnbilledTime, getInvoiceReports,
} from '../services/api';

const money = (v) => `$${parseFloat(v || 0).toFixed(2)}`;
const dateFmt = (v) => (v ? new Date(v).toLocaleDateString() : '—');

const STATUS_STYLE = {
  DRAFT: { background: '#f0f0f0', color: '#555' },
  SENT: { background: '#dbeafe', color: '#2563eb' },
  PAID: { background: '#dcfce7', color: '#16a34a' },
  OVERDUE: { background: '#fee2e2', color: '#dc2626' },
};
function StatusBadge({ status }) {
  const s = (status || 'DRAFT').toUpperCase();
  return <span className="badge" style={STATUS_STYLE[s] || STATUS_STYLE.DRAFT}>{s}</span>;
}

/* ── Printable invoice document (also the preview) ─────────────────────────── */
function InvoiceDocument({ invoice }) {
  const items = Array.isArray(invoice.items) && invoice.items.length
    ? invoice.items
    : [{ description: 'Support services', hours: invoice.total_hours, rate: invoice.hourly_rate, amount: invoice.total_amount }];
  return (
    <div className="invoice-print-area" style={{ background: '#fff', color: '#1a2030', padding: 32, borderRadius: 8, border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>INVOICE</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{invoice.invoice_number}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>Fiji IT Solutions</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Service Desk</div>
          <div style={{ marginTop: 6 }}><StatusBadge status={invoice.status} /></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9ca3af', marginBottom: 4 }}>Bill To</div>
          <div style={{ fontWeight: 700 }}>{invoice.client_name || '—'}</div>
          {invoice.client?.email && <div style={{ fontSize: 13, color: '#6b7280' }}>{invoice.client.email}</div>}
        </div>
        <div style={{ textAlign: 'right', fontSize: 13 }}>
          <div><span style={{ color: '#9ca3af' }}>Issued:</span> {dateFmt(invoice.created_at)}</div>
          <div><span style={{ color: '#9ca3af' }}>Due:</span> {dateFmt(invoice.due_date)}</div>
          {(invoice.period_start || invoice.period_end) && (
            <div><span style={{ color: '#9ca3af' }}>Period:</span> {dateFmt(invoice.period_start)} – {dateFmt(invoice.period_end)}</div>
          )}
          {invoice.paid_at && <div><span style={{ color: '#9ca3af' }}>Paid:</span> {dateFmt(invoice.paid_at)}</div>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #1a2030', textAlign: 'left' }}>
            <th style={{ padding: '8px 4px' }}>Description</th>
            <th style={{ padding: '8px 4px', textAlign: 'right', width: 70 }}>Hours</th>
            <th style={{ padding: '8px 4px', textAlign: 'right', width: 90 }}>Rate</th>
            <th style={{ padding: '8px 4px', textAlign: 'right', width: 100 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '8px 4px' }}>{it.description}</td>
              <td style={{ padding: '8px 4px', textAlign: 'right' }}>{it.hours ? parseFloat(it.hours).toFixed(2) : '—'}</td>
              <td style={{ padding: '8px 4px', textAlign: 'right' }}>{it.rate ? money(it.rate) : '—'}</td>
              <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600 }}>{money(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: 260, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ color: '#6b7280' }}>Subtotal</span><span>{money(invoice.subtotal)}</span>
          </div>
          {(invoice.tax_rate || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span style={{ color: '#6b7280' }}>Tax ({invoice.tax_rate}%)</span><span>{money(invoice.tax_amount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #1a2030', fontWeight: 800, fontSize: 18 }}>
            <span>Total</span><span>{money(invoice.total_amount)}</span>
          </div>
        </div>
      </div>

      {invoice.notes && (
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid #f0f0f0', fontSize: 13, color: '#6b7280', whiteSpace: 'pre-wrap' }}>
          {invoice.notes}
        </div>
      )}
    </div>
  );
}

/* ── Preview modal with print + actions ─────────────────────────────────────── */
function InvoicePreviewModal({ invoiceId, onClose, onChanged }) {
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setInvoice(await getInvoice(invoiceId)); } catch (err) { setError(err.message); }
  }, [invoiceId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try { await fn(); await load(); onChanged?.(); } catch (err) { alert(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* Print styles: only the invoice document prints */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .invoice-print-area, .invoice-print-area * { visibility: visible !important; }
        .invoice-print-area { position: fixed !important; inset: 0 !important; border: none !important; border-radius: 0 !important; }
      }`}</style>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Invoice Preview</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        {error ? (
          <div className="empty-state"><AlertCircle size={32} /> {error}</div>
        ) : !invoice ? (
          <div className="loading-spinner">Loading invoice…</div>
        ) : (
          <>
            <InvoiceDocument invoice={invoice} />
            <div className="flex gap-2 justify-end" style={{ marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={() => window.print()}>
                <Printer size={14} /> Print / PDF
              </button>
              {String(invoice.status).toUpperCase() === 'DRAFT' && (
                <button className="btn btn-success" disabled={busy} onClick={() => act(() => sendInvoice(invoice.id))}>
                  <Send size={14} /> Send
                </button>
              )}
              {['SENT', 'OVERDUE'].includes(String(invoice.status).toUpperCase()) && (
                <button className="btn btn-success" disabled={busy} onClick={() => act(() => markInvoicePaid(invoice.id))}>
                  <CheckCircle size={14} /> Mark Paid
                </button>
              )}
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() => act(async () => { await deleteInvoice(invoice.id); onClose(); }, 'Delete this invoice? Billed time entries become billable again.')}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Create modal: pull unbilled time + manual line items + tax ────────────── */
function CreateInvoiceModal({ onClose, onCreated }) {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [unbilled, setUnbilled] = useState([]);
  const [checked, setChecked] = useState({});
  const [manualItems, setManualItems] = useState([]);
  const [taxRate, setTaxRate] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const client = clients.find((c) => String(c.id) === String(clientId));
  const rate = parseFloat(client?.hourly_rate || 0);

  useEffect(() => { getClients().then((d) => setClients(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  useEffect(() => {
    setUnbilled([]); setChecked({});
    if (!clientId) return;
    getUnbilledTime(clientId).then((d) => {
      const rows = Array.isArray(d) ? d : [];
      setUnbilled(rows);
      // pre-select everything unbilled
      const all = {}; rows.forEach((e) => { all[e.id] = true; });
      setChecked(all);
    }).catch(() => setUnbilled([]));
  }, [clientId]);

  const items = useMemo(() => {
    const timeItems = unbilled.filter((e) => checked[e.id]).map((e) => ({
      description: `${e.ticket_number || ''} ${e.description || 'Support work'}`.trim(),
      hours: e.hours, rate, time_entry_id: e.id,
    }));
    const manual = manualItems
      .filter((m) => m.description || m.amount || (m.hours && m.rate))
      .map((m) => ({
        description: m.description,
        hours: parseFloat(m.hours || 0),
        rate: parseFloat(m.rate || 0),
        ...(m.amount !== '' && m.amount !== undefined ? { amount: parseFloat(m.amount || 0) } : {}),
      }));
    return [...timeItems, ...manual];
  }, [unbilled, checked, manualItems, rate]);

  const subtotal = items.reduce((s, it) => s + (it.amount !== undefined ? it.amount : (it.hours || 0) * (it.rate || 0)), 0);
  const tax = subtotal * (parseFloat(taxRate) || 0) / 100;
  const total = subtotal + tax;

  const addManual = () => setManualItems((m) => [...m, { description: '', hours: '', rate: rate || '', amount: '' }]);
  const setManual = (i, k, v) => setManualItems((m) => m.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const removeManual = (i) => setManualItems((m) => m.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    if (!client || !items.length) return;
    setSaving(true);
    try {
      await createInvoice({
        client_id: parseInt(clientId), items, tax_rate: parseFloat(taxRate) || 0,
        due_date: dueDate || undefined, notes,
      });
      onCreated(); onClose();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Invoice</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="form-group">
          <label>Client *</label>
          <select className="form-control" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">-- Select client --</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — ${c.hourly_rate}/hr</option>
            ))}
          </select>
        </div>

        {client && (
          <>
            <div className="form-group">
              <label><Clock size={13} style={{ verticalAlign: 'text-top' }} /> Unbilled time for {client.name}</label>
              {unbilled.length === 0 ? (
                <div className="text-sm text-muted" style={{ padding: '6px 0' }}>No unbilled time entries.</div>
              ) : (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                  {unbilled.map((e) => (
                    <label key={e.id} className="flex items-center gap-2" style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={!!checked[e.id]} onChange={() => setChecked((c) => ({ ...c, [e.id]: !c[e.id] }))} />
                      <span style={{ flex: 1 }}>
                        <strong>{e.ticket_number}</strong> {e.description || 'Support work'}
                        <span className="text-muted"> · {e.user?.name || ''}</span>
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>{e.hours}h × {money(rate)} = <strong>{money(e.hours * rate)}</strong></span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Additional line items</label>
              {manualItems.map((m, i) => (
                <div key={i} className="flex gap-2 items-center" style={{ marginBottom: 6 }}>
                  <input className="form-control" style={{ flex: 3 }} placeholder="Description" value={m.description} onChange={(e) => setManual(i, 'description', e.target.value)} />
                  <input className="form-control" style={{ flex: 1 }} type="number" min="0" step="0.25" placeholder="Hours" value={m.hours} onChange={(e) => setManual(i, 'hours', e.target.value)} />
                  <input className="form-control" style={{ flex: 1 }} type="number" min="0" placeholder="Rate" value={m.rate} onChange={(e) => setManual(i, 'rate', e.target.value)} />
                  <input className="form-control" style={{ flex: 1 }} type="number" min="0" placeholder="Amount" title="Fixed amount (overrides hours × rate)" value={m.amount} onChange={(e) => setManual(i, 'amount', e.target.value)} />
                  <button className="btn btn-sm btn-outline" onClick={() => removeManual(i)} title="Remove line"><X size={12} /></button>
                </div>
              ))}
              <button className="btn btn-sm btn-outline" onClick={addManual}><Plus size={12} /> Add line item</button>
            </div>

            <div className="two-col">
              <div className="form-group">
                <label>Tax rate (%)</label>
                <input className="form-control" type="number" min="0" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Due date</label>
                <input className="form-control" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, thank-you note…" />
            </div>

            <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
              <div className="flex justify-between"><span className="text-muted">Line items</span><span>{items.length}</span></div>
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{money(subtotal)}</span></div>
              {tax > 0 && <div className="flex justify-between"><span className="text-muted">Tax</span><span>{money(tax)}</span></div>}
              <div className="flex justify-between" style={{ fontWeight: 700, fontSize: 17, marginTop: 6, paddingTop: 6, borderTop: '2px solid #ddd' }}>
                <span>Total</span><span>{money(total)}</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !items.length}>
                {saving ? 'Creating…' : `Create Invoice (${money(total)})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Reports ─────────────────────────────────────────────────────────────────
   Magnitude comparisons use a single hue (the app indigo) with values always
   labeled in text; status colors are reserved for invoice states. ─────────── */
function BarRow({ label, value, max, sub }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="flex justify-between text-sm" style={{ marginBottom: 3 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span>{money(value)}{sub ? <span className="text-muted"> · {sub}</span> : null}</span>
      </div>
      <div style={{ background: '#eef0f6', borderRadius: 4, height: 10 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: '#6366f1' }} />
      </div>
    </div>
  );
}

function ReportsView() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      setReport(await getInvoiceReports(params));
      setError(null);
    } catch (err) { setError(err.message); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="empty-state"><AlertCircle size={32} /> {error}</div>;
  if (!report) return <div className="loading-spinner">Loading report…</div>;

  const t = report.totals || {};
  const maxClient = Math.max(...(report.by_client || []).map((c) => c.invoiced), 0);
  const maxMonth = Math.max(...(report.by_month || []).map((m) => m.invoiced), 0);

  return (
    <>
      <div className="flex gap-2 items-center" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <label className="text-sm text-muted">From</label>
        <input className="form-control" style={{ width: 160 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="text-sm text-muted">To</label>
        <input className="form-control" style={{ width: 160 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        {(from || to) && (
          <button className="btn btn-sm btn-outline" onClick={() => { setFrom(''); setTo(''); }}>Clear</button>
        )}
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#6366f1' }}><FileText size={20} /></div>
          <div className="stat-label">Invoiced</div>
          <div className="stat-value">{money(t.invoiced)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#16a34a' }}><CheckCircle size={20} /></div>
          <div className="stat-label">Paid</div>
          <div className="stat-value">{money(t.paid)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#2563eb' }}><Send size={20} /></div>
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">{money(t.outstanding)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#dc2626' }}><AlertCircle size={20} /></div>
          <div className="stat-label">Overdue</div>
          <div className="stat-value">{money(t.overdue)}</div>
        </div>
      </div>

      <div className="two-col" style={{ gap: 24, alignItems: 'start' }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 14, fontSize: 15 }}>Revenue by client</h3>
          {(report.by_client || []).length === 0 ? (
            <div className="text-sm text-muted">No invoices in this range.</div>
          ) : report.by_client.map((c) => (
            <BarRow key={c.client_id || c.client_name} label={c.client_name} value={c.invoiced}
              max={maxClient} sub={`paid ${money(c.paid)}`} />
          ))}
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 14, fontSize: 15 }}>Invoiced by month</h3>
          {(report.by_month || []).length === 0 ? (
            <div className="text-sm text-muted">No invoices in this range.</div>
          ) : report.by_month.map((m) => (
            <BarRow key={m.month} label={m.month} value={m.invoiced} max={maxMonth}
              sub={`${m.count} invoice${m.count === 1 ? '' : 's'}`} />
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <h3 style={{ marginBottom: 12, fontSize: 15 }}>Summary by status</h3>
        <table className="data-table">
          <thead>
            <tr><th>Status</th><th>Invoices</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {Object.entries(report.by_status || {}).map(([s, v]) => (
              <tr key={s}>
                <td><StatusBadge status={s} /></td>
                <td>{v.count}</td>
                <td style={{ fontWeight: 600 }}>{money(v.amount)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td>Total</td><td>{t.invoice_count}</td><td>{money(t.invoiced)}</td>
            </tr>
          </tbody>
        </table>
        <div className="text-sm text-muted" style={{ marginTop: 8 }}>{t.hours_billed} hours billed in this range.</div>
      </div>
    </>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */
export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const [tab, setTab] = useState('invoices');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await getInvoices();
      setInvoices(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const totals = useMemo(() => {
    const by = (pred) => invoices.filter(pred).reduce((s, i) => s + parseFloat(i.total_amount || 0), 0);
    const st = (i) => String(i.status || 'DRAFT').toUpperCase();
    return {
      outstanding: by((i) => ['SENT', 'OVERDUE'].includes(st(i))),
      paid: by((i) => st(i) === 'PAID'),
      draftCount: invoices.filter((i) => st(i) === 'DRAFT').length,
      overdueCount: invoices.filter((i) => st(i) === 'OVERDUE').length,
    };
  }, [invoices]);

  const filtered = statusFilter === 'all'
    ? invoices
    : invoices.filter((i) => String(i.status || 'DRAFT').toUpperCase() === statusFilter);

  const handleSend = async (inv) => {
    try { await sendInvoice(inv.id); await fetchInvoices(); }
    catch (err) { alert('Send failed: ' + err.message); }
  };
  const handleMarkPaid = async (inv) => {
    try { await markInvoicePaid(inv.id); await fetchInvoices(); }
    catch (err) { alert(err.message); }
  };
  const handleDelete = async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_number}? Billed time entries become billable again.`)) return;
    try { await deleteInvoice(inv.id); await fetchInvoices(); }
    catch (err) { alert(err.message); }
  };

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h2>Invoices</h2>
          <p>Create invoices from tracked time, preview, send, and report on revenue</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Invoice
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#2563eb' }}><Send size={20} /></div>
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">{money(totals.outstanding)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#16a34a' }}><DollarSign size={20} /></div>
          <div className="stat-label">Paid</div>
          <div className="stat-value">{money(totals.paid)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#6b7280' }}><FileText size={20} /></div>
          <div className="stat-label">Drafts</div>
          <div className="stat-value">{totals.draftCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#dc2626' }}><AlertCircle size={20} /></div>
          <div className="stat-label">Overdue</div>
          <div className="stat-value">{totals.overdueCount}</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'invoices' ? 'active' : ''}`} onClick={() => setTab('invoices')}>
          <FileText size={14} style={{ verticalAlign: 'text-top', marginRight: 4 }} />Invoices
        </button>
        <button className={`tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>
          <BarChart3 size={14} style={{ verticalAlign: 'text-top', marginRight: 4 }} />Reports
        </button>
      </div>

      {tab === 'reports' ? (
        <ReportsView />
      ) : loading ? (
        <div className="loading-spinner">Loading invoices…</div>
      ) : error ? (
        <div className="empty-state"><AlertCircle size={32} /> {error}</div>
      ) : (
        <>
          <div className="flex gap-2" style={{ margin: '12px 0', flexWrap: 'wrap' }}>
            {['all', 'DRAFT', 'SENT', 'PAID', 'OVERDUE'].map((s) => (
              <button key={s}
                className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setStatusFilter(s)}>
                {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">No invoices{statusFilter !== 'all' ? ' with this status' : ' yet. Create your first one!'}</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th><th>Client</th><th>Due</th><th>Hours</th>
                  <th>Amount</th><th>Status</th><th>Created</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const st = String(inv.status || 'DRAFT').toUpperCase();
                  return (
                    <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setPreviewId(inv.id)} title="Click to preview">
                      <td style={{ fontWeight: 600 }}>{inv.invoice_number || `#${inv.id}`}</td>
                      <td>{inv.client_name || '—'}</td>
                      <td className="text-sm">{dateFmt(inv.due_date)}</td>
                      <td>{parseFloat(inv.total_hours || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>{money(inv.total_amount)}</td>
                      <td><StatusBadge status={st} /></td>
                      <td className="text-sm text-muted">{dateFmt(inv.created_at)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); setPreviewId(inv.id); }} title="Preview">
                            <Eye size={12} />
                          </button>
                          {st === 'DRAFT' && (
                            <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleSend(inv); }} title="Send to client">
                              <Send size={12} />
                            </button>
                          )}
                          {['SENT', 'OVERDUE'].includes(st) && (
                            <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleMarkPaid(inv); }} title="Mark paid">
                              <CheckCircle size={12} />
                            </button>
                          )}
                          <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); handleDelete(inv); }} title="Delete">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} onCreated={fetchInvoices} />}
      {previewId && <InvoicePreviewModal invoiceId={previewId} onClose={() => { setPreviewId(null); fetchInvoices(); }} onChanged={fetchInvoices} />}
    </>
  );
}
