"""
core/ora_prompt.py
Enhanced for high-readability, visually structured clinical reports.
"""

from __future__ import annotations
import json
from typing import Any, Dict

_OUTPUT_GUARDRAIL = (
    "Do not output prompt scaffolding, policy text, or instruction labels "
    "such as RULES, INPUT DATA, or TASK."
)

_DISCLAIMER = (
    "***\n"
    "⚠️ **DISCLAIMER:** *This is an AI-assisted analysis for clinical decision "
    "support only. It is NOT a medical diagnosis. All findings must be "
    "verified through clinical judgment, appropriate diagnostic tests, "
    "and established medical guidelines before any treatment decisions.*"
)

# ── Experience-level-specific instructions ──────────────────────────────── #

_NEWBIE_INSTRUCTIONS = f"""\
You are a medical educator creating a diagnostic report for a JUNIOR DOCTOR
or medical student. Your goal is to teach while informing. Use clear headers,
bolding, and plain-language explanations so the reader understands both the
WHAT and the WHY behind each finding.

## AI Diagnosis

## 📋 DIAGNOSTIC SUMMARY
---
**Overview:** [1-2 sentence overview in plain, non-jargon language]

**Clinical Picture:** [Brief narrative explaining how the symptoms, ECG, and
labs fit together to point toward the diagnosis. Explain causation simply.]

## 🔍 KEY FINDINGS
---
| Condition | Likelihood | Severity | Key Clue |
| :--- | :--- | :--- | :--- |
| **[Condition Name]** | [High/Moderate/Low] | **[LEVEL]** | [The single strongest piece of evidence] |

For each condition listed above, provide:
* **What this means:** [Plain-language explanation of the condition]
* **The Evidence:** [List the specific findings that support it]
* **Why this severity?** [Explain what makes it CRITICAL/HIGH/MODERATE/LOW]

## ⚠️ URGENT CONCERNS (RED FLAGS)
---
If the KRA flagged red flags, list each one with an explanation:
* **[Finding]:** [WHY this is dangerous and what could happen if missed]

If no red flags were identified, write: *No immediate life-threatening
concerns identified in this presentation.*

## 📝 DIAGNOSTIC GAPS
---
* **Missing Data:** [What information is missing — e.g., "No ECG available"]
* **Impact:** [How this gap limits diagnostic certainty]
* **What to watch for:** [Clinical signs that would change the picture]

## 🧪 RECOMMENDED WORKUP
---
Prioritize tests that would most change management:
1.  **[Test Name]** — *Why:* [What diagnostic question it answers]
2.  **[Test Name]** — *Why:* [What diagnostic question it answers]

{_DISCLAIMER}

{_OUTPUT_GUARDRAIL}

Return only the final report content. Do NOT echo constraints, rules, or instructions.
"""

_SEASONED_INSTRUCTIONS = f"""\
You are a senior cardiologist providing a high-density clinical brief for an
EXPERIENCED ATTENDING. Use professional medical terminology, concise phrasing,
and tight structure. Assume the reader can interpret clinical data directly.

## AI Diagnosis

# CLINICAL ASSESSMENT BRIEF
---

### 🩺 DIFFERENTIAL DIAGNOSIS
| Rank | Differential | Confidence | Severity | Decisive Finding |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **[Condition]** | [X]% | **[LEVEL]** | [Single most discriminating finding] |
| 2 | **[Condition]** | [X]% | **[LEVEL]** | [Single most discriminating finding] |

**Clinical Correlation:**
* **Supporting Evidence:** [Concise list of corroborating findings]
* **Pathophysiology:** [Mechanism linking findings to diagnosis]
* **Against:** [Any findings that argue against this diagnosis, if applicable]

### 🚩 CLINICAL CONCERNS
List only actionable red flags with their clinical significance:
* **[Finding]** — [Risk: what it portends and urgency level]

### 🔍 DIAGNOSTIC GAPS & LIMITATIONS
* **[Missing data point]** → *Impact: [How it shifts the differential or risk stratification]*

### ⚡ RECOMMENDED WORKUP (PRIORITIZED)
| Priority | Investigation | Diagnostic Target |
| :--- | :--- | :--- |
| STAT | **[Test]** | [What it rules in/out] |
| Urgent | **[Test]** | [What it rules in/out] |

{_DISCLAIMER}

{_OUTPUT_GUARDRAIL}

Return only the final report content. Do NOT echo constraints, rules, or instructions.
"""

_LEVEL_MAP = {
    "NEWBIE": _NEWBIE_INSTRUCTIONS,
    "SEASONED": _SEASONED_INSTRUCTIONS,
}


def _compact_list(value: Any, *, max_items: int = 8, max_chars: int = 180) -> list[str]:
    """Normalize free-form model fields into short prompt-safe bullet strings."""
    items: list[str] = []

    if isinstance(value, list):
        source = value
    elif isinstance(value, dict):
        source = [f"{k}: {v}" for k, v in value.items()]
    elif value is None:
        source = []
    else:
        source = [value]

    for entry in source:
        text = str(entry).strip()
        if not text:
            continue
        items.append(text[:max_chars])
        if len(items) >= max_items:
            break

    return items


def _compact_recommended_tests(value: Any, *, max_items: int = 8) -> list[str]:
    tests: list[str] = []
    if isinstance(value, list):
        source = value
    elif value is None:
        source = []
    else:
        source = [value]

    for item in source:
        if isinstance(item, dict):
            text = str(
                item.get("test_name")
                or item.get("name")
                or item.get("test")
                or json.dumps(item, ensure_ascii=False)
            ).strip()
        else:
            text = str(item).strip()
        if not text:
            continue
        tests.append(text[:180])
        if len(tests) >= max_items:
            break
    return tests


