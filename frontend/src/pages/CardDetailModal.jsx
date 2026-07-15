import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  X, Pencil, Trash2, Plus, Check, Clock, Paperclip,
  MessageSquare, Users, Tag, Calendar, CheckSquare,
  Archive, Copy, Move, Send, AlertCircle, ChevronDown,
  ChevronUp, MoreHorizontal, Link2, FileText, Image as ImageIcon,
  Download, Eye, Edit3, Square, Play, Palette, LayoutGrid, BookOpen,
  Clipboard,
} from 'lucide-react';
import {
  getTicket, updateTicket, getActivity, getAttachments,
  uploadAttachment, deleteAttachment,
  addTicketMember, removeTicketMember,
  addTicketLabel, removeTicketLabel,
  createChecklist, updateChecklist, deleteChecklist,
  addChecklistItem, updateChecklistItem, deleteChecklistItem,
  createComment, searchKB,
  createLabel,
  startTime, stopTime,
} from '../services/api';

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatTimeAgo(dt) {
  if (!dt) return '';
  const seconds = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dt);
}

function formatDuration(seconds) {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDurationLong(seconds) {
  if (!seconds) return '0:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function isOverdue(date) {
  if (!date) return false;
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d < new Date();
}

const AVATAR_COLORS = [
  '#7c83ff', '#16a34a', '#dc2626', '#d97706', '#0891b2',
  '#7c3aed', '#db2777', '#0d9488', '#4f46e5', '#c026d3',
];

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const LABEL_COLORS = [
  { name: 'green', bg: '#dcfce7', text: '#16a34a', border: '#bbf7d0' },
  { name: 'yellow', bg: '#fef3c7', text: '#d97706', border: '#fde68a' },
  { name: 'orange', bg: '#ffedd5', text: '#ea580c', border: '#fed7aa' },
  { name: 'red', bg: '#fee2e2', text: '#dc2626', border: '#fecaca' },
  { name: 'purple', bg: '#f3e8ff', text: '#7c3aed', border: '#e9d5ff' },
  { name: 'blue', bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe' },
  { name: 'sky', bg: '#e0f2fe', text: '#0284c7', border: '#bae6fd' },
  { name: 'lime', bg: '#ecfccb', text: '#65a30d', border: '#d9f99d' },
  { name: 'pink', bg: '#fce7f3', text: '#db2777', border: '#fbcfe8' },
  { name: 'teal', bg: '#ccfbf1', text: '#0d9488', border: '#99f6e4' },
];

// Map backend color names (e.g. "green") to their hex bg for display
const COLOR_NAME_TO_HEX = Object.fromEntries(LABEL_COLORS.map(c => [c.name, c.bg]));

/** Resolve a label's color to a CSS-ready hex value.
 *  Accepts backend color names ("green", "red") OR hex values ("#dcfce7"). */
function resolveColor(color) {
  if (!color) return null;
  if (color.startsWith('#')) return color;
  return COLOR_NAME_TO_HEX[color] || color;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Inline Edit Component
   ═══════════════════════════════════════════════════════════════════════════ */

function InlineEdit({ value, onSave, placeholder, multiline = false, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (!editing) {
    return (
      <span
        className={`inline-edit-trigger ${className}`}
        onClick={() => setEditing(true)}
        style={{ cursor: 'pointer' }}
      >
        {value || <span className="text-muted" style={{ fontStyle: 'italic' }}>{placeholder}</span>}
        <Pencil size={13} style={{ marginLeft: 6, opacity: 0.4, verticalAlign: 'middle' }} />
      </span>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={inputRef}
        className="form-control"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        rows={4}
        style={{ marginBottom: 4 }}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      className="form-control"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Section Header
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionHeader({ icon: Icon, title, onAdd, addLabel }) {
  return (
    <div className="cdm-section-header">
      <div className="cdm-section-title">
        <Icon size={18} />
        <span>{title}</span>
      </div>
      {onAdd && (
        <button className="btn btn-outline btn-sm cdm-section-add" onClick={onAdd}>
          <Plus size={14} /> {addLabel || 'Add'}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Labels Section
   ═══════════════════════════════════════════════════════════════════════════ */

function LabelsSection({ ticket, labels = [], onUpdate, onApiUpdate, externalShowPicker, onExternalShowPicker }) {
  const [internalShowPicker, setInternalShowPicker] = useState(false);
  const showPicker = externalShowPicker !== undefined ? externalShowPicker : internalShowPicker;
  const setShowPicker = onExternalShowPicker || setInternalShowPicker;
  const ticketLabels = ticket.labels || [];

  // New label creation state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0].bg);
  const [creating, setCreating] = useState(false);

  const toggleLabel = async (label) => {
    const has = ticketLabels.some(l => (typeof l === 'string' ? l === label.name : l.id === label.id || l.name === label.name));
    let newLabels;
    if (has) {
      newLabels = ticketLabels.filter(l => (typeof l === 'string' ? l !== label.name : l.id !== label.id && l.name !== label.name));
      // API call to remove label
      if (ticket.id && label.id) {
        try {
          await removeTicketLabel(ticket.id, label.id);
        } catch (err) {
          // Revert on failure
          return;
        }
      }
    } else {
      newLabels = [...ticketLabels, label];
      // API call to add label
      if (ticket.id && label.id) {
        try {
          await addTicketLabel(ticket.id, label.id);
        } catch (err) {
          // Revert on failure
          return;
        }
      }
    }
    onUpdate({ labels: newLabels });
    onApiUpdate?.();
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim() || creating) return;
    setCreating(true);
    try {
      // Find the matching named color for the selected hex bg
      const colorEntry = LABEL_COLORS.find(c => c.bg === newLabelColor);
      const colorName = colorEntry ? colorEntry.name : 'green';
      const created = await createLabel({ name: newLabelName.trim(), color: colorName });
      // Immediately apply the new label to the ticket
      if (created?.id && ticket.id) {
        try {
          await addTicketLabel(ticket.id, created.id);
        } catch (err) {
          // Still add locally even if ticket assignment fails
        }
      }
      const newLabel = created || { id: `label-${Date.now()}`, name: newLabelName.trim(), color: colorName };
      onUpdate({ labels: [...ticketLabels, newLabel] });
      onApiUpdate?.();
      setNewLabelName('');
      setNewLabelColor(LABEL_COLORS[0].bg);
      setShowCreateForm(false);
    } catch (err) {
      // Show error to user
      alert(`Failed to create label: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="cdm-section">
      <SectionHeader icon={Tag} title="Labels" onAdd={() => setShowPicker(!showPicker)} />
      <div className="cdm-labels">
        {ticketLabels.map((label, i) => {
          const colorInfo = LABEL_COLORS[i % LABEL_COLORS.length];
          const name = typeof label === 'string' ? label : label.name;
          const bg = resolveColor(label.color) || colorInfo.bg;
          const text = colorInfo.text;
          return (
            <span
              key={i}
              className="cdm-label-pill"
              style={{ background: bg, color: text }}
              onClick={() => toggleLabel(typeof label === 'string' ? { name: label } : label)}
              title="Click to remove"
            >
              {name} <X size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
            </span>
          );
        })}
        {!showPicker && ticketLabels.length === 0 && (
          <span className="text-muted text-sm" style={{ fontStyle: 'italic' }}>No labels</span>
        )}
      </div>
      {showPicker && (
        <div className="cdm-label-picker">
          {/* Existing labels with color swatches */}
          {labels.length === 0 ? (
            <div className="text-muted text-sm" style={{ padding: 8 }}>No labels available. Create one below!</div>
          ) : (
            labels.map((label, i) => {
              const colorInfo = LABEL_COLORS.find(c => c.name === label.color) || LABEL_COLORS[i % LABEL_COLORS.length];
              const isApplied = ticketLabels.some(l => (typeof l === 'string' ? l === label.name : l.id === label.id || l.name === label.name));
              return (
                <button
                  key={label.id || i}
                  className={`cdm-label-option ${isApplied ? 'cdm-label-option--active' : ''}`}
                  style={{ background: resolveColor(label.color) || colorInfo.bg, color: colorInfo.text }}
                  onClick={() => toggleLabel(label)}
                >
                  <span className="cdm-label-swatch" style={{ background: resolveColor(label.color) || colorInfo.bg, border: `1px solid ${colorInfo.border}`, width: 12, height: 12, borderRadius: 3, display: 'inline-block', marginRight: 6, flexShrink: 0 }} />
                  {label.name}
                  {isApplied && <Check size={14} style={{ marginLeft: 'auto' }} />}
                </button>
              );
            })
          )}

          {/* Create new label form */}
          {showCreateForm ? (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8f9fa', borderRadius: 8, border: '1px solid #e9ecef' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Label name…"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLabel(); if (e.key === 'Escape') setShowCreateForm(false); }}
                  autoFocus
                  style={{ flex: 1, fontSize: 13 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#666', marginRight: 4 }}>Color:</span>
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setNewLabelColor(c.bg)}
                    title={c.name}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      border: newLabelColor === c.bg ? '2px solid #333' : '1px solid #ccc',
                      background: c.bg,
                      cursor: 'pointer',
                      padding: 0,
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleCreateLabel}
                  disabled={!newLabelName.trim() || creating}
                >
                  {creating ? 'Creating…' : <><Plus size={14} /> Create & Apply</>}
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => { setShowCreateForm(false); setNewLabelName(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowCreateForm(true)}
              style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Plus size={14} /> Create new label
            </button>
          )}

          <button className="btn btn-outline btn-sm" onClick={() => { setShowPicker(false); setShowCreateForm(false); onApiUpdate?.(); }} style={{ marginTop: 8 }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Members Section
   ═══════════════════════════════════════════════════════════════════════════ */

function MembersSection({ ticket, members = [], onUpdate, onApiUpdate, externalShowPicker, onExternalShowPicker }) {
  const [internalShowPicker, setInternalShowPicker] = useState(false);
  const showPicker = externalShowPicker !== undefined ? externalShowPicker : internalShowPicker;
  const setShowPicker = onExternalShowPicker || setInternalShowPicker;
  const ticketMembers = ticket.members || [];

  const toggleMember = async (member) => {
    const has = ticketMembers.some(m => m.id === member.id);
    if (has) {
      if (ticket.id) {
        try {
          await removeTicketMember(ticket.id, member.id);
        } catch (err) {
          return;
        }
      }
      onUpdate({ members: ticketMembers.filter(m => m.id !== member.id) });
    } else {
      if (ticket.id) {
        try {
          await addTicketMember(ticket.id, member.id);
        } catch (err) {
          return;
        }
      }
      onUpdate({ members: [...ticketMembers, member] });
    }
    onApiUpdate?.();
  };

  return (
    <div className="cdm-section">
      <SectionHeader icon={Users} title="Members" onAdd={() => setShowPicker(!showPicker)} />
      <div className="cdm-members">
        {ticketMembers.map((member) => (
          <div
            key={member.id}
            className="cdm-member-avatar"
            style={{ background: avatarColor(member.name) }}
            title={`${member.name} — click to remove`}
            onClick={() => toggleMember(member)}
          >
            {getInitials(member.name)}
            <div className="cdm-member-remove"><X size={10} /></div>
          </div>
        ))}
        <button className="cdm-member-add" onClick={() => setShowPicker(!showPicker)}>
          <Plus size={16} />
        </button>
      </div>
      {showPicker && members.length > 0 && (
        <div className="cdm-member-picker">
          {members.map((member) => {
            const isAssigned = ticketMembers.some(m => m.id === member.id);
            return (
              <button
                key={member.id}
                className={`cdm-member-option ${isAssigned ? 'cdm-member-option--active' : ''}`}
                onClick={() => toggleMember(member)}
              >
                <span className="cdm-member-avatar cdm-member-avatar--sm" style={{ background: avatarColor(member.name) }}>
                  {getInitials(member.name)}
                </span>
                <span>{member.name}</span>
                {isAssigned && <Check size={14} style={{ marginLeft: 'auto' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Due Date Section
   ═══════════════════════════════════════════════════════════════════════════ */

function DueDateSection({ ticket, onUpdate, externalDueDateRef }) {
  const internalRef = useRef(null);
  const dueDateRef = externalDueDateRef || internalRef;
  const dueDate = ticket.due_date;
  const completed = ticket.status === 'DONE' || ticket.status === 'COMPLETED';
  const overdue = !completed && isOverdue(dueDate);

  const handleChange = async (e) => {
    const val = e.target.value ? new Date(e.target.value).toISOString() : null;
    onUpdate({ due_date: val });
    if (ticket.id) {
      try {
        await updateTicket(ticket.id, { due_date: val });
      } catch (err) {
        // Revert on failure
        onUpdate({ due_date: dueDate });
      }
    }
  };

  return (
    <div className="cdm-section">
      <SectionHeader icon={Calendar} title="Due Date" />
      <div className="cdm-due-date">
        <input
          ref={dueDateRef}
          type="date"
          className="form-control cdm-due-date-input"
          value={dueDate ? new Date(dueDate).toISOString().split('T')[0] : ''}
          onChange={handleChange}
        />
        {dueDate && (
          <span className={`cdm-due-badge ${overdue ? 'cdm-due-badge--overdue' : completed ? 'cdm-due-badge--completed' : ''}`}>
            {overdue && <AlertCircle size={13} />}
            {completed && <Check size={13} />}
            {overdue ? 'Overdue' : completed ? 'Completed' : formatDate(dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Description Section
   ═══════════════════════════════════════════════════════════════════════════ */

function DescriptionSection({ ticket, onUpdate }) {
  return (
    <div className="cdm-section">
      <SectionHeader icon={FileText} title="Description" />
      <InlineEdit
        value={ticket.description || ''}
        onSave={(val) => onUpdate({ description: val })}
        placeholder="Add a more detailed description…"
        multiline
        className="cdm-description"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Checklist Item
   ═══════════════════════════════════════════════════════════════════════════ */

function ChecklistItem({ item, onToggle, onDelete, onRename }) {
  return (
    <div className={`cdm-checklist-item ${item.completed ? 'cdm-checklist-item--done' : ''}`}>
      <label className="cdm-checklist-checkbox">
        <input
          type="checkbox"
          checked={item.completed || false}
          onChange={() => onToggle(item.id)}
        />
        <span className="cdm-checkmark">{item.completed && <Check size={12} />}</span>
      </label>
      <span className="cdm-checklist-text">{item.text}</span>
      <div className="cdm-checklist-actions">
        <button className="cdm-icon-btn" onClick={() => onRename(item.id)} title="Rename">
          <Edit3 size={13} />
        </button>
        <button className="cdm-icon-btn cdm-icon-btn--danger" onClick={() => onDelete(item.id)} title="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Checklist Section
   ═══════════════════════════════════════════════════════════════════════════ */

function ChecklistsSection({ ticket, onUpdate, externalAddingChecklist, onExternalAddingChecklist }) {
  const [internalAddingChecklist, setInternalAddingChecklist] = useState(false);
  const addingChecklist = externalAddingChecklist !== undefined ? externalAddingChecklist : internalAddingChecklist;
  const setAddingChecklist = onExternalAddingChecklist || setInternalAddingChecklist;
  const checklists = ticket.checklists || [];
  const [newItemText, setNewItemText] = useState({});
  const [newChecklistTitle, setNewChecklistTitle] = useState('');

  const addChecklist = async () => {
    if (!newChecklistTitle.trim()) return;
    let serverId = null;
    if (ticket.id) {
      try {
        const created = await createChecklist(ticket.id, { title: newChecklistTitle.trim() });
        serverId = created?.id;
      } catch (err) {
        return;
      }
    }
    const newList = {
      id: serverId || `cl-${Date.now()}`,
      title: newChecklistTitle.trim(),
      items: [],
    };
    onUpdate({ checklists: [...checklists, newList] });
    setNewChecklistTitle('');
    setAddingChecklist(false);
  };

  const deleteChecklistHandler = async (clId) => {
    if (!clId.toString().startsWith('cl-')) {
      try {
        await deleteChecklist(clId);
      } catch (err) {
        return;
      }
    }
    onUpdate({ checklists: checklists.filter(c => c.id !== clId) });
  };

  const toggleAll = async (clId) => {
    const cl = checklists.find(c => c.id === clId);
    if (!cl) return;
    const allDone = cl.items.every(i => i.completed);
    onUpdate({
      checklists: checklists.map(c => {
        if (c.id !== clId) return c;
        return { ...c, items: c.items.map(i => ({ ...i, completed: !allDone })) };
      }),
    });
    // Persist each item toggle to API for server-backed items
    if (!clId.toString().startsWith('cl-')) {
      for (const item of cl.items) {
        if (!item.id.toString().startsWith('cli-')) {
          try {
            await updateChecklistItem(item.id, { is_completed: !allDone });
          } catch (err) { /* silent */ }
        }
      }
    }
  };

  const renameChecklist = async (clId, newTitle) => {
    onUpdate({
      checklists: checklists.map(cl => cl.id === clId ? { ...cl, title: newTitle } : cl),
    });
    if (ticket.id && !clId.toString().startsWith('cl-')) {
      try {
        await updateChecklist(clId, { title: newTitle });
      } catch (err) {
        // Silent revert — local state already updated
      }
    }
  };

  const addItem = async (clId) => {
    const text = (newItemText[clId] || '').trim();
    if (!text) return;
    let serverItemId = null;
    if (!clId.toString().startsWith('cl-')) {
      try {
        const created = await addChecklistItem(clId, { title: text });
        serverItemId = created?.id;
      } catch (err) {
        return;
      }
    }
    onUpdate({
      checklists: checklists.map(cl => {
        if (cl.id !== clId) return cl;
        return {
          ...cl,
          items: [...cl.items, { id: serverItemId || `cli-${Date.now()}`, text, completed: false }],
        };
      }),
    });
    setNewItemText(prev => ({ ...prev, [clId]: '' }));
  };

  const toggleItem = async (clId, itemId) => {
    const currentItem = checklists.find(c => c.id === clId)?.items.find(i => i.id === itemId);
    if (!currentItem) return;
    const newCompleted = !currentItem.completed;
    onUpdate({
      checklists: checklists.map(cl => {
        if (cl.id !== clId) return cl;
        return {
          ...cl,
          items: cl.items.map(i => i.id === itemId ? { ...i, completed: newCompleted } : i),
        };
      }),
    });
    if (!itemId.toString().startsWith('cli-')) {
      try {
        await updateChecklistItem(itemId, { is_completed: newCompleted });
      } catch (err) {
        // Silent revert
        onUpdate({
          checklists: checklists.map(cl => {
            if (cl.id !== clId) return cl;
            return {
              ...cl,
              items: cl.items.map(i => i.id === itemId ? { ...i, completed: currentItem.completed } : i),
            };
          }),
        });
      }
    }
  };

  const deleteItem = async (clId, itemId) => {
    if (!itemId.toString().startsWith('cli-')) {
      try {
        await deleteChecklistItem(itemId);
      } catch (err) {
        return;
      }
    }
    onUpdate({
      checklists: checklists.map(cl => {
        if (cl.id !== clId) return cl;
        return { ...cl, items: cl.items.filter(i => i.id !== itemId) };
      }),
    });
  };

  const renameItem = (clId, itemId) => {
    const item = checklists.find(c => c.id === clId)?.items.find(i => i.id === itemId);
    if (!item) return;
    const newText = window.prompt('Rename item:', item.text);
    if (newText === null || !newText.trim()) return;
    onUpdate({
      checklists: checklists.map(cl => {
        if (cl.id !== clId) return cl;
        return { ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, text: newText.trim() } : i) };
      }),
    });
    if (!itemId.toString().startsWith('cli-')) {
      updateChecklistItem(itemId, { title: newText.trim() }).catch(() => {});
    }
  };

  return (
    <div className="cdm-section">
      <SectionHeader
        icon={CheckSquare}
        title="Checklists"
        onAdd={() => setAddingChecklist(true)}
        addLabel="Add Checklist"
      />
      {checklists.map((cl) => {
        const total = cl.items.length;
        const done = cl.items.filter(i => i.completed).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div key={cl.id} className="cdm-checklist">
            <div className="cdm-checklist-header">
              <InlineEdit
                value={cl.title}
                onSave={(val) => renameChecklist(cl.id, val)}
                placeholder="Checklist title"
                className="cdm-checklist-title"
              />
              <div className="cdm-checklist-header-actions">
                <button className="cdm-icon-btn" onClick={() => toggleAll(cl.id)} title="Toggle all">
                  {done === total && total > 0 ? <Check size={14} /> : <CheckSquare size={14} />}
                </button>
                <button className="cdm-icon-btn cdm-icon-btn--danger" onClick={() => deleteChecklistHandler(cl.id)} title="Delete checklist">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="cdm-progress-bar">
              <div className="cdm-progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#7c83ff' }} />
              <span className="cdm-progress-text">{pct}%</span>
            </div>
            {/* Items */}
            <div className="cdm-checklist-items">
              {cl.items.map(item => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  onToggle={(itemId) => toggleItem(cl.id, itemId)}
                  onDelete={(itemId) => deleteItem(cl.id, itemId)}
                  onRename={(itemId) => renameItem(cl.id, itemId)}
                />
              ))}
            </div>
            {/* Add item */}
            <div className="cdm-add-item">
              <input
                className="form-control"
                placeholder="Add an item…"
                value={newItemText[cl.id] || ''}
                onChange={(e) => setNewItemText(prev => ({ ...prev, [cl.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') addItem(cl.id); }}
              />
              <button className="btn btn-primary btn-sm" onClick={() => addItem(cl.id)}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        );
      })}
      {addingChecklist && (
        <div className="cdm-new-checklist">
          <input
            className="form-control"
            placeholder="Checklist title…"
            value={newChecklistTitle}
            onChange={(e) => setNewChecklistTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addChecklist(); }}
            autoFocus
          />
          <div className="flex gap-2" style={{ marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={addChecklist}>Add</button>
            <button className="btn btn-outline btn-sm" onClick={() => { setAddingChecklist(false); setNewChecklistTitle(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Attachments Section
   ═══════════════════════════════════════════════════════════════════════════ */

function AttachmentsSection({ ticket, onUpdate, onApiUpdate, externalFileInputRef }) {
  const attachments = ticket.attachments || [];
  const fileInputRef = externalFileInputRef || useRef(null);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (ticket.id) {
      try {
        for (const file of files) {
          await uploadAttachment(ticket.id, file);
        }
        onApiUpdate?.();
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
    }
    e.target.value = '';
  };

  const handleDelete = async (attId) => {
    try {
      await deleteAttachment(attId);
      onUpdate({ attachments: attachments.filter(a => a.id !== attId) });
      onApiUpdate?.();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const getFileIcon = (type) => {
    if (type?.startsWith('image/')) return <ImageIcon size={16} />;
    return <FileText size={16} />;
  };

  return (
    <div className="cdm-section">
      <SectionHeader icon={Paperclip} title="Attachments" onAdd={() => fileInputRef.current?.click()} addLabel="Upload" />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleUpload}
      />
      {attachments.length === 0 ? (
        <div className="cdm-no-attachments">
          <Paperclip size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
          <span className="text-muted text-sm">No attachments yet</span>
          <button className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()} style={{ marginTop: 8 }}>
            <Plus size={14} /> Upload files
          </button>
        </div>
      ) : (
        <div className="cdm-attachments">
          {attachments.map(att => (
            <div key={att.id} className="cdm-attachment">
              <div className="cdm-attachment-icon">{getFileIcon(att.type)}</div>
              <div className="cdm-attachment-info">
                <div className="cdm-attachment-name">{att.name}</div>
                <div className="cdm-attachment-meta">
                  {formatFileSize(att.size)} · {formatDate(att.uploaded_at)}
                </div>
              </div>
              <div className="cdm-attachment-actions">
                {att.url && (
                  <a href={att.url} download={att.name} className="cdm-icon-btn" title="Download">
                    <Download size={14} />
                  </a>
                )}
                <button className="cdm-icon-btn cdm-icon-btn--danger" onClick={() => handleDelete(att.id)} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Activity Feed
   ═══════════════════════════════════════════════════════════════════════════ */

function ActivityFeed({ ticket }) {
  const activities = ticket.activities || [];
  const feedRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [activities.length]);

  const renderActivity = (activity) => {
    // Try to parse action_detail as JSON for richer data
    let detail = {};
    if (activity.action_detail || activity.description) {
      try { detail = JSON.parse(activity.action_detail || activity.description); } catch { /* not JSON */ }
    }
    const type = activity.type || activity.action_type;
    switch (type) {
      case 'created':
        return 'created this card';
      case 'moved':
        return `moved this card from ${detail.from || activity.from || '?'} to ${detail.to || activity.to || '?'}`;
      case 'updated':
        return `updated ${detail.field || activity.field || 'the card'}`;
      case 'commented':
        return <span>commented{detail.comment_preview && <span className="cdm-activity-comment-preview"> — {detail.comment_preview}</span>}</span>;
      case 'added_attachment':
        return `attached ${detail.fileName || activity.fileName || detail.filename || 'a file'}`;
      case 'removed_attachment':
        return `removed attachment ${detail.fileName || detail.filename || 'a file'}`;
      case 'completed_checklist':
        return `completed "${detail.itemText || activity.itemText || 'an item'}"`;
      case 'uncompleted_checklist':
        return `unchecked "${detail.itemText || activity.itemText || 'an item'}"`;
      case 'added_label':
        return `added label "${detail.labelName || activity.labelName || '?'}"`;
      case 'removed_label':
        return `removed label "${detail.labelName || activity.labelName || '?'}"`;
      case 'added_member':
        return `added ${detail.memberName || activity.memberName || 'a member'} to this card`;
      case 'removed_member':
        return `removed ${detail.memberName || activity.memberName || 'a member'} from this card`;
      case 'set_due_date':
        return `set the due date to ${formatDate(detail.dueDate || activity.dueDate)}`;
      case 'removed_due_date':
        return 'removed the due date';
      case 'archived':
        return 'archived this card';
      case 'unarchived':
        return 'unarchived this card';
      default:
        return activity.description || activity.action_detail || 'performed an action';
    }
  };

  return (
    <div className="cdm-section">
      <SectionHeader icon={Clock} title="Activity" />
      <div className="cdm-activity-feed" ref={feedRef}>
        {activities.length === 0 ? (
          <div className="text-muted text-sm" style={{ fontStyle: 'italic', padding: '8px 0' }}>
            No activity yet
          </div>
        ) : (
          activities.map((activity, i) => (
            <div key={i} className="cdm-activity-item">
              <span
                className="cdm-activity-avatar"
                style={{ background: avatarColor(activity.user?.name || activity.userName) }}
              >
                {getInitials(activity.user?.name || activity.userName)}
              </span>
              <div className="cdm-activity-content">
                <span className="cdm-activity-user">{activity.user?.name || activity.userName || 'Someone'}</span>
                {' '}
                <span className="cdm-activity-action">{renderActivity(activity)}</span>
                <div className="cdm-activity-time">{formatTimeAgo(activity.timestamp || activity.created_at)}</div>
                {(activity.type === 'commented' || activity.type === 'comment') && activity.comment && (
                  <div className="cdm-activity-comment">{renderTextWithKbLinks(activity.comment)}</div>
                )}
                {(activity.type === 'commented' || activity.type === 'comment') && activity.attachments && activity.attachments.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {activity.attachments.map((att, idx) => (
                      <div key={idx} style={{ marginBottom: 4 }}>
                        {att.mime_type && att.mime_type.startsWith('image/') ? (
                          <img
                            src={att.url}
                            alt={att.filename || 'attachment'}
                            style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, border: '1px solid #eee' }}
                          />
                        ) : (
                          <a
                            href={att.url}
                            download={att.filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2563eb' }}
                          >
                            📎 {att.filename || 'Download'} {att.size ? `(${formatFileSize(att.size)})` : ''}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   KB Reference Link Parser
   ═══════════════════════════════════════════════════════════════════════════ */

// Renders text, turning [KB: Title](kb:ID) patterns into clickable links
function renderTextWithKbLinks(text) {
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

/* ═══════════════════════════════════════════════════════════════════════════
   Comment Input
   ═══════════════════════════════════════════════════════════════════════════ */

function CommentInput({ onAddComment, ticketId }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [kbSearch, setKbSearch] = useState('');
  const [kbResults, setKbResults] = useState([]);
  const [showKb, setShowKb] = useState(false);
  const [kbSearching, setKbSearching] = useState(false);
  const fileInputRef = useRef(null);
  const kbDebounceRef = useRef(null);

  const handleSend = async () => {
    if (!text.trim() && pendingFiles.length === 0) return;
    setSending(true);
    setUploading(true);
    try {
      // Upload any pending files first
      const attachmentMeta = [];
      for (const file of pendingFiles) {
        try {
          const result = await uploadAttachment(ticketId, file);
          if (result) {
            attachmentMeta.push({
              url: result.file_path || result.url || `/api/tickets/${ticketId}/attachments/${result.id}`,
              filename: result.original_filename || result.filename || file.name,
              mime_type: result.mime_type || file.type,
              size: result.file_size || file.size || 0,
            });
          }
        } catch (err) {
          console.error('Failed to upload attachment:', err);
        }
      }
      await onAddComment(text.trim(), isPrivate, attachmentMeta);
      setText('');
      setPendingFiles([]);
      setShowKb(false);
      setKbSearch('');
      setKbResults([]);
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
    setText((prev) => (prev ? prev + '\n\n' + ref : ref));
    setShowKb(false);
    setKbResults([]);
    setKbSearch('');
  };

  return (
    <div className="cdm-comment-input">
      {showKb && (
        <div style={{ marginBottom: 10, padding: 10, background: '#f8f9fa', borderRadius: 8 }}>
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
              style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}
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
      <textarea
        className="form-control"
        placeholder="Write a comment…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        rows={2}
      />
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
      {pendingFiles.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
      <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            🔒 Private
          </label>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files or images"
          >
            📎 Attach
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setShowKb(!showKb)}
            title="Search Knowledge Base"
          >
            <BookOpen size={14} /> KB
          </button>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSend}
          disabled={sending || (!text.trim() && pendingFiles.length === 0)}
        >
          <Send size={14} /> {uploading ? 'Uploading…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar
   ═══════════════════════════════════════════════════════════════════════════ */

function Sidebar({ ticket, onUpdate, onDelete, onArchive, onClose, onAddMember, onAddLabel, onAddChecklist, onAddAttachment, onFocusDueDate, onApiUpdate }) {
  const [showActions, setShowActions] = useState(true);
  const [showAdd, setShowAdd] = useState(true);
  const created = ticket.created_at || ticket.createdAt;
  const updated = ticket.updated_at || ticket.updatedAt;

  const totalTracked = (ticket.time_entries || []).reduce((s, e) => s + (e.duration_seconds || 0), 0);

  return (
    <div className="cdm-sidebar">
      {/* Add to card */}
      <div className="cdm-sidebar-group">
        <button className="cdm-sidebar-group-header" onClick={() => setShowAdd(!showAdd)}>
          <span>Add to card</span>
          {showAdd ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showAdd && (
          <div className="cdm-sidebar-actions">
            <button className="cdm-sidebar-btn" onClick={onAddMember}><Users size={16} /> Members</button>
            <button className="cdm-sidebar-btn" onClick={onAddLabel}><Tag size={16} /> Labels</button>
            <button className="cdm-sidebar-btn" onClick={onAddChecklist}><CheckSquare size={16} /> Checklist</button>
            <button className="cdm-sidebar-btn" onClick={onAddAttachment}><Paperclip size={16} /> Attachment</button>
            <button className="cdm-sidebar-btn" onClick={onFocusDueDate}><Calendar size={16} /> Due Date</button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="cdm-sidebar-group">
        <button className="cdm-sidebar-group-header" onClick={() => setShowActions(!showActions)}>
          <span>Actions</span>
          {showActions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showActions && (
          <div className="cdm-sidebar-actions">
            <button className="cdm-sidebar-btn"><Move size={16} /> Move</button>
            <button className="cdm-sidebar-btn"><Copy size={16} /> Copy</button>
            <button className="cdm-sidebar-btn" onClick={() => onArchive?.(ticket)}><Archive size={16} /> Archive</button>
            <button className="cdm-sidebar-btn cdm-sidebar-btn--danger" onClick={() => {
              if (window.confirm('Are you sure you want to delete this card?')) onDelete?.(ticket);
            }}><Trash2 size={16} /> Delete</button>
          </div>
        )}
      </div>

      {/* Time tracking summary */}
      <CdmTimeTracker ticket={ticket} onUpdate={onApiUpdate} />

      {/* Timestamps */}
      <div className="cdm-sidebar-group">
        <div className="cdm-sidebar-label">Details</div>
        <div className="cdm-sidebar-meta">
          <div><span className="cdm-meta-label">Created:</span> {formatDateTime(created)}</div>
          <div><span className="cdm-meta-label">Updated:</span> {formatDateTime(updated)}</div>
          {ticket.client_name && <div><span className="cdm-meta-label">Client:</span> {ticket.client_name}</div>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Status & Priority Badges
   ═══════════════════════════════════════════════════════════════════════════ */

function StatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const statuses = ['NEW', 'NOT_STARTED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_VENDOR', 'DONE', 'COMPLETED', 'CLOSED'];
  return (
    <div className="cdm-status-badge-wrapper">
      <span
        className={`badge badge-${(status || 'NEW').toLowerCase().replace(/_/g, '-')}`}
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer' }}
      >
        {(status || 'NEW').replace(/_/g, ' ')} <ChevronDown size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
      </span>
      {open && (
        <div className="cdm-status-dropdown">
          {statuses.map(s => (
            <button
              key={s}
              className={`cdm-status-option ${s === status ? 'cdm-status-option--active' : ''}`}
              onClick={() => { onChange(s); setOpen(false); }}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority, onChange }) {
  const [open, setOpen] = useState(false);
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const p = (priority || 'LOW').toUpperCase();
  return (
    <div className="cdm-priority-badge-wrapper">
      <span
        className="cdm-priority-badge"
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer' }}
      >
        <span className={`priority-dot priority-${p.toLowerCase()}`} />
        {p} <ChevronDown size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
      </span>
      {open && (
        <div className="cdm-priority-dropdown">
          {priorities.map(pr => (
            <button
              key={pr}
              className={`cdm-priority-option ${pr === p ? 'cdm-priority-option--active' : ''}`}
              onClick={() => { onChange(pr); setOpen(false); }}
            >
              <span className={`priority-dot priority-${pr.toLowerCase()}`} />
              {pr}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Cover Color Section
   ═══════════════════════════════════════════════════════════════════════════ */

const COVER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#ec4899', '#6b7280',
];

function CoverColorSection({ ticket, onUpdate }) {
  const [showPicker, setShowPicker] = useState(false);
  const coverColor = ticket.cover_color;

  const setCover = async (color) => {
    onUpdate({ cover_color: color });
    if (ticket.id) {
      try {
        await updateTicket(ticket.id, { cover_color: color });
      } catch (err) {
        onUpdate({ cover_color: null });
      }
    }
    setShowPicker(false);
  };

  const removeCover = async () => {
    onUpdate({ cover_color: null });
    if (ticket.id) {
      try {
        await updateTicket(ticket.id, { cover_color: null });
      } catch (err) {
        onUpdate({ cover_color: coverColor });
      }
    }
    setShowPicker(false);
  };

  return (
    <div className="cdm-section">
      <SectionHeader icon={Palette} title="Cover" onAdd={() => setShowPicker(!showPicker)} />
      {showPicker && (
        <div className="cdm-cover-picker">
          <div className="cdm-cover-colors">
            {COVER_COLORS.map(c => (
              <button
                key={c}
                className={`cdm-cover-swatch ${coverColor === c ? 'cdm-cover-swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => setCover(c)}
              />
            ))}
          </div>
          {coverColor && (
            <button className="btn btn-outline btn-sm" onClick={removeCover} style={{ marginTop: 8 }}>
              Remove cover
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function CardDetailModal({
  ticket,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  onArchive,
  labels = [],
  members = [],
}) {
  const navigate = useNavigate();
  const [localTicket, setLocalTicket] = useState(ticket);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const modalRef = useRef(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const copyTicketLink = () => {
    const ticketNum = localTicket?.ticket_number || '';
    const baseUrl = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
    const url = ticketNum
      ? `${baseUrl}/tickets?ticket=${encodeURIComponent(ticketNum)}`
      : `${baseUrl}/tickets/${localTicket?.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  };

  // Sidebar trigger state — lifted from child sections so sidebar buttons can control them
  const [showLabelsPicker, setShowLabelsPicker] = useState(false);
  const [showMembersPicker, setShowMembersPicker] = useState(false);
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const fileInputRef = useRef(null);
  const dueDateRef = useRef(null);

  // Reset sidebar-triggered state when modal closes/opens
  useEffect(() => {
    if (!isOpen) {
      setShowLabelsPicker(false);
      setShowMembersPicker(false);
      setShowAddChecklist(false);
    }
  }, [isOpen]);

  // Load full ticket detail on open
  useEffect(() => {
    if (!isOpen || !ticket?.id) {
      setLocalTicket(ticket);
      return;
    }
    let cancelled = false;
    const loadDetail = async () => {
      setLoadingDetail(true);
      try {
        const [detail, activity, attachments] = await Promise.all([
          getTicket(ticket.id).catch(() => null),
          getActivity(ticket.id).catch(() => []),
          getAttachments(ticket.id).catch(() => []),
        ]);
        if (cancelled) return;
        const merged = {
          ...ticket,
          ...(detail || {}),
          activities: Array.isArray(activity) ? activity.map(a => ({
            ...a,
            // Map API fields to what ActivityFeed expects
            type: a.action_type || a.type,
            description: a.action_detail || a.description,
            user: a.user ? a.user : (a.user_name ? { name: a.user_name } : null),
            userName: a.user_name || (a.user?.name) || null,
            timestamp: a.created_at || a.timestamp,
            comment: a.action_detail ? (() => { try { const d = JSON.parse(a.action_detail); return d.comment_preview || d.comment || d.body || null; } catch { return a.action_detail; } })() : null,
          })) : [],
          attachments: Array.isArray(attachments) ? attachments : [],
        };
        setLocalTicket(merged);
      } catch (err) {
        if (!cancelled) setLocalTicket(ticket);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };
    loadDetail();
    return () => { cancelled = true; };
  }, [isOpen, ticket?.id]);

  // Sync localTicket when ticket prop changes (but not while loading)
  useEffect(() => {
    if (!loadingDetail) setLocalTicket(ticket);
  }, [ticket]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleApiUpdate = useCallback(async (changes) => {
    if (changes) {
      setLocalTicket(prev => ({ ...prev, ...changes }));
    }
    // Always refresh from server to ensure local state matches DB
    try {
      const fresh = await getTicket(ticket.id);
      if (fresh) {
        setLocalTicket(fresh);
      }
    } catch (err) {
      // ignore refresh failure; keep local state
    }
    onUpdate?.();
  }, [ticket.id, onUpdate]);

  const handleUpdate = useCallback((changes) => {
    setLocalTicket(prev => ({ ...prev, ...changes }));
    // Persist basic field changes to API
    if (ticket?.id) {
      const apiFields = {};
      if ('title' in changes) apiFields.title = changes.title;
      if ('description' in changes) apiFields.description = changes.description;
      if ('status' in changes) apiFields.status = changes.status;
      if ('priority' in changes) apiFields.priority = changes.priority;
      if ('due_date' in changes) apiFields.due_date = changes.due_date;
      if ('cover_color' in changes) apiFields.cover_color = changes.cover_color;
      if (Object.keys(apiFields).length > 0) {
        updateTicket(ticket.id, apiFields).then(() => {
          onUpdate?.();
        }).catch(() => {
          setLocalTicket(prev => ({ ...prev, ...localTicket }));
        });
      } else {
        // For non-API field changes (labels, members, checklists), still notify parent
        onUpdate?.();
      }
    }
  }, [localTicket, ticket?.id, onUpdate]);

  const handleAddComment = useCallback(async (text, isPrivate = false, attachments = []) => {
    if (!ticket?.id) return;
    try {
      await createComment(ticket.id, { body: text, is_private: isPrivate, attachments });
    } catch (err) {
      // Still add locally even if API fails
    }
    const newActivity = {
      type: 'commented',
      action_type: 'commented',
      comment: text,
      user: { name: 'You' },
      userName: 'You',
      user_name: 'You',
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
      visibility: isPrivate ? 'PRIVATE' : 'PUBLIC',
      attachments,
    };
    setLocalTicket(prev => ({
      ...prev,
      activities: [...(prev.activities || []), newActivity],
    }));
  }, [ticket?.id]);

  if (!isOpen || !ticket) return null;

  const t = localTicket;
  const coverColor = t.cover_color;

  return (
    <div className="cdm-overlay" onClick={handleOverlayClick} ref={modalRef}>
      <div className="cdm-modal" style={{ position: 'relative' }}>
        {/* Loading overlay */}
        {loadingDetail && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(255,255,255,0.7)', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 12,
          }}>
            <span style={{ color: '#666', fontWeight: 600 }}>Loading card details…</span>
          </div>
        )}

        {/* Cover color strip */}
        {coverColor && (
          <div className="cdm-cover" style={{ background: coverColor }} />
        )}

        {/* Close button */}
        <button className="cdm-close-btn" onClick={onClose}>
          <X size={22} />
        </button>

        {/* Open in full ticket view */}
        {t?.id && (
          <button
            className="cdm-open-ticket-btn"
            onClick={() => { onClose(); navigate(`/tickets/${t.id}`); }}
            title="Open in full ticket view"
            style={{
              position: 'absolute', top: 12, right: 44,
              background: 'rgba(255,255,255,0.9)', border: '1px solid #ddd',
              borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600,
              color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              zIndex: 5,
            }}
          >
            <LayoutGrid size={14} /> Full View
          </button>
        )}

        {/* Copy shareable link */}
        {t?.id && (
          <button
            className="cdm-open-ticket-btn"
            onClick={copyTicketLink}
            title="Copy shareable link"
            style={{
              position: 'absolute', top: 12, right: 140,
              background: 'rgba(255,255,255,0.9)', border: '1px solid #ddd',
              borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600,
              color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              zIndex: 5,
            }}
          >
            {linkCopied ? <Clipboard size={14} color="#16a34a" /> : <Link2 size={14} />}
            {linkCopied ? 'Copied!' : (t.ticket_number || 'Copy Link')}
          </button>
        )}

        <div className="cdm-layout">
          {/* ── Main Content ── */}
          <div className="cdm-main">
            {/* Title */}
            <div className="cdm-title-area">
              <InlineEdit
                value={t.title || ''}
                onSave={(val) => handleUpdate({ title: val })}
                placeholder="Card title"
                className="cdm-title"
              />
            </div>

            {/* Status & Priority */}
            <div className="cdm-badges-row">
              <StatusBadge
                status={t.status}
                onChange={(s) => handleUpdate({ status: s })}
              />
              <PriorityBadge
                priority={t.priority}
                onChange={(p) => handleUpdate({ priority: p })}
              />
            </div>

            {/* Labels */}
            <LabelsSection ticket={t} labels={labels} onUpdate={handleUpdate} onApiUpdate={handleApiUpdate} externalShowPicker={showLabelsPicker} onExternalShowPicker={setShowLabelsPicker} />

            {/* Members */}
            <MembersSection ticket={t} members={members} onUpdate={handleUpdate} onApiUpdate={handleApiUpdate} externalShowPicker={showMembersPicker} onExternalShowPicker={setShowMembersPicker} />

            {/* Due Date */}
            <DueDateSection ticket={t} onUpdate={handleUpdate} externalDueDateRef={dueDateRef} />

            {/* Cover Color */}
            <CoverColorSection ticket={t} onUpdate={handleUpdate} />

            {/* Description */}
            <DescriptionSection ticket={t} onUpdate={handleUpdate} />

            {/* Checklists */}
            <ChecklistsSection ticket={t} onUpdate={handleUpdate} externalAddingChecklist={showAddChecklist} onExternalAddingChecklist={setShowAddChecklist} />

            {/* Attachments */}
            <AttachmentsSection ticket={t} onUpdate={handleUpdate} onApiUpdate={handleApiUpdate} externalFileInputRef={fileInputRef} />

            {/* Activity Feed */}
            <ActivityFeed ticket={t} />

            {/* Comment Input */}
            <CommentInput onAddComment={handleAddComment} ticketId={ticket?.id} />
          </div>

          {/* ── Sidebar ── */}
          <Sidebar
            ticket={t}
            onUpdate={handleUpdate}
            onApiUpdate={handleApiUpdate}
            onDelete={onDelete}
            onArchive={onArchive}
            onClose={onClose}
            onAddMember={() => setShowMembersPicker(p => !p)}
            onAddLabel={() => setShowLabelsPicker(p => !p)}
            onAddChecklist={() => setShowAddChecklist(p => !p)}
            onAddAttachment={() => fileInputRef.current?.click()}
            onFocusDueDate={() => dueDateRef.current?.focus()}
          />
        </div>
      </div>
    </div>
  );
}

// ── Live Time Tracker for Card Detail Modal ─────────────────────────────────

function CdmTimeTracker({ ticket, onUpdate }) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const runningEntry = (ticket.time_entries || []).find((e) => e.is_running);
  const runningEntryId = runningEntry?.id || null;
  const serverStartTime = runningEntry?.started_at || null;

  // Start/stop timer when runningEntryId changes
  useEffect(() => {
    if (runningEntryId && serverStartTime) {
      startTimeRef.current = new Date(serverStartTime).getTime();
      const tick = () => {
        const now = Date.now();
        setElapsed(Math.max(0, Math.floor((now - startTimeRef.current) / 1000)));
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      };
    } else {
      setElapsed(0);
      startTimeRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [runningEntryId, serverStartTime]);

  const handleToggle = async () => {
    try {
      if (runningEntry) {
        await stopTime(ticket.id);
      } else {
        await startTime(ticket.id);
      }
      onUpdate?.();
    } catch (err) {
      alert(err.message);
    }
  };

  const completedTotal = (ticket.time_entries || []).reduce((s, e) => s + (e.duration_seconds || 0), 0);
  const grandTotal = completedTotal + (runningEntry ? elapsed : 0);

  return (
    <div className="cdm-sidebar-group">
      <div className="cdm-sidebar-label">Time Tracked</div>
      <div className="cdm-time-summary">
        <Clock size={16} />
        <span className="cdm-time-total">{formatDuration(grandTotal)}</span>
        {runningEntry && <span className="pulse-dot-small" style={{ marginLeft: 4 }} />}
      </div>
      <button
        className={`btn btn-sm ${runningEntry ? 'btn-danger' : 'btn-primary'}`}
        onClick={handleToggle}
        style={{ width: '100%', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        {runningEntry ? <><Square size={14} /> Stop Timer</> : <><Play size={14} /> Start Timer</>}
      </button>
      {ticket.time_entries?.length > 0 && (
        <div className="cdm-time-entries">
          {ticket.time_entries.slice(0, 3).map(entry => (
            <div key={entry.id} className="cdm-time-entry">
              <span className="cdm-time-entry-user">{entry.user?.name || `User #${entry.user_id}`}</span>
              <span className="cdm-time-entry-dur">
                {entry.is_running ? formatDuration(elapsed) : formatDuration(entry.duration_seconds)}
              </span>
            </div>
          ))}
          {ticket.time_entries.length > 3 && (
            <div className="cdm-time-more text-muted text-xs">+{ticket.time_entries.length - 3} more</div>
          )}
        </div>
      )}
    </div>
  );
}
