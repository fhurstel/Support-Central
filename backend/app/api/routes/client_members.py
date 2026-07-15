"""Client Member API routes — manage people belonging to each client."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import ClientMember
from app.schemas import ClientMemberCreate, ClientMemberUpdate, ClientMemberResponse
from app.auth import require_any_auth

router = APIRouter()


@router.get("/clients/{client_id}/members", response_model=list[ClientMemberResponse])
async def get_client_members(client_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ClientMember)
        .where(ClientMember.client_id == client_id, ClientMember.is_active == True)
        .order_by(ClientMember.is_primary.desc(), ClientMember.name)
    )
    return result.scalars().all()


@router.post("/clients/{client_id}/members", response_model=ClientMemberResponse, status_code=201)
async def create_client_member(
    client_id: int,
    body: ClientMemberCreate,
    db: AsyncSession = Depends(get_db),
):
    member = ClientMember(
        client_id=client_id,
        name=body.name,
        email=body.email,
        phone=body.phone,
        personal_phone=body.personal_phone,
        role=body.role,
        is_primary=body.is_primary or False,
    )
    db.add(member)
    await db.flush()
    await db.refresh(member)
    return member


@router.patch("/clients/{client_id}/members/{member_id}", response_model=ClientMemberResponse)
async def update_client_member(
    client_id: int,
    member_id: int,
    body: ClientMemberUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ClientMember).where(
            ClientMember.id == member_id,
            ClientMember.client_id == client_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Client member not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(member, field, value)

    await db.flush()
    await db.refresh(member)
    return member


@router.delete("/clients/{client_id}/members/{member_id}")
async def delete_client_member(
    client_id: int,
    member_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ClientMember).where(
            ClientMember.id == member_id,
            ClientMember.client_id == client_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Client member not found")

    member.is_active = False
    await db.flush()
    return {"status": "deleted", "id": member_id}