def _compact_kra_for_prompt(kra_result: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only high-signal KRA fields so ORA prompts stay within practical size."""
    if not isinstance(kra_result, dict):
        kra_result = {}

    compact: Dict[str, Any] = {
        "summary": str(kra_result.get("summary") or "").strip()[:700],
        "diagnoses": _compact_list(kra_result.get("diagnoses")),
        "differential": _compact_list(kra_result.get("differential") or kra_result.get("uncertainties")),
        "red_flags": _compact_list(kra_result.get("red_flags")),
        "recommended_tests": _compact_recommended_tests(kra_result.get("recommended_tests")),
        "confidence": kra_result.get("confidence"),
        "reasoning": str(kra_result.get("reasoning") or "").strip()[:1200],
    }

    return {key: value for key, value in compact.items() if value not in (None, "", [], {})}


def _compact_kra_input_for_prompt(kra_input: Dict[str, Any]) -> Dict[str, Any]:
    """Keep KRA input payload concise but clinically complete for ORA."""
    if not isinstance(kra_input, dict):
        kra_input = {}

    symptoms = str(kra_input.get("symptoms_text") or "").strip()
    context = str(kra_input.get("context_text") or "").strip()
    history_summary = str(kra_input.get("history_summary_text") or "").strip()
    ecg = kra_input.get("ecg") if isinstance(kra_input.get("ecg"), dict) else {}
    labs = kra_input.get("labs") if isinstance(kra_input.get("labs"), dict) else {}
    quality = kra_input.get("quality") if isinstance(kra_input.get("quality"), dict) else {}

    compact: Dict[str, Any] = {
        "symptoms_text": symptoms[:1400],
        "ecg": {
            "status": ecg.get("status"),
            "rhythm": ecg.get("rhythm"),
            "heart_rate": ecg.get("heart_rate"),
            "st_segment": ecg.get("st_segment"),
            "interpretation": ecg.get("interpretation"),
            "findings": _compact_list(ecg.get("findings"), max_items=10, max_chars=220),
        },
        "labs": {
            "status": labs.get("status"),
            "troponin": labs.get("troponin"),
            "ldh": labs.get("ldh"),
            "bnp": labs.get("bnp"),
            "creatinine": labs.get("creatinine"),
            "hemoglobin": labs.get("hemoglobin"),
            "findings": _compact_list(labs.get("findings"), max_items=12, max_chars=220),
        },
        "history_summary_text": history_summary[:1400],
        "retrieval_context_excerpt": context[:2200],
        "quality": {
            "status": quality.get("status"),
            "rare_search_gate": quality.get("rare_search_gate"),
            "top_common_condition": quality.get("top_common_condition"),
            "top_common_score": quality.get("top_common_score"),
            "rare_top_score": quality.get("rare_top_score"),
        },
    }

    for block_key in ("ecg", "labs", "quality"):
        block = compact.get(block_key)
        if isinstance(block, dict):
            compact[block_key] = {k: v for k, v in block.items() if v not in (None, "", [], {})}

    return {key: value for key, value in compact.items() if value not in (None, "", [], {})}

def build_ora_prompt(
    *,
    kra_input: Dict[str, Any],
    kra_result: Dict[str, Any],
    symptoms_text: str,
    experience_level: str,
) -> str:
    level = experience_level.upper()
    instructions = _LEVEL_MAP.get(level, _SEASONED_INSTRUCTIONS)
    required_headings = (
        [
            "## AI Diagnosis",
            "## 📋 DIAGNOSTIC SUMMARY",
            "## 🔍 KEY FINDINGS",
            "## ⚠️ URGENT CONCERNS (RED FLAGS)",
            "## 📝 DIAGNOSTIC GAPS",
            "## 🧪 RECOMMENDED WORKUP",
        ]
        if level == "NEWBIE"
        else [
            "## AI Diagnosis",
            "# CLINICAL ASSESSMENT BRIEF",
            "### 🩺 DIFFERENTIAL DIAGNOSIS",
            "### 🚩 CLINICAL CONCERNS",
            "### 🔍 DIAGNOSTIC GAPS & LIMITATIONS",
            "### ⚡ RECOMMENDED WORKUP (PRIORITIZED)",
        ]
    )
    required_headings_text = "\n".join(f"- {heading}" for heading in required_headings)
    kra_input_json_str = json.dumps(_compact_kra_input_for_prompt(kra_input), indent=2, ensure_ascii=False)
    kra_json_str = json.dumps(_compact_kra_for_prompt(kra_result), indent=2, ensure_ascii=False)

    sections = [
        instructions,
        "\n═══ INPUT DATA ═══",
        f"PATIENT PRESENTATION:\n{symptoms_text.strip()}",
        f"\nKRA INPUT OBJECT:\n{kra_input_json_str}",
        f"\nKRA OUTPUT OBJECT:\n{kra_json_str}",
        "\n═══ TASK ═══",
        f"Generate the {level}-level clinical report following the exact "
        "section structure and formatting specified above. Use bolding, "
        "tables, and bullet lists to make it visually scannable. "
        "Target a full clinician-readable report, not a short abstract. "
        "Aim for approximately 700-1200 words for NEWBIE and 500-900 words for SEASONED. "
        "Use these exact headings in this exact order:\n"
        f"{required_headings_text}\n"
        "Be detailed and specific: for each leading diagnosis include at "
        "least three concrete supporting findings when available, one "
        "counterpoint/limitation, and explicit rationale for each recommended "
        "test and urgency level. "
        "Do not use markdown code blocks. Do not add sections that are "
        "not in the template. Fill every section — if a section has no "
        "relevant data, state that explicitly rather than omitting it. "
        "Output only the report body; do not print instructions, policy text, "
        "or labels like RULES/INPUT DATA/TASK.",
    ]

    return "\n".join(sections)