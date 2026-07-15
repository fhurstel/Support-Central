"""Lead API routes."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import User, Lead, LeadStatus, Ticket, TicketStatus, TicketPriority, ActivityLog, ActivityActionType
from app.schemas import LeadCreate, LeadReview, LeadResponse
from app.api.routes.invoices import generate_ticket_number
from app.auth import get_current_user, require_any_auth, require_voice_agent

router = APIRouter(prefix="/leads", tags=["leads"])


_bearer = HTTPBearer()


async def _optional_voice_or_jwt_auth(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Accept either X-Voice-Agent-Token or JWT Bearer token."""
    from app.main import VOICE_AGENT_TOKENS
    voice_token = request.headers.get("X-Voice-Agent-Token")
    import logging
    _log = logging.getLogger("fiji-it.auth")
    _log.info(f"Voice token present: {bool(voice_token)}, token prefix: {voice_token[:8] if voice_token else 'none'}...")
    _log.info(f"VOICE_AGENT_TOKENS count: {len(VOICE_AGENT_TOKENS)}, prefixes: {[t[:8]+'...' for t in VOICE_AGENT_TOKENS]}")
    if voice_token and voice_token in VOICE_AGENT_TOKENS:
        _log.info("Voice agent auth accepted")
        return await require_voice_agent(request, db)
    # JWT path
    _log.info("Falling back to JWT auth")
    creds = await _bearer(request)
    from app.auth import get_current_user
    return await get_current_user(creds, db)


@router.post("/", response_model=LeadResponse)
async def create_lead(
    lead: LeadCreate,
    user: User = Depends(_optional_voice_or_jwt_auth),
    db: AsyncSession = Depends(get_db),
):
    db_lead = Lead(
        source=lead.source,
        sender_name=lead.sender_name,
        sender_email=lead.sender_email,
        sender_phone=lead.sender_phone,
        subject=lead.subject,
        body=lead.body,
        raw_content=lead.raw_content,
        status=LeadStatus.NEW,
    )
    db.add(db_lead)
    await db.flush()
    await db.refresh(db_lead)
    return db_lead


@router.get("/", response_model=list[LeadResponse])
async def list_leads(
    user: User = Depends(require_any_auth),
    status: str = Query(None),
    source: str = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    query = select(Lead).order_by(Lead.created_at.desc())
    if status:
        query = query.where(Lead.status == status)
    if source:
        query = query.where(Lead.source == source)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.post("/{lead_id}/review", response_model=LeadResponse)
async def review_lead(lead_id: int, review: LeadReview, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    """Approve or deny a lead. If approved and client_id provided, creates a ticket."""
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.status not in (LeadStatus.NEW, LeadStatus.REVIEWING):
        raise HTTPException(status_code=400, detail=f"Lead already {lead.status}")

    if review.action == "deny":
        lead.status = LeadStatus.DENIED
        lead.denial_reason = review.denial_reason
        lead.reviewed_at = datetime.utcnow()
    elif review.action == "approve":
        if not review.client_id:
            raise HTTPException(status_code=400, detail="client_id required to approve")
        lead.status = LeadStatus.APPROVED
        lead.reviewed_at = datetime.utcnow()

        # Auto-convert to ticket
        ticket_num = await generate_ticket_number(db)
        ticket = Ticket(
            ticket_number=ticket_num,
            title=review.title or lead.subject or "New ticket from lead",
            description=review.description or lead.body,
            status=TicketStatus.NEW,
            priority=TicketPriority(review.priority) if review.priority else TicketPriority.MEDIUM,
            client_id=review.client_id,
            assigned_to=review.assigned_to,
            source_lead_id=lead.id,
            position=0.0,
        )
        db.add(ticket)
        await db.flush()
        await db.refresh(ticket)

        # Log activity on the new ticket
        activity = ActivityLog(
            ticket_id=ticket.id,
            user_id=user.id,
            action_type=ActivityActionType.CREATED,
            action_detail=f"Created from lead #{lead.id}",
        )
        db.add(activity)
        lead.converted_ticket_id = ticket.id
        lead.status = LeadStatus.CONVERTED
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'deny'")

    await db.flush()
    await db.refresh(lead)
    return lead
