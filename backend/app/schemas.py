"""Pydantic schemas for request/response validation."""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, EmailStr


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "TECHNICIAN"


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    # Plain str, not EmailStr: login is an identifier lookup against a stored
    # value, so it must not reject addresses the account was created with.
    # EmailStr (email-validator) rejects reserved TLDs like `.test`, which
    # would make the documented synthetic demo identities (CLAUDE.md rule 2,
    # e.g. admin@example.test) impossible to sign in with.
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ── Lead ──────────────────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    source: str
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    sender_phone: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    raw_content: Optional[str] = None

    class Config:
        # Coerce source to uppercase for enum compatibility
        pass

    def __init__(self, **data):
        if 'source' in data and isinstance(data['source'], str):
            data['source'] = data['source'].upper()
        super().__init__(**data)


class LeadReview(BaseModel):
    action: str  # "approve" or "deny"
    denial_reason: Optional[str] = None
    client_id: Optional[int] = None  # required if approve
    title: Optional[str] = None  # ticket title if approve
    description: Optional[str] = None
    priority: str = "MEDIUM"
    assigned_to: Optional[int] = None


class LeadResponse(BaseModel):
    id: int
    source: str
    sender_name: Optional[str]
    sender_email: Optional[str]
    sender_phone: Optional[str]
    subject: Optional[str]
    body: Optional[str]
    status: str
    denial_reason: Optional[str]
    converted_ticket_id: Optional[int]
    created_at: datetime
    reviewed_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Client ────────────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    client_type: str = "MANAGED"
    hourly_rate: float = 0.0
    contract_notes: Optional[str] = None


class ClientResponse(BaseModel):
    id: int
    name: str
    email: Optional[str]
    phone: Optional[str]
    company: Optional[str]
    client_type: str
    hourly_rate: float
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Client Member ─────────────────────────────────────────────────────────────

class ClientMemberCreate(BaseModel):
    client_id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    personal_phone: Optional[str] = None
    role: Optional[str] = None
    is_primary: Optional[bool] = False

class ClientMemberUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    personal_phone: Optional[str] = None
    role: Optional[str] = None
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None

class ClientMemberResponse(BaseModel):
    id: int
    client_id: int
    name: str
    email: Optional[str]
    phone: Optional[str]
    personal_phone: Optional[str]
    role: Optional[str]
    is_primary: bool
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Ticket ────────────────────────────────────────────────────────────────────

class TicketCreate(BaseModel):
    title: str
    description: Optional[str] = None
    client_id: int
    priority: str = "MEDIUM"
    assigned_to: Optional[int] = None
    client_member_id: Optional[int] = None
    source_lead_id: Optional[int] = None
    ticket_number: Optional[str] = None
    # Kanban fields
    cover_color: Optional[str] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    position: Optional[float] = None
    estimated_hours: Optional[float] = None
    label_ids_json: Optional[str] = None
    member_ids_json: Optional[str] = None


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[int] = None
    cover_color: Optional[str] = None
    cover_image_url: Optional[str] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    position: Optional[float] = None
    is_archived: Optional[bool] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    label_ids_json: Optional[str] = None
    member_ids_json: Optional[str] = None
    custom_fields_json: Optional[str] = None


class TicketResponse(BaseModel):
    id: int
    ticket_number: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    client_id: int
    assigned_to: Optional[int] = None
    total_time_hours: float = 0.0
    total_time: Optional[str] = None
    client_name: Optional[str] = None
    assigned_to_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None
    # Kanban fields
    cover_color: Optional[str] = None
    cover_image_url: Optional[str] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    position: float = 0.0
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    actual_hours: float = 0.0
    checklist_total: int = 0
    checklist_completed: int = 0
    attachment_count: int = 0
    label_ids_json: str = '[]'
    member_ids_json: str = '[]'
    custom_fields_json: Optional[str] = None

    class Config:
        from_attributes = True


class TicketDetailResponse(TicketResponse):
    comments: list["CommentResponse"] = []
    time_entries: list["TimeEntryResponse"] = []
    checklists: list["ChecklistResponse"] = []
    attachments: list["AttachmentResponse"] = []
    activity_logs: list["ActivityLogResponse"] = []


# ── Time Entry ────────────────────────────────────────────────────────────────

class TimeEntryStart(BaseModel):
    ticket_id: int
    user_id: int
    description: Optional[str] = None


class TimeEntryStop(BaseModel):
    description: Optional[str] = None


