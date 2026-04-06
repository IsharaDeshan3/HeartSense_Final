from __future__ import annotations

import base64
import copy
import json
import sys
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import database as database_module
import main as main_module
import routers.diabetic as diabetic_router
import routers.heart as heart_router
import routers.lab_agent as lab_agent_router
import routers.lab_reports as lab_reports_router
import routers.patient_history as patient_history_router
import routers.patients as patients_router
import routers.recommendations as recommendations_router
import services.lab_agent_service as lab_agent_service_module


def _match_query(doc: dict, query: dict | None) -> bool:
    if not query:
        return True

    for key, value in query.items():
        if key == "$or":
            if not any(_match_query(doc, branch) for branch in value):
                return False
            continue

        if isinstance(value, dict) and "$in" in value:
            if doc.get(key) not in value["$in"]:
                return False
            continue

        if doc.get(key) != value:
            return False

    return True


def _sort_value(value: object) -> object:
    if isinstance(value, datetime):
        return value
    if isinstance(value, ObjectId):
        return str(value)
    if value is None:
        return ""
    return value


def _fake_gemini_response() -> str:
    return json.dumps(
        {
            "summary": "Evidence-grounded summary for the patient.",
            "category_explanation": {
                "label": "acute",
                "agreement": "agree",
                "reason": "Acute concern supported by evidence and trend context.",
                "citations": ["E1"],
            },
            "findings": [
                {
                    "statement": "Troponin remains above normal and is rising.",
                    "severity": "high",
                    "citations": ["E1"],
                }
            ],
            "trend_insights": [
                {
                    "statement": "Troponin trend is rising across four reports.",
                    "severity": "high",
                    "citations": ["E1"],
                }
            ],
            "recommended_actions": ["Review urgently with cardiology"],
        }
    )


class FakeCursor:
    def __init__(self, docs: list[dict]):
        self._docs = [copy.deepcopy(doc) for doc in docs]
        self._skip = 0
        self._limit: int | None = None

    def sort(self, key_or_list, direction: int | None = None):
        if isinstance(key_or_list, list):
            spec = list(key_or_list)
        elif isinstance(key_or_list, tuple):
            spec = [key_or_list]
        else:
            spec = [(key_or_list, direction or 1)]

        for field, sort_direction in reversed(spec):
            reverse = int(sort_direction) < 0
            self._docs.sort(key=lambda doc, field=field: _sort_value(doc.get(field)), reverse=reverse)
        return self

    def skip(self, amount: int):
        self._skip = max(0, int(amount))
        return self

    def limit(self, amount: int):
        self._limit = max(0, int(amount))
        return self

    async def to_list(self, length: int | None = None):
        items = self._docs[self._skip :]
        if self._limit is not None:
            items = items[: self._limit]
        if length is not None:
            items = items[: int(length)]
        return [copy.deepcopy(doc) for doc in items]


