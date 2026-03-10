"""
hugg_backend/hf_client.py

Hugging Face Space client.

Uses the Gradio API exposed by the deployed Space, which matches the
app.py pattern where the inference button is registered with
api_name="generate".
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv
from gradio_client import Client

load_dotenv()
logger = logging.getLogger(__name__)


def get_hf_token() -> str:
    for env_name in (
        "HF_TOKEN",
        "HUGGINGFACEHUB_API_TOKEN",
        "HUGGINGFACE_API_TOKEN",
    ):
        token = os.getenv(env_name, "").strip()
        if token:
            return token
    return ""


_HF_TOKEN = get_hf_token()
_SPACE_URL = os.getenv("KRA_SPACE_URL", "").rstrip("/")
_SPACE_API_NAME = os.getenv("KRA_SPACE_API_NAME", "/generate")
_TIMEOUT = int(os.getenv("HF_INFERENCE_TIMEOUT", "300"))
_MAX_NEW_TOKENS = int(os.getenv("HF_MAX_NEW_TOKENS", "768"))
_TEMPERATURE = float(os.getenv("HF_TEMPERATURE", "0.2"))


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Best-effort JSON extraction from model output."""
    if not text:
        return None
    text = text.strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            parsed = json.loads(m.group(0))
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass
    return None


async def call_hf_space(prompt: str) -> Dict[str, Any]:
    """
    Send a prompt to the configured Hugging Face Space and return
    the parsed KRA JSON result.

    Primary strategy:
      1. Gradio client call to api_name=/generate

    Fallback strategies:
      2. POST /api/generate
      3. POST /generate
      4. HF Inference API style
    """
    if not _SPACE_URL:
        raise RuntimeError(
            "KRA_SPACE_URL is not configured. "
            "Set it in hugg_backend/.env to your HF Space URL."
        )

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if _HF_TOKEN:
        headers["Authorization"] = f"Bearer {_HF_TOKEN}"

    raw_text = ""

    # Strategy 1: Call the Gradio event API directly using gradio_client.
    try:
        def _predict() -> Any:
            client = Client(_SPACE_URL, token=_HF_TOKEN or None)
            return client.predict(
                prompt,
                _MAX_NEW_TOKENS,
                _TEMPERATURE,
                api_name=_SPACE_API_NAME,
            )

        result = await asyncio.to_thread(_predict)
        if isinstance(result, tuple):
            raw_text = next((item for item in result if isinstance(item, str) and item.strip()), "")
        elif isinstance(result, str):
            raw_text = result
        elif result is not None:
            raw_text = json.dumps(result)

        if raw_text:
            logger.info("HF Space gradio_client %s returned %d chars", _SPACE_API_NAME, len(raw_text))
    except Exception as exc:
        logger.warning("HF Space gradio_client %s failed: %s", _SPACE_API_NAME, exc)

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # Strategy 2: Try /api/generate for custom FastAPI mounting.
        if not raw_text:
            try:
                resp = await client.post(
                    f"{_SPACE_URL}/api/generate",
                    json={"prompt": prompt, "max_tokens": _MAX_NEW_TOKENS, "temperature": _TEMPERATURE},
                    headers=headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    raw_text = data.get("generated_text") or data.get("text") or data.get("output") or json.dumps(data)
                    logger.info("HF Space /api/generate returned %d chars", len(raw_text))
                else:
                    logger.warning("HF Space /api/generate returned %d", resp.status_code)
            except Exception as exc:
                logger.warning("HF Space /api/generate failed: %s", exc)

        # Strategy 3: Try /generate.
        if not raw_text:
            try:
                resp = await client.post(
                    f"{_SPACE_URL}/generate",
                    json={"prompt": prompt, "max_tokens": _MAX_NEW_TOKENS, "temperature": _TEMPERATURE},
                    headers=headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    raw_text = data.get("generated_text") or data.get("text") or data.get("output") or json.dumps(data)
                    logger.info("HF Space /generate returned %d chars", len(raw_text))
            except Exception as exc:
                logger.warning("HF Space /generate failed: %s", exc)

        # Strategy 4: Try HF Inference API style.
        if not raw_text:
            try:
                resp = await client.post(
                    _SPACE_URL,
                    json={"inputs": prompt, "parameters": {"max_new_tokens": _MAX_NEW_TOKENS, "temperature": _TEMPERATURE}},
                    headers=headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and data:
                        raw_text = data[0].get("generated_text", "")
                    elif isinstance(data, dict):
                        raw_text = data.get("generated_text") or data.get("text") or json.dumps(data)
                    logger.info("HF Inference API returned %d chars", len(raw_text))
            except Exception as exc:
                logger.warning("HF Inference API call failed: %s", exc)

    if not raw_text:
        raise RuntimeError(
            f"All HF inference strategies failed for {_SPACE_URL}. "
            "Check that the Space is running and the URL/token are correct."
        )

    parsed = _extract_json(raw_text)
    return {
        "raw_text": raw_text,
        "kra_result": parsed,
        "source": "huggingface_space",
        "space_url": _SPACE_URL,
    }
