// Shared implementation for the /api compatibility layer.
// PocketBase runs each route handler in an isolated VM, so handlers require()
// this module and delegate. The frontend assumes integer ids, so every record
// carries a numeric `nid` that we expose as `id`; foreign keys reference nids.

function dao() { return $app.dao(); }
function body(c) { try { return $apis.requestInfo(c).data || {}; } catch (_) { return {}; } }
function meRec(c) { return c.get("authRecord"); }
function find(coll, filter, sort, params) {
  try { return dao().findRecordsByFilter(coll, filter || "1=1", sort || "created", 500, 0, params || {}); }
  catch (_) { return []; }
}
function byNid(coll, id) {
  const rows = find(coll, "nid = {:n}", "created", { n: Number(id) });
  return rows.length ? rows[0] : null;
}
function maxNid(coll) { return find(coll).reduce((m, r) => Math.max(m, r.getFloat("nid") || 0), 0); }
function dt(r, f) { try { const v = r.get(f); return v ? String(v) : null; } catch (_) { return null; } }
function nowISO() { return new Date().toISOString(); }
function nid(r) { return r.getFloat("nid"); }
function role(c) { const u = meRec(c); return u ? u.get("role") : null; }
function isGuest(c) { return role(c) === "GUEST"; }
// Mutations that only ADMIN/TECH may perform. Returns a 403 response when the
// caller is a GUEST, otherwise null (proceed).
function denyGuest(c) { return isGuest(c) ? c.json(403, { detail: "Forbidden" }) : null; }

function userMap() {
  const m = {};
  find("users").forEach((u) => { m[nid(u)] = { id: nid(u), name: u.get("name"), email: u.get("email"), role: u.get("role"), phone: u.get("phone") }; });
  return m;
}
function clientMap() {
  const m = {};
  find("clients").forEach((c) => { m[nid(c)] = { id: nid(c), name: c.get("cname"), email: c.get("email") }; });
  return m;
}
function ticketTimeSeconds(tnid) {
  let s = 0;
  find("time_entries", "ticket_id = {:t}", "created", { t: Number(tnid) }).forEach((e) => { s += (e.getFloat("duration_seconds") || 0); });
  return s;
}
function labelMap() { const m = {}; find("labels").forEach((l) => { m[nid(l)] = { id: nid(l), name: l.get("name"), color: l.get("color") }; }); return m; }
function ticketLabels(tnid, lm) {
  lm = lm || labelMap();
  return find("ticket_labels", "ticket_id = {:t}", "created", { t: Number(tnid) }).map((tl) => lm[tl.getFloat("label_id")]).filter(Boolean);
}
function checklistCounts(tnid) {
  const cls = find("checklists", "ticket_id = {:t}", "position", { t: Number(tnid) });
  let total = 0, done = 0;
  cls.forEach((cl) => { find("checklist_items", "checklist_id = {:c}", "position", { c: nid(cl) }).forEach((it) => { total++; if (it.getBool("completed")) done++; }); });
  return { total, done };
}
function attachmentCount(tnid) { return find("attachments", "ticket_id = {:t}", "created", { t: Number(tnid) }).length; }
function serLabel(l) { return { id: nid(l), name: l.get("name"), color: l.get("color") }; }
function serItem(it) { return { id: nid(it), checklist_id: it.getFloat("checklist_id"), text: it.get("text"), completed: it.getBool("completed"), position: it.getFloat("position") }; }
function serChecklist(cl) { return { id: nid(cl), ticket_id: cl.getFloat("ticket_id"), title: cl.get("title"), position: cl.getFloat("position"), items: find("checklist_items", "checklist_id = {:c}", "position", { c: nid(cl) }).map(serItem) }; }
function ticketChecklists(tnid) { return find("checklists", "ticket_id = {:t}", "position", { t: Number(tnid) }).map(serChecklist); }
function serAttachment(a) {
  const fn = a.get("file"); const rid = a.id; const coll = a.collection().name;
  return { id: nid(a), ticket_id: a.getFloat("ticket_id"), filename: a.get("filename"), name: a.get("filename"),
    size: a.getFloat("size"), mime_type: a.get("mime_type"), type: a.get("mime_type"),
    url: fn ? `/api/files/${coll}/${rid}/${fn}` : null, uploaded_at: dt(a, "created") };
}
function serActivity(a, um) {
  um = um || userMap(); const actor = um[a.getFloat("actor_id")];
  return { id: nid(a), ticket_id: a.getFloat("ticket_id"), type: a.get("type"), action_type: a.get("type"),
    action_detail: a.get("action_detail"), description: a.get("action_detail"),
    user: actor || null, user_name: actor ? actor.name : null, created_at: dt(a, "created") };
}
function logActivity(tnid, actorNid, type, detail) {
  try { newRec("activity", { nid: maxNid("activity") + 1, ticket_id: Number(tnid), type, action_detail: JSON.stringify(detail || {}), actor_id: actorNid || null }); } catch (_) {}
}

