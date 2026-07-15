"""Authentication routes: login, register, me, user management."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User, UserRole, Client, Ticket
from app.schemas import (
    UserCreate, UserResponse, UserLogin, TokenResponse,
    PasswordChange
)
from app.auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    get_current_user, require_admin, require_tech_or_admin,
)

router = APIRouter()


def _user_response(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role.value,
        "is_active": user.is_active,
        "created_at": user.created_at,
    }


def _validate_password_strength(password: str) -> None:
    """Enforce strong password requirements. Raises HTTPException if invalid."""
    import re
    if len(password) < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters long")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character")


@router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    token = create_access_token(user.id, user.role.value)
    return {"access_token": token, "token_type": "bearer", "user": _user_response(user)}


@router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Validate password strength
    _validate_password_strength(data.password)

    role = "GUEST"  # Force all self-registrations to GUEST role
    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=UserRole(role),
    )
    db.add(user)
    await db.flush()

    token = create_access_token(user.id, user.role.value)
    return {"access_token": token, "token_type": "bearer", "user": _user_response(user)}


@router.get("/auth/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return _user_response(user)


@router.post("/auth/change-password")
async def change_password(
    data: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    _validate_password_strength(data.new_password)
    user.password_hash = hash_password(data.new_password)
    return {"message": "Password updated successfully"}


# ── User Management (Admin only) ──────────────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
async def list_users(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [_user_response(u) for u in users]


@router.post("/users", response_model=UserResponse)
async def create_user(
    data: UserCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    _validate_password_strength(data.password)

    role = data.role if data.role in ("ADMIN", "TECHNICIAN", "GUEST") else "TECHNICIAN"
    new_user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=UserRole(role),
    )
    db.add(new_user)
    await db.flush()
    return _user_response(new_user)


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    data: UserCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.name = data.name
    target.email = data.email
    if data.password:
        target.password_hash = hash_password(data.password)
    if data.role in ("ADMIN", "TECHNICIAN", "GUEST"):
        target.role = UserRole(data.role)

    return _user_response(target)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target.is_active = False
    return {"message": "User deactivated"}


# Seed endpoint removed for production safety.
# Use the admin-only POST /api/users endpoint to create users.
# Initial admin should be created via CLI or deployment script.


class RefreshTokenRequest(BaseModel):
    refresh_token: str


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    from jose import JWTError, jwt
    from app.auth import ALGORITHM, SECRET_KEY
    try:
        payload = jwt.decode(body.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        user_id = int(payload.get("sub", 0))
        role = payload.get("role", "")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    new_access = create_access_token(user.id, user.role.value)
    new_refresh = create_refresh_token(user.id, user.role.value)
    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer",
        "user": _user_response(user),
    }
