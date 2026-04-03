from __future__ import annotations

import json
import importlib
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _fresh_import(module_name: str):
    for name in list(sys.modules):
        if name == module_name or name.startswith(module_name + "."):
            del sys.modules[name]
    return importlib.import_module(module_name)


def _install_fake_faiss_retriever() -> None:
    module = types.ModuleType("faiss_retriever")

    class FAISSRetriever:
        def __init__(self, *args, **kwargs):
            self.index = types.SimpleNamespace(ntotal=0)

        def search(self, *args, **kwargs):
            return []

        def calculate_retrieval_quality(self, *args, **kwargs):
            return {"top_score": 0.0, "avg_score": 0.0, "status": "LOW_CONFIDENCE"}

        def get_context_string(self, *args, **kwargs):
            return ""

    module.FAISSRetriever = FAISSRetriever
    sys.modules["faiss_retriever"] = module


class BackendSmokeTest(unittest.TestCase):
    def test_full_backend_smoke(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            os.environ["WORKFLOW_DB_PATH"] = str(temp_path / "session_temp.db")

            _install_fake_faiss_retriever()

            main_module = _fresh_import("backend.main")
            workflow_module = importlib.import_module("routes.workflow")
            workflow_store_module = importlib.import_module("backend.processing.workflow_store")
            supabase_payload_module = importlib.import_module("processing.supabase_payload")

            with patch.object(supabase_payload_module, "verify_schema", return_value={"ok": True, "tables": {}}), \
                 patch.object(workflow_module._workflow, "run_analysis", return_value={
                     "session_id": "mock-workflow-session",
                     "status": "SUCCESS",
                     "message": "mock analysis finished",
                 }), \
                 patch.object(workflow_module._workflow, "request_stop_analysis", return_value={
                     "session_id": "mock-workflow-session",
                     "state": "LAB_DONE",
                     "status": "CANCEL_REQUESTED",
                 }):

                with TestClient(main_module.app) as client:
                    health_response = client.get("/health")
                    self.assertEqual(health_response.status_code, 200)
                    self.assertEqual(health_response.json()["status"], "healthy")

                    init_response = client.post(
                        "/api/workflow/v1/session/init",
                        json={
                            "patient_id": "patient-123",
                            "doctor_id": "doctor-456",
                            "correlation_id": "corr-789",
                        },
                    )
                    self.assertEqual(init_response.status_code, 200)
                    session_id = init_response.json()["session_id"]
                    self.assertTrue(session_id)
                    self.assertEqual(init_response.json()["state"], "SESSION_CREATED")

                    extraction_response = client.post(
                        f"/api/workflow/v1/session/{session_id}/extraction",
                        json={
                            "symptoms": ["chest pain"],
                            "risk_factors": ["smoker"],
                            "translated_text": "chest pain",
                            "raw": {"source": "unit-test"},
                        },
                    )
                    self.assertEqual(extraction_response.status_code, 200)
                    self.assertEqual(extraction_response.json()["state"], "EXTRACTION_DONE")

                    ecg_response = client.post(
                        f"/api/workflow/v1/session/{session_id}/ecg",
                        json={"result": {"rhythm": "normal"}},
                    )
                    self.assertEqual(ecg_response.status_code, 200)
                    self.assertEqual(ecg_response.json()["state"], "ECG_DONE")

                    lab_response = client.post(
                        f"/api/workflow/v1/session/{session_id}/lab",
                        json={"result": {"troponin": "negative"}},
                    )
                    self.assertEqual(lab_response.status_code, 200)
                    self.assertEqual(lab_response.json()["state"], "LAB_DONE")

                    session_response = client.get(f"/api/workflow/v1/session/{session_id}")
                    self.assertEqual(session_response.status_code, 200)
                    session_payload = session_response.json()
                    self.assertEqual(session_payload["current_state"], "LAB_DONE")
                    self.assertIn("extraction", session_payload["step_payloads"])
                    self.assertIn("ecg", session_payload["step_payloads"])
                    self.assertIn("lab", session_payload["step_payloads"])

                    analysis_response = client.post(
                        f"/api/workflow/v1/session/{session_id}/analysis/run",
                        json={"experience_level": "seasoned"},
                    )
                    self.assertEqual(analysis_response.status_code, 200)
                    analysis_payload = analysis_response.json()
                    self.assertEqual(analysis_payload["status"], "SUCCESS")

                    sample_analysis_output = {
                        "session_id": analysis_payload["session_id"],
                        "status": analysis_payload["status"],
                        "message": analysis_payload["message"],
                    }
                    print("ANALYSIS_OUTPUT_SAMPLE")
                    print(json.dumps(sample_analysis_output, indent=2, sort_keys=True))

                    stop_response = client.post(f"/api/workflow/v1/session/{session_id}/analysis/stop")
                    self.assertEqual(stop_response.status_code, 200)
                    self.assertEqual(stop_response.json()["status"], "CANCEL_REQUESTED")

                    print(
                        "BACKEND_SMOKE_OK "
                        f"session_id={session_id} "
                        f"workflow_state={session_payload['current_state']}"
                    )

            conn = getattr(workflow_store_module._local, "conn", None)
            if conn is not None:
                conn.close()
                workflow_store_module._local.conn = None


if __name__ == "__main__":
    unittest.main(verbosity=2)