class TimeEntryResponse(BaseModel):
    id: int
    ticket_id: int
    user_id: int
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    description: Optional[str]
    note: Optional[str] = None
    is_running: bool
    user: Optional[UserResponse] = None

    class Config:
        from_attributes = True


class TimeEntryUpdate(BaseModel):
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    description: Optional[str] = None
    note: Optional[str] = None


class TimeEntryManual(BaseModel):
    ticket_id: Optional[int] = None
    user_id: Optional[int] = None
    started_at: datetime
    ended_at: datetime
    description: Optional[str] = None
    note: Optional[str] = None


# ── Comment ───────────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    body: str
    visibility: str = "PRIVATE"
    email_to_client: bool = False
    is_private: Optional[bool] = None
    attachments: Optional[list[dict[str, Any]]] = None

    class Config:
        # Allow both is_private and visibility
        pass

    def __init__(self, **data):
        # Convert is_private to visibility if provided
        if data.get('is_private') is not None and 'visibility' not in data:
            data['visibility'] = 'PRIVATE' if data['is_private'] else 'PUBLIC'
        elif data.get('is_private') is not None and data.get('visibility') == 'PRIVATE':
            # is_private takes precedence
            data['visibility'] = 'PRIVATE' if data['is_private'] else 'PUBLIC'
        super().__init__(**data)


class CommentResponse(BaseModel):
    id: int
    ticket_id: int
    author_id: int
    body: str
    visibility: str
    emailed_to_client: bool
    created_at: datetime
    attachments: list[dict[str, Any]] = []
    author: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# ── Knowledge Base ────────────────────────────────────────────────────────────

class KBCreate(BaseModel):
    title: str
    content: str
    tags: Optional[str] = None
    category: Optional[str] = None
    source_ticket_id: Optional[int] = None
    attachments: Optional[list[dict[str, Any]]] = None


class KBUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[str] = None
    category: Optional[str] = None
    attachments: Optional[list[dict[str, Any]]] = None


