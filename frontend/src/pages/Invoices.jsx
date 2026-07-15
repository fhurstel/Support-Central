import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Send, AlertCircle, DollarSign, Eye } from 'lucide-react';
import { getClients, getTickets, getInvoices, getInvoice, createInvoice, sendInvoice } from '../services/api';

function InvoiceDetailModal({ invoiceId, onClose }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetch() {
      try {
        const data = await getInvoice(invoiceId);
        setInvoice(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [invoiceId]);

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="loading-spinner">Loading invoice…</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Error</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="empty-state"><AlertCircle size={32} /> {error}</div>
      </div>
    </div>
  );

  if (!invoice) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Invoice #{invoice.invoice_number || invoice.id}</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="text-sm text-muted">Client</label>
              <div style={{ fontWeight: 600 }}>{invoice.client_name || '—'}</div>
              {invoice.client?.email && <div className="text-sm text-muted">{invoice.client.email}</div>}
              {invoice.client?.company && <div className="text-sm text-muted">{invoice.client.company}</div>}
            </div>
            <div>
              <label className="text-sm text-muted">Status</label>
              <div>
                <span className="badge" style={{
                  background: invoice.status === 'paid' ? '#dcfce7' : invoice.status === 'sent' ? '#dbeafe' : '#f0f0f0',
                  color: invoice.status === 'paid' ? '#16a34a' : invoice.status === 'sent' ? '#2563eb' : '#555',
                }}>
                  {invoice.status || 'draft'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="text-sm text-muted">Period</label>
          <div>
            {invoice.period_start ? new Date(invoice.period_start).toLocaleDateString() : '—'}
            {' → '}
            {invoice.period_end ? new Date(invoice.period_end).toLocaleDateString() : '—'}
          </div>
          {invoice.ticket_id && <div className="text-sm text-muted">Ticket #{invoice.ticket_id}</div>}
        </div>

        <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="text-sm">Hours</span>
            <span>{parseFloat(invoice.total_hours || 0).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="text-sm">Rate</span>
            <span>${parseFloat(invoice.hourly_rate || 0).toFixed(2)}/hr</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, paddingTop: 8, borderTop: '2px solid #ddd' }}>
            <span>Total</span>
            <span>${parseFloat(invoice.total_amount || 0).toFixed(2)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div style={{ marginBottom: 16 }}>
            <label className="text-sm text-muted">Notes</label>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '4px 0 0', fontFamily: 'inherit' }}>{invoice.notes}</pre>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="text-sm text-muted">
            Created: {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : '—'}
            {invoice.sent_at && ` · Sent: ${new Date(invoice.sent_at).toLocaleDateString()}`}
            {invoice.paid_at && ` · Paid: ${new Date(invoice.paid_at).toLocaleDateString()}`}
          </div>
          {invoice.status === 'draft' && (
            <button className="btn btn-success" onClick={async () => {
              try {
                await sendInvoice(invoice.id);
                const updated = await getInvoice(invoice.id);
                setInvoice(updated);
              } catch (err) {
                alert('Send failed: ' + err.message);
              }
            }}>
              <Send size={14} /> Send to Client
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateInvoiceModal({ onClose, onCreated }) {
  const [clients, setClients] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  const selectedClient = clients.find((c) => c.id === parseInt(selectedClientId));
  const isTemp = selectedClient?.client_type === 'TEMP';

  useEffect(() => {
    async function fetch() {
      try {
        const [clientsData, ticketsData] = await Promise.all([
          getClients(),
          getTickets(),
        ]);
        setClients(Array.isArray(clientsData) ? clientsData : []);
        setTickets(Array.isArray(ticketsData) ? ticketsData : []);
      } catch (err) {
        console.error(err);
      }
    }
    fetch();
  }, []);

  const handlePreview = () => {
    if (!selectedClient) return;

    let hours = 0;
    let amount = 0;

    if (isTemp && selectedTicketId) {
      const ticket = tickets.find((t) => t.id === parseInt(selectedTicketId));
      if (ticket) {
        hours = parseFloat(ticket.total_hours || ticket.total_time || 0);
      }
    }

    const rate = parseFloat(selectedClient.hourly_rate || 0);
    amount = hours * rate;

    setPreview({ hours, rate, amount });
  };

  const handleCreate = async () => {
    if (!selectedClient) return;
    setSaving(true);
    try {
      const data = {
        client_id: parseInt(selectedClientId),
        notes,
      };
      if (isTemp && selectedTicketId) {
        data.ticket_id = parseInt(selectedTicketId);
      } else {
        data.period_start = startDate || undefined;
        data.period_end = endDate || undefined;
      }

      await createInvoice(data);
      onCreated();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const clientTickets = tickets.filter(
    (t) => t.client_id === parseInt(selectedClientId) && !['CLOSED', 'COMPLETED'].includes(t.status)
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Invoice</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="form-group">
          <label>Client *</label>
          <select
            className="form-control"
            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              setSelectedTicketId('');
              setPreview(null);
            }}
          >
            <option value="">-- Select client --</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.client_type}) — ${c.hourly_rate}/hr
              </option>
            ))}
          </select>
        </div>

        {selectedClient && (
          <>
            {isTemp ? (
              <div className="form-group">
                <label>Ticket *</label>
                <select
                  className="form-control"
                  value={selectedTicketId}
                  onChange={(e) => {
                    setSelectedTicketId(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="">-- Select ticket --</option>
                  {clientTickets.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.id} {t.title} ({t.total_time || '0h'})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="two-col">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    className="form-control"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPreview(null);
                    }}
                  />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input
                    className="form-control"
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPreview(null);
                    }}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Notes</label>
              <textarea
                className="form-control"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Invoice notes…"
              />
            </div>

            {!preview && (
              <button
                className="btn btn-outline w-full mb-4"
                onClick={handlePreview}
                disabled={isTemp && !selectedTicketId}
              >
                <DollarSign size={16} /> Preview Invoice
              </button>
            )}

            {preview && (
              <div
                style={{
                  background: '#f8f9fa',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div className="text-sm" style={{ fontWeight: 600, marginBottom: 8 }}>
                  Invoice Preview
                </div>
                <div className="flex justify-between text-sm">
                  <span>Hours:</span>
                  <span>{preview.hours.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Rate:</span>
                  <span>${preview.rate.toFixed(2)}/hr</span>
                </div>
                <div
                  className="flex justify-between"
                  style={{ fontWeight: 700, fontSize: 18, marginTop: 8, paddingTop: 8, borderTop: '2px solid #ddd' }}
                >
                  <span>Total:</span>
                  <span>${preview.amount.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button className="btn btn-outline" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={saving || !selectedClient}
              >
                {saving ? 'Creating…' : 'Create Invoice'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await getInvoices();
      setInvoices(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSend = async (inv) => {
    try {
      const result = await sendInvoice(inv.id);
      await fetchInvoices();
      if (result && result.email_sent === false) {
        alert('Invoice marked as sent, but email could not be delivered. Check SMTP configuration.');
      }
    } catch (err) {
      alert('Send failed: ' + err.message);
    }
  };

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h2>Invoices</h2>
          <p>Create and manage client invoices</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner">Loading invoices…</div>
      ) : error ? (
        <div className="empty-state">
          <AlertCircle size={32} /> {error}
        </div>
      ) : invoices.length === 0 ? (
        <div className="empty-state">No invoices yet. Create your first one!</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Client</th>
              <th>Period</th>
              <th>Hours</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr
                key={inv.id}
                style={{ cursor: 'pointer' }}
                onDoubleClick={() => setSelectedInvoiceId(inv.id)}
                onClick={() => setSelectedInvoiceId(inv.id)}
                title="Click to view details"
              >
                <td style={{ fontWeight: 600 }}>#{inv.invoice_number || inv.id}</td>
                <td>{inv.client_name || '—'}</td>
                <td className="text-sm">
                  {inv.period_start || inv.ticket_id
                    ? `${inv.period_start ? new Date(inv.period_start).toLocaleDateString() : `Ticket #${inv.ticket_id}`} — ${inv.period_end ? new Date(inv.period_end).toLocaleDateString() : 'N/A'}`
                    : '—'}
                </td>
                <td>{parseFloat(inv.total_hours || 0).toFixed(2)}</td>
                <td>${parseFloat(inv.hourly_rate || 0).toFixed(2)}</td>
                <td style={{ fontWeight: 600 }}>${parseFloat(inv.total_amount || 0).toFixed(2)}</td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background:
                        inv.status === 'paid'
                          ? '#dcfce7'
                          : inv.status === 'sent'
                          ? '#dbeafe'
                          : '#f0f0f0',
                      color:
                        inv.status === 'paid'
                          ? '#16a34a'
                          : inv.status === 'sent'
                          ? '#2563eb'
                          : '#555',
                    }}
                  >
                    {inv.status || 'draft'}
                  </span>
                </td>
                <td className="text-sm text-muted">
                  {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={(e) => { e.stopPropagation(); setSelectedInvoiceId(inv.id); }}
                      title="View invoice"
                    >
                      <Eye size={12} /> View
                    </button>
                    {inv.status === 'draft' && (
                      <button
                        className="btn btn-sm btn-success"
                        onClick={(e) => { e.stopPropagation(); handleSend(inv); }}
                        title="Send invoice to client"
                      >
                        <Send size={12} /> Send
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      )}

      {showModal && (
        <CreateInvoiceModal
          onClose={() => setShowModal(false)}
          onCreated={fetchInvoices}
        />
      )}

      {selectedInvoiceId && (
        <InvoiceDetailModal
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
        />
      )}
    </>
  );
}
