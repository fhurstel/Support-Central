"""Kanban / Trello-like API routes: labels, checklists, attachments, activity, board."""
import json
import mimetypes
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    Ticket, TicketStatus, TicketPriority, User,
    KanbanLabel, KanbanLabelColor,
    Checklist, ChecklistItem,
    Attachment, ActivityLog, ActivityActionType,
)
from app.schemas import (
    LabelCreate, LabelUpdate, LabelResponse,
    ChecklistCreate, ChecklistUpdate, ChecklistResponse, ChecklistItemResponse,
    ChecklistItemCreate, ChecklistItemUpdate,
    AttachmentResponse,
    ActivityResponse,
    BoardData, BoardColumn, BoardStats, BoardReorderRequest, TicketReorderItem,
    TicketMoveRequest, TicketCopyRequest, MemberAddRequest, LabelAttachRequest,
    ChecklistItemToggleRequest,
)
from app.auth import get_current_user, require_any_auth

router = APIRouter(tags=["kanban"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./data/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Allowed MIME types for uploads
ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/csv",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ── Labels ─────────────────────────────────────────────────────────────────────

@router.get("/labels", response_model=list[LabelResponse])
async def list_labels(user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KanbanLabel).order_by(KanbanLabel.name))
    labels = result.scalars().all()
    return [
        {
            "id": l.id,
            "name": l.name,
            "color": l.color.value if hasattr(l.color, "value") else str(l.color),
            "created_at": l.created_at,
        }
        for l in labels
    ]


@router.post("/labels", response_model=LabelResponse, status_code=201)
async def create_label(body: LabelCreate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    color_val = body.color.lower()
    try:
        color_enum = KanbanLabelColor(color_val)
    except ValueError:
        valid = [c.value for c in KanbanLabelColor]
        raise HTTPException(status_code=400, detail=f"Invalid color. Must be one of: {', '.join(valid)}")
    label = KanbanLabel(name=body.name, color=color_enum)
    db.add(label)
    await db.flush()
    await db.refresh(label)
    return {
        "id": label.id,
        "name": label.name,
        "color": label.color.value if hasattr(label.color, "value") else str(label.color),
        "created_at": label.created_at,
    }


@router.put("/labels/{label_id}", response_model=LabelResponse)
async def update_label(label_id: int, body: LabelUpdate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KanbanLabel).where(KanbanLabel.id == label_id))
    label = result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    if body.name is not None:
        label.name = body.name
    if body.color is not None:
        color_val = body.color.lower()
        try:
            label.color = KanbanLabelColor(color_val)
        except ValueError:
            valid = [c.value for c in KanbanLabelColor]
            raise HTTPException(status_code=400, detail=f"Invalid color. Must be one of: {', '.join(valid)}")
    await db.flush()
    return {
        "id": label.id,
        "name": label.name,
        "color": label.color.value if hasattr(label.color, "value") else str(label.color),
        "created_at": label.created_at,
    }


@router.delete("/labels/{label_id}", status_code=204)
async def delete_label(label_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KanbanLabel).where(KanbanLabel.id == label_id))
    label = result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    await db.delete(label)
    await db.flush()
    return None


# ── Checklists ─────────────────────────────────────────────────────────────────

@router.get("/tickets/{ticket_id}/checklists", response_model=list[ChecklistResponse])
async def list_checklists(ticket_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    if not ticket_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Ticket not found")
    result = await db.execute(
        select(Checklist)
        .options(selectinload(Checklist.items))
        .where(Checklist.ticket_id == ticket_id)
        .order_by(Checklist.position)
    )
    checklists = result.scalars().all()
    # Eagerly load items into dicts before session closes
    response = []
    for c in checklists:
        items_data = [
            {
                "id": i.id,
                "checklist_id": i.checklist_id,
                "title": i.title,
                "is_completed": i.is_completed,
                "position": i.position,
                "completed_at": i.completed_at,
                "completed_by": i.completed_by,
                "created_at": i.created_at,
            }
            for i in (c.items or [])
        ]
        response.append({
            "id": c.id,
            "ticket_id": c.ticket_id,
            "title": c.title,
            "position": c.position,
            "items": items_data,
            "created_at": c.created_at,
        })
    return response


@router.post("/tickets/{ticket_id}/checklists", response_model=ChecklistResponse, status_code=201)
async def create_checklist(ticket_id: int, body: ChecklistCreate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    if not ticket_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Ticket not found")
    # Compute next position
    pos_result = await db.execute(
        select(func.max(Checklist.position)).where(Checklist.ticket_id == ticket_id)
    )
    max_pos = pos_result.scalar() or 0
    checklist = Checklist(ticket_id=ticket_id, title=body.title, position=max_pos + 1)
    db.add(checklist)
    await db.flush()
    await db.refresh(checklist)
    return _checklist_to_response(checklist)


@router.put("/checklists/{checklist_id}", response_model=ChecklistResponse)
async def update_checklist(checklist_id: int, body: ChecklistUpdate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Checklist)
        .options(selectinload(Checklist.items))
        .where(Checklist.id == checklist_id)
    )
    checklist = result.scalar_one_or_none()
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    if body.title is not None:
        checklist.title = body.title
    await db.flush()
    return _checklist_to_response(checklist)


@router.delete("/checklists/{checklist_id}", status_code=204)
async def delete_checklist(checklist_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Checklist).where(Checklist.id == checklist_id))
    checklist = result.scalar_one_or_none()
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    await db.delete(checklist)
    await db.flush()
    return None


