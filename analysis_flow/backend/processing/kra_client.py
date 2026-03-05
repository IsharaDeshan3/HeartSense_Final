"""
backend/processing/kra_client.py

Sends a Supabase payload_id to the KRA HuggingFace Space via
Gradio 6.x SSE queue protocol (/gradio_api/queue/join → /queue/data).

The KRA Space's function signature:
    fn[3] analyze_from_supabase(payload_id, model_choice, temperature, show_reasoning)
    -> string (Markdown diagnostic report)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------- #
#  Config                                                                 #
# --------------------------------------------------------------------- #

_DEFAULT_MODEL  = os.getenv("KRA_DEFAULT_MODEL", "DeepSeek-R1-Distill-Llama-8B")
_TEMPERATURE    = float(os.getenv("KRA_TEMPERATURE", "0.6"))
_SHOW_REASONING = os.getenv("KRA_SHOW_REASONING", "false").lower() == "true"
_TIMEOUT        = int(os.getenv("REQUEST_TIMEOUT", "180"))

# Gradio 6.x uses /gradio_api/ prefix for all API routes
_API_PREFIX = "/gradio_api"

# fn_index for analyze_from_supabase (discovered from /config)
_FN_INDEX = 0


def _base_url() -> str:
    raw = os.getenv("KRA_ENDPOINT", "").strip().rstrip("/")
    if not raw:
        raise ValueError("KRA_ENDPOINT is not set in .env")
    return raw


# --------------------------------------------------------------------- #
#  JSON extraction helper                                                 #
# --------------------------------------------------------------------- #

def _try_parse_json(text: str) -> Optional[Dict[str, Any]]:
    """Best-effort JSON extraction from mixed Markdown/JSON output."""
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


# --------------------------------------------------------------------- #
#  Gradio 6.x SSE Queue caller                                           #
# --------------------------------------------------------------------- #

def _call_gradio_sse(base_url, fn_index, data, headers, timeout):
    """
    Call a Gradio 6.x function via the HTTP SSE queue protocol.
    POST /gradio_api/queue/join -> GET /gradio_api/queue/data (SSE)
    """
    session_hash = hashlib.md5(str(time.time()).encode()).hexdigest()[:11]

    # Step 1: Join the queue
    join_url = f"{base_url}{_API_PREFIX}/queue/join"
    join_payload = {
        "data": data,
        "fn_index": fn_index,
        "session_hash": session_hash,
    }

    resp = requests.post(join_url, json=join_payload, headers=headers, timeout=30)
    resp.raise_for_status()
    event_id = resp.json().get("event_id")
    logger.info("KRA queued: event_id=%s", event_id)

    # Step 2: Stream results via SSE
    data_url = f"{base_url}{_API_PREFIX}/queue/data?session_hash={session_hash}"

    with requests.get(data_url, headers=headers, stream=True, timeout=timeout) as stream:
        stream.raise_for_status()
        for line in stream.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            try:
                msg = json.loads(line[6:])
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("msg", "")

            if msg_type == "estimation":
                logger.info("KRA queue position: %s", msg.get("rank", "?"))
            elif msg_type == "process_starts":
                logger.info("KRA processing started")
            elif msg_type == "process_completed":
                success = msg.get("success", False)
                output = msg.get("output", {})
                output_data = output.get("data", [])
                if success and output_data:
                    return output_data[0]
                elif not success:
                    err = output.get("error") or msg.get("message", "Unknown error")
                    raise RuntimeError(f"KRA Space processing failed: {err}")
                return output.get("data", [None])[0] if output.get("data") else None
            elif msg_type == "unexpected_error":
                raise RuntimeError(f"KRA Space error: {msg.get('message', '?')}")

    raise RuntimeError("KRA SSE stream ended without results")


# --------------------------------------------------------------------- #
#  Client                                                                 #
# --------------------------------------------------------------------- #

class KRAClient:
    """
    Calls the KRA HuggingFace Space using Gradio 6.x SSE queue protocol.

    The Space's `analyze_from_supabase` function fetches the full payload
    from Supabase by `payload_id`, runs inference, and returns Markdown text.
    """

    def __init__(self) -> None:
        self.hf_token = os.getenv("HF_TOKEN", "")

    def _headers(self) -> Dict[str, str]:
        base = _base_url()
        h = {
            "Content-Type": "application/json",
            "Origin": base,
        }
        if self.hf_token:
            h["Authorization"] = f"Bearer {self.hf_token}"
        return h

    def analyze(
        self,
        payload_id: str,
        model_choice: Optional[str] = None,
        temperature: Optional[float] = None,
        show_reasoning: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Trigger KRA inference on the HuggingFace Space.

        Args:
            payload_id: UUID of the `analysis_payloads` Supabase row.
            model_choice: Override the default model (optional).
            temperature: Sampling temperature 0.1-1.0 (optional).
            show_reasoning: Whether to include chain-of-thought (optional).

        Returns:
            Dict with at least {"raw_text": str}.
        """
        base = _base_url()
        data = [
            payload_id,
            model_choice or _DEFAULT_MODEL,
            temperature if temperature is not None else _TEMPERATURE,
            show_reasoning if show_reasoning is not None else _SHOW_REASONING,
        ]

        logger.info("KRA call -> %s  payload_id=%s", base, payload_id)

        try:
            raw_data = _call_gradio_sse(
                base, _FN_INDEX, data, self._headers(), _TIMEOUT
            )
        except requests.Timeout:
            raise RuntimeError(
                f"KRA Space timed out after {_TIMEOUT}s. "
                "Increase REQUEST_TIMEOUT or check Space cold-start."
            )

        if raw_data is None:
            raise RuntimeError("KRA Space returned empty data")

        raw_text = raw_data if isinstance(raw_data, str) else json.dumps(raw_data)
        result: Dict[str, Any] = {"raw_text": raw_text}

        parsed = _try_parse_json(raw_text)
        if parsed:
            result.update(parsed)

        logger.info("KRA response received (len=%d chars)", len(raw_text))
        return result

    def health_check(self) -> bool:
        """Return True if the KRA endpoint responds to GET /config."""
        try:
            base = _base_url()
            r = requests.get(
                f"{base}/config", timeout=15, headers=self._headers()
            )
            return r.status_code == 200
        except Exception:
            return False