class FakeCollection:
    def __init__(self, docs: list[dict] | None = None):
        self.docs = [copy.deepcopy(doc) for doc in (docs or [])]

    def _matches(self, query: dict | None) -> list[dict]:
        return [doc for doc in self.docs if _match_query(doc, query)]

    async def find_one(self, query: dict | None = None, projection=None, sort=None):
        matched = self._matches(query)
        if sort:
            matched = await FakeCursor(matched).sort(sort).to_list(length=1)
        return copy.deepcopy(matched[0]) if matched else None

    def find(self, query: dict | None = None):
        return FakeCursor(self._matches(query))

    async def insert_one(self, doc: dict):
        stored = copy.deepcopy(doc)
        stored.setdefault("_id", ObjectId())
        self.docs.append(stored)
        return SimpleNamespace(inserted_id=stored["_id"])

    async def insert_many(self, docs: list[dict]):
        inserted_ids = []
        for doc in docs:
            stored = copy.deepcopy(doc)
            stored.setdefault("_id", ObjectId())
            self.docs.append(stored)
            inserted_ids.append(stored["_id"])
        return SimpleNamespace(inserted_ids=inserted_ids)

    async def update_one(self, query: dict, update: dict):
        for doc in self.docs:
            if not _match_query(doc, query):
                continue
            if "$set" in update:
                for key, value in update["$set"].items():
                    doc[key] = copy.deepcopy(value)
            if "$unset" in update:
                for key in update["$unset"].keys():
                    doc.pop(key, None)
            return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def replace_one(self, query: dict, replacement: dict, upsert: bool = False):
        for index, doc in enumerate(self.docs):
            if _match_query(doc, query):
                stored = copy.deepcopy(replacement)
                stored.setdefault("_id", doc.get("_id", ObjectId()))
                self.docs[index] = stored
                return SimpleNamespace(matched_count=1, modified_count=1, upserted_id=None)

        if upsert:
            stored = copy.deepcopy(replacement)
            stored.setdefault("_id", ObjectId())
            self.docs.append(stored)
            return SimpleNamespace(matched_count=0, modified_count=1, upserted_id=stored["_id"])

        return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=None)

    async def delete_one(self, query: dict):
        for index, doc in enumerate(self.docs):
            if _match_query(doc, query):
                del self.docs[index]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def delete_many(self, query: dict):
        before = len(self.docs)
        self.docs = [doc for doc in self.docs if not _match_query(doc, query)]
        return SimpleNamespace(deleted_count=before - len(self.docs))

    async def count_documents(self, query: dict | None = None):
        return len(self._matches(query))

    async def create_index(self, *args, **kwargs):
        return "ok"


class FakeDatabase:
    def __init__(self, collections: dict[str, list[dict]] | None = None):
        self._collections: dict[str, FakeCollection] = {}
        for name, docs in (collections or {}).items():
            self._collections[name] = FakeCollection(docs)

    def __getattr__(self, item: str):
        if item.startswith("__"):
            raise AttributeError(item)
        collection = self._collections.get(item)
        if collection is None:
            collection = FakeCollection()
            self._collections[item] = collection
        return collection

    async def list_collection_names(self):
        return sorted(self._collections.keys())

    async def command(self, name: str):
        if name == "dbStats":
            return {"collections": len(self._collections), "dataSize": 0, "storageSize": 0}
        return {}


def _seed_reports(patient_id: str) -> tuple[list[dict], list[str]]:
    reports = []
    report_ids = []
    for index, troponin in enumerate([0.8, 1.1, 1.4, 1.9], start=1):
        report_id = ObjectId()
        report_ids.append(str(report_id))
        reports.append(
            {
                "_id": report_id,
                "patientId": patient_id,
                "reportDate": f"2026-04-0{index}",
                "reportLabel": f"Report {index}",
                "extractedJsonGroup1": {"troponin": troponin},
                "extractedJsonGroup2": {},
                "labComparison": [
                    {"test": "Troponin", "actualValue": troponin, "normalRange": "0.00-0.10", "status": "High"},
                    {"test": "LDL", "actualValue": 120 + index, "normalRange": "<100", "status": "High"},
                ],
                "summary": "Acute myocardial infarction suspected" if index == 4 else "Monitoring follow-up",
                "recommendedTests": ["Troponin", "ECG"],
                "dailyHealthAdvice": ["Seek immediate medical review"],
                "patientInfo": {"name": "Patient One"},
                "createdAt": datetime(2026, 4, index, 8, 0, 0),
            }
        )
    return reports, report_ids


