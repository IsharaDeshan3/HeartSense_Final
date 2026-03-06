"""
backend/processing/kra_client.py

Local KRA inference client using direct local LLM calls.

Uses DeepSeek-R1-Distill-Llama-8B (Q5_K_M) on GPU via LLMEngine.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _try_parse_json(text: str) -> Optional[Dict[str, Any]]:
    """Best-effort JSON extraction from mixed model output."""
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


class KRAClient:
    """
    Local KRA inference client.

    Uses direct calls to `LLMEngine.generate_kra()`.
    """

    def __init__(self) -> None:
        # Engine will be initialised lazily on first call
        self._engine = None

    def _get_engine(self):
        if self._engine is None:
            from core.llm_engine import LLMEngine
            self._engine = LLMEngine.instance()
        return self._engine

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
        """
        Run KRA analysis using local DeepSeek-R1 model.

        Args:
            symptoms_text: Packed patient presentation text.
            context_text: FAISS-retrieved medical context.
            ecg_dict: ECG findings dict (or None/empty).
            labs_dict: Lab results dict (or None/empty).
            cancel_event: Set to abort analysis.

        Returns:
            Dict with at least {"raw_text": str} and parsed fields.
        """
        from core.kra_prompt import build_kra_prompt

        # Handle legacy inline_payload mode
        if inline_payload and not symptoms_text:
            s = inline_payload.get("symptoms") or {}
            symptoms_text = " ".join(str(v) for v in s.values() if v) if isinstance(s, dict) else str(s)
            context_text = inline_payload.get("context_text", "")
            ecg_dict = inline_payload.get("ecg") or {}
            labs_dict = inline_payload.get("labs") or {}

        prompt = build_kra_prompt(
            symptoms_text=symptoms_text,
            context_text=context_text,
            ecg_dict=ecg_dict or {},
            labs_dict=labs_dict or {},
            history_summary_text=history_summary_text or "",
        )

        t0 = time.time()
        engine = self._get_engine()

        if cancel_event and cancel_event.is_set():
            raise RuntimeError("ANALYSIS_CANCELLED")

        raw_text = engine.generate_kra(
            prompt,
            temperature=temperature,
            cancel_event=cancel_event,
        )

        elapsed_ms = int((time.time() - t0) * 1000)
        logger.info("KRA local inference completed (%d ms, %d chars)", elapsed_ms, len(raw_text))

        result: Dict[str, Any] = {"raw_text": raw_text}

        parsed = _try_parse_json(raw_text)
        if parsed:
            result.update(parsed)
        else:
            logger.warning("KRA output was not valid JSON (%d chars)", len(raw_text))

        return result

    def health_check(self) -> bool:
        """Return True if the local KRA model is loaded."""
        try:
            engine = self._get_engine()
            return engine.kra_model is not None
        except Exception:
            return False
