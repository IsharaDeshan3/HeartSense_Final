"""Run a full local workflow session against the backend API.

This script posts extraction, ECG, and lab payloads, then runs analysis and
prints the returned KRA/ORA outputs plus per-step timings.
"""

from __future__ import annotations

import json
import time

import requests


BASE_URL = "http://localhost:8080/api/workflow/v1"


def main() -> None:
    session = requests.Session()

    init_res = session.post(
        f"{BASE_URL}/session/init",
        json={
            "patient_id": "report-patient-006",
            "correlation_id": "report-run-006",
        },
        timeout=15,
    )
    init_res.raise_for_status()
    session_id = init_res.json()["session_id"]
    print(f"SESSION_ID={session_id}")

    extraction_payload = {
        "symptoms": ["palpitations", "fatigue", "dyspnea"],
        "risk_factors": ["hypertension", "smoking"],
        "translated_text": (
            "Adult patient with palpitations, fatigue, and shortness of breath over several hours. "
            "History includes hypertension and smoking."
        ),
    }
    ecg_payload = {
        "result": {
            "status": "present",
            "rhythm_analysis": {
                "heart_rate": 118,
                "rhythm_type": "Sinus tachycardia",
                "regularity": "regular",
            },
            "abnormalities": {
                "abnormalities": ["nonspecific ST changes"],
                "severity": "moderate",
                "affected_leads": ["II", "V5"],
            },
            "diagnosis": {
                "primary_diagnosis": "Tachyarrhythmia pattern",
                "differential_diagnoses": ["Rate-related changes", "Demand ischemia"],
                "recommendations": ["Repeat ECG", "Rhythm monitoring"],
                "urgency": "urgent",
            },
            "findings": ["Sinus tachycardia", "Nonspecific ST changes"],
            "rhythm": "Sinus tachycardia",
            "heart_rate": 118,
            "st_segment": "nonspecific changes",
            "interpretation": "Tachycardia with nonspecific ST changes",
        }
    }
    lab_payload = {
        "result": {
            "status": "present",
            "labComparison": [
                {"test": "Troponin", "actualValue": 0.8, "status": "high"},
                {"test": "BNP", "actualValue": 210, "status": "high"},
                {"test": "Creatinine", "actualValue": 1.2, "status": "normal"},
            ],
            "extractedJsonGroup1": {
                "troponin": 0.8,
                "BNP": 210,
                "Creatinine": 1.2,
            },
            "extractedJsonGroup2": {"LDH": 240},
        }
    }

    for step_name, payload in (
        ("extraction", extraction_payload),
        ("ecg", ecg_payload),
        ("lab", lab_payload),
    ):
        res = session.post(f"{BASE_URL}/session/{session_id}/{step_name}", json=payload, timeout=15)
        res.raise_for_status()
        print(f"{step_name.upper()}_STATE={res.json()['state']}")

    started = time.time()
    analysis_res = session.post(
        f"{BASE_URL}/session/{session_id}/analysis/run",
        json={"experience_level": "seasoned"},
        timeout=900,
    )
    elapsed = time.time() - started
    analysis_res.raise_for_status()

    result = analysis_res.json()
    print(f"ANALYSIS_STATUS={result['status']}")
    print(f"TOTAL_SECONDS={elapsed:.1f}")
    print(f"TOTAL_DURATION_MS={result.get('total_duration_ms')}")

    print("KRA_RAW_START")
    print(result.get("kra_raw", ""))
    print("KRA_RAW_END")

    print("ORA_OUTPUT_START")
    print(result.get("refined_output", ""))
    print("ORA_OUTPUT_END")

    print("PROCESSING_STEPS_START")
    for step in result.get("processing_steps", []):
        print(f"{step.get('step')}|{step.get('status')}|{step.get('duration_ms')}")
    print("PROCESSING_STEPS_END")

    print("RESULT_JSON_START")
    print(json.dumps(result, indent=2))
    print("RESULT_JSON_END")


if __name__ == "__main__":
    main()