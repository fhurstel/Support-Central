"""Poppy AI API proxy endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.auth import require_any_auth

from app.services.poppy import (
    PoppyError,
    get_boards,
    get_chats,
    create_conversation,
    send_message,
    ask_once,
)

router = APIRouter(prefix="/poppy", tags=["poppy"])


class PromptRequest(BaseModel):
    prompt: str
    model: str = "claude-sonnet-4-6"
    additional_context: str = ""


class CreateConvRequest(BaseModel):
    name: str = "API Conversation"


@router.get("/boards")
async def list_boards(user=Depends(require_any_auth)):
    """List all Poppy boards."""
    try:
        boards = await get_boards()
        return {"boards": boards}
    except PoppyError as e:
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)


@router.get("/chats/{board_id}")
async def list_chats(board_id: str, user=Depends(require_any_auth)):
    """List chat assistants for a board."""
    try:
        chats = await get_chats(board_id)
        return {"chats": chats}
    except PoppyError as e:
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)


@router.post("/conversation")
async def create_conv(
    request: CreateConvRequest,
    board_id: str = Query(...),
    chat_id: str = Query(...),
    user=Depends(require_any_auth),
):
    """Create a new conversation thread."""
    try:
        result = await create_conversation(
            board_id=board_id,
            chat_id=chat_id,
            name=request.name,
        )
        return result
    except PoppyError as e:
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)


@router.post("/conversation/{conversation_id}")
async def send_conv_message(
    conversation_id: str,
    request: PromptRequest,
    board_id: str = Query(...),
    chat_id: str = Query(...),
    user=Depends(require_any_auth),
):
    """Send a message to an existing conversation."""
    try:
        result = await send_message(
            conversation_id=conversation_id,
            board_id=board_id,
            chat_id=chat_id,
            prompt=request.prompt,
            model=request.model,
            additional_context=request.additional_context,
        )
        return result
    except PoppyError as e:
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)


@router.post("/ask")
async def ask_question(
    request: PromptRequest,
    board_id: str = Query(...),
    chat_id: str = Query(...),
    user=Depends(require_any_auth),
):
    """Ask a one-shot question to a Poppy chat assistant."""
    try:
        result = await ask_once(
            board_id=board_id,
            chat_id=chat_id,
            prompt=request.prompt,
            model=request.model,
            additional_context=request.additional_context,
        )
        return {"text": result.get("text", ""), "credits_used": result.get("credits_used", 0)}
    except PoppyError as e:
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)
