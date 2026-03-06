"""
core/hf_clients.py

Local LLM inference wrappers for KRA and ORA agents.

Provides direct llama-cpp-python inference via the `LLMEngine` singleton.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _extract_first_json_object(text: str) -> Optional[Dict[str, Any]]:
    """Best-effort JSON object extraction from imperfect model output."""
    if not text:
        return None
    text = text.strip()

    # Try direct parse first
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass

    # Try to find first { ... } block
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    candidate = m.group(0)
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


class KRAClient:
    """Local KRA inference using DeepSeek-R1 on GPU via LLMEngine."""

    def __init__(self, engine=None):
        if engine is None:
            from .llm_engine import LLMEngine
            engine = LLMEngine.instance()
        self._engine = engine

    def analyze(
        self,
        symptoms: str,
        context: str,
        retrieval_quality_label: str,
    ) -> Dict[str, Any]:
        """
        Run KRA analysis using local LLM.

        Args:
            symptoms: Packed symptoms block.
            context: FAISS-retrieved context block.
            retrieval_quality_label: Quality label from retrieval.

        Returns:
            Dict with diagnoses, uncertainties, recommended_tests, red_flags.
        """
        from .kra_prompt import build_kra_prompt

        # Parse symptoms block into components
        ecg_dict: Dict[str, Any] = {}
        labs_dict: Dict[str, Any] = {}

        prompt = build_kra_prompt(
            symptoms_text=symptoms,
            context_text=context,
            ecg_dict=ecg_dict,
            labs_dict=labs_dict,
        )

        raw = self._engine.generate_kra(prompt)

        parsed = _extract_first_json_object(raw)
        if parsed is not None:
            return parsed

        # If JSON extraction failed, return raw text in structured format
        logger.warning("KRA output was not valid JSON, wrapping as raw_text")
        return {
            "diagnoses": [],
            "uncertainties": ["KRA output was not parseable JSON"],
            "recommended_tests": [],
            "red_flags": [],
            "raw_text": raw,
        }


class ORAClient:
    """Local ORA inference using Phi-3.5-mini on CPU via LLMEngine."""

    def __init__(self, engine=None):
        if engine is None:
            from .llm_engine import LLMEngine
            engine = LLMEngine.instance()
        self._engine = engine

    def refine(
        self,
        kra_json: str,
        symptoms: str,
        experience_level: str,
    ) -> Dict[str, Any]:
        """
        Refine KRA output for the given experience level.

        Args:
            kra_json: JSON string of KRA result.
            symptoms: Original symptoms text.
            experience_level: 'NEWBIE' or 'SEASONED'.

        Returns:
            Dict with formatted_diagnosis, disclaimer.
        """
        from .ora_prompt import build_ora_prompt

        # Parse KRA JSON
        try:
            kra_result = json.loads(kra_json) if isinstance(kra_json, str) else kra_json
        except json.JSONDecodeError:
            kra_result = {"raw_text": kra_json}

        prompt = build_ora_prompt(
            kra_result=kra_result,
            symptoms_text=symptoms,
            experience_level=experience_level,
        )

        raw = self._engine.generate_ora(prompt)

        return {
            "formatted_diagnosis": raw.strip(),
            "disclaimer": (
                "⚠️ DISCLAIMER: This is an AI-assisted analysis for clinical "
                "decision support only. It is NOT a medical diagnosis."
            ),
        }