function ticketMembers(tnid, um) {
  um = um || userMap();
  return find("ticket_members", "ticket_id = {:t}", "created", { t: Number(tnid) })
    .map((m) => um[m.getFloat("user_id")]).filter(Boolean);
}
function serClient(c) {
  return { id: nid(c), name: c.get("cname"), email: c.get("email"), phone: c.get("phone"),
    company: c.get("company"), client_type: c.get("client_type"), hourly_rate: c.getFloat("hourly_rate"),
    is_active: c.getBool("is_active"), created_at: dt(c, "created") };
}
function serClientMember(m) {
  return { id: nid(m), client_id: m.getFloat("client_id"), name: m.get("name"), email: m.get("email"),
    phone: m.get("phone"), personal_phone: m.get("personal_phone") || "", role: m.get("role"),
    is_primary: m.getBool("is_primary"), is_active: m.getBool("is_active") };
}
function serLead(l) {
  return { id: nid(l), source: l.get("source"), sender_name: l.get("sender_name"), sender_email: l.get("sender_email"),
    sender_phone: l.get("sender_phone"), subject: l.get("subject"), body: l.get("body"), status: l.get("status"),
    denial_reason: l.get("denial_reason"), converted_ticket_id: l.getFloat("converted_ticket_id") || null,
    created_at: dt(l, "created"), reviewed_at: l.get("reviewed_at") || null };
}
function serTicket(t, um, cm) {
  um = um || userMap(); cm = cm || clientMap();
  const secs = ticketTimeSeconds(nid(t));
  const cc = checklistCounts(nid(t)); const tlabels = ticketLabels(nid(t));
  const tmembers = ticketMembers(nid(t), um);
  const clid = t.getFloat("client_id") || null; const asid = t.getFloat("assigned_to") || null;
  const cl = clid ? cm[clid] : null; const asg = asid ? um[asid] : null;
  return {
    id: nid(t), ticket_number: t.get("ticket_number"), title: t.get("title"), description: t.get("description"),
    status: t.get("status"), priority: t.get("priority"), client_id: clid, assigned_to: asid,
    client_name: cl ? cl.name : null, client_email: cl ? cl.email : null,
    assigned_to_name: asg ? asg.name : null, assigned_to_email: asg ? asg.email : null, assigned_to_phone: asg ? asg.phone : null,
    total_time: secs, total_time_hours: Math.round((secs / 3600) * 100) / 100,
    created_at: dt(t, "created"), updated_at: dt(t, "updated"),
    closed_at: t.get("closed_at") || null, completed_at: t.get("completed_at") || null,
    due_date: t.get("due_date") || null, start_date: t.get("start_date") || null,
    cover_color: t.get("cover_color") || null, position: t.getFloat("position"), is_archived: t.getBool("is_archived"),
    checklist_total: cc.total, checklist_completed: cc.done, attachment_count: attachmentCount(nid(t)),
    labels: tlabels, checklists: ticketChecklists(nid(t)), members: tmembers,
    label_ids_json: JSON.stringify(tlabels.map((l) => l.id)), member_ids_json: JSON.stringify(tmembers.map((m) => m.id)), custom_fields: t.get("custom_fields") || {},
  };
}
function serComment(x, um) {
  um = um || userMap(); const a = um[x.getFloat("author_id")];
  return { id: nid(x), ticket_id: x.getFloat("ticket_id"), author_id: x.getFloat("author_id"), author: a || null,
    body: x.get("body"), visibility: x.get("visibility"), emailed_to_client: x.getBool("emailed_to_client"),
    created_at: dt(x, "created"), attachments: [] };
}
function serTime(x, um) {
  um = um || userMap();
  return { id: nid(x), ticket_id: x.getFloat("ticket_id"), user_id: x.getFloat("user_id"), user: um[x.getFloat("user_id")] || null,
    started_at: x.get("started_at"), ended_at: x.get("ended_at") || null,
    duration_seconds: x.getFloat("duration_seconds") || null, description: x.get("description") || "", is_running: x.getBool("is_running") };
}
function serInvoice(i, cm) {
  cm = cm || clientMap(); const cl = cm[i.getFloat("client_id")];
  return { id: nid(i), invoice_number: i.get("invoice_number"), client_id: i.getFloat("client_id"), ticket_id: i.getFloat("ticket_id") || null,
    total_hours: i.getFloat("total_hours"), hourly_rate: i.getFloat("hourly_rate"),
    total_amount: i.getFloat("total_amount"), amount: i.getFloat("total_amount"), status: i.get("status"),
    client_name: cl ? cl.name : null, client: cl || null, sent_at: i.get("sent_at") || null, created_at: dt(i, "created") };
}
function serKB(k) {
  return { id: nid(k), title: k.get("title"), content: k.get("content"), category: k.get("category"),
    tags: k.get("tags") || [], is_active: k.getBool("is_active"), attachments: [], created_at: dt(k, "created"), updated_at: dt(k, "updated") };
}
function serCallLog(x) {
  return { id: nid(x), channel: x.get("channel"), direction: x.get("direction"), status: x.get("status"),
    caller_name: x.get("caller_name"), caller_phone: x.get("caller_phone"), caller_email: x.get("caller_email"),
    subject: x.get("subject"), body: x.get("body"), duration_seconds: x.getFloat("duration_seconds") || null,
    source_lead_id: x.getFloat("source_lead_id") || null, ticket_id: x.getFloat("ticket_id") || null, created_at: dt(x, "created") };
}
// Static option lists mirror backend/app/api/routes/settings.py so the Voice & AI
// page renders its provider/model/key selectors identically.
var VOICE_OPENROUTER_KEYS = ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY_2", "OPENROUTER_API_KEY_3", "OPENROUTER_API_KEY_4"];
var VOICE_OPENROUTER_KEY_GROUPS = [
  { label: "Preferred pool (Key 2 + Key 4)", keys: ["OPENROUTER_API_KEY_2", "OPENROUTER_API_KEY_4"] },
  { label: "Secondary pool (Key 1 + Key 3)", keys: ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY_3"] },
];
var VOICE_NVIDIA_KEYS = ["NVIDIA_NIM_API_KEY", "NVIDIA_NIM_API_KEY_2", "NVIDIA_NIM_API_KEY_3"];
var VOICE_MODELS = [
  { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B (OpenAI)", provider: "openrouter" },
  { id: "openrouter/owl-alpha", label: "OWL Alpha", provider: "openrouter" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron Super 120B", provider: "nvidia_nim" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron Ultra 550B", provider: "nvidia_nim" },
  { id: "nex-agi/nex-n2-pro:free", label: "Nex N2 Pro", provider: "openrouter" },
  { id: "qwen/qwen2.5-7b-instruct:free", label: "Qwen 2.5 7B", provider: "openrouter" },
  { id: "poolside/laguna-m.1:free", label: "Laguna M.1", provider: "openrouter" },
];
function voicePayload(r) {
  return {
    provider: (r && r.get("provider")) || "openrouter",
    openrouter_key_slot: (r && r.get("openrouter_key_slot")) || "OPENROUTER_API_KEY",
    openrouter_model: (r && r.get("openrouter_model")) || "openrouter/owl-alpha",
    nvidia_nim_key_slot: (r && r.get("nvidia_nim_key_slot")) || "NVIDIA_NIM_API_KEY",
    nvidia_nim_model: (r && r.get("nvidia_nim_model")) || "nvidia/nemotron-3-ultra-550b-a55b:free",
    available_keys: VOICE_OPENROUTER_KEYS,
    available_key_groups: VOICE_OPENROUTER_KEY_GROUPS,
    nvidia_nim_keys: VOICE_NVIDIA_KEYS,
    available_models: VOICE_MODELS,
  };
}
function newRec(coll, data) { const r = new Record(dao().findCollectionByNameOrId(coll), data); dao().saveRecord(r); return r; }

module.exports = {
  login(c) {
    const d = body(c);
    let rec;
    try { rec = dao().findFirstRecordByData("users", "email", d.email); } catch (_) { return c.json(401, { detail: "Invalid credentials" }); }
    if (!rec || !rec.validatePassword(d.password || "")) return c.json(401, { detail: "Invalid credentials" });
    const token = $tokens.recordAuthToken($app, rec);
    const u = { id: nid(rec), email: rec.get("email"), name: rec.get("name"), role: rec.get("role"), is_active: rec.getBool("is_active") };
    return c.json(200, { access_token: token, refresh_token: token, token_type: "bearer", user: u });
  },
  refresh(c) { const u = meRec(c); const token = u ? $tokens.recordAuthToken($app, u) : ""; return c.json(200, { access_token: token, refresh_token: token, token_type: "bearer" }); },
  me(c) { const u = meRec(c); return c.json(200, { id: nid(u), email: u.get("email"), name: u.get("name"), role: u.get("role"), is_active: u.getBool("is_active") }); },

  listUsers(c) { return c.json(200, find("users", "1=1", "name").map((u) => ({ id: nid(u), name: u.get("name"), email: u.get("email"), role: u.get("role"), phone: u.get("phone"), is_active: u.getBool("is_active"), created_at: dt(u, "created") }))); },

  listClients(c) { return c.json(200, find("clients", "1=1", "cname").map(serClient)); },
  getClient(c) { const r = byNid("clients", c.pathParam("id")); return r ? c.json(200, serClient(r)) : c.json(404, { detail: "Not found" }); },
  createClient(c) { const g = denyGuest(c); if (g) return g; const d = body(c); const r = newRec("clients", { nid: maxNid("clients") + 1, cname: d.name || d.cname, email: d.email, phone: d.phone, company: d.company, client_type: d.client_type, hourly_rate: d.hourly_rate || 0, is_active: d.is_active !== false }); return c.json(200, serClient(r)); },
  updateClient(c) { const g = denyGuest(c); if (g) return g; const r = byNid("clients", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); if (d.name !== undefined) r.set("cname", d.name); ["email", "phone", "company", "client_type", "hourly_rate", "is_active"].forEach((k) => { if (d[k] !== undefined) r.set(k, d[k]); }); dao().saveRecord(r); return c.json(200, serClient(r)); },
  listClientMembers(c) { return c.json(200, find("client_members", "client_id = {:c} && is_active != false", "-is_primary", { c: Number(c.pathParam("id")) }).map(serClientMember)); },
  createClientMember(c) { const g = denyGuest(c); if (g) return g; const cid = Number(c.pathParam("id")); const d = body(c); const r = newRec("client_members", { nid: maxNid("client_members") + 1, client_id: cid, name: d.name || "", email: d.email || "", phone: d.phone || "", personal_phone: d.personal_phone || "", role: d.role || "", is_primary: !!d.is_primary, is_active: true }); return c.json(200, serClientMember(r)); },
  updateClientMember(c) { const g = denyGuest(c); if (g) return g; const r = byNid("client_members", c.pathParam("memberId")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); ["name", "email", "phone", "personal_phone", "role", "is_primary", "is_active"].forEach((k) => { if (d[k] !== undefined) r.set(k, d[k]); }); dao().saveRecord(r); return c.json(200, serClientMember(r)); },
  deleteClientMember(c) { const g = denyGuest(c); if (g) return g; const r = byNid("client_members", c.pathParam("memberId")); if (r) { r.set("is_active", false); dao().saveRecord(r); } return c.json(200, { status: "deleted", id: Number(c.pathParam("memberId")) }); },

  listLeads(c) { const st = c.queryParam("status"); let rows = find("leads", "1=1", "-created"); if (st) rows = rows.filter((l) => l.get("status") === st); return c.json(200, rows.map(serLead)); },
  createLead(c) { const d = body(c); const n = maxNid("leads") + 1; const r = newRec("leads", { nid: n, source: d.source || "WEB", sender_name: d.sender_name || "", sender_email: d.sender_email || "", sender_phone: d.sender_phone || "", subject: d.subject || "", body: d.body || d.raw_content || "", status: "NEW" }); return c.json(200, serLead(r)); },
  // A3: approving a lead auto-creates a ticket (parity with FastAPI review_lead).
  reviewLead(c) {
    const r = byNid("leads", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" });
    const d = body(c); const u = meRec(c);
    const action = d.action || (d.approved === false ? "deny" : (d.approved ? "approve" : (d.status && /DEN/i.test(d.status) ? "deny" : "approve")));
    if (action === "deny") {
      r.set("status", "DENIED"); if (d.denial_reason) r.set("denial_reason", d.denial_reason); r.set("reviewed_at", nowISO()); dao().saveRecord(r);
      return c.json(200, serLead(r));
    }
    // approve → require a client, create a ticket, link it, mark CONVERTED
    if (!d.client_id) return c.json(400, { detail: "client_id required to approve" });
    r.set("status", "APPROVED"); r.set("reviewed_at", nowISO());
    const n = maxNid("tickets") + 1;
    const t = newRec("tickets", { nid: n, ticket_number: "FIT-" + String(n).padStart(5, "0"),
      title: d.title || r.get("subject") || "New ticket from lead", description: d.description || r.get("body") || "",
      status: "NEW", priority: d.priority || "MEDIUM", client_id: Number(d.client_id), assigned_to: d.assigned_to || null,
      due_date: "", position: n, is_archived: false });
    logActivity(n, u ? nid(u) : null, "created", { fromLead: nid(r) });
    r.set("converted_ticket_id", n); r.set("status", "CONVERTED"); dao().saveRecord(r);
    return c.json(200, serLead(r));
  },

  listTickets(c) { const um = userMap(), cm = clientMap(); const arch = c.queryParam("archived") === "true"; const rows = find("tickets", "1=1", "position").filter((t) => arch ? t.getBool("is_archived") : !t.getBool("is_archived")); return c.json(200, rows.map((t) => serTicket(t, um, cm))); },
  getTicket(c) { const t = byNid("tickets", c.pathParam("id")); return t ? c.json(200, serTicket(t)) : c.json(404, { detail: "Not found" }); },
  createTicket(c) { const d = body(c); const u = meRec(c); const n = maxNid("tickets") + 1; const r = newRec("tickets", { nid: n, ticket_number: "FIT-" + String(n).padStart(5, "0"), title: d.title, description: d.description || "", status: d.status || "NEW", priority: d.priority || "MEDIUM", client_id: d.client_id || null, assigned_to: d.assigned_to || null, due_date: d.due_date || "", position: n, is_archived: false }); logActivity(n, u ? nid(u) : null, "created", {}); return c.json(200, serTicket(r)); },
  updateTicket(c) { const r = byNid("tickets", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); const from = r.get("status"); ["title", "description", "status", "priority", "client_id", "assigned_to", "due_date", "start_date", "cover_color", "position"].forEach((k) => { if (d[k] !== undefined) r.set(k, d[k]); }); dao().saveRecord(r); if (d.status !== undefined && d.status !== from) logActivity(nid(r), meRec(c) ? nid(meRec(c)) : null, "moved", { from, to: d.status }); return c.json(200, serTicket(r)); },
  copyTicket(c) { const src = byNid("tickets", c.pathParam("id")); if (!src) return c.json(404, { detail: "Not found" }); const d = body(c); const u = meRec(c); const n = maxNid("tickets") + 1;
    const copy = newRec("tickets", { nid: n, ticket_number: "FIT-" + String(n).padStart(5, "0"), title: d.title || ((src.get("title") || "") + " (copy)"), description: src.get("description") || "", status: src.get("status") || "NEW", priority: src.get("priority") || "MEDIUM", client_id: src.getFloat("client_id") || null, assigned_to: src.getFloat("assigned_to") || null, due_date: src.get("due_date") || "", start_date: src.get("start_date") || "", cover_color: src.get("cover_color") || "", position: n, is_archived: false });
    // copy labels
    find("ticket_labels", "ticket_id = {:t}", "created", { t: nid(src) }).forEach((tl) => { newRec("ticket_labels", { nid: maxNid("ticket_labels") + 1, ticket_id: n, label_id: tl.getFloat("label_id") }); });
    // copy checklists + items
    find("checklists", "ticket_id = {:t}", "position", { t: nid(src) }).forEach((cl) => {
      const newCl = newRec("checklists", { nid: maxNid("checklists") + 1, ticket_id: n, title: cl.get("title"), position: cl.getFloat("position") });
      find("checklist_items", "checklist_id = {:c}", "position", { c: nid(cl) }).forEach((it) => { newRec("checklist_items", { nid: maxNid("checklist_items") + 1, checklist_id: nid(newCl), text: it.get("text"), completed: it.getBool("completed"), position: it.getFloat("position") }); });
    });
    logActivity(n, u ? nid(u) : null, "created", { copiedFrom: nid(src) });
    return c.json(200, serTicket(copy)); },
  deleteTicket(c) { const r = byNid("tickets", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const t = nid(r);
    ["ticket_labels", "checklists", "comments", "time_entries", "attachments", "activity", "ticket_members"].forEach((coll) => { find(coll, "ticket_id = {:t}", "created", { t: Number(t) }).forEach((row) => { try { dao().deleteRecord(row); } catch (_) {} }); });
    try { dao().deleteRecord(r); } catch (_) {} return c.json(204, null); },
  listTicketMembers(c) { return c.json(200, ticketMembers(Number(c.pathParam("id")))); },
  addTicketMember(c) { const tnid = Number(c.pathParam("id")); const d = body(c); const uid = Number(d.user_id); const exists = find("ticket_members", "ticket_id = {:t} && user_id = {:u}", "created", { t: tnid, u: uid }); if (!exists.length) { newRec("ticket_members", { nid: maxNid("ticket_members") + 1, ticket_id: tnid, user_id: uid }); const um = userMap(); logActivity(tnid, meRec(c) ? nid(meRec(c)) : null, "added_member", { memberName: um[uid] ? um[uid].name : "" }); } return c.json(200, ticketMembers(tnid)); },
  removeTicketMember(c) { const tnid = Number(c.pathParam("id")); const uid = Number(c.pathParam("userId")); find("ticket_members", "ticket_id = {:t} && user_id = {:u}", "created", { t: tnid, u: uid }).forEach((r) => dao().deleteRecord(r)); const um = userMap(); logActivity(tnid, meRec(c) ? nid(meRec(c)) : null, "removed_member", { memberName: um[uid] ? um[uid].name : "" }); return c.json(200, ticketMembers(tnid)); },
  reorderBoard(c) { const d = body(c); const items = (d && d.items) || []; let updated = 0; items.forEach((it) => { const r = byNid("tickets", it.ticket_id); if (r) { if (it.status !== undefined) r.set("status", it.status); if (it.position !== undefined) r.set("position", it.position); dao().saveRecord(r); updated++; } }); return c.json(200, { updated }); },
  closeTicket(c) { const r = byNid("tickets", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); r.set("status", "DONE"); r.set("closed_at", nowISO()); r.set("completed_at", nowISO()); dao().saveRecord(r); return c.json(200, serTicket(r)); },
  moveTicket(c) { const r = byNid("tickets", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); const from = r.get("status"); if (d.status) r.set("status", d.status); if (d.position !== undefined) r.set("position", d.position); dao().saveRecord(r); if (d.status && d.status !== from) logActivity(nid(r), meRec(c) ? nid(meRec(c)) : null, "moved", { from, to: d.status }); return c.json(200, serTicket(r)); },
  archiveTicket(c, on) { const r = byNid("tickets", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); r.set("is_archived", on); r.set("archived_at", on ? nowISO() : ""); dao().saveRecord(r); return c.json(200, serTicket(r)); },
  emptyList(c) { return c.json(200, []); },

  // ---- labels ----
  listLabels(c) { return c.json(200, find("labels", "1=1", "created").map(serLabel)); },
  createLabel(c) { const g = denyGuest(c); if (g) return g; const d = body(c); const r = newRec("labels", { nid: maxNid("labels") + 1, name: d.name, color: d.color || "#6b7280" }); return c.json(200, serLabel(r)); },
  updateLabel(c) { const g = denyGuest(c); if (g) return g; const r = byNid("labels", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); if (d.name !== undefined) r.set("name", d.name); if (d.color !== undefined) r.set("color", d.color); dao().saveRecord(r); return c.json(200, serLabel(r)); },
  deleteLabel(c) { const g = denyGuest(c); if (g) return g; const r = byNid("labels", c.pathParam("id")); if (r) dao().deleteRecord(r); return c.json(204, null); },
  ticketLabelsList(c) { return c.json(200, ticketLabels(Number(c.pathParam("id")))); },
  addTicketLabel(c) { const tnid = Number(c.pathParam("id")); const d = body(c); const lid = Number(d.label_id); const exists = find("ticket_labels", "ticket_id = {:t} && label_id = {:l}", "created", { t: tnid, l: lid }); if (!exists.length) { newRec("ticket_labels", { nid: maxNid("ticket_labels") + 1, ticket_id: tnid, label_id: lid }); const lbl = byNid("labels", lid); logActivity(tnid, meRec(c) ? nid(meRec(c)) : null, "added_label", { labelName: lbl ? lbl.get("name") : "" }); } return c.json(200, ticketLabels(tnid)); },
  removeTicketLabel(c) { const tnid = Number(c.pathParam("id")); const lid = Number(c.pathParam("labelId")); find("ticket_labels", "ticket_id = {:t} && label_id = {:l}", "created", { t: tnid, l: lid }).forEach((r) => dao().deleteRecord(r)); const lbl = byNid("labels", lid); logActivity(tnid, meRec(c) ? nid(meRec(c)) : null, "removed_label", { labelName: lbl ? lbl.get("name") : "" }); return c.json(200, ticketLabels(tnid)); },

  // ---- checklists ----
  listChecklists(c) { return c.json(200, find("checklists", "ticket_id = {:t}", "position", { t: Number(c.pathParam("id")) }).map(serChecklist)); },
  createChecklist(c) { const d = body(c); const tnid = Number(c.pathParam("id")); const r = newRec("checklists", { nid: maxNid("checklists") + 1, ticket_id: tnid, title: d.title || "Checklist", position: find("checklists", "ticket_id = {:t}", "position", { t: tnid }).length + 1 }); return c.json(200, serChecklist(r)); },
  updateChecklist(c) { const r = byNid("checklists", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); if (d.title !== undefined) r.set("title", d.title); dao().saveRecord(r); return c.json(200, serChecklist(r)); },
  deleteChecklist(c) { const r = byNid("checklists", c.pathParam("id")); if (r) { find("checklist_items", "checklist_id = {:c}", "position", { c: nid(r) }).forEach((it) => dao().deleteRecord(it)); dao().deleteRecord(r); } return c.json(204, null); },
  addChecklistItem(c) { const clnid = Number(c.pathParam("id")); const d = body(c); const r = newRec("checklist_items", { nid: maxNid("checklist_items") + 1, checklist_id: clnid, text: d.text || "", completed: false, position: find("checklist_items", "checklist_id = {:c}", "position", { c: clnid }).length + 1 }); return c.json(200, serItem(r)); },
  updateChecklistItem(c) { const r = byNid("checklist_items", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); const done = (d.is_completed !== undefined) ? d.is_completed : d.completed; if (done !== undefined) r.set("completed", done); if (d.text !== undefined) r.set("text", d.text); dao().saveRecord(r); if (done !== undefined) { const cl = byNid("checklists", r.getFloat("checklist_id")); if (cl) logActivity(cl.getFloat("ticket_id"), meRec(c) ? nid(meRec(c)) : null, done ? "completed_checklist" : "uncompleted_checklist", { itemText: r.get("text") }); } return c.json(200, serItem(r)); },
  deleteChecklistItem(c) { const r = byNid("checklist_items", c.pathParam("id")); if (r) dao().deleteRecord(r); return c.json(204, null); },
  toggleAllChecklistItems(c) { const clnid = Number(c.pathParam("id")); const items = find("checklist_items", "checklist_id = {:c}", "position", { c: clnid }); const allDone = items.every((i) => i.getBool("completed")); items.forEach((i) => { i.set("completed", !allDone); dao().saveRecord(i); }); const cl = byNid("checklists", clnid); return c.json(200, cl ? serChecklist(cl) : { ok: true }); },

  // ---- attachments ----
  listAttachments(c) { return c.json(200, find("attachments", "ticket_id = {:t}", "-created", { t: Number(c.pathParam("id")) }).map(serAttachment)); },
  uploadAttachment(c) {
    const tnid = Number(c.pathParam("id")); const u = meRec(c);
    let fh; try { fh = c.formFile("file"); } catch (_) { fh = null; }
    if (!fh) return c.json(400, { detail: "No file provided" });
    const coll = dao().findCollectionByNameOrId("attachments");
    const rec = new Record(coll, { nid: maxNid("attachments") + 1, ticket_id: tnid, filename: fh.filename, size: fh.size, mime_type: fh.header ? fh.header.get("Content-Type") : "", uploader_id: u ? nid(u) : null });
    const form = new RecordUpsertForm($app, rec);
    form.addFiles("file", $filesystem.fileFromMultipart(fh));
    form.submit();
    logActivity(tnid, u ? nid(u) : null, "added_attachment", { fileName: fh.filename });
    return c.json(200, serAttachment(rec));
  },
  deleteAttachment(c) { const r = byNid("attachments", c.pathParam("id")); if (r) dao().deleteRecord(r); return c.json(204, null); },

  // ---- activity ----
  listActivity(c) { const um = userMap(); return c.json(200, find("activity", "ticket_id = {:t}", "-created", { t: Number(c.pathParam("id")) }).map((a) => serActivity(a, um))); },

  listComments(c) { const um = userMap(); const guest = isGuest(c); let rows = find("comments", "ticket_id = {:t}", "created", { t: Number(c.pathParam("id")) }); if (guest) rows = rows.filter((x) => x.get("visibility") !== "PRIVATE"); return c.json(200, rows.map((x) => serComment(x, um))); },
  createComment(c) { const d = body(c); const u = meRec(c); const tid = Number(c.queryParam("ticket_id") || d.ticket_id); const vis = d.visibility || (d.is_private ? "PRIVATE" : "PUBLIC"); const r = newRec("comments", { nid: maxNid("comments") + 1, ticket_id: tid, author_id: nid(u), body: d.body || d.content || "", visibility: vis, emailed_to_client: !!(d.email_to_client || d.emailed_to_client) }); logActivity(tid, u ? nid(u) : null, "commented", {}); return c.json(200, serComment(r)); },

  listTime(c) { const um = userMap(); return c.json(200, find("time_entries", "ticket_id = {:t}", "created", { t: Number(c.pathParam("id")) }).map((x) => serTime(x, um))); },
  startTime(c) { const u = meRec(c); const r = newRec("time_entries", { nid: maxNid("time_entries") + 1, ticket_id: Number(c.pathParam("id")), user_id: nid(u), started_at: nowISO(), is_running: true, description: "" }); return c.json(200, serTime(r)); },
  stopTime(c) { const rows = find("time_entries", "ticket_id = {:t} && is_running = true", "-created", { t: Number(c.pathParam("id")) }); if (!rows.length) return c.json(200, { ok: true }); const r = rows[0]; r.set("is_running", false); r.set("ended_at", nowISO()); r.set("duration_seconds", Math.max(60, Math.round((Date.now() - new Date(r.get("started_at")).getTime()) / 1000))); dao().saveRecord(r); return c.json(200, serTime(r)); },
  manualTime(c) { const d = body(c); const u = meRec(c); const r = newRec("time_entries", { nid: maxNid("time_entries") + 1, ticket_id: Number(c.pathParam("id")), user_id: nid(u), started_at: d.started_at || nowISO(), ended_at: d.ended_at || nowISO(), duration_seconds: d.duration_seconds || (d.hours ? d.hours * 3600 : 3600), is_running: false, description: d.description || d.note || "" }); return c.json(200, serTime(r)); },
  updateTime(c) { const r = byNid("time_entries", c.pathParam("entryId")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); ["started_at", "ended_at", "description"].forEach((k) => { if (d[k] !== undefined) r.set(k, d[k]); }); if (d.duration_seconds !== undefined) r.set("duration_seconds", d.duration_seconds); else if (d.hours !== undefined) r.set("duration_seconds", d.hours * 3600); dao().saveRecord(r); return c.json(200, serTime(r)); },
  deleteTime(c) { const r = byNid("time_entries", c.pathParam("entryId")); if (r) dao().deleteRecord(r); return c.json(204, null); },

  board(c) { const um = userMap(), cm = clientMap(); const statuses = ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "DONE"]; const tickets = find("tickets", "1=1", "position").filter((t) => !t.getBool("is_archived")); const columns = statuses.map((s) => ({ status: s, name: s, tickets: tickets.filter((t) => t.get("status") === s).map((t) => serTicket(t, um, cm)) })); return c.json(200, { columns, labels: [], members: Object.keys(um).map((k) => um[k]) }); },
  boardStats(c) { const tickets = find("tickets").filter((t) => !t.getBool("is_archived")); const by = (key) => tickets.reduce((m, t) => { const k = t.get(key); m[k] = (m[k] || 0) + 1; return m; }, {}); return c.json(200, { total_tickets: tickets.length, by_status: by("status"), by_priority: by("priority"), overdue_count: 0, completed_this_week: 0 }); },

  listInvoices(c) { const cm = clientMap(); return c.json(200, find("invoices", "1=1", "-created").map((i) => serInvoice(i, cm))); },
  getInvoice(c) { const r = byNid("invoices", c.pathParam("id")); return r ? c.json(200, serInvoice(r)) : c.json(404, { detail: "Not found" }); },
  createInvoice(c) {
    const g = denyGuest(c); if (g) return g;
    const d = body(c); const cid = Number(d.client_id);
    const client = byNid("clients", cid); if (!client) return c.json(404, { detail: "Client not found" });
    const rate = client.getFloat("hourly_rate") || 0;
    let secs = 0;
    if (d.ticket_id) { secs = ticketTimeSeconds(Number(d.ticket_id)); }
    else { find("tickets", "client_id = {:c}", "created", { c: cid }).forEach((t) => { secs += ticketTimeSeconds(nid(t)); }); }
    const hours = Math.round((secs / 3600) * 100) / 100;
    const amount = Math.round(hours * rate * 100) / 100;
    const n = maxNid("invoices") + 1;
    const r = newRec("invoices", { nid: n, invoice_number: "INV-" + String(n).padStart(5, "0"), client_id: cid,
      ticket_id: d.ticket_id ? Number(d.ticket_id) : null, total_hours: hours, hourly_rate: rate, total_amount: amount,
      status: "DRAFT", period_start: d.period_start || "", period_end: d.period_end || "" });
    return c.json(200, serInvoice(r));
  },
  sendInvoice(c) { const g = denyGuest(c); if (g) return g; const r = byNid("invoices", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); r.set("status", "SENT"); r.set("sent_at", nowISO()); dao().saveRecord(r); return c.json(200, serInvoice(r)); },

  listKB(c) { const q = c.queryParam("search"); let rows = find("knowledge_base", "1=1", "-created"); if (q) rows = rows.filter((k) => (k.get("title") + " " + k.get("content")).toLowerCase().indexOf(q.toLowerCase()) !== -1); return c.json(200, rows.map(serKB)); },
  getKB(c) { const r = byNid("knowledge_base", c.pathParam("id")); return r ? c.json(200, serKB(r)) : c.json(404, { detail: "Not found" }); },
  createKB(c) { const g = denyGuest(c); if (g) return g; const d = body(c); const r = newRec("knowledge_base", { nid: maxNid("knowledge_base") + 1, title: d.title, content: d.content || "", category: d.category || "", tags: d.tags || [], is_active: d.is_active !== false }); return c.json(200, serKB(r)); },
  updateKB(c) { const g = denyGuest(c); if (g) return g; const r = byNid("knowledge_base", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); ["title", "content", "category", "tags", "is_active"].forEach((k) => { if (d[k] !== undefined) r.set(k, d[k]); }); dao().saveRecord(r); return c.json(200, serKB(r)); },
  deleteKB(c) { const g = denyGuest(c); if (g) return g; const r = byNid("knowledge_base", c.pathParam("id")); if (r) dao().deleteRecord(r); return c.json(204, null); },

  // ---- voice & AI settings (A1) ----
  voiceGet(c) { const r = byNid("voice_settings", 1); return c.json(200, voicePayload(r)); },
  voiceSet(c) {
    const g = denyGuest(c); if (g) return g;
    const d = body(c); let r = byNid("voice_settings", 1);
    if (!r) r = newRec("voice_settings", { nid: 1 });
    ["provider", "openrouter_key_slot", "openrouter_model", "nvidia_nim_key_slot", "nvidia_nim_model"].forEach((k) => { if (d[k] !== undefined) r.set(k, d[k]); });
    dao().saveRecord(r);
    return c.json(200, voicePayload(r));
  },

  // ---- call logs (A9) ----
  listCallLogs(c) { return c.json(200, find("call_logs", "1=1", "-created").map(serCallLog)); },
  createCallLog(c) { const d = body(c); const n = maxNid("call_logs") + 1; const r = newRec("call_logs", { nid: n,
    channel: d.channel || "", direction: d.direction || "", status: d.status || "PENDING",
    caller_name: d.caller_name || "", caller_phone: d.caller_phone || "", caller_email: d.caller_email || "",
    subject: d.subject || "", body: d.body || "", duration_seconds: d.duration_seconds || null,
    source_lead_id: d.source_lead_id || null, ticket_id: d.ticket_id || null }); return c.json(200, serCallLog(r)); },
  callLogStats(c) { const rows = find("call_logs"); return c.json(200, { total: rows.length, by_channel: {}, by_status: {}, by_direction: {} }); },

  // ---- poppy stubs (A12): optional integration, degrade gracefully ----
  poppyBoards(c) { return c.json(200, { boards: [] }); },
  poppyChats(c) { return c.json(200, { chats: [] }); },
  poppyAsk(c) { return c.json(200, { text: "", credits_used: 0 }); },
  poppyConversation(c) { return c.json(200, { id: null, messages: [] }); },

  emptyObj(c) { return c.json(200, { total: 0 }); },
};
