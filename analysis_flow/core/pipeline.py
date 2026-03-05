from __future__ import annotations

import json
import time
from typing import Any, Dict

from .context_packer import pack_kra_payload
from .hf_clients import KRAClient, ORAClient
from .json_utils import normalize_any_json
from .models import ExperienceLevel, KRAResult, ORAResult, PatientCase
from .retrieval import DualFAISSRetriever
from .safety import SafetyValidator


def _default_disclaimer() -> str:
    return (
        "[!] DISCLAIMER: Research prototype. Not a medical diagnosis. "
        "Verify with clinical judgment and appropriate tests/guidelines."
    )


def _format_fallback_summary(*, kra: KRAResult, missing_tests: list[str], banner: str) -> str:
    lines = []
    if banner:
        lines.append(f"=== {banner} ===")

    if kra.diagnoses:
        lines.append("Primary diagnosis candidates (Top 2):")
        for d in kra.diagnoses[:2]:
            lines.append(f"- {d.condition} (p={d.confidence:.2f}, severity={d.severity})")

    if kra.uncertainties:
        lines.append("\nWhy low confidence / uncertainties:")
        for u in kra.uncertainties[:10]:
            lines.append(f"- {u}")

    if kra.red_flags:
        lines.append("\nRed flags:")
        for r in kra.red_flags[:12]:
            lines.append(f"- {r}")

    if missing_tests:
        lines.append("\nRecommendations / missing labs/tests:")
        for t in missing_tests[:12]:
            lines.append(f"- {t}")

    lines.append("\n" + _default_disclaimer())
    return "\n".join(lines).strip()


class DiagnosisPipeline:
    def __init__(self, *, max_chars: int = 24000):
        self.max_chars = max_chars
        self.retriever = DualFAISSRetriever()
        self.kra = KRAClient("KRA_ENDPOINT")
        self.ora = ORAClient("ORA_ENDPOINT")
        self.safety = SafetyValidator(confidence_threshold=0.6)

    def run(self, case: PatientCase) -> Dict[str, Any]:
        start = time.time()
        session_id = f"sess_{int(start)}_{abs(hash(case.symptoms_text)) % 10000}"

        ecg_json = normalize_any_json(case.ecg.data)
        labs_json = normalize_any_json(case.labs.data)

        chunks, quality = self.retriever.retrieve(case.symptoms_text, top_k_books=5, top_k_rare=3)

        symptoms_block, context_block = pack_kra_payload(
            symptoms_text=case.symptoms_text,
            ecg_json=ecg_json,
            labs_json=labs_json,
            lab_component_recommendations=case.lab_component_recommendations,
            chunks=chunks,
            max_chars=self.max_chars,
        )

        kra_raw: Dict[str, Any] = {}
        try:
            kra_raw = self.kra.analyze(symptoms_block, context_block, quality.status)
            kra = KRAResult(
                diagnoses=kra_raw.get("diagnoses", []),
                uncertainties=kra_raw.get("uncertainties", []),
                recommended_tests=kra_raw.get("recommended_tests", []),
                red_flags=kra_raw.get("red_flags", []),
                raw_output=json.dumps(kra_raw, ensure_ascii=False),
                success=True,
                retrieval_quality=quality.model_dump(),
            )
        except Exception as e:
            kra = KRAResult(
                diagnoses=[],
                uncertainties=["KRA call failed"],
                recommended_tests=[],
                red_flags=[],
                raw_output=json.dumps(kra_raw or {}, ensure_ascii=False),
                success=False,
                error_message=str(e),
                retrieval_quality=quality.model_dump(),
            )

        # Hard requirement: top 2.
        kra.diagnoses = sorted(kra.diagnoses, key=lambda d: d.confidence, reverse=True)[:2]

        kra_json = kra.model_dump_json()

        missing_tests = list(dict.fromkeys([*kra.recommended_tests, *case.lab_component_recommendations]))
        # ORA: API only (your preference). Two outputs: NEWBIE + SEASONED.
        ora_newbie = ORAResult(success=False, validation_passed=False, error_message="Not run")
        ora_seasoned = ORAResult(success=False, validation_passed=False, error_message="Not run")

        try:
            ora_newbie_raw = self.ora.refine(kra_json, symptoms_block, ExperienceLevel.NEWBIE.value)
            ora_newbie = ORAResult(**{**ora_newbie_raw, "success": True, "raw_output": json.dumps(ora_newbie_raw, ensure_ascii=False)})
        except Exception as e:
            ora_newbie = ORAResult(success=False, validation_passed=False, error_message=str(e))

        try:
            ora_seasoned_raw = self.ora.refine(kra_json, symptoms_block, ExperienceLevel.SEASONED.value)
            ora_seasoned = ORAResult(**{**ora_seasoned_raw, "success": True, "raw_output": json.dumps(ora_seasoned_raw, ensure_ascii=False)})
        except Exception as e:
            ora_seasoned = ORAResult(success=False, validation_passed=False, error_message=str(e))

        if not ora_newbie.disclaimer:
            ora_newbie.disclaimer = _default_disclaimer()
        if not ora_seasoned.disclaimer:
            ora_seasoned.disclaimer = _default_disclaimer()

        safety = self.safety.validate(kra=kra, ora_newbie=ora_newbie, ora_seasoned=ora_seasoned)

        newbie_text = ora_newbie.formatted_diagnosis.strip() if ora_newbie.success and ora_newbie.formatted_diagnosis else ""
        seasoned_text = ora_seasoned.formatted_diagnosis.strip() if ora_seasoned.success and ora_seasoned.formatted_diagnosis else ""

        if not newbie_text:
            newbie_text = _format_fallback_summary(kra=kra, missing_tests=missing_tests, banner=safety.banner)
        if not seasoned_text:
            seasoned_text = _format_fallback_summary(kra=kra, missing_tests=missing_tests, banner=safety.banner)

        processing_time_ms = int((time.time() - start) * 1000)
        confidence = max((d.confidence for d in kra.diagnoses), default=0.0)

        return {
            "session_id": session_id,
            "status": "SUCCESS" if kra.success else "FAILED",
            "confidence": confidence,
            "is_critical": safety.is_critical,
            "banner": safety.banner,
            "safety_reasons": safety.reasons,
            "retrieval_quality": quality.model_dump(),
            "processing_time_ms": processing_time_ms,
            "kra": kra.model_dump(),
            "ora_newbie": newbie_text,
            "ora_seasoned": seasoned_text,
            "disclaimer": ora_seasoned.disclaimer or _default_disclaimer(),
        }
