"""Ticket management routes."""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import (
    Ticket, TicketStatus, TicketPriority, Client, User, TimeEntry, Comment,
    KanbanLabel, Checklist, ChecklistItem, Attachment, ActivityLog, ActivityActionType,
)
from app.schemas import (
    TicketCreate, TicketUpdate, TicketResponse, TicketDetailResponse,
    TicketMoveRequest, TicketCopyRequest, MemberAddRequest, LabelAttachRequest,
    ChecklistItemToggleRequest,
)
from app.auth import get_current_user, require_any_auth

router = APIRouter(prefix="/tickets", tags=["tickets"])


def ticket_to_response(ticket: Ticket, client_name: str = None, assigned_to_name: str = None,
                       assigned_to_email: str = None, assigned_to_phone: str = None,
                       labels: list = None, members: list = None,
                       checklist_total: int = 0, checklist_completed: int = 0,
                       attachment_count: int = 0, actual_hours: float = 0.0,
                       comment_count: int = 0, client_member: dict = None) -> dict:
    """Convert Ticket ORM object to response dict with full kanban fields.
    Relationship data must be pre-resolved by the caller to avoid MissingGreenlet."""
    return {
        "id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status.value if hasattr(ticket.status, 'value') else str(ticket.status),
        "priority": ticket.priority.value if hasattr(ticket.priority, 'value') else str(ticket.priority),
        "client_id": ticket.client_id,
        "assigned_to": ticket.assigned_to,
        "total_time_hours": actual_hours,
        "total_time": f"{actual_hours}h",
        "client_name": client_name,
        "assigned_to_name": assigned_to_name,
        "assigned_to_email": assigned_to_email,
        "assigned_to_phone": assigned_to_phone,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "closed_at": ticket.closed_at,
        "cover_color": ticket.cover_color,
        "cover_image_url": ticket.cover_image_url,
        "due_date": ticket.due_date,
        "start_date": ticket.start_date,
        "position": ticket.position if ticket.position is not None else 0.0,
        "is_archived": ticket.is_archived if ticket.is_archived is not None else False,
        "archived_at": ticket.archived_at,
        "completed_at": ticket.completed_at,
        "estimated_hours": ticket.estimated_hours,
        "actual_hours": actual_hours,
        "checklist_total": checklist_total,
        "checklist_completed": checklist_completed,
        "attachment_count": attachment_count,
        "label_ids_json": ticket.label_ids_json or "[]",
        "member_ids_json": ticket.member_ids_json or "[]",
        "custom_fields_json": ticket.custom_fields_json,
        "labels": labels or [],
        "members": members or [],
        "client_member_id": ticket.client_member_id,
        "client_member": client_member,
    }



