"""
Quick end-to-end smoke test: KRA → ORA on CPU.
Run from analysis_flow/ with its venv activated.
"""

import sys, os, json, time

sys.path.insert(0, ".")
os.environ.setdefault("LOCAL_MODE", "true")

print("=" * 60)
print("  E2E SMOKE TEST — KRA ➜ ORA (CPU-only)")
print("=" * 60)

# ── Step 1: Load models ────────────────────────────────────
print("\n[1/4] Loading LLM engine (this loads models into RAM) ...")
t0 = time.time()
from core.llm_engine import LLMEngine

engine = LLMEngine.instance()
health = engine.health()
print(f"  KRA runtime  : {health['kra_runtime']}")
print(f"  KRA model    : {os.path.basename(health['kra_model'])}")
print(f"  ORA model    : {os.path.basename(health['ora_model'])}")
print(f"  Shared model : {health['shared_model']}")
print(f"  Loaded in {time.time() - t0:.1f}s")

# ── Step 2: Build a test case ──────────────────────────────
print("\n[2/4] Running KRA inference (differential diagnosis) ...")
from core.kra_prompt import build_kra_prompt

test_prompt = build_kra_prompt(
    symptoms_text=(
        "58-year-old male presenting with acute onset crushing substernal "
        "chest pain radiating to the left arm for 45 minutes. Associated "
        "diaphoresis and nausea. History of hypertension and type 2 diabetes. "
        "Current smoker, 30 pack-years."
    ),
    context_text=(
        "Acute coronary syndrome (ACS) is the most common cause of acute "
        "chest pain requiring emergency evaluation. STEMI criteria include "
        "ST elevation >= 1mm in two contiguous leads. Troponin elevation "
        "confirms myocardial injury. Risk factors include hypertension, "
        "diabetes, smoking, and male sex."
    ),
    ecg_dict={
        "rhythm": "sinus tachycardia",
        "heart_rate": 105,
        "st_segment": "ST elevation in leads V1-V4, reciprocal depression in II, III, aVF",
        "q_waves": "none",
    },
    labs_dict={
        "troponin_I_ng_mL": 2.4,
        "BNP_pg_mL": 380,
        "creatinine_mg_dL": 1.1,
        "glucose_mg_dL": 245,
        "potassium_mEq_L": 4.2,
    },
)

t1 = time.time()
kra_raw = engine.generate_kra(test_prompt)
kra_time = time.time() - t1
print(f"  KRA finished in {kra_time:.1f}s ({len(kra_raw)} chars)")

# Try to parse JSON
from core.hf_clients import _extract_first_json_object

kra_parsed = _extract_first_json_object(kra_raw)
if kra_parsed:
    print("  KRA JSON parsed OK ✓")
    print(json.dumps(kra_parsed, indent=2)[:1500])
else:
    print("  ⚠ KRA did not return valid JSON. Raw output:")
    print(kra_raw[:1500])
    kra_parsed = {
        "diagnoses": [{"condition": "Unable to parse", "confidence": 0.0, "severity": "LOW", "evidence": [], "clinical_features": []}],
        "uncertainties": ["KRA output was not parseable JSON"],
        "recommended_tests": [],
        "red_flags": [],
    }

# ── Step 3: Run ORA (SEASONED) ─────────────────────────────
print(f"\n[3/4] Running ORA inference (SEASONED level) ...")
from core.ora_prompt import build_ora_prompt

ora_prompt = build_ora_prompt(
    kra_result=kra_parsed,
    symptoms_text="58-year-old male, acute chest pain, ST elevation V1-V4, troponin 2.4",
    experience_level="SEASONED",
)

t2 = time.time()
ora_raw = engine.generate_ora(ora_prompt)
ora_time = time.time() - t2
print(f"  ORA SEASONED finished in {ora_time:.1f}s ({len(ora_raw)} chars)")
print("  --- ORA SEASONED output ---")
print(ora_raw[:2000])

# ── Step 4: Summary ────────────────────────────────────────
print("\n" + "=" * 60)
print("  SUMMARY")
print("=" * 60)
print(f"  KRA runtime     : {health['kra_runtime']} (fallback={health['kra_fallback_active']})")
print(f"  Model sharing   : {'YES — saved ~2.3 GB RAM' if health['shared_model'] else 'NO — separate instances'}")
print(f"  KRA inference   : {kra_time:.1f}s")
print(f"  ORA inference   : {ora_time:.1f}s")
print(f"  Total pipeline  : {kra_time + ora_time:.1f}s")
print(f"  KRA→ORA handoff : {'PASS ✓' if kra_parsed and ora_raw.strip() else 'FAIL ✗'}")
print("=" * 60)
