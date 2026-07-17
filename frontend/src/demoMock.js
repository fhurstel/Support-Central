// Offline demo shim: intercepts every /api call and serves baked-in data so the
// whole SPA runs in the browser with no backend. Used only by the demo build
// (main.demo.jsx); the real app never imports this. Data was captured from the
// PocketBase backend, so shapes match production exactly.
import data from './demoData.json';

const store = JSON.parse(JSON.stringify(data.store || {}));
const USER = data.user;
const now = () => new Date().toISOString();

try {
  if (!localStorage.getItem('fiji_token')) {
    localStorage.setItem('fiji_token', 'demo-token');
    localStorage.setItem('fiji_user', JSON.stringify(USER));
  }
} catch { /* ignore */ }

const jsonRes = (body, status = 200) =>
  new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function apiPath(rawUrl) {
  let u;
  try { u = new URL(rawUrl, location.href); } catch { return { path: rawUrl, query: '', params: new URLSearchParams() }; }
  let p = u.pathname;
  const i = p.indexOf('/api');
  if (i >= 0) p = p.slice(i + 4);
  return { path: p.replace(/\/$/, '') || '/', query: u.search, params: u.searchParams };
}

const list = (key) => (Array.isArray(store[key]) ? store[key] : (store[key] = []));
const maxId = (arr) => arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
const findRow = (key, id) => list(key).find((x) => String(x.id) === String(id));
const removeRow = (key, id) => { store[key] = list(key).filter((x) => String(x.id) !== String(id)); };
const clientById = (id) => list('/clients').find((c) => String(c.id) === String(id));
const userById = (id) => list('/users').find((u) => String(u.id) === String(id));

function newTicket(fields) {
  const arr = list('/tickets');
  const id = maxId(arr) + 1;
  const cl = fields.client_id ? clientById(fields.client_id) : null;
  const asg = fields.assigned_to ? userById(fields.assigned_to) : null;
  const t = {
    id, ticket_number: `FIT-${String(id).padStart(5, '0')}`,
    title: fields.title || 'New ticket', description: fields.description || '',
    status: fields.status || 'NEW', priority: fields.priority || 'MEDIUM',
    client_id: fields.client_id || null, assigned_to: fields.assigned_to || null,
    client_name: cl ? cl.name : null, client_email: cl ? cl.email : null,
    assigned_to_name: asg ? asg.name : null, assigned_to_email: asg ? asg.email : null, assigned_to_phone: asg ? asg.phone : null,
    total_time: 0, total_time_hours: 0, created_at: now(), updated_at: now(),
    closed_at: null, completed_at: null, due_date: fields.due_date || null, start_date: null,
    cover_color: null, position: id, is_archived: false,
    checklist_total: 0, checklist_completed: 0, attachment_count: 0,
    labels: fields.labels || [], checklists: fields.checklists || [], members: [],
    label_ids_json: '[]', member_ids_json: '[]', custom_fields: {},
  };
  arr.push(t);
  store[`/tickets/${id}`] = t;
  return t;
}

function updateTicketRow(id, patch) {
  const row = findRow('/tickets', id);
  if (row) Object.assign(row, patch, { updated_at: now() });
  if (store[`/tickets/${id}`]) Object.assign(store[`/tickets/${id}`], patch);
  return row;
}

function syncTimeEntries(ticketId) {
  const tr = findRow('/tickets', ticketId);
  if (!tr) return;
  const arr = store[`/tickets/${ticketId}/time`] || [];
  tr.time_entries = arr;
  tr.total_time = arr.reduce((s, e) => s + (e.duration_seconds || 0), 0);
  tr.total_time_hours = Math.round((tr.total_time / 3600) * 100) / 100;
}

