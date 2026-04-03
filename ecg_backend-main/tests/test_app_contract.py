import io
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import app as app_module


class TestAppContract(unittest.TestCase):
    def setUp(self):
        app_module.app.testing = True
        self.client = app_module.app.test_client()

    def test_analyze_rejects_non_list_images(self):
        payload = {"images": "not-a-list", "patientContext": "test"}
        response = self.client.post("/api/analyze", json=payload)

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertIn("error", data)

    def test_analyze_rejects_invalid_base64(self):
        payload = {"images": ["%%%invalid%%%"], "leads": [[]]}
        response = self.client.post("/api/analyze", json=payload)

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["error"], "Invalid request")

    @patch("app.analyze_ecg_with_gemini")
    def test_analyze_propagates_qc_rejection_as_400(self, mock_analyze):
        mock_analyze.side_effect = ValueError("ECG quality too low for reliable analysis")

        tiny_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s0w4xkAAAAASUVORK5CYII="
        payload = {"images": [tiny_png_b64], "leads": [[]]}
        response = self.client.post("/api/analyze", json=payload)

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["error"], "Invalid request")
        self.assertIn("quality", data["message"].lower())

    @patch("app.analyze_ecg_with_gemini")
    def test_analyze_file_calls_multi_segment_analyzer(self, mock_analyze):
        mock_analyze.return_value = {
            "rhythm_analysis": {
                "heart_rate": 70,
                "rhythm_type": "Sinus Rhythm",
                "regularity": "regular",
            },
            "abnormalities": {
                "abnormalities": ["No significant abnormalities detected"],
                "severity": "normal",
                "affected_leads": [],
            },
            "diagnosis": {
                "primary_diagnosis": "Normal ECG",
                "differential_diagnoses": [],
                "recommendations": [],
                "urgency": "routine",
            },
        }

        file_data = {
            "file": (io.BytesIO(b"fake-image-bytes"), "ecg.png"),
            "patientContext": "chest pain",
        }
        response = self.client.post(
            "/api/analyze-file",
            data=file_data,
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        args, kwargs = mock_analyze.call_args
        self.assertIsInstance(args[0], list)
        self.assertEqual(len(args[0]), 1)
        self.assertEqual(kwargs["leads_mapping"], [[]])

    def test_save_ecg_record_persists_provenance_and_quality(self):
        mock_ecg_records = Mock()
        mock_ecg_records.insert_one.return_value = SimpleNamespace(inserted_id="abc123")
        mock_history = Mock()
        mock_db = SimpleNamespace(
            ecg_records=mock_ecg_records,
            ecg_patient_history=mock_history,
        )

        analysis_payload = {
            "rhythm_analysis": {
                "heart_rate": 78,
                "rhythm_type": "Sinus Rhythm",
                "regularity": "regular",
            },
            "abnormalities": {
                "abnormalities": ["No significant abnormalities detected"],
                "severity": "normal",
                "affected_leads": [],
            },
            "diagnosis": {
                "primary_diagnosis": "Normal ECG",
                "differential_diagnoses": [],
                "recommendations": [],
                "urgency": "routine",
            },
            "quality_control": {
                "overall_score": 0.84,
                "overall_grade": "high",
                "status": "ok",
            },
            "provenance": {
                "pipeline_version": "ecg_backend_r1",
                "model_name": "gemini-2.5-flash",
                "prompt_version": "panoramic_v2",
                "generated_at_utc": "2026-04-03T08:00:00+00:00",
            },
        }

        payload = {
            "patient_id": "p-001",
            "analysis": analysis_payload,
            "segments_count": 1,
        }

        with patch.object(app_module, "MONGO_AVAILABLE", True), patch.object(
            app_module, "mongo_db", mock_db
        ):
            response = self.client.post("/api/ecg/records", json=payload)

        self.assertEqual(response.status_code, 201)
        inserted = mock_ecg_records.insert_one.call_args.args[0]
        self.assertIn("quality_control", inserted)
        self.assertIn("provenance", inserted)
        self.assertEqual(inserted["provenance"]["pipeline_version"], "ecg_backend_r1")
        self.assertEqual(inserted["quality_control"]["overall_grade"], "high")
        self.assertIn("session_technical_trace", inserted)

    def test_get_ecg_records_doctor_projection_hides_technical_trace(self):
        mock_cursor = Mock()
        mock_cursor.sort.return_value = mock_cursor
        mock_cursor.limit.return_value = [
            {
                "_id": "rec-001",
                "patient_id": "p-001",
                "session_id": "s-001",
                "analysis": {
                    "rhythm_analysis": {"heart_rate": 80, "rhythm_type": "Sinus Rhythm", "regularity": "regular"},
                    "abnormalities": {"abnormalities": [], "severity": "normal", "affected_leads": []},
                    "diagnosis": {"primary_diagnosis": "Normal ECG", "differential_diagnoses": [], "recommendations": [], "urgency": "routine"},
                    "quality_control": {"overall_score": 0.9, "overall_grade": "high", "status": "ok"},
                    "deterministic_metrics": [{"segment_id": 1, "status": "success"}],
                    "provenance": {"pipeline_version": "ecg_backend_r1", "model_name": "gemini-2.5-flash"},
                },
                "finding_summary": {"severity": "normal"},
                "session_technical_trace": [{"id": "ingestion"}],
                "created_at": None,
            }
        ]

        mock_db = SimpleNamespace(ecg_records=Mock(find=Mock(return_value=mock_cursor)))

        with patch.object(app_module, "MONGO_AVAILABLE", True), patch.object(app_module, "mongo_db", mock_db):
            response = self.client.get("/api/ecg/records/p-001?projection=doctor")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        record = payload["records"][0]
        self.assertEqual(payload["projection"], "doctor")
        self.assertIn("analysis", record)
        self.assertIn("quality_indicator", record["analysis"])
        self.assertNotIn("deterministic_metrics", record["analysis"])
        self.assertNotIn("session_technical_trace", record)

    def test_get_ecg_session_detail_admin_appends_chat_step(self):
        record = {
            "_id": "rec-100",
            "patient_id": "p-010",
            "session_id": "s-010",
            "analysis": {
                "rhythm_analysis": {"heart_rate": 95, "rhythm_type": "Sinus Tachycardia", "regularity": "regular"},
                "abnormalities": {"abnormalities": ["ST Elevation"], "severity": "severe", "affected_leads": ["II"]},
                "diagnosis": {"primary_diagnosis": "STEMI", "differential_diagnoses": [], "recommendations": [], "urgency": "emergent"},
            },
            "quality_control": {"overall_score": 0.76, "overall_grade": "moderate", "status": "ok"},
            "provenance": {"pipeline_version": "ecg_backend_r1", "model_name": "gemini-2.5-flash"},
            "session_technical_trace": [{"id": "ingestion", "label": "Request Ingestion", "status": "success"}],
            "created_at": None,
        }

        mock_db = SimpleNamespace(
            ecg_records=SimpleNamespace(find_one=Mock(return_value=record)),
            ecg_conversations=SimpleNamespace(count_documents=Mock(return_value=3)),
        )

        with patch.object(app_module, "MONGO_AVAILABLE", True), patch.object(app_module, "mongo_db", mock_db):
            response = self.client.get("/api/ecg/sessions/s-010?projection=admin")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["projection"], "admin")
        steps = payload["session"].get("session_technical_trace", [])
        self.assertTrue(any(step.get("id") == "chat_interactions" for step in steps))


if __name__ == "__main__":
    unittest.main()