async def _resolve_ticket_relationships(ticket: Ticket, db: AsyncSession = None) -> dict:
    """Pre-resolve all relationship data from a ticket while session is active.
    Returns kwargs dict suitable for passing to ticket_to_response().
    MUST be called from within an async endpoint with an active session."""
    # Access relationship attributes while session is active
    client_name = None
    assigned_to_name = None
    assigned_to_email = None
    assigned_to_phone = None
    client_member = None
    actual_hours = 0.0
    checklist_total = 0
    checklist_completed = 0
    attachment_count = 0
    labels = []
    members = []

    try:
        if ticket.client:
            client_name = ticket.client.name
    except Exception:
        pass
    try:
        if ticket.assigned_to_user:
            assigned_to_name = ticket.assigned_to_user.name
    except Exception:
        pass
    try:
        from app.models import ClientMember as CM
        if ticket.client_member_id:
            cm_result = await db.execute(select(CM).where(CM.id == ticket.client_member_id))
            cm = cm_result.scalar_one_or_none()
            if cm:
                assigned_to_name = assigned_to_name or cm.name
                client_member = {
                    "id": cm.id,
                    "client_id": cm.client_id,
                    "name": cm.name,
                    "email": cm.email,
                    "phone": cm.phone,
                    "personal_phone": cm.personal_phone,
                    "role": cm.role,
                    "is_primary": cm.is_primary,
                }
        elif ticket.client:
            cm_result = await db.execute(select(CM).where(CM.client_id == ticket.client_id, CM.is_primary == True))
            cm = cm_result.scalar_one_or_none()
            if cm:
                assigned_to_name = assigned_to_name or cm.name
                client_member = {
                    "id": cm.id,
                    "client_id": cm.client_id,
                    "name": cm.name,
                    "email": cm.email,
                    "phone": cm.phone,
                    "personal_phone": cm.personal_phone,
                    "role": cm.role,
                    "is_primary": cm.is_primary,
                }
    except Exception:
        pass
    try:
        total_seconds = 0
        for entry in (ticket.time_entries or []):
            if entry.duration_seconds:
                total_seconds += entry.duration_seconds
            elif entry.is_running and entry.started_at:
                delta = datetime.utcnow() - entry.started_at
                total_seconds += int(delta.total_seconds())
        actual_hours = round(total_seconds / 3600.0, 2)
    except Exception:
        pass
    try:
        for cl in (ticket.checklists or []):
            for item in (cl.items or []):
                checklist_total += 1
                if item.is_completed:
                    checklist_completed += 1
    except Exception:
        pass
    try:
        attachment_count = len(ticket.attachments) if ticket.attachments else 0
    except Exception:
        pass
    try:
        label_ids = json.loads(ticket.label_ids_json or "[]")
        labels = [{"id": lid, "name": None, "color": None} for lid in label_ids]
    except Exception:
        pass
    try:
        member_ids = json.loads(ticket.member_ids_json or "[]")
        members = [{"id": mid, "name": None, "email": None} for mid in member_ids]
    except Exception:
        pass

    return {
        "client_name": client_name,
        "assigned_to_name": assigned_to_name,
        "actual_hours": actual_hours,
        "checklist_total": checklist_total,
        "checklist_completed": checklist_completed,
        "attachment_count": attachment_count,
        "labels": labels,
        "members": members,
        "client_member": client_member,
    }

    # NOTE: The old return block (lines 148-184) was a duplicate that accessed
    # ticket.client.name directly — removed to prevent MissingGreenlet errors.
    # The new return block at line 29-66 above is the correct one.



async def _ticket_to_response_full(ticket: Ticket, db: AsyncSession) -> dict:
    """Resolve relationships and build response dict. Safe for async context."""
    kwargs = await _resolve_ticket_relationships(ticket, db)
    resp = ticket_to_response(ticket, **kwargs)
    # Inject email directly from client (may not be in DB columns used by ticket_to_response)
    try:
        if ticket.client and ticket.client.email:
            resp["client_email"] = ticket.client.email
    except Exception:
        pass
    return resp



async def _create_activity_log(db: AsyncSession, ticket_id: int, user_id: int,
                                action_type: ActivityActionType, action_detail: str = None):
    """Helper to create an ActivityLog entry."""
    log = ActivityLog(
        ticket_id=ticket_id,
        user_id=user_id,
        action_type=action_type,
        action_detail=action_detail,
    )
    db.add(log)


# ── Create ─────────────────────────────────────────────────────────────────────

@router.post("/")

async def create_ticket(ticket: TicketCreate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    from app.api.routes.invoices import generate_ticket_number
    # Use provided ticket_number if supplied, otherwise auto-generate
    if hasattr(ticket, 'ticket_number') and ticket.ticket_number:
        ticket_num = ticket.ticket_number
    else:
        ticket_num = await generate_ticket_number(db)

    # Build kwargs with kanban fields from request if provided
    kanban_fields = {}
    if hasattr(ticket, 'cover_color') and ticket.cover_color is not None:
        kanban_fields['cover_color'] = ticket.cover_color
    if hasattr(ticket, 'due_date') and ticket.due_date is not None:
        kanban_fields['due_date'] = ticket.due_date
    if hasattr(ticket, 'start_date') and ticket.start_date is not None:
        kanban_fields['start_date'] = ticket.start_date
    if hasattr(ticket, 'position') and ticket.position is not None:
        kanban_fields['position'] = ticket.position
    if hasattr(ticket, 'estimated_hours') and ticket.estimated_hours is not None:
        kanban_fields['estimated_hours'] = ticket.estimated_hours
    if hasattr(ticket, 'label_ids_json') and ticket.label_ids_json is not None:
        kanban_fields['label_ids_json'] = ticket.label_ids_json
    if hasattr(ticket, 'member_ids_json') and ticket.member_ids_json is not None:
        kanban_fields['member_ids_json'] = ticket.member_ids_json
    if hasattr(ticket, 'client_member_id') and ticket.client_member_id is not None:
        kanban_fields['client_member_id'] = ticket.client_member_id

    db_ticket = Ticket(
        ticket_number=ticket_num,
        title=ticket.title,
        description=ticket.description,
        client_id=ticket.client_id,
        priority=TicketPriority(ticket.priority) if ticket.priority else TicketPriority.MEDIUM,
        assigned_to=ticket.assigned_to,
        source_lead_id=ticket.source_lead_id,
        **kanban_fields,
    )
    db.add(db_ticket)
    await db.flush()

    # Activity log: created
    await _create_activity_log(db, db_ticket.id, user.id, ActivityActionType.CREATED)

    await db.flush()
    # Load relationships for response
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == db_ticket.id)
    )
    db_ticket = result.scalar_one()
    return await _ticket_to_response_full(db_ticket, db)


