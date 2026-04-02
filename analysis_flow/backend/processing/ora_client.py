"""
Remote ORA refinement client using Gemini API calls.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Dict, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

_VALID_LEVELS = {"NEWBIE", "SEASONED"}

_PROMPT_LEAK_MARKERS = (
    "RULES:",
    "Internal authoring constraints",
    "═══ INPUT DATA ═══",
    "PATIENT PRESENTATION:",
    "KRA ANALYSIS:",
    "═══ TASK ═══",
)


def _sanitize_refined_output(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return cleaned

    cleaned = cleaned.replace("```markdown", "").replace("```", "").strip()

    if any(marker in cleaned for marker in _PROMPT_LEAK_MARKERS):
        anchors = [
            "# CLINICAL ASSESSMENT BRIEF",
            "## 📋 DIAGNOSTIC SUMMARY",
            "### 🩺 DIFFERENTIAL DIAGNOSIS",
            "**Overview:**",
        ]
        anchor_positions = [cleaned.find(anchor) for anchor in anchors if cleaned.find(anchor) >= 0]
        if anchor_positions:
            cleaned = cleaned[min(anchor_positions):].strip()
        else:
            filtered_lines: list[str] = []
            for line in cleaned.splitlines():
                stripped = line.strip()
                if not stripped:
                    filtered_lines.append(line)
                    continue
                if any(stripped.startswith(marker) for marker in _PROMPT_LEAK_MARKERS):
                    continue
                if stripped.startswith(tuple(f"{i}." for i in range(1, 10))):
                    continue
                filtered_lines.append(line)
            cleaned = "\n".join(filtered_lines).strip()

    return cleaned


def _extract_gemini_text(payload: Dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return ""

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content") or {}
        parts = content.get("parts") or []
        text_chunks: list[str] = []
        for part in parts:
            if isinstance(part, dict):
                chunk = str(part.get("text") or "").strip()
                if chunk:
                    text_chunks.append(chunk)
        if text_chunks:
            return "\n".join(text_chunks).strip()

    return ""


class ORAClient:
    """ORA refinement client backed by Google Gemini API."""

    def __init__(self) -> None:
        self._api_keys = self._load_api_keys()
        self._key_index = 0
        self._key_lock = threading.Lock()
        self._model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip()
        self._api_base = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")

        try:
            timeout_raw = os.getenv("ORA_GEMINI_TIMEOUT_SEC") or os.getenv("ORA_TIMEOUT_SEC") or "120"
            self._timeout_sec = max(5.0, float(timeout_raw))
        except ValueError:
            self._timeout_sec = 120.0

        try:
            self._temperature = float(os.getenv("ORA_GEMINI_TEMPERATURE", "0.2"))
        except ValueError:
            self._temperature = 0.2

        try:
            self._top_p = float(os.getenv("ORA_GEMINI_TOP_P", "0.9"))
        except ValueError:
            self._top_p = 0.9

        try:
            self._max_output_tokens = max(256, int(os.getenv("ORA_GEMINI_MAX_OUTPUT_TOKENS", "2048")))
        except ValueError:
            self._max_output_tokens = 2048

        self._session = requests.Session()
        # Disable implicit HTTP retries for POST so request latency stays predictable.
        adapter = HTTPAdapter(max_retries=Retry(total=0, connect=0, read=0, status=0))
        self._session.mount("https://", adapter)
        self._session.mount("http://", adapter)

    @staticmethod
    def _load_api_keys() -> list[str]:
        """Load Gemini keys from env with stable order and duplicate filtering."""
        raw_values: list[str] = []

        key_list_env = os.getenv("GEMINI_API_KEYS", "").strip()
        if key_list_env:
            raw_values.extend(part.strip() for part in key_list_env.split(","))

        raw_values.extend(
            [
                os.getenv("GEMINI_API_KEY", "").strip(),
                os.getenv("GEMINI_API_KEY_2", "").strip(),
            ]
        )

        deduped: list[str] = []
        seen: set[str] = set()
        for value in raw_values:
            if not value or value in seen:
                continue
            deduped.append(value)
            seen.add(value)
        return deduped

    def _next_api_key(self) -> str:
        """Round-robin key selection; safe across concurrent ORA calls."""
        with self._key_lock:
            if not self._api_keys:
                return ""
            key = self._api_keys[self._key_index % len(self._api_keys)]
            self._key_index += 1
            return key

    def _generate_url(self) -> str:
        return f"{self._api_base}/models/{self._model}:generateContent"

    def _model_url(self) -> str:
        return f"{self._api_base}/models/{self._model}"

    def refine(
        self,
        *,
        kra_input: Optional[Dict[str, Any]] = None,
        kra_result: Optional[Dict[str, Any]] = None,
        symptoms_text: str = "",
        experience_level: str = "SEASONED",
        cancel_event: Optional[threading.Event] = None,
        # Legacy kwargs (ignored but kept for backward compat)
        kra_output_id: Optional[str] = None,
        supabase_available: bool = True,
        inline_kra_result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Refine KRA output by calling Gemini generateContent API."""
        from core.ora_prompt import build_ora_prompt

        level = experience_level.upper()
        if level not in _VALID_LEVELS:
            logger.warning("Invalid experience_level '%s', defaulting to 'SEASONED'", experience_level)
            level = "SEASONED"

        if kra_result is None and inline_kra_result is not None:
            kra_result = inline_kra_result
        if kra_result is None:
            kra_result = {}
        if kra_input is None:
            kra_input = {}

        if cancel_event and cancel_event.is_set():
            raise RuntimeError("ANALYSIS_CANCELLED")

        if not self._api_keys:
            raise RuntimeError("GEMINI_API_KEY_NOT_CONFIGURED")

        prompt = build_ora_prompt(
            kra_input=kra_input,
            kra_result=kra_result,
            symptoms_text=symptoms_text,
            experience_level=level,
        )

        request_body: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": self._temperature,
                "topP": self._top_p,
                "maxOutputTokens": self._max_output_tokens,
            },
        }

        started = time.time()
        attempt_errors: list[str] = []
        response_payload: Dict[str, Any] | None = None
        raw_text = ""

        for attempt in range(len(self._api_keys)):
            api_key = self._next_api_key()
            if not api_key:
                break

            try:
                response = self._session.post(
                    self._generate_url(),
                    params={"key": api_key},
                    headers={"User-Agent": "analysis-flow-ora-client/1.0"},
                    json=request_body,
                    timeout=self._timeout_sec,
                )
            except requests.Timeout as exc:
                attempt_errors.append(f"attempt_{attempt + 1}:timeout:{exc}")
                continue
            except requests.RequestException as exc:
                attempt_errors.append(f"attempt_{attempt + 1}:request_failed:{exc}")
                continue

            if cancel_event and cancel_event.is_set():
                raise RuntimeError("ANALYSIS_CANCELLED")

            if response.status_code in {429, 500, 502, 503, 504}:
                detail = response.text[:160].replace("\n", " ")
                attempt_errors.append(f"attempt_{attempt + 1}:http_{response.status_code}:{detail}")
                continue
            if response.status_code >= 400:
                detail = response.text[:500]
                raise RuntimeError(f"ORA_GEMINI_HTTP_{response.status_code}:{detail}")

            try:
                response_payload = response.json()
            except ValueError as exc:
                attempt_errors.append(f"attempt_{attempt + 1}:invalid_json")
                continue

            raw_text = _extract_gemini_text(response_payload)
            if raw_text:
                break

            attempt_errors.append(f"attempt_{attempt + 1}:empty_output")

        if cancel_event and cancel_event.is_set():
            raise RuntimeError("ANALYSIS_CANCELLED")

        if not raw_text:
            error_preview = " | ".join(attempt_errors[:3])
            if error_preview:
                raise RuntimeError(f"ORA_GEMINI_RETRY_EXHAUSTED:{error_preview}")
            raise RuntimeError("ORA_OUTPUT_EMPTY")

        elapsed_ms = int((time.time() - started) * 1000)
        logger.info(
            "ORA Gemini refinement completed (%d ms, level=%s, attempts=%d)",
            elapsed_ms,
            level,
            len(attempt_errors) + 1,
        )

        return {
            "refined_output": _sanitize_refined_output(raw_text),
            "disclaimer": (
                "⚠️ DISCLAIMER: This is an AI-assisted analysis for clinical "
                "decision support only. It is NOT a medical diagnosis. All "
                "findings must be verified through clinical judgment."
            ),
            "status": "success",
        }

    def health_check(self) -> bool:
        """Return True if Gemini model endpoint is reachable."""
        if not self._api_keys:
            return False

        for api_key in self._api_keys:
            try:
                response = self._session.get(
                    self._model_url(),
                    params={"key": api_key},
                    timeout=10,
                )
                if response.status_code < 400:
                    return True
            except requests.RequestException:
                continue
        return False
