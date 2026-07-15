"""RustDesk integration routes: device management, remote sessions, time tracking."""
import uuid
import base64
import json
import secrets
import time
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
import os
import socket

from app.database import get_db
from app.models import (
    RustDeskDevice, RemoteSession, Ticket, Client, User,
    TimeEntry
)
from app.schemas import (
    RustDeskDeviceCreate, RustDeskDeviceResponse,
    RemoteSessionCreate, RemoteSessionResponse, RemoteSessionUpdate
)
from app.auth import require_tech_or_admin, require_any_auth, get_current_user, decode_token

router = APIRouter()

# RustDesk server config
RUSTDESK_HBBS_HOST = os.getenv("RUSTDESK_HBBS_HOST", "127.0.0.1")
RUSTDESK_HBBS_PORT = os.getenv("RUSTDESK_HBBS_PORT", "21116")
RUSTDESK_RELAY_PORT = os.getenv("RUSTDESK_RELAY_PORT", "21117")
RUSTDESK_KEY_FILE = os.getenv("RUSTDESK_KEY_FILE", "./data/rustdesk/id_ed25519.pub")


def _get_rustdesk_peers():
    """Get peer list from RustDesk hbbs via TCP command."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((RUSTDESK_HBBS_HOST, int(RUSTDESK_HBBS_PORT)))
        sock.sendall(b"Peers\r\n")
        data = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
        sock.close()
        return data.decode("utf-8", errors="ignore").strip()
    except Exception:
        return None


def _device_response(d: RustDeskDevice, online_ids: set | None = None) -> dict:
    """Build a device response dict with online status."""
    is_online = None
    if online_ids is not None:
        is_online = d.device_id in online_ids
    return {
        "id": d.id,
        "client_id": d.client_id,
        "device_id": d.device_id,
        "alias": d.alias,
        "os": d.os,
        "cpu": d.cpu,
        "hostname": d.hostname,
        "connection_password": d.connection_password,
        "is_active": d.is_active,
        "last_seen": d.last_seen,
        "created_at": d.created_at,
        "is_online": is_online,
        "client_name": d.client.name if d.client else None,
    }


def _session_response(s: RemoteSession) -> dict:
    """Build a session response dict with related names."""
    return {
        "id": s.id,
        "uuid": s.uuid,
        "ticket_id": s.ticket_id,
        "device_id": s.device_id,
        "client_id": s.client_id,
        "technician_id": s.technician_id,
        "notes": s.notes,
        "started_at": s.started_at,
        "ended_at": s.ended_at,
        "duration_seconds": s.duration_seconds,
        "created_at": s.created_at,
        "ticket_title": s.ticket.title if s.ticket else None,
        "device_alias": s.device.alias if s.device else None,
        "technician_name": s.technician.name if s.technician else None,
        "client_name": s.client.name if s.client else None,
    }


def _read_rustdesk_public_key() -> str:
    if not os.path.exists(RUSTDESK_KEY_FILE):
        raise HTTPException(
            status_code=503,
            detail=f"RustDesk public key file not found: {RUSTDESK_KEY_FILE}",
        )
    try:
        with open(RUSTDESK_KEY_FILE, "r") as f:
            key = f.read().strip()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"RustDesk public key file could not be read: {exc}",
        )
    if not key:
        raise HTTPException(
            status_code=503,
            detail="RustDesk public key file is empty.",
        )
    return key


def _parse_peers(peers_str: str | None) -> set:
    """Parse peer list string into set of online device IDs."""
    online_ids = set()
    if not peers_str:
        return online_ids
    for line in peers_str.split("\n"):
        parts = line.split(",")
        if len(parts) >= 3:
            peer_id = parts[0].strip()
            if peer_id:
                online_ids.add(peer_id)
    return online_ids

# ── Devices ──────────────────────────────────────────────────────────────────

@router.get("/rustdesk/devices", response_model=list[RustDeskDeviceResponse])
async def list_devices(
    client_id: int = None,
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    query = select(RustDeskDevice).where(RustDeskDevice.is_active == True).options(selectinload(RustDeskDevice.client))
    if client_id:
        query = query.where(RustDeskDevice.client_id == client_id)
    query = query.order_by(RustDeskDevice.alias.asc())
    result = await db.execute(query)
    devices = result.scalars().all()

    # Try to enrich with live peer data from RustDesk server
    peers_str = _get_rustdesk_peers()
    online_ids = _parse_peers(peers_str)

    return [_device_response(d, online_ids if online_ids else None) for d in devices]


@router.post("/rustdesk/devices", response_model=RustDeskDeviceResponse)
async def register_device(
    data: RustDeskDeviceCreate,
    user: User = Depends(require_tech_or_admin),
    db: AsyncSession = Depends(get_db),
):
    # Check for duplicate
    result = await db.execute(
        select(RustDeskDevice).where(RustDeskDevice.device_id == data.device_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Device already registered")

    device = RustDeskDevice(
        client_id=data.client_id,
        device_id=data.device_id,
        alias=data.alias,
        os=data.os,
        hostname=data.hostname,
        cpu=data.cpu,
        connection_password=data.connection_password,
        registered_by=user.id,
    )
    db.add(device)
    await db.flush()

    # Eagerly load client relationship for response
    result = await db.execute(
        select(RustDeskDevice)
        .options(selectinload(RustDeskDevice.client))
        .where(RustDeskDevice.id == device.id)
    )
    device = result.scalar_one()

    return _device_response(device)


@router.put("/rustdesk/devices/{device_id}")
async def update_device(
    device_id: int,
    data: RustDeskDeviceCreate,
    user: User = Depends(require_tech_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update device details (alias, os, hostname, cpu, client)."""
    result = await db.execute(
        select(RustDeskDevice).where(
            and_(RustDeskDevice.id == device_id, RustDeskDevice.is_active == True)
        ).options(selectinload(RustDeskDevice.client))
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if data.device_id != device.device_id:
        dup = await db.execute(
            select(RustDeskDevice).where(
                and_(RustDeskDevice.device_id == data.device_id, RustDeskDevice.id != device.id)
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Device already registered")

    device.device_id = data.device_id
    device.client_id = data.client_id
    device.alias = data.alias
    device.os = data.os
    device.hostname = data.hostname
    device.cpu = data.cpu
    device.connection_password = data.connection_password

    # Eagerly reload with client relationship for response
    result = await db.execute(
        select(RustDeskDevice)
        .options(selectinload(RustDeskDevice.client))
        .where(RustDeskDevice.id == device.id)
    )
    device = result.scalar_one()

    return _device_response(device)


@router.delete("/rustdesk/devices/{device_id}")
async def remove_device(
    device_id: int,
    user: User = Depends(require_tech_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete / remove device."""
    result = await db.execute(select(RustDeskDevice).where(RustDeskDevice.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    device.is_active = False
    await db.flush()
    return {"message": "Device removed"}


# ── Remote Sessions ──────────────────────────────────────────────────────────

@router.get("/rustdesk/sessions", response_model=list[RemoteSessionResponse])
async def list_sessions(
    client_id: int = None,
    ticket_id: int = None,
    active_only: bool = False,
    user: User = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(RemoteSession)
        .options(
            selectinload(RemoteSession.ticket),
            selectinload(RemoteSession.device),
            selectinload(RemoteSession.technician),
            selectinload(RemoteSession.client),
        )
        .order_by(RemoteSession.started_at.desc())
    )
    if client_id:
        query = query.where(RemoteSession.client_id == client_id)
    if ticket_id:
        query = query.where(RemoteSession.ticket_id == ticket_id)
    if active_only:
        query = query.where(RemoteSession.ended_at.is_(None))
    result = await db.execute(query)
    sessions = result.scalars().all()
    return [_session_response(s) for s in sessions]


@router.post("/rustdesk/sessions/start", response_model=RemoteSessionResponse)
async def start_session(
    data: RemoteSessionCreate,
    user: User = Depends(require_tech_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Start a new remote session. Optionally linked to a ticket."""
    session = RemoteSession(
        uuid=str(uuid.uuid4()),
        ticket_id=data.ticket_id,
        device_id=data.device_id,
        client_id=data.client_id,
        technician_id=user.id,
        notes=data.notes or "",
        started_at=datetime.utcnow(),
    )
    db.add(session)
    await db.flush()

    # Also create a running time entry if ticket_id provided
    if data.ticket_id:
        time_entry = TimeEntry(
            ticket_id=data.ticket_id,
            user_id=user.id,
            started_at=datetime.utcnow(),
            description=f"Remote session via RustDesk",
            is_running=True,
        )
        db.add(time_entry)
        await db.flush()

    # Load relationships for response
    await db.refresh(session)
    result = await db.execute(
        select(RemoteSession)
        .options(
            selectinload(RemoteSession.ticket),
            selectinload(RemoteSession.device),
            selectinload(RemoteSession.technician),
            selectinload(RemoteSession.client),
        )
        .where(RemoteSession.id == session.id)
    )
    session = result.scalar_one()
    return _session_response(session)


@router.post("/rustdesk/sessions/{session_id}/stop", response_model=RemoteSessionResponse)
async def stop_session(
    session_id: int,
    notes: str = None,
    user: User = Depends(require_tech_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Stop a remote session — calculate duration, update time entry."""
    result = await db.execute(
        select(RemoteSession)
        .options(
            selectinload(RemoteSession.ticket),
            selectinload(RemoteSession.device),
            selectinload(RemoteSession.technician),
            selectinload(RemoteSession.client),
        )
        .where(RemoteSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.ended_at:
        raise HTTPException(status_code=400, detail="Session already ended")

    now = datetime.utcnow()
    session.ended_at = now
    session.duration_seconds = int((now - session.started_at).total_seconds())
    if notes:
        session.notes = (session.notes or "") + "\n" + notes

    # Stop the running time entry for this ticket
    if session.ticket_id:
        time_result = await db.execute(
            select(TimeEntry).where(
                and_(
                    TimeEntry.ticket_id == session.ticket_id,
                    TimeEntry.user_id == user.id,
                    TimeEntry.is_running == True,
                )
            )
        )
        time_entry = time_result.scalar_one_or_none()
        if time_entry:
            time_entry.ended_at = now
            time_entry.duration_seconds = int((now - time_entry.started_at).total_seconds())
            time_entry.is_running = False

    await db.flush()
    return _session_response(session)


@router.patch("/rustdesk/sessions/{session_id}", response_model=RemoteSessionResponse)
async def update_session(
    session_id: int,
    data: RemoteSessionUpdate,
    user: User = Depends(require_tech_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update session notes or ticket link."""
    result = await db.execute(
        select(RemoteSession)
        .options(
            selectinload(RemoteSession.ticket),
            selectinload(RemoteSession.device),
            selectinload(RemoteSession.technician),
            selectinload(RemoteSession.client),
        )
        .where(RemoteSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if data.notes is not None:
        session.notes = data.notes
    if data.ticket_id is not None:
        session.ticket_id = data.ticket_id
    await db.flush()
    return _session_response(session)


# ── Config ───────────────────────────────────────────────────────────────────

WEB_CLIENT_DIR = os.getenv("RUSTDESK_WEB_CLIENT_DIR", "./data/rustdesk-web")
WEB_CLIENT_LAUNCH_TOKENS: dict[str, tuple[int, float]] = {}


def _cleanup_launch_tokens() -> None:
    now = time.time()
    expired = [token for token, (_, expires_at) in WEB_CLIENT_LAUNCH_TOKENS.items() if expires_at < now]
    for token in expired:
        WEB_CLIENT_LAUNCH_TOKENS.pop(token, None)


@router.post("/rustdesk/web-client-launch-token")
async def create_web_client_launch_token(user: User = Depends(require_any_auth)):
    """Create a short-lived opaque token for direct RustDesk browser navigation.

    It is intentionally reusable during its lifetime so refreshing the RustDesk
    tab does not turn into a raw JSON auth error. The token is random/opaque and
    does not expose the main JWT.
    """
    _cleanup_launch_tokens()
    token = secrets.token_urlsafe(32)
    expires_in = 30 * 60
    WEB_CLIENT_LAUNCH_TOKENS[token] = (user.id, time.time() + expires_in)
    return {"launch_token": token, "expires_in": expires_in}


async def _authorize_web_client_request(
    access_token: str | None,
    launch_token: str | None,
    authorization: str | None,
    db: AsyncSession,
) -> User:
    """Authorize real browser navigation to the RustDesk HTML document.

    Normal SPA API calls send Authorization headers, but window.open/direct tab
    navigation cannot. Prefer a short-lived one-time launch_token; access_token
    remains supported for diagnostics/backward compatibility.
    """
    _cleanup_launch_tokens()
    if launch_token:
        launch = WEB_CLIENT_LAUNCH_TOKENS.get(launch_token)
        if not launch:
            raise HTTPException(status_code=401, detail="Invalid or expired RustDesk launch token")
        user_id, expires_at = launch
        if expires_at < time.time():
            WEB_CLIENT_LAUNCH_TOKENS.pop(launch_token, None)
            raise HTTPException(status_code=401, detail="Expired RustDesk launch token")
        result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found or inactive")
        return user

    token = access_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)
    user_id = int(payload.get("sub", 0))
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    if user.role.value not in {"ADMIN", "TECHNICIAN", "GUEST"}:
        raise HTTPException(status_code=403, detail="You don't have permission to open RustDesk")
    return user


def _safe_web_client_path(asset_path: str) -> str:
    requested = os.path.realpath(os.path.join(WEB_CLIENT_DIR, asset_path))
    root = os.path.realpath(WEB_CLIENT_DIR)
    if requested == root:
        return requested
    if not requested.startswith(root + os.sep):
        raise HTTPException(status_code=404, detail="Asset not found")
    return requested


@router.get("/rustdesk/config")
async def rustdesk_config(user: User = Depends(require_any_auth)):
    """Return RustDesk server connection info for the client."""
    key = _read_rustdesk_public_key()
    server_host = os.getenv("RUSTDESK_SERVER_HOST", "127.0.0.1")
    return {
        "host": server_host,
        "port": RUSTDESK_HBBS_PORT,
        "relay_port": RUSTDESK_RELAY_PORT,
        "key": key,
    }


@router.get("/rustdesk/web-client", response_class=HTMLResponse)
async def serve_web_client(
    access_token: str | None = Query(None),
    launch_token: str | None = Query(None),
    authorization: str | None = Header(None),
    id: str | None = Query(None),
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Serve RustDesk as a real browser document with custom config injected.

    This endpoint intentionally accepts the current JWT as access_token for
    window.open/direct navigation. Loading the RustDesk HTML as a real document
    is required because rewriting it into an already-open SPA popup prevents the
    web client's module/bootstrap scripts from executing reliably.
    """
    await _authorize_web_client_request(access_token, launch_token, authorization, db)
    key = _read_rustdesk_public_key()

    server_host = os.getenv("RUSTDESK_SERVER_HOST", "127.0.0.1")
    server_port = RUSTDESK_HBBS_PORT

    config = f"""[default-settings]
custom-rendezvous-server={server_host}:{server_port}
key={key}

[override-settings]
custom-rendezvous-server={server_host}:{server_port}
key={key}
"""

    config_b64 = base64.b64encode(config.encode()).decode()

    if id:
        # Auto-connect: use the v1 JS client (lighter, no Flutter/CanvasKit needed)
        connect_path = os.path.join(WEB_CLIENT_DIR, "v1.html")
        try:
            with open(connect_path, "r") as f:
                html = f.read()
        except FileNotFoundError:
            raise HTTPException(
                status_code=503,
                detail="RustDesk web client v1 template not found.",
            )

        # Simple template variable substitution
        html = html.replace("{{RD_CONFIG_B64}}", config_b64)
        html = html.replace("{{RD_HOST}}", f"{server_host}:{server_port}")
        html = html.replace("{{RD_ID}}", id)
        html = html.replace("{{RD_KEY}}", key)
        html = html.replace("{{RD_PASSWORD}}", password or "")

        return HTMLResponse(
            content=html,
            headers={"Cache-Control": "no-store, private"},
        )

    # No id: serve the full Flutter V2 index.html with config injection only
    # (user will type the remote ID manually).
    index_path = os.path.join(WEB_CLIENT_DIR, "index.html")
    try:
        with open(index_path, "r") as f:
            html = f.read()
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="RustDesk web client not deployed. Run the web client download script first.",
        )

    if "{{CUSTOM_CONFIG}}" not in html:
        raise HTTPException(
            status_code=500,
            detail="RustDesk web client template is missing the CUSTOM_CONFIG placeholder.",
        )

    # Direct navigation URL is /api/rustdesk/web-client, so relative assets must
    # resolve below /api/rustdesk/web-client/ instead of /api/rustdesk/.
    html = html.replace('<base href="" />', '<base href="/api/rustdesk/web-client/" />')
    html = html.replace("{{CUSTOM_CONFIG}}", config_b64)

    return HTMLResponse(
        content=html,
        headers={"Cache-Control": "no-store, private"},
    )


@router.get("/rustdesk/web-client/{asset_path:path}")
async def serve_web_client_asset(asset_path: str):
    """Serve RustDesk web client static assets."""
    file_path = _safe_web_client_path(asset_path)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # Determine media type based on file extension (not URL path,
    # which may contain %3F for query strings in filenames)
    media_type = None
    lower = file_path.lower()
    if lower.endswith(".js") or ".js?" in lower or ".js%" in lower:
        media_type = "application/javascript"
    elif lower.endswith(".wasm"):
        media_type = "application/wasm"
    elif lower.endswith(".svg"):
        media_type = "image/svg+xml"
    elif lower.endswith(".json"):
        media_type = "application/json"
    elif lower.endswith(".png"):
        media_type = "image/png"
    elif lower.endswith(".css"):
        media_type = "text/css"
    
    return FileResponse(file_path, media_type=media_type)