# ── List ───────────────────────────────────────────────────────────────────────

@router.get("/")

async def list_tickets(
    status: str = Query(None),
    priority: str = Query(None),
    assigned_to: int = Query(None),
    client_id: int = Query(None),
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .order_by(Ticket.created_at.desc())
    )
    if status:
        valid_statuses = [s.value for s in TicketStatus]
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        query = query.where(Ticket.status == status)
    if priority:
        valid_priorities = [p.value for p in TicketPriority]
        if priority not in valid_priorities:
            raise HTTPException(status_code=400, detail=f"Invalid priority. Must be one of: {', '.join(valid_priorities)}")
        query = query.where(Ticket.priority == priority)
    if assigned_to:
        query = query.where(Ticket.assigned_to == assigned_to)
    if client_id:
        query = query.where(Ticket.client_id == client_id)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    tickets = result.scalars().all()
    # Resolve relationships for each ticket
    responses = []
    for t in tickets:
        responses.append(await _ticket_to_response_full(t, db))
    return responses


# ── Detail ─────────────────────────────────────────────────────────────────────

@router.get("/{ticket_id}")

async def get_ticket(ticket_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.time_entries).selectinload(TimeEntry.user),
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.comments).selectinload(Comment.author),
            selectinload(Ticket.checklists).selectinload(Checklist.items),
            selectinload(Ticket.attachments),
            selectinload(Ticket.activity_logs).selectinload(ActivityLog.user),
        )
        .where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    resp = await _ticket_to_response_full(ticket, db)

    # Comments — access inline to avoid MissingGreenlet
    comments_data = []
    for c in ticket.comments:
        author_data = None
        try:
            if c.author:
                author_data = {"id": c.author.id, "name": c.author.name, "email": c.author.email}
        except Exception:
            pass
        comments_data.append({
            "id": c.id, "ticket_id": c.ticket_id, "author_id": c.author_id,
            "body": c.body,
            "visibility": c.visibility.value if hasattr(c.visibility, 'value') else str(c.visibility),
            "emailed_to_client": c.emailed_to_client, "created_at": c.created_at,
            "author": author_data,
        })
    resp["comments"] = comments_data

    # Time entries — access inline
    time_entries_data = []
    for e in ticket.time_entries:
        user_data = None
        try:
            if e.user:
                user_data = {"id": e.user.id, "name": e.user.name, "email": e.user.email,
                           "role": e.user.role, "is_active": e.user.is_active, "created_at": e.user.created_at}
        except Exception:
            pass
        time_entries_data.append({
            "id": e.id, "ticket_id": e.ticket_id, "user_id": e.user_id,
            "started_at": e.started_at, "ended_at": e.ended_at,
            "duration_seconds": e.duration_seconds, "description": e.description,
            "is_running": e.is_running, "user": user_data,
        })
    resp["time_entries"] = time_entries_data

    # Checklists with items — access inline to avoid MissingGreenlet
    checklists_data = []
    for cl in ticket.checklists:
        items_data = []
        for item in cl.items:
            items_data.append({
                "id": item.id, "checklist_id": item.checklist_id,
                "title": item.title, "is_completed": item.is_completed,
                "position": item.position, "completed_at": item.completed_at,
                "completed_by": item.completed_by, "created_at": item.created_at,
            })
        checklists_data.append({
            "id": cl.id, "ticket_id": cl.ticket_id, "title": cl.title,
            "position": cl.position, "created_at": cl.created_at, "items": items_data,
        })
    resp["checklists"] = checklists_data

    # Attachments
    attachments_data = []
    for a in ticket.attachments:
        attachments_data.append({
            "id": a.id, "ticket_id": a.ticket_id, "filename": a.filename,
            "file_path": a.file_path, "file_size": a.file_size,
            "mime_type": a.mime_type, "uploaded_by": a.uploaded_by, "created_at": a.created_at,
        })
    resp["attachments"] = attachments_data

    # Activity logs — access user.name inline
    activity_data = []
    for log in ticket.activity_logs:
        uname = None
        try:
            if log.user:
                uname = log.user.name
        except Exception:
            pass
        al_type = log.action_type.value if hasattr(log.action_type, 'value') else str(log.action_type)
        activity_data.append({
            "id": log.id, "ticket_id": log.ticket_id, "user_id": log.user_id,
            "action_type": al_type, "action_detail": log.action_detail,
            "created_at": log.created_at, "user_name": uname,
        })
    resp["activity_logs"] = activity_data

    return resp


# ── Update ─────────────────────────────────────────────────────────────────────

@router.patch("/{ticket_id}")

async def update_ticket(ticket_id: int, update: TicketUpdate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    update_data = update.model_dump(exclude_unset=True)
    old_status = ticket.status.value if hasattr(ticket.status, 'value') else str(ticket.status)
    old_priority = ticket.priority.value if hasattr(ticket.priority, 'value') else str(ticket.priority)
    old_assigned_to = ticket.assigned_to

    for field, value in update_data.items():
        if field == "status" and value:
            ticket.status = TicketStatus(value)
            if value in ("COMPLETED", "CLOSED"):
                ticket.completed_at = datetime.utcnow()
                ticket.closed_at = datetime.utcnow()
            # Activity log for status change
            await _create_activity_log(
                db, ticket.id, user.id, ActivityActionType.UPDATED,
                json.dumps({"field": "status", "from": old_status, "to": value}),
            )
        elif field == "priority" and value:
            ticket.priority = TicketPriority(value)
            await _create_activity_log(
                db, ticket.id, user.id, ActivityActionType.UPDATED,
                json.dumps({"field": "priority", "from": old_priority, "to": value}),
            )
        elif field == "assigned_to" and value != old_assigned_to:
            ticket.assigned_to = value
            await _create_activity_log(
                db, ticket.id, user.id, ActivityActionType.UPDATED,
                json.dumps({"field": "assigned_to", "from": old_assigned_to, "to": value}),
            )
        elif field == "is_archived" and value is not None:
            ticket.is_archived = value
            if value:
                ticket.archived_at = datetime.utcnow()
                await _create_activity_log(db, ticket.id, user.id, ActivityActionType.ARCHIVED)
            else:
                ticket.archived_at = None
                await _create_activity_log(db, ticket.id, user.id, ActivityActionType.UNARCHIVED)
        elif field == "cover_color":
            ticket.cover_color = value
        elif field == "cover_image_url":
            ticket.cover_image_url = value
        elif field == "due_date":
            ticket.due_date = value
            if value:
                await _create_activity_log(
                    db, ticket.id, user.id, ActivityActionType.SET_DUE_DATE,
                    json.dumps({"due_date": value.isoformat() if hasattr(value, 'isoformat') else str(value)}),
                )
            else:
                await _create_activity_log(db, ticket.id, user.id, ActivityActionType.REMOVED_DUE_DATE)
        elif field == "start_date":
            ticket.start_date = value
        elif field == "position":
            ticket.position = value
        elif field == "estimated_hours":
            ticket.estimated_hours = value
        elif field == "label_ids_json":
            ticket.label_ids_json = value
        elif field == "member_ids_json":
            ticket.member_ids_json = value
        elif field == "client_member_id":
            ticket.client_member_id = value
        elif field == "custom_fields_json":
            ticket.custom_fields_json = value
        else:
            setattr(ticket, field, value)

    ticket.updated_at = datetime.utcnow()
    await db.flush()
    # Reload with relationships for response
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)


