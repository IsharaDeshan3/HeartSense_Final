"""Get exact Supabase table columns and attempt to add missing ones."""
import os, json, requests
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

url = os.getenv("SUPABASE_URL", "").rstrip("/")
key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# 1. Get actual columns for each table
for table in ["analysis_payloads", "kra_outputs", "ora_outputs"]:
    # Use a HEAD request with columns to discover which ones exist
    r = requests.get(f"{url}/rest/v1/{table}?select=*&limit=0", headers=headers, timeout=15)
    print(f"\n--- {table} ---")
    print(f"Status: {r.status_code}")
    # The Content-Range header tells us the count
    # The response headers may contain column info

# 2. Try to call a Supabase RPC to execute SQL
sql = """
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('analysis_payloads', 'kra_outputs', 'ora_outputs')
ORDER BY table_name, ordinal_position;
"""

rpc_url = f"{url}/rest/v1/rpc/exec_sql"
r = requests.post(rpc_url, headers=headers, json={"sql": sql}, timeout=15)
print(f"\n--- RPC exec_sql ---")
print(f"Status: {r.status_code}")
print(f"Body: {r.text[:1000]}")

# 3. Try with individual column queries to discover schema
for table in ["analysis_payloads", "kra_outputs", "ora_outputs"]:
    all_possible_cols = [
        "id", "session_id", "symptoms_json", "history_json", "ecg_json", "labs_json",
        "context_text", "quality_json", "status", "input_profile", "ecg_status",
        "lab_status", "workflow_session_id", "source_tag",
        "payload_id", "payload_url", "symptoms_text", "kra_output", "raw_text",
        "kra_output_id", "kra_output_url", "experience_level", "refined_output",
        "disclaimer", "created_at",
    ]
    existing = []
    missing = []
    for col in all_possible_cols:
        r = requests.get(
            f"{url}/rest/v1/{table}?select={col}&limit=0",
            headers=headers,
            timeout=15,
        )
        if r.status_code == 200:
            existing.append(col)
        else:
            missing.append(col)
    print(f"\n--- {table} ---")
    print(f"EXISTING: {existing}")
    print(f"MISSING:  {missing}")
