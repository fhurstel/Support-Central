import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Edit, Trash2, Shield, Wrench, Eye } from 'lucide-react';

const ROLE_ICONS = { admin: Shield, technician: Wrench, guest: Eye };
const ROLE_COLORS = { admin: '#dc2626', technician: '#2563eb', guest: '#6b7280' };

function UserModal({ user, onClose, onSaved, apiFetch }) {
  const [form, setForm] = useState(
    user
      ? { name: user.name, email: user.email, password: '', role: user.role }
      : { name: '', email: '', password: '', role: 'TECHNICIAN' }
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      if (user) {
        await apiFetch(`/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify(form),
        });
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
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{user ? 'Edit User' : 'Add User'}</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input className="form-control" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Password {user ? '(leave blank to keep current)' : '*'}</label>
            <input className="form-control" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={user ? '••••••••' : ''} />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select className="form-control" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="ADMIN">Admin</option>
              <option value="TECHNICIAN">Technician</option>
              <option value="GUEST">Guest</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : user ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const { apiFetch } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsers = async () => {
    try {
      const data = await apiFetch('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async (userId) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      await apiFetch(`/users/${userId}`, { method: 'DELETE' });
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h2>User Management</h2>
          <p>Manage team members and their access levels</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingUser(null); setShowModal(true); }}>
          <Plus size={16} /> Add User
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner">Loading users…</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const RoleIcon = ROLE_ICONS[u.role] || Wrench;
              return (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <RoleIcon size={14} color={ROLE_COLORS[u.role]} />
                      <span className="badge" style={{
                        background: u.role === 'ADMIN' ? '#fee2e2' : u.role === 'TECHNICIAN' ? '#dbeafe' : '#f0f0f0',
                        color: ROLE_COLORS[u.role],
                      }}>{u.role}</span>
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-done' : 'badge-closed'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-sm text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-outline btn-sm" onClick={() => { setEditingUser(u); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626' }} onClick={() => handleDelete(u.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showModal && (
        <UserModal
          user={editingUser}
          onClose={() => setShowModal(false)}
          onSaved={fetchUsers}
          apiFetch={apiFetch}
        />
      )}
    </>
  );
}
