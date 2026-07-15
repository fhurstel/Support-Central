"""Poppy AI API integration service."""
import os
import logging
import httpx

logger = logging.getLogger("fiji-it.poppy")

POPPY_API_URL = os.getenv("POPPY_API_URL", "https://api.getpoppy.ai")
POPPY_API_KEY = os.getenv("POPPY_API_KEY", "")


class PoppyError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _headers() -> dict:
    if not POPPY_API_KEY:
        raise PoppyError("Poppy API key not configured. Set POPPY_API_KEY in .env")
    return {
        "x-api-key": POPPY_API_KEY,
        "Content-Type": "application/json",
    }


async def get_boards() -> list[dict]:
    """Fetch all available boards from Poppy."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{POPPY_API_URL}/api/boards",
            headers=_headers(),
        )
        if resp.status_code != 200:
            raise PoppyError(f"Failed to fetch boards: {resp.text}", resp.status_code)
        data = resp.json()
        return data.get("data", [])


async def get_chats(board_id: str) -> list[dict]:
    """Fetch all chat assistants for a board."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{POPPY_API_URL}/api/chats",
            headers=_headers(),
            params={"board_id": board_id},
        )
        if resp.status_code != 200:
            raise PoppyError(f"Failed to fetch chats: {resp.text}", resp.status_code)
        data = resp.json()
        return data.get("data", [])


async def create_conversation(board_id: str, chat_id: str, name: str = "API Conversation") -> dict:
    """Create a new conversation thread."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{POPPY_API_URL}/api/conversation/new",
            headers=_headers(),
            json={
                "boardId": board_id,
                "chatId": chat_id,
                "name": name,
            },
        )
        if resp.status_code not in (200, 201):
            raise PoppyError(f"Failed to create conversation: {resp.text}", resp.status_code)
        return resp.json()


async def send_message(
    conversation_id: str,
    board_id: str,
    chat_id: str,
    prompt: str,
    model: str = "claude-sonnet-4-6",
    additional_context: str = "",
) -> dict:
    """Send a message to an existing conversation."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{POPPY_API_URL}/api/conversation/{conversation_id}",
            headers=_headers(),
            params={
                "board_id": board_id,
                "chat_id": chat_id,
            },
            json={
                "prompt": prompt,
                "model": model,
                "additional_context": additional_context,
            },
        )
        if resp.status_code != 200:
            raise PoppyError(f"Failed to send message: {resp.text}", resp.status_code)
        return resp.json()


async def ask_once(
    board_id: str,
    chat_id: str,
    prompt: str,
    model: str = "claude-sonnet-4-6",
    additional_context: str = "",
) -> dict:
    """Ask a one-shot question (no conversation thread)."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{POPPY_API_URL}/api/conversation",
            headers=_headers(),
            params={
                "board_id": board_id,
                "chat_id": chat_id,
            },
            json={
                "prompt": prompt,
                "model": model,
                "additional_context": additional_context,
            },
        )
        if resp.status_code != 200:
            raise PoppyError(f"Failed to ask question: {resp.text}", resp.status_code)
        return resp.json()
