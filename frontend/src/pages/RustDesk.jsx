import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = '/api';

function formatDuration(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDateTime(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleString();
}

export default function RustDesk() {
  const { apiFetch, isTech, user, token } = useAuth();

  // Data
  const [devices, setDevices] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [clients, setClients] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [config, setConfig] = useState(null);

  // UI state
  const [activeTab, setActiveTab] = useState('devices');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [isLaunching, setIsLaunching] = useState(false);

  // Device form
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [deviceForm, setDeviceForm] = useState({
    device_id: '', alias: '', hostname: '', os: '', cpu: '', client_id: '',
    connection_password: '',
  });

  // Session form
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    device_id: '', client_id: '', ticket_id: '', notes: '',
  });
  const [linkingSession, setLinkingSession] = useState(null);
  const [linkTicketId, setLinkTicketId] = useState('');

  // New ticket form (for creating ticket from session)
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [newTicket, setNewTicket] = useState({
    title: '', description: '', priority: 'MEDIUM', client_id: '',
  });

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [devs, sess, clis, tix, cfg] = await Promise.all([
        apiFetch('/rustdesk/devices').catch(() => []),
        apiFetch('/rustdesk/sessions?active_only=true').catch(() => []),
        apiFetch('/clients').catch(() => []),
        apiFetch('/tickets').catch(() => []),
        apiFetch('/rustdesk/config').catch(() => null),
      ]);
      setDevices(devs || []);
      setSessions(sess || []);
      setClients(clis || []);
      setTickets(tix || []);
      setConfig(cfg);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 15s for live status
  useEffect(() => {
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── Device CRUD ──

  const openDeviceForm = (device = null) => {
    if (device) {
      setEditingDevice(device);
      setDeviceForm({
        device_id: device.device_id || '',
        alias: device.alias || '',
        hostname: device.hostname || '',
        os: device.os || '',
        cpu: device.cpu || '',
        client_id: device.client_id || '',
        connection_password: device.connection_password || '',
      });
    } else {
      setEditingDevice(null);
      setDeviceForm({ device_id: '', alias: '', hostname: '', os: '', cpu: '', client_id: '', connection_password: '' });
    }
    setShowDeviceForm(true);
  };

  const saveDevice = async () => {
    if (!deviceForm.device_id || !deviceForm.client_id) {
      setError('Device ID and Client are required');
      return;
    }
    try {
      if (editingDevice) {
        await apiFetch(`/rustdesk/devices/${editingDevice.id}`, {
          method: 'PUT',
          body: JSON.stringify(deviceForm),
        });
        showSuccess('Device updated');
      } else {
        await apiFetch('/rustdesk/devices', {
          method: 'POST',
          body: JSON.stringify(deviceForm),
        });
        showSuccess('Device registered');
      }
      setShowDeviceForm(false);
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const removeDevice = async (id) => {
    if (!window.confirm('Remove this device?')) return;
    try {
      await apiFetch(`/rustdesk/devices/${id}`, { method: 'DELETE' });
      showSuccess('Device removed');
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  // ── Session Management ──

  const startSession = async () => {
    if (!sessionForm.device_id || !sessionForm.client_id) {
      setError('Device and Client are required');
      return;
    }
    try {
      const payload = {
        device_id: parseInt(sessionForm.device_id),
        client_id: parseInt(sessionForm.client_id),
        notes: sessionForm.notes || '',
      };
      if (sessionForm.ticket_id) {
        payload.ticket_id = parseInt(sessionForm.ticket_id);
      }
      await apiFetch('/rustdesk/sessions/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showSuccess('Remote session started');
      setShowSessionForm(false);
      setSessionForm({ device_id: '', client_id: '', ticket_id: '', notes: '' });
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const stopSession = async (sessionId) => {
    try {
      await apiFetch(`/rustdesk/sessions/${sessionId}/stop`, { method: 'POST' });
      showSuccess('Session stopped');
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const linkSessionToTicket = async (sessionId) => {
    if (!linkTicketId) return;
    try {
      await apiFetch(`/rustdesk/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ticket_id: parseInt(linkTicketId) }),
      });
      showSuccess('Session linked to ticket');
      setLinkingSession(null);
      setLinkTicketId('');
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const createTicketAndLink = async (sessionId) => {
    if (!newTicket.title || !newTicket.client_id) {
      setError('Title and Client are required');
      return;
    }
    try {
      const ticket = await apiFetch('/tickets', {
        method: 'POST',
        body: JSON.stringify(newTicket),
      });
      await apiFetch(`/rustdesk/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ticket_id: ticket.id }),
      });
      showSuccess(`Ticket ${ticket.ticket_number} created and linked`);
      setShowNewTicketForm(false);
      setNewTicket({ title: '', description: '', priority: 'MEDIUM', client_id: '' });
      setLinkingSession(null);
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const writeRustDeskLoading = (popup, message) => {
    if (!popup || popup.closed) return;
    const safeMessage = String(message || 'Opening RustDesk…')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    try {
      popup.document.open();
      popup.document.write(`<!doctype html>
        <html>
          <head>
            <title>Opening RustDesk</title>
            <meta charset="utf-8" />
            <style>
              body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
              .card { max-width: 760px; margin: 40px auto; background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 24px; box-shadow: 0 8px 24px rgba(15,23,42,0.08); }
              h1 { margin-top: 0; font-size: 1.4rem; }
              pre { white-space: pre-wrap; word-break: break-word; background: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #cbd5e1; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Opening RustDesk…</h1>
              <p>Please wait while the web client loads.</p>
              <pre>${safeMessage}</pre>
            </div>
          </body>
        </html>`);
      popup.document.close();
    } catch {
      // ignore popup write failures; the main page error banner still surfaces the issue
    }
  };

  const writeRustDeskError = (popup, message) => {
    if (!popup || popup.closed) return;
    const safeMessage = String(message || 'Unknown error')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    try {
      popup.document.open();
      popup.document.write(`<!doctype html>
        <html>
          <head>
            <title>RustDesk launch failed</title>
            <meta charset="utf-8" />
            <style>
              body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #fff5f5; color: #7f1d1d; }
              .card { max-width: 760px; margin: 40px auto; background: white; border: 1px solid #fecaca; border-radius: 12px; padding: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
              h1 { margin-top: 0; font-size: 1.4rem; }
              pre { white-space: pre-wrap; word-break: break-word; background: #fef2f2; padding: 16px; border-radius: 8px; border: 1px solid #fecaca; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>RustDesk failed to open</h1>
              <p>The remote desktop client could not be launched.</p>
              <pre>${safeMessage}</pre>
            </div>
          </body>
        </html>`);
      popup.document.close();
    } catch {
      // ignore popup write failures; the main page error banner still surfaces the issue
    }
  };

  const launchRustDesk = async (device) => {
    if (isLaunching) return;
    if (!config) {
      setError('RustDesk server configuration not available. Please contact your administrator.');
      return;
    }

    // Check if device is online
    if (device.is_online === false) {
      const proceed = window.confirm(
        `Device "${device.alias || device.device_id}" appears to be offline.\n\n` +
        `The remote desktop session may not connect.\n\n` +
        'Do you want to try anyway?'
      );
      if (!proceed) return;
    }

    if (!token) {
      window.location.href = '/login?next=/rustdesk';
      return;
    }

    const popup = window.open('', '_blank');
    if (!popup) {
      setError('Pop-up blocked! Please allow pop-ups for this site to open the remote desktop client.');
      return;
    }
    writeRustDeskLoading(popup, 'Preparing secure RustDesk launch…');

    setIsLaunching(true);
    try {
      const launch = await apiFetch('/rustdesk/web-client-launch-token', { method: 'POST' });
      const params = new URLSearchParams({
        launch_token: launch.launch_token,
        id: device.device_id,
      });
      if (device.connection_password) {
        params.set('password', device.connection_password);
      }
      popup.location.replace(`/api/rustdesk/web-client?${params.toString()}`);
    } catch (err) {
      const message = err?.message || 'Failed to create RustDesk launch token';
      setError(message);
      writeRustDeskError(popup, message);
    } finally {
      window.setTimeout(() => setIsLaunching(false), 1000);
    }
  };

  // ── Render ──

  if (loading && !devices.length) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>🖥️ Remote Desktop</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={loadData}>↻ Refresh</button>
          {isTech && (
            <button className="btn btn-primary" onClick={() => openDeviceForm()}>+ Add Device</button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error" onClick={() => setError(null)}>⚠ {error} <span style={{cursor:'pointer',float:'right'}}>✕</span></div>}
      {successMsg && <div className="alert alert-success">✓ {successMsg}</div>}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'devices' ? 'active' : ''}`} onClick={() => setActiveTab('devices')}>
          Devices ({devices.length})
        </button>
        <button className={`tab ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>
          Active Sessions ({sessions.length})
        </button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          Session History
        </button>
        {config && (
          <button className={`tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
            Server Config
          </button>
        )}
      </div>

      {/* ── Devices Tab ── */}
      {activeTab === 'devices' && (
        <div className="card">
          {devices.length === 0 ? (
            <div className="empty-state">
              <p>No devices registered yet.</p>
              {isTech && <button className="btn btn-primary" onClick={() => openDeviceForm()}>+ Add First Device</button>}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Device</th>
                  <th>Hostname</th>
                  <th>OS</th>
                  <th>Client</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.is_online === true && <span className="badge badge-success">● Online</span>}
                      {d.is_online === false && <span className="badge badge-danger">● Offline</span>}
                      {d.is_online === null && <span className="badge badge-warning">? Unknown</span>}
                    </td>
                    <td>
                      <strong>{d.alias || d.device_id}</strong>
                      <br /><small className="text-muted">{d.device_id}</small>
                    </td>
                    <td>{d.hostname || '—'}</td>
                    <td>{d.os || '—'}</td>
                    <td>{d.client_name || '—'}</td>
                    <td>{formatDateTime(d.last_seen)}</td>
                    <td>
                      <div className="btn-group">
                        <button
                          className={`btn btn-sm ${d.is_online === false ? 'btn-warning' : 'btn-primary'}`}
                          disabled={isLaunching}
                          onClick={() => launchRustDesk(d)}
                          title={d.is_online === false ? 'Device offline — click to try anyway' : 'Connect via browser'}
                        >
                          🖥️ Connect
                        </button>
                        {isTech && (
                          <>
                            <button className="btn btn-sm btn-secondary" onClick={() => openDeviceForm(d)} title="Edit">
                              ✏️
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => removeDevice(d.id)} title="Remove">
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Active Sessions Tab ── */}
      {activeTab === 'sessions' && (
        <div className="card">
          <div className="card-header">
            <h3>Active Remote Sessions</h3>
            {isTech && (
              <button className="btn btn-primary" onClick={() => setShowSessionForm(true)}>+ Start Session</button>
            )}
          </div>
          {sessions.length === 0 ? (
            <div className="empty-state">
              <p>No active remote sessions.</p>
              <p className="text-muted">Start a session from the Devices tab or click "Start Session".</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Client</th>
                  <th>Ticket</th>
                  <th>Technician</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.device_alias || s.device_id || '—'}</td>
                    <td>{s.client_name || '—'}</td>
                    <td>
                      {s.ticket_id ? (
                        <span className="badge badge-info">#{s.ticket_title || s.ticket_id}</span>
                      ) : (
                        <button className="btn btn-sm btn-secondary" onClick={() => { setLinkingSession(s.id); setShowNewTicketForm(false); }}>
                          + Link Ticket
                        </button>
                      )}
                      {linkingSession === s.id && (
                        <div style={{ marginTop: '8px' }}>
                          <select value={linkTicketId} onChange={(e) => setLinkTicketId(e.target.value)} style={{ marginRight: '4px' }}>
                            <option value="">Select ticket...</option>
                            {tickets.filter(t => t.status !== 'CLOSED' && t.status !== 'COMPLETED').map(t => (
                              <option key={t.id} value={t.id}>{t.ticket_number} — {t.title}</option>
                            ))}
                          </select>
                          <button className="btn btn-sm btn-primary" onClick={() => linkSessionToTicket(s.id)}>Link</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => setLinkingSession(null)}>Cancel</button>
                          <div style={{ marginTop: '4px' }}>
                            <button className="btn btn-sm btn-success" onClick={() => { setShowNewTicketForm(true); setLinkingSession(s.id); }}>
                              + Create New Ticket
                            </button>
                          </div>
                          {showNewTicketForm && linkingSession === s.id && (
                            <div style={{ marginTop: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                              <input placeholder="Ticket title" value={newTicket.title} onChange={(e) => setNewTicket({...newTicket, title: e.target.value})} style={{ width: '100%', marginBottom: '4px', padding: '4px' }} />
                              <textarea placeholder="Description" value={newTicket.description} onChange={(e) => setNewTicket({...newTicket, description: e.target.value})} style={{ width: '100%', marginBottom: '4px', padding: '4px' }} />
                              <select value={newTicket.client_id} onChange={(e) => setNewTicket({...newTicket, client_id: e.target.value})} style={{ marginRight: '4px' }}>
                                <option value="">Select client...</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              <select value={newTicket.priority} onChange={(e) => setNewTicket({...newTicket, priority: e.target.value})} style={{ marginRight: '4px' }}>
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="CRITICAL">Critical</option>
                              </select>
                              <button className="btn btn-sm btn-primary" onClick={() => createTicketAndLink(s.id)}>Create & Link</button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{s.technician_name || '—'}</td>
                    <td>{formatDateTime(s.started_at)}</td>
                    <td>
                      <span className="timer-badge">⏱ {formatDuration(s.duration_seconds || Math.floor((Date.now() - new Date(s.started_at)) / 1000))}</span>
                    </td>
                    <td>
                      {isTech && (
                        <button className="btn btn-sm btn-danger" onClick={() => stopSession(s.id)}>
                          ⏹ Stop
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Session History Tab ── */}
      {activeTab === 'history' && (
        <SessionHistory apiFetch={apiFetch} />
      )}

      {/* ── Server Config Tab ── */}
      {activeTab === 'config' && config && (
        <div className="card">
          <h3>RustDesk Server Configuration</h3>
          <p className="text-muted">Use these settings to configure RustDesk clients to connect to this server.</p>
          <div className="config-grid">
            <div className="config-item">
              <label>Server Host / IP</label>
              <code>{config.host}</code>
            </div>
            <div className="config-item">
              <label>ID/Relay Port</label>
              <code>{config.port}</code>
            </div>
            <div className="config-item">
              <label>Relay Port</label>
              <code>{config.relay_port || '21117'}</code>
            </div>
            <div className="config-item" style={{gridColumn: '1 / -1'}}>
              <label>Public Key</label>
              <code style={{wordBreak: 'break-all', fontSize: '0.8em'}}>{config.key || 'Not available'}</code>
            </div>
          </div>
          <div style={{marginTop: '16px', padding: '12px', background: '#e8f5e9', borderRadius: '4px'}}>
            <strong>📋 Client Setup Instructions:</strong>
            <ol style={{marginTop: '8px', paddingLeft: '20px'}}>
              <li>Download RustDesk client from <strong>rustdesk.com</strong></li>
              <li>Go to <strong>Settings → Network → ID/Relay Server</strong></li>
              <li>Enter the Server Host, Port, and Key above</li>
              <li>The device will register automatically when it connects</li>
            </ol>
          </div>
        </div>
      )}

      {/* ── Device Form Modal ── */}
      {showDeviceForm && (
        <div className="modal-overlay" onClick={() => setShowDeviceForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingDevice ? 'Edit Device' : 'Register New Device'}</h2>
            <div className="form-group">
              <label>RustDesk Device ID *</label>
              <input
                value={deviceForm.device_id}
                onChange={(e) => setDeviceForm({...deviceForm, device_id: e.target.value})}
                placeholder="e.g. 8086123456789012"
              />
            </div>
            <div className="form-group">
              <label>Alias / Nickname</label>
              <input
                value={deviceForm.alias}
                onChange={(e) => setDeviceForm({...deviceForm, alias: e.target.value})}
                placeholder="e.g. Acme-PC-01"
              />
            </div>
            <div className="form-group">
              <label>Hostname</label>
              <input
                value={deviceForm.hostname}
                onChange={(e) => setDeviceForm({...deviceForm, hostname: e.target.value})}
                placeholder="e.g. ACME-WS-01"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>OS</label>
                <select value={deviceForm.os} onChange={(e) => setDeviceForm({...deviceForm, os: e.target.value})}>
                  <option value="">Select OS...</option>
                  <option value="Windows 10">Windows 10</option>
                  <option value="Windows 11">Windows 11</option>
                  <option value="Windows Server 2019">Windows Server 2019</option>
                  <option value="Windows Server 2022">Windows Server 2022</option>
                  <option value="macOS 13">macOS 13</option>
                  <option value="macOS 14">macOS 14</option>
                  <option value="Ubuntu 22.04">Ubuntu 22.04</option>
                  <option value="Ubuntu 24.04">Ubuntu 24.04</option>
                  <option value="Debian 12">Debian 12</option>
                  <option value="Linux (Other)">Linux (Other)</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>CPU</label>
                <input
                  value={deviceForm.cpu}
                  onChange={(e) => setDeviceForm({...deviceForm, cpu: e.target.value})}
                  placeholder="e.g. Intel i7-12700"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Connection Password</label>
              <input
                type="password"
                value={deviceForm.connection_password}
                onChange={(e) => setDeviceForm({...deviceForm, connection_password: e.target.value})}
                placeholder="Password used to authenticate into the device"
              />
            </div>
            <div className="form-group">
              <label>Client *</label>
              <select value={deviceForm.client_id} onChange={(e) => setDeviceForm({...deviceForm, client_id: e.target.value})}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeviceForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveDevice}>
                {editingDevice ? 'Update Device' : 'Register Device'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Start Session Modal ── */}
      {showSessionForm && (
        <div className="modal-overlay" onClick={() => setShowSessionForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Start Remote Session</h2>
            <div className="form-group">
              <label>Device *</label>
              <select value={sessionForm.device_id} onChange={(e) => {
                const dev = devices.find(d => d.id === parseInt(e.target.value));
                setSessionForm({
                  ...sessionForm,
                  device_id: e.target.value,
                  client_id: dev ? dev.client_id : sessionForm.client_id,
                });
              }}>
                <option value="">Select device...</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.alias || d.device_id} ({d.client_name})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Client *</label>
              <select value={sessionForm.client_id} onChange={(e) => setSessionForm({...sessionForm, client_id: e.target.value})}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Link to Ticket (optional)</label>
              <select value={sessionForm.ticket_id} onChange={(e) => setSessionForm({...sessionForm, ticket_id: e.target.value})}>
                <option value="">No ticket (ad-hoc session)</option>
                {tickets.filter(t => !['CLOSED', 'COMPLETED', 'DONE'].includes(t.status)).map(t => (
                  <option key={t.id} value={t.id}>{t.ticket_number} — {t.title} ({t.status})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={sessionForm.notes}
                onChange={(e) => setSessionForm({...sessionForm, notes: e.target.value})}
                placeholder="Session notes..."
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSessionForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={startSession}>▶ Start Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Session History Component ──
function SessionHistory({ apiFetch }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/rustdesk/sessions')
      .then(data => { setHistory(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [apiFetch]);

  if (loading) return <div className="card"><p>Loading history...</p></div>;

  return (
    <div className="card">
      <h3>Session History</h3>
      {history.length === 0 ? (
        <div className="empty-state"><p>No sessions recorded yet.</p></div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Client</th>
              <th>Ticket</th>
              <th>Technician</th>
              <th>Started</th>
              <th>Ended</th>
              <th>Duration</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {history.map((s) => (
              <tr key={s.id} className={!s.ended_at ? 'row-active' : ''}>
                <td>{s.device_alias || s.device_id || '—'}</td>
                <td>{s.client_name || '—'}</td>
                <td>{s.ticket_id ? <span className="badge badge-info">#{s.ticket_title || s.ticket_id}</span> : '—'}</td>
                <td>{s.technician_name || '—'}</td>
                <td>{formatDateTime(s.started_at)}</td>
                <td>{formatDateTime(s.ended_at)}</td>
                <td>
                  {s.ended_at ? (
                    <span>{formatDuration(s.duration_seconds)}</span>
                  ) : (
                    <span className="timer-badge">⏱ Active</span>
                  )}
                </td>
                <td>{s.notes ? s.notes.substring(0, 50) + (s.notes.length > 50 ? '...' : '') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
