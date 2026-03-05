from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

from .models import RetrievedChunk


def _safe_json_compact(data: Dict[str, Any], max_chars: int) -> str:
    """Compact JSON rendering with a hard character cap."""

    try:
        s = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        s = json.dumps({"value": str(data)}, ensure_ascii=False, separators=(",", ":"))
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 3] + "..."


def pack_kra_payload(
    *,
    symptoms_text: str,
    ecg_json: Dict[str, Any],
    labs_json: Dict[str, Any],
    lab_component_recommendations: List[str],
    chunks: List[RetrievedChunk],
    max_chars: int = 24000,
) -> Tuple[str, str]:
    """Build a single symptoms string and a single context string within max_chars.

    Extractive + deterministic to minimize hallucinations.
    Returns (symptoms_block, context_block).
    """

    recs = "\n".join(f"- {r}" for r in lab_component_recommendations) if lab_component_recommendations else ""
    symptoms_parts: List[str] = [
        "Patient Symptoms / History (free text):",
        symptoms_text.strip(),
        "",
        "ECG JSON:",
        _safe_json_compact(ecg_json, max_chars=4000),
        "",
        "Lab Report JSON:",
        _safe_json_compact(labs_json, max_chars=5000),
    ]
    if recs:
        symptoms_parts += ["", "Lab Component Recommendations:", recs]

    symptoms_block = "\n".join(symptoms_parts).strip()

    header = (
        "Retrieved Medical Context (grounding snippets; include provenance):\n"
        "- books: cardiology books/guidelines\n"
        "- rare_cases: rare cardiology case reports (PMID-based)\n"
    )

    base_context_lines = [header]
    for i, c in enumerate(chunks, 1):
        meta_bits = []
        if c.metadata.get("condition"):
            meta_bits.append(f"condition={c.metadata.get('condition')}")
        if c.metadata.get("pmid"):
            meta_bits.append(f"pmid={c.metadata.get('pmid')}")
        if c.metadata.get("source_file"):
            meta_bits.append(f"source_file={c.metadata.get('source_file')}")
        meta_str = (" | " + ", ".join(meta_bits)) if meta_bits else ""
        base_context_lines.append(f"[{i}] source={c.source} score={c.score:.3f}{meta_str}\n{c.text.strip()}\n")

    context_block = "\n".join(base_context_lines).strip()

    total = len(symptoms_block) + 2 + len(context_block)
    if total <= max_chars:
        return symptoms_block, context_block

    remaining = max(max_chars - (len(symptoms_block) + 2), 1000)
    if len(context_block) <= remaining:
        return symptoms_block, context_block

    min_per_chunk = 600
    overhead = len(header) + 50
    remaining2 = max(remaining - overhead, 0)
    n = max(len(chunks), 1)
    per = max(min_per_chunk, remaining2 // n) if remaining2 else min_per_chunk

    compressed_lines = [header]
    used = len(header)
    for i, c in enumerate(chunks, 1):
        if used >= remaining:
            break
        block = f"[{i}] source={c.source} score={c.score:.3f}\n"
        text_budget = max(per - len(block) - 2, 200)
        snippet = c.text.strip()
        if len(snippet) > text_budget:
            snippet = snippet[: text_budget - 3] + "..."
        block += snippet + "\n"
        if used + len(block) > remaining:
            break
        compressed_lines.append(block)
        used += len(block)

    compressed_lines.append("\n[Context truncated to fit model limits]")
    context_block = "\n".join(compressed_lines).strip()
    return symptoms_block, context_block