function buildBoard() {
  const statuses = ['NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'DONE'];
  const tickets = list('/tickets').filter((t) => !t.is_archived);
  return {
    columns: statuses.map((s) => ({ status: s, name: s, tickets: tickets.filter((t) => t.status === s) })),
    labels: list('/labels'),
    members: list('/users'),
  };
}
function buildBoardStats() {
  const tickets = list('/tickets').filter((t) => !t.is_archived);
  const by = (k) => tickets.reduce((m, t) => { m[t[k]] = (m[t[k]] || 0) + 1; return m; }, {});
  return { total_tickets: tickets.length, by_status: by('status'), by_priority: by('priority'), overdue_count: 0, completed_this_week: 0 };
}

function logActivity(ticketId, type, detail) {
  const key = `/tickets/${ticketId}/activity`;
  const arr = list(key);
  arr.unshift({ id: maxId(arr) + 1000, ticket_id: Number(ticketId), type, action_type: type,
    action_detail: JSON.stringify(detail || {}), description: JSON.stringify(detail || {}),
    user: USER, user_name: USER.name, created_at: now() });
}

function handle(method, path, query, params, body) {
  let m;

  // ---- auth ----
  if (path === '/auth/login')
    return { access_token: 'demo-token', refresh_token: 'demo-refresh', token_type: 'bearer', user: USER };
  if (path === '/auth/refresh')
    return { access_token: 'demo-token', refresh_token: 'demo-refresh', token_type: 'bearer' };
  if (path === '/auth/me' || path === '/users/me') return USER;

  // ---- board (always recomputed so kanban stays correct) ----
  if (method === 'GET' && path === '/board') return buildBoard();
  if (method === 'GET' && path === '/board/stats') return buildBoardStats();
  if (method === 'POST' && path === '/board/reorder') {
    (body.items || body.tickets || []).forEach((it) => {
      if (it && it.id !== undefined) updateTicketRow(it.id, { ...(it.status ? { status: it.status } : {}), ...(it.position !== undefined ? { position: it.position } : {}) });
    });
    return { ok: true };
  }

  // ---- comments ----
  if (path === '/comments' && method === 'POST') {
    const tid = params.get('ticket_id') || body.ticket_id;
    const arr = list(`/comments/ticket/${tid}`);
    const c = { id: maxId(arr) + 1000, ticket_id: Number(tid), author_id: USER.id, author: USER,
      body: body.body ?? body.content ?? '', visibility: body.visibility || 'PUBLIC',
      emailed_to_client: !!body.email_to_client, created_at: now(), attachments: [] };
    arr.push(c);
    logActivity(tid, 'commented', {});
    return c;
  }

  // ---- leads ----
  if (path === '/leads' && method === 'POST') {
    const arr = list('/leads'); const id = maxId(arr) + 1;
    const l = { id, status: 'NEW', created_at: now(), reviewed_at: null, converted_ticket_id: null, denial_reason: null, ...body };
    arr.push(l); return l;
  }
  if ((m = path.match(/^\/leads\/(\w+)\/review$/)) && method === 'POST') {
    const lead = findRow('/leads', m[1]);
    if (!lead) return { detail: 'Not found' };
    const action = body.action || (body.approved === false ? 'deny' : 'approve');
    if (action === 'deny') {
      lead.status = 'DENIED'; lead.denial_reason = body.denial_reason || null; lead.reviewed_at = now();
      return lead;
    }
    const t = newTicket({ title: body.title || lead.subject, description: lead.body || '', client_id: body.client_id || null });
    logActivity(t.id, 'created', { fromLead: lead.id });
    lead.status = 'CONVERTED'; lead.converted_ticket_id = t.id; lead.reviewed_at = now();
    return lead;
  }

  // ---- tickets: actions ----
  if ((m = path.match(/^\/tickets\/(\w+)\/close$/)) && method === 'POST')
    return updateTicketRow(m[1], { status: 'DONE', closed_at: now(), completed_at: now() }) || {};
  if ((m = path.match(/^\/tickets\/(\w+)\/move$/)) && method === 'POST') {
    const before = findRow('/tickets', m[1]);
    const from = before && before.status;
    const r = updateTicketRow(m[1], { ...(body.status ? { status: body.status } : {}), ...(body.position !== undefined ? { position: body.position } : {}) });
    if (body.status && body.status !== from) logActivity(m[1], 'moved', { from, to: body.status });
    return r || { ok: true };
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/(archive|unarchive)$/)) && method === 'POST')
    return updateTicketRow(m[1], { is_archived: m[2] === 'archive', archived_at: m[2] === 'archive' ? now() : null }) || { ok: true };
  if ((m = path.match(/^\/tickets\/(\w+)\/copy$/)) && method === 'POST') {
    const src = findRow('/tickets', m[1]); if (!src) return { detail: 'Not found' };
    const t = newTicket({ ...src, title: (src.title || '') + ' (copy)', status: src.status,
      labels: JSON.parse(JSON.stringify(src.labels || [])),
      checklists: JSON.parse(JSON.stringify(src.checklists || [])) });
    logActivity(t.id, 'created', { copiedFrom: src.id });
    return t;
  }
  if ((m = path.match(/^\/tickets\/(\w+)$/)) && method === 'DELETE') {
    removeRow('/tickets', m[1]); delete store[`/tickets/${m[1]}`];
    return null;
  }

  // ---- time entries ----
  if ((m = path.match(/^\/tickets\/(\w+)\/time\/start$/)) && method === 'POST') {
    const arr = list(`/tickets/${m[1]}/time`);
    const e = { id: maxId(arr) + 1000, ticket_id: Number(m[1]), user_id: USER.id, user: USER,
      started_at: now(), ended_at: null, duration_seconds: null, is_running: true, description: '' };
    arr.push(e); syncTimeEntries(m[1]); return e;
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/time\/stop$/)) && method === 'POST') {
    const arr = list(`/tickets/${m[1]}/time`);
    const running = [...arr].reverse().find((e) => e.is_running);
    if (running) {
      running.is_running = false; running.ended_at = now();
      running.duration_seconds = Math.max(60, Math.round((Date.now() - new Date(running.started_at)) / 1000));
    }
    syncTimeEntries(m[1]);
    return running || { ok: true };
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/time\/manual$/)) && method === 'POST') {
    const arr = list(`/tickets/${m[1]}/time`);
    const e = { id: maxId(arr) + 1000, ticket_id: Number(m[1]), user_id: USER.id, user: USER,
      started_at: body.started_at || now(), ended_at: body.ended_at || now(),
      duration_seconds: body.duration_seconds || (body.hours ? body.hours * 3600 : 3600),
      is_running: false, description: body.description || body.note || '' };
    arr.push(e); syncTimeEntries(m[1]); return e;
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/time\/(\w+)$/)) && method === 'PATCH') {
    const e = findRow(`/tickets/${m[1]}/time`, m[2]);
    if (e) Object.assign(e, body);
    syncTimeEntries(m[1]);
    return e || { ok: true };
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/time\/(\w+)$/)) && method === 'DELETE') {
    removeRow(`/tickets/${m[1]}/time`, m[2]); syncTimeEntries(m[1]); return null;
  }

  // ---- ticket labels ----
  if ((m = path.match(/^\/tickets\/(\w+)\/labels$/)) && method === 'POST') {
    const t = findRow('/tickets', m[1]); const lbl = findRow('/labels', body.label_id);
    if (t && lbl && !(t.labels || []).some((x) => x.id === lbl.id)) {
      t.labels = [...(t.labels || []), lbl];
      logActivity(t.id, 'added_label', { labelName: lbl.name });
    }
    return (t && t.labels) || [];
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/labels\/(\w+)$/)) && method === 'DELETE') {
    const t = findRow('/tickets', m[1]);
    if (t) t.labels = (t.labels || []).filter((x) => String(x.id) !== String(m[2]));
    return (t && t.labels) || [];
  }

  // ---- ticket members ----
  if ((m = path.match(/^\/tickets\/(\w+)\/members$/)) && method === 'POST') {
    const t = findRow('/tickets', m[1]); const u = userById(body.user_id);
    if (t && u && !(t.members || []).some((x) => x.id === u.id)) t.members = [...(t.members || []), u];
    return (t && t.members) || [];
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/members\/(\w+)$/)) && method === 'DELETE') {
    const t = findRow('/tickets', m[1]);
    if (t) t.members = (t.members || []).filter((x) => String(x.id) !== String(m[2]));
    return (t && t.members) || [];
  }

  // ---- checklists ----
  if ((m = path.match(/^\/tickets\/(\w+)\/checklists$/)) && method === 'POST') {
    const t = findRow('/tickets', m[1]);
    const cl = { id: Date.now(), ticket_id: Number(m[1]), title: body.title || 'Checklist', position: ((t && t.checklists) || []).length + 1, items: [] };
    if (t) t.checklists = [...(t.checklists || []), cl];
    return cl;
  }
  if ((m = path.match(/^\/checklists\/(\w+)\/items$/)) && method === 'POST') {
    for (const t of list('/tickets')) {
      const cl = (t.checklists || []).find((c) => String(c.id) === String(m[1]));
      if (cl) {
        const it = { id: Date.now(), checklist_id: cl.id, text: body.text || body.title || '', completed: false, position: cl.items.length + 1 };
        cl.items.push(it); return it;
      }
    }
    return { ok: true };
  }
  if ((m = path.match(/^\/checklist-items\/(\w+)$/)) && (method === 'PUT' || method === 'PATCH')) {
    for (const t of list('/tickets')) for (const cl of (t.checklists || [])) {
      const it = cl.items.find((x) => String(x.id) === String(m[1]));
      if (it) {
        if (body.is_completed !== undefined) it.completed = body.is_completed;
        if (body.completed !== undefined) it.completed = body.completed;
        if (body.text !== undefined) it.text = body.text;
        t.checklist_total = (t.checklists || []).reduce((n, c) => n + c.items.length, 0);
        t.checklist_completed = (t.checklists || []).reduce((n, c) => n + c.items.filter((x) => x.completed).length, 0);
        return it;
      }
    }
    return { ok: true };
  }
  if ((m = path.match(/^\/checklist-items\/(\w+)$/)) && method === 'DELETE') {
    for (const t of list('/tickets')) for (const cl of (t.checklists || []))
      cl.items = cl.items.filter((x) => String(x.id) !== String(m[1]));
    return null;
  }
  if ((m = path.match(/^\/checklists\/(\w+)$/)) && method === 'DELETE') {
    for (const t of list('/tickets')) t.checklists = (t.checklists || []).filter((c) => String(c.id) !== String(m[1]));
    return null;
  }
  if ((m = path.match(/^\/checklists\/(\w+)\/toggle-all$/)) && method === 'POST') {
    for (const t of list('/tickets')) {
      const cl = (t.checklists || []).find((c) => String(c.id) === String(m[1]));
      if (cl) { const all = cl.items.every((i) => i.completed); cl.items.forEach((i) => { i.completed = !all; }); return cl; }
    }
    return { ok: true };
  }

  // ---- tickets: CRUD ----
  if ((m = path.match(/^\/tickets\/(\w+)$/)) && method === 'PATCH')
    return updateTicketRow(m[1], body) || {};
  if (path === '/tickets' && method === 'POST') {
    const t = newTicket(body); logActivity(t.id, 'created', {}); return t;
  }

  // ---- client members ----
  if ((m = path.match(/^\/clients\/(\w+)\/members$/)) && method === 'POST') {
    const key = `/clients/${m[1]}/members`; const arr = list(key);
    const cm = { id: maxId(arr) + 1000, client_id: Number(m[1]), is_primary: false, is_active: true, ...body };
    arr.push(cm); return cm;
  }
  if ((m = path.match(/^\/clients\/(\w+)\/members\/(\w+)$/)) && method === 'PATCH') {
    const cm = findRow(`/clients/${m[1]}/members`, m[2]);
    if (cm) Object.assign(cm, body);
    return cm || { ok: true };
  }
  if ((m = path.match(/^\/clients\/(\w+)\/members\/(\w+)$/)) && method === 'DELETE') {
    removeRow(`/clients/${m[1]}/members`, m[2]); return null;
  }

  // ---- invoicing: unbilled time, line items + tax, mark-paid, reports ----
  if (path === '/invoices/unbilled' && method === 'GET') {
    const cid = Number(params.get('client_id'));
    const billed = new Set();
    list('/invoices').forEach((inv) => (inv.items || []).forEach((it) => { if (it.time_entry_id) billed.add(Number(it.time_entry_id)); }));
    const out = [];
    list('/tickets').filter((t) => Number(t.client_id) === cid).forEach((t) => {
      (store[`/tickets/${t.id}/time`] || []).forEach((e) => {
        if (e.is_running || !e.duration_seconds || billed.has(Number(e.id))) return;
        out.push({ ...e, ticket_title: t.title, ticket_number: t.ticket_number, hours: Math.round((e.duration_seconds / 3600) * 100) / 100 });
      });
    });
    return out;
  }
  if (path === '/invoices/reports' && method === 'GET') {
    let invs = list('/invoices');
    const from = params.get('from'); const to = params.get('to');
    if (from) invs = invs.filter((i) => (i.created_at || '') >= from);
    if (to) invs = invs.filter((i) => (i.created_at || '').slice(0, 10) <= to);
    const st = (i) => String(i.status || 'DRAFT').toUpperCase();
    const sum = (rows) => Math.round(rows.reduce((s, i) => s + (i.total_amount || 0), 0) * 100) / 100;
    const byStatus = {}; const byClient = {}; const byMonth = {};
    invs.forEach((i) => {
      const s = st(i); byStatus[s] = byStatus[s] || { count: 0, amount: 0 };
      byStatus[s].count += 1; byStatus[s].amount += i.total_amount || 0;
      const ck = i.client_id || 0;
      byClient[ck] = byClient[ck] || { client_id: i.client_id, client_name: i.client_name || '(no client)', count: 0, invoiced: 0, paid: 0, outstanding: 0 };
      byClient[ck].count += 1; byClient[ck].invoiced += i.total_amount || 0;
      if (s === 'PAID') byClient[ck].paid += i.total_amount || 0;
      if (s === 'SENT' || s === 'OVERDUE') byClient[ck].outstanding += i.total_amount || 0;
      const m = (i.created_at || '').slice(0, 7) || 'unknown';
      byMonth[m] = byMonth[m] || { month: m, count: 0, invoiced: 0, paid: 0 };
      byMonth[m].count += 1; byMonth[m].invoiced += i.total_amount || 0;
      if (s === 'PAID') byMonth[m].paid += i.total_amount || 0;
    });
    return {
      from: from || null, to: to || null,
      totals: {
        invoice_count: invs.length, invoiced: sum(invs),
        paid: sum(invs.filter((i) => st(i) === 'PAID')),
        outstanding: sum(invs.filter((i) => ['SENT', 'OVERDUE'].includes(st(i)))),
        overdue: sum(invs.filter((i) => st(i) === 'OVERDUE')),
        draft: sum(invs.filter((i) => st(i) === 'DRAFT')),
        hours_billed: Math.round(invs.reduce((s, i) => s + (i.total_hours || 0), 0) * 100) / 100,
      },
      by_status: byStatus,
      by_client: Object.values(byClient).sort((a, b) => b.invoiced - a.invoiced),
      by_month: Object.values(byMonth).sort((a, b) => (a.month < b.month ? -1 : 1)),
    };
  }
  if ((m = path.match(/^\/invoices\/(\w+)\/mark-paid$/)) && method === 'POST') {
    const row = findRow('/invoices', m[1]);
    if (row) { row.status = 'PAID'; row.paid_at = now(); }
    return row || { ok: true };
  }

  // ---- generic create/update/delete for simple collections ----
  const collections = ['/clients', '/invoices', '/kb', '/labels'];
  if (collections.includes(path) && method === 'POST') {
    const arr = list(path); const id = maxId(arr) + 1;
    const row = { id, created_at: now(), ...body };
    if (path === '/invoices') {
      row.invoice_number = row.invoice_number || `INV-${String(id).padStart(5, '0')}`;
      const items = (Array.isArray(body.items) ? body.items : []).map((it) => {
        const hours = Math.round(Number(it.hours || 0) * 100) / 100;
        const rate = Math.round(Number(it.rate || 0) * 100) / 100;
        const amount = it.amount !== undefined ? Math.round(Number(it.amount) * 100) / 100 : Math.round(hours * rate * 100) / 100;
        return { description: String(it.description || ''), hours, rate, amount, time_entry_id: it.time_entry_id || null };
      });
      row.items = items;
      row.subtotal = Math.round(items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
      row.tax_rate = Number(body.tax_rate) || 0;
      row.tax_amount = Math.round(row.subtotal * row.tax_rate) / 100;
      row.total_amount = Math.round((row.subtotal + row.tax_amount) * 100) / 100;
      row.total_hours = Math.round(items.reduce((s, it) => s + (it.hours || 0), 0) * 100) / 100;
      row.amount = row.total_amount; row.status = row.status || 'DRAFT';
      const cl = clientById(row.client_id); row.client_name = cl ? cl.name : null; row.client = cl || null;
    }
    arr.push(row); store[`${path}/${id}`] = row; return row;
  }
  for (const base of collections) {
    if ((m = path.match(new RegExp(`^${base}/(\\w+)$`)))) {
      if (method === 'PATCH' || method === 'PUT') {
        const row = findRow(base, m[1]);
        if (row) Object.assign(row, body, { updated_at: now() });
        if (store[`${base}/${m[1]}`]) Object.assign(store[`${base}/${m[1]}`], body);
        return row || body;
      }
      if (method === 'DELETE') { removeRow(base, m[1]); return null; }
    }
  }
  if ((m = path.match(/^\/invoices\/(\w+)\/send$/)) && method === 'POST') {
    const row = findRow('/invoices', m[1]);
    if (row) { row.status = 'SENT'; row.sent_at = now(); }
    return row || { ok: true };
  }

  // ---- voice settings (POST or PATCH) ----
  if (path === '/settings/voice-agent' && (method === 'POST' || method === 'PATCH')) {
    store['/settings/voice-agent'] = Object.assign({}, store['/settings/voice-agent'] || {}, body);
    return store['/settings/voice-agent'];
  }

  // ---- call logs ----
  if (path === '/call-logs' && method === 'POST') {
    const arr = list('/call-logs'); const row = { id: maxId(arr) + 1, created_at: now(), ...body };
    arr.push(row); return row;
  }

  // ---- reads ----
  if (method === 'GET') {
    if (store[path + query] !== undefined) return store[path + query];
    if (store[path] !== undefined) return store[path];
    if (path.startsWith('/poppy')) return path.includes('boards') || path.includes('chats') ? [] : {};
    return [];
  }

  return body && Object.keys(body).length ? { id: Date.now(), created_at: now(), ...body } : { ok: true };
}

const realFetch = window.fetch ? window.fetch.bind(window) : null;

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (!/\/api(\/|$|\?)/.test(url)) {
    return realFetch ? realFetch(input, init) : jsonRes({}, 200);
  }
  const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
  const { path, query, params } = apiPath(url);
  let body = {};
  try { body = init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }

  await new Promise((r) => setTimeout(r, 50));
  try {
    const result = handle(method, path, query, params, body);
    return jsonRes(result, result === null ? 204 : 200);
  } catch (e) {
    return jsonRes({ detail: 'demo error' }, 200);
  }
};

// eslint-disable-next-line no-console
console.info('%cFiji IT — offline demo', 'color:#6b6bff;font-weight:bold', '(all data is in-browser; no backend)');
