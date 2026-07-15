"""SQLAlchemy models for Fiji IT Solutions ticketing system."""
import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime,
    ForeignKey, Enum
)
from sqlalchemy.orm import relationship
from app.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    TECHNICIAN = "TECHNICIAN"
    GUEST = "GUEST"


class LeadStatus(str, enum.Enum):
    NEW = "NEW"
    REVIEWING = "REVIEWING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    CONVERTED = "CONVERTED"


class LeadSource(str, enum.Enum):
    EMAIL = "EMAIL"
    SMS = "SMS"
    VOICEMAIL = "VOICEMAIL"
    PHONE = "PHONE"
    WEB = "WEB"


class TicketStatus(str, enum.Enum):
    NEW = "NEW"
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_CUSTOMER = "WAITING_CUSTOMER"
    WAITING_VENDOR = "WAITING_VENDOR"
    DONE = "DONE"
    COMPLETED = "COMPLETED"
    CLOSED = "CLOSED"
    ARCHIVED = "ARCHIVED"


class TicketPriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ClientType(str, enum.Enum):
    MANAGED = "MANAGED"
    TEMP = "TEMP"


class CommentVisibility(str, enum.Enum):
    PUBLIC = "PUBLIC"
    PRIVATE = "PRIVATE"


class SatisfactionRating(str, enum.Enum):
    HAPPY = "HAPPY"
    MODERATE = "MODERATE"
    UNHAPPY = "UNHAPPY"


class KanbanLabelColor(str, enum.Enum):
    GREEN = "green"
    YELLOW = "yellow"
    ORANGE = "orange"
    RED = "red"
    PURPLE = "purple"
    BLUE = "blue"
    SKY = "sky"
    LIME = "lime"
    PINK = "pink"
    BLACK = "black"


class ActivityActionType(str, enum.Enum):
    CREATED = "created"
    MOVED = "moved"
    COMMENTED = "commented"
    UPDATED = "updated"
    COMPLETED_CHECKLIST = "completed_checklist"
    UNCOMPLETED_CHECKLIST = "uncompleted_checklist"
    ADDED_LABEL = "added_label"
    REMOVED_LABEL = "removed_label"
    ADDED_MEMBER = "added_member"
    REMOVED_MEMBER = "removed_member"
    SET_DUE_DATE = "set_due_date"
    REMOVED_DUE_DATE = "removed_due_date"
    ADDED_ATTACHMENT = "added_attachment"
    REMOVED_ATTACHMENT = "removed_attachment"
    ARCHIVED = "archived"
    UNARCHIVED = "unarchived"


# ── User ──────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.TECHNICIAN, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Lead ──────────────────────────────────────────────────────────────────────

class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(Enum(LeadSource), nullable=False)
    sender_name = Column(String(255))
    sender_email = Column(String(255))
    sender_phone = Column(String(50))
    subject = Column(String(500))
    body = Column(Text)
    raw_content = Column(Text)
    attachment_paths = Column(Text)
    status = Column(Enum(LeadStatus), default=LeadStatus.NEW)
    denial_reason = Column(Text)
    converted_ticket_id = Column(Integer, ForeignKey("tickets.id", name="fk_leads_converted_ticket"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)


# ── Client ────────────────────────────────────────────────────────────────────

class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255))
    phone = Column(String(50))
    company = Column(String(255))
    address = Column(Text)
    client_type = Column(Enum(ClientType), default=ClientType.MANAGED)
    hourly_rate = Column(Float, default=0.0)
    contract_notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Client Member (people belonging to a client) ──────────────────────────────

class ClientMember(Base):
    __tablename__ = "client_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255))
    phone = Column(String(50))
    personal_phone = Column(String(50))
    role = Column(String(100))  # e.g. "Manager", "Contact"
    is_primary = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Ticket ────────────────────────────────────────────────────────────────────

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_number = Column(String(20), unique=True, nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    status = Column(Enum(TicketStatus), default=TicketStatus.NEW, index=True)
    priority = Column(Enum(TicketPriority), default=TicketPriority.MEDIUM, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    client_member_id = Column(Integer, ForeignKey("client_members.id"), nullable=True, index=True)
    source_lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    satisfaction = Column(Enum(SatisfactionRating), nullable=True)
    satisfaction_comment = Column(Text)
    is_kb_candidate = Column(Boolean, default=False)
    kb_article_id = Column(Integer, ForeignKey("knowledge_base.id", name="fk_tickets_kb_article"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = Column(DateTime)

    # ── Kanban / Trello-like fields ──
    cover_color = Column(String(20), nullable=True)
    cover_image_url = Column(String(500), nullable=True)
    due_date = Column(DateTime, nullable=True)
    start_date = Column(DateTime, nullable=True)
    position = Column(Float, default=0.0, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    archived_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    estimated_hours = Column(Float, nullable=True)
    actual_hours = Column(Float, default=0.0)
    checklist_total = Column(Integer, default=0)
    checklist_completed = Column(Integer, default=0)
    attachment_count = Column(Integer, default=0)
    label_ids_json = Column(Text, default='[]')
    member_ids_json = Column(Text, default='[]')
    custom_fields_json = Column(Text, nullable=True)

    # Relationships
    client = relationship("Client", backref="tickets")
    assigned_to_user = relationship("User", backref="assigned_tickets", foreign_keys=[assigned_to])
    comments = relationship("Comment", backref="ticket", order_by="Comment.created_at")
    time_entries = relationship("TimeEntry", backref="ticket")
    checklists = relationship("Checklist", backref="ticket", order_by="Checklist.position")
    attachments = relationship("Attachment", backref="ticket", order_by="Attachment.created_at.desc()")
    activity_logs = relationship("ActivityLog", backref="ticket", order_by="ActivityLog.created_at.desc()")


# ── Time Entry ────────────────────────────────────────────────────────────────

class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    description = Column(Text)
    is_running = Column(Boolean, default=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="time_entries")


# ── Comment ───────────────────────────────────────────────────────────────────

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    visibility = Column(Enum(CommentVisibility), default=CommentVisibility.PRIVATE)
    emailed_to_client = Column(Boolean, default=False)
    email_sent_at = Column(DateTime)
    attachments_json = Column(Text, default='[]')
    created_at = Column(DateTime, default=datetime.utcnow)

    author = relationship("User", backref="comments")

    @property
    def attachments(self) -> list:
        """Parse attachments_json into a list of dicts."""
        import json as _json
        try:
            return _json.loads(self.attachments_json or '[]')
        except (ValueError, TypeError):
            return []


# ── Knowledge Base ────────────────────────────────────────────────────────────

class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(String(500))
    category = Column(String(255))
    source_ticket_id = Column(Integer, ForeignKey("tickets.id", name="fk_kb_source_ticket"), nullable=True)
    is_active = Column(Boolean, default=True)
    attachments_json = Column(Text, default='[]')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def attachments(self) -> list:
        """Parse attachments_json into a list of dicts."""
        import json as _json
        try:
            return _json.loads(self.attachments_json or '[]')
        except (ValueError, TypeError):
            return []


# ── Invoice ───────────────────────────────────────────────────────────────────

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_number = Column(String(30), unique=True, nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True)
    period_start = Column(DateTime)
    period_end = Column(DateTime)
    total_hours = Column(Float, default=0.0)
    hourly_rate = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    notes = Column(Text)
    status = Column(String(20), default="draft")
    sent_at = Column(DateTime)
    paid_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    client = relationship("Client", backref="invoices")


# ── MCP Source Config ─────────────────────────────────────────────────────────

class MCPSource(Base):
    __tablename__ = "mcp_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    source_type = Column(Enum(LeadSource), nullable=False)
    config = Column(Text)
    is_active = Column(Boolean, default=True)
    last_sync_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── RustDesk Device ──────────────────────────────────────────────────────────

class RustDeskDevice(Base):
    __tablename__ = "rustdesk_devices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    device_id = Column(String(50), unique=True, nullable=False, index=True)
    alias = Column(String(255))
    os = Column(String(50))
    hostname = Column(String(255))
    cpu = Column(String(255))
    connection_password = Column(String(255))
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime)
    registered_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    client = relationship("Client", backref="rustdesk_devices")


# ── Remote Session ───────────────────────────────────────────────────────────

class RemoteSession(Base):
    __tablename__ = "remote_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True)
    device_id = Column(Integer, ForeignKey("rustdesk_devices.id"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    technician_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    notes = Column(Text)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime)
    duration_seconds = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket", backref="remote_sessions")
    device = relationship("RustDeskDevice", backref="remote_sessions")
    technician = relationship("User", backref="remote_sessions")
    client = relationship("Client", backref="remote_sessions")


# ── Kanban Label ──────────────────────────────────────────────────────────────

class KanbanLabel(Base):
    __tablename__ = "kanban_labels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    color = Column(Enum(KanbanLabelColor), default=KanbanLabelColor.GREEN, nullable=False)
    board_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Checklist ─────────────────────────────────────────────────────────────────

class Checklist(Base):
    __tablename__ = "checklists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    title = Column(String(255), nullable=False)
    position = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("ChecklistItem", backref="checklist", order_by="ChecklistItem.position")


# ── Checklist Item ────────────────────────────────────────────────────────────

class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    checklist_id = Column(Integer, ForeignKey("checklists.id"), nullable=False)
    title = Column(String(500), nullable=False)
    is_completed = Column(Boolean, default=False)
    position = Column(Float, default=0.0)
    completed_at = Column(DateTime, nullable=True)
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Attachment ────────────────────────────────────────────────────────────────

class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, default=0)
    mime_type = Column(String(100))
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Activity Log ──────────────────────────────────────────────────────────────

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    action_type = Column(Enum(ActivityActionType), nullable=False, index=True)
    action_detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="activity_logs")


# ── Call Log ──────────────────────────────────────────────────────────────────

class CallChannel(str, enum.Enum):
    CALL = "CALL"
    SMS = "SMS"
    EMAIL = "EMAIL"
    VOICEMAIL = "VOICEMAIL"


class CallDirection(str, enum.Enum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"


class CallStatus(str, enum.Enum):
    ANSWERED = "ANSWERED"
    MISSED = "MISSED"
    VOICEMAIL = "VOICEMAIL"
    PENDING = "PENDING"


class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    channel = Column(Enum(CallChannel), nullable=False, index=True)
    direction = Column(Enum(CallDirection), nullable=False)
    status = Column(Enum(CallStatus), nullable=False, index=True)
    caller_name = Column(String(255), nullable=True)
    caller_phone = Column(String(50), nullable=True)
    caller_email = Column(String(255), nullable=True)
    subject = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    source_lead_id = Column(Integer, ForeignKey("leads.id", name="fk_call_logs_source_lead"), nullable=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", name="fk_call_logs_ticket"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
