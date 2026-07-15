"""Client API routes."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import User, Client, ClientType
from app.schemas import ClientCreate, ClientResponse
from app.auth import get_current_user, require_any_auth

router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("/", response_model=ClientResponse)
async def create_client(client: ClientCreate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    db_client = Client(**client.model_dump())
    db.add(db_client)
    await db.flush()
    await db.refresh(db_client)
    return db_client


@router.get("/", response_model=list[ClientResponse])
async def list_clients(
    user: User = Depends(require_any_auth),
    client_type: str = Query(None),
    is_active: bool = Query(True),
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    query = select(Client).order_by(Client.name)
    if client_type:
        query = query.where(Client.client_type == client_type)
    if is_active is not None:
        query = query.where(Client.is_active == is_active)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(client_id: int, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.patch("/{client_id}", response_model=ClientResponse)
async def update_client(client_id: int, update: ClientCreate, user: User = Depends(require_any_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(client, field, value)
    await db.flush()
    await db.refresh(client)
    return client
