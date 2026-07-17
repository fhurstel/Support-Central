/// Full invoicing: line items, tax, due dates, payment tracking, and linking
/// billed time entries to the invoice that billed them.
migrate((db) => {
  const dao = new Dao(db);

  const invoices = dao.findCollectionByNameOrId("invoices");
  [
    { name: "due_date", type: "text" },
    { name: "notes", type: "text", options: { max: 10000 } },
    { name: "tax_rate", type: "number" },
    { name: "subtotal", type: "number" },
    { name: "tax_amount", type: "number" },
    { name: "paid_at", type: "text" },
    { name: "items", type: "json", options: { maxSize: 2000000 } },
  ].forEach((f) => invoices.schema.addField(new SchemaField(f)));
  dao.saveCollection(invoices);

  const time = dao.findCollectionByNameOrId("time_entries");
  time.schema.addField(new SchemaField({ name: "invoice_id", type: "number" }));
  dao.saveCollection(time);
}, (db) => {
  const dao = new Dao(db);
  try {
    const invoices = dao.findCollectionByNameOrId("invoices");
    ["due_date", "notes", "tax_rate", "subtotal", "tax_amount", "paid_at", "items"].forEach((n) => {
      const f = invoices.schema.getFieldByName(n); if (f) invoices.schema.removeField(f.id);
    });
    dao.saveCollection(invoices);
    const time = dao.findCollectionByNameOrId("time_entries");
    const f = time.schema.getFieldByName("invoice_id"); if (f) time.schema.removeField(f.id);
    dao.saveCollection(time);
  } catch (_) {}
});
