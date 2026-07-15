"""Seed database with sample data for Fiji IT Solutions."""
import asyncio
import os
from datetime import datetime, timedelta
import bcrypt
from sqlalchemy import select as sa_select

from app.database import async_session, engine, Base
from app.models import (
    User, UserRole, Client, ClientType, Ticket, TicketStatus, TicketPriority,
    TimeEntry, Comment, CommentVisibility, KnowledgeBase, Invoice,
    RustDeskDevice, RemoteSession, Lead, LeadSource, LeadStatus,
)


async def seed():
    # Create all tables first
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        pw = bcrypt.hashpw(os.environ.get("SEED_ADMIN_PASSWORD", "change-me-admin").encode(), bcrypt.gensalt()).decode()
        pw_tech = bcrypt.hashpw(os.environ.get("SEED_TECH_PASSWORD", "change-me-tech").encode(), bcrypt.gensalt()).decode()
        pw_guest = bcrypt.hashpw(os.environ.get("SEED_GUEST_PASSWORD", "change-me-guest").encode(), bcrypt.gensalt()).decode()

        now = datetime.utcnow()

        # ── Users ──────────────────────────────────────────────────────────────
        result = await session.execute(sa_select(User.email))
        existing_emails = {row[0] for row in result.all()}

        user_map = {}
        for email, name, pw_hash, role in [
            ("admin@example.test", "Demo Administrator", pw, UserRole.ADMIN),
            ("tech@example.test", "Demo Technician", pw_tech, UserRole.TECHNICIAN),
            ("guest@example.test", "Demo Guest", pw_guest, UserRole.GUEST),
        ]:
            if email not in existing_emails:
                u = User(name=name, email=email, password_hash=pw_hash,
                         role=role, is_active=True, created_at=now)
                session.add(u)
            else:
                r = await session.execute(sa_select(User).where(User.email == email))
                u = r.scalar_one()
            user_map[email] = u
        await session.flush()

        # ── Clients ────────────────────────────────────────────────────────────
        result = await session.execute(sa_select(Client.email).where(Client.email.isnot(None)))
        existing_client_emails = {row[0] for row in result.all() if row[0]}

        client_map = {}
        for email, name, phone, company, addr, ctype, rate in [
            ("it@acme.com", "Acme Corp", "555-0101", "Acme Corporation", "123 Main St", ClientType.MANAGED, 150.0),
            ("bob@email.com", "Bob Smith", "555-0202", None, "456 Oak Ave", ClientType.TEMP, 200.0),
            ("admin@cityhospital.org", "City Hospital", "555-0303", "City Hospital", "789 Health Blvd", ClientType.MANAGED, 175.0),
        ]:
            if email not in existing_client_emails:
                c = Client(name=name, email=email, phone=phone, company=company,
                           address=addr, client_type=ctype, hourly_rate=rate,
                           is_active=True, created_at=now)
                session.add(c)
            else:
                r = await session.execute(sa_select(Client).where(Client.email == email))
                c = r.scalar_one()
            client_map[email] = c
        await session.flush()

        # ── Leads (25+ across all statuses for workflow testing) ────────────────
        leads = [
            # NEW leads (inbox)
            Lead(source=LeadSource.EMAIL, sender_name="John Doe",
                 sender_email="john@example.com", sender_phone="555-1001",
                 subject="Need help with server migration",
                 body="We are planning to migrate our on-prem servers to the cloud. Can you help?",
                 status=LeadStatus.NEW, created_at=now - timedelta(days=5)),
            Lead(source=LeadSource.WEB, sender_name="Alice Nguyen",
                 sender_email="alice@nguyen-law.com", sender_phone="555-1006",
                 subject="Law firm IT support needed",
                 body="Our small law firm needs ongoing IT support for 12 workstations and a file server. Looking for a managed services provider.",
                 status=LeadStatus.NEW, created_at=now - timedelta(days=4)),
            Lead(source=LeadSource.PHONE, sender_name="Robert Chen",
                 sender_email="robert@chen-bistro.com", sender_phone="555-1007",
                 subject="POS system crashed",
                 body="Our restaurant POS system crashed during dinner rush. Need emergency support.",
                 status=LeadStatus.NEW, created_at=now - timedelta(days=3)),
            Lead(source=LeadSource.SMS, sender_name="Maria Garcia",
                 sender_email="maria@gpconstruction.com", sender_phone="555-1008",
                 subject="Need new office network setup",
                 body="Setting up a new office for 20 people. Need full network infrastructure.",
                 status=LeadStatus.NEW, created_at=now - timedelta(days=2)),
            Lead(source=LeadSource.EMAIL, sender_name="David Kim",
                 sender_email="david@kimdental.com", sender_phone="555-1009",
                 subject="HIPAA compliance audit prep",
                 body="Dental practice needs help preparing for HIPAA compliance audit. Need security assessment.",
                 status=LeadStatus.NEW, created_at=now - timedelta(days=1)),
            Lead(source=LeadSource.WEB, sender_name="Jennifer Adams",
                 sender_email="jennifer@adams-realty.com", sender_phone="555-1010",
                 subject="Email hosting migration",
                 body="Real estate agency with 15 agents needs to migrate from GoDaddy email to Microsoft 365.",
                 status=LeadStatus.NEW, created_at=now - timedelta(hours=18)),
            Lead(source=LeadSource.VOICEMAIL, sender_name="Steve Miller",
                 sender_email="steve@miller-auto.com", sender_phone="555-1011",
                 subject="Voicemail: Website down",
                 body="Left voicemail: Our company website has been down for 2 days. Need urgent help.",
                 status=LeadStatus.NEW, created_at=now - timedelta(hours=12)),
            Lead(source=LeadSource.EMAIL, sender_name="Patricia Brown",
                 sender_email="patricia@browncpa.com", sender_phone="555-1012",
                 subject="Tax season prep - server upgrade",
                 body="Accounting firm needs server upgrade before tax season. Currently running Server 2012.",
                 status=LeadStatus.NEW, created_at=now - timedelta(hours=6)),
            # REVIEWING leads
            Lead(source=LeadSource.WEB, sender_name="Sarah Connor",
                 sender_email="sarah@skynet.com", sender_phone="555-1002",
                 subject="WiFi issues in office",
                 body="Our office WiFi has been dropping connections frequently.",
                 status=LeadStatus.REVIEWING, created_at=now - timedelta(days=3)),
            Lead(source=LeadSource.PHONE, sender_name="James Wilson",
                 sender_email="james@wilson-plumbing.com", sender_phone="555-1013",
                 subject="Fleet management software install",
                 body="Plumbing company with 15 vehicles needs fleet management software installed on tablets.",
                 status=LeadStatus.REVIEWING, created_at=now - timedelta(days=2)),
            Lead(source=LeadSource.EMAIL, sender_name="Linda Martinez",
                 sender_email="linda@martinez-arch.com", sender_phone="555-1014",
                 subject="CAD workstation setup",
                 body="Architecture firm needs 3 high-performance CAD workstations configured with AutoCAD and Revit.",
                 status=LeadStatus.REVIEWING, created_at=now - timedelta(days=1)),
            Lead(source=LeadSource.SMS, sender_name="Kevin O'Brien",
                 sender_email="kevin@obrien-retail.com", sender_phone="555-1015",
                 subject="Security camera system",
                 body="Retail store needs 16-camera security system installed with remote viewing.",
                 status=LeadStatus.REVIEWING, created_at=now - timedelta(hours=8)),
            # APPROVED leads (ready to convert to tickets)
            Lead(source=LeadSource.PHONE, sender_name="Mike Johnson",
                 sender_email="mike@startup.io", sender_phone="555-1003",
                 subject="New employee laptop setup",
                 body="We have 5 new employees starting next week. Need laptops configured.",
                 status=LeadStatus.APPROVED, created_at=now - timedelta(days=2)),
            Lead(source=LeadSource.EMAIL, sender_name="Rachel Green",
                 sender_email="rachel@green-school.edu", sender_phone="555-1016",
                 subject="School computer lab refresh",
                 body="Elementary school needs 30 refurbished computers set up in a new computer lab.",
                 status=LeadStatus.APPROVED, created_at=now - timedelta(days=1)),
            Lead(source=LeadSource.WEB, sender_name="Thomas Wright",
                 sender_email="thomas@wright-mfg.com", sender_phone="555-1017",
                 subject="Factory floor network",
                 body="Manufacturing plant needs industrial-grade WiFi coverage across 50,000 sq ft facility.",
                 status=LeadStatus.APPROVED, created_at=now - timedelta(hours=12)),
            Lead(source=LeadSource.PHONE, sender_name="Nancy Drew",
                 sender_email="nancy@drew-insurance.com", sender_phone="555-1018",
                 subject="Disaster recovery planning",
                 body="Insurance agency needs comprehensive disaster recovery plan and offsite backup solution.",
                 status=LeadStatus.APPROVED, created_at=now - timedelta(hours=6)),
            # CONVERTED leads (already became tickets)
            Lead(source=LeadSource.SMS, sender_name="Lisa Park",
                 sender_email="lisa@park.com", sender_phone="555-1004",
                 subject="Printer not working",
                 body="The main office printer is showing an error. Please help.",
                 status=LeadStatus.CONVERTED, created_at=now - timedelta(days=7)),
            Lead(source=LeadSource.EMAIL, sender_name="George Harris",
                 sender_email="george@harris-law.com", sender_phone="555-1019",
                 subject="Email encryption setup",
                 body="Law firm needs email encryption for all attorneys to comply with bar requirements.",
                 status=LeadStatus.CONVERTED, created_at=now - timedelta(days=5)),
            Lead(source=LeadSource.WEB, sender_name="Susan Taylor",
                 sender_email="susan@taylor-spa.com", sender_phone="555-1020",
                 subject="Booking system integration",
                 body="Spa needs online booking system integrated with their website and payment processing.",
                 status=LeadStatus.CONVERTED, created_at=now - timedelta(days=3)),
            # DENIED leads
            Lead(source=LeadSource.EMAIL, sender_name="Tom Wilson",
                 sender_email="tom@wilson.com", sender_phone="555-1005",
                 subject="Backup solution inquiry",
                 body="Looking for a managed backup solution for our small business.",
                 status=LeadStatus.DENIED, denial_reason="Outside service area",
                 created_at=now - timedelta(days=4)),
            Lead(source=LeadSource.PHONE, sender_name="Frank Castle",
                 sender_email="frank@castle.net", sender_phone="555-1021",
                 subject="Gaming PC build",
                 body="Wants custom gaming PC built. Not a business service we offer.",
                 status=LeadStatus.DENIED, denial_reason="Not a service we provide",
                 created_at=now - timedelta(days=3)),
            Lead(source=LeadSource.EMAIL, sender_name="Betty White",
                 sender_email="betty@white-home.com", sender_phone="555-1022",
                 subject="Personal laptop repair",
                 body="My personal laptop screen is cracked. Can you fix it?",
                 status=LeadStatus.DENIED, denial_reason="Consumer service - refer to retail",
                 created_at=now - timedelta(days=2)),
            Lead(source=LeadSource.SMS, sender_name="Hank Pym",
                 sender_email="hank@pym-tech.com", sender_phone="555-1023",
                 subject="Free consultation request",
                 body="Wants 3 hours of free consultation to 'pick our brains'. No budget for actual work.",
                 status=LeadStatus.DENIED, denial_reason="No budget / tire kicker",
                 created_at=now - timedelta(days=1)),
            Lead(source=LeadSource.WEB, sender_name="Ivy League",
                 sender_email="ivy@league-university.edu", sender_phone="555-1024",
                 subject="Campus-wide network redesign",
                 body="University wants complete campus network redesign. Project too large for our current capacity.",
                 status=LeadStatus.DENIED, denial_reason="Project scope exceeds capacity",
                 created_at=now - timedelta(hours=6)),
        ]
        for l in leads:
            session.add(l)
        await session.flush()

        # ── Tickets ────────────────────────────────────────────────────────────
        result = await session.execute(sa_select(Ticket.ticket_number))
        existing_tickets = {row[0] for row in result.all()}

        ticket_map = {}
        ticket_data = [
            ("FIT-00001", "Email server down", "Exchange server not responding since 9am",
             TicketStatus.IN_PROGRESS, TicketPriority.CRITICAL, 1, 2, now - timedelta(days=2)),
            ("FIT-00002", "Printer not working", "HP LaserJet showing error code",
             TicketStatus.NEW, TicketPriority.MEDIUM, 1, None, now - timedelta(days=1)),
            ("FIT-00003", "New laptop setup", "Configure new Dell laptop for Dr. Jones",
             TicketStatus.WAITING_CUSTOMER, TicketPriority.LOW, 3, 2, now - timedelta(days=3)),
            ("FIT-00004", "WiFi intermittent drops", "Users report WiFi disconnecting every 30 min",
             TicketStatus.IN_PROGRESS, TicketPriority.HIGH, 2, 2, now - timedelta(hours=5)),
            ("FIT-00005", "Backup verification", "Verify nightly backup completed successfully",
             TicketStatus.DONE, TicketPriority.MEDIUM, 1, 2, now - timedelta(days=7)),
        ]
        for num, title, desc, stat, pri, cid, aid, created in ticket_data:
            if num not in existing_tickets:
                t = Ticket(ticket_number=num, title=title, description=desc,
                           status=stat, priority=pri, client_id=cid, assigned_to=aid,
                           created_at=created, updated_at=created)
                if stat == TicketStatus.DONE:
                    t.closed_at = created + timedelta(days=1)
                session.add(t)
                ticket_map[num] = t
            else:
                r = await session.execute(sa_select(Ticket).where(Ticket.ticket_number == num))
                ticket_map[num] = r.scalar_one()
        await session.flush()

        # ── Time Entries ───────────────────────────────────────────────────────
        result = await session.execute(sa_select(TimeEntry.id))
        existing_te_count = len(result.scalars().all())
        if existing_te_count == 0:
            tech = user_map["tech@example.test"]
            time_entries = [
                TimeEntry(ticket_id=1, user_id=tech.id,
                          started_at=now - timedelta(hours=4),
                          ended_at=now - timedelta(hours=2),
                          duration_seconds=7200,
                          description="Diagnosed Exchange server issue",
                          is_running=False, created_at=now),
                TimeEntry(ticket_id=1, user_id=tech.id,
                          started_at=now - timedelta(hours=1),
                          ended_at=None, duration_seconds=None,
                          description="Applying fix to Exchange server",
                          is_running=True, created_at=now),
                TimeEntry(ticket_id=4, user_id=tech.id,
                          started_at=now - timedelta(hours=3),
                          ended_at=now - timedelta(hours=2),
                          duration_seconds=3600,
                          description="Checked WiFi access points",
                          is_running=False, created_at=now),
                TimeEntry(ticket_id=5, user_id=tech.id,
                          started_at=now - timedelta(days=6),
                          ended_at=now - timedelta(days=6, minutes=-45),
                          duration_seconds=2700,
                          description="Verified backup logs",
                          is_running=False, created_at=now),
            ]
            for te in time_entries:
                session.add(te)
            await session.flush()

        # ── Comments ───────────────────────────────────────────────────────────
        result = await session.execute(sa_select(Comment.id))
        existing_comment_count = len(result.scalars().all())
        if existing_comment_count == 0:
            admin = user_map["admin@example.test"]
            tech = user_map["tech@example.test"]
            comments = [
                Comment(ticket_id=1, author_id=tech.id,
                        body="Started investigating the Exchange server issue. Will update within 2 hours.",
                        visibility=CommentVisibility.PUBLIC, emailed_to_client=True,
                        created_at=now - timedelta(hours=4)),
                Comment(ticket_id=1, author_id=admin.id,
                        body="Client is escalating. Please prioritize.",
                        visibility=CommentVisibility.PRIVATE, emailed_to_client=False,
                        created_at=now - timedelta(hours=3)),
                Comment(ticket_id=1, author_id=tech.id,
                        body="Found the issue - corrupted database. Applying fix now.",
                        visibility=CommentVisibility.PUBLIC, emailed_to_client=False,
                        created_at=now - timedelta(hours=1)),
                Comment(ticket_id=4, author_id=tech.id,
                        body="Replaced faulty access point in main office.",
                        visibility=CommentVisibility.PUBLIC, emailed_to_client=False,
                        created_at=now - timedelta(hours=2)),
            ]
            for c in comments:
                session.add(c)
            await session.flush()

        # ── Knowledge Base ─────────────────────────────────────────────────────
        result = await session.execute(sa_select(KnowledgeBase.id))
        existing_kb_count = len(result.scalars().all())
        if existing_kb_count == 0:
            kb_articles = [
                KnowledgeBase(
                    title="Exchange Server Recovery",
                    content="Step-by-step guide to recover Exchange server from database corruption...",
                    tags="exchange,server,recovery", category="Email Systems",
                    source_ticket_id=5, is_active=True, created_at=now, updated_at=now),
                KnowledgeBase(
                    title="WiFi Troubleshooting Checklist",
                    content="1. Check access point LEDs 2. Verify DHCP scope 3. Test with wired connection...",
                    tags="wifi,networking,troubleshooting", category="Networking",
                    source_ticket_id=None, is_active=True, created_at=now, updated_at=now),
            ]
            for kb in kb_articles:
                session.add(kb)
            await session.flush()

        # ── Invoices ───────────────────────────────────────────────────────────
        result = await session.execute(sa_select(Invoice.invoice_number))
        existing_inv_nums = {row[0] for row in result.all()}
        invoices = []
        if "INV-00001" not in existing_inv_nums:
            invoices.append(Invoice(
                invoice_number="INV-00001", client_id=1, ticket_id=None,
                period_start=now - timedelta(days=30), period_end=now,
                total_hours=24.5, hourly_rate=150.0, total_amount=3675.00,
                status="sent", created_at=now - timedelta(days=5),
                sent_at=now - timedelta(days=4)))
        if "INV-00002" not in existing_inv_nums:
            invoices.append(Invoice(
                invoice_number="INV-00002", client_id=2, ticket_id=4,
                period_start=now - timedelta(days=7), period_end=now,
                total_hours=1.0, hourly_rate=200.0, total_amount=200.00,
                status="draft", created_at=now))
        for inv in invoices:
            session.add(inv)
        await session.flush()

        # ── RustDesk Devices ───────────────────────────────────────────────────
        result = await session.execute(sa_select(RustDeskDevice.device_id))
        existing_device_ids = {row[0] for row in result.all()}
        admin = user_map["admin@example.test"]
        devices = []
        for did, cid, alias, os_name, hostname, cpu in [
            ("8086123456789012", 1, "Acme-PC-01", "Windows 11", "ACME-WS-01", "Intel i7-12700"),
            ("8086123456789013", 1, "Acme-Server", "Windows Server 2022", "ACME-SRV-01", "Xeon E5-2680"),
            ("8086123456789014", 2, "Bob-Laptop", "macOS 14", "Bob-MacBook", "Apple M2"),
            ("8086123456789015", 3, "Hospital-PC-01", "Windows 10", "HOSP-WS-05", "Intel i5-10400"),
        ]:
            if did not in existing_device_ids:
                devices.append(RustDeskDevice(
                    client_id=cid, device_id=did, alias=alias, os=os_name,
                    hostname=hostname, cpu=cpu, is_active=True,
                    registered_by=admin.id, created_at=now))
        for d in devices:
            session.add(d)
        await session.flush()

        # ── Remote Sessions ────────────────────────────────────────────────────
        result = await session.execute(sa_select(RemoteSession.uuid))
        existing_session_uuids = {row[0] for row in result.all()}
        tech = user_map["tech@example.test"]
        sessions_list = []
        for uuid, tid, dev_id, cid, notes, started, ended, dur in [
            ("a1b2c3d4-e5f6-7890-abcd-ef1234567890", 1, 1, 1,
             "Connected to diagnose Exchange issue",
             now - timedelta(hours=4), now - timedelta(hours=2), 7200),
            ("b2c3d4e5-f6a7-8901-bcde-f12345678901", 4, 3, 2,
             "Checked WiFi settings on Bob laptop",
             now - timedelta(hours=3), now - timedelta(hours=2), 3600),
        ]:
            if uuid not in existing_session_uuids:
                sessions_list.append(RemoteSession(
                    uuid=uuid, ticket_id=tid, device_id=dev_id,
                    client_id=cid, technician_id=tech.id, notes=notes,
                    started_at=started, ended_at=ended,
                    duration_seconds=dur, created_at=started))
        for s in sessions_list:
            session.add(s)
        await session.flush()

        await session.commit()

        # Verify
        counts = {}
        for model, name in [
            (User, "users"), (Client, "clients"), (Lead, "leads"),
            (Ticket, "tickets"), (TimeEntry, "time_entries"),
            (Comment, "comments"), (KnowledgeBase, "knowledge_base"),
            (Invoice, "invoices"), (RustDeskDevice, "rustdesk_devices"),
            (RemoteSession, "remote_sessions"),
        ]:
            result = await session.execute(sa_select(model))
            counts[name] = len(result.scalars().all())

        print("Seeded data:")
        for t, c in counts.items():
            print(f"  {t}: {c} rows")


if __name__ == "__main__":
    asyncio.run(seed())
