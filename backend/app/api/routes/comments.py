"""Comment API routes."""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import User, Comment, CommentVisibility, Ticket, Client, ActivityLog, ActivityActionType
from app.schemas import CommentCreate, CommentResponse
from app.services.email import send_email_to_client
from app.auth import get_current_user, require_any_auth

router = APIRouter(prefix="/comments", tags=["comments"])


@router.post("/", response_model=CommentResponse)
async def create_comment(
    ticket_id: int,
    comment: CommentCreate,
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    # Handle frontend sending is_private bool instead of visibility string
    visibility = comment.visibility
    # If the frontend sent is_private as a query param or in the body, handle it
    # The CommentCreate schema has visibility="PRIVATE" by default, which is correct.
    # But if is_private was somehow passed and visibility is still the default, check.
    # Since Pydantic will reject unknown fields, we handle this at the api.js level.
    # However, if visibility came through as "PRIVATE" or "PUBLIC", use it directly.

    db_comment = Comment(
        ticket_id=ticket_id,
        author_id=user.id,
        body=comment.body,
        visibility=CommentVisibility(visibility),
        attachments_json=json.dumps(comment.attachments or []),
    )
    db.add(db_comment)
    await db.flush()
    await db.refresh(db_comment)

    # If public and marked to email, send to client
    if visibility == "PUBLIC" and comment.email_to_client:
        ticket_result = await db.execute(
            select(Ticket).options(selectinload(Ticket.client)).where(Ticket.id == ticket_id)
        )
        ticket = ticket_result.scalar_one_or_none()
        if ticket and ticket.client and ticket.client.email:
            await send_email_to_client(
                to_email=ticket.client.email,
                subject=f"Update on Ticket #{ticket.ticket_number}",
                body=comment.body,
                ticket=ticket,
            )
            db_comment.emailed_to_client = True
            db_comment.email_sent_at = datetime.utcnow()
            await db.flush()

    # Create activity log
    email_to_client = visibility == "PUBLIC" and comment.email_to_client
    comment_body = comment.body if comment else ""
    activity = ActivityLog(
        ticket_id=ticket_id,
        user_id=user.id,
        action_type=ActivityActionType.COMMENTED,
        action_detail=json.dumps({
            "comment_id": db_comment.id,
            "visibility": visibility,
            "email_sent": email_to_client,
            "comment_preview": comment_body[:200],
        }),
    )
    db.add(activity)

    # Update ticket's updated_at timestamp
    ticket_to_update = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket_obj = ticket_to_update.scalar_one_or_none()
    if ticket_obj:
        ticket_obj.updated_at = datetime.utcnow()

    await db.flush()

    # Load author for response
    result = await db.execute(
        select(Comment).options(selectinload(Comment.author)).where(Comment.id == db_comment.id)
    )
    return result.scalar_one()


@router.get("/ticket/{ticket_id}", response_model=list[CommentResponse])
async def get_ticket_comments(
    ticket_id: int,
    visibility: str = None,
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    query = select(Comment).options(selectinload(Comment.author)).where(Comment.ticket_id == ticket_id)
    if visibility:
        query = query.where(Comment.visibility == visibility)
    query = query.order_by(Comment.created_at.asc())
    result = await db.execute(query)
    return result.scalars().all()