class KBResponse(BaseModel):
    id: int
    title: str
    content: str
    tags: Optional[str]
    category: Optional[str]
    is_active: bool
    attachments: list[dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Invoice ───────────────────────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    client_id: int
    ticket_id: Optional[int] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    notes: Optional[str] = None


class InvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    client_id: int
    ticket_id: Optional[int]
    total_hours: float
    hourly_rate: float
    total_amount: float
    amount: Optional[float] = None
    status: str
    created_at: datetime
    sent_at: Optional[datetime]
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    client_name: Optional[str] = None
    client: Optional[ClientResponse] = None

    class Config:
        from_attributes = True


# ── Survey ────────────────────────────────────────────────────────────────────

class SurveyResponse(BaseModel):
    ticket_id: int
    rating: str  # happy, moderate, unhappy
    comment: Optional[str] = None


# ── RustDesk ──────────────────────────────────────────────────────────────────

class RustDeskDeviceCreate(BaseModel):
    client_id: int
    device_id: str
    alias: Optional[str] = None
    os: Optional[str] = None
    hostname: Optional[str] = None
    cpu: Optional[str] = None
    connection_password: Optional[str] = None


class RustDeskDeviceResponse(BaseModel):
    id: int
    client_id: int
    device_id: str
    alias: Optional[str]
    os: Optional[str]
    hostname: Optional[str]
    cpu: Optional[str]
    connection_password: Optional[str] = None
    is_active: bool
    last_seen: Optional[datetime] = None
    created_at: datetime
    is_online: Optional[bool] = None
    client_name: Optional[str] = None

    class Config:
        from_attributes = True


class RemoteSessionCreate(BaseModel):
    device_id: int
    client_id: int
    ticket_id: Optional[int] = None
    notes: Optional[str] = None


class RemoteSessionUpdate(BaseModel):
    notes: Optional[str] = None
    ticket_id: Optional[int] = None


class RemoteSessionResponse(BaseModel):
    id: int
    uuid: str
    ticket_id: Optional[int]
    device_id: Optional[int]
    client_id: int
    technician_id: int
    notes: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    created_at: datetime
    ticket_title: Optional[str] = None
    device_alias: Optional[str] = None
    technician_name: Optional[str] = None
    client_name: Optional[str] = None

    class Config:
        from_attributes = True


# ── Kanban Label ──────────────────────────────────────────────────────────────

class KanbanLabelCreate(BaseModel):
    name: str
    color: str = "green"
    board_id: Optional[int] = None


class KanbanLabelResponse(BaseModel):
    id: int
    name: str
    color: str
    board_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Checklist ─────────────────────────────────────────────────────────────────

class ChecklistCreate(BaseModel):
    ticket_id: int
    title: str
    position: float = 0.0


class ChecklistResponse(BaseModel):
    id: int
    ticket_id: int
    title: str
    position: float
    created_at: datetime
    items: list["ChecklistItemResponse"] = []

    class Config:
        from_attributes = True


# ── Checklist Item ────────────────────────────────────────────────────────────

class ChecklistItemCreate(BaseModel):
    checklist_id: int
    title: str
    position: float = 0.0


class ChecklistItemUpdate(BaseModel):
    title: Optional[str] = None
    is_completed: Optional[bool] = None
    position: Optional[float] = None


class ChecklistItemResponse(BaseModel):
    id: int
    checklist_id: int
    title: str
    is_completed: bool
    position: float
    completed_at: Optional[datetime]
    completed_by: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Attachment ────────────────────────────────────────────────────────────────

class AttachmentResponse(BaseModel):
    id: int
    ticket_id: int
    filename: str
    file_path: str
    file_size: int
    mime_type: Optional[str]
    uploaded_by: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Activity Log ──────────────────────────────────────────────────────────────

class ActivityLogResponse(BaseModel):
    id: int
    ticket_id: int
    user_id: int
    action_type: str
    action_detail: Optional[str]
    created_at: datetime
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


# ── Kanban Request Schemas ────────────────────────────────────────────────────

class TicketMoveRequest(BaseModel):
    status: Optional[str] = None
    position: Optional[float] = None


class TicketCopyRequest(BaseModel):
    title: Optional[str] = None


class MemberAddRequest(BaseModel):
    user_id: int


class LabelAttachRequest(BaseModel):
    label_id: int


class ChecklistItemToggleRequest(BaseModel):
    is_completed: bool


# ── Additional Kanban Schemas (required by kanban.py) ─────────────────────────

from pydantic import BaseModel as _BM

class LabelCreate(_BM):
    name: str
    color: str = "green"

class LabelUpdate(_BM):
    name: Optional[str] = None
    color: Optional[str] = None

class LabelResponse(_BM):
    id: int
    name: str
    color: str
    board_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChecklistCreate(_BM):
    ticket_id: int
    title: str
    position: Optional[float] = 0.0

class ChecklistUpdate(_BM):
    title: Optional[str] = None
    position: Optional[float] = None

class ChecklistResponse(_BM):
    id: int
    ticket_id: int
    title: str
    position: float
    created_at: datetime
    items: list = []

    class Config:
        from_attributes = True

class ChecklistItemCreate(_BM):
    checklist_id: int
    title: str
    position: Optional[float] = 0.0

class ChecklistItemUpdate(_BM):
    title: Optional[str] = None
    is_completed: Optional[bool] = None
    position: Optional[float] = None

class ChecklistItemResponse(_BM):
    id: int
    checklist_id: int
    title: str
    is_completed: bool
    position: float
    completed_at: Optional[datetime] = None
    completed_by: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AttachmentCreate(_BM):
    ticket_id: int
    filename: str

class AttachmentUpdate(_BM):
    filename: Optional[str] = None

class AttachmentResponse(_BM):
    id: int
    ticket_id: int
    filename: str
    file_path: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    uploaded_by: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityResponse(_BM):
    id: int
    ticket_id: int
    user_id: int
    action_type: str
    action_detail: Optional[str] = None
    created_at: datetime
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


class BoardData(_BM):
    columns: list = []
    labels: list = []
    members: list = []

class BoardColumn(_BM):
    id: str
    title: str
    tickets: list = []

class BoardStats(_BM):
    total_tickets: int = 0
    by_status: dict = {}
    by_priority: dict = {}
    overdue_count: int = 0
    completed_this_week: int = 0

class TicketReorderItem(_BM):
    ticket_id: int
    status: str
    position: float

class BoardReorderRequest(_BM):
    items: list[TicketReorderItem] = []


# ── Call Log ──────────────────────────────────────────────────────────────────

class CallLogCreate(BaseModel):
    channel: str
    direction: str
    status: Optional[str] = None
    caller_name: Optional[str] = None
    caller_phone: Optional[str] = None
    caller_email: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    duration_seconds: Optional[int] = None
    source_lead_id: Optional[int] = None
    ticket_id: Optional[int] = None


class CallLogResponse(BaseModel):
    id: int
    channel: str
    direction: str
    status: Optional[str] = None
    caller_name: Optional[str] = None
    caller_phone: Optional[str] = None
    caller_email: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    duration_seconds: Optional[int] = None
    source_lead_id: Optional[int] = None
    ticket_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True
