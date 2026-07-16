/// Review 2026-07-16 fixes: new collections and columns needed by the
/// compatibility-layer endpoints added in this batch (ticket members, call
/// logs, persisted voice settings) plus extra client-member columns.
migrate((db) => {
  const dao = new Dao(db);
  const txt = (name, opts) => Object.assign({ name, type: "text" }, opts || {});
  const num = (name) => ({ name, type: "number" });
  const bool = (name) => ({ name, type: "bool" });

  function make(name, fields) {
    const c = new Collection({ name, type: "base", listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, schema: [num("nid")].concat(fields) });
    dao.saveCollection(c);
  }

  // Ticket membership (A6). Association rows: which users are on a ticket.
  make("ticket_members", [num("ticket_id"), num("user_id")]);

  // Call logs (A9). Mirrors the FastAPI CallLog model fields the voice page logs.
  make("call_logs", [
    txt("channel"), txt("direction"), txt("status"),
    txt("caller_name"), txt("caller_phone"), txt("caller_email"),
    txt("subject"), txt("body", { options: { max: 20000 } }),
    num("duration_seconds"), num("source_lead_id"), num("ticket_id"),
  ]);

  // Persisted Voice & AI settings (A1). Single-row store keyed by nid=1.
  make("voice_settings", [
    txt("provider"), txt("openrouter_key_slot"), txt("openrouter_model"),
    txt("nvidia_nim_key_slot"), txt("nvidia_nim_model"),
  ]);

  const rec = (coll, data) => { const r = new Record(dao.findCollectionByNameOrId(coll), data); dao.saveRecord(r); return r; };
  rec("voice_settings", {
    nid: 1,
    provider: "openrouter",
    openrouter_key_slot: "OPENROUTER_API_KEY",
    openrouter_model: "openrouter/owl-alpha",
    nvidia_nim_key_slot: "NVIDIA_NIM_API_KEY",
    nvidia_nim_model: "nvidia/nemotron-3-ultra-550b-a55b:free",
  });

  // Extra client-member columns (A4): personal_phone + soft-delete flag.
  const cm = dao.findCollectionByNameOrId("client_members");
  cm.schema.addField(new SchemaField({ name: "personal_phone", type: "text" }));
  cm.schema.addField(new SchemaField({ name: "is_active", type: "bool" }));
  dao.saveCollection(cm);
  // Existing seeded members default to active.
  dao.findRecordsByFilter("client_members", "1=1", "created", 500, 0).forEach((m) => {
    m.set("is_active", true); dao.saveRecord(m);
  });
}, (db) => {
  const dao = new Dao(db);
  ["ticket_members", "call_logs", "voice_settings"].forEach((n) => {
    try { dao.deleteCollection(dao.findCollectionByNameOrId(n)); } catch (_) {}
  });
  try {
    const cm = dao.findCollectionByNameOrId("client_members");
    ["personal_phone", "is_active"].forEach((f) => {
      const field = cm.schema.getFieldByName(f);
      if (field) cm.schema.removeField(field.id);
    });
    dao.saveCollection(cm);
  } catch (_) {}
});
