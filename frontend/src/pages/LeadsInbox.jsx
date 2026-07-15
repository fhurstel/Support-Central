import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Mail,
  Phone,
  MessageSquare,
  CheckCircle,
  XCircle,
  Eye,
  X,
  AlertCircle,
} from 'lucide-react';
import { getLeads, reviewLead, getClients, createTicket } from '../services/api';

const STATUS_TABS = ['all', 'NEW', 'reviewing', 'approved', 'denied'];

const SOURCE_ICONS = {
  email: Mail,
  phone: Phone,
  form: MessageSquare,
};

function LeadModal({ lead, onClose, clients, onApproved }) {
  const [denyReason, setDenyReason] = useState('');
  const [showDeny, setShowDeny] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [ticketTitle, setTicketTitle] = useState(lead?.subject || '');
  const [submitting, setSubmitting] = useState(false);

  if (!lead) return null;

  const handleDeny = async () => {
    if (!denyReason.trim()) return;
    setSubmitting(true);
    try {
      await reviewLead(lead.id, { action: 'deny', denial_reason: denyReason });
      onApproved();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedClientId) return;
    setSubmitting(true);
    try {
      await reviewLead(lead.id, {
        action: 'approve',
        client_id: parseInt(selectedClientId),
        title: ticketTitle,
      });
      onApproved();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{lead.subject || 'Lead Details'}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="mb-4">
          <div className="flex gap-4 text-sm text-muted mb-2">
            <span>From: {lead.sender_name || lead.sender_email}</span>
            <span>Source: {lead.source}</span>
            <span>{new Date(lead.created_at).toLocaleString()}</span>
          </div>
          <span className={`badge badge-${lead.status}`}>{lead.status}</span>
        </div>

        <div
          style={{
            background: '#f8f9fa',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            whiteSpace: 'pre-wrap',
            fontSize: 14,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {lead.body || lead.content || 'No content'}
        </div>

        {lead.status === 'NEW' && (
          <div className="flex gap-2">
            {!showApprove && !showDeny && (
              <>
                <button className="btn btn-success" onClick={() => setShowApprove(true)}>
                  <CheckCircle size={16} /> Approve
                </button>
                <button className="btn btn-danger" onClick={() => setShowDeny(true)}>
                  <XCircle size={16} /> Deny
                </button>
              </>
            )}

            {showApprove && (
              <div className="w-full">
                <div className="form-group">
                  <label>Select Client</label>
                  <select
                    className="form-control"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                  >
                    <option value="">-- Choose client --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.company || 'No company'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Ticket Title</label>
                  <input
                    className="form-control"
                    value={ticketTitle}
                    onChange={(e) => setTicketTitle(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-success"
                    onClick={handleApprove}
                    disabled={submitting || !selectedClientId}
                  >
                    Confirm Approve
                  </button>
                  <button className="btn btn-outline" onClick={() => setShowApprove(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showDeny && (
              <div className="w-full">
                <div className="form-group">
                  <label>Denial Reason</label>
                  <textarea
                    className="form-control"
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="Reason for denying this lead…"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-danger"
                    onClick={handleDeny}
                    disabled={submitting || !denyReason.trim()}
                  >
                    Confirm Deny
                  </button>
                  <button className="btn btn-outline" onClick={() => setShowDeny(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeadsInbox() {
  const [searchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [activeTab, setActiveTab] = useState('NEW');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);

  const fetchLeads = useCallback(async () => {
    try {
      const params = activeTab !== 'all' ? { status: activeTab } : {};
      const data = await getLeads(params);
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeTab]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [clientsData] = await Promise.all([getClients()]);
        setClients(Array.isArray(clientsData) ? clientsData : []);
      } catch (err) {
        setError(err.message);
      }
      await fetchLeads();
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!loading) fetchLeads();
  }, [activeTab, fetchLeads, loading]);

  // Auto-open lead modal when navigated from Dashboard with ?leadId=xxx
  useEffect(() => {
    const leadId = searchParams.get('leadId');
    if (leadId && leads.length > 0) {
      const found = leads.find((l) => String(l.id) === leadId);
      if (found) {
        setSelectedLead(found);
      }
    }
  }, [searchParams, leads]);

  // Also try auto-opening while still loading — fetch all leads if needed
  useEffect(() => {
    const leadId = searchParams.get('leadId');
    if (leadId && loading) {
      // Fetch all leads so we can find the one we need
      getLeads({}).then((data) => {
        const allLeads = Array.isArray(data) ? data : [];
        const found = allLeads.find((l) => String(l.id) === leadId);
        if (found) setSelectedLead(found);
      }).catch(() => {});
    }
  }, [searchParams, loading]);

  const filteredLeads = activeTab === 'all' ? leads : leads.filter((l) => l.status === activeTab);

  return (
    <>
      <div className="page-header">
        <h2>Leads Inbox</h2>
        <p>Review and manage incoming service requests</p>
      </div>

      <div className="tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-spinner">Loading leads…</div>
      ) : error ? (
        <div className="empty-state">
          <AlertCircle size={32} /> {error}
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="empty-state">No leads found for this filter.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Sender</th>
              <th>Subject</th>
              <th>Date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => {
              const Icon = SOURCE_ICONS[lead.source] || Mail;
              return (
                <tr key={lead.id}>
                  <td>
                    <Icon size={16} style={{ verticalAlign: 'middle' }} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{lead.sender_name || 'Unknown'}</div>
                    <div className="text-xs text-muted">{lead.sender_email}</div>
                  </td>
                  <td>{lead.subject || '(No subject)'}</td>
                  <td className="text-sm text-muted">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <span className={`badge badge-${lead.status}`}>{lead.status}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <Eye size={14} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          clients={clients}
          onClose={() => setSelectedLead(null)}
          onApproved={fetchLeads}
        />
      )}
    </>
  );
}
