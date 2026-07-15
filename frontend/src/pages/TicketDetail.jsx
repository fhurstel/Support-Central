import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Clock,
  Play,
  Square,
  Send,
  BookOpen,
  X,
  Star,
  Frown,
  Meh,
  Smile,
  AlertCircle,
  CheckCircle,
  Pencil,
  Trash2,
  Plus,
  MessageSquare,
  LayoutGrid,
  Link2,
  Clipboard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getTickets,
  updateTicket,
  closeTicket,
  getTimeEntries,
  startTime,
  stopTime,
  getComments,
  createComment,
  searchKB,
  getUsers,
  getClientMembers,
  updateClientMember,
  updateTimeEntry,
  deleteTimeEntry,
  addManualTimeEntry,
  uploadAttachment,
} from '../services/api';

function formatDuration(seconds) {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDurationLong(seconds) {
  if (!seconds || seconds < 0) return '0:00:00';
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDatetimeLocal(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Timer Section ────────────────────────────────────────────────────────────
function TimerSection({ ticket, timeEntries, onTimerUpdate, currentUser }) {
  const runningEntry = timeEntries.find((e) => e.is_running);
  const [elapsed, setElapsed] = useState(0);
  const [showEdit, setShowEdit] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const intervalRef = useRef(null);

  // Live countdown for running timer
  useEffect(() => {
    if (runningEntry) {
      const tick = () => {
        const now = Date.now();
        const started = new Date(runningEntry.started_at).getTime();
        const diff = Math.max(0, Math.floor((now - started) / 1000));
        setElapsed(diff);
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => clearInterval(intervalRef.current);
    } else {
      setElapsed(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [runningEntry]);

  const handleToggle = async () => {
    try {
      if (runningEntry) {
        await stopTime(ticket.id);
      } else {
        await startTime(ticket.id);
      }
      onTimerUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const totalSeconds = timeEntries.reduce((sum, e) => sum + (e.duration_seconds || 0), 0);
  const runningSeconds = runningEntry ? elapsed : 0;
  const grandTotal = totalSeconds + runningSeconds;

  // ── Edit Modal ──
  function EditModal({ entry, onClose }) {
    const [startedAt, setStartedAt] = useState(formatDatetimeLocal(entry.started_at));
    const [endedAt, setEndedAt] = useState(formatDatetimeLocal(entry.ended_at));
    const [description, setDescription] = useState(entry.description || '');
    const [note, setNote] = useState(entry.note || '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
      setSaving(true);
      try {
        const data = {
          started_at: new Date(startedAt).toISOString(),
          ended_at: new Date(endedAt).toISOString(),
          description,
          note,
        };
        await updateTimeEntry(ticket.id, entry.id, data);
        onTimerUpdate();
        onClose();
      } catch (err) {
        alert(err.message);
      } finally {
        setSaving(false);
      }
    };

    const handleDelete = async () => {
      if (!window.confirm('Delete this time entry?')) return;
      setSaving(true);
      try {
        await deleteTimeEntry(ticket.id, entry.id);
        onTimerUpdate();
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
            <h3>Edit Time Entry</h3>
            <button className="modal-close" onClick={onClose}><X size={20} /></button>
          </div>

          <div className="form-group">
            <label>Start Time</label>
            <input
              className="form-control"
              type="datetime-local"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>End Time</label>
            <input
              className="form-control"
              type="datetime-local"
              value={endedAt}
              onChange={(e) => setEndedAt(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              className="form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was worked on?"
            />
          </div>
          <div className="form-group">
            <label>Adjustment Note / Reason</label>
            <textarea
              className="form-control"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why was this time entry adjusted?"
              rows={2}
            />
          </div>
          <div className="flex gap-2 justify-between">
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 size={14} /> Delete
            </button>
            <div className="flex gap-2">
              <button className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Manual Entry Modal ──
  function ManualModal({ onClose }) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    const [startedAt, setStartedAt] = useState(formatDatetimeLocal(oneHourAgo));
    const [endedAt, setEndedAt] = useState(formatDatetimeLocal(now));
    const [description, setDescription] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const handleAdd = async () => {
      setSaving(true);
      try {
        await addManualTimeEntry(ticket.id, {
          started_at: new Date(startedAt).toISOString(),
          ended_at: new Date(endedAt).toISOString(),
          description,
          note,
        });
        onTimerUpdate();
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
            <h3>Add Time Manually</h3>
            <button className="modal-close" onClick={onClose}><X size={20} /></button>
          </div>

          <div className="form-group">
            <label>Start Time</label>
            <input
              className="form-control"
              type="datetime-local"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>End Time</label>
            <input
              className="form-control"
              type="datetime-local"
              value={endedAt}
              onChange={(e) => setEndedAt(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              className="form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was worked on?"
            />
          </div>
          <div className="form-group">
            <label>Note</label>
            <textarea
              className="form-control"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note about this time entry"
              rows={2}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-success"
              onClick={handleAdd}
              disabled={saving}
            >
              <Plus size={14} /> Add Entry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const [editingEntry, setEditingEntry] = useState(null);

  return (
    <>
      <div className={`card ${runningEntry ? 'timer-running' : ''}`}>
        <div className="card-title flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock size={18} /> Time Tracking
          </span>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setShowManual(true)}
          >
            <Plus size={14} /> Manual
          </button>
        </div>

        {/* Live Timer Display */}
        <div className="timer-area">
          <div className="timer-display-large">
            {formatDurationLong(grandTotal)}
          </div>
          {runningEntry && (
            <div className="timer-live-badge">
              <span className="pulse-dot" />
              LIVE — {runningEntry.description || 'Working...'}
            </div>
          )}
          <div className="timer-grand-total text-xs text-muted">
            Total tracked: {formatDuration(totalSeconds)}
            {runningSeconds > 0 && (
              <span style={{ color: '#16a34a' }}> + {formatDuration(runningSeconds)} running</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            className={`btn flex-1 ${runningEntry ? 'btn-danger' : 'btn-success'}`}
            onClick={handleToggle}
            disabled={!currentUser}
          >
            {runningEntry ? <Square size={16} /> : <Play size={16} />}
            {runningEntry ? 'Stop Timer' : 'Start Timer'}
          </button>
        </div>

        {/* Time Entry History */}
        {timeEntries.length > 0 && (
          <div>
            <div className="text-sm" style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={14} />
              Time History ({timeEntries.length})
            </div>
            {timeEntries.map((entry) => (
              <div
                key={entry.id}
                className="time-entry-row"
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid #f0f0f0',
                  opacity: entry.is_running ? 0.7 : 1,
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {entry.is_running && <span className="pulse-dot-small" />}
                      <span style={{ fontWeight: 500, fontSize: 13 }}>
                        {entry.user?.name || `User #${entry.user_id}`}
                      </span>
                      <span className={`badge ${entry.is_running ? 'badge-IN_PROGRESS' : ''}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                        {entry.is_running ? 'Running' : formatDuration(entry.duration_seconds)}
                      </span>
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                      {new Date(entry.started_at).toLocaleString()}
                      {entry.ended_at && ` → ${new Date(entry.ended_at).toLocaleString()}`}
                    </div>
                    {entry.description && (
                      <div className="text-xs" style={{ marginTop: 2, color: '#555' }}>
                        {entry.description}
                      </div>
                    )}
                    {entry.note && (
                      <div className="text-xs" style={{ marginTop: 2, color: '#d97706', fontStyle: 'italic' }}>
                        📝 {entry.note}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ padding: '2px 6px', minWidth: 'auto' }}
                    onClick={() => setEditingEntry(entry)}
                    title="Edit time entry"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {editingEntry && (
        <EditModal entry={editingEntry} onClose={() => setEditingEntry(null)} />
      )}
      {showManual && <ManualModal onClose={() => setShowManual(false)} />}
    </>
  );
}

// ── KB Reference Link Parser ─────────────────────────────────────────────────
// Renders comment text, turning [KB: Title](kb:ID) patterns into clickable links
function renderCommentBody(text) {
  if (!text) return null;
  const kbRefRegex = /\[KB:\s*([^\]]+)\]\(kb:(\d+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = kbRefRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [, title, id] = match;
    parts.push(
      <Link
        key={`kb-${id}-${match.index}`}
        to={`/knowledge-base?article=${id}`}
        style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 500 }}
        title={`KB Article #${id}: ${title}`}
      >
        📖 {title}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

// ── Comments Section ─────────────────────────────────────────────────────────
function CommentsSection({ ticket }) {
  const { user: currentUser } = useAuth();
  const [comments, setComments] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [newComment, setNewComment] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [emailClient, setEmailClient] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [pendingComment, setPendingComment] = useState(null);
  const [sending, setSending] = useState(false);
  const [kbSearch, setKbSearch] = useState('');
  const [kbResults, setKbResults] = useState([]);
  const [showKb, setShowKb] = useState(false);
  const [kbSearching, setKbSearching] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const kbDebounceRef = useRef(null);

  const fetchComments = useCallback(async () => {
    try {
      const data = await getComments(ticket.id);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }, [ticket.id]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const filteredComments = comments.filter((c) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'PRIVATE') return c.visibility === 'PRIVATE';
    if (activeTab === 'PUBLIC') return c.visibility === 'PUBLIC';
    return true;
  });

  const handleSubmit = async () => {
    if (!newComment.trim() && pendingFiles.length === 0) return;

    // If email-to-client is checked and comment is PUBLIC, show preview first
    if (emailClient && visibility === 'PUBLIC') {
      setPendingComment({ body: newComment, files: pendingFiles });
      setShowEmailPreview(true);
      return;
    }

    await doSubmit(newComment, pendingFiles);
  };

  const doSubmit = async (commentBody, commentFiles, skipEmail = false) => {
    setSending(true);
    setUploading(true);
    try {
      // Upload any pending files first
      const attachmentMeta = [];
      for (const file of commentFiles) {
        try {
          const result = await uploadAttachment(ticket.id, file);
          if (result) {
            attachmentMeta.push({
              url: result.file_path || result.url || `/api/tickets/${ticket.id}/attachments/${result.id}`,
              filename: result.original_filename || result.filename || file.name,
              mime_type: result.mime_type || file.type,
              size: result.file_size || file.size || 0,
            });
          }
        } catch (err) {
          console.error('Failed to upload attachment:', err);
        }
      }

      await createComment(ticket.id, {
        body: commentBody,
        is_private: visibility === 'PRIVATE',
        email_to_client: !skipEmail && emailClient,
        attachments: attachmentMeta.length > 0 ? attachmentMeta : [],
      });
      setNewComment('');
      setEmailClient(false);
      setPendingFiles([]);
      fetchComments();
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  // Debounced KB search (300ms)
  const handleKbInputChange = (value) => {
    setKbSearch(value);
    if (kbDebounceRef.current) clearTimeout(kbDebounceRef.current);
    if (!value.trim()) {
      setKbResults([]);
      setKbSearching(false);
      return;
    }
    setKbSearching(true);
    kbDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchKB(value.trim());
        setKbResults(Array.isArray(results) ? results : []);
      } catch (err) {
        console.error(err);
        setKbResults([]);
      } finally {
        setKbSearching(false);
      }
    }, 300);
  };

  const handleKbSearch = async () => {
    if (!kbSearch.trim()) return;
    setKbSearching(true);
    try {
      const results = await searchKB(kbSearch);
      setKbResults(Array.isArray(results) ? results : []);
    } catch (err) {
      console.error(err);
    } finally {
      setKbSearching(false);
    }
  };

  const injectKbReference = (article) => {
    const ref = `[KB: ${article.title}](kb:${article.id})`;
    setNewComment((prev) => (prev ? prev + '\n\n' + ref : ref));
    setShowKb(false);
    setKbResults([]);
    setKbSearch('');
  };

  return (
    <>
    <div className="card">
      <div className="card-title flex items-center gap-2">
        Comments
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setShowKb(!showKb)}
          style={{ marginLeft: 'auto' }}
        >
          <BookOpen size={14} /> KB
        </button>
      </div>

      {showKb && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
          <div className="flex gap-2 mb-2">
            <input
              className="form-control flex-1"
              placeholder="Search knowledge base…"
              value={kbSearch}
              onChange={(e) => handleKbInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleKbSearch()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleKbSearch}>
              Search
            </button>
          </div>
          {kbSearching && (
            <div className="text-sm text-muted" style={{ padding: '4px 0' }}>
              Searching…
            </div>
          )}
          {!kbSearching && kbResults.length === 0 && kbSearch.trim() && (
            <div className="text-sm text-muted" style={{ padding: '4px 0', fontStyle: 'italic' }}>
              No articles found.
            </div>
          )}
          {kbResults.map((article) => (
            <div
              key={article.id}
              className="flex justify-between items-center"
              style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}
            >
              <span className="text-sm" style={{ fontWeight: 600 }}>
                {article.title}
              </span>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => injectKbReference(article)}
              >
                Insert
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 12 }}>
        {['all', 'PUBLIC', 'PRIVATE'].map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
        {filteredComments.length === 0 ? (
          <div className="empty-state text-sm">No comments yet.</div>
        ) : (
          filteredComments.map((comment) => (
            <div key={comment.id} className="comment">
              <div className="comment-header">
                <span className="comment-author">{comment.author?.name || comment.author_name || 'User'}</span>
                <span className="comment-time">
                  {new Date(comment.created_at).toLocaleString()}
                </span>
              </div>
              <div className="comment-body">{renderCommentBody(comment.body)}</div>
              {comment.attachments && comment.attachments.length > 0 && (
                <div className="comment-attachments" style={{ marginTop: 8 }}>
                  {comment.attachments.map((att, idx) => (
                    <div key={idx} style={{ marginBottom: 4 }}>
                      {att.mime_type && att.mime_type.startsWith('image/') ? (
                        <img
                          src={att.url}
                          alt={att.filename || 'attachment'}
                          style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 6, border: '1px solid #eee' }}
                        />
                      ) : (
                        <a
                          href={att.url}
                          download={att.filename}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#2563eb' }}
                        >
                          📎 {att.filename || 'Download'} {att.size ? `(${formatFileSize(att.size)})` : ''}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="comment-visibility">
                {comment.visibility === 'PRIVATE' ? '🔒 Private' : '🌐 Public'}
                {comment.emailed_to_client ? ' · 📧 Emailed to client' : ''}
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        <textarea
          className="form-control mb-2"
          placeholder="Write a comment…"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={3}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <select
                className="form-control"
                style={{ width: 'auto' }}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={emailClient}
                onChange={(e) => setEmailClient(e.target.checked)}
              />
              Email to client
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setPendingFiles(prev => [...prev, ...files]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => fileInputRef.current?.click()}
                title="Attach files or images"
              >
                📎 Attach
              </button>
            </label>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={sending || (!newComment.trim() && pendingFiles.length === 0)}
          >
            <Send size={14} /> {uploading ? 'Uploading…' : 'Send'}
          </button>
        </div>
        {pendingFiles.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pendingFiles.map((file, idx) => (
              <span
                key={idx}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', background: '#f0f0f0', borderRadius: 4, fontSize: 12,
                }}
              >
                {file.type.startsWith('image/') ? '🖼️' : '📎'} {file.name}
                <button
                  type="button"
                  onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== idx))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Email Preview Modal */}
    {showEmailPreview && pendingComment && (
      <div className="modal-overlay" onClick={() => setShowEmailPreview(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
          <div className="modal-header">
            <h3>📧 Email Preview — Send to Client</h3>
            <button className="modal-close" onClick={() => setShowEmailPreview(false)}><X size={20} /></button>
          </div>
          <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, fontSize: 14, marginBottom: 8 }}>
              <span style={{ color: '#666', fontWeight: 600 }}>To:</span>
              <span>{ticket.client_member?.email || ticket.client_email || '— no client contact email —'}</span>
              <span style={{ color: '#666', fontWeight: 600 }}>From:</span>
              <span>{currentUser?.email || 'support@fijiitsolutions.com'}</span>
              <span style={{ color: '#666', fontWeight: 600 }}>Subject:</span>
              <span>Update on Ticket #{ticket.ticket_number || ticket.id}</span>
              <span style={{ color: '#666', fontWeight: 600 }}>Client:</span>
              <span>{ticket.client_name}{ticket.client_member ? ` (${ticket.client_member.name})` : ''}</span>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 600 }}>Message Body:</div>
              <div style={{ background: '#fff', borderRadius: 6, padding: 12, fontSize: 14, whiteSpace: 'pre-wrap', border: '1px solid #e5e7eb', maxHeight: 200, overflowY: 'auto' }}>
                {pendingComment.body || <em style={{ color: '#999' }}>(empty comment)</em>}
              </div>
              {pendingComment.files?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                  📎 {pendingComment.files.length} attachment(s) will be included
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-outline"
              onClick={() => {
                setShowEmailPreview(false);
                setPendingComment(null);
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn-outline"
              style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
              onClick={async () => {
                setShowEmailPreview(false);
                const c = pendingComment;
                setPendingComment(null);
                await doSubmit(c.body, c.files, true);
              }}
            >
              Send without Email
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                setShowEmailPreview(false);
                const c = pendingComment;
                setPendingComment(null);
                await doSubmit(c.body, c.files, false);
              }}
            >
              📧 Send &amp; Email
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Satisfaction Survey ─────────────────────────────────────────────────────
function SatisfactionSurvey({ ticket, onClose }) {
  const [rating, setRating] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = async (value) => {
    setRating(value);
    setSubmitted(true);
    try {
      await updateTicket(ticket.id, { satisfaction_rating: value });
    } catch (err) {
      console.error(err);
    }
  };

  if (submitted) {
    return (
      <div className="text-center">
        <CheckCircle size={32} color="#16a34a" style={{ margin: '0 auto 8px' }} />
        <p className="text-sm">Thank you for your feedback!</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-sm mb-4">How satisfied are you with the resolution?</p>
      <div className="flex justify-center gap-4">
        <button
          className="btn"
          style={{
            background: rating === 'HAPPY' ? '#dcfce7' : '#f0f0f0',
            padding: '12px 20px',
          }}
          onClick={() => handleRate('HAPPY')}
        >
          <Smile size={24} color="#16a34a" />
          <div className="text-xs mt-1">Happy</div>
        </button>
        <button
          className="btn"
          style={{
            background: rating === 'MODERATE' ? '#fef3c7' : '#f0f0f0',
            padding: '12px 20px',
          }}
          onClick={() => handleRate('MODERATE')}
        >
          <Meh size={24} color="#d97706" />
          <div className="text-xs mt-1">Moderate</div>
        </button>
        <button
          className="btn"
          style={{
            background: rating === 'UNHAPPY' ? '#fee2e2' : '#f0f0f0',
            padding: '12px 20px',
          }}
          onClick={() => handleRate('UNHAPPY')}
        >
          <Frown size={24} color="#dc2626" />
          <div className="text-xs mt-1">Unhappy</div>
        </button>
      </div>
    </div>
  );
}

// ── Ticket Detail (main) ─────────────────────────────────────────────────────
export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [ticket, setTicket] = useState(null);
  const [timeEntries, setTimeEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [closing, setClosing] = useState(false);
  const [users, setUsers] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);

  const copyTicketLink = () => {
    const ticketNum = ticket?.ticket_number || '';
    const baseUrl = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
    const url = ticketNum
      ? `${baseUrl}/tickets?ticket=${encodeURIComponent(ticketNum)}`
      : `${baseUrl}/tickets/${ticket?.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  };

  const fetchData = useCallback(async () => {
    try {
      const allTickets = await getTickets();
      const found = Array.isArray(allTickets) ? allTickets.find((t) => t.id === parseInt(id)) : null;
      if (found) setTicket(found);
      else setError('Ticket not found');

      const timeData = await getTimeEntries(parseInt(id));
      setTimeEntries(Array.isArray(timeData) ? timeData : []);

      const userData = await getUsers();
      setUsers(Array.isArray(userData) ? userData : []);

      // Load client members for the contact dropdown
      if (found && found.client_id) {
        try {
          const members = await getClientMembers(found.client_id);
          setTicket((prev) => ({ ...prev, client_members_list: Array.isArray(members) ? members : [] }));
        } catch {
          setTicket((prev) => ({ ...prev, client_members_list: [] }));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = async (newStatus) => {
    try {
      await updateTicket(parseInt(id), { status: newStatus });
      setTicket((prev) => ({ ...prev, status: newStatus }));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAssign = async (technicianId) => {
    try {
      await updateTicket(parseInt(id), { assigned_to: technicianId });
      setTicket((prev) => ({ ...prev, assigned_to: technicianId }));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleClientContactChange = async (memberId) => {
    try {
      await updateTicket(parseInt(id), { client_member_id: memberId ? parseInt(memberId) : null });
      setTicket((prev) => ({ ...prev, client_member_id: memberId ? parseInt(memberId) : null }));
      // Refresh to get the full client_member object
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleClose = async () => {
    if (!window.confirm('Are you sure you want to close this ticket?')) return;
    setClosing(true);
    try {
      await closeTicket(parseInt(id));
      setTicket((prev) => ({ ...prev, status: 'CLOSED' }));
    } catch (err) {
      alert(err.message);
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <div className="loading-spinner">Loading ticket…</div>;
  if (error) return <div className="empty-state"><AlertCircle size={32} /> {error}</div>;
  if (!ticket) return <div className="empty-state">Ticket not found.</div>;

  const isClosed = ['CLOSED', 'COMPLETED'].includes(ticket.status);

  return (
    <>
      <div className="page-header">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => navigate('/tickets')}
          >
            ← Back
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => navigate(`/tickets?view=kanban&ticket=${ticket.id}`)}
            title="View in Kanban board"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <LayoutGrid size={14} /> Kanban
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>
            <Link to={`/tickets/${ticket.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              #{ticket.id} {ticket.title}
            </Link>
          </h2>
          {ticket.ticket_number && (
            <button
              className="btn btn-outline btn-sm"
              onClick={copyTicketLink}
              title="Copy shareable link"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {linkCopied ? <Clipboard size={14} color="#16a34a" /> : <Link2 size={14} />}
              {linkCopied ? 'Copied!' : ticket.ticket_number}
            </button>
          )}
          <span className={`badge badge-${ticket.status}`}>
            {ticket.status.replace(/_/g, ' ')}
          </span>
          <span className={`priority-dot priority-${ticket.priority || 'LOW'}`} />
          <span className="text-sm text-muted">{ticket.priority || 'LOW'}</span>
        </div>
      </div>

      <div className="ticket-detail-grid">
        <div>
          {/* Timer */}
          <TimerSection
            ticket={ticket}
            timeEntries={timeEntries}
            onTimerUpdate={fetchData}
            currentUser={currentUser}
          />

          {/* Comments */}
          <CommentsSection ticket={ticket} />
        </div>

        {/* Sidebar */}
        <div>
          <div className="card">
            <div className="card-title">Details</div>

            <div className="form-group">
              <label>Client</label>
              <div style={{ fontWeight: 600 }}>{ticket.client_name || '—'}</div>
            </div>

            {ticket.client_id && (
              <div className="form-group">
                <label>Client Contact</label>
                <select
                  className="form-control"
                  value={ticket.client_member_id || ''}
                  onChange={(e) => handleClientContactChange(e.target.value || null)}
                  disabled={isClosed}
                >
                  <option value="">— Select contact —</option>
                  {(ticket.client_members_list || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.role ? ` (${m.role})` : ''}{m.is_primary ? ' ★' : ''}
                    </option>
                  ))}
                </select>
                {ticket.client_member && ticket.client_member.email && (
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    📧 {ticket.client_member.email}
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label>Assigned To (Internal)</label>
              <select
                className="form-control"
                value={ticket.assigned_to || ''}
                onChange={(e) => handleAssign(e.target.value ? parseInt(e.target.value) : null)}
                disabled={isClosed}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>
              <select
                className="form-control"
                value={ticket.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={isClosed}
              >
                {['NEW', 'NOT_STARTED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_VENDOR', 'DONE', 'COMPLETED', 'CLOSED'].map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-sm text-muted mt-4">
              <div>Created: {new Date(ticket.created_at).toLocaleString()}</div>
              <div>Updated: {new Date(ticket.updated_at || ticket.created_at).toLocaleString()}</div>
            </div>

            {!isClosed && (
              <button
                className="btn btn-danger w-full mt-4"
                onClick={handleClose}
                disabled={closing}
              >
                Close Ticket
              </button>
            )}
          </div>

          {/* Satisfaction */}
          {isClosed && (
            <div className="card">
              <div className="card-title flex items-center gap-2">
                <Star size={16} /> Satisfaction
              </div>
              {ticket.satisfaction_rating ? (
                <div className="text-center">
                  <p className="text-sm">
                    Rated:{' '}
                    <strong>
                      {ticket.satisfaction_rating === 'HAPPY'
                        ? '😊 Happy'
                        : ticket.satisfaction_rating === 'MODERATE'
                        ? '😐 Moderate'
                        : '😞 Unhappy'}
                    </strong>
                  </p>
                </div>
              ) : (
                <SatisfactionSurvey ticket={ticket} />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
