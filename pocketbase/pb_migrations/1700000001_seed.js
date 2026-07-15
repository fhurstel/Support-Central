/// Synthetic demo seed (runs once). Uses .test identities and default demo
/// passwords — change them after first deploy via user management. Ids are the
/// integer `nid` values the frontend expects; foreign keys reference them.
migrate((db) => {
  const dao = new Dao(db);
  const usersCol = dao.findCollectionByNameOrId("users");
  const now = new Date().toISOString();

  function rec(coll, data) { const r = new Record(dao.findCollectionByNameOrId(coll), data); dao.saveRecord(r); return r; }
  function user(nid, username, email, name, role, pw, phone) {
    const r = new Record(usersCol, { nid, username, email, name, role, phone: phone || "", is_active: true, verified: true });
    r.setPassword(pw); dao.saveRecord(r); return r;
  }

  user(1, "admin", "admin@example.test", "Demo Administrator", "ADMIN", "DevAdmin123!", "555-0100");
  user(2, "tech", "tech@example.test", "Demo Technician", "TECH", "DevTech123!", "555-0101");
  user(3, "guest", "guest@example.test", "Demo Guest", "GUEST", "DevGuest123!", "555-0102");

  rec("clients", { nid: 1, cname: "Acme Corp", email: "ops@acme.test", phone: "555-0200", company: "Acme Corp", client_type: "BUSINESS", hourly_rate: 120, is_active: true });
  rec("clients", { nid: 2, cname: "Bob Smith", email: "bob@smith.test", phone: "555-0201", company: "", client_type: "INDIVIDUAL", hourly_rate: 90, is_active: true });
  rec("clients", { nid: 3, cname: "City Hospital", email: "it@cityhosp.test", phone: "555-0202", company: "City Hospital", client_type: "BUSINESS", hourly_rate: 150, is_active: true });

  function ticket(nid, title, desc, status, priority, clientNid, assigneeNid) {
    rec("tickets", { nid, ticket_number: "FIT-" + String(nid).padStart(5, "0"), title, description: desc, status, priority, client_id: clientNid || null, assigned_to: assigneeNid || null, position: nid, is_archived: false });
  }
  ticket(1, "Email server down", "Exchange server not responding since this morning.", "IN_PROGRESS", "CRITICAL", 1, 2);
  ticket(2, "Printer not working", "Front desk printer shows paper jam but there is none.", "NEW", "MEDIUM", 1, null);
  ticket(3, "New laptop setup", "Provision and configure a new laptop for onboarding.", "WAITING_CUSTOMER", "LOW", 3, 2);
  ticket(4, "WiFi intermittent drops", "WiFi drops every few minutes in the main office.", "IN_PROGRESS", "HIGH", 2, 2);
  ticket(5, "Backup verification", "Verify nightly backups completed and are restorable.", "DONE", "MEDIUM", 1, 2);

  rec("comments", { nid: 1, ticket_id: 1, author_id: 2, body: "Started investigating the Exchange server issue. Will update within 2 hours.", visibility: "PUBLIC", emailed_to_client: true });
  rec("comments", { nid: 2, ticket_id: 1, author_id: 1, body: "Client is escalating. Please prioritize.", visibility: "PRIVATE", emailed_to_client: false });
  rec("comments", { nid: 3, ticket_id: 1, author_id: 2, body: "Found the issue — corrupted database. Applying fix now.", visibility: "PUBLIC", emailed_to_client: false });

  rec("time_entries", { nid: 1, ticket_id: 1, user_id: 2, started_at: now, ended_at: now, duration_seconds: 7200, description: "Diagnosed Exchange server issue", is_running: false });
  rec("time_entries", { nid: 2, ticket_id: 3, user_id: 2, started_at: now, ended_at: now, duration_seconds: 1800, description: "Initial laptop imaging", is_running: false });

  const leads = [
    ["EMAIL", "Patricia Brown", "patricia@newco.test", "Tax season prep - server upgrade", "NEW"],
    ["PHONE", "Nancy Drew", "nancy@firm.test", "Disaster recovery planning", "APPROVED"],
    ["WEB", "Ivy League", "ivy@edu.test", "Campus-wide network redesign", "DENIED"],
    ["SMS", "Kevin O'Brien", "kevin@shop.test", "Security camera system", "REVIEWING"],
    ["VOICEMAIL", "Steve Miller", "steve@band.test", "Website down", "NEW"],
  ];
  leads.forEach((l, i) => rec("leads", { nid: i + 1, source: l[0], sender_name: l[1], sender_email: l[2], sender_phone: "555-0300", subject: l[3], body: "Please follow up.", status: l[4] }));

  rec("invoices", { nid: 1, invoice_number: "INV-00001", client_id: 1, ticket_id: 1, total_hours: 2, hourly_rate: 120, total_amount: 240, status: "DRAFT" });
  rec("invoices", { nid: 2, invoice_number: "INV-00002", client_id: 3, ticket_id: 3, total_hours: 0.5, hourly_rate: 150, total_amount: 75, status: "SENT", sent_at: now });

  rec("knowledge_base", { nid: 1, title: "Resetting a user password", content: "Steps to reset a user's password in the admin console.", category: "Accounts", tags: ["password", "accounts"], is_active: true });
  rec("knowledge_base", { nid: 2, title: "Exchange server restart procedure", content: "Safe restart procedure for the Exchange server.", category: "Servers", tags: ["exchange", "email"], is_active: true });
}, (db) => {});
