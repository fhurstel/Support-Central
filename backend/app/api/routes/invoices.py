"""Invoice generation and management."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import User, Invoice, Ticket, Client, ClientType, TicketStatus, TimeEntry
from app.schemas import InvoiceCreate, InvoiceResponse
from app.auth import get_current_user, require_any_auth

router = APIRouter(prefix="/invoices", tags=["invoices"])


async def generate_ticket_number(db: AsyncSession) -> str:
    """Generate sequential ticket number: TKT-YYYYMMDD-XXXX.
    Uses date prefix + daily sequence for readability and uniqueness.
    SQLite-compatible (no advisory locks).
    """
    today = datetime.utcnow().strftime("%Y%m%d")
    date_prefix = f"TKT-{today}-"
    # Find the highest sequence number for today
    result = await db.execute(
        select(Ticket.ticket_number)
        .where(Ticket.ticket_number.like(f"{date_prefix}%"))
        .order_by(Ticket.ticket_number.desc())
    )
    latest = result.scalars().first()
    if latest:
        # Extract the numeric suffix and increment
        try:
            seq = int(latest.replace(date_prefix, "")) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{date_prefix}{seq:04d}"


async def generate_invoice_number(db: AsyncSession) -> str:
    """Generate sequential invoice number: INV-00001. SQLite-compatible (no advisory locks)."""
    result = await db.execute(select(Invoice).order_by(Invoice.id.desc()))
    latest = result.scalars().first()
    next_num = (latest.id + 1) if latest else 1
    return f"INV-{next_num:05d}"


def _compute_ticket_hours(ticket: Ticket) -> float:
    """Compute total hours from already-loaded time_entries in async context."""
    total_seconds = 0
    for entry in ticket.time_entries:
        if entry.duration_seconds:
            total_seconds += entry.duration_seconds
        elif entry.is_running and entry.started_at:
            # For running timers, compute up to now
            delta = datetime.utcnow() - entry.started_at
            total_seconds += int(delta.total_seconds())
    return round(total_seconds / 3600.0, 2)


def _invoice_to_response(invoice: Invoice) -> dict:
    """Convert Invoice ORM object to response dict with extra frontend fields."""
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "client_id": invoice.client_id,
        "ticket_id": invoice.ticket_id,
        "period_start": invoice.period_start,
        "period_end": invoice.period_end,
        "total_hours": invoice.total_hours,
        "hourly_rate": invoice.hourly_rate,
        "total_amount": invoice.total_amount,
        "amount": invoice.total_amount,
        "status": invoice.status,
        "notes": invoice.notes,
        "sent_at": invoice.sent_at,
        "paid_at": invoice.paid_at,
        "created_at": invoice.created_at,
        "client_name": invoice.client.name if invoice.client else None,
        "start_date": invoice.period_start,
        "end_date": invoice.period_end,
        "client": {
            "id": invoice.client.id,
            "name": invoice.client.name,
            "email": invoice.client.email,
            "phone": invoice.client.phone,
            "company": invoice.client.company,
            "client_type": invoice.client.client_type.value if hasattr(invoice.client.client_type, 'value') else str(invoice.client.client_type),
            "hourly_rate": invoice.client.hourly_rate,
            "is_active": invoice.client.is_active,
            "created_at": invoice.client.created_at,
        } if invoice.client else None,
    }


@router.post("/", response_model=InvoiceResponse)
async def create_invoice(invoice_data: InvoiceCreate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    # Get client
    client_result = await db.execute(select(Client).where(Client.id == invoice_data.client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    inv_number = await generate_invoice_number(db)
    total_hours = 0.0
    total_amount = 0.0
    period_start = None
    period_end = None
    notes_parts = []

    if invoice_data.ticket_id:
        # Single ticket invoice (temp clients)
        ticket_result = await db.execute(
            select(Ticket).options(selectinload(Ticket.time_entries)).where(Ticket.id == invoice_data.ticket_id)
        )
        ticket = ticket_result.scalar_one_or_none()
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        total_hours = _compute_ticket_hours(ticket)
        rate = client.hourly_rate if client.hourly_rate > 0 else 0
        total_amount = round(total_hours * rate, 2)
        notes_parts.append(f"Ticket #{ticket.ticket_number}: {total_hours}h @ ${rate}/hr")

        # Compute period_start/period_end: explicit values > time entry range > now
        if invoice_data.period_start:
            period_start = invoice_data.period_start
        if invoice_data.period_end:
            period_end = invoice_data.period_end
        if not invoice_data.period_start or not invoice_data.period_end:
            entry_times = [
                entry.started_at for entry in ticket.time_entries
                if entry.started_at is not None
            ]
            if entry_times:
                if not invoice_data.period_start:
                    period_start = min(entry_times)
                if not invoice_data.period_end:
                    period_end = max(entry_times)
            else:
                # No time entries with timestamps — default to now
                if period_start is None:
                    period_start = datetime.utcnow()
                if period_end is None:
                    period_end = datetime.utcnow()
    else:
        # Batch invoice (managed clients) — aggregate all closed/completed but uninvoiced tickets
        period_start = invoice_data.period_start or datetime.utcnow() - timedelta(days=30)
        period_end = invoice_data.period_end or datetime.utcnow()
        tickets_result = await db.execute(
            select(Ticket).options(selectinload(Ticket.time_entries)).where(
                and_(
                    Ticket.client_id == invoice_data.client_id,
                    Ticket.status.in_([TicketStatus.COMPLETED, TicketStatus.CLOSED]),
                    Ticket.closed_at >= period_start,
                    Ticket.closed_at <= period_end,
                )
            )
        )
        tickets = tickets_result.scalars().all()
        rate = client.hourly_rate
        for t in tickets:
            t_hours = _compute_ticket_hours(t)
            total_hours += t_hours
            total_amount += t_hours * rate
            notes_parts.append(f"Ticket #{t.ticket_number}: {t_hours}h")
        total_amount = round(total_amount, 2)

    notes = "\n".join(notes_parts)
    if invoice_data.notes:
        notes = invoice_data.notes + "\n" + notes

    invoice = Invoice(
        invoice_number=inv_number,
        client_id=invoice_data.client_id,
        ticket_id=invoice_data.ticket_id,
        period_start=period_start,
        period_end=period_end,
        total_hours=total_hours,
        hourly_rate=client.hourly_rate,
        total_amount=total_amount,
        notes=notes,
        status="draft",
    )
    db.add(invoice)
    await db.flush()

    # Eagerly reload with client relationship for response
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.client)).where(Invoice.id == invoice.id)
    )
    invoice = result.scalar_one()
    return _invoice_to_response(invoice)


@router.get("/", response_model=list[InvoiceResponse])
async def list_invoices(
    user: User = Depends(require_any_auth),
    client_id: int = Query(None),
    status: str = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = select(Invoice).options(selectinload(Invoice.client)).order_by(Invoice.created_at.desc())
    if client_id:
        query = query.where(Invoice.client_id == client_id)
    if status:
        query = query.where(Invoice.status == status)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    invoices = result.scalars().all()
    return [_invoice_to_response(inv) for inv in invoices]


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(invoice_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _invoice_to_response(invoice)


@router.post("/{invoice_id}/send", response_model=InvoiceResponse)
async def send_invoice(invoice_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status != "draft":
        raise HTTPException(status_code=400, detail="Invoice already sent")

    # Send email to client if SMTP is configured
    email_sent = False
    if invoice.client and invoice.client.email:
        from app.services.email import send_invoice_email
        try:
            email_sent = await send_invoice_email(invoice)
        except Exception as e:
            import logging
            log = logging.getLogger("fiji-it.invoices")
            log.warning(f"Invoice {invoice_id} email send failed: {e}")

    invoice.status = "sent"
    invoice.sent_at = datetime.utcnow()
    await db.flush()
    await db.refresh(invoice)
    # Reload with client relationship
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.client)).where(Invoice.id == invoice.id)
    )
    invoice = result.scalar_one()
    response = _invoice_to_response(invoice)
    response["email_sent"] = email_sent
    return response
