"""Check ID column types in Supabase."""
import os, json, requests
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

url = os.getenv("SUPABASE_URL", "").rstrip("/")
key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=representation"}

# Insert a test row into analysis_payloads with just what's currently available
test = {"session_id": "test-id-check", "status": "pending"}
r = requests.post(f"{url}/rest/v1/analysis_payloads", headers=h, json=test, timeout=15)
print(f"Insert status: {r.status_code}")
if r.status_code < 300:
    data = r.json()
    if data:
        row = data[0]
        print(f"ID value: {row.get('id')} (type: {type(row.get('id')).__name__})")
        # Clean up
        row_id = row["id"]
        requests.delete(f"{url}/rest/v1/analysis_payloads?id=eq.{row_id}", headers=h, timeout=15)
        print(f"Cleaned up test row")
else:
    print(f"Error: {r.text[:300]}")
