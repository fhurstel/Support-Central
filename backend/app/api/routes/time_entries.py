"""Time entry API routes — mounted under /api/tickets/{ticket_id}/time for frontend compat."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import TimeEntry, Ticket, User, TicketStatus
from app.schemas import TimeEntryResponse, TimeEntryUpdate, TimeEntryManual
from app.auth import get_current_user, require_any_auth

router = APIRouter()


async def _get_default_user(db: AsyncSession) -> int:
    """Get the first active user's ID as a fallback."""
    result = await db.execute(select(User).where(User.is_active == True).order_by(User.id).limit(1))
    user = result.scalar_one_or_none()
    if user:
        return user.id
    return 1


@router.get("/{ticket_id}/time", response_model=list[TimeEntryResponse])
async def get_ticket_time(ticket_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    query = (
        select(TimeEntry)
        .options(selectinload(TimeEntry.user))
        .where(TimeEntry.ticket_id == ticket_id)
        .order_by(TimeEntry.started_at.desc())
    )
    result = await db.execute(query)
    entries = result.scalars().all()
    return [
        {
            "id": e.id,
            "ticket_id": e.ticket_id,
            "user_id": e.user_id,
            "started_at": e.started_at,
            "ended_at": e.ended_at,
            "duration_seconds": e.duration_seconds,
            "description": e.description,
            "note": e.note,
            "is_running": e.is_running,
            "user": {"id": e.user.id, "name": e.user.name, "email": e.user.email, "role": e.user.role, "is_active": e.user.is_active, "created_at": e.user.created_at} if e.user else None,
        }
        for e in entries
    ]


@router.post("/{ticket_id}/time/start", response_model=TimeEntryResponse)
async def start_timer(ticket_id: int, user_id: int = None, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    if user_id is None:
        user_id = user.id

    # Check for existing running timer
    existing = await db.execute(
        select(TimeEntry).where(
            TimeEntry.user_id == user_id,
            TimeEntry.ticket_id == ticket_id,
            TimeEntry.is_running == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Timer already running")

    entry = TimeEntry(
        ticket_id=ticket_id,
        user_id=user_id,
        started_at=datetime.utcnow(),
        is_running=True,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    # Auto-set ticket to in_progress
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = ticket_result.scalar_one_or_none()
    if ticket and ticket.status.value == "NEW":
        ticket.status = TicketStatus.IN_PROGRESS
        await db.flush()

    return {
        "id": entry.id,
        "ticket_id": entry.ticket_id,
        "user_id": entry.user_id,
        "started_at": entry.started_at,
        "ended_at": None,
        "duration_seconds": None,
        "description": entry.description,
        "note": entry.note,
        "is_running": True,
        "user": None,
    }


@router.post("/{ticket_id}/time/stop", response_model=TimeEntryResponse)
async def stop_timer(ticket_id: int, user_id: int = None, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    if user_id is None:
        user_id = user.id

    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.user_id == user_id,
            TimeEntry.ticket_id == ticket_id,
            TimeEntry.is_running == True,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="No running timer found")

    entry.ended_at = datetime.utcnow()
    entry.duration_seconds = int((entry.ended_at - entry.started_at).total_seconds())
    entry.is_running = False
    await db.flush()

    return {
        "id": entry.id,
        "ticket_id": entry.ticket_id,
        "user_id": entry.user_id,
        "started_at": entry.started_at,
        "ended_at": entry.ended_at,
        "duration_seconds": entry.duration_seconds,
        "description": entry.description,
        "note": entry.note,
        "is_running": False,
        "user": None,
    }


@router.patch("/{ticket_id}/time/{entry_id}", response_model=TimeEntryResponse)
async def update_time_entry(
    ticket_id: int,
    entry_id: int,
    data: TimeEntryUpdate,
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TimeEntry).options(selectinload(TimeEntry.user)).where(
            TimeEntry.id == entry_id,
            TimeEntry.ticket_id == ticket_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(entry, field, value)

    # If both start and end are set but duration is missing, compute it
    if entry.started_at and entry.ended_at and entry.duration_seconds is None:
        entry.duration_seconds = int((entry.ended_at - entry.started_at).total_seconds())

    await db.flush()
    await db.refresh(entry)

    return {
        "id": entry.id,
        "ticket_id": entry.ticket_id,
        "user_id": entry.user_id,
        "started_at": entry.started_at,
        "ended_at": entry.ended_at,
        "duration_seconds": entry.duration_seconds,
        "description": entry.description,
        "note": entry.note,
        "is_running": entry.is_running,
        "user": {"id": entry.user.id, "name": entry.user.name, "email": entry.user.email, "role": entry.user.role, "is_active": entry.user.is_active, "created_at": entry.user.created_at} if entry.user else None,
    }


@router.delete("/{ticket_id}/time/{entry_id}")
async def delete_time_entry(
    ticket_id: int,
    entry_id: int,
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.id == entry_id,
            TimeEntry.ticket_id == ticket_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")

    await db.delete(entry)
    await db.flush()
    return {"message": "Time entry deleted"}


@router.post("/{ticket_id}/time/manual", response_model=TimeEntryResponse)
async def add_manual_time_entry(
    ticket_id: int,
    data: TimeEntryManual,
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    if data.user_id is None:
        data.user_id = user.id

    # Validate ticket exists
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    if not ticket_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Ticket not found")

    duration = int((data.ended_at - data.started_at).total_seconds())
    if duration < 0:
        raise HTTPException(status_code=400, detail="ended_at must be after started_at")

    entry = TimeEntry(
        ticket_id=ticket_id,
        user_id=data.user_id,
        started_at=data.started_at,
        ended_at=data.ended_at,
        duration_seconds=duration,
        description=data.description,
        note=data.note,
        is_running=False,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    # Load user for response
    result = await db.execute(
        select(TimeEntry).options(selectinload(TimeEntry.user)).where(TimeEntry.id == entry.id)
    )
    entry = result.scalar_one()

    return {
        "id": entry.id,
        "ticket_id": entry.ticket_id,
        "user_id": entry.user_id,
        "started_at": entry.started_at,
        "ended_at": entry.ended_at,
        "duration_seconds": entry.duration_seconds,
        "description": entry.description,
        "note": entry.note,
        "is_running": entry.is_running,
        "user": {"id": entry.user.id, "name": entry.user.name, "email": entry.user.email, "role": entry.user.role, "is_active": entry.user.is_active, "created_at": entry.user.created_at} if entry.user else None,
    }
