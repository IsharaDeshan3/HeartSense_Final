"""Quick script to check Supabase table schemas."""
import os, json, requests
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

url = os.getenv("SUPABASE_URL", "").rstrip("/")
key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
if not url or not key:
    print("ERROR: SUPABASE_URL or SERVICE_KEY not set")
    exit(1)

headers = {"apikey": key, "Authorization": f"Bearer {key}"}

for table in ["analysis_payloads", "kra_outputs", "ora_outputs"]:
    r = requests.get(f"{url}/rest/v1/{table}?select=*&limit=1", headers=headers, timeout=15)
    print(f"\n--- {table} (status={r.status_code}) ---")
    data = r.json()
    if isinstance(data, list) and data:
        print(f"Columns: {list(data[0].keys())}")
        # Show types by sample values
        for k, v in data[0].items():
            print(f"  {k}: {type(v).__name__} = {str(v)[:80]}")
    elif isinstance(data, dict) and "message" in data:
        print(f"Error: {data}")
    else:
        print("Table is empty or does not exist")
        # Try a test insert to see what columns are expected
        test_row = {
            "session_id": "test-schema-check",
            "symptoms_json": {"text": "test"},
            "history_json": {},
            "ecg_json": {},
            "labs_json": {},
            "context_text": "test",
            "quality_json": {},
            "status": "pending",
        }
        r2 = requests.post(
            f"{url}/rest/v1/{table}",
            headers={**headers, "Content-Type": "application/json", "Prefer": "return=representation"},
            json=test_row,
            timeout=15,
        )
        print(f"Test insert status={r2.status_code}: {r2.text[:500]}")
        # Clean up test row if it was inserted
        if r2.status_code in (200, 201) and r2.json():
            test_id = r2.json()[0].get("id")
            if test_id:
                requests.delete(
                    f"{url}/rest/v1/{table}?id=eq.{test_id}",
                    headers=headers,
                    timeout=15,
                )
                print(f"Cleaned up test row {test_id}")
