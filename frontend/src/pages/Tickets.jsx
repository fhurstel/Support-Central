import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  LayoutGrid,
  List,
  AlertCircle,
  Search,
  Plus,
  X,
  MoreHorizontal,
  Calendar,
  Paperclip,
  MessageSquare,
  Clock,
  User,
  Tag,
  Archive,
  Filter,
  EyeOff,
  ExternalLink,
} from 'lucide-react';
import { getTickets, updateTicket, createTicket, getUsers, getLabels, getBoardStats, moveTicket, getClients, getClientMembers, archiveTicket, deleteTicket } from '../services/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const KANBAN_COLUMNS = [
  { id: 'NEW', title: 'New', color: '#6366f1' },
  { id: 'NOT_STARTED', title: 'Not Started', color: '#8b5cf6' },
  { id: 'IN_PROGRESS', title: 'In Progress', color: '#3b82f6' },
  { id: 'WAITING_CUSTOMER', title: 'Waiting for Customer', color: '#f59e0b' },
  { id: 'WAITING_VENDOR', title: 'Waiting for Vendor', color: '#f97316' },
  { id: 'DONE', title: 'Done', color: '#10b981' },
  { id: 'COMPLETED', title: 'Completed', color: '#6b7280' },
];

const ALL_STATUSES = ['NEW', 'NOT_STARTED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_VENDOR', 'DONE', 'COMPLETED', 'CLOSED'];
const ALL_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const LABEL_COLORS = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  teal: '#14b8a6',
  gray: '#6b7280',
  lime: '#84cc16',
};

const LABEL_NAMES = ['Bug', 'Feature', 'Enhancement', 'Documentation', 'Design', 'Testing', 'DevOps', 'Security', 'Support', 'Urgent'];

const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function isDueSoon(dueDate) {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const now = new Date();
  const diff = d - now;
  return diff > 0 && diff < 2 * 24 * 60 * 60 * 1000; // 2 days
}

