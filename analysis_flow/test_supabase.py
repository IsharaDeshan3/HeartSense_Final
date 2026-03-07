"""Test Supabase connectivity and schema for diagnostic data storage."""
import sys, os
sys.path.insert(0, ".")
sys.path.insert(0, "backend")
os.environ["LOCAL_MODE"] = "true"

from processing.supabase_payload import (
    ping_supabase,
    verify_schema,
    save_analysis_payload,
    save_kra_output,
    save_ora_output,
    update_payload_status,
    get_patient_diagnosis_history,
    get_patient_history_bundle,
)

print("=" * 60)
print("  SUPABASE CONNECTIVITY & SCHEMA TEST")
print("=" * 60)

# Test 1: Ping
print("\n[1/5] Ping Supabase...")
ok = ping_supabase()
print(f"  Supabase reachable: {ok}")
if not ok:
    print("  FATAL: Cannot reach Supabase. Check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
    sys.exit(1)

# Test 2: Schema validation
print("\n[2/5] Validating schema...")
schema = verify_schema()
print(f"  Schema OK: {schema['ok']}")
for table, info in schema.get("tables", {}).items():
    status = "OK" if info["ok"] else f"MISSING: {info['missing']}"
    print(f"    {table}: {status}")
if not schema["ok"]:
    print(f"  Hint: {schema.get('migration_hint', '')}")

# Test 3: Insert a test payload
print("\n[3/5] Inserting test analysis_payload...")
try:
    payload_id, payload_url = save_analysis_payload(
        session_id="test_supabase_check_001",
        symptoms={"text": "Test patient: 55yo male, chest pain", "chief_complaint": "chest pain"},
        ecg={"status": "skipped"},
        labs={"status": "skipped"},
        context_text="[TEST] No context — Supabase connectivity test only.",
        quality={"status": "TEST"},
        patient_id="test_patient_supabase",
    )
    print(f"  Payload saved: id={payload_id}")
    print(f"  URL: {payload_url}")
except Exception as e:
    print(f"  FAILED: {e}")
    payload_id = None

# Test 4: Insert KRA output linked to the payload
if payload_id:
    print("\n[4/5] Inserting test kra_output...")
    try:
        kra_id, kra_url = save_kra_output(
            session_id="test_supabase_check_001",
            payload_id=payload_id,
            symptoms_text="Test patient: 55yo male, chest pain",
            kra_result={
                "diagnoses": [{"condition": "TEST_CONDITION", "confidence": 0.99, "severity": "LOW", "evidence": ["test"], "clinical_features": ["test"]}],
                "uncertainties": ["This is a test"],
                "recommended_tests": [],
                "red_flags": [],
                "raw_text": '{"test": true}',
            },
            patient_id="test_patient_supabase",
        )
        print(f"  KRA saved: id={kra_id}")

        # Test 5: Insert ORA output linked to the KRA
        print("\n[5/5] Inserting test ora_output...")
        ora_id, ora_url = save_ora_output(
            session_id="test_supabase_check_001",
            kra_output_id=kra_id,
            experience_level="SEASONED",
            refined_output="[TEST] This is a test ORA output for connectivity verification.",
            disclaimer="Test disclaimer",
            status="success",
            patient_id="test_patient_supabase",
        )
        print(f"  ORA saved: id={ora_id}")

        # Update payload status
        update_payload_status(payload_id, "completed")
        print("  Payload status updated to 'completed'")

    except Exception as e:
        print(f"  FAILED: {e}")
        kra_id = None
else:
    print("\n[4/5] Skipped (payload insert failed)")
    print("[5/5] Skipped")

# Test 6: Fetch back
print("\n[BONUS] Fetching patient history...")
try:
    bundle = get_patient_history_bundle("test_patient_supabase")
    records = bundle.get("records", [])
    print(f"  Records found: {len(records)}")
    if records:
        latest = records[0]
        print(f"  Latest session: {latest.get('session_id', 'N/A')}")
        print(f"  Status: {latest.get('status', 'N/A')}")
except Exception as e:
    print(f"  History fetch failed: {e}")

print("\n" + "=" * 60)
print("  SUPABASE TEST COMPLETE")
print("=" * 60)
