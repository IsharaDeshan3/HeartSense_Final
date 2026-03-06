"""
backend/processing/ora_client.py

Local ORA inference client using direct local LLM calls.

Uses Phi-3.5-mini-instruct (Q4_K_M) on CPU via LLMEngine.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Valid experience levels
_VALID_LEVELS = {"NEWBIE", "SEASONED"}


class ORAClient:
    """
    Local ORA inference client.

    Uses direct calls to `LLMEngine.generate_ora()`.
    """

    def __init__(self) -> None:
        self._engine = None

    def _get_engine(self):
        if self._engine is None:
            from core.llm_engine import LLMEngine
            self._engine = LLMEngine.instance()
        return self._engine

    def refine(
        self,
        *,
        kra_result: Optional[Dict[str, Any]] = None,
        symptoms_text: str = "",
        experience_level: str = "SEASONED",
        cancel_event: Optional[threading.Event] = None,
        # Legacy kwargs (ignored but kept for backward compat)
        kra_output_id: Optional[str] = None,
        supabase_available: bool = True,
        inline_kra_result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Refine KRA output using local Phi-3.5-mini model.

        Args:
            kra_result: Raw KRA output dict.
            symptoms_text: Original patient presentation.
            experience_level: 'NEWBIE' or 'SEASONED'.
            cancel_event: Set to abort refinement.

        Returns:
            Dict with refined_output, disclaimer, status.
        """
        from core.ora_prompt import build_ora_prompt

        level = experience_level.upper()
        if level not in _VALID_LEVELS:
            logger.warning("Invalid experience_level '%s', defaulting to 'SEASONED'", experience_level)
            level = "SEASONED"

        # Handle legacy inline_kra_result kwargs
        if kra_result is None and inline_kra_result is not None:
            kra_result = inline_kra_result
        if kra_result is None:
            kra_result = {}

        prompt = build_ora_prompt(
            kra_result=kra_result,
            symptoms_text=symptoms_text,
            experience_level=level,
        )

        t0 = time.time()
        engine = self._get_engine()

        if cancel_event and cancel_event.is_set():
            raise RuntimeError("ANALYSIS_CANCELLED")

        raw_text = engine.generate_ora(
            prompt,
            cancel_event=cancel_event,
        )

        elapsed_ms = int((time.time() - t0) * 1000)
        logger.info("ORA local inference completed (%d ms, level=%s)", elapsed_ms, level)

        return {
            "refined_output": raw_text.strip(),
            "disclaimer": (
                "⚠️ DISCLAIMER: This is an AI-assisted analysis for clinical "
                "decision support only. It is NOT a medical diagnosis. All "
                "findings must be verified through clinical judgment."
            ),
            "status": "success",
        }

    def health_check(self) -> bool:
        """Return True if the local ORA model is loaded."""
        try:
            engine = self._get_engine()
            return engine.ora_model is not None
        except Exception:
            return False