function formatDueDate(dueDate) {
  if (!dueDate) return '';
  const d = new Date(dueDate);
  const now = new Date();
  const diff = d - now;
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `${days}d left`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDurationShort(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getLabelColor(labelName) {
  const idx = LABEL_NAMES.indexOf(labelName);
  if (idx === -1) return LABEL_COLORS.gray;
  const colors = Object.values(LABEL_COLORS);
  return colors[idx % colors.length];
}

// ─── Member Avatar ───────────────────────────────────────────────────────────

function MemberAvatar({ name, size = 'sm', isClient = false }) {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#3b82f6', '#14b8a6', '#f59e0b'];
  const colorIdx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  const bg = isClient ? '#10b981' : colors[colorIdx]; // green tint for client contacts
  const sz = size === 'xs' ? 22 : 28;
  const fs = size === 'xs' ? 9 : 11;

  return (
    <div
      className="member-avatar"
      title={isClient ? `Client: ${name}` : name}
      style={{
        width: sz,
        height: sz,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fs,
        fontWeight: 700,
        flexShrink: 0,
        border: isClient ? '2px solid #059669' : '2px solid #fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Label Pill ──────────────────────────────────────────────────────────────

function LabelPill({ label }) {
  // Handle both resolved objects { id, name, color } and plain strings
  const name = typeof label === 'string' ? label : label.name;
  const bg = typeof label === 'string' ? getLabelColor(name) : (label.color || getLabelColor(name));
  return (
    <span
      className="label-pill"
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 700,
        color: '#fff',
        background: bg,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
      }}
    >
      {name}
    </span>
  );
}

// ─── Checklist Progress ──────────────────────────────────────────────────────

function ChecklistProgress({ completed, total }) {
  if (!total) return null;
  const pct = Math.round((completed / total) * 100);
  const color = pct === 100 ? '#10b981' : pct > 50 ? '#3b82f6' : '#9ca3af';
  return (
    <div className="checklist-progress">
      <div className="checklist-bar-bg">
        <div
          className="checklist-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="checklist-text" style={{ fontSize: 10, color: '#888' }}>
        {completed}/{total}
      </span>
    </div>
  );
}

import CardDetailModal from './CardDetailModal';

// ─── New Ticket Modal ────────────────────────────────────────────────────────

function NewTicketModal({ onClose, onCreated, defaultColumn, users = [], labels: availableLabels = [] }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [status, setStatus] = useState(defaultColumn || 'NEW');
  const [dueDate, setDueDate] = useState('');
  const [labelIds, setLabelIds] = useState([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [clientMemberId, setClientMemberId] = useState('');
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [clientMembers, setClientMembers] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getClients()
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]));
  }, []);

  // Load client members when client changes
  useEffect(() => {
    if (clientId) {
      getClientMembers(clientId)
        .then((data) => setClientMembers(Array.isArray(data) ? data : []))
        .catch(() => setClientMembers([]));
    } else {
      setClientMembers([]);
    }
    setClientMemberId('');
  }, [clientId]);

  const toggleLabel = (id) => {
    setLabelIds((prev) => (prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!clientId) {
      alert('Please select a client');
      return;
    }
    setSaving(true);
    try {
      await createTicket({
        title: title.trim(),
        description,
        client_id: Number(clientId),
        priority,
        status,
        due_date: dueDate || null,
        label_ids_json: JSON.stringify(labelIds),
        assigned_to: assignedTo ? Number(assignedTo) : null,
        client_member_id: clientMemberId ? Number(clientMemberId) : null,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>New Ticket</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title *</label>
            <input
              className="form-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              className="form-control"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details…"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Client *</label>
              <select
                className="form-control"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || `Client #${c.id}`}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select
                className="form-control"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {ALL_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Column</label>
              <select
                className="form-control"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {KANBAN_COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <input
                type="date"
                className="form-control"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Assign To</label>
              <select
                className="form-control"
                value={assignedTo}
                onChange={(e) => { setAssignedTo(e.target.value); setClientMemberId(''); }}
              >
                <option value="">Unassigned</option>
                <optgroup label="Technicians">
                  {users.map((m) => (
                    <option key={m.id} value={m.id}>{m.name || m.email || `User #${m.id}`}</option>
                  ))}
                </optgroup>
              </select>
              {clientMembers.length > 0 && (
                <select
                  className="form-control"
                  style={{ marginTop: 4 }}
                  value={clientMemberId}
                  onChange={(e) => { setClientMemberId(e.target.value); setAssignedTo(''); }}
                >
                  <option value="">— Assign to client contact —</option>
                  {clientMembers.map((cm) => (
                    <option key={cm.id} value={cm.id}>
                      {cm.name}{cm.role ? ` (${cm.role})` : ''}{cm.email ? ` — ${cm.email}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {availableLabels.length > 0 && (
            <div className="form-group">
              <label>Labels</label>
              <div className="label-selector">
                {availableLabels.map((label) => {
                  const id = label.id;
                  const active = labelIds.includes(id);
                  const bg = label.color || getLabelColor(label.name);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`label-selector-btn ${active ? 'active' : ''}`}
                      style={{
                        background: active ? bg : '#f3f4f6',
                        color: active ? '#fff' : '#555',
                        border: `1px solid ${active ? bg : '#ddd'}`,
                      }}
                      onClick={() => toggleLabel(id)}
                    >
                      {label.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !title.trim() || !clientId}>
              {saving ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Column Menu ─────────────────────────────────────────────────────────────

function ColumnMenu({ column, onAddCard, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="column-menu"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        zIndex: 50,
        minWidth: 180,
        padding: '4px 0',
        border: '1px solid #eee',
      }}
    >
      <button
        className="column-menu-item"
        onClick={() => { onAddCard(); onClose(); }}
      >
        <Plus size={14} /> Add Card
      </button>
      <div className="column-menu-divider" />
      <div className="column-menu-section">
        <span className="column-menu-label">Column Color</span>
        <div className="column-color-options">
          {['#6366f1', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6b7280'].map(
            (c) => (
              <span
                key={c}
                className="column-color-swatch"
                style={{
                  background: c,
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  display: 'inline-block',
                  cursor: 'pointer',
                  border: column.color === c ? '2px solid #333' : '2px solid transparent',
                }}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Card ─────────────────────────────────────────────────────────────

function KanbanCard({ ticket, isOverlay, onClick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id, data: { type: 'card', ticket } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priorityClass = `priority-${(ticket.priority || 'LOW').toLowerCase()}`;
  const overdue = isOverdue(ticket.due_date);
  const dueSoon = isDueSoon(ticket.due_date);
  const labels = ticket.labels || [];
  const checklistTotal = ticket.checklist_total || 0;
  const checklistDone = ticket.checklist_completed || 0;
  const attachmentCount = ticket.attachment_count || 0;
  const commentCount = ticket.comment_count || 0;
  const members = ticket.members || (ticket.assigned_to_name ? [{ name: ticket.assigned_to_name }] : []);
  const avatarMembers = ticket.client_member
    ? [{ id: `cm-${ticket.client_member.id}`, name: ticket.client_member.name, isClient: true }, ...members.filter(m => m.name !== ticket.client_member.name)]
    : members;

  // Sort by position if available
  const cardInner = (
    <div
      className="kanban-card"
      ref={setNodeRef}
      style={style}
      {...(isOverlay ? {} : { ...attributes, ...listeners })}
      onClick={(e) => {
        if (!isDragging) onClick?.(ticket);
      }}
    >
      {/* Cover color strip */}
      {ticket.cover_color && (
        <div
          className="kanban-card-cover"
          style={{
            height: 4,
            borderRadius: '8px 8px 0 0',
            background: ticket.cover_color,
            margin: '-12px -12px 8px',
          }}
        />
      )}

      {/* Labels */}
      {labels.length > 0 && (
        <div className="kanban-card-labels">
          {labels.slice(0, 3).map((l) => (
            <LabelPill key={typeof l === 'string' ? l : (l.id || l.name)} label={l} />
          ))}
          {labels.length > 3 && (
            <span style={{ fontSize: 10, color: '#999' }}>+{labels.length - 3}</span>
          )}
        </div>
      )}

      {/* Title */}
      <div className="kanban-card-title">{ticket.title}</div>

      {/* Ticket number link */}
      {ticket.ticket_number && (
        <Link
          to={`/tickets/${ticket.id}`}
          className="kanban-card-ticket-number"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 600,
            color: '#7c83ff',
            background: 'rgba(124,131,255,0.08)',
            padding: '1px 6px',
            borderRadius: 4,
            marginBottom: 4,
            textDecoration: 'none',
          }}
        >
          {ticket.ticket_number}
        </Link>
      )}

      {/* Meta row */}
      <div className="kanban-card-meta">
        {/* Priority dot */}
        <span className={`priority-dot ${priorityClass}`} title={ticket.priority || 'LOW'} />

        {/* Due date */}
        {ticket.due_date && (
          <span
            className={`kanban-card-due ${overdue ? 'overdue' : dueSoon ? 'due-soon' : ''}`}
            title={ticket.due_date}
          >
            <Calendar size={11} />
            {formatDueDate(ticket.due_date)}
          </span>
        )}

        {/* Checklist progress */}
        {checklistTotal > 0 && (
          <ChecklistProgress completed={checklistDone} total={checklistTotal} />
        )}

        {/* Time tracked */}
        {ticket.time_entries && ticket.time_entries.length > 0 && (() => {
          const totalSec = ticket.time_entries.reduce((s, e) => s + (e.duration_seconds || 0), 0);
          const running = ticket.time_entries.find(e => e.is_running);
          return (
            <span className="kanban-card-stat" title="Time tracked">
              <Clock size={11} /> {formatDurationShort(totalSec)}{running ? ' +' : ''}
            </span>
          );
        })()}

        {/* Bottom row: attachments, comments, members */}
        <div className="kanban-card-footer">
          <div className="kanban-card-stats">
            {attachmentCount > 0 && (
              <span className="kanban-card-stat">
                <Paperclip size={11} /> {attachmentCount}
              </span>
            )}
            {commentCount > 0 && (
              <span className="kanban-card-stat">
                <MessageSquare size={11} /> {commentCount}
              </span>
            )}
          </div>
          <div className="kanban-card-members">
            {avatarMembers.slice(0, 3).map((m, i) => (
              <MemberAvatar key={m.id || i} name={m.name} size="xs" isClient={m.isClient} />
            ))}
            {avatarMembers.length > 3 && (
              <span style={{ fontSize: 10, color: '#999', marginLeft: 2 }}>+{avatarMembers.length - 3}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (isOverlay) {
    return (
      <div
        className="kanban-card"
        style={{
          boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
          transform: 'rotate(2deg)',
        }}
      >
        {/* Same content but without drag refs */}
        {ticket.cover_color && (
          <div
            style={{
              height: 4,
              borderRadius: '8px 8px 0 0',
              background: ticket.cover_color,
              margin: '-12px -12px 8px',
            }}
          />
        )}
        {labels.length > 0 && (
          <div className="kanban-card-labels" style={{ marginBottom: 6 }}>
            {labels.slice(0, 3).map((l) => (
              <LabelPill key={typeof l === 'string' ? l : (l.id || l.name)} label={l} />
            ))}
          </div>
        )}
        <div className="kanban-card-title">{ticket.title}</div>
        <div className="kanban-card-meta">
          <span className={`priority-dot ${priorityClass}`} />
          {ticket.due_date && (
            <span className="kanban-card-due">
              <Calendar size={11} /> {formatDueDate(ticket.due_date)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return cardInner;
}

// ─── Kanban Column ───────────────────────────────────────────────────────────

function KanbanColumn({ column, tickets, onCardClick, onAddCard }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    setAddingCard(false);
    setQuickTitle('');
    onAddCard?.(quickTitle.trim(), column.id);
  };

  // Make the column itself a droppable target so empty columns receive drops
  const { setNodeRef: columnDropRef, isOver: isOverColumn } = useDroppable({
    id: `column-${column.id}`,
    data: { type: 'column', columnId: column.id },
  });

  // Build items array: always include column ID so empty columns are valid sortable targets
  const sortableItems = useMemo(() => {
    const items = tickets.map((t) => t.id);
    if (items.length === 0) {
      items.push(`column-${column.id}`);
    }
    return items;
  }, [tickets, column.id]);

  return (
    <div
      className="kanban-column"
      style={{ borderTop: `3px solid ${column.color}` }}
    >
      {/* Column Header */}
      <div className="kanban-column-header">
        <div className="flex items-center gap-2">
          <h4 className="kanban-column-title">{column.title}</h4>
          <span className="kanban-count">{tickets.length}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <button
            className="column-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <ColumnMenu
              column={column}
              onAddCard={() => setAddingCard(true)}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Cards */}
      <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
        <div className="kanban-cards" ref={columnDropRef}>
          {tickets.map((ticket) => (
            <KanbanCard
              key={ticket.id}
              ticket={ticket}
              onClick={onCardClick}
            />
          ))}
          {/* Drop zone for empty columns */}
          {tickets.length === 0 && (
            <div
              className="kanban-empty-drop-zone"
              style={{
                minHeight: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: isOverColumn ? '2px dashed #6366f1' : '2px dashed #d1d5db',
                borderRadius: 8,
                background: isOverColumn ? 'rgba(99,102,241,0.05)' : 'transparent',
                transition: 'all 0.15s ease',
                color: '#9ca3af',
                fontSize: 13,
              }}
            >
              Drop here
            </div>
          )}
        </div>
      </SortableContext>

      {/* Quick Add / Add Button */}
      <div className="kanban-column-footer">
        {addingCard ? (
          <form onSubmit={handleQuickAdd} style={{ width: '100%' }}>
            <input
              className="form-control"
              style={{ fontSize: 13, marginBottom: 6 }}
              placeholder="Enter card title…"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm" disabled={!quickTitle.trim()}>
                Add
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => { setAddingCard(false); setQuickTitle(''); }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            className="kanban-add-card-btn"
            onClick={() => setAddingCard(true)}
          >
            <Plus size={14} /> Add a card
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Kanban View ─────────────────────────────────────────────────────────────

function KanbanView({ tickets, onDragEnd, onCardClick, onQuickAdd }) {
  const [activeTicket, setActiveTicket] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const columnTickets = useMemo(() => {
    const map = {};
    KANBAN_COLUMNS.forEach((col) => {
      const colCards = tickets.filter((t) => t.status === col.id);
      // Sort by position if available, then by priority, then created date
      colCards.sort((a, b) => {
        if (a.position != null && b.position != null) return a.position - b.position;
        if (a.position != null) return -1;
        if (b.position != null) return 1;
        const pa = PRIORITY_ORDER[a.priority] ?? 3;
        const pb = PRIORITY_ORDER[b.priority] ?? 3;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at) - new Date(a.created_at);
      });
      map[col.id] = colCards;
    });
    return map;
  }, [tickets]);

  const handleDragStart = useCallback(
    (event) => {
      const found = tickets.find((t) => t.id === event.active.id);
      setActiveTicket(found || null);
    },
    [tickets]
  );

  const handleDragEndWrapper = useCallback(
    (event) => {
      setActiveTicket(null);
      onDragEnd(event);
    },
    [onDragEnd]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEndWrapper}
    >
      <div className="kanban-board">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            tickets={columnTickets[col.id] || []}
            onCardClick={onCardClick}
            onAddCard={(title, colId) => onQuickAdd(title, colId)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket ? <KanbanCard ticket={activeTicket} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── List View ───────────────────────────────────────────────────────────────

function ListView({ tickets, onCardClick }) {
  // Rows open the same card modal as the kanban view, so every action (labels,
  // checklists, timers, members, attachments, copy/archive/delete) is available
  // from the list too and both views read/write the same ticket fields.
  const openCard = (ticket) => onCardClick?.(ticket);
  const linkStyle = { color: '#7c83ff', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' };
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Ticket #</th>
          <th>Title</th>
          <th>Status</th>
          <th>Priority</th>
          <th>Assigned To</th>
          <th>Client</th>
          <th>Due Date</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((ticket) => {
          const overdue = isOverdue(ticket.due_date);
          const dueSoon = isDueSoon(ticket.due_date);
          const labels = ticket.labels || [];
          return (
            <tr key={ticket.id}>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button
                  onClick={() => openCard(ticket)}
                  style={{ ...linkStyle, fontSize: 12 }}
                  title="Open card"
                >
                  {ticket.ticket_number || `#${ticket.id}`}
                </button>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openCard(ticket)}
                    style={linkStyle}
                    title="Open card"
                  >
                    {ticket.title}
                  </button>
                  {labels.length > 0 && (
                    <div className="flex gap-1">
                      {labels.slice(0, 2).map((l) => (
                        <LabelPill key={typeof l === 'string' ? l : (l.id || l.name)} label={l} />
                      ))}
                    </div>
                  )}
                </div>
              </td>
              <td>
                <span className={`badge badge-${ticket.status}`}>
                  {ticket.status.replace(/_/g, ' ')}
                </span>
              </td>
              <td>
                <span className={`priority-dot priority-${(ticket.priority || 'LOW').toLowerCase()}`} />
                {ticket.priority || 'LOW'}
              </td>
              <td>
                {ticket.assigned_to_name ? (
                  <div className="flex items-center gap-1">
                    <MemberAvatar name={ticket.assigned_to_name} size="xs" />
                    <span className="text-sm">{ticket.assigned_to_name}</span>
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="text-sm">{ticket.client_name || '—'}</td>
              <td>
                {ticket.due_date ? (
                  <span
                    className={`text-sm ${overdue ? 'text-danger' : dueSoon ? 'text-warning' : 'text-muted'}`}
                    style={overdue ? { color: '#dc2626', fontWeight: 600 } : dueSoon ? { color: '#d97706' } : {}}
                  >
                    <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {formatDueDate(ticket.due_date)}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="text-sm text-muted">
                {new Date(ticket.created_at).toLocaleDateString()}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <Link
                  to={`/tickets/${ticket.id}`}
                  title="Open full page view"
                  style={{ color: '#9ca3af', display: 'inline-flex', alignItems: 'center' }}
                >
                  <ExternalLink size={14} />
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Board Header ────────────────────────────────────────────────────────────

function BoardHeader({
  view,
  setView,
  searchQuery,
  setSearchQuery,
  memberFilter,
  setMemberFilter,
  priorityFilter,
  setPriorityFilter,
  dueDateFilter,
  setDueDateFilter,
  showArchived,
  setShowArchived,
  statusFilter,
  setStatusFilter,
  onNewTicket,
  memberOptions,
  totalCards,
}) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="board-header with-wave">
      <div className="board-header-top">
        <div className="board-title-section">
          <h2 className="board-title">
            <LayoutGrid size={22} />
            Tickets Board
          </h2>
          <span className="board-card-count">{totalCards} cards</span>
        </div>

        <div className="board-actions">
          {/* View toggle — far left */}
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${view === 'kanban' ? 'active' : ''}`}
              onClick={() => setView('kanban')}
              title="Kanban view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>

          {/* Search */}
          <div className="board-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search cards…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button
            className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} /> Filters
          </button>

          {/* Archive toggle */}
          <button
            className={`btn btn-sm ${showArchived ? 'btn-warning' : 'btn-outline'}`}
            onClick={() => setShowArchived(!showArchived)}
            title={showArchived ? 'Hide archived' : 'Show archived'}
          >
            {showArchived ? <EyeOff size={14} /> : <Archive size={14} />}
            {showArchived ? 'Hide Archived' : 'Archived'}
          </button>

          {/* New ticket */}
          <button className="btn btn-primary btn-sm" onClick={onNewTicket}>
            <Plus size={14} /> New Ticket
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="board-filters">
          <div className="filter-group">
            <label>Member</label>
            <select
              className="form-control"
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
            >
              <option value="">All Members</option>
              {memberOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Priority</label>
            <select
              className="form-control"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">All Priorities</option>
              {ALL_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Due Date</label>
            <select
              className="form-control"
              value={dueDateFilter}
              onChange={(e) => setDueDateFilter(e.target.value)}
            >
              <option value="">Any Time</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="none">No Due Date</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="NEW">New</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="WAITING_ON_CLIENT">Waiting on Client</option>
              <option value="WAITING_ON_US">Waiting on Us</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          {(memberFilter || priorityFilter || dueDateFilter || statusFilter || searchQuery) && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setMemberFilter('');
                setPriorityFilter('');
                setDueDateFilter('');
                setStatusFilter('');
                setSearchQuery('');
              }}
            >
              Clear All
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Tickets Component ──────────────────────────────────────────────────

export default function Tickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'list';

  const [tickets, setTickets] = useState([]);
  const [labels, setLabels] = useState([]);
  const [boardStats, setBoardStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [dueDateFilter, setDueDateFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [cardDetailTicket, setCardDetailTicket] = useState(null);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);

  // All users for member picker
  const [allUsers, setAllUsers] = useState([]);
  const [allClients, setAllClients] = useState([]);

  // Fetch tickets, labels, board stats, users, and clients
  const fetchData = useCallback(async () => {
    try {
      const [ticketsData, labelsData, statsData, usersData, clientsData] = await Promise.all([
        getTickets(),
        getLabels().catch(() => []),
        getBoardStats().catch(() => null),
        getUsers().catch(() => []),
        getClients().catch(() => []),
      ]);
      setTickets(Array.isArray(ticketsData) ? ticketsData : []);
      setLabels(Array.isArray(labelsData) ? labelsData : []);
      setBoardStats(statsData);
      setAllUsers(Array.isArray(usersData) ? usersData : []);
      setAllClients(Array.isArray(clientsData) ? clientsData : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch tickets when view switches to ensure fresh data (comments, visibility, etc.)
  useEffect(() => {
    if (tickets.length > 0) {
      fetchData();
    }
  }, [view]);

  // Auto-open ticket modal when navigating from ticket detail → kanban
  useEffect(() => {
    const ticketId = searchParams.get('ticket');
    if (ticketId && !loading && tickets.length > 0) {
      const found = tickets.find((t) => String(t.id) === ticketId);
      if (found) {
        setCardDetailTicket(found);
        // Clean up the URL param so reopening the page doesn't re-trigger
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('ticket');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [searchParams, loading, tickets]);

  // Keep cardDetailTicket in sync with tickets array (e.g. after modal edits)
  useEffect(() => {
    if (cardDetailTicket) {
      const updated = tickets.find((t) => t.id === cardDetailTicket.id);
      if (updated) {
        // Compare relevant fields to avoid infinite loops
        const keys = ['title', 'status', 'priority', 'due_date', 'assigned_to', 'client_member_id', 'cover_color', 'members', 'labels', 'time_entries', 'comments'];
        const changed = keys.some((k) => JSON.stringify(updated[k]) !== JSON.stringify(cardDetailTicket[k]));
        if (changed) {
          setCardDetailTicket(updated);
        }
      }
    }
  }, [tickets]);

  // Member options from all users (not just those assigned to tickets)
  const memberOptions = useMemo(() => {
    const names = new Set();
    allUsers.forEach((u) => {
      if (u.name) names.add(u.name);
    });
    return Array.from(names).sort();
  }, [allUsers]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (t.title || '').toLowerCase().includes(q);
        const matchClient = (t.client_name || '').toLowerCase().includes(q);
        const matchId = String(t.id).includes(q);
        if (!matchTitle && !matchClient && !matchId) return false;
      }
      // Member filter
      if (memberFilter && t.assigned_to_name !== memberFilter) return false;
      // Priority filter
      if (priorityFilter && t.priority !== priorityFilter) return false;
      // Due date filter
      if (dueDateFilter) {
        const due = t.due_date ? new Date(t.due_date) : null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        switch (dueDateFilter) {
          case 'overdue':
            if (!due || due >= now) return false;
            break;
          case 'today':
            if (!due) return false;
            {
              const tomorrow = new Date(now);
              tomorrow.setDate(tomorrow.getDate() + 1);
              if (due < now || due >= tomorrow) return false;
            }
            break;
          case 'week':
            if (!due) return false;
            {
              const weekEnd = new Date(now);
              weekEnd.setDate(weekEnd.getDate() + 7);
              if (due < now || due >= weekEnd) return false;
            }
            break;
          case 'month':
            if (!due) return false;
            {
              const monthEnd = new Date(now);
              monthEnd.setMonth(monthEnd.getMonth() + 1);
              if (due < now || due >= monthEnd) return false;
            }
            break;
          case 'none':
            if (due) return false;
            break;
        }
      }
      // Status filter
      if (statusFilter && t.status !== statusFilter) return false;
      // Archived filter
      if (!showArchived && (t.status === 'CLOSED' || t.archived)) return false;
      return true;
    });
  }, [tickets, searchQuery, memberFilter, priorityFilter, dueDateFilter, statusFilter, showArchived]);

  // Sort: by priority then created date
  const sortedTickets = useMemo(() => {
    return [...filteredTickets].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 3;
      const pb = PRIORITY_ORDER[b.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [filteredTickets]);

  // Drag end handler
  const handleDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id;
      const overId = over.id;

      let newStatus = null;
      let newPosition = null;

      // Check if dropped on a column (direct match or prefixed "column-X")
      const columnMatch = KANBAN_COLUMNS.find(
        (c) => c.id === overId || overId === `column-${c.id}`
      );
      if (columnMatch) {
        newStatus = columnMatch.id;
        // Calculate position: place at end of column
        const colTickets = tickets.filter((t) => t.status === columnMatch.id && t.id !== activeId);
        newPosition = colTickets.length > 0
          ? Math.max(...colTickets.map(t => t.position ?? 0)) + 1000
          : 0;
      } else {
        // Dropped on another card
        const overTicket = tickets.find((t) => t.id === overId);
        if (overTicket) {
          newStatus = overTicket.status;
          // Calculate position: average of neighbor positions
          const colCards = tickets
            .filter((t) => t.status === overTicket.status && t.id !== activeId)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          const overIdx = colCards.findIndex((t) => t.id === overId);
          const prevCard = colCards[overIdx - 1];
          const nextCard = colCards[overIdx + 1];
          const prevPos = prevCard ? (prevCard.position ?? 0) : -1000;
          const nextPos = nextCard ? (nextCard.position ?? (prevPos + 2000)) : (prevPos + 2000);
          newPosition = Math.round((prevPos + nextPos) / 2);
          // If positions are too close, use a larger gap
          if (nextPos - prevPos < 2) newPosition = prevPos + 1000;
        }
      }

      if (!newStatus) return;

      const activeTicket = tickets.find((t) => t.id === activeId);
      if (!activeTicket) return;
      if (activeTicket.status === newStatus && newPosition == null) return;

      // Optimistic update
      setTickets((prev) =>
        prev.map((t) => (t.id === activeId ? { ...t, status: newStatus, position: newPosition ?? t.position } : t))
      );

      try {
        await moveTicket(activeId, { status: newStatus, position: newPosition });
      } catch (err) {
        // Revert
        setTickets((prev) =>
          prev.map((t) => (t.id === activeId ? activeTicket : t))
        );
        alert(err.message);
      }
    },
    [tickets]
  );

  // Quick add card from column
  const handleQuickAdd = useCallback(
    async (title, columnId) => {
      try {
        const defaultClientId = allClients.length > 0 ? allClients[0].id : null;
        if (!defaultClientId) {
          alert('No clients available. Please create a client first.');
          return;
        }
        const newTicket = await createTicket({
          title,
          status: columnId,
          priority: 'MEDIUM',
          client_id: defaultClientId,
          description: '',
          due_date: null,
          label_ids_json: '[]',
          assigned_to: null,
        });
        setTickets((prev) => [...prev, newTicket]);
      } catch (err) {
        alert(err.message);
      }
    },
    [allClients]
  );

  const setView = (newView) => {
    setSearchParams({ view: newView });
  };

  return (
    <div className="tickets-page">
      <BoardHeader
      view={view}
      setView={setView}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      memberFilter={memberFilter}
      setMemberFilter={setMemberFilter}
      priorityFilter={priorityFilter}
      setPriorityFilter={setPriorityFilter}
      dueDateFilter={dueDateFilter}
      setDueDateFilter={setDueDateFilter}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      showArchived={showArchived}
      setShowArchived={setShowArchived}
      onNewTicket={() => setShowNewTicketModal(true)}
      memberOptions={memberOptions}
      totalCards={sortedTickets.length}
      />

      {loading ? (
        <div className="loading-spinner">Loading board…</div>
      ) : error ? (
        <div className="empty-state">
          <AlertCircle size={32} /> {error}
        </div>
      ) : sortedTickets.length === 0 ? (
        <div className="empty-state">
          <LayoutGrid size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
          <h3>No cards found</h3>
          <p style={{ color: '#888', marginTop: 8 }}>
            {searchQuery || memberFilter || priorityFilter || dueDateFilter
              ? 'Try adjusting your filters'
              : 'Create a new ticket to get started'}
          </p>
          {!searchQuery && !memberFilter && !priorityFilter && !dueDateFilter && (
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => setShowNewTicketModal(true)}
            >
              <Plus size={16} /> Create Ticket
            </button>
          )}
        </div>
      ) : view === 'kanban' ? (
        <KanbanView
          tickets={sortedTickets}
          onDragEnd={handleDragEnd}
          onCardClick={setCardDetailTicket}
          onQuickAdd={handleQuickAdd}
        />
      ) : (
        <ListView tickets={sortedTickets} onCardClick={setCardDetailTicket} />
      )}

      {/* Card Detail Modal */}
      {cardDetailTicket && (
        <CardDetailModal
          ticket={cardDetailTicket}
          isOpen={!!cardDetailTicket}
          onClose={() => setCardDetailTicket(null)}
          onUpdate={fetchData}
          onArchive={async (t) => {
            try { await archiveTicket(t.id); } catch (err) { console.error('Archive failed:', err); }
            setCardDetailTicket(null);
            fetchData();
          }}
          onDelete={async (t) => {
            try { await deleteTicket(t.id); } catch (err) { console.error('Delete failed:', err); }
            setCardDetailTicket(null);
            fetchData();
          }}
          labels={labels}
          members={allUsers}
        />
      )}

      {/* New Ticket Modal */}
      {showNewTicketModal && (
        <NewTicketModal
          onClose={() => setShowNewTicketModal(false)}
          onCreated={fetchData}
          users={allUsers}
          labels={labels}
        />
      )}
    </div>
  );
}
