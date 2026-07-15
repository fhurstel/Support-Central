/// Fiji IT Service Desk — PocketBase schema.
/// The React frontend assumes integer ids, so every collection carries a numeric
/// `nid` that the /api compatibility layer exposes as `id`; foreign keys store
/// the referenced record's `nid`. Raw record rules are locked (admin-only) —
/// access goes through the custom /api/* routes.
migrate((db) => {
  const dao = new Dao(db);

  const txt = (name, opts) => Object.assign({ name, type: "text" }, opts || {});
  const num = (name) => ({ name, type: "number" });
  const bool = (name) => ({ name, type: "bool" });
  const json = (name) => ({ name, type: "json", options: { maxSize: 2000000 } });

  function make(name, fields) {
    const c = new Collection({
      name, type: "base",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      schema: [num("nid")].concat(fields),
    });
    dao.saveCollection(c);
  }

  // Extend built-in users auth collection.
  const users = dao.findCollectionByNameOrId("users");
  users.schema.addField(new SchemaField({ name: "nid", type: "number" }));
  users.schema.addField(new SchemaField({ name: "role", type: "select", options: { maxSelect: 1, values: ["ADMIN", "TECH", "GUEST"] } }));
  users.schema.addField(new SchemaField({ name: "phone", type: "text" }));
  users.schema.addField(new SchemaField({ name: "is_active", type: "bool" }));
  dao.saveCollection(users);

  make("clients", [
    txt("cname", { required: true }), txt("email"), txt("phone"), txt("company"),
    txt("client_type"), num("hourly_rate"), bool("is_active"),
  ]);

  make("client_members", [
    num("client_id"), txt("name"), txt("email"), txt("phone"), txt("role"), bool("is_primary"),
  ]);

  make("leads", [
    txt("source"), txt("sender_name"), txt("sender_email"), txt("sender_phone"),
    txt("subject"), txt("body", { options: { max: 20000 } }), txt("status"),
    txt("denial_reason"), num("converted_ticket_id"), txt("reviewed_at"),
  ]);

  make("tickets", [
    txt("ticket_number"), txt("title", { required: true }),
    txt("description", { options: { max: 20000 } }),
    txt("status"), txt("priority"), num("client_id"), num("assigned_to"),
    txt("due_date"), txt("start_date"), num("position"), bool("is_archived"),
    txt("archived_at"), txt("closed_at"), txt("completed_at"),
    txt("cover_color"), num("estimated_hours"), json("custom_fields"),
  ]);

  make("comments", [
    num("ticket_id"), num("author_id"), txt("body", { options: { max: 20000 } }),
    txt("visibility"), bool("emailed_to_client"),
  ]);

  make("time_entries", [
    num("ticket_id"), num("user_id"), txt("started_at"), txt("ended_at"),
    num("duration_seconds"), txt("description"), bool("is_running"),
  ]);

  make("invoices", [
    txt("invoice_number"), num("client_id"), num("ticket_id"), num("total_hours"),
    num("hourly_rate"), num("total_amount"), txt("status"), txt("sent_at"),
    txt("period_start"), txt("period_end"),
  ]);

  make("knowledge_base", [
    txt("title", { required: true }), txt("content", { options: { max: 50000 } }),
    txt("category"), json("tags"), bool("is_active"),
  ]);
}, (db) => {
  const dao = new Dao(db);
  ["knowledge_base", "invoices", "time_entries", "comments", "tickets", "leads", "client_members", "clients"].forEach((n) => {
    try { dao.deleteCollection(dao.findCollectionByNameOrId(n)); } catch (_) {}
  });
});
