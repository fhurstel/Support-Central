// Offline demo shim: intercepts every /api call and serves baked-in data so the
// whole SPA runs in the browser with no backend. Used only by the demo build
// (main.demo.jsx); the real app never imports this.
import data from './demoData.json';

const store = JSON.parse(JSON.stringify(data.store || {}));
const USER = data.user;
const now = () => new Date().toISOString();

// Land logged in so the demo opens on the dashboard (Sign Out still shows login).
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
  try { u = new URL(rawUrl, location.href); } catch { return { path: rawUrl, query: '' }; }
  let p = u.pathname;
  const i = p.indexOf('/api');
  if (i >= 0) p = p.slice(i + 4);
  return { path: p.replace(/\/$/, '') || '/', query: u.search };
}

const list = (key) => (Array.isArray(store[key]) ? store[key] : (store[key] = []));
const maxId = (arr) => arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
const findRow = (key, id) => list(key).find((x) => String(x.id) === String(id));

function updateTicketRow(id, patch) {
  const row = findRow('/tickets', id);
  if (row) Object.assign(row, patch);
  if (store[`/tickets/${id}`]) Object.assign(store[`/tickets/${id}`], patch);
  // keep board card in sync
  const board = store['/board'];
  if (board && Array.isArray(board.columns)) {
    for (const col of board.columns) {
      const card = (col.tickets || col.cards || []).find((c) => String(c.id) === String(id));
      if (card) Object.assign(card, patch);
    }
  }
}

