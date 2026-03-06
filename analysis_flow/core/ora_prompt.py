"""
core/ora_prompt.py

Builds the ORA (Output Refinement Agent) prompt for Phi-3.5-mini.

Takes raw KRA JSON output + experience level and produces a
clinician-facing formatted report.

Supported levels: NEWBIE, SEASONED
"""

from __future__ import annotations

import json
from typing import Any, Dict


_SHARED_RULES = """\
RULES:
1. Base your output ONLY on the KRA analysis provided — do NOT invent findings.
2. If a diagnosis has low confidence, communicate this honestly.
3. Always include the disclaimer at the end.
4. Output the formatted report as plain text. No JSON, no markdown code fences.
"""

_DISCLAIMER = (
    "⚠️ DISCLAIMER: This is an AI-assisted analysis for clinical decision "
    "support only. It is NOT a medical diagnosis. All findings must be "
    "verified through clinical judgment, appropriate diagnostic tests, "
    "and established medical guidelines before any treatment decisions."
)

# ── Experience-level-specific instructions ──────────────────────────────── #

_NEWBIE_INSTRUCTIONS = f"""\
You are a medical educator creating a diagnostic report for a JUNIOR DOCTOR
or medical student (newbie level).

Your goal: Make the diagnosis understandable to someone with basic medical
knowledge but limited clinical experience.

FORMAT YOUR OUTPUT LIKE THIS:

📋 DIAGNOSTIC SUMMARY
---------------------
[1-2 sentence overview in plain language]

🔍 WHAT WE FOUND
-----------------
For each diagnosis:
  • [Condition Name] — Likelihood: [High/Moderate/Low]
    What this means: [Plain-language explanation of the condition]
    Why we think this: [Evidence in simple terms]
    Severity: [CRITICAL/HIGH/MODERATE/LOW] — [What this severity level means]

⚠️ RED FLAGS
-------------
[List any immediate concerns in plain language]
[Explain WHY each is concerning]

📝 WHAT'S MISSING
------------------
[List uncertainties]
[Explain what information would help and why]

🧪 RECOMMENDED NEXT STEPS
--------------------------
[Numbered list of recommended tests/actions]
[Brief explanation of what each test tells us]

---
{_DISCLAIMER}

{_SHARED_RULES}
"""

_SEASONED_INSTRUCTIONS = f"""\
You are a senior cardiologist writing a concise diagnostic report for an
EXPERIENCED CLINICIAN (seasoned level).

Your goal: Deliver a clinical-grade report using standard medical terminology,
suitable for a physician with several years of practice.

FORMAT YOUR OUTPUT LIKE THIS:

DIFFERENTIAL DIAGNOSIS
─────────────────────
1. [Condition] (confidence: [X]%, severity: [LEVEL])
   Evidence: [Concise clinical evidence list]
   Clinical features: [Key features]

2. [Condition] ...

CLINICAL CONCERNS
─────────────────
• [Red flag findings with clinical significance]

DIAGNOSTIC GAPS
───────────────
• [Missing data / uncertainties with impact on differential]

RECOMMENDED WORKUP
──────────────────
• [Tests ordered by clinical priority]
• [Expected diagnostic yield for each]

---
{_DISCLAIMER}

{_SHARED_RULES}
"""

_LEVEL_MAP = {
    "NEWBIE": _NEWBIE_INSTRUCTIONS,
    "SEASONED": _SEASONED_INSTRUCTIONS,
}


def build_ora_prompt(
    *,
    kra_result: Dict[str, Any],
    symptoms_text: str,
    experience_level: str,
) -> str:
    """
    Build the ORA refinement prompt.

    Args:
        kra_result: Raw KRA output dict (diagnoses, uncertainties, etc.).
        symptoms_text: Original patient presentation text.
        experience_level: 'NEWBIE' or 'SEASONED'.

    Returns:
        Complete prompt string for ORA LLM inference.
    """
    level = experience_level.upper()
    instructions = _LEVEL_MAP.get(level, _SEASONED_INSTRUCTIONS)

    kra_json_str = json.dumps(kra_result, indent=2, ensure_ascii=False)

    sections = [
        instructions,
        "",
        "═══ ORIGINAL PATIENT PRESENTATION ═══",
        symptoms_text.strip(),
        "",
        "═══ KRA ANALYSIS (raw JSON) ═══",
        kra_json_str,
        "",
        "═══ INSTRUCTION ═══",
        f"Reformat the KRA analysis above into the {level}-level report format. "
        "Output ONLY the formatted report. No JSON, no code blocks.",
    ]

    return "\n".join(sections)
