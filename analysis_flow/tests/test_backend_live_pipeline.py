from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("LOCAL_MODE", "true")
os.environ.setdefault("KRA_FORCE_CPU", "1")

from core.models import ECGPayload, LabsPayload, PatientCase
from core.pipeline import DiagnosisPipeline


class BackendLivePipelineTest(unittest.TestCase):
    def test_live_backend_pipeline(self) -> None:
        pipeline = DiagnosisPipeline(max_chars=24000)
        case = PatientCase(
            symptoms_text=(
                "Sudden crushing central chest pain radiating to the left arm with "
                "diaphoresis, nausea, and shortness of breath for 45 minutes."
            ),
            ecg=ECGPayload(
                data={
                    "status": "present",
                    "findings": [
                        "ST-segment elevation in leads II, III, and aVF",
                        "sinus tachycardia",
                    ],
                    "rhythm": "sinus tachycardia",
                    "interpretation": "Inferior STEMI pattern",
                }
            ),
            labs=LabsPayload(
                data={
                    "status": "present",
                    "findings": ["elevated troponin", "elevated BNP"],
                    "troponin": 0.48,
                    "bnp": 220.0,
                }
            ),
            lab_component_recommendations=["repeat troponin", "serial ECGs"],
        )

        result = pipeline.run(case)

        self.assertIn("status", result)
        self.assertIn(result["status"], {"SUCCESS", "FAILED"})
        self.assertIsInstance(result.get("ora_newbie"), str)
        self.assertTrue(str(result.get("ora_newbie", "")).strip())
        self.assertIsInstance(result.get("ora_seasoned"), str)
        self.assertTrue(str(result.get("ora_seasoned", "")).strip())

        diagnoses = result.get("kra", {}).get("diagnoses", []) if isinstance(result.get("kra"), dict) else []
        diagnosis_summary = []
        for diagnosis in diagnoses[:3]:
            if isinstance(diagnosis, dict):
                diagnosis_summary.append(
                    {
                        "condition": diagnosis.get("condition", ""),
                        "confidence": diagnosis.get("confidence", 0),
                        "severity": diagnosis.get("severity", ""),
                    }
                )

        analysis_output = {
            "status": result.get("status"),
            "confidence": result.get("confidence"),
            "is_critical": result.get("is_critical"),
            "banner": result.get("banner"),
            "safety_reasons": result.get("safety_reasons"),
            "retrieval_quality": result.get("retrieval_quality"),
            "kra_diagnoses": diagnosis_summary,
            "ora_newbie": result.get("ora_newbie"),
            "ora_seasoned": result.get("ora_seasoned"),
            "disclaimer": result.get("disclaimer"),
        }

        print("LIVE_ANALYSIS_OUTPUT")
        print(json.dumps(analysis_output, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    unittest.main(verbosity=2)
