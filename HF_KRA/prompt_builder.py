from __future__ import annotations

from typing import Any

from schemas import KRARequest


SYSTEM_PROMPT = """You are KRA, a clinical reasoning assistant.
Return only valid JSON with the keys:
summary, diagnoses, differential, red_flags, recommended_tests, confidence, reasoning.

Rules:
- Keep the output concise and structured.
- If evidence is weak, lower confidence.
- Do not add markdown fences.
- Do not include any extra commentary outside JSON.
"""


def _format_block(title: str, value: Any) -> str:
    if value is None:
        return f"{title}: None"
    return f"{title}: {value}"


def build_prompt(payload: KRARequest) -> str:
    """Build the model prompt from the incoming API payload."""

    parts: list[str] = [SYSTEM_PROMPT.strip(), "", "Patient Data:"]
    parts.append(_format_block("Symptoms", payload.symptoms))
    parts.append(_format_block("ECG", payload.ecg))
    parts.append(_format_block("Labs", payload.labs))
    parts.append(_format_block("History", payload.history))

    if payload.patient_context is not None:
        parts.append("")
        parts.append("Patient Context:")
        parts.append(_format_block("Patient ID", payload.patient_context.patient_id))
        parts.append(_format_block("Age", payload.patient_context.age))
        parts.append(_format_block("Sex", payload.patient_context.sex))
        parts.append(_format_block("Chief Complaint", payload.patient_context.chief_complaint))
        parts.append(_format_block("HPI", payload.patient_context.history_of_present_illness))
        parts.append(_format_block("PMH", payload.patient_context.past_medical_history))

    parts.append("")
    parts.append("Return JSON now.")
    return "\n".join(parts)
