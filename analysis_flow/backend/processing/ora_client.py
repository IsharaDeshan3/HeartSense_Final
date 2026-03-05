"""
backend/processing/ora_client.py

Sends a Supabase kra_output_id to the ORA HuggingFace Space via
Gradio 6.x SSE queue protocol (/gradio_api/queue/join -> /queue/data).

The ORA Space's function signature:
    fn[1] refine_from_supabase(kra_output_id, experience_level)
    -> dict {"refined_output": str, "disclaimer": str, "status": str}
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------- #
#  Config                                                                 #
# --------------------------------------------------------------------- #

_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "180"))

# Valid experience levels accepted by the ORA Space
_VALID_LEVELS = {"NEWBIE", "SEASONED", "EXPERT"}

# Gradio 6.x uses /gradio_api/ prefix for all API routes
_API_PREFIX = "/gradio_api"

# fn_index for refine_from_supabase (discovered from /config)
_FN_INDEX = 1


def _base_url() -> str:
    raw = os.getenv("ORA_ENDPOINT", "").strip().rstrip("/")
    if not raw:
        raise ValueError("ORA_ENDPOINT is not set in .env")
    return raw


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
    logger.info("ORA queued: event_id=%s", event_id)

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
                logger.info("ORA queue position: %s", msg.get("rank", "?"))
            elif msg_type == "process_starts":
                logger.info("ORA processing started")
            elif msg_type == "process_completed":
                success = msg.get("success", False)
                output = msg.get("output", {})
                output_data = output.get("data", [])
                if success and output_data:
                    return output_data[0]
                elif not success:
                    err = output.get("error") or msg.get("message", "Unknown error")
                    raise RuntimeError(f"ORA Space processing failed: {err}")
                return output.get("data", [None])[0] if output.get("data") else None
            elif msg_type == "unexpected_error":
                raise RuntimeError(f"ORA Space error: {msg.get('message', '?')}")

    raise RuntimeError("ORA SSE stream ended without results")


# --------------------------------------------------------------------- #
#  Client                                                                 #
# --------------------------------------------------------------------- #

class ORAClient:
    """
    Calls the ORA HuggingFace Space using Gradio 6.x SSE queue protocol.

    The Space's `refine_from_supabase` function:
      1. Fetches the KRA output row from Supabase by kra_output_id.
      2. Runs the ORA refinement prompt.
      3. Returns a JSON dict with 'refined_output', 'disclaimer', 'status'.
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

    def refine(
        self,
        kra_output_id: str,
        experience_level: str = "SEASONED",
    ) -> Dict[str, Any]:
        """
        Trigger ORA refinement on the HuggingFace Space.

        Args:
            kra_output_id: UUID of the `kra_outputs` Supabase row.
            experience_level: 'NEWBIE' | 'SEASONED' | 'EXPERT'

        Returns:
            Dict with keys: refined_output (str), disclaimer (str), status (str).
        """
        level = experience_level.upper()
        if level not in _VALID_LEVELS:
            logger.warning(
                "Invalid experience_level '%s', defaulting to 'SEASONED'",
                experience_level,
            )
            level = "SEASONED"

        base = _base_url()
        data = [kra_output_id, level]

        logger.info("ORA call -> %s  kra_output_id=%s  level=%s", base, kra_output_id, level)

        try:
            raw_data = _call_gradio_sse(
                base, _FN_INDEX, data, self._headers(), _TIMEOUT
            )
        except requests.Timeout:
            raise RuntimeError(
                f"ORA Space timed out after {_TIMEOUT}s. "
                "Increase REQUEST_TIMEOUT or check Space cold-start."
            )

        if raw_data is None:
            raise RuntimeError("ORA Space returned empty data")

        # ORA Space returns a JSON dict directly (gr.JSON component)
        if isinstance(raw_data, dict):
            result = raw_data
        elif isinstance(raw_data, str):
            try:
                result = json.loads(raw_data)
            except Exception:
                result = {
                    "refined_output": raw_data,
                    "disclaimer": "[!] AI-generated. Verify clinically.",
                    "status": "raw_text",
                }
        else:
            result = {
                "refined_output": str(raw_data),
                "disclaimer": "[!] AI-generated. Verify clinically.",
                "status": "unknown_format",
            }

        logger.info(
            "ORA response received (status=%s, len=%d chars)",
            result.get("status", "?"),
            len(result.get("refined_output", "")),
        )
        return result

    def health_check(self) -> bool:
        """Return True if the ORA endpoint responds to GET /config."""
        try:
            base = _base_url()
            r = requests.get(
                f"{base}/config", timeout=15, headers=self._headers()
            )
            return r.status_code == 200
        except Exception:
            return False
