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

function serClient(c) {
  return { id: nid(c), name: c.get("cname"), email: c.get("email"), phone: c.get("phone"),
    company: c.get("company"), client_type: c.get("client_type"), hourly_rate: c.getFloat("hourly_rate"),
    is_active: c.getBool("is_active"), created_at: dt(c, "created") };
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
    labels: tlabels, checklists: ticketChecklists(nid(t)), members: [],
    label_ids_json: JSON.stringify(tlabels.map((l) => l.id)), member_ids_json: "[]", custom_fields: t.get("custom_fields") || {},
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
  createClient(c) { const d = body(c); const r = newRec("clients", { nid: maxNid("clients") + 1, cname: d.name || d.cname, email: d.email, phone: d.phone, company: d.company, client_type: d.client_type, hourly_rate: d.hourly_rate || 0, is_active: d.is_active !== false }); return c.json(200, serClient(r)); },
  updateClient(c) { const r = byNid("clients", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); if (d.name !== undefined) r.set("cname", d.name); ["email", "phone", "company", "client_type", "hourly_rate", "is_active"].forEach((k) => { if (d[k] !== undefined) r.set(k, d[k]); }); dao().saveRecord(r); return c.json(200, serClient(r)); },
  listClientMembers(c) { return c.json(200, find("client_members", "client_id = {:c}", "created", { c: Number(c.pathParam("id")) }).map((m) => ({ id: nid(m), client_id: m.getFloat("client_id"), name: m.get("name"), email: m.get("email"), phone: m.get("phone"), role: m.get("role"), is_primary: m.getBool("is_primary") }))); },

  listLeads(c) { const st = c.queryParam("status"); let rows = find("leads", "1=1", "-created"); if (st) rows = rows.filter((l) => l.get("status") === st); return c.json(200, rows.map(serLead)); },
  reviewLead(c) { const r = byNid("leads", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); const ok = d.approved !== undefined ? d.approved : (d.status ? /APPROV|CONVERT/i.test(d.status) : true); r.set("status", d.status || (ok ? "APPROVED" : "DENIED")); if (d.denial_reason) r.set("denial_reason", d.denial_reason); r.set("reviewed_at", nowISO()); dao().saveRecord(r); return c.json(200, serLead(r)); },

  listTickets(c) { const um = userMap(), cm = clientMap(); const arch = c.queryParam("archived") === "true"; const rows = find("tickets", "1=1", "position").filter((t) => arch ? t.getBool("is_archived") : !t.getBool("is_archived")); return c.json(200, rows.map((t) => serTicket(t, um, cm))); },
  getTicket(c) { const t = byNid("tickets", c.pathParam("id")); return t ? c.json(200, serTicket(t)) : c.json(404, { detail: "Not found" }); },
  createTicket(c) { const d = body(c); const n = maxNid("tickets") + 1; const r = newRec("tickets", { nid: n, ticket_number: "FIT-" + String(n).padStart(5, "0"), title: d.title, description: d.description || "", status: d.status || "NEW", priority: d.priority || "MEDIUM", client_id: d.client_id || null, assigned_to: d.assigned_to || null, due_date: d.due_date || "", position: n, is_archived: false }); return c.json(200, serTicket(r)); },
  updateTicket(c) { const r = byNid("tickets", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); ["title", "description", "status", "priority", "client_id", "assigned_to", "due_date", "start_date", "cover_color", "position"].forEach((k) => { if (d[k] !== undefined) r.set(k, d[k]); }); dao().saveRecord(r); return c.json(200, serTicket(r)); },
  closeTicket(c) { const r = byNid("tickets", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); r.set("status", "DONE"); r.set("closed_at", nowISO()); r.set("completed_at", nowISO()); dao().saveRecord(r); return c.json(200, serTicket(r)); },
  moveTicket(c) { const r = byNid("tickets", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); const from = r.get("status"); if (d.status) r.set("status", d.status); if (d.position !== undefined) r.set("position", d.position); dao().saveRecord(r); if (d.status && d.status !== from) logActivity(nid(r), meRec(c) ? nid(meRec(c)) : null, "moved", { from, to: d.status }); return c.json(200, serTicket(r)); },
  archiveTicket(c, on) { const r = byNid("tickets", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); r.set("is_archived", on); r.set("archived_at", on ? nowISO() : ""); dao().saveRecord(r); return c.json(200, serTicket(r)); },
  emptyList(c) { return c.json(200, []); },

  // ---- labels ----
  listLabels(c) { return c.json(200, find("labels", "1=1", "created").map(serLabel)); },
  createLabel(c) { const d = body(c); const r = newRec("labels", { nid: maxNid("labels") + 1, name: d.name, color: d.color || "#6b7280" }); return c.json(200, serLabel(r)); },
  updateLabel(c) { const r = byNid("labels", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); if (d.name !== undefined) r.set("name", d.name); if (d.color !== undefined) r.set("color", d.color); dao().saveRecord(r); return c.json(200, serLabel(r)); },
  deleteLabel(c) { const r = byNid("labels", c.pathParam("id")); if (r) dao().deleteRecord(r); return c.json(204, null); },
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

  listComments(c) { const um = userMap(); return c.json(200, find("comments", "ticket_id = {:t}", "created", { t: Number(c.pathParam("id")) }).map((x) => serComment(x, um))); },
  createComment(c) { const d = body(c); const u = meRec(c); const tid = Number(c.queryParam("ticket_id") || d.ticket_id); const vis = d.visibility || (d.is_private ? "PRIVATE" : "PUBLIC"); const r = newRec("comments", { nid: maxNid("comments") + 1, ticket_id: tid, author_id: nid(u), body: d.body || d.content || "", visibility: vis, emailed_to_client: !!(d.email_to_client || d.emailed_to_client) }); logActivity(tid, u ? nid(u) : null, "commented", {}); return c.json(200, serComment(r)); },

  listTime(c) { const um = userMap(); return c.json(200, find("time_entries", "ticket_id = {:t}", "created", { t: Number(c.pathParam("id")) }).map((x) => serTime(x, um))); },
  startTime(c) { const u = meRec(c); const r = newRec("time_entries", { nid: maxNid("time_entries") + 1, ticket_id: Number(c.pathParam("id")), user_id: nid(u), started_at: nowISO(), is_running: true, description: "" }); return c.json(200, serTime(r)); },
  stopTime(c) { const rows = find("time_entries", "ticket_id = {:t} && is_running = true", "-created", { t: Number(c.pathParam("id")) }); if (!rows.length) return c.json(200, { ok: true }); const r = rows[0]; r.set("is_running", false); r.set("ended_at", nowISO()); r.set("duration_seconds", Math.max(60, Math.round((Date.now() - new Date(r.get("started_at")).getTime()) / 1000))); dao().saveRecord(r); return c.json(200, serTime(r)); },
  manualTime(c) { const d = body(c); const u = meRec(c); const r = newRec("time_entries", { nid: maxNid("time_entries") + 1, ticket_id: Number(c.pathParam("id")), user_id: nid(u), started_at: d.started_at || nowISO(), ended_at: d.ended_at || nowISO(), duration_seconds: d.duration_seconds || (d.hours ? d.hours * 3600 : 3600), is_running: false, description: d.description || d.note || "" }); return c.json(200, serTime(r)); },

  board(c) { const um = userMap(), cm = clientMap(); const statuses = ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "DONE"]; const tickets = find("tickets", "1=1", "position").filter((t) => !t.getBool("is_archived")); const columns = statuses.map((s) => ({ status: s, name: s, tickets: tickets.filter((t) => t.get("status") === s).map((t) => serTicket(t, um, cm)) })); return c.json(200, { columns, labels: [], members: Object.keys(um).map((k) => um[k]) }); },
  boardStats(c) { const tickets = find("tickets").filter((t) => !t.getBool("is_archived")); const by = (key) => tickets.reduce((m, t) => { const k = t.get(key); m[k] = (m[k] || 0) + 1; return m; }, {}); return c.json(200, { total_tickets: tickets.length, by_status: by("status"), by_priority: by("priority"), overdue_count: 0, completed_this_week: 0 }); },

  listInvoices(c) { const cm = clientMap(); return c.json(200, find("invoices", "1=1", "-created").map((i) => serInvoice(i, cm))); },
  getInvoice(c) { const r = byNid("invoices", c.pathParam("id")); return r ? c.json(200, serInvoice(r)) : c.json(404, { detail: "Not found" }); },
  sendInvoice(c) { const r = byNid("invoices", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); r.set("status", "SENT"); r.set("sent_at", nowISO()); dao().saveRecord(r); return c.json(200, serInvoice(r)); },

  listKB(c) { const q = c.queryParam("search"); let rows = find("knowledge_base", "1=1", "-created"); if (q) rows = rows.filter((k) => (k.get("title") + " " + k.get("content")).toLowerCase().indexOf(q.toLowerCase()) !== -1); return c.json(200, rows.map(serKB)); },
  getKB(c) { const r = byNid("knowledge_base", c.pathParam("id")); return r ? c.json(200, serKB(r)) : c.json(404, { detail: "Not found" }); },
  createKB(c) { const d = body(c); const r = newRec("knowledge_base", { nid: maxNid("knowledge_base") + 1, title: d.title, content: d.content || "", category: d.category || "", tags: d.tags || [], is_active: d.is_active !== false }); return c.json(200, serKB(r)); },
  updateKB(c) { const r = byNid("knowledge_base", c.pathParam("id")); if (!r) return c.json(404, { detail: "Not found" }); const d = body(c); ["title", "content", "category", "tags", "is_active"].forEach((k) => { if (d[k] !== undefined) r.set(k, d[k]); }); dao().saveRecord(r); return c.json(200, serKB(r)); },
  deleteKB(c) { const r = byNid("knowledge_base", c.pathParam("id")); if (r) dao().deleteRecord(r); return c.json(204, null); },

  voiceGet(c) { return c.json(200, { enabled: false, provider: null, configured: false }); },
  voiceSet(c) { return c.json(200, Object.assign({ enabled: false }, body(c))); },
  emptyObj(c) { return c.json(200, { total: 0 }); },
};
