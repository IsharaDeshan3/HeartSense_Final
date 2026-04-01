"""
Remote KRA inference client using HTTP calls to a Hugging Face Space API.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from urllib.parse import urlparse
from typing import Any, Dict, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


def _try_parse_json(text: str) -> Optional[Dict[str, Any]]:
    """Best-effort JSON extraction from mixed model output."""
    text = text.strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass
    return None


def _to_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, dict):
        return [f"{key}: {value[key]}" for key in value]
    text = str(value).strip()
    return [text] if text else []


class KRAClient:
    """KRA inference client backed by a remote Hugging Face API endpoint."""

    def __init__(self) -> None:
        self._api_url = self._normalize_api_url(os.getenv("KRA_API_URL", "").strip())
        self._api_token = os.getenv("KRA_API_TOKEN", "").strip() or os.getenv("HF_TOKEN", "").strip()

        try:
            timeout_raw = os.getenv("KRA_API_TIMEOUT_SEC") or os.getenv("KRA_TIMEOUT_SEC") or "180"
            self._timeout_sec = max(5.0, float(timeout_raw))
        except ValueError:
            self._timeout_sec = 180.0

        try:
            self._context_max_chars = max(2000, int(os.getenv("KRA_CONTEXT_MAX_CHARS", "24000")))
        except ValueError:
            self._context_max_chars = 24000

        self._session = requests.Session()
        retries = Retry(
            total=2,
            connect=2,
            read=2,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=frozenset(["GET", "POST"]),
        )
        adapter = HTTPAdapter(max_retries=retries)
        self._session.mount("https://", adapter)
        self._session.mount("http://", adapter)

    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "analysis-flow-kra-client/1.0",
        }
        if self._api_token:
            headers["Authorization"] = f"Bearer {self._api_token}"
        return headers

    @staticmethod
    def _normalize_api_url(raw_url: str) -> str:
        """Normalize configured endpoint into a callable KRA analyze URL."""
        url = (raw_url or "").strip()
        if not url:
            return ""

        # If user pastes the Spaces project page URL, convert it to the app URL.
        # Example: https://huggingface.co/spaces/org/name -> https://org-name.hf.space
        spaces_match = re.match(r"https?://huggingface\.co/spaces/([^/]+)/([^/]+)/*$", url)
        if spaces_match:
            owner = spaces_match.group(1)
            space = spaces_match.group(2)
            url = f"https://{owner}-{space}.hf.space"

        parsed = urlparse(url)
        if not parsed.scheme:
            url = f"https://{url}"
            parsed = urlparse(url)

        if parsed.netloc.endswith(".hf.space") and not parsed.path.strip("/"):
            return f"{url.rstrip('/')}/v1/kra/analyze"

        if parsed.path.endswith("/v1/kra/analyze"):
            return url

        # For custom API hosts, assume root base URL unless a path already exists.
        if parsed.path.strip("/"):
            return url
        return f"{url.rstrip('/')}/v1/kra/analyze"

    def _health_url(self) -> str:
        if not self._api_url:
            return ""
        base = self._api_url.rstrip("/")
        if base.endswith("/v1/kra/analyze"):
            base = base[: -len("/v1/kra/analyze")]
        return f"{base}/health"

    @staticmethod
    def _normalize_response(payload: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize provider response to the workflow's expected KRA shape."""
        result = payload.get("result") if isinstance(payload.get("result"), dict) else payload

        diagnoses = _to_list(result.get("diagnoses"))
        uncertainties = _to_list(result.get("uncertainties"))
        if not uncertainties:
            uncertainties = _to_list(result.get("differential"))
        recommended_tests = _to_list(result.get("recommended_tests"))
        red_flags = _to_list(result.get("red_flags"))

        raw_text = str(
            result.get("raw_output")
            or result.get("raw_text")
            or payload.get("raw_text")
            or ""
        ).strip()

        if not raw_text:
            raw_text = json.dumps(result)

        # If structured fields are missing, attempt a final JSON extraction pass
        # from the raw model text before returning an invalid payload.
        if not (diagnoses and uncertainties and recommended_tests and red_flags):
            parsed = _try_parse_json(raw_text)
            if parsed:
                diagnoses = diagnoses or _to_list(parsed.get("diagnoses"))
                uncertainties = uncertainties or _to_list(parsed.get("uncertainties") or parsed.get("differential"))
                recommended_tests = recommended_tests or _to_list(parsed.get("recommended_tests"))
                red_flags = red_flags or _to_list(parsed.get("red_flags"))

        return {
            "diagnoses": diagnoses,
            "uncertainties": uncertainties,
            "recommended_tests": recommended_tests,
            "red_flags": red_flags,
            "summary": str(result.get("summary") or "").strip(),
            "raw_text": raw_text,
            "provider": "huggingface_api",
        }

    def analyze(
        self,
        *,
        symptoms_text: str,
        context_text: str,
        ecg_dict: Optional[Dict[str, Any]] = None,
        labs_dict: Optional[Dict[str, Any]] = None,
        history_summary_text: str = "",
        cancel_event: Optional[threading.Event] = None,
        # Legacy kwargs (ignored but kept for backward compat)
        payload_id: Optional[str] = None,
        temperature: Optional[float] = None,
        show_reasoning: Optional[bool] = None,
        supabase_available: bool = True,
        inline_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Run KRA analysis by posting request data to Hugging Face API."""
        if inline_payload and not symptoms_text:
            symptoms_value = inline_payload.get("symptoms") or {}
            if isinstance(symptoms_value, dict):
                symptoms_text = " ".join(str(value) for value in symptoms_value.values() if value)
            else:
                symptoms_text = str(symptoms_value)
            context_text = str(inline_payload.get("context_text") or "")
            ecg_dict = inline_payload.get("ecg") or {}
            labs_dict = inline_payload.get("labs") or {}

        if cancel_event and cancel_event.is_set():
            raise RuntimeError("ANALYSIS_CANCELLED")

        if not self._api_url:
            raise RuntimeError("KRA_API_URL_NOT_CONFIGURED")

        request_payload: Dict[str, Any] = {
            "symptoms": symptoms_text or "",
            "ecg": ecg_dict or {},
            "labs": labs_dict or {},
            "history": {
                "summary_text": history_summary_text or "",
                "retrieval_context": (context_text or "")[: self._context_max_chars],
            },
        }

        started = time.time()
        try:
            response = self._session.post(
                self._api_url,
                headers=self._headers(),
                json=request_payload,
                timeout=self._timeout_sec,
            )
        except requests.RequestException as exc:
            raise RuntimeError(f"KRA_API_REQUEST_FAILED:{exc}") from exc

        if cancel_event and cancel_event.is_set():
            raise RuntimeError("ANALYSIS_CANCELLED")

        if response.status_code >= 400:
            detail = response.text[:400]
            raise RuntimeError(f"KRA_API_HTTP_{response.status_code}:{detail}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError("KRA_API_INVALID_JSON") from exc

        result = self._normalize_response(payload)

        elapsed_ms = int((time.time() - started) * 1000)
        logger.info("KRA API inference completed (%d ms)", elapsed_ms)
        return result

    def health_check(self) -> bool:
        """Return True if KRA API appears reachable."""
        health_url = self._health_url()
        if not health_url:
            return False

        try:
            response = self._session.get(health_url, headers=self._headers(), timeout=10)
            if response.status_code == 404:
                # Some deployments expose only root path.
                base_url = health_url[: -len("/health")]
                response = self._session.get(base_url, headers=self._headers(), timeout=10)
            return response.status_code < 400
        except requests.RequestException:
            return False
