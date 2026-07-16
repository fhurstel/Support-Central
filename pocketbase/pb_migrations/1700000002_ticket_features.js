/// Ticket sub-features: labels, checklists (+items), attachments, activity.
migrate((db) => {
  const dao = new Dao(db);
  const txt = (name, opts) => Object.assign({ name, type: "text" }, opts || {});
  const num = (name) => ({ name, type: "number" });
  const bool = (name) => ({ name, type: "bool" });

  function make(name, fields) {
    const c = new Collection({ name, type: "base", listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, schema: [num("nid")].concat(fields) });
    dao.saveCollection(c);
  }

  make("labels", [txt("name", { required: true }), txt("color")]);
  make("ticket_labels", [num("ticket_id"), num("label_id")]);
  make("checklists", [num("ticket_id"), txt("title"), num("position")]);
  make("checklist_items", [num("checklist_id"), txt("text"), bool("completed"), num("position")]);
  make("attachments", [num("ticket_id"), txt("filename"), num("size"), txt("mime_type"), num("uploader_id"),
    { name: "file", type: "file", options: { maxSelect: 1, maxSize: 10485760 } }]);
  make("activity", [num("ticket_id"), txt("type"), txt("action_detail", { options: { max: 5000 } }), num("actor_id")]);

  // small seed so the UI shows something
  const rec = (coll, data) => { const r = new Record(dao.findCollectionByNameOrId(coll), data); dao.saveRecord(r); return r; };
  rec("labels", { nid: 1, name: "Urgent", color: "#ef4444" });
  rec("labels", { nid: 2, name: "Hardware", color: "#3b82f6" });
  rec("labels", { nid: 3, name: "Follow-up", color: "#f59e0b" });
  rec("ticket_labels", { nid: 1, ticket_id: 1, label_id: 1 });
  rec("checklists", { nid: 1, ticket_id: 1, title: "Recovery steps", position: 1 });
  rec("checklist_items", { nid: 1, checklist_id: 1, text: "Restart Exchange service", completed: true, position: 1 });
  rec("checklist_items", { nid: 2, checklist_id: 1, text: "Verify mail flow", completed: false, position: 2 });
  rec("checklist_items", { nid: 3, checklist_id: 1, text: "Notify affected users", completed: false, position: 3 });
  rec("activity", { nid: 1, ticket_id: 1, type: "created", action_detail: JSON.stringify({}), actor_id: 2 });
}, (db) => {
  const dao = new Dao(db);
  ["activity", "attachments", "checklist_items", "checklists", "ticket_labels", "labels"].forEach((n) => {
    try { dao.deleteCollection(dao.findCollectionByNameOrId(n)); } catch (_) {}
  });
});
