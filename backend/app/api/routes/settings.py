"""Voice Agent settings API — manage OpenRouter model and API key selection."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_admin
from app.models import User

logger = logging.getLogger("fiji-it.settings")

SETTINGS_PATH = Path(os.getenv("VOICE_AGENT_SETTINGS_PATH", "./data/voice-agent-settings.json")).expanduser()

# Possible values — kept in sync with the voice agent .env
OPENROUTER_KEYS = [
    "OPENROUTER_API_KEY",
    "OPENROUTER_API_KEY_2",
    "OPENROUTER_API_KEY_3",
    "OPENROUTER_API_KEY_4",
]

OPENROUTER_KEY_GROUPS = [
    {
        "label": "Preferred pool (Key 2 + Key 4)",
        "keys": ["OPENROUTER_API_KEY_2", "OPENROUTER_API_KEY_4"],
    },
    {
        "label": "Secondary pool (Key 1 + Key 3)",
        "keys": ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY_3"],
    },
]

NVIDIA_NIM_KEYS = [
    "NVIDIA_NIM_API_KEY",
    "NVIDIA_NIM_API_KEY_2",
    "NVIDIA_NIM_API_KEY_3",
]

PROVIDER_OPENROUTER = "openrouter"
PROVIDER_NVIDIA_NIM = "nvidia_nim"

FREE_MODELS: list[dict[str, str]] = [
    {"id": "openai/gpt-oss-120b:free", "label": "GPT-OSS 120B (OpenAI)", "provider": "openrouter"},
    {"id": "openrouter/owl-alpha", "label": "OWL Alpha", "provider": "openrouter"},
    {"id": "nvidia/nemotron-3-super-120b-a12b:free", "label": "Nemotron Super 120B", "provider": "nvidia_nim"},
    {"id": "nvidia/nemotron-3-ultra-550b-a55b:free", "label": "Nemotron Ultra 550B", "provider": "nvidia_nim"},
    {"id": "nex-agi/nex-n2-pro:free", "label": "Nex N2 Pro", "provider": "openrouter"},
    {"id": "qwen/qwen2.5-7b-instruct:free", "label": "Qwen 2.5 7B", "provider": "openrouter"},
    {"id": "poolside/laguna-m.1:free", "label": "Laguna M.1", "provider": "openrouter"},
]

DEFAULTS: dict[str, Any] = {
    "provider": PROVIDER_OPENROUTER,
    "openrouter_key_slot": "OPENROUTER_API_KEY",
    "openrouter_model": "openrouter/owl-alpha",
    "nvidia_nim_key_slot": "NVIDIA_NIM_API_KEY",
    "nvidia_nim_model": "nvidia/nemotron-3-ultra-550b-a55b:free",
}


def _load() -> dict[str, Any]:
    if SETTINGS_PATH.exists():
        try:
            data = json.loads(SETTINGS_PATH.read_text())
            # Merge with defaults so new fields always exist
            return {**DEFAULTS, **data}
        except Exception:
            logger.warning("Failed to read %s, using defaults", SETTINGS_PATH)
    return dict(DEFAULTS)


def _save(data: dict[str, Any]) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(data, indent=2))


router = APIRouter()


class VoiceAgentSettings(BaseModel):
    provider: str = PROVIDER_OPENROUTER
    openrouter_key_slot: str = "OPENROUTER_API_KEY"
    openrouter_model: str = "openrouter/owl-alpha"
    nvidia_nim_key_slot: str = "NVIDIA_NIM_API_KEY"
    nvidia_nim_model: str = "nvidia/nemotron-3-ultra-550b-a55b:free"


@router.get("/voice-agent")
async def get_voice_agent_settings(user: User = Depends(require_admin)) -> dict[str, Any]:
    cfg = _load()
    return {
        "provider": cfg.get("provider", DEFAULTS["provider"]),
        "openrouter_key_slot": cfg.get("openrouter_key_slot", DEFAULTS["openrouter_key_slot"]),
        "openrouter_model": cfg.get("openrouter_model", DEFAULTS["openrouter_model"]),
        "nvidia_nim_key_slot": cfg.get("nvidia_nim_key_slot", DEFAULTS["nvidia_nim_key_slot"]),
        "nvidia_nim_model": cfg.get("nvidia_nim_model", DEFAULTS["nvidia_nim_model"]),
        "available_keys": OPENROUTER_KEYS,
        "available_key_groups": OPENROUTER_KEY_GROUPS,
        "nvidia_nim_keys": NVIDIA_NIM_KEYS,
        "available_models": FREE_MODELS,
    }


@router.post("/voice-agent")
async def update_voice_agent_settings(body: VoiceAgentSettings, user: User = Depends(require_admin)) -> dict[str, Any]:
    if body.provider not in (PROVIDER_OPENROUTER, PROVIDER_NVIDIA_NIM):
        raise HTTPException(status_code=400, detail=f"Invalid provider: {body.provider}")
    if body.provider == PROVIDER_OPENROUTER:
        if body.openrouter_key_slot not in OPENROUTER_KEYS:
            raise HTTPException(status_code=400, detail=f"Invalid key slot: {body.openrouter_key_slot}")
        model_ids = {m["id"] for m in FREE_MODELS if m.get("provider") == PROVIDER_OPENROUTER}
        if body.openrouter_model not in model_ids:
            raise HTTPException(status_code=400, detail=f"Invalid model: {body.openrouter_model}")
    elif body.provider == PROVIDER_NVIDIA_NIM:
        if body.nvidia_nim_key_slot not in NVIDIA_NIM_KEYS:
            raise HTTPException(status_code=400, detail=f"Invalid NVIDIA key slot: {body.nvidia_nim_key_slot}")
        model_ids = {m["id"] for m in FREE_MODELS if m.get("provider") == PROVIDER_NVIDIA_NIM}
        if body.nvidia_nim_model not in model_ids:
            raise HTTPException(status_code=400, detail=f"Invalid NVIDIA model: {body.nvidia_nim_model}")
    cfg = _load()
    cfg["provider"] = body.provider
    cfg["openrouter_key_slot"] = body.openrouter_key_slot
    cfg["openrouter_model"] = body.openrouter_model
    cfg["nvidia_nim_key_slot"] = body.nvidia_nim_key_slot
    cfg["nvidia_nim_model"] = body.nvidia_nim_model
    _save(cfg)
    logger.info(
        "Voice agent settings updated → provider=%s or_key=%s or_model=%s nv_key=%s nv_model=%s",
        body.provider,
        body.openrouter_key_slot,
        body.openrouter_model,
        body.nvidia_nim_key_slot,
        body.nvidia_nim_model,
    )
    return {"status": "ok", "settings": cfg}