function handle(method, path, query, body) {
  // ---- auth ----
  if (path === '/auth/login')
    return { access_token: 'demo-token', refresh_token: 'demo-refresh', token_type: 'bearer', user: USER };
  if (path === '/auth/refresh')
    return { access_token: 'demo-token', refresh_token: 'demo-refresh', token_type: 'bearer' };
  if (path === '/auth/me' || path === '/users/me') return USER;

  // ---- comments ----
  let m;
  if ((m = path.match(/^\/comments$/)) && method === 'POST') {
    const tid = body.ticket_id;
    const key = `/comments/ticket/${tid}`;
    const arr = list(key);
    const c = {
      id: maxId(arr) + 1000, ticket_id: tid,
      author_id: USER.id, author: USER,
      body: body.body ?? body.content ?? '',
      visibility: body.visibility || 'PUBLIC',
      emailed_to_client: !!body.emailed_to_client,
      created_at: now(), attachments: [],
    };
    arr.push(c);
    return c;
  }

  // ---- tickets ----
  if ((m = path.match(/^\/tickets\/(\w+)\/close$/)) && method === 'POST') {
    updateTicketRow(m[1], { status: 'DONE', closed_at: now(), completed_at: now() });
    return findRow('/tickets', m[1]) || {};
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/move$/)) && method === 'POST') {
    if (body.status) updateTicketRow(m[1], { status: body.status });
    return findRow('/tickets', m[1]) || { ok: true };
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/(archive|unarchive)$/)) && method === 'POST') {
    updateTicketRow(m[1], { is_archived: m[2] === 'archive', archived_at: m[2] === 'archive' ? now() : null });
    return { ok: true };
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/time\/start$/)) && method === 'POST') {
    const key = `/tickets/${m[1]}/time`; const arr = list(key);
    const e = { id: maxId(arr) + 1000, ticket_id: Number(m[1]), user_id: USER.id, user: USER,
      started_at: now(), ended_at: null, duration_seconds: null, is_running: true, description: '' };
    arr.push(e); return e;
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/time\/stop$/)) && method === 'POST') {
    const arr = list(`/tickets/${m[1]}/time`);
    const running = [...arr].reverse().find((e) => e.is_running);
    if (running) {
      running.is_running = false; running.ended_at = now();
      running.duration_seconds = Math.max(60, Math.round((Date.now() - new Date(running.started_at)) / 1000));
    }
    return running || { ok: true };
  }
  if ((m = path.match(/^\/tickets\/(\w+)\/time\/manual$/)) && method === 'POST') {
    const arr = list(`/tickets/${m[1]}/time`);
    const e = { id: maxId(arr) + 1000, ticket_id: Number(m[1]), user_id: USER.id, user: USER,
      started_at: body.started_at || now(), ended_at: body.ended_at || now(),
      duration_seconds: body.duration_seconds || (body.hours ? body.hours * 3600 : 3600),
      is_running: false, description: body.description || body.note || '' };
    arr.push(e); return e;
  }
  if ((m = path.match(/^\/tickets\/(\w+)$/)) && method === 'PATCH') {
    updateTicketRow(m[1], { ...body, updated_at: now() });
    return store[`/tickets/${m[1]}`] || findRow('/tickets', m[1]) || {};
  }
  if (path === '/tickets' && method === 'POST') {
    const arr = list('/tickets'); const id = maxId(arr) + 1;
    const t = { id, ticket_number: `FIT-${String(id).padStart(5, '0')}`, status: 'NEW',
      priority: body.priority || 'MEDIUM', created_at: now(), updated_at: now(),
      total_time_hours: 0, labels: [], members: [], ...body };
    arr.push(t); store[`/tickets/${id}`] = t; return t;
  }

  // ---- leads ----
  if ((m = path.match(/^\/leads\/(\w+)\/review$/)) && method === 'POST') {
    const lead = findRow('/leads', m[1]);
    if (lead) {
      const approved = body.approved ?? (body.status ? /APPROV|CONVERT/i.test(body.status) : true);
      lead.status = body.status || (approved ? 'APPROVED' : 'DENIED');
      lead.denial_reason = body.denial_reason || null;
      lead.reviewed_at = now();
    }
    return lead || { ok: true };
  }

  // ---- generic create/update/delete for simple collections ----
  const collections = { '/clients': '/clients', '/invoices': '/invoices', '/kb': '/kb', '/labels': '/labels' };
  if (collections[path] && method === 'POST') {
    const arr = list(path); const id = maxId(arr) + 1;
    const row = { id, created_at: now(), ...body };
    arr.push(row); store[`${path}/${id}`] = row; return row;
  }
  for (const base of Object.keys(collections)) {
    if ((m = path.match(new RegExp(`^${base}/(\\w+)$`)))) {
      if (method === 'PATCH' || method === 'PUT') {
        const row = findRow(base, m[1]);
        if (row) Object.assign(row, body, { updated_at: now() });
        if (store[`${base}/${m[1]}`]) Object.assign(store[`${base}/${m[1]}`], body);
        return row || body;
      }
      if (method === 'DELETE') {
        store[base] = list(base).filter((x) => String(x.id) !== String(m[1]));
        return null;
      }
    }
  }
  if ((m = path.match(/^\/invoices\/(\w+)\/send$/)) && method === 'POST') {
    const row = findRow('/invoices', m[1]);
    if (row) { row.status = 'SENT'; row.sent_at = now(); }
    return row || { ok: true };
  }

  // ---- reads: exact (with query) then path, then base collection, else empty ----
  if (method === 'GET') {
    if (store[path + query] !== undefined) return store[path + query];
    if (store[path] !== undefined) return store[path];
    if (path.startsWith('/poppy')) return path.includes('boards') || path.includes('chats') ? [] : {};
    return Array.isArray(store[path]) ? store[path] : [];
  }

  // ---- default mutation success ----
  return body && Object.keys(body).length ? { id: Date.now(), created_at: now(), ...body } : { ok: true };
}

const realFetch = window.fetch ? window.fetch.bind(window) : null;

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (!/\/api(\/|$|\?)/.test(url)) {
    return realFetch ? realFetch(input, init) : jsonRes({}, 200);
  }
  const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
  const { path, query } = apiPath(url);
  let body = {};
  try { body = init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }

  await new Promise((r) => setTimeout(r, 55)); // a touch of latency for realism
  try {
    const result = handle(method, path, query, body);
    return jsonRes(result, result === null ? 204 : 200);
  } catch (e) {
    return jsonRes({ detail: 'demo error' }, 200);
  }
};

// eslint-disable-next-line no-console
console.info('%cFiji IT — offline demo','color:#6b6bff;font-weight:bold', '(all data is in-browser; no backend)');
