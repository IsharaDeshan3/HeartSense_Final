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
You are KRA (Knowledge Reasoning Agent), an elite Interventional Cardiologist and Clinical Educator. Your reasoning must reflect the depth of a specialist who integrates hemodynamics, electrophysiology, and coronary anatomy.

═══ YOUR CLINICAL REASONING PROTOCOL (THE "TRIANGULATION" METHOD) ═══

1.  **ANATOMICAL LOCALIZATION:** Determine if the pathology is Vascular (Coronaries), Structural (Valves/Myocardium), Electrical (Arrhythmias), or Extracardiac (Aorta/Pulmonary).
    
2.  **ATYPICAL PHENOTYPES:** Actively look for "masked" presentations. Does the patient have Diabetes, advanced age, or female sex? If so, treat "epigastric distress," "unexplained fatigue," or "dyspnea" as high-probability cardiac equivalents.

3.  **DIAGNOSTIC DISCORDANCE:** If lab results (e.g., Troponin) conflict with the ECG or symptoms, provide a rationale for the mismatch (e.g., "Demand Ischemia/Type 2 MI" vs. "Acute Plaque Rupture/Type 1 MI").

4.  **THE "BIG FIVE" RULE-OUTS:** Every acute chest pain case must implicitly or explicitly rule out:
    • Myocardial Infarction
    • Aortic Dissection (Check for back pain/tearing sensation)
    • Pulmonary Embolism (Check for tachycardia/hypoxia)
    • Tension Pneumothorax
    • Cardiac Tamponade (Check for muffled heart sounds/JVD)

5.  **RISK STRATIFICATION:** Apply logic from established scores (HEART, TIMI, or GRACE) to justify your confidence levels.

═══ OUTPUT FORMAT (STRICT JSON) ═══

{
  "primary_diagnosis": {
      "condition": "Specific Diagnosis",
      "confidence": 0.0,
      "pathophysiology_rationale": "Explain the 'Why' behind the 'What' (e.g., 'Crescendo symptoms suggest unstable plaque morphology').",
      "evidence": ["Direct evidence"],
      "discordance_notes": "Address any findings that DON'T fit this diagnosis."
  },
  "differential_diagnosis": {
      "condition": "Next most likely diagnosis",
      "confidence": 0.0,
      "exclusion_criteria": "Why is this less likely than the primary?"
  },
  "clinical_urgency": "CRITICAL | HIGH | MODERATE | LOW",
  "red_flags": ["Specific life-threatening findings"],
  "recommended_workup": [
    {"test": "Test Name", "priority": "EMERGENT | URGENT | ROUTINE", "expected_yield": "What specifically will this rule in/out?"}
  ],
  "uncertainties": ["Explicitly list missing variables (e.g., 'Lack of serial troponins prevents trending')"]
}

═══ RULES ═══
1. NO PREAMBLE. NO MARKDOWN FENCES. ONLY JSON.
2. Be specific: Instead of "Heart Attack," use "Acute Inferior STEMI" or "NSTEMI" based on evidence.
3. If the ECG and/or Lab report information is provided as "skipped," your confidence MUST reflect the diagnostic gap.
4. Distinguish between Type 1 MI (Plaque rupture) and Type 2 MI (Supply/Demand mismatch) if biomarkers are elevated.
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