class LabBackendFullTest(unittest.TestCase):
    def setUp(self):
        self.doctor_id = ObjectId()
        self.patient_id = ObjectId()
        self.patient_id_str = str(self.patient_id)

        lab_reports, self.lab_report_ids = _seed_reports(self.patient_id_str)
        history_id = ObjectId()
        recommendation_id = ObjectId()
        evidence_source_id = ObjectId()
        ocr_job_id = ObjectId()
        job_id = ObjectId()

        self.seeded_evidence_source_id = str(evidence_source_id)
        self.seeded_job_id = str(job_id)
        self.seeded_ocr_job_id = str(ocr_job_id)

        self.fake_db = FakeDatabase(
            {
                "users": [
                    {
                        "_id": self.doctor_id,
                        "name": "Dr. Ada",
                        "email": "doctor@example.com",
                        "doctor_id": "D-100",
                        "role": "doctor",
                        "hashed_password": "hashed-doctor",
                        "created_at": datetime(2026, 4, 1, 8, 0, 0),
                    },
                    {
                        "_id": self.patient_id,
                        "name": "Patient One",
                        "email": "patient@example.com",
                        "age": 44,
                        "role": "patient",
                        "hashed_password": "hashed-patient",
                        "created_at": datetime(2026, 4, 2, 8, 0, 0),
                    },
                ],
                "lab_reports": lab_reports,
                "patient_history": [
                    {
                        "_id": history_id,
                        "patientId": self.patient_id_str,
                        "extractedJsonGroup1": {"notes": "history"},
                        "extractedJsonGroup2": {},
                        "isMedical": True,
                        "labComparison": [],
                        "patientInfo": {"name": "Patient One"},
                        "recommendedTests": ["Troponin"],
                        "summary": "Patient history notes for chronic cardiac monitoring.",
                        "createdAt": datetime(2026, 4, 1, 8, 0, 0),
                    }
                ],
                "diabetic_data": [
                    {
                        "_id": ObjectId(),
                        "patientId": self.patient_id_str,
                        "Age": 44,
                        "BMI": 27.3,
                        "BUN": 13.0,
                        "Chol": 198.0,
                        "Cr": 0.9,
                        "Gender": "F",
                        "HDL": 42.0,
                        "LDL": 126.0,
                        "TG": 160.0,
                        "createdAt": datetime(2026, 4, 2, 8, 0, 0),
                        "updatedAt": datetime(2026, 4, 3, 8, 0, 0),
                    }
                ],
                "heart_data": [
                    {
                        "_id": ObjectId(),
                        "patientId": self.patient_id_str,
                        "age": 44,
                        "ca": 0,
                        "chol": 240,
                        "cp": 2,
                        "exang": 0,
                        "fbs": 0,
                        "oldpeak": 1.2,
                        "restecg": 1,
                        "sex": 0,
                        "slope": 2,
                        "thal": 2,
                        "thalach": 150,
                        "trestbps": 118,
                        "createdAt": datetime(2026, 4, 2, 8, 0, 0),
                        "updatedAt": datetime(2026, 4, 3, 8, 0, 0),
                    }
                ],
                "diabetic": [
                    {
                        "_id": ObjectId(),
                        "patientId": self.patient_id_str,
                        "Age": 44,
                        "BMI": 27.3,
                        "BUN": 13.0,
                        "Chol": 198.0,
                        "Cr": 0.9,
                        "Gender": "F",
                        "HDL": 42.0,
                        "LDL": 126.0,
                        "TG": 160.0,
                        "createdAt": datetime(2026, 4, 2, 8, 0, 0),
                        "updatedAt": datetime(2026, 4, 3, 8, 0, 0),
                    }
                ],
                "heart": [
                    {
                        "_id": ObjectId(),
                        "patientId": self.patient_id_str,
                        "age": 44,
                        "ca": 0,
                        "chol": 240,
                        "cp": 2,
                        "exang": 0,
                        "fbs": 0,
                        "oldpeak": 1.2,
                        "restecg": 1,
                        "sex": 0,
                        "slope": 2,
                        "thal": 2,
                        "thalach": 150,
                        "trestbps": 118,
                        "createdAt": datetime(2026, 4, 2, 8, 0, 0),
                        "updatedAt": datetime(2026, 4, 3, 8, 0, 0),
                    }
                ],
                "recommendations": [
                    {
                        "_id": recommendation_id,
                        "doctor_id": "frontend",
                        "doctor_name": "Frontend Doctor",
                        "patient_id": self.patient_id_str,
                        "patient_name": "Patient One",
                        "date": datetime(2026, 4, 3, 8, 0, 0),
                        "recommendation": "Schedule cardiology follow-up.",
                    }
                ],
                "evidence_sources": [
                    {
                        "_id": evidence_source_id,
                        "name": "Cardiology Guideline",
                        "url": "https://example.org/cardiology-guideline",
                        "sourceType": "guideline",
                        "authority": "Example Society",
                        "tags": ["cardiology"],
                        "isActive": True,
                        "createdBy": str(self.doctor_id),
                        "createdAt": datetime(2026, 4, 1, 8, 0, 0),
                        "updatedAt": datetime(2026, 4, 1, 8, 0, 0),
                        "lastIngestionStatus": "ingested",
                        "lastIngestionAt": datetime(2026, 4, 1, 8, 0, 0),
                        "lastChunkCount": 1,
                    }
                ],
                "evidence_chunks": [
                    {
                        "_id": ObjectId(),
                        "sourceId": str(evidence_source_id),
                        "sourceUrl": "https://example.org/cardiology-guideline",
                        "sourceName": "Cardiology Guideline",
                        "chunkIndex": 0,
                        "text": "Troponin elevation and acute chest pain require urgent cardiology review.",
                        "tokenCountApprox": 11,
                        "createdBy": str(self.doctor_id),
                        "createdAt": datetime(2026, 4, 1, 8, 0, 0),
                        "updatedAt": datetime(2026, 4, 1, 8, 0, 0),
                    }
                ],
                "agent_jobs": [
                    {
                        "_id": job_id,
                        "patientId": self.patient_id_str,
                        "reportIds": self.lab_report_ids,
                        "status": "queued",
                        "stage": "ready_for_analysis",
                        "architectureVersion": "lab-agent-v2",
                        "reportCountAtCreation": len(self.lab_report_ids),
                        "minReportsForTrend": 4,
                        "nextAction": "Run /api/lab-agent/jobs/{job_id}/analyze with evidence source IDs for citation-grounded output.",
                        "createdBy": str(self.doctor_id),
                        "createdAt": datetime(2026, 4, 4, 8, 0, 0),
                        "updatedAt": datetime(2026, 4, 4, 8, 0, 0),
                    }
                ],
                "agent_results": [
                    {
                        "_id": ObjectId(),
                        "jobId": str(job_id),
                        "patientId": self.patient_id_str,
                        "status": "completed",
                        "model": "gemini-2.5-flash",
                        "summary": "Existing grounded summary.",
                        "patientCategory": {
                            "label": "acute",
                            "reason": "Acute indicators detected.",
                            "signals": ["acute_keyword_in_summary_or_history"],
                            "ruleVersion": "deterministic_rules_v1",
                        },
                        "findings": [],
                        "recommendedActions": ["Review with cardiology"],
                        "citations": [
                            {
                                "citationId": "E1",
                                "sourceId": str(evidence_source_id),
                                "sourceName": "Cardiology Guideline",
                                "sourceUrl": "https://example.org/cardiology-guideline",
                                "snippet": "Troponin elevation and acute chest pain require urgent cardiology review.",
                            }
                        ],
                        "trendSummary": "Analyzed 1 analytes with >= 4 points.",
                        "trendPatterns": [
                            {
                                "test": "Troponin",
                                "points": 4,
                                "trend": "rising",
                                "firstValue": 0.8,
                                "latestValue": 1.9,
                                "relativeChange": 1.375,
                                "slopePerReport": 0.366667,
                                "anomalyFlags": ["sudden_change"],
                                "latestStatus": "High",
                            }
                        ],
                        "evidenceUsedCount": 1,
                        "createdAt": datetime(2026, 4, 4, 8, 0, 0),
                    }
                ],
                "ocr_cache": [],
                "ocr_jobs": [
                    {
                        "_id": ocr_job_id,
                        "patientId": self.patient_id_str,
                        "status": "completed",
                        "fileName": "scan.pdf",
                        "mimeType": "application/pdf",
                        "inputHash": "a" * 64,
                        "fromCache": False,
                        "method": "vision",
                        "error": None,
                        "extractedText": "Troponin 1.2 ng/mL",
                        "charCount": 19,
                        "createdBy": str(self.doctor_id),
                        "createdAt": datetime(2026, 4, 4, 8, 0, 0),
                        "updatedAt": datetime(2026, 4, 4, 8, 0, 0),
                    }
                ],
            }
        )

        self.patchers = [
            patch.object(main_module, "connect_to_mongo", new=AsyncMock(return_value=None)),
            patch.object(main_module, "close_mongo_connection", new=AsyncMock(return_value=None)),
            patch.object(main_module, "ensure_lab_agent_indexes", new=AsyncMock(return_value={"ok": True})),
            patch.object(main_module.LabAgentService, "start_ocr_workers", new=AsyncMock(return_value=None)),
            patch.object(main_module.LabAgentService, "stop_ocr_workers", new=AsyncMock(return_value=None)),
            patch.object(database_module, "get_database", return_value=self.fake_db),
            patch.object(database_module, "test_connection", new=AsyncMock(return_value={
                "connected": True,
                "database": "cardiac_db",
                "collections": len(self.fake_db._collections),
                "data_size": 0,
                "storage_size": 0,
            })),
            patch.object(patients_router, "get_database", return_value=self.fake_db),
            patch.object(patient_history_router, "get_database", return_value=self.fake_db),
            patch.object(diabetic_router, "get_database", return_value=self.fake_db),
            patch.object(heart_router, "get_database", return_value=self.fake_db),
            patch.object(lab_reports_router, "get_database", return_value=self.fake_db),
            patch.object(recommendations_router, "get_database", return_value=self.fake_db),
            patch.object(lab_agent_service_module, "get_database", return_value=self.fake_db),
            patch.object(lab_agent_service_module.LabAgentService, "_call_gemini", new=lambda self, prompt: _fake_gemini_response()),
        ]

        for patcher in self.patchers:
            patcher.start()
        self.client = TestClient(main_module.app)
        self.client.__enter__()

    def tearDown(self):
        try:
            self.client.__exit__(None, None, None)
        finally:
            for patcher in reversed(self.patchers):
                patcher.stop()

    def test_root_health_and_db_endpoints(self):
        root_response = self.client.get("/")
        self.assertEqual(root_response.status_code, 200)
        self.assertEqual(root_response.json()["status"], "running")

        health_response = self.client.get("/health")
        self.assertEqual(health_response.status_code, 200)
        self.assertEqual(health_response.json()["status"], "healthy")

        db_response = self.client.get("/db/test")
        self.assertEqual(db_response.status_code, 200)
        payload = db_response.json()
        self.assertEqual(payload["status"], "success")
        self.assertIn("users", payload["collections"])
        self.assertIn("lab_reports", payload["collections"])

    def test_authentication_routes_are_removed(self):
        for path in ("/api/auth/login", "/api/auth/login/json", "/api/auth/me"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 404)

    def test_doctor_routes_cover_patient_and_clinical_data(self):
        patient_list_response = self.client.get("/api/patients/")
        self.assertEqual(patient_list_response.status_code, 200)
        self.assertEqual(len(patient_list_response.json()), 1)

        history_payload = {
            "patientId": self.patient_id_str,
            "extractedJsonGroup1": {"note": "initial history"},
            "extractedJsonGroup2": {},
            "isMedical": True,
            "labComparison": [],
            "patientInfo": {"age": 44},
            "recommendedTests": ["Troponin"],
            "summary": "Detailed cardiac history note.",
        }
        history_create_response = self.client.post("/api/patient-history/", json=history_payload)
        self.assertEqual(history_create_response.status_code, 201)
        created_history = history_create_response.json()

        history_list_response = self.client.get(f"/api/patient-history/?patient_id={self.patient_id_str}")
        self.assertEqual(history_list_response.status_code, 200)
        self.assertGreaterEqual(len(history_list_response.json()), 1)

        history_get_response = self.client.get(f"/api/patient-history/{created_history['id']}")
        self.assertEqual(history_get_response.status_code, 200)

        diabetic_payload = {
            "patientId": self.patient_id_str,
            "Age": 44,
            "BMI": 28.1,
            "BUN": 13.5,
            "Chol": 205.0,
            "Cr": 0.9,
            "Gender": "F",
            "HDL": 41.0,
            "LDL": 129.0,
            "TG": 162.0,
        }
        diabetic_create_response = self.client.post("/api/diabetic/", json=diabetic_payload)
        self.assertEqual(diabetic_create_response.status_code, 201)

        diabetic_get_response = self.client.get(f"/api/diabetic/patient/{self.patient_id_str}")
        self.assertEqual(diabetic_get_response.status_code, 200)
        self.assertEqual(diabetic_get_response.json()["patientId"], self.patient_id_str)

        diabetic_delete_response = self.client.delete(f"/api/diabetic/patient/{self.patient_id_str}")
        self.assertEqual(diabetic_delete_response.status_code, 204)

        heart_payload = {
            "patientId": self.patient_id_str,
            "age": 44,
            "ca": 0,
            "chol": 240,
            "cp": 2,
            "exang": 0,
            "fbs": 0,
            "oldpeak": 1.2,
            "restecg": 1,
            "sex": 0,
            "slope": 2,
            "thal": 2,
            "thalach": 150,
            "trestbps": 118,
        }
        heart_create_response = self.client.post("/api/heart/", json=heart_payload)
        self.assertEqual(heart_create_response.status_code, 201)

        heart_get_response = self.client.get(f"/api/heart/patient/{self.patient_id_str}")
        self.assertEqual(heart_get_response.status_code, 200)
        self.assertEqual(heart_get_response.json()["patientId"], self.patient_id_str)

        heart_delete_response = self.client.delete(f"/api/heart/patient/{self.patient_id_str}")
        self.assertEqual(heart_delete_response.status_code, 204)

        lab_report_payload = {
            "patientId": self.patient_id_str,
            "reportDate": "2026-04-05",
            "reportLabel": "Visit A",
            "extractedJsonGroup1": {"troponin": 2.1},
            "extractedJsonGroup2": {},
            "labComparison": [
                {"test": "Troponin", "actualValue": 2.1, "normalRange": "0.00-0.10", "status": "High"},
            ],
            "summary": "Acute cardiology review needed.",
            "recommendedTests": ["Troponin", "ECG"],
            "dailyHealthAdvice": ["Seek urgent review"],
            "patientInfo": {"name": "Patient One"},
        }
        lab_report_create_response = self.client.post("/api/lab-reports/", json=lab_report_payload)
        self.assertEqual(lab_report_create_response.status_code, 201)
        lab_report_id = lab_report_create_response.json()["id"]

        lab_report_list_response = self.client.get(f"/api/lab-reports/patient/{self.patient_id_str}")
        self.assertEqual(lab_report_list_response.status_code, 200)
        self.assertGreaterEqual(len(lab_report_list_response.json()), 1)

        lab_report_delete_response = self.client.delete(f"/api/lab-reports/{lab_report_id}")
        self.assertEqual(lab_report_delete_response.status_code, 204)

        recommendation_payload = {
            "patient_id": self.patient_id_str,
            "recommendation": "Repeat cardiac biomarkers in 6 hours.",
        }
        recommendation_create_response = self.client.post("/api/recommendations/", json=recommendation_payload)
        self.assertEqual(recommendation_create_response.status_code, 201)
        recommendation_id = recommendation_create_response.json()["id"]

        recommendation_list_response = self.client.get("/api/recommendations/")
        self.assertEqual(recommendation_list_response.status_code, 200)
        self.assertGreaterEqual(len(recommendation_list_response.json()), 1)

        recommendation_get_response = self.client.get(f"/api/recommendations/{recommendation_id}")
        self.assertEqual(recommendation_get_response.status_code, 200)

    def test_routes_are_available_without_backend_auth(self):
        patients_response = self.client.get("/api/patients/")
        self.assertEqual(patients_response.status_code, 200)

        lab_agent_jobs_response = self.client.get("/api/lab-agent/jobs")
        self.assertEqual(lab_agent_jobs_response.status_code, 200)

        lab_agent_create_response = self.client.post(
            "/api/lab-agent/jobs",
            json={"patientId": self.patient_id_str, "reportIds": []},
        )
        self.assertEqual(lab_agent_create_response.status_code, 201)

    def test_lab_agent_full_flow(self):
        architecture_response = self.client.get("/api/lab-agent/architecture")
        self.assertEqual(architecture_response.status_code, 200)
        architecture = architecture_response.json()
        self.assertEqual(architecture["architectureVersion"], "lab-agent-v2")
        self.assertIn("evidence_ingestion", architecture["pipelineStages"])

        evidence_create_response = self.client.post(
            "/api/lab-agent/evidence-sources",
            json={
                "name": "Cardiology Evidence",
                "url": "https://example.org/new-guideline",
                "sourceType": "guideline",
                "authority": "Example Society",
                "tags": ["cardiology", "guideline"],
                "isActive": True,
            },
        )
        self.assertEqual(evidence_create_response.status_code, 201)
        evidence_source_id = evidence_create_response.json()["id"]

        with patch.object(
            lab_agent_router.service,
            "_fetch_url_bytes",
            return_value=(b"Troponin elevation requires urgent review.", "text/plain"),
        ):
            ingest_response = self.client.post(f"/api/lab-agent/evidence-sources/{evidence_source_id}/ingest")
        self.assertEqual(ingest_response.status_code, 200)
        self.assertEqual(ingest_response.json()["status"], "ingested")
        self.assertGreaterEqual(ingest_response.json()["chunkCount"], 1)

        job_create_response = self.client.post(
            "/api/lab-agent/jobs",
            json={
                "patientId": self.patient_id_str,
                "reportIds": self.lab_report_ids,
                "minReportsForTrend": 4,
                "notes": "Run the full lab agent flow.",
            },
        )
        self.assertEqual(job_create_response.status_code, 201)
        job_id = job_create_response.json()["id"]
        self.assertEqual(job_create_response.json()["stage"], "ready_for_analysis")

        jobs_list_response = self.client.get(f"/api/lab-agent/jobs?patient_id={self.patient_id_str}")
        self.assertEqual(jobs_list_response.status_code, 200)
        self.assertGreaterEqual(len(jobs_list_response.json()), 1)

        job_detail_response = self.client.get(f"/api/lab-agent/jobs/{job_id}")
        self.assertEqual(job_detail_response.status_code, 200)
        self.assertEqual(job_detail_response.json()["patientId"], self.patient_id_str)

        analyze_response = self.client.post(
            f"/api/lab-agent/jobs/{job_id}/analyze",
            json={
                "evidenceSourceIds": [evidence_source_id],
                "topK": 5,
                "force": True,
            },
        )
        self.assertEqual(analyze_response.status_code, 200)
        analyze_payload = analyze_response.json()
        self.assertEqual(analyze_payload["jobId"], job_id)
        self.assertEqual(analyze_payload["patientCategory"]["label"], "acute")
        self.assertEqual(analyze_payload["trendPatterns"][0]["trend"], "rising")
        self.assertEqual(analyze_payload["evidenceUsedCount"], 1)
        self.assertEqual(analyze_payload["citations"][0]["citationId"], "E1")

        result_response = self.client.get(f"/api/lab-agent/jobs/{job_id}/result")
        self.assertEqual(result_response.status_code, 200)
        self.assertEqual(result_response.json()["jobId"], job_id)

        ocr_payload = {
            "patientId": self.patient_id_str,
            "fileName": "scan.txt",
            "mimeType": "text/plain",
            "contentBase64": base64.b64encode(b"Troponin 1.2 ng/mL").decode("ascii"),
        }
        ocr_create_response = self.client.post("/api/lab-agent/ocr/jobs", json=ocr_payload)
        self.assertEqual(ocr_create_response.status_code, 202)
        ocr_job_id = ocr_create_response.json()["id"]
        self.assertEqual(ocr_create_response.json()["status"], "queued")

        ocr_get_response = self.client.get(f"/api/lab-agent/ocr/jobs/{ocr_job_id}")
        self.assertEqual(ocr_get_response.status_code, 200)
        self.assertEqual(ocr_get_response.json()["id"], ocr_job_id)


if __name__ == "__main__":
    unittest.main(verbosity=2)