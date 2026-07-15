import React, { useEffect, useState, useCallback } from 'react';
import { Plus, X, Edit, AlertCircle, UserCheck, UserX } from 'lucide-react';
import { getClients, getClient, createClient, updateClient, getClientMembers, createClientMember, updateClientMember, deleteClientMember } from '../services/api';

function ClientModal({ client, onClose, onSaved }) {
  const isEditing = !!client;
  const [form, setForm] = useState(
    client || {
      name: '',
      company: '',
      email: '',
      phone: '',
      client_type: 'MANAGED',
      hourly_rate: '75.00',
      is_active: true,
    }
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        hourly_rate: parseFloat(form.hourly_rate) || 0,
      };
      if (isEditing) {
        await updateClient(client.id, payload);
      } else {
        await createClient(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? 'Edit Client' : 'Add Client'}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="two-col">
            <div className="form-group">
              <label>Name *</label>
              <input
                className="form-control"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Client or contact name"
              />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input
                className="form-control"
                value={form.company || ''}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Company name"
              />
            </div>
          </div>
          <div className="two-col">
            <div className="form-group">
              <label>Email</label>
              <input
                className="form-control"
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input
                className="form-control"
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
          <div className="two-col">
            <div className="form-group">
              <label>Type</label>
              <select
                className="form-control"
                value={form.client_type}
                onChange={(e) => setForm({ ...form, client_type: e.target.value })}
              >
                <option value="MANAGED">Managed</option>
                <option value="TEMP">Temp</option>
              </select>
            </div>
            <div className="form-group">
              <label>Hourly Rate ($)</label>
              <input
                className="form-control"
                type="number"
                step="0.01"
                min="0"
                value={form.hourly_rate}
                onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : isEditing ? 'Update Client' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [activeOnly, setActiveOnly] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      const data = await getClients();
      setClients(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleEdit = (client) => {
    setEditingClient(client);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingClient(null);
  };

  const filtered = activeOnly ? clients.filter((c) => c.is_active) : clients;

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h2>Clients</h2>
          <p>Manage client accounts</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingClient(null); setShowModal(true); }}>
          <Plus size={16} /> Add Client
        </button>
      </div>

      <div className="filters-bar">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Active only
        </label>
      </div>

      {loading ? (
        <div className="loading-spinner">Loading clients…</div>
      ) : error ? (
        <div className="empty-state">
          <AlertCircle size={32} /> {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No clients found.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Hourly Rate</th>
              <th>Status</th>
              <th>Contacts</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr key={client.id}>
                <td style={{ fontWeight: 600 }}>{client.name}</td>
                <td>{client.company || '—'}</td>
                <td>{client.email || '—'}</td>
                <td>{client.phone || '—'}</td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background: client.client_type === 'MANAGED' ? '#dbeafe' : '#fef3c7',
                      color: client.client_type === 'MANAGED' ? '#2563eb' : '#d97706',
                    }}
                  >
                    {client.client_type}
                  </span>
                </td>
                <td>${parseFloat(client.hourly_rate || 0).toFixed(2)}</td>
                <td>
                  {client.is_active ? (
                    <span className="flex items-center gap-1">
                      <UserCheck size={14} color="#16a34a" /> Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <UserX size={14} color="#dc2626" /> Inactive
                    </span>
                  )}
                </td>
                <td>
                  <ClientMembersCell clientId={client.id} />
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => handleEdit(client)}
                    title="Edit client"
                  >
                    <Edit size={14} /> Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <ClientModal
          client={editingClient}
          onClose={handleCloseModal}
          onSaved={fetchClients}
        />
      )}
    </>
  );
}

// ── Client Members Cell ──────────────────────────────────────────────────────

function ClientMembersCell({ clientId }) {
  const [members, setMembers] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getClientMembers(clientId);
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      setMembers([]);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const count = members.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {count > 0 && (
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: '#e0e7ff', color: '#4338ca' }}>
          {count}
        </span>
      )}
      <button
        className="btn btn-sm btn-outline"
        onClick={() => setShowModal(true)}
        title="Manage client contacts & members"
      >
        {count > 0 ? <><Edit size={12} /> Edit</> : <><Plus size={12} /> Add Members</>}
      </button>
      {showModal && (
        <ClientMembersModal
          clientId={clientId}
          members={members}
          onClose={() => setShowModal(false)}
          onUpdate={load}
        />
      )}
    </div>
  );
}

