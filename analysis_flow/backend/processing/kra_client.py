"""
backend/processing/kra_client.py

Sends a Supabase payload_id to the KRA HuggingFace Space via
Gradio 6.x SSE queue protocol (/gradio_api/queue/join → /queue/data).

The KRA Space's function signature (fn_index=0):
    analyze_from_supabase(payload_id, temperature, show_reasoning)
    -> string (Markdown diagnostic report)

Note: model_choice was removed from the Space; the model is always
Phi-3-mini-4k-instruct (configured via the HF Space secret HF_MODEL).

Fallback: when supabase_available=False or the Space is unreachable,
KRAAgent(use_local=True) is called directly to keep the pipeline alive.
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

from agents.kra_agent import KRAAgent

load_dotenv(find_dotenv())
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------- #
#  Config                                                                 #
# --------------------------------------------------------------------- #

_TEMPERATURE    = float(os.getenv("KRA_TEMPERATURE", "0.6"))
_SHOW_REASONING = os.getenv("KRA_SHOW_REASONING", "false").lower() == "true"
_TIMEOUT        = int(os.getenv("REQUEST_TIMEOUT", "180"))
_MAX_RETRIES    = int(os.getenv("KRA_MAX_RETRIES", "3"))   # Gradio SSE retries

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
    Call a Gradio 6.x function via the HTTP SSE queue protocol with retries.
    POST /gradio_api/queue/join -> GET /gradio_api/queue/data (SSE)
    """
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(1, _MAX_RETRIES + 1):
        session_hash = hashlib.md5(f"{time.time()}-{attempt}".encode()).hexdigest()[:11]
        try:
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
            logger.info("KRA queued (attempt %d/%d): event_id=%s", attempt, _MAX_RETRIES, event_id)

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

        except (RuntimeError, requests.RequestException, OSError) as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES:
                sleep_time = 2 ** (attempt - 1)  # 1s, 2s, 4s ...
                logger.warning("KRA attempt %d/%d failed: %s – retrying in %ds", attempt, _MAX_RETRIES, exc, sleep_time)
                time.sleep(sleep_time)
            else:
                logger.error("KRA all %d attempts exhausted: %s", _MAX_RETRIES, exc)
    raise last_exc


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
        temperature: Optional[float] = None,
        show_reasoning: Optional[bool] = None,
        supabase_available: bool = True,
        inline_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Trigger KRA inference on the HuggingFace Space.

        Args:
            payload_id: UUID of the `analysis_payloads` Supabase row.
            temperature: Sampling temperature 0.1-1.0 (optional).
            show_reasoning: Whether to include chain-of-thought (optional).
            supabase_available: When False, skip HF Space and run KRAAgent locally.
            inline_payload: Raw payload dict for local-fallback mode.

        Returns:
            Dict with at least {"raw_text": str}.
        """
        # ── Offline mode: run KRAAgent directly, no HF Space call ────────────
        if not supabase_available or not os.getenv("KRA_ENDPOINT", "").strip():
            logger.warning("KRA offline fallback: running KRAAgent locally for payload=%s", payload_id)
            try:
                agent = KRAAgent(use_local=True)
                symptoms_text = ""
                if inline_payload:
                    s = inline_payload.get("symptoms") or {}
                    symptoms_text = " ".join(
                        str(v) for v in s.values() if v
                    ) if isinstance(s, dict) else str(s)
                raw_text = agent.analyze(
                    symptoms_text=symptoms_text,
                    context_text=inline_payload.get("context_text", "") if inline_payload else "",
                    ecg_findings=(inline_payload.get("ecg") or {}).get("findings", []) if inline_payload else [],
                    lab_values=(inline_payload.get("labs") or {}) if inline_payload else {},
                )
                if isinstance(raw_text, dict):
                    return raw_text
                return {"raw_text": str(raw_text)}
            except Exception as fallback_exc:
                logger.error("KRA local fallback also failed: %s", fallback_exc)
                return {"raw_text": f"[KRA offline fallback failed: {fallback_exc}]", "status": "fallback_error"}

        base = _base_url()
        # 3-argument call: payload_id, temperature, show_reasoning (model_choice removed)
        data = [
            payload_id,
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