# ── Checklist Items ────────────────────────────────────────────────────────────

@router.post("/checklists/{checklist_id}/items", response_model=ChecklistItemResponse, status_code=201)
async def add_checklist_item(checklist_id: int, body: ChecklistItemCreate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    cl_result = await db.execute(select(Checklist).where(Checklist.id == checklist_id))
    if not cl_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Checklist not found")
    pos_result = await db.execute(
        select(func.max(ChecklistItem.position)).where(ChecklistItem.checklist_id == checklist_id)
    )
    max_pos = pos_result.scalar() or 0
    item = ChecklistItem(checklist_id=checklist_id, title=body.title, position=max_pos + 1)
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return _checklist_item_to_response(item)


@router.put("/checklist-items/{item_id}", response_model=ChecklistItemResponse)
async def update_checklist_item(item_id: int, body: ChecklistItemUpdate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    if body.title is not None:
        item.title = body.title
    if body.is_completed is not None:
        item.is_completed = body.is_completed
        item.completed_at = datetime.utcnow() if body.is_completed else None
        item.completed_by = user.id if body.is_completed else None
    await db.flush()
    return _checklist_item_to_response(item)


@router.delete("/checklist-items/{item_id}", status_code=204)
async def delete_checklist_item(item_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    await db.delete(item)
    await db.flush()
    return None


@router.post("/checklists/{checklist_id}/toggle-all")
async def toggle_all_checklist_items(checklist_id: int, body: ChecklistItemToggleRequest, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    cl_result = await db.execute(select(Checklist).where(Checklist.id == checklist_id))
    if not cl_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Checklist not found")
    items_result = await db.execute(select(ChecklistItem).where(ChecklistItem.checklist_id == checklist_id))
    items = items_result.scalars().all()
    now = datetime.utcnow()
    for item in items:
        item.is_completed = body.is_completed
        item.completed_at = now if body.is_completed else None
        item.completed_by = user.id if body.is_completed else None
    await db.flush()
    return {"updated": len(items), "is_completed": body.is_completed}


# ── Attachments ────────────────────────────────────────────────────────────────

@router.get("/tickets/{ticket_id}/attachments", response_model=list[AttachmentResponse])
async def list_attachments(ticket_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    if not ticket_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Ticket not found")
    result = await db.execute(
        select(Attachment)
        .where(Attachment.ticket_id == ticket_id)
        .order_by(Attachment.created_at.desc())
    )
    attachments = result.scalars().all()
    return [_attachment_to_response(a) for a in attachments]


@router.post("/tickets/{ticket_id}/attachments", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    if not ticket_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Read file content
    content = await file.file.read()

    # Max file size check (10 MB)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB.")

    # Determine MIME type via python-magic first, then fallback to mimetypes
    mime_type = file.content_type or "application/octet-stream"
    try:
        import magic
        mime_type = magic.from_buffer(content, mime=True) or mime_type
    except ImportError:
        pass

    # Validate MIME type against allow-list
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"File type '{mime_type}' is not allowed. Only images, PDFs, and office documents are permitted.",
        )

    # Generate UUID-based filename (never trust user-provided filename)
    original_ext = os.path.splitext(file.filename or "")[1].lower() if file.filename else ""
    safe_name = f"{uuid.uuid4().hex}{original_ext}"
    file_path = os.path.normpath(os.path.join(UPLOAD_DIR, safe_name))

    # Path traversal check — ensure saved path is within UPLOAD_DIR
    upload_dir_real = os.path.realpath(UPLOAD_DIR)
    file_path_real = os.path.realpath(file_path)
    if not file_path_real.startswith(upload_dir_real + os.sep) and file_path_real != upload_dir_real:
        raise HTTPException(status_code=400, detail="Invalid file path")

    with open(file_path, "wb") as f:
        f.write(content)

    attachment = Attachment(
        ticket_id=ticket_id,
        filename=safe_name,
        original_filename=file.filename or safe_name,
        file_path=file_path,
        file_size=len(content),
        mime_type=mime_type,
        uploaded_by=user.id,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)

    # Log activity
    activity = ActivityLog(
        ticket_id=ticket_id,
        user_id=user.id,
        action_type=ActivityActionType.ADDED_ATTACHMENT,
        action_detail=f"Uploaded: {file.filename}",
    )
    db.add(activity)
    await db.flush()

    return _attachment_to_response(attachment)


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(attachment_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    # Remove file from disk
    try:
        if os.path.exists(attachment.file_path):
            os.remove(attachment.file_path)
    except OSError:
        pass
    await db.delete(attachment)
    await db.flush()
    return None


# ── Activity ───────────────────────────────────────────────────────────────────

@router.get("/tickets/{ticket_id}/activity", response_model=list[ActivityResponse])
async def list_activity(
    ticket_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    if not ticket_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Ticket not found")
    result = await db.execute(
        select(ActivityLog)
        .options(selectinload(ActivityLog.user))
        .where(ActivityLog.ticket_id == ticket_id)
        .order_by(ActivityLog.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    activities = result.scalars().all()
    return [_activity_to_response(a) for a in activities]


# ── Board ──────────────────────────────────────────────────────────────────────

@router.get("/board", response_model=BoardData)
async def get_board(user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    # Get all non-archived tickets with relationships
    tickets_result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.is_archived == False)
        .order_by(Ticket.position)
    )
    tickets = tickets_result.scalars().all()

    # Group by status
    status_columns: dict[str, list] = {}
    for status in TicketStatus:
        if status.value != "ARCHIVED":
            status_columns[status.value] = []
    for t in tickets:
        status_val = t.status.value if hasattr(t.status, "value") else str(t.status)
        if status_val in status_columns:
            status_columns[status_val].append(_ticket_to_mini_response(t))

    column_titles = {
        "NEW": "New",
        "NOT_STARTED": "Not Started",
        "IN_PROGRESS": "In Progress",
        "WAITING_CUSTOMER": "Waiting for Customer",
        "WAITING_VENDOR": "Waiting for Vendor",
        "DONE": "Done",
        "COMPLETED": "Completed",
        "CLOSED": "Closed",
    }
    columns = [BoardColumn(id=k, title=column_titles.get(k, k), tickets=v) for k, v in status_columns.items()]

    # Labels
    labels_result = await db.execute(select(KanbanLabel).order_by(KanbanLabel.name))
    labels = labels_result.scalars().all()
    label_responses = [
        {
            "id": l.id,
            "name": l.name,
            "color": l.color.value if hasattr(l.color, "value") else str(l.color),
            "created_at": l.created_at,
        }
        for l in labels
    ]

    # Members (active users)
    members_result = await db.execute(
        select(User).where(User.is_active == True).order_by(User.name)
    )
    members = members_result.scalars().all()
    member_responses = [
        {
            "id": m.id,
            "name": m.name,
            "email": m.email,
            "role": m.role.value if hasattr(m.role, "value") else str(m.role),
            "is_active": m.is_active,
            "created_at": m.created_at,
        }
        for m in members
    ]

    return BoardData(columns=columns, labels=label_responses, members=member_responses)


@router.post("/board/reorder")
async def reorder_board(body: BoardReorderRequest, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    for item in body.items:
        ticket_result = await db.execute(select(Ticket).where(Ticket.id == item.ticket_id))
        ticket = ticket_result.scalar_one_or_none()
        if ticket:
            ticket.status = TicketStatus(item.status)
            ticket.position = item.position
            ticket.updated_at = datetime.utcnow()
    await db.flush()
    return {"updated": len(body.items)}


@router.get("/board/stats", response_model=BoardStats)
async def board_stats(user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    # Total tickets (non-archived)
    total_result = await db.execute(
        select(func.count(Ticket.id)).where(Ticket.is_archived == False)
    )
    total = total_result.scalar() or 0

    # By status
    by_status: dict[str, int] = {}
    for status in TicketStatus:
        if status.value == "ARCHIVED":
            continue
        count_result = await db.execute(
            select(func.count(Ticket.id)).where(
                Ticket.is_archived == False,
                Ticket.status == status,
            )
        )
        cnt = count_result.scalar() or 0
        if cnt > 0:
            by_status[status.value] = cnt

    # By priority
    by_priority: dict[str, int] = {}
    for priority in TicketPriority:
        count_result = await db.execute(
            select(func.count(Ticket.id)).where(
                Ticket.is_archived == False,
                Ticket.priority == priority,
            )
        )
        cnt = count_result.scalar() or 0
        if cnt > 0:
            by_priority[priority.value] = cnt

    # Overdue: due_date in the past and not completed/closed
    overdue_result = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.is_archived == False,
            Ticket.due_date < datetime.utcnow(),
            Ticket.status.notin_([TicketStatus.COMPLETED, TicketStatus.CLOSED, TicketStatus.DONE]),
        )
    )
    overdue = overdue_result.scalar() or 0

    # Completed this week
    week_ago = datetime.utcnow() - timedelta(days=7)
    completed_result = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.is_archived == False,
            Ticket.status.in_([TicketStatus.COMPLETED, TicketStatus.CLOSED, TicketStatus.DONE]),
            Ticket.completed_at >= week_ago,
        )
    )
    completed_week = completed_result.scalar() or 0

    return BoardStats(
        total_tickets=total,
        by_status=by_status,
        by_priority=by_priority,
        overdue_count=overdue,
        completed_this_week=completed_week,
    )


# ── Helper functions ───────────────────────────────────────────────────────────

def _checklist_to_response(c: Checklist) -> dict:
    # Access items carefully — they may not be loaded
    items = []
    try:
        items = [_checklist_item_to_response(i) for i in (c.items or [])]
    except Exception:
        pass  # items not loaded, return empty
    return {
        "id": c.id,
        "ticket_id": c.ticket_id,
        "title": c.title,
        "position": c.position,
        "items": items,
        "created_at": c.created_at,
    }


def _checklist_item_to_response(item: ChecklistItem) -> dict:
    return {
        "id": item.id,
        "checklist_id": item.checklist_id,
        "title": item.title,
        "is_completed": item.is_completed,
        "position": item.position,
        "completed_at": item.completed_at,
        "completed_by": item.completed_by,
        "created_at": item.created_at,
    }


def _attachment_to_response(a: Attachment) -> dict:
    return {
        "id": a.id,
        "ticket_id": a.ticket_id,
        "filename": a.filename,
        "file_path": a.file_path,
        "file_size": a.file_size,
        "mime_type": a.mime_type,
        "uploaded_by": a.uploaded_by,
        "created_at": a.created_at,
    }


def _activity_to_response(a: ActivityLog) -> dict:
    return {
        "id": a.id,
        "ticket_id": a.ticket_id,
        "user_id": a.user_id,
        "action_type": a.action_type.value if hasattr(a.action_type, "value") else str(a.action_type),
        "action_detail": a.action_detail,
        "created_at": a.created_at,
        "user_name": a.user.name if a.user else None,
    }


def _ticket_to_mini_response(t: Ticket) -> dict:
    total_seconds = 0
    for entry in (t.time_entries or []):
        if entry.duration_seconds:
            total_seconds += entry.duration_seconds
        elif entry.is_running and entry.started_at:
            delta = datetime.utcnow() - entry.started_at
            total_seconds += int(delta.total_seconds())
    total_hours = round(total_seconds / 3600.0, 2)

    return {
        "id": t.id,
        "ticket_number": t.ticket_number,
        "title": t.title,
        "description": t.description,
        "status": t.status.value if hasattr(t.status, "value") else str(t.status),
        "priority": t.priority.value if hasattr(t.priority, "value") else str(t.priority),
        "client_id": t.client_id,
        "assigned_to": t.assigned_to,
        "total_time_hours": total_hours,
        "total_time": f"{total_hours}h",
        "client_name": t.client.name if t.client else None,
        "assigned_to_name": t.assigned_to_user.name if t.assigned_to_user else None,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "closed_at": t.closed_at,
    }
