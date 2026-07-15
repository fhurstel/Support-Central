"""Main FastAPI application."""
import logging
import os
import sys
import uuid
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database import init_db, engine
from app.api.routes import leads, tickets, comments, clients, knowledge_base, invoices, settings, kanban, client_members
from app.api.routes.poppy import router as poppy_router
from app.api.routes.call_logs import router as call_logs_router
from app.api.routes.time_entries import router as time_entries_router
from app.routes.auth import router as auth_router
from app.routes.rustdesk import router as rustdesk_router


# ── Structured logging ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-7s | %(name)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("fiji-it")


# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — initializing database")
    await init_db()
    logger.info("Database ready")
    yield
    logger.info("Shutting down — disposing engine")
    await engine.dispose()


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Fiji IT Solutions — Service Desk", lifespan=lifespan)

# ── CORS ──────────────────────────────────────────────────────────────────────
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Voice-Agent-Token"],
)


# ── Voice Agent auth middleware ────────────────────────────────────────────────
# Allows the voice agent (running locally) to authenticate via a shared secret
# header instead of JWT. Applied before route handlers.
VOICE_AGENT_TOKENS: set[str] = set()


def _load_voice_tokens() -> set[str]:
    """Load dedicated service-to-service tokens without exposing provider keys."""
    tokens = {
        token.strip()
        for token in os.getenv("VOICE_BACKEND_TOKENS", os.getenv("VOICE_BACKEND_TOKEN", "")).split(",")
        if token.strip()
    }
    optional_env_path = os.getenv("VOICE_AGENT_ENV_PATH", "").strip()
    if optional_env_path:
        env_path = Path(optional_env_path).expanduser()
        try:
            if env_path.exists():
                for line in env_path.read_text().splitlines():
                    if line.strip().startswith("VOICE_BACKEND_TOKEN="):
                        value = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if value:
                            tokens.add(value)
        except OSError as exc:
            logger.warning("Unable to read optional voice-agent environment file: %s", exc)
    if os.getenv("ENABLE_DEV_VOICE_TOKEN", "false").lower() == "true":
        tokens.add(os.getenv("DEV_VOICE_TOKEN", "local-development-only"))
    logger.info("Voice-agent authentication configured: %s", bool(tokens))
    return tokens


VOICE_AGENT_TOKENS = _load_voice_tokens()


@app.middleware("http")
async def voice_agent_auth(request: Request, call_next):
    """Inject a synthetic user for requests authenticated via X-Voice-Agent-Token."""
    voice_token = request.headers.get("X-Voice-Agent-Token")
    if voice_token and voice_token in VOICE_AGENT_TOKENS:
        # Mark request as voice-agent authenticated
        request.state.is_voice_agent = True
    else:
        request.state.is_voice_agent = False
    response = await call_next(request)
    return response


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' wss: https:; frame-ancestors 'none'"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ── Request ID middleware ─────────────────────────────────────────────────────
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])
    request.state.request_id = request_id
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as exc:
        logger.exception("Unhandled exception in request %s %s [%s]", request.method, request.url.path, request_id)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error", "request_id": request_id},
        )


from sqlalchemy.exc import IntegrityError, SQLAlchemyError

# ── Global exception handler ─────────────────────────────────────────────────
@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception("IntegrityError [%s %s] %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "Resource already exists or constraint violated", "request_id": request_id},
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception("SQLAlchemyError [%s %s] %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Database error", "request_id": request_id},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception(
        "Global handler caught %s: %s [%s %s]",
        type(exc).__name__,
        exc,
        request.method,
        request.url.path,
        extra={"request_id": request_id},
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "request_id": request_id},
    )


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/healthz")
async def health_check():
    """Liveness + readiness probe."""
    try:
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    return {"status": "healthy" if db_status == "ok" else "degraded", "db": db_status}


# ── API routes ───────────────────────────────────────────────────────────────
app.include_router(auth_router, prefix="/api")
app.include_router(rustdesk_router, prefix="/api")
app.include_router(leads.router, prefix="/api")
app.include_router(tickets.router, prefix="/api")
app.include_router(time_entries_router, prefix="/api/tickets")
app.include_router(comments.router, prefix="/api")
app.include_router(clients.router, prefix="/api")
app.include_router(knowledge_base.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(settings.router, prefix="/api/settings")

# ── Poppy AI routes ───────────────────────────────────────────────────────────
app.include_router(poppy_router, prefix="/api")


# ── Call Log routes ────────────────────────────────────────────────────────────
app.include_router(call_logs_router, prefix="/api")


# ── Kanban routes ──────────────────────────────────────────────────────────────
app.include_router(kanban.router, prefix="/api")
app.include_router(client_members.router, prefix="/api")


# ── Optional single-port SPA serving ──────────────────────────────────────────
# When a built frontend is present (container / single-port deployment), serve
# it from this same FastAPI app so the whole product runs on one port — the
# shape cloud/container hosts expect. In dev the SPA is served by Vite instead
# and this block stays inert. API routers, /healthz, /openapi.json and /docs are
# registered above and matched first, so they always take precedence.
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

_frontend_dist = Path(
    os.getenv("FRONTEND_DIST", str(Path(__file__).resolve().parents[2] / "dist"))
).resolve()
_serve_frontend = (_frontend_dist / "index.html").is_file()

if _serve_frontend:
    logger.info("Serving built frontend from %s", _frontend_dist)
    _assets_dir = _frontend_dist / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")


@app.get("/")
async def root():
    if _serve_frontend:
        return FileResponse(_frontend_dist / "index.html")
    return {"status": "ok", "service": "Fiji IT Solutions Service Desk API"}


if _serve_frontend:
    # BrowserRouter fallback via a 404 handler rather than a catch-all route.
    # A catch-all `/{path}` route would match `/api/tickets` (no trailing slash)
    # itself and suppress FastAPI's automatic 307 redirect to `/api/tickets/`,
    # which the frontend relies on. Handling it at the 404 layer keeps all
    # routing — including slash redirects and API JSON 404s — intact, and only
    # serves index.html for genuine browser navigations (GET + Accept: text/html)
    # to non-API paths, so client-side routes resolve on hard refresh.
    from starlette.exceptions import HTTPException as StarletteHTTPException
    from fastapi.exception_handlers import http_exception_handler

    _RESERVED_PREFIXES = ("/api", "/healthz", "/openapi", "/docs", "/redoc")

    @app.exception_handler(StarletteHTTPException)
    async def spa_or_default_404(request, exc):
        if (
            exc.status_code == 404
            and request.method == "GET"
            and not request.url.path.startswith(_RESERVED_PREFIXES)
            and "text/html" in request.headers.get("accept", "")
        ):
            return FileResponse(_frontend_dist / "index.html")
        return await http_exception_handler(request, exc)
