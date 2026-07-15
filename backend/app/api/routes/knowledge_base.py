"""Knowledge Base API routes."""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import User, KnowledgeBase, Ticket, ActivityLog, ActivityActionType
from app.schemas import KBCreate, KBUpdate, KBResponse
from app.auth import get_current_user, require_any_auth

router = APIRouter(prefix="/kb", tags=["knowledge-base"])


@router.post("/", response_model=KBResponse)
async def create_article(article: KBCreate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    data = article.model_dump()
    attachments = data.pop('attachments', None)
    db_article = KnowledgeBase(**data)
    if attachments:
        db_article.attachments_json = json.dumps(attachments)
    db.add(db_article)
    await db.flush()
    await db.refresh(db_article)
    return db_article


@router.post("/from-ticket/{ticket_id}", response_model=KBResponse)
async def create_article_from_ticket(
    ticket_id: int,
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """Create a KB article from an existing ticket."""
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = ticket_result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    db_article = KnowledgeBase(
        title=ticket.title,
        content=ticket.description or "",
        source_ticket_id=ticket.id,
        is_active=True,
        attachments_json='[]',
    )
    db.add(db_article)
    await db.flush()
    await db.refresh(db_article)

    # Log activity on the source ticket
    activity = ActivityLog(
        ticket_id=ticket.id,
        user_id=user.id,
        action_type=ActivityActionType.UPDATED,
        action_detail=f"Converted to KB article #{db_article.id}",
    )
    db.add(activity)
    await db.flush()

    return db_article


@router.get("/", response_model=list[KBResponse])
async def list_articles(
    user: User = Depends(require_any_auth),
    search: str = Query(None),
    category: str = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    query = select(KnowledgeBase).where(KnowledgeBase.is_active == True)
    if search:
        query = query.where(
            or_(
                KnowledgeBase.title.ilike(f"%{search}%"),
                KnowledgeBase.content.ilike(f"%{search}%"),
                KnowledgeBase.tags.ilike(f"%{search}%"),
            )
        )
    if category:
        query = query.where(KnowledgeBase.category == category)
    query = query.order_by(KnowledgeBase.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{article_id}", response_model=KBResponse)
async def get_article(article_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.patch("/{article_id}", response_model=KBResponse)
async def update_article(article_id: int, update: KBUpdate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    data = update.model_dump(exclude_unset=True)
    attachments = data.pop('attachments', None)
    if attachments is not None:
        article.attachments_json = json.dumps(attachments)
    for field, value in data.items():
        setattr(article, field, value)
    await db.flush()
    await db.refresh(article)
    return article


@router.delete("/{article_id}")
async def delete_article(article_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    article.is_active = False
    await db.flush()
    return {"message": "Article deleted"}


@router.get("/categories/all")
async def get_categories(user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeBase.category, func.count(KnowledgeBase.id))
        .where(KnowledgeBase.is_active == True)
        .group_by(KnowledgeBase.category)
    )
    return [{"category": cat, "count": count} for cat, count in result.all()]
