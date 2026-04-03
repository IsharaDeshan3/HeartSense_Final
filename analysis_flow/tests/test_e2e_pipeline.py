"""
End-to-end test for the analysis_flow backend pipeline.
Walks through: session init → extraction → lab → analysis/run
Tests that KRA (HuggingFace) and ORA (Gemini) are reachable and produce results.
"""

import json
import os
import sys
import time
import requests

BASE = "http://localhost:8080"
API = f"{BASE}/api/workflow/v1"
ANALYSIS_TIMEOUT_SEC = int(os.getenv("E2E_ANALYSIS_TIMEOUT_SEC", "600"))

def step(name, ok=True):
    status = "✅" if ok else "❌"
    print(f"\n{'='*60}")
    print(f"  {status}  {name}")
    print(f"{'='*60}")


def print_latest_kra_from_history(patient_id):
    try:
        r = requests.get(f"{API}/patient/{patient_id}/history", timeout=60)
    except Exception as exc:
        print(f"\n  ⚠️   Could not fetch patient history for KRA output: {exc}")
        return False

    if r.status_code != 200:
        print(f"\n  ⚠️   Patient history lookup failed: {r.status_code} → {r.text[:500]}")
        return False

    bundle = r.json()
    records = bundle.get("records", []) or []
    print(f"\n  📚  Patient history records: {len(records)}")
    for record in records:
        raw_text = str(record.get("raw_text") or "").strip()
        if raw_text:
            print("  " + "-" * 60)
            print(raw_text)
            print("  " + "-" * 60)
            return True

        kra_output = record.get("kra_output")
        if kra_output:
            print("  " + "-" * 60)
            print(json.dumps(kra_output, indent=2, ensure_ascii=False))
            print("  " + "-" * 60)
            return True

    print("\n  [no KRA output found in patient history]")
    return False

def main():
    # ── 0. Health ────────────────────────────────────────────────
    print("\n🏥  Testing Analysis Flow Backend Pipeline")
    print("=" * 60)

    r = requests.get(f"{BASE}/health")
    assert r.status_code == 200, f"Health check failed: {r.status_code}"
    step("Health check passed")

    # ── 0b. Schema check ─────────────────────────────────────────
    r = requests.get(f"{BASE}/health/schema")
    print(f"  Schema check: {r.status_code} → {r.json()}")

    # ── 1. Init Session ──────────────────────────────────────────
    init_payload = {
        "patient_id": "test-patient-001",
        "doctor_id": "test-doctor-001",
        "correlation_id": "e2e-test-run-001"
    }
    patient_id = init_payload["patient_id"]
    r = requests.post(f"{API}/session/init", json=init_payload)
    if r.status_code != 200:
        step(f"Session init FAILED: {r.status_code} → {r.text}", ok=False)
        sys.exit(1)
    session = r.json()
    session_id = session["session_id"]
    step(f"Session init → session_id={session_id}, state={session['state']}")

    # ── 2. Save Extraction ───────────────────────────────────────
    extraction_payload = {
        "symptoms": [
            "Chest pain radiating to left arm",
            "Shortness of breath",
            "Diaphoresis",
            "Nausea"
        ],
        "risk_factors": [
            "Hypertension",
            "Diabetes mellitus type 2",
            "Family history of CAD",
            "Smoking 20 pack-years"
        ],
        "translated_text": (
            "55-year-old male presenting with acute onset severe substernal "
            "chest pain radiating to the left arm and jaw, associated with "
            "shortness of breath, diaphoresis, and nausea. Pain started "
            "approximately 2 hours ago at rest. Patient has a history of "
            "hypertension, diabetes mellitus type 2, and smokes 1 pack per "
            "day for 20 years. Family history significant for coronary artery "
            "disease in father who had MI at age 50."
        )
    }
    r = requests.post(f"{API}/session/{session_id}/extraction", json=extraction_payload)
    if r.status_code != 200:
        step(f"Extraction save FAILED: {r.status_code} → {r.text}", ok=False)
        sys.exit(1)
    ext_result = r.json()
    step(f"Extraction saved → state={ext_result['state']}, rev={ext_result['revision']}")

    # ── 3. Save Lab ──────────────────────────────────────────────
    lab_payload = {
        "result": {
            "status": "available",
            "extractedJsonGroup1": {
                "troponin": 2.5,
                "bnp": 450,
                "creatinine": 1.2,
                "hemoglobin": 14.5
            },
            "extractedJsonGroup2": {
                "ldh": 320,
                "potassium": 4.2,
                "sodium": 138
            },
            "labComparison": [
                {"test": "Troponin I", "actualValue": 2.5, "normalRange": "0-0.04", "status": "critical_high"},
                {"test": "BNP", "actualValue": 450, "normalRange": "0-100", "status": "high"},
                {"test": "LDH", "actualValue": 320, "normalRange": "140-280", "status": "high"},
                {"test": "Creatinine", "actualValue": 1.2, "normalRange": "0.7-1.3", "status": "normal"},
                {"test": "Hemoglobin", "actualValue": 14.5, "normalRange": "13.5-17.5", "status": "normal"}
            ]
        }
    }
    r = requests.post(f"{API}/session/{session_id}/lab", json=lab_payload)
    if r.status_code != 200:
        step(f"Lab save FAILED: {r.status_code} → {r.text}", ok=False)
        sys.exit(1)
    lab_result = r.json()
    step(f"Lab saved → state={lab_result['state']}, rev={lab_result['revision']}")

    # ── 4. Run Analysis ──────────────────────────────────────────
    step(f"Starting analysis pipeline (KRA → ORA)... timeout={ANALYSIS_TIMEOUT_SEC}s")
    analysis_payload = {"experience_level": "seasoned"}
    started = time.time()
    
    try:
        r = requests.post(
            f"{API}/session/{session_id}/analysis/run",
            json=analysis_payload,
            timeout=ANALYSIS_TIMEOUT_SEC,
        )
    except requests.Timeout:
        step(f"Analysis TIMED OUT after {ANALYSIS_TIMEOUT_SEC}s", ok=False)
        print_latest_kra_from_history(patient_id)
        sys.exit(1)
    
    elapsed = time.time() - started
    
    if r.status_code != 200:
        step(f"Analysis FAILED: {r.status_code}", ok=False)
        print(f"  Response body:\n{r.text[:2000]}")
        print_latest_kra_from_history(patient_id)
        sys.exit(1)
    
    result = r.json()
    step(f"Analysis completed in {elapsed:.1f}s → status={result.get('status')}")
    
    # ── 5. Validate results ──────────────────────────────────────
    print("\n📊  Pipeline Results Summary")
    print("-" * 60)
    print(f"  Session ID:        {result.get('session_id')}")
    print(f"  Status:            {result.get('status')}")
    print(f"  Supabase avail:    {result.get('supabase_available')}")
    print(f"  Total duration:    {result.get('total_duration_ms')}ms")
    print(f"  Experience level:  {result.get('experience_level')}")
    
    # Processing steps
    steps = result.get("processing_steps", [])
    print(f"\n  📋  Processing Steps ({len(steps)} total):")
    for s in steps:
        print(f"    • {s['step']:25s} → {s['status']:20s}  ({s.get('duration_ms', '?')}ms)")
    
    # KRA raw output
    kra_raw = result.get("kra_raw", "")
    print(f"\n  🧠  KRA Raw Output ({len(kra_raw)} chars):")
    print("  " + "-" * 60)
    print(kra_raw if kra_raw else "[empty KRA output]")
    print("  " + "-" * 60)
    
    # ORA outputs
    ora_outputs = result.get("ora_outputs", {})
    print(f"\n  ✨  ORA Outputs (levels: {list(ora_outputs.keys())}):")
    for level, text in ora_outputs.items():
        print(f"    [{level.upper()}] ({len(text)} chars): {text[:300]}...")
    
    # Rare case alert
    rare = result.get("rare_case_alert")
    if rare:
        print(f"\n  🚨  Rare case alert: {rare}")
    else:
        print(f"\n  ℹ️   No rare case alert triggered")
    
    # Context preview
    ctx = result.get("context_preview", "")
    print(f"\n  📚  Context preview ({len(ctx)} chars):")
    print(f"    {ctx[:400]}...")
    
    # Final verdict
    has_kra = bool(kra_raw)
    has_ora = bool(ora_outputs.get("seasoned")) or bool(ora_outputs.get("newbie"))
    
    print("\n" + "=" * 60)
    if has_kra and has_ora:
        print("  🎉  FULL PIPELINE SUCCESS — KRA + ORA both produced output!")
    elif has_kra:
        print("  ⚠️   PARTIAL — KRA output OK but ORA is missing/empty")
    else:
        print("  ❌  PIPELINE FAILED — No KRA output received")
    print("=" * 60)

    # ── 6. Verify session state ──────────────────────────────────
    r = requests.get(f"{API}/session/{session_id}")
    if r.status_code == 200:
        final_session = r.json()
        print(f"\n  Final session state: {final_session.get('current_state')}")
    
    return 0 if (has_kra and has_ora) else 1

if __name__ == "__main__":
    sys.exit(main())
