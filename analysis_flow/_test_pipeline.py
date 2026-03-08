"""Temporary full-pipeline test script for Qwen KRA + Phi ORA."""
import requests, json, time

BASE = "http://localhost:8080"

# 1. Health check
print("=== HEALTH CHECK ===")
r = requests.get(f"{BASE}/health", timeout=10)
print(f"  Status: {r.status_code}")
h = r.json()
kra_model = h.get("kra_model", "?")
ora_model = h.get("ora_model", "?")
print(f"  KRA model: ...{kra_model[-55:]}")
print(f"  ORA model: ...{ora_model[-40:]}")
print(f"  KRA runtime: {h.get('kra_runtime')}")

# 2. Init a workflow session
print("\n=== INIT SESSION ===")
r = requests.post(f"{BASE}/api/workflow/v1/session/init", json={
    "patient_id": "QWEN_TEST_001",
    "doctor_id": "DR_TEST",
    "correlation_id": "qwen-test-" + str(int(time.time()))
}, timeout=30)
print(f"  Status: {r.status_code}")
session = r.json()
sid = session.get("session_id")
print(f"  Session ID: {sid}")
print(f"  State: {session.get('state', session.get('current_state'))}")

# 3. Save extraction
print("\n=== SAVE EXTRACTION ===")
r = requests.post(f"{BASE}/api/workflow/v1/session/{sid}/extraction", json={
    "symptoms": ["chest pain", "shortness of breath", "diaphoresis"],
    "risk_factors": ["hypertension", "diabetes", "smoking"],
    "translated_text": (
        "Patient is a 58-year-old male presenting with acute substernal "
        "chest pain radiating to left arm for 2 hours, associated with "
        "shortness of breath and profuse sweating. History of hypertension "
        "and type 2 diabetes. Current smoker."
    ),
}, timeout=30)
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    print(f"  State: {r.json().get('state')}")
else:
    print(f"  Error: {r.text[:200]}")

# 4. Run analysis (NEWBIE level)
print("\n=== RUN ANALYSIS (experience_level=newbie) ===")
print("  This will run KRA (Qwen) + ORA (Phi) — may take 2-5 min on CPU...")
t0 = time.time()
r = requests.post(f"{BASE}/api/workflow/v1/session/{sid}/analysis/run", json={
    "experience_level": "newbie",
}, timeout=600)
elapsed = time.time() - t0
print(f"  Status: {r.status_code} ({elapsed:.1f}s)")

if r.status_code == 200:
    result = r.json()
    print(f"  Pipeline status: {result.get('status')}")

    # KRA output
    kra_raw = result.get("kra_raw", "")
    print(f"\n=== KRA RAW OUTPUT ({len(kra_raw)} chars) ===")
    print(kra_raw[:800] if kra_raw else "(empty)")

    # ORA output
    ora = result.get("ora_outputs") or {}
    newbie_out = ora.get("newbie", "")
    print(f"\n=== ORA NEWBIE OUTPUT ({len(newbie_out)} chars) ===")
    print(newbie_out[:800] if newbie_out else "(empty)")

    # Refined output fallback
    refined = result.get("refined_output", "")
    if refined and not newbie_out:
        print(f"\n=== REFINED OUTPUT ({len(refined)} chars) ===")
        print(refined[:800])

    # Processing steps
    steps = result.get("processing_steps", [])
    print(f"\n=== PROCESSING STEPS ({len(steps)}) ===")
    for s in steps:
        step_name = s.get("step", "?")
        status = s.get("status", "?")
        dur = s.get("duration_ms", "")
        print(f"  {step_name:30s}  {status:12s}  {dur}ms")

    print(f"\n  Total duration: {result.get('total_duration_ms', '?')}ms")

    rca = result.get("rare_case_alert")
    if rca:
        print(f"  Rare case alert: {json.dumps(rca)[:200]}")
else:
    print(f"  Error: {r.text[:500]}")

print("\n=== FULL PIPELINE TEST COMPLETE ===")
