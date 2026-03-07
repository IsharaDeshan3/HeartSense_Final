"""Smoke test for local KRA/ORA compatibility under the current llama-cpp runtime.

Runs a short KRA JSON task using the configured KRA runtime, verifies the output
is parseable JSON with the expected top-level fields, then runs ORA on the
parsed result. This is intended to catch incompatible GGUF/chat-format/runtime
combinations before a full workflow session is attempted.
"""

from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, ".")
os.environ.setdefault("LOCAL_MODE", "true")

from backend.processing.kra_client import KRAClient
from backend.processing.ora_client import ORAClient
from core.llm_engine import LLMEngine


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> None:
    print("=" * 60)
    print("KRA/ORA SMOKE TEST")
    print("=" * 60)

    engine = LLMEngine.instance()
    health = engine.health()
    print(f"KRA runtime   : {health['kra_runtime']}")
    print(f"KRA model     : {health['kra_model']}")
    print(f"ORA model     : {health['ora_model']}")
    print(f"Shared model  : {health['shared_model']}")

    kra = KRAClient()
    ora = ORAClient()

    t0 = time.time()
    kra_result = kra.analyze(
        symptoms_text="Acute crushing chest pain radiating to the left arm with diaphoresis.",
        context_text="Acute coronary syndrome commonly presents with chest pain, diaphoresis, and biomarker elevation.",
        ecg_dict={
            "status": "present",
            "rhythm": "sinus tachycardia",
            "heart_rate": 104,
            "st_segment": "anterior ST elevation",
            "interpretation": "possible anterior STEMI",
            "findings": ["ST elevation in V2-V4", "sinus tachycardia"],
        },
        labs_dict={
            "status": "present",
            "troponin": 4.8,
            "bnp": 320,
            "creatinine": 1.4,
            "findings": ["Troponin elevated", "BNP elevated"],
        },
        history_summary_text="History of hypertension, diabetes, and smoking.",
    )
    kra_secs = time.time() - t0

    print(f"KRA seconds   : {kra_secs:.1f}")
    print("KRA raw start")
    print(kra_result.get("raw_text", "")[:2000])
    print("KRA raw end")

    _require(isinstance(kra_result.get("diagnoses"), list), "KRA diagnoses missing or not a list")
    _require(isinstance(kra_result.get("uncertainties"), list), "KRA uncertainties missing or not a list")
    _require(isinstance(kra_result.get("recommended_tests"), list), "KRA recommended_tests missing or not a list")
    _require(isinstance(kra_result.get("red_flags"), list), "KRA red_flags missing or not a list")

    t1 = time.time()
    ora_result = ora.refine(
        kra_result=kra_result,
        symptoms_text="Acute crushing chest pain radiating to the left arm with diaphoresis.",
        experience_level="SEASONED",
    )
    ora_secs = time.time() - t1

    _require(bool(ora_result.get("refined_output", "").strip()), "ORA refined output is empty")

    print(f"ORA seconds   : {ora_secs:.1f}")
    print("ORA raw start")
    print(ora_result["refined_output"][:2000])
    print("ORA raw end")
    print("SMOKE TEST: PASS")


if __name__ == "__main__":
    main()