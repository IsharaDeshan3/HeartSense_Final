"""
core/kra_prompt.py

Builds the KRA (Knowledge Reasoning Agent) prompt for DeepSeek-R1.

The prompt instructs the model to perform structured differential
diagnosis and output valid JSON.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List


KRA_SYSTEM_INSTRUCTION = """\
You are a senior cardiologist performing a structured differential diagnosis.

You will receive:
1. Patient presentation (symptoms, history, chief complaint)
2. ECG findings (if available)
3. Lab results (if available)
4. Retrieved medical context from cardiology textbooks and case reports

Your task: Analyse ALL provided data and produce a JSON diagnosis report.

═══ OUTPUT FORMAT (strict JSON) ═══

You MUST output ONLY a valid JSON object with this exact structure:

{
  "diagnoses": [
    {
      "condition": "Name of condition",
      "confidence": 0.0 to 1.0,
      "severity": "CRITICAL" | "HIGH" | "MODERATE" | "LOW",
      "evidence": ["finding1 that supports this", "finding2", ...],
      "clinical_features": ["feature1", "feature2", ...]
    }
  ],
  "uncertainties": [
    "Reason why confidence is limited ...",
    "Missing data that would help ..."
  ],
  "recommended_tests": [
    "Test or lab that should be ordered ..."
  ],
  "red_flags": [
    "Any immediate clinical concern ..."
  ]
}

═══ RULES ═══

1. List at most 2 diagnoses, ranked by confidence (highest first).
2. Confidence must reflect how strongly the PROVIDED evidence supports the diagnosis.
   - >0.8  = strong match with multiple corroborating findings
   - 0.5-0.8 = probable but missing confirmatory data
   - <0.5  = possible but insufficient evidence
3. Every diagnosis MUST cite specific evidence from the patient data.
4. If ECG or labs are missing, state this as an uncertainty.
5. Red flags = findings that need IMMEDIATE clinical attention.
6. Recommended tests = what would raise or lower confidence.
7. Base your analysis ONLY on the provided data — do not fabricate findings.
8. Use the retrieved medical context to inform your differential but do not
   simply copy it; reason about how it applies to THIS patient.
9. Output ONLY the JSON object. No markdown, no explanation, no preamble.
"""


def build_kra_prompt(
    *,
    symptoms_text: str,
    context_text: str,
    ecg_dict: Dict[str, Any],
    labs_dict: Dict[str, Any],
  history_summary_text: str = "",
) -> str:
    """
    Build the full KRA prompt from patient data and retrieved context.

    Args:
        symptoms_text: Free-text patient presentation.
        context_text: FAISS-retrieved medical context.
        ecg_dict: ECG findings dict (may be empty or {"status": "skipped"}).
        labs_dict: Lab results dict (may be empty or {"status": "skipped"}).

    Returns:
        Complete prompt string ready for LLM inference.
    """
    sections = [KRA_SYSTEM_INSTRUCTION, ""]

    # Patient presentation
    sections.append("═══ PATIENT PRESENTATION ═══")
    sections.append(symptoms_text.strip())
    sections.append("")

    # ECG
    sections.append("═══ ECG FINDINGS ═══")
    if ecg_dict and ecg_dict.get("status") != "skipped" and len(ecg_dict) > 1:
        sections.append(json.dumps(ecg_dict, indent=2, ensure_ascii=False))
    else:
        sections.append("[ECG not performed or not available]")
    sections.append("")

    # Labs
    sections.append("═══ LAB RESULTS ═══")
    if labs_dict and labs_dict.get("status") != "skipped" and len(labs_dict) > 1:
        sections.append(json.dumps(labs_dict, indent=2, ensure_ascii=False))
    else:
        sections.append("[Lab results not available]")
    sections.append("")

    # Longitudinal history
    sections.append("═══ PRIOR LONGITUDINAL HISTORY ═══")
    if history_summary_text.strip():
      sections.append(history_summary_text.strip())
    else:
      sections.append("[No prior AI diagnosis or lab history available]")
    sections.append("")

    # Retrieved context
    sections.append("═══ RETRIEVED MEDICAL CONTEXT ═══")
    if context_text.strip():
        sections.append(context_text.strip())
    else:
        sections.append("[No relevant context retrieved]")
    sections.append("")

    sections.append("═══ INSTRUCTION ═══")
    sections.append(
        "Now analyse the patient data above. Output ONLY the JSON diagnosis "
        "report as specified. No other text."
    )

    return "\n".join(sections)
