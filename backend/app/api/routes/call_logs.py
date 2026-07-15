"""Call Log API routes."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import User, CallLog, CallChannel, CallDirection, CallStatus, Lead
from app.schemas import CallLogCreate, CallLogResponse
from app.auth import get_current_user, require_any_auth, require_voice_agent

router = APIRouter(prefix="/call-logs", tags=["call-logs"])


async def _get_user_or_voice_agent(
    request: Request,
    user_jwt: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Try JWT auth first; if that fails, try voice agent token."""
    return user_jwt


async def _auth_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Accept either JWT Bearer or X-Voice-Agent-Token."""
    from app.main import VOICE_AGENT_TOKENS
    voice_token = request.headers.get("X-Voice-Agent-Token")
    if voice_token and voice_token in VOICE_AGENT_TOKENS:
        return await require_voice_agent(request, db)
    # Try JWT
    from app.auth import security as _bearer, get_current_user, require_any_auth
    try:
        creds = await _bearer(request)
        user = await get_current_user(creds, db)
        # Check role access
        require_any_auth  # noqa: just ensure role passes
        return user
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Provide either Authorization: Bearer <token> or X-Voice-Agent-Token header",
        )


@router.post("/", response_model=CallLogResponse)
async def create_call_log(
    log: CallLogCreate,
    user: User = Depends(_auth_user),
    db: AsyncSession = Depends(get_db),
):
    data = log.model_dump()
    # Validate and convert enums
    data["channel"] = CallChannel(data["channel"])
    data["direction"] = CallDirection(data["direction"])
    if data.get("status"):
        data["status"] = CallStatus(data["status"])
    else:
        data["status"] = CallStatus.PENDING

    db_log = CallLog(**data)
    db.add(db_log)
    await db.flush()
    await db.refresh(db_log)
    return db_log


@router.get("/", response_model=list[CallLogResponse])
async def list_call_logs(
    user: User = Depends(require_any_auth),
    channel: str = Query(None),
    status: str = Query(None),
    direction: str = Query(None),
    date_from: datetime = Query(None),
    date_to: datetime = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = select(CallLog).order_by(CallLog.created_at.desc())
    if channel:
        query = query.where(CallLog.channel == channel)
    if status:
        query = query.where(CallLog.status == status)
    if direction:
        query = query.where(CallLog.direction == direction)
    if date_from:
        query = query.where(CallLog.created_at >= date_from)
    if date_to:
        query = query.where(CallLog.created_at <= date_to)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats")
async def get_call_log_stats(
    user: User = Depends(require_any_auth),
    date_from: datetime = Query(None),
    date_to: datetime = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """KPI stats: total by channel, answer rate, avg duration, leads_created_count."""
    # Base filter for date range
    filters = []
    if date_from:
        filters.append(CallLog.created_at >= date_from)
    if date_to:
        filters.append(CallLog.created_at <= date_to)

    # Total by channel
    channel_query = select(CallLog.channel, func.count(CallLog.id)).group_by(CallLog.channel)
    if filters:
        channel_query = channel_query.where(and_(*filters))
    channel_result = await db.execute(channel_query)
    by_channel = {str(ch): count for ch, count in channel_result.all()}

    # Total calls (for answer rate)
    total_query = select(func.count(CallLog.id))
    if filters:
        total_query = total_query.where(and_(*filters))
    total_result = await db.execute(total_query)
    total_calls = total_result.scalar() or 0

    # Answered count
    answered_query = select(func.count(CallLog.id)).where(CallLog.status == CallStatus.ANSWERED)
    if filters:
        answered_query = answered_query.where(and_(*filters))
    answered_result = await db.execute(answered_query)
    answered_count = answered_result.scalar() or 0

    # Answer rate
    answer_rate = (answered_count / total_calls * 100) if total_calls > 0 else 0.0

    # Average duration (only for answered calls with duration)
    avg_dur_query = select(func.avg(CallLog.duration_seconds)).where(
        CallLog.duration_seconds.isnot(None)
    )
    if filters:
        avg_dur_query = avg_dur_query.where(and_(*filters))
    avg_dur_result = await db.execute(avg_dur_query)
    avg_duration = avg_dur_result.scalar() or 0.0

    # Leads created count (leads that have a call_log reference)
    leads_query = select(func.count(Lead.id)).where(Lead.source.isnot(None))
    if filters:
        # Join with call_logs to filter by date
        leads_query = leads_query.join(CallLog, CallLog.source_lead_id == Lead.id).where(
            and_(*filters)
        )
    leads_result = await db.execute(leads_query)
    leads_created_count = leads_result.scalar() or 0

    return {
        "by_channel": by_channel,
        "total_calls": total_calls,
        "answered_count": answered_count,
        "answer_rate": round(answer_rate, 2),
        "avg_duration_seconds": round(avg_duration, 2) if avg_duration else 0.0,
        "leads_created_count": leads_created_count,
    }