# ── Close ──────────────────────────────────────────────────────────────────────

@router.post("/{ticket_id}/close")

async def close_ticket(ticket_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.status = TicketStatus.CLOSED
    ticket.closed_at = datetime.utcnow()
    ticket.completed_at = datetime.utcnow()
    ticket.updated_at = datetime.utcnow()
    await _create_activity_log(
        db, ticket.id, user.id, ActivityActionType.UPDATED,
        json.dumps({"field": "status", "action": "closed"}),
    )
    await db.flush()
    # Reload with relationships for response
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)


# ── Archive / Unarchive ────────────────────────────────────────────────────────

@router.post("/{ticket_id}/archive")

async def archive_ticket(ticket_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.is_archived = True
    ticket.archived_at = datetime.utcnow()
    ticket.updated_at = datetime.utcnow()
    await _create_activity_log(db, ticket.id, user.id, ActivityActionType.ARCHIVED)
    await db.flush()
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)


@router.post("/{ticket_id}/unarchive")

async def unarchive_ticket(ticket_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.is_archived = False
    ticket.archived_at = None
    ticket.updated_at = datetime.utcnow()
    await _create_activity_log(db, ticket.id, user.id, ActivityActionType.UNARCHIVED)
    await db.flush()
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)


# ── Move ticket ────────────────────────────────────────────────────────────────

@router.post("/{ticket_id}/move")

async def move_ticket(ticket_id: int, body: TicketMoveRequest, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    old_status = ticket.status.value if hasattr(ticket.status, 'value') else str(ticket.status)
    valid_statuses = [s.value for s in TicketStatus]
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
    ticket.status = TicketStatus(body.status)
    if body.position is not None:
        ticket.position = body.position
    ticket.updated_at = datetime.utcnow()
    await _create_activity_log(
        db, ticket.id, user.id, ActivityActionType.MOVED,
        json.dumps({"from": old_status, "to": body.status, "position": body.position}),
    )
    await db.flush()
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)


# ── Copy ticket ────────────────────────────────────────────────────────────────

@router.post("/{ticket_id}/copy")

async def copy_ticket(ticket_id: int, body: TicketCopyRequest = TicketCopyRequest(), user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    # Load source with checklists and items for copying
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.checklists).selectinload(Checklist.items),
        )
        .where(Ticket.id == ticket_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Ticket not found")
    from app.api.routes.invoices import generate_ticket_number
    ticket_num = await generate_ticket_number(db)
    new_title = body.title or f"{source.title} (Copy)"
    new_ticket = Ticket(
        ticket_number=ticket_num,
        title=new_title,
        description=source.description,
        client_id=source.client_id,
        priority=source.priority,
        assigned_to=source.assigned_to,
        status=TicketStatus.NEW,
        # Copy kanban fields
        cover_color=source.cover_color,
        cover_image_url=source.cover_image_url,
        due_date=source.due_date,
        start_date=source.start_date,
        estimated_hours=source.estimated_hours,
        label_ids_json=source.label_ids_json,
        member_ids_json=source.member_ids_json,
        custom_fields_json=source.custom_fields_json,
        # Reset these
        position=0.0,
        is_archived=False,
        archived_at=None,
        completed_at=None,
    )
    db.add(new_ticket)
    await db.flush()

    # Copy checklists with items
    if source.checklists:
        for src_cl in source.checklists:
            new_cl = Checklist(
                ticket_id=new_ticket.id,
                title=src_cl.title,
                position=src_cl.position,
            )
            db.add(new_cl)
            await db.flush()
            for src_item in src_cl.items:
                new_item = ChecklistItem(
                    checklist_id=new_cl.id,
                    title=src_item.title,
                    position=src_item.position,
                    is_completed=False,  # Reset completion
                    completed_at=None,
                    completed_by=None,
                )
                db.add(new_item)

    # Activity log
    await _create_activity_log(
        db, new_ticket.id, user.id, ActivityActionType.CREATED,
        json.dumps({"copied_from": source.id}),
    )

    await db.flush()
    await db.refresh(new_ticket)
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == new_ticket.id)
    )
    new_ticket = result.scalar_one()
    return await _ticket_to_response_full(new_ticket, db)


