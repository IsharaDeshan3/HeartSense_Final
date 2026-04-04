"""
hugg_backend/prompt_builder.py

Builds the same KRA prompt that the local pipeline uses, but without any
dependency on the analysis_flow codebase.  This is a self-contained copy
of the prompt template so hugg_backend stays fully independent.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional


KRA_SYSTEM_INSTRUCTION = """\
You are a cardiology differential-diagnosis assistant.

Use only the provided patient data.
Do not invent demographics, past medical history, medications, vitals, ECG findings,
lab values, exam findings, family history, smoking history, or timelines unless they
are explicitly present.

Return ONLY one valid JSON object with exactly this schema:

{
    "diagnoses": [
        {
            "condition": "Name of condition",
            "confidence": 0.0,
            "severity": "CRITICAL | HIGH | MODERATE | LOW",
            "evidence": ["specific finding from the provided data"],
            "clinical_features": ["observed symptom or feature from the provided data"]
        }
    ],
    "uncertainties": ["missing data or diagnostic uncertainty"],
    "recommended_tests": ["next test"],
    "red_flags": ["urgent concerning finding"]
}

Rules:
- Return at most 2 diagnoses, highest confidence first.
- Every diagnosis must be supported only by the provided data.
- If ECG or labs are missing, list that under uncertainties.
- If symptom data suggests plausible acute cardiac differentials, still provide cautious,
    symptom-based diagnoses rather than returning an empty diagnosis list.
- Use lower confidence when data is limited.
- Output ONLY JSON. No markdown fences. No prose before or after the JSON.
"""


def build_kra_prompt(
    *,
    symptoms_text: str,
    context_text: str,
    ecg_dict: Optional[Dict[str, Any]] = None,
    labs_dict: Optional[Dict[str, Any]] = None,
    history_summary_text: str = "",
) -> str:
    """Build a full KRA prompt string ready to send to the model."""
    ecg_text = "No ECG data provided."
    if ecg_dict and ecg_dict.get("status") not in (None, "skipped", "not_submitted"):
        ecg_text = json.dumps(ecg_dict, indent=2, default=str)

    labs_text = "No lab data provided."
    if labs_dict and labs_dict.get("status") not in (None, "skipped", "not_submitted"):
        labs_text = json.dumps(labs_dict, indent=2, default=str)

    sections: list[str] = [
        KRA_SYSTEM_INSTRUCTION,
        "PATIENT DATA:",
        f"Symptoms: {symptoms_text or 'No symptoms provided.'}",
        f"ECG: {ecg_text}",
        f"Labs: {labs_text}",
    ]

    if history_summary_text:
        sections.append(f"History: {history_summary_text}")

    if context_text:
        sections.append(f"Medical context: {context_text}")

    sections.append(
        "Return only the JSON object. If data is limited, provide cautious symptom-based cardiac differentials and list the missing information under uncertainties."
    )

    return "\n\n".join(sections)