// ── Client Members Modal ─────────────────────────────────────────────────────

function ClientMembersModal({ clientId, members, onClose, onUpdate }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', personal_phone: '', role: '', is_primary: false });
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setForm({ name: '', email: '', phone: '', personal_phone: '', role: '', is_primary: false });
    setShowAdd(false);
    setEditingId(null);
  };

  const startEdit = (m) => {
    setForm({
      name: m.name || '',
      email: m.email || '',
      phone: m.phone || '',
      personal_phone: m.personal_phone || '',
      role: m.role || '',
      is_primary: m.is_primary || false,
    });
    setEditingId(m.id);
    setShowAdd(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await createClientMember(clientId, form);
      resetForm();
      onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !editingId) return;
    setSaving(true);
    try {
      await updateClientMember(clientId, editingId, form);
      resetForm();
      onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (memberId) => {
    if (!window.confirm('Remove this member?')) return;
    try {
      await deleteClientMember(clientId, memberId);
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const inputStyle = { background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '100%', background: '#fff', borderRadius: 12, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ borderBottom: '1px solid #e5e7eb', padding: '16px 20px', borderRadius: '12px 12px 0 0' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>👥 Client Contacts ({members.length})</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {members.length === 0 && !showAdd && !editingId ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
              <p>Add contacts for this client. You can assign tickets to specific people here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map((m) => (
                <div key={m.id}>
                  {editingId === m.id ? (
                    <form onSubmit={handleEdit} style={{ padding: 16, background: '#eef2ff', borderRadius: 10, border: '2px solid #818cf8' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#4338ca', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Edit size={14} /> Editing: {m.name}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                        <div><label style={labelStyle}>Full name *</label><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                        <div><label style={labelStyle}>Role</label><input style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. IT Manager" /></div>
                        <div><label style={labelStyle}>Email</label><input style={{...inputStyle}} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                        <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                        <div><label style={labelStyle}>Personal Phone</label><input style={inputStyle} value={form.personal_phone} onChange={(e) => setForm({ ...form, personal_phone: e.target.value })} /></div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} style={{ width: 16, height: 16 }} />
                            Primary contact
                          </label>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ padding: '6px 16px' }}>
                          {saving ? 'Saving…' : '✓ Save Changes'}
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={resetForm} style={{ padding: '6px 16px' }}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 16, background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#4338ca' }}>
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {m.name} {m.is_primary && <span className="badge badge-NEW" style={{ fontSize: 9, padding: '1px 6px', marginLeft: 4 }}>Primary</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                          {m.email && <span style={{ fontSize: 11, color: '#6b7280' }}>✉ {m.email}</span>}
                          {m.phone && <span style={{ fontSize: 11, color: '#6b7280' }}>📞 {m.phone}</span>}
                          {m.role && <span style={{ fontSize: 11, color: '#9ca3af' }}>👤 {m.role}</span>}
                        </div>
                      </div>
                      <button onClick={() => startEdit(m)} title="Edit contact" style={{ padding: '5px 12px', background: '#fff', border: '1px solid #6366f1', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#6366f1', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Edit size={12} /> Edit
                      </button>
                      <button onClick={() => handleDelete(m.id)} title="Remove" style={{ padding: '5px 10px', background: '#fff', border: '1px solid #dc2626', borderRadius: 6, color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAdd ? (
            <form onSubmit={handleAdd} style={{ marginTop: 12, padding: 16, background: '#f0f9ff', borderRadius: 10, border: '1px solid #bae6fd' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div><label style={labelStyle}>Full name *</label><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div><label style={labelStyle}>Role</label><input style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. IT Manager" /></div>
                <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><label style={labelStyle}>Personal Phone</label><input style={inputStyle} value={form.personal_phone} onChange={(e) => setForm({ ...form, personal_phone: e.target.value })} /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} style={{ width: 16, height: 16 }} />
                Primary contact
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ padding: '6px 16px' }}>
                  {saving ? 'Adding…' : <><Plus size={14} /> Add Contact</>}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={resetForm} style={{ padding: '6px 16px' }}>Cancel</button>
              </div>
            </form>
          ) : !editingId && (
            <button className="btn btn-outline btn-sm" style={{ marginTop: 12, width: '100%', padding: '8px' }} onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Add Contact
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