# ── Members ─────────────────────────────────────────────────────────────────────

@router.post("/{ticket_id}/members")

async def add_member(ticket_id: int, body: MemberAddRequest, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    # Verify user exists
    user_result = await db.execute(select(User).where(User.id == body.user_id, User.is_active == True))
    target_user = user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found or inactive")
    # Update member_ids_json
    try:
        members = json.loads(ticket.member_ids_json or "[]")
    except (json.JSONDecodeError, TypeError):
        members = []
    if body.user_id not in members:
        members.append(body.user_id)
        ticket.member_ids_json = json.dumps(members)
        ticket.updated_at = datetime.utcnow()
    await _create_activity_log(
        db, ticket.id, user.id, ActivityActionType.ADDED_MEMBER,
        json.dumps({"user_id": body.user_id}),
    )
    await db.flush()
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)


@router.delete("/{ticket_id}/members/{user_id}")

async def remove_member(ticket_id: int, user_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    try:
        members = json.loads(ticket.member_ids_json or "[]")
    except (json.JSONDecodeError, TypeError):
        members = []
    if user_id in members:
        members.remove(user_id)
        ticket.member_ids_json = json.dumps(members)
        ticket.updated_at = datetime.utcnow()
    await _create_activity_log(
        db, ticket.id, user.id, ActivityActionType.REMOVED_MEMBER,
        json.dumps({"user_id": user_id}),
    )
    await db.flush()
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)


# ── Labels ──────────────────────────────────────────────────────────────────────

@router.post("/{ticket_id}/labels")

async def add_label_to_ticket(ticket_id: int, body: LabelAttachRequest, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    # Verify label exists
    label_result = await db.execute(select(KanbanLabel).where(KanbanLabel.id == body.label_id))
    if not label_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Label not found")
    try:
        labels = json.loads(ticket.label_ids_json or "[]")
    except (json.JSONDecodeError, TypeError):
        labels = []
    if body.label_id not in labels:
        labels.append(body.label_id)
        ticket.label_ids_json = json.dumps(labels)
        ticket.updated_at = datetime.utcnow()
    await _create_activity_log(
        db, ticket.id, user.id, ActivityActionType.ADDED_LABEL,
        json.dumps({"label_id": body.label_id}),
    )
    await db.flush()
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)


@router.delete("/{ticket_id}/labels/{label_id}")

async def remove_label_from_ticket(ticket_id: int, label_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    try:
        labels = json.loads(ticket.label_ids_json or "[]")
    except (json.JSONDecodeError, TypeError):
        labels = []
    if label_id in labels:
        labels.remove(label_id)
        ticket.label_ids_json = json.dumps(labels)
        ticket.updated_at = datetime.utcnow()
    await _create_activity_log(
        db, ticket.id, user.id, ActivityActionType.REMOVED_LABEL,
        json.dumps({"label_id": label_id}),
    )
    await db.flush()
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)


# ── Checklist item toggle (via ticket) ─────────────────────────────────────────

@router.post("/{ticket_id}/checklists/{checklist_id}/items/{item_id}/toggle")

async def toggle_checklist_item(ticket_id: int, checklist_id: int, item_id: int, body: ChecklistItemToggleRequest, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    item_result = await db.execute(
        select(ChecklistItem).where(
            ChecklistItem.id == item_id,
            ChecklistItem.checklist_id == checklist_id,
        )
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    item.is_completed = body.is_completed
    item.completed_at = datetime.utcnow() if body.is_completed else None
    item.completed_by = user.id if body.is_completed else None
    ticket.updated_at = datetime.utcnow()

    # Activity log for checklist toggle
    action_type = ActivityActionType.COMPLETED_CHECKLIST if body.is_completed else ActivityActionType.UNCOMPLETED_CHECKLIST
    await _create_activity_log(
        db, ticket.id, user.id, action_type,
        json.dumps({"item_id": item_id, "completed": body.is_completed}),
    )

    await db.flush()
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.client),
            selectinload(Ticket.assigned_to_user),
            selectinload(Ticket.time_entries),
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    return await _ticket_to_response_full(ticket, db)
