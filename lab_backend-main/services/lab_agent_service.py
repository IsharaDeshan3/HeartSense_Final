from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import io
import json
import logging
import math
import re
import statistics
from datetime import datetime
from html.parser import HTMLParser
from typing import Optional
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

from bson import ObjectId
from fastapi import HTTPException, status

from config import settings
from database import get_database
from models import (
    EvidenceIngestionResponse,
    EvidenceSourceCreate,
    EvidenceSourceResponse,
    LabAgentAnalyzeRequest,
    LabAgentArchitectureResponse,
    LabAgentCitation,
    LabAgentJobCreate,
    LabAgentJobResponse,
    LabAgentResultResponse,
    OcrJobCreate,
    OcrJobResponse,
    OcrJobResultResponse,
    TrendPattern,
)

logger = logging.getLogger(__name__)


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data and data.strip():
            self._parts.append(data.strip())

    def text(self) -> str:
        return "\n".join(self._parts)


class LabAgentService:
    """Step-2 lab agent: evidence ingestion, retrieval, Gemini analysis, citation checks."""

    ARCHITECTURE_VERSION = "lab-agent-v2"
    _ocr_queue: Optional[asyncio.Queue[str]] = None
    _ocr_workers: list[asyncio.Task] = []
    _ocr_started: bool = False

    @staticmethod
    def _actor_id(current_user: Optional[dict] = None) -> str:
        return str((current_user or {}).get("_id") or "frontend")

    @classmethod
    def _ensure_ocr_queue(cls) -> asyncio.Queue[str]:
        if cls._ocr_queue is None:
            cls._ocr_queue = asyncio.Queue()
        return cls._ocr_queue

    @staticmethod
    def _to_ocr_job_response(doc: dict) -> OcrJobResponse:
        return OcrJobResponse(
            id=str(doc.get("_id") or ""),
            patientId=doc.get("patientId"),
            status=doc.get("status", "queued"),
            fileName=doc.get("fileName"),
            mimeType=doc.get("mimeType", "application/octet-stream"),
            inputHash=doc.get("inputHash", ""),
            fromCache=bool(doc.get("fromCache", False)),
            method=doc.get("method"),
            error=doc.get("error"),
            createdAt=doc.get("createdAt") or datetime.utcnow(),
            updatedAt=doc.get("updatedAt") or datetime.utcnow(),
        )

    @staticmethod
    def _to_ocr_job_result_response(doc: dict) -> OcrJobResultResponse:
        extracted = str(doc.get("extractedText") or "")
        return OcrJobResultResponse(
            id=str(doc.get("_id") or ""),
            patientId=doc.get("patientId"),
            status=doc.get("status", "queued"),
            fileName=doc.get("fileName"),
            mimeType=doc.get("mimeType", "application/octet-stream"),
            inputHash=doc.get("inputHash", ""),
            fromCache=bool(doc.get("fromCache", False)),
            method=doc.get("method"),
            error=doc.get("error"),
            createdAt=doc.get("createdAt") or datetime.utcnow(),
            updatedAt=doc.get("updatedAt") or datetime.utcnow(),
            extractedText=extracted or None,
            charCount=len(extracted),
        )

    @staticmethod
    def _patient_query(patient_id: str) -> dict:
        return {"$or": [{"patientId": patient_id}, {"userId": patient_id}]}

    @staticmethod
    def _to_evidence_response(doc: dict) -> EvidenceSourceResponse:
        return EvidenceSourceResponse(
            id=str(doc["_id"]),
            name=doc["name"],
            url=doc["url"],
            sourceType=doc["sourceType"],
            authority=doc.get("authority"),
            tags=doc.get("tags", []),
            isActive=doc.get("isActive", True),
            createdBy=doc["createdBy"],
            createdAt=doc["createdAt"],
            updatedAt=doc["updatedAt"],
        )

    @staticmethod
    def _to_job_response(doc: dict) -> LabAgentJobResponse:
        return LabAgentJobResponse(
            id=str(doc["_id"]),
            patientId=doc["patientId"],
            reportIds=doc.get("reportIds", []),
            status=doc["status"],
            stage=doc["stage"],
            architectureVersion=doc["architectureVersion"],
            reportCountAtCreation=doc.get("reportCountAtCreation", 0),
            minReportsForTrend=doc.get("minReportsForTrend", 4),
            nextAction=doc.get("nextAction", ""),
            createdBy=doc["createdBy"],
            createdAt=doc["createdAt"],
            updatedAt=doc["updatedAt"],
        )

    @staticmethod
    def _normalize_text(text: str) -> str:
        return re.sub(r"\s+", " ", (text or "").strip())

    @staticmethod
    def _tokenize(text: str) -> set[str]:
        return set(re.findall(r"[A-Za-z][A-Za-z0-9_\-]{2,}", (text or "").lower()))

    @staticmethod
    def _split_chunks(text: str, chunk_size: int, overlap: int) -> list[str]:
        normalized = LabAgentService._normalize_text(text)
        if not normalized:
            return []
        if chunk_size <= 0:
            return [normalized]

        chunks: list[str] = []
        start = 0
        step = max(1, chunk_size - max(0, overlap))
        while start < len(normalized):
            end = min(len(normalized), start + chunk_size)
            chunk = normalized[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= len(normalized):
                break
            start += step
        return chunks

    @staticmethod
    def _extract_text_from_html(html_text: str) -> str:
        cleaner = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html_text)
        parser = _HTMLTextExtractor()
        parser.feed(cleaner)
        return parser.text()

    @staticmethod
    def _read_http_error_detail(exc: HTTPError) -> str:
        try:
            body = exc.read().decode("utf-8", errors="ignore") if exc.fp else ""
        except Exception:
            body = ""
        compact = re.sub(r"\s+", " ", body).strip()
        return compact[:800] if compact else ""

    @staticmethod
    def _extract_json_from_text(text: str) -> dict:
        cleaned = (text or "").strip()
        cleaned = cleaned.replace("```json", "").replace("```", "").strip()
        if not cleaned:
            raise ValueError("Empty Gemini response")

        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            raise ValueError("Gemini response did not include a JSON object")
        parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict):
            raise ValueError("Gemini JSON root must be an object")
        return parsed

    def _fetch_url_bytes(self, url: str) -> tuple[bytes, str]:
        req = Request(
            url,
            headers={
                "User-Agent": "HeartSenseLabAgent/1.0 (+clinical-evidence-ingestion)",
                "Accept": "text/html,application/pdf,text/plain,*/*",
            },
            method="GET",
        )
        timeout = max(10, int(settings.LAB_AGENT_GEMINI_TIMEOUT_SEC))
        with urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            content_type = str(resp.headers.get("Content-Type") or "").lower()
            return data, content_type

    def _extract_text_from_bytes(self, *, data: bytes, content_type: str, url: str) -> tuple[str, str]:
        is_pdf = "application/pdf" in content_type or url.lower().endswith(".pdf")
        if is_pdf:
            try:
                from pypdf import PdfReader
            except Exception as exc:
                raise RuntimeError(
                    "PDF source detected but pypdf is not available in this backend environment"
                ) from exc

            reader = PdfReader(io.BytesIO(data))
            pages: list[str] = []
            for page in reader.pages:
                pages.append(page.extract_text() or "")
            return "\n".join(pages), "application/pdf"

        decoded = ""
        for enc in ("utf-8", "latin-1"):
            try:
                decoded = data.decode(enc)
                break
            except Exception:
                continue

        if not decoded:
            decoded = data.decode("utf-8", errors="ignore")

        if "text/html" in content_type or "<html" in decoded.lower():
            return self._extract_text_from_html(decoded), "text/html"

        return decoded, "text/plain"

    def _call_gemini(self, prompt: str) -> str:
        api_key = (settings.GEMINI_API_KEY or "").strip()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        model = settings.GEMINI_MODEL.strip() or "gemini-2.5-flash"
        base = settings.GEMINI_API_BASE.rstrip("/")
        endpoint = f"{base}/models/{model}:generateContent?key={api_key}"

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "topP": 0.9,
                "responseMimeType": "application/json",
            },
        }

        req = Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        timeout = max(30, int(settings.LAB_AGENT_GEMINI_TIMEOUT_SEC))
        try:
            with urlopen(req, timeout=timeout) as resp:
                response_body = resp.read().decode("utf-8", errors="ignore")
        except HTTPError as exc:
            detail = self._read_http_error_detail(exc)
            logger.error(
                "Gemini analyze HTTPError status=%s model=%s endpoint=%s detail=%s",
                exc.code,
                model,
                endpoint,
                detail,
            )
            raise RuntimeError(f"Gemini API request failed ({exc.code})") from exc
        except URLError as exc:
            logger.error("Gemini analyze URLError model=%s endpoint=%s error=%s", model, endpoint, exc)
            raise RuntimeError("Gemini API request failed (network error)") from exc
        except TimeoutError as exc:
            logger.error("Gemini analyze timeout model=%s endpoint=%s timeout=%s", model, endpoint, timeout)
            raise RuntimeError("Gemini API request timed out") from exc

        try:
            parsed = json.loads(response_body)
        except json.JSONDecodeError as exc:
            logger.error(
                "Gemini analyze returned non-JSON model=%s endpoint=%s body=%s",
                model,
                endpoint,
                re.sub(r"\s+", " ", response_body).strip()[:800],
            )
            raise RuntimeError("Gemini API returned invalid JSON") from exc

        candidates = parsed.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            chunks: list[str] = []
            for part in parts:
                if isinstance(part, dict):
                    txt = str(part.get("text") or "").strip()
                    if txt:
                        chunks.append(txt)
            if chunks:
                return "\n".join(chunks)
        return ""

    @staticmethod
    def _strip_data_uri_prefix(content_base64: str) -> tuple[str, Optional[str]]:
        cleaned = (content_base64 or "").strip()
        if cleaned.startswith("data:") and "," in cleaned:
            header, body = cleaned.split(",", 1)
            mime = None
            match = re.match(r"^data:([^;]+)", header.strip(), re.IGNORECASE)
            if match:
                mime = match.group(1).strip().lower()
            return body.strip(), mime
        return cleaned, None

    @staticmethod
    def _decode_base64_payload(content_base64: str) -> tuple[bytes, Optional[str]]:
        payload, mime_from_data_uri = LabAgentService._strip_data_uri_prefix(content_base64)
        try:
            decoded = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid base64 payload: {exc}",
            )
        return decoded, mime_from_data_uri

    def _extract_text_with_gemini_ocr(self, *, file_bytes: bytes, mime_type: str) -> str:
        api_key = (settings.GEMINI_API_KEY or "").strip()
        if not api_key:
            return ""

        model = settings.GEMINI_MODEL.strip() or "gemini-2.5-flash"
        base = settings.GEMINI_API_BASE.rstrip("/")
        endpoint = f"{base}/models/{model}:generateContent?key={api_key}"
        b64_data = base64.b64encode(file_bytes).decode("utf-8")

        prompt = (
            "Extract all readable medical/lab-report text exactly as seen. "
            "Return plain text only. Preserve units and values where possible."
        )
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inlineData": {
                                "mimeType": mime_type or "application/octet-stream",
                                "data": b64_data,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.0,
                "topP": 0.9,
            },
        }

        req = Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        timeout = max(20, int(settings.LAB_AGENT_OCR_GEMINI_TIMEOUT_SEC))
        try:
            with urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8", errors="ignore")
        except HTTPError as exc:
            detail = self._read_http_error_detail(exc)
            logger.error(
                "Gemini OCR HTTPError status=%s model=%s mime=%s bytes=%s detail=%s",
                exc.code,
                model,
                mime_type,
                len(file_bytes),
                detail,
            )
            raise RuntimeError(f"Gemini OCR failed ({exc.code})") from exc
        except URLError as exc:
            logger.error(
                "Gemini OCR URLError model=%s mime=%s bytes=%s error=%s",
                model,
                mime_type,
                len(file_bytes),
                exc,
            )
            raise RuntimeError("Gemini OCR failed (network error)") from exc
        except TimeoutError as exc:
            logger.error(
                "Gemini OCR timeout model=%s mime=%s bytes=%s timeout=%s",
                model,
                mime_type,
                len(file_bytes),
                timeout,
            )
            raise RuntimeError("Gemini OCR request timed out") from exc

        try:
            parsed = json.loads(body)
        except json.JSONDecodeError as exc:
            logger.error(
                "Gemini OCR returned non-JSON model=%s mime=%s body=%s",
                model,
                mime_type,
                re.sub(r"\s+", " ", body).strip()[:800],
            )
            raise RuntimeError("Gemini OCR returned invalid JSON") from exc

        candidates = parsed.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            out: list[str] = []
            for part in parts:
                if isinstance(part, dict):
                    text = str(part.get("text") or "").strip()
                    if text:
                        out.append(text)
            if out:
                return "\n".join(out)
        return ""

    @staticmethod
    def _extract_numeric_value(value: object) -> Optional[float]:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        text = str(value or "").strip().replace(",", "")
        if not text:
            return None
        match = re.search(r"[-+]?\d*\.?\d+", text)
        if not match:
            return None
        try:
            return float(match.group(0))
        except ValueError:
            return None

    @staticmethod
    def _canonical_test_name(test_name: str) -> tuple[str, str]:
        raw = str(test_name or "").strip().lower()
        compact = re.sub(r"[^a-z0-9]+", " ", raw).strip()

        alias_groups: list[tuple[str, tuple[str, ...], str]] = [
            ("troponin", ("troponin", "hs troponin", "trop i", "trop t"), "Troponin"),
            ("ldh", ("ldh", "lactate dehydrogenase"), "LDH"),
            ("bnp", ("bnp", "nt probnp", "nt pro bnp", "ntpro bnp"), "BNP/NT-proBNP"),
            ("creatinine", ("creatinine", "serum creatinine", "cr"), "Creatinine"),
            ("hemoglobin", ("hemoglobin", "haemoglobin", "hb", "hgb"), "Hemoglobin"),
            ("cholesterol_total", ("total cholesterol", "cholesterol total", "chol"), "Total Cholesterol"),
            ("ldl", ("ldl", "ldl cholesterol"), "LDL Cholesterol"),
            ("hdl", ("hdl", "hdl cholesterol"), "HDL Cholesterol"),
            ("triglycerides", ("triglycerides", "triglyceride", "tg"), "Triglycerides"),
            ("glucose", ("glucose", "blood sugar", "fbs", "fasting glucose"), "Glucose"),
            ("crp", ("crp", "c reactive protein", "c reactive"), "CRP"),
        ]

        for key, aliases, display in alias_groups:
            if any(alias in compact for alias in aliases):
                return key, display

        fallback = re.sub(r"\s+", " ", compact).strip() or raw or "unknown_test"
        display = " ".join(part.capitalize() for part in fallback.split(" "))
        return fallback.replace(" ", "_"), display

    @staticmethod
    def _safe_rel_change(first: float, latest: float) -> float:
        base = abs(first)
        if base < 1e-9:
            return latest - first
        return (latest - first) / base

    async def _derive_trend_patterns(self, *, job_doc: dict) -> dict:
        """
        Deterministic trend analysis across historical lab reports.
        Uses a strict minimum points threshold (default >=4) per analyte.
        """
        db = get_database()
        patient_id = str(job_doc.get("patientId") or "")
        min_points = max(2, int(settings.LAB_AGENT_TREND_MIN_POINTS))

        reports = await db.lab_reports.find(self._patient_query(patient_id)).sort(
            [("reportDate", 1), ("createdAt", 1)]
        ).to_list(length=200)

        if not reports:
            return {
                "summary": "No reports available for trend analysis.",
                "patterns": [],
                "context": "TREND_ENGINE: no reports available.",
            }

        series: dict[str, dict] = {}
        for report in reports:
            comparisons = report.get("labComparison") or []
            if not isinstance(comparisons, list):
                continue
            for item in comparisons:
                if not isinstance(item, dict):
                    continue
                test_name = str(item.get("test") or "").strip()
                if not test_name:
                    continue
                test_key, test_display = self._canonical_test_name(test_name)
                value = self._extract_numeric_value(item.get("actualValue"))
                if value is None:
                    continue
                if test_key not in series:
                    series[test_key] = {"name": test_display, "values": [], "statuses": []}
                series[test_key]["values"].append(value)
                series[test_key]["statuses"].append(str(item.get("status") or "").strip())

        rel_threshold = max(0.01, float(settings.LAB_AGENT_TREND_REL_CHANGE_THRESHOLD))
        jump_threshold = max(0.01, float(settings.LAB_AGENT_TREND_JUMP_THRESHOLD))
        z_alert = max(0.5, float(settings.LAB_AGENT_TREND_ZSCORE_ALERT))
        max_tests = max(1, int(settings.LAB_AGENT_TREND_MAX_TESTS))

        patterns: list[TrendPattern] = []
        insufficient_tests: list[str] = []
        for _, payload in series.items():
            values = payload["values"]
            statuses = payload["statuses"]
            if len(values) < min_points:
                insufficient_tests.append(payload["name"])
                continue

            first_val = float(values[0])
            latest_val = float(values[-1])
            rel_change = self._safe_rel_change(first_val, latest_val)
            slope = (latest_val - first_val) / max(1, len(values) - 1)

            if rel_change >= rel_threshold:
                trend = "rising"
            elif rel_change <= -rel_threshold:
                trend = "falling"
            else:
                trend = "stable"

            anomaly_flags: list[str] = []
            baseline = values[:-1]
            if len(baseline) >= 2:
                mean_val = statistics.mean(baseline)
                try:
                    stdev_val = statistics.pstdev(baseline)
                except statistics.StatisticsError:
                    stdev_val = 0.0
                if stdev_val > 1e-9:
                    z_latest = abs((latest_val - mean_val) / stdev_val)
                    if z_latest >= z_alert:
                        anomaly_flags.append("zscore_deviation")

            prev_val = values[-2]
            jump = self._safe_rel_change(prev_val, latest_val)
            if abs(jump) >= jump_threshold:
                anomaly_flags.append("sudden_change")

            latest_status = statuses[-1] if statuses else None
            if str(latest_status or "").strip().lower() in {"high", "low", "critical", "abnormal"}:
                anomaly_flags.append("latest_status_abnormal")

            patterns.append(
                TrendPattern(
                    test=payload["name"],
                    points=len(values),
                    trend=trend,
                    firstValue=round(first_val, 6),
                    latestValue=round(latest_val, 6),
                    relativeChange=round(rel_change, 6),
                    slopePerReport=round(slope, 6),
                    anomalyFlags=list(dict.fromkeys(anomaly_flags)),
                    latestStatus=latest_status,
                )
            )

        # Prioritize anomalies then larger absolute relative changes.
        patterns.sort(
            key=lambda p: (len(p.anomalyFlags), abs(p.relativeChange), p.points),
            reverse=True,
        )
        patterns = patterns[:max_tests]

        if not patterns:
            summary = (
                f"Trend engine requires >= {min_points} points per analyte; "
                f"insufficient data for all analytes ({len(insufficient_tests)} under threshold)."
            )
            context = f"TREND_ENGINE: {summary}"
            return {"summary": summary, "patterns": [], "context": context}

        anomaly_tests = [p.test for p in patterns if p.anomalyFlags]
        summary_parts = [
            f"Analyzed {len(patterns)} analytes with >= {min_points} points.",
            f"Anomalies detected in {len(anomaly_tests)} analytes.",
        ]
        if insufficient_tests:
            summary_parts.append(f"{len(insufficient_tests)} analytes had < {min_points} points and were excluded.")
        summary = " ".join(summary_parts)

        trend_lines: list[str] = [f"TREND_ENGINE_SUMMARY: {summary}"]
        for idx, pattern in enumerate(patterns, start=1):
            trend_lines.append(
                "TREND_{idx}: test={test} points={points} trend={trend} first={first} latest={latest} "
                "rel_change={rel} slope={slope} anomalies={anoms} latest_status={status}".format(
                    idx=idx,
                    test=pattern.test,
                    points=pattern.points,
                    trend=pattern.trend,
                    first=pattern.firstValue,
                    latest=pattern.latestValue,
                    rel=pattern.relativeChange,
                    slope=pattern.slopePerReport,
                    anoms=",".join(pattern.anomalyFlags) if pattern.anomalyFlags else "none",
                    status=pattern.latestStatus or "unknown",
                )
            )

        return {
            "summary": summary,
            "patterns": [p.model_dump() for p in patterns],
            "context": "\n".join(trend_lines),
        }

    @staticmethod
    def _contains_any_keyword(text: str, keywords: set[str]) -> bool:
        lowered = (text or "").lower()
        return any(k in lowered for k in keywords)

    async def _derive_deterministic_category(self, *, job_doc: dict) -> dict:
        """
        Rule-based authoritative category classifier.
        Gemini may explain this label, but cannot override it.
        """
        db = get_database()
        patient_id = str(job_doc.get("patientId") or "")

        reports = await db.lab_reports.find(self._patient_query(patient_id)).sort(
            [("reportDate", -1), ("createdAt", -1)]
        ).to_list(length=50)
        latest_report = reports[0] if reports else None
        report_count = len(reports)

        history = await db.patient_history.find_one(
            self._patient_query(patient_id),
            sort=[("createdAt", -1)],
        )
        diabetic_doc = await db.diabetic.find_one(self._patient_query(patient_id), {"_id": 1})
        heart_doc = await db.heart.find_one(self._patient_query(patient_id), {"_id": 1})

        combined_text = "\n".join(
            [
                str((latest_report or {}).get("summary") or ""),
                str((history or {}).get("summary") or ""),
                " ".join(str(x) for x in ((latest_report or {}).get("recommendedTests") or [])),
            ]
        ).lower()

        # 1) Hard incomplete rule when no reports exist.
        if report_count == 0:
            return {
                "label": "incomplete",
                "reason": "No lab reports are available for the patient, so category defaults to incomplete.",
                "signals": ["no_reports_available"],
                "ruleVersion": "deterministic_rules_v1",
            }

        acute_signals: list[str] = []
        multimorbid_signals: list[str] = []
        incomplete_signals: list[str] = []

        acute_keywords = {
            "acute",
            "stemi",
            "nstemi",
            "myocardial infarction",
            "unstable angina",
            "cardiogenic shock",
            "emergency",
            "urgent",
            "severe chest pain",
            "acute coronary",
        }
        if self._contains_any_keyword(combined_text, acute_keywords):
            acute_signals.append("acute_keyword_in_summary_or_history")

        latest_comparisons = (latest_report or {}).get("labComparison") or []
        abnormal_count = 0
        test_names: list[str] = []
        for item in latest_comparisons:
            if not isinstance(item, dict):
                continue
            test_name = str(item.get("test") or "").strip().lower()
            if test_name:
                test_names.append(test_name)
            status_value = str(item.get("status") or "").strip().lower()
            if status_value in {"high", "low", "critical", "abnormal"}:
                abnormal_count += 1

        if abnormal_count >= 3:
            acute_signals.append("multiple_abnormal_markers_in_latest_report")

        if any("troponin" in t or "nt-probnp" in t or "bnp" in t for t in test_names) and abnormal_count >= 2:
            acute_signals.append("cardiac_marker_abnormality_signal")

        # 2) Acute has highest priority if severe indicators are present.
        if acute_signals:
            return {
                "label": "acute",
                "reason": "Acute indicators were detected in the latest clinical context and/or abnormal markers.",
                "signals": acute_signals,
                "ruleVersion": "deterministic_rules_v1",
            }

        # 3) Multimorbid when concurrent disease modules or comorbidity terms appear.
        if diabetic_doc is not None and heart_doc is not None:
            multimorbid_signals.append("diabetic_and_heart_modules_present")

        multimorbid_keywords = {"diabetes", "ckd", "kidney", "hypertension", "copd", "stroke"}
        keyword_hits = sum(1 for k in multimorbid_keywords if k in combined_text)
        if keyword_hits >= 2:
            multimorbid_signals.append("multiple_comorbidity_terms_detected")

        if multimorbid_signals:
            return {
                "label": "multimorbid",
                "reason": "Multiple concurrent comorbidity signals were identified, requiring integrated management.",
                "signals": multimorbid_signals,
                "ruleVersion": "deterministic_rules_v1",
            }

        # 4) Incomplete when data coverage is weak.
        if report_count < 2:
            incomplete_signals.append("insufficient_report_history")

        if not latest_comparisons:
            incomplete_signals.append("latest_report_missing_lab_comparisons")

        required_markers = {
            "troponin": ["troponin"],
            "inflammation": ["crp", "c-reactive"],
            "heart_failure": ["bnp", "nt-probnp"],
            "lipid": ["ldl", "hdl", "chol", "triglycer"],
        }
        marker_coverage = 0
        for aliases in required_markers.values():
            if any(any(alias in test for alias in aliases) for test in test_names):
                marker_coverage += 1

        if marker_coverage < 2:
            incomplete_signals.append("low_marker_coverage_in_latest_report")

        if incomplete_signals:
            return {
                "label": "incomplete",
                "reason": "Data completeness is insufficient for full category confidence, so incomplete is assigned.",
                "signals": incomplete_signals,
                "ruleVersion": "deterministic_rules_v1",
            }

        # 5) Otherwise classify as chronic follow-up profile.
        chronic_signals = ["longitudinal_monitoring_profile"]
        if report_count >= 4:
            chronic_signals.append("multiple_reports_available_for_trending")
        return {
            "label": "chronic",
            "reason": "No acute/multimorbid/incomplete triggers fired; profile fits chronic monitoring.",
            "signals": chronic_signals,
            "ruleVersion": "deterministic_rules_v1",
        }

    def _build_analysis_prompt(
        self,
        *,
        patient_context: str,
        evidence_context: str,
        deterministic_category: dict,
        trend_context: str,
    ) -> str:
        det_label = str(deterministic_category.get("label") or "incomplete")
        det_reason = str(deterministic_category.get("reason") or "Deterministic category reason unavailable")
        det_signals = ", ".join(str(x) for x in (deterministic_category.get("signals") or [])) or "none"

        return (
            "You are a cardiology clinical decision-support agent.\n"
            "Use ONLY the provided patient data and evidence snippets.\n"
            "Every clinical claim must cite one or more evidence IDs from the evidence block.\n"
            "Never cite IDs that are not present in the evidence block.\n"
            "Patient category label is AUTHORITATIVE from deterministic rules and must not be changed.\n"
            "Your role is to explain and support that category with evidence citations.\n"
            "Use TREND_ENGINE signals as deterministic trend inputs; do not invent trend math.\n"
            "\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            "  \"summary\": \"string\",\n"
            "  \"category_explanation\": {\n"
            "    \"label\": \""
            + det_label
            + "\",\n"
            "    \"agreement\": \"agree|caution\",\n"
            "    \"reason\": \"string\",\n"
            "    \"citations\": [\"E1\"]\n"
            "  },\n"
            "  \"findings\": [\n"
            "    {\"statement\": \"string\", \"severity\": \"critical|high|moderate|low|info\", \"citations\": [\"E1\"]}\n"
            "  ],\n"
            "  \"trend_insights\": [\n"
            "    {\"statement\": \"string\", \"severity\": \"critical|high|moderate|low|info\", \"citations\": [\"E1\"]}\n"
            "  ],\n"
            "  \"recommended_actions\": [\"string\"]\n"
            "}\n"
            "\n"
            "DETERMINISTIC_CATEGORY:\n"
            f"label={det_label}\n"
            f"reason={det_reason}\n"
            f"signals={det_signals}\n\n"
            "TREND_ENGINE:\n"
            f"{trend_context}\n\n"
            "PATIENT_CONTEXT:\n"
            f"{patient_context}\n\n"
            "EVIDENCE_SNIPPETS:\n"
            f"{evidence_context}\n"
        )

    def _validate_and_shape_output(
        self,
        *,
        model_json: dict,
        evidence_map: dict[str, dict],
        deterministic_category: dict,
        trend_analysis: dict,
    ) -> dict:
        allowed_ids = set(evidence_map.keys())

        summary = str(model_json.get("summary") or "Evidence-grounded summary not generated.").strip()

        det_label = str(deterministic_category.get("label") or "incomplete").strip().lower()
        det_reason = str(deterministic_category.get("reason") or "Deterministic category reason unavailable.").strip()
        det_signals = [str(x) for x in (deterministic_category.get("signals") or []) if str(x).strip()]
        det_rule_version = str(deterministic_category.get("ruleVersion") or "deterministic_rules_v1")

        category = model_json.get("category_explanation") or model_json.get("patient_category") or {}
        model_label = str(category.get("label") or "").strip().lower()
        category_reason = str(category.get("reason") or "Model explanation not provided.").strip()

        agreement = str(category.get("agreement") or "").strip().lower()
        if agreement not in {"agree", "caution"}:
            agreement = "agree" if (not model_label or model_label == det_label) else "caution"

        cat_citations = [str(x).strip() for x in (category.get("citations") or []) if str(x).strip() in allowed_ids]
        if not cat_citations and allowed_ids:
            cat_citations = [next(iter(allowed_ids))]

        findings_out: list[dict] = []
        for item in (model_json.get("findings") or []):
            if not isinstance(item, dict):
                continue
            statement = str(item.get("statement") or "").strip()
            if not statement:
                continue
            severity = str(item.get("severity") or "info").strip().lower()
            if severity not in {"critical", "high", "moderate", "low", "info"}:
                severity = "info"
            citations = [str(x).strip() for x in (item.get("citations") or []) if str(x).strip() in allowed_ids]
            if not citations and allowed_ids:
                citations = [next(iter(allowed_ids))]

            findings_out.append(
                {
                    "statement": statement,
                    "severity": severity,
                    "citations": citations,
                }
            )

        for item in (model_json.get("trend_insights") or []):
            if not isinstance(item, dict):
                continue
            statement = str(item.get("statement") or "").strip()
            if not statement:
                continue
            severity = str(item.get("severity") or "info").strip().lower()
            if severity not in {"critical", "high", "moderate", "low", "info"}:
                severity = "info"
            citations = [str(x).strip() for x in (item.get("citations") or []) if str(x).strip() in allowed_ids]
            if not citations and allowed_ids:
                citations = [next(iter(allowed_ids))]

            findings_out.append(
                {
                    "statement": f"Trend insight: {statement}",
                    "severity": severity,
                    "citations": citations,
                }
            )

        if not findings_out:
            fallback_citation = [next(iter(allowed_ids))] if allowed_ids else []
            findings_out = [
                {
                    "statement": "Insufficient structured findings from model output; manual review recommended.",
                    "severity": "info",
                    "citations": fallback_citation,
                }
            ]

        recommended_actions = [
            str(x).strip()
            for x in (model_json.get("recommended_actions") or [])
            if str(x).strip()
        ]

        if not recommended_actions:
            recommended_actions = ["Correlate AI findings with clinician review and guideline-based testing plan."]

        used_ids: list[str] = []
        used_ids.extend(cat_citations)
        for finding in findings_out:
            used_ids.extend(finding.get("citations") or [])
        used_ids = list(dict.fromkeys([x for x in used_ids if x in allowed_ids]))

        citations_resolved: list[LabAgentCitation] = []
        for citation_id in used_ids:
            meta = evidence_map[citation_id]
            citations_resolved.append(
                LabAgentCitation(
                    citationId=citation_id,
                    sourceId=meta["sourceId"],
                    sourceName=meta["sourceName"],
                    sourceUrl=meta["sourceUrl"],
                    snippet=meta["snippet"],
                )
            )

        return {
            "summary": summary,
            "patientCategory": {
                "label": det_label,
                "reason": det_reason,
                "source": det_rule_version,
                "ruleSignals": det_signals,
                "modelProposedLabel": model_label or det_label,
                "modelAgreement": agreement,
                "modelExplanation": category_reason,
                "citations": cat_citations,
            },
            "findings": findings_out,
            "recommendedActions": recommended_actions,
            "citations": [citation.model_dump() for citation in citations_resolved],
            "trendSummary": str(trend_analysis.get("summary") or ""),
            "trendPatterns": list(trend_analysis.get("patterns") or []),
        }

    async def get_architecture_blueprint(self) -> LabAgentArchitectureResponse:
        return LabAgentArchitectureResponse(
            architectureVersion=self.ARCHITECTURE_VERSION,
            stack="FastAPI + Motor/MongoDB + Gemini API + local evidence retrieval",
            ownership={
                "lab_backend_main": "system of record, evidence store, retrieval, citation validation",
                "gemini_agent": "evidence-grounded narrative generation in strict JSON schema",
            },
            collections=[
                "users",
                "lab_reports",
                "patient_history",
                "evidence_sources",
                "evidence_chunks",
                "agent_jobs",
                "agent_results",
            ],
            pipelineStages=[
                "queued",
                "ocr_background_queue",
                "evidence_ingestion",
                "evidence_retrieval",
                "trend_engine",
                "analysis_in_progress",
                "citation_validation",
                "completed",
                "failed",
            ],
            notes=[
                "Step-2 enforces real citation IDs bound to retrieved evidence snippets.",
                "Gemini outputs are post-validated against allowed evidence IDs.",
                "Patient category is decided by deterministic rules; Gemini explains/supports it with citations.",
                "Temporal trend patterns are deterministic and activate only when analyte points >= configured minimum (default 4).",
                "OCR is handled asynchronously via background workers with cache deduplication.",
                "All evidence ingestion, retrieval, and result persistence stays inside lab_backend-main.",
            ],
        )

    async def create_evidence_source(
        self,
        payload: EvidenceSourceCreate,
        *,
        current_user: Optional[dict] = None,
    ) -> EvidenceSourceResponse:
        db = get_database()
        now = datetime.utcnow()

        existing = await db.evidence_sources.find_one({"url": payload.url})
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Evidence source URL already registered",
            )

        doc = {
            "name": payload.name.strip(),
            "url": payload.url.strip(),
            "sourceType": payload.sourceType,
            "authority": payload.authority.strip() if payload.authority else None,
            "tags": [tag.strip() for tag in payload.tags if str(tag).strip()],
            "isActive": payload.isActive,
            "createdBy": self._actor_id(current_user),
            "createdAt": now,
            "updatedAt": now,
            "lastIngestionStatus": "not_ingested",
            "lastIngestionAt": None,
            "lastChunkCount": 0,
        }

        result = await db.evidence_sources.insert_one(doc)
        created = await db.evidence_sources.find_one({"_id": result.inserted_id})
        return self._to_evidence_response(created)

    async def list_evidence_sources(self, *, active_only: bool = True) -> list[EvidenceSourceResponse]:
        db = get_database()
        query = {"isActive": True} if active_only else {}
        cursor = db.evidence_sources.find(query).sort("updatedAt", -1)
        docs = await cursor.to_list(length=500)
        return [self._to_evidence_response(doc) for doc in docs]

    async def ingest_evidence_source(
        self,
        source_id: str,
        *,
        current_user: Optional[dict] = None,
    ) -> EvidenceIngestionResponse:
        db = get_database()
        now = datetime.utcnow()

        if not ObjectId.is_valid(source_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source ID format")

        source = await db.evidence_sources.find_one({"_id": ObjectId(source_id)})
        if source is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence source not found")

        try:
            data, content_type = await asyncio.to_thread(self._fetch_url_bytes, source["url"])
            extracted_text, normalized_type = await asyncio.to_thread(
                self._extract_text_from_bytes,
                data=data,
                content_type=content_type,
                url=source["url"],
            )

            chunk_size = max(400, int(settings.LAB_AGENT_EVIDENCE_CHUNK_SIZE))
            overlap = max(0, min(int(settings.LAB_AGENT_EVIDENCE_CHUNK_OVERLAP), chunk_size - 100))
            chunks = self._split_chunks(extracted_text, chunk_size=chunk_size, overlap=overlap)
            if not chunks:
                raise RuntimeError("No extractable text found in source")

            await db.evidence_chunks.delete_many({"sourceId": source_id})
            docs = []
            for idx, chunk in enumerate(chunks):
                docs.append(
                    {
                        "sourceId": source_id,
                        "sourceUrl": source["url"],
                        "sourceName": source["name"],
                        "chunkIndex": idx,
                        "text": chunk,
                        "tokenCountApprox": len(self._tokenize(chunk)),
                        "createdBy": self._actor_id(current_user),
                        "createdAt": now,
                        "updatedAt": now,
                    }
                )
            if docs:
                await db.evidence_chunks.insert_many(docs)

            await db.evidence_sources.update_one(
                {"_id": ObjectId(source_id)},
                {
                    "$set": {
                        "updatedAt": now,
                        "lastIngestionStatus": "ingested",
                        "lastIngestionAt": now,
                        "lastChunkCount": len(docs),
                        "lastContentType": normalized_type,
                    }
                },
            )

            return EvidenceIngestionResponse(
                sourceId=source_id,
                url=source["url"],
                status="ingested",
                contentType=normalized_type,
                chunkCount=len(docs),
                message="Evidence chunks indexed successfully",
                ingestedAt=now,
            )
        except (HTTPError, URLError) as exc:
            await db.evidence_sources.update_one(
                {"_id": ObjectId(source_id)},
                {"$set": {"updatedAt": now, "lastIngestionStatus": f"failed:{exc}", "lastIngestionAt": now}},
            )
            return EvidenceIngestionResponse(
                sourceId=source_id,
                url=source["url"],
                status="failed",
                chunkCount=0,
                message=f"Failed to download source: {exc}",
                ingestedAt=now,
            )
        except Exception as exc:
            await db.evidence_sources.update_one(
                {"_id": ObjectId(source_id)},
                {"$set": {"updatedAt": now, "lastIngestionStatus": f"failed:{exc}", "lastIngestionAt": now}},
            )
            return EvidenceIngestionResponse(
                sourceId=source_id,
                url=source["url"],
                status="failed",
                chunkCount=0,
                message=f"Ingestion failed: {exc}",
                ingestedAt=now,
            )

    async def create_job(
        self,
        payload: LabAgentJobCreate,
        *,
        current_user: Optional[dict] = None,
    ) -> LabAgentJobResponse:
        db = get_database()
        now = datetime.utcnow()
        requested_patient_id = (payload.patientId or "").strip()
        resolved_patient_id = requested_patient_id
        validated_report_ids: list[str] = []
        report_owner_ids: set[str] = set()

        for report_id in payload.reportIds:
            if not ObjectId.is_valid(report_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid report ID format: {report_id}",
                )

            report = await db.lab_reports.find_one({"_id": ObjectId(report_id)}, {"_id": 1, "patientId": 1, "userId": 1})
            if report is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Report not found: {report_id}",
                )

            report_owner_id = str(report.get("patientId") or report.get("userId") or "").strip()
            if report_owner_id:
                report_owner_ids.add(report_owner_id)

            validated_report_ids.append(report_id)

        if len(report_owner_ids) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Report IDs belong to multiple patients; job must target a single patient",
            )

        if len(report_owner_ids) == 1:
            report_owner_id = next(iter(report_owner_ids))
            if report_owner_id != requested_patient_id:
                logger.warning(
                    "create_job patient mismatch: requested=%s report_owner=%s; using report owner",
                    requested_patient_id,
                    report_owner_id,
                )
                resolved_patient_id = report_owner_id

        patient_query = (
            {"_id": ObjectId(resolved_patient_id)} if ObjectId.is_valid(resolved_patient_id) else {"_id": "__none__"}
        )
        patient = await db.users.find_one(patient_query, {"_id": 1, "role": 1})
        patient_exists = bool(patient and patient.get("role") == "patient")

        if not patient_exists and not validated_report_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        if not patient_exists and validated_report_ids:
            logger.warning(
                "create_job proceeding without users patient record: patient_id=%s report_count=%d",
                resolved_patient_id,
                len(validated_report_ids),
            )

        report_count = await db.lab_reports.count_documents(self._patient_query(resolved_patient_id))
        has_minimum_for_trend = report_count >= payload.minReportsForTrend

        stage = "ready_for_analysis" if has_minimum_for_trend else "awaiting_more_reports"
        next_action = (
            "Run /api/lab-agent/jobs/{job_id}/analyze with evidence source IDs for citation-grounded output."
            if has_minimum_for_trend
            else f"Collect at least {payload.minReportsForTrend} reports before trend/anomaly analysis."
        )

        doc = {
            "patientId": resolved_patient_id,
            "reportIds": validated_report_ids,
            "status": "queued",
            "stage": stage,
            "architectureVersion": self.ARCHITECTURE_VERSION,
            "reportCountAtCreation": int(report_count),
            "minReportsForTrend": payload.minReportsForTrend,
            "nextAction": next_action,
            "notes": payload.notes,
            "createdBy": self._actor_id(current_user),
            "createdAt": now,
            "updatedAt": now,
        }

        result = await db.agent_jobs.insert_one(doc)
        created = await db.agent_jobs.find_one({"_id": result.inserted_id})
        return self._to_job_response(created)

    async def get_job(self, job_id: str, *, current_user: Optional[dict] = None) -> LabAgentJobResponse:
        db = get_database()
        if not ObjectId.is_valid(job_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid job ID format")

        doc = await db.agent_jobs.find_one({"_id": ObjectId(job_id)})
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

        return self._to_job_response(doc)

    async def list_jobs(
        self,
        *,
        current_user: Optional[dict] = None,
        patient_id: Optional[str] = None,
        limit: int = 50,
    ) -> list[LabAgentJobResponse]:
        db = get_database()
        safe_limit = max(1, min(limit, 200))

        query = {"patientId": patient_id} if patient_id else {}

        cursor = db.agent_jobs.find(query).sort("createdAt", -1).limit(safe_limit)
        docs = await cursor.to_list(length=safe_limit)
        return [self._to_job_response(doc) for doc in docs]

    async def _build_patient_context(self, *, job_doc: dict) -> str:
        db = get_database()
        patient_id = job_doc["patientId"]
        context_lines: list[str] = [f"patient_id={patient_id}"]

        report_ids = [rid for rid in (job_doc.get("reportIds") or []) if ObjectId.is_valid(rid)]
        reports: list[dict] = []
        if report_ids:
            cursor = db.lab_reports.find({"_id": {"$in": [ObjectId(rid) for rid in report_ids]}})
            reports = await cursor.to_list(length=len(report_ids))
        else:
            max_reports = max(1, int(settings.LAB_AGENT_MAX_REPORTS_CONTEXT))
            cursor = (
                db.lab_reports.find(self._patient_query(patient_id))
                .sort([("reportDate", -1), ("createdAt", -1)])
                .limit(max_reports)
            )
            reports = await cursor.to_list(length=max_reports)

        reports = sorted(reports, key=lambda r: (str(r.get("reportDate") or ""), r.get("createdAt") or datetime.min))
        for idx, report in enumerate(reports, start=1):
            context_lines.append(
                f"report_{idx}: date={report.get('reportDate') or 'unknown'} label={report.get('reportLabel') or 'n/a'}"
            )
            summary = self._normalize_text(str(report.get("summary") or ""))
            if summary:
                context_lines.append(f"report_{idx}_summary: {summary[:600]}")

            recommended_tests = report.get("recommendedTests") or []
            if recommended_tests:
                context_lines.append(
                    f"report_{idx}_recommended_tests: {', '.join(str(x) for x in recommended_tests[:10])}"
                )

            comparisons = report.get("labComparison") or []
            if isinstance(comparisons, list) and comparisons:
                test_lines = []
                for item in comparisons[:15]:
                    if isinstance(item, dict):
                        tname = str(item.get("test") or "").strip()
                        tval = str(item.get("actualValue") or "").strip()
                        tstatus = str(item.get("status") or "").strip()
                        if tname:
                            test_lines.append(f"{tname}={tval}({tstatus})")
                if test_lines:
                    context_lines.append(f"report_{idx}_labs: {'; '.join(test_lines)}")

        history = await db.patient_history.find_one(
            self._patient_query(patient_id),
            sort=[("createdAt", -1)],
        )
        if history:
            hsummary = self._normalize_text(str(history.get("summary") or ""))
            if hsummary:
                context_lines.append(f"patient_history_summary: {hsummary[:600]}")

        # Include completed OCR extracts so original report text participates
        # in retrieval/context even when structured labComparison is sparse.
        max_ocr = max(1, int(settings.LAB_AGENT_MAX_REPORTS_CONTEXT))
        ocr_cursor = (
            db.ocr_jobs.find(
                {
                    "patientId": patient_id,
                    "status": "completed",
                    "extractedText": {"$exists": True, "$ne": ""},
                }
            )
            .sort([("updatedAt", -1)])
            .limit(max_ocr)
        )
        ocr_docs = await ocr_cursor.to_list(length=max_ocr)
        for idx, ocr in enumerate(ocr_docs, start=1):
            fname = str(ocr.get("fileName") or f"ocr_{idx}")
            extracted = self._normalize_text(str(ocr.get("extractedText") or ""))
            if extracted:
                context_lines.append(f"ocr_{idx}_file: {fname}")
                context_lines.append(f"ocr_{idx}_text: {extracted[:1200]}")

        return "\n".join(context_lines)

    async def _retrieve_evidence(
        self,
        *,
        query_text: str,
        source_ids: list[str],
        top_k: int,
    ) -> tuple[str, dict[str, dict]]:
        db = get_database()
        query = {"isActive": True}
        if source_ids:
            query["_id"] = {"$in": [ObjectId(sid) for sid in source_ids if ObjectId.is_valid(sid)]}

        sources = await db.evidence_sources.find(query).to_list(length=1000)
        if not sources:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active evidence sources available. Register and ingest sources first.",
            )

        source_map = {str(src["_id"]): src for src in sources}
        chunks = await db.evidence_chunks.find({"sourceId": {"$in": list(source_map.keys())}}).to_list(length=20000)
        if not chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No evidence chunks indexed. Run ingestion for selected evidence sources first.",
            )

        q_tokens = self._tokenize(query_text)
        scored: list[tuple[int, dict]] = []
        for chunk in chunks:
            c_tokens = self._tokenize(chunk.get("text") or "")
            score = len(q_tokens.intersection(c_tokens))
            scored.append((score, chunk))

        scored.sort(key=lambda x: (x[0], x[1].get("updatedAt") or datetime.min), reverse=True)
        top_chunks = [chunk for _, chunk in scored[: max(1, top_k)]]

        evidence_lines: list[str] = []
        evidence_map: dict[str, dict] = {}
        for idx, chunk in enumerate(top_chunks, start=1):
            citation_id = f"E{idx}"
            source_id = chunk["sourceId"]
            source = source_map.get(source_id) or {}
            snippet = self._normalize_text(str(chunk.get("text") or ""))[:900]
            evidence_lines.append(
                f"[{citation_id}] source_id={source_id} | name={source.get('name', 'unknown')} | url={source.get('url', 'n/a')} | snippet={snippet}"
            )
            evidence_map[citation_id] = {
                "sourceId": source_id,
                "sourceName": source.get("name", "unknown"),
                "sourceUrl": source.get("url", ""),
                "snippet": snippet,
            }

        return "\n".join(evidence_lines), evidence_map

    async def analyze_job(
        self,
        job_id: str,
        *,
        payload: LabAgentAnalyzeRequest,
        current_user: Optional[dict] = None,
    ) -> LabAgentResultResponse:
        db = get_database()
        now = datetime.utcnow()

        if not ObjectId.is_valid(job_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid job ID format")

        job = await db.agent_jobs.find_one({"_id": ObjectId(job_id)})
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

        existing = await db.agent_results.find_one({"jobId": job_id})
        if existing and not payload.force:
            return self._to_result_response(existing)

        await db.agent_jobs.update_one(
            {"_id": ObjectId(job_id)},
            {
                "$set": {
                    "status": "in_progress",
                    "stage": "analysis_in_progress",
                    "updatedAt": now,
                }
            },
        )

        try:
            patient_context = await self._build_patient_context(job_doc=job)
            deterministic_category = await self._derive_deterministic_category(job_doc=job)
            trend_analysis = await self._derive_trend_patterns(job_doc=job)
            top_k = payload.topK or int(settings.LAB_AGENT_EVIDENCE_TOP_K)
            evidence_context, evidence_map = await self._retrieve_evidence(
                query_text=patient_context,
                source_ids=payload.evidenceSourceIds,
                top_k=max(1, min(top_k, 20)),
            )

            prompt = self._build_analysis_prompt(
                patient_context=patient_context,
                evidence_context=evidence_context,
                deterministic_category=deterministic_category,
                trend_context=str(trend_analysis.get("context") or "TREND_ENGINE: unavailable"),
            )

            raw_text = await asyncio.to_thread(self._call_gemini, prompt)
            model_json = self._extract_json_from_text(raw_text)
            shaped = self._validate_and_shape_output(
                model_json=model_json,
                evidence_map=evidence_map,
                deterministic_category=deterministic_category,
                trend_analysis=trend_analysis,
            )

            result_doc = {
                "jobId": job_id,
                "patientId": job["patientId"],
                "status": "completed",
                "model": settings.GEMINI_MODEL,
                "summary": shaped["summary"],
                "patientCategory": shaped["patientCategory"],
                "findings": shaped["findings"],
                "recommendedActions": shaped["recommendedActions"],
                "citations": shaped["citations"],
                "trendSummary": shaped["trendSummary"],
                "trendPatterns": shaped["trendPatterns"],
                "evidenceUsedCount": len(shaped["citations"]),
                "rawModelJson": model_json,
                "rawModelText": raw_text,
                "createdBy": self._actor_id(current_user),
                "createdAt": now,
                "updatedAt": now,
            }

            await db.agent_results.replace_one({"jobId": job_id}, result_doc, upsert=True)

            await db.agent_jobs.update_one(
                {"_id": ObjectId(job_id)},
                {
                    "$set": {
                        "status": "completed",
                        "stage": "completed",
                        "nextAction": "Review result and citations; optionally rerun with force=true after evidence update.",
                        "updatedAt": now,
                    }
                },
            )

            stored = await db.agent_results.find_one({"jobId": job_id})
            return self._to_result_response(stored)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception(
                "Lab-agent analyze failed job_id=%s patient_id=%s error=%s",
                job_id,
                str(job.get("patientId") or ""),
                exc,
            )
            await db.agent_jobs.update_one(
                {"_id": ObjectId(job_id)},
                {
                    "$set": {
                        "status": "failed",
                        "stage": "failed",
                        "lastError": str(exc),
                        "updatedAt": datetime.utcnow(),
                    }
                },
            )
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis failed: {exc}")

    @staticmethod
    def _to_result_response(doc: dict) -> LabAgentResultResponse:
        return LabAgentResultResponse(
            id=str(doc.get("_id") or ""),
            jobId=doc["jobId"],
            patientId=doc["patientId"],
            status=doc.get("status", "completed"),
            model=doc.get("model", "unknown"),
            summary=doc.get("summary", ""),
            patientCategory=doc.get("patientCategory", {}),
            findings=doc.get("findings", []),
            recommendedActions=doc.get("recommendedActions", []),
            citations=[LabAgentCitation(**c) for c in doc.get("citations", [])],
            trendSummary=str(doc.get("trendSummary") or ""),
            trendPatterns=[TrendPattern(**t) for t in doc.get("trendPatterns", [])],
            evidenceUsedCount=int(doc.get("evidenceUsedCount", 0)),
            createdAt=doc.get("createdAt") or datetime.utcnow(),
        )

    async def get_job_result(self, job_id: str, *, current_user: Optional[dict] = None) -> LabAgentResultResponse:
        db = get_database()
        if not ObjectId.is_valid(job_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid job ID format")

        job = await db.agent_jobs.find_one({"_id": ObjectId(job_id)})
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

        result_doc = await db.agent_results.find_one({"jobId": job_id})
        if result_doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found for this job")
        return self._to_result_response(result_doc)

    @classmethod
    async def start_ocr_workers(cls) -> None:
        if cls._ocr_started:
            return
        queue = cls._ensure_ocr_queue()
        worker_count = max(1, min(4, int(settings.LAB_AGENT_OCR_WORKERS)))
        cls._ocr_workers = []
        for i in range(worker_count):
            service = cls()
            task = asyncio.create_task(service._ocr_worker_loop(worker_name=f"ocr-worker-{i+1}"))
            cls._ocr_workers.append(task)
        cls._ocr_started = True
        logger.info("Started OCR workers: %d (queue_size=%d)", worker_count, queue.qsize())

    @classmethod
    async def stop_ocr_workers(cls) -> None:
        if not cls._ocr_started:
            return
        for task in cls._ocr_workers:
            task.cancel()
        if cls._ocr_workers:
            await asyncio.gather(*cls._ocr_workers, return_exceptions=True)
        cls._ocr_workers = []
        cls._ocr_started = False
        logger.info("Stopped OCR workers")

    async def create_ocr_job(
        self,
        payload: OcrJobCreate,
        *,
        current_user: Optional[dict] = None,
    ) -> OcrJobResponse:
        db = get_database()
        now = datetime.utcnow()

        patient_id = (payload.patientId or "").strip() or None

        file_bytes, mime_from_data_uri = self._decode_base64_payload(payload.contentBase64)
        max_bytes = max(1024, int(settings.LAB_AGENT_OCR_MAX_BYTES))
        if len(file_bytes) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"OCR payload exceeds LAB_AGENT_OCR_MAX_BYTES ({max_bytes} bytes)",
            )

        mime_type = (payload.mimeType or mime_from_data_uri or "application/octet-stream").strip().lower()
        input_hash = hashlib.sha256(file_bytes).hexdigest()
        cached = await db.ocr_cache.find_one({"inputHash": input_hash})

        if cached is not None:
            cache_text = str(cached.get("extractedText") or "")
            max_store = max(500, int(settings.LAB_AGENT_OCR_STORE_TEXT_MAX_CHARS))
            doc = {
                "patientId": patient_id,
                "fileName": payload.fileName,
                "mimeType": mime_type,
                "inputHash": input_hash,
                "status": "completed",
                "fromCache": True,
                "method": cached.get("method", "cache"),
                "error": None,
                "extractedText": cache_text[:max_store],
                "charCount": len(cache_text),
                "createdBy": self._actor_id(current_user),
                "createdAt": now,
                "updatedAt": now,
            }
            result = await db.ocr_jobs.insert_one(doc)
            created = await db.ocr_jobs.find_one({"_id": result.inserted_id})
            return self._to_ocr_job_response(created)

        doc = {
            "patientId": patient_id,
            "fileName": payload.fileName,
            "mimeType": mime_type,
            "inputHash": input_hash,
            "status": "queued",
            "fromCache": False,
            "method": None,
            "error": None,
            "rawBase64": self._strip_data_uri_prefix(payload.contentBase64)[0],
            "charCount": 0,
            "createdBy": self._actor_id(current_user),
            "createdAt": now,
            "updatedAt": now,
        }
        result = await db.ocr_jobs.insert_one(doc)
        job_id = str(result.inserted_id)

        queue = self._ensure_ocr_queue()
        await queue.put(job_id)

        created = await db.ocr_jobs.find_one({"_id": result.inserted_id})
        return self._to_ocr_job_response(created)

    async def get_ocr_job(self, ocr_job_id: str, *, current_user: Optional[dict] = None) -> OcrJobResultResponse:
        db = get_database()
        if not ObjectId.is_valid(ocr_job_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OCR job ID format")

        doc = await db.ocr_jobs.find_one({"_id": ObjectId(ocr_job_id)})
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OCR job not found")

        return self._to_ocr_job_result_response(doc)

    async def _ocr_worker_loop(self, *, worker_name: str) -> None:
        queue = self._ensure_ocr_queue()
        while True:
            job_id = await queue.get()
            try:
                await self._process_ocr_job(job_id)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("%s failed processing job %s: %s", worker_name, job_id, exc)
            finally:
                queue.task_done()

    async def _process_ocr_job(self, ocr_job_id: str) -> None:
        db = get_database()
        now = datetime.utcnow()
        if not ObjectId.is_valid(ocr_job_id):
            return

        job_oid = ObjectId(ocr_job_id)
        doc = await db.ocr_jobs.find_one({"_id": job_oid})
        if doc is None or doc.get("status") != "queued":
            return

        await db.ocr_jobs.update_one(
            {"_id": job_oid},
            {"$set": {"status": "in_progress", "updatedAt": now}},
        )

        try:
            raw_b64 = str(doc.get("rawBase64") or "")
            if not raw_b64:
                raise RuntimeError("OCR job payload is empty")
            file_bytes = base64.b64decode(raw_b64)
            mime_type = str(doc.get("mimeType") or "application/octet-stream")

            extracted_text = ""
            method = ""

            if "pdf" in mime_type:
                extracted_text, _ = self._extract_text_from_bytes(
                    data=file_bytes,
                    content_type="application/pdf",
                    url=str(doc.get("fileName") or "upload.pdf"),
                )
                extracted_text = self._normalize_text(extracted_text)
                if extracted_text:
                    method = "pdf_text_layer"

            min_chars = max(1, int(settings.LAB_AGENT_OCR_MIN_TEXT_CHARS))
            if len(extracted_text) < min_chars:
                gemini_text = self._extract_text_with_gemini_ocr(file_bytes=file_bytes, mime_type=mime_type)
                gemini_text = self._normalize_text(gemini_text)
                if len(gemini_text) > len(extracted_text):
                    extracted_text = gemini_text
                    method = "gemini_vision_ocr"

            if len(extracted_text) < min_chars:
                raise RuntimeError(
                    "Unable to extract sufficient text from document. "
                    "Try a clearer image/PDF or verify GEMINI_API_KEY is configured."
                )

            input_hash = str(doc.get("inputHash") or "")
            if input_hash:
                await db.ocr_cache.replace_one(
                    {"inputHash": input_hash},
                    {
                        "inputHash": input_hash,
                        "mimeType": mime_type,
                        "method": method,
                        "extractedText": extracted_text,
                        "updatedAt": datetime.utcnow(),
                    },
                    upsert=True,
                )

            max_store = max(500, int(settings.LAB_AGENT_OCR_STORE_TEXT_MAX_CHARS))
            await db.ocr_jobs.update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": "completed",
                        "method": method,
                        "error": None,
                        "extractedText": extracted_text[:max_store],
                        "charCount": len(extracted_text),
                        "updatedAt": datetime.utcnow(),
                    },
                    "$unset": {"rawBase64": ""},
                },
            )
        except Exception as exc:
            logger.exception(
                "OCR processing failed job_id=%s file=%s mime=%s error=%s",
                ocr_job_id,
                str(doc.get("fileName") or ""),
                str(doc.get("mimeType") or ""),
                exc,
            )
            await db.ocr_jobs.update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": "failed",
                        "error": str(exc),
                        "updatedAt": datetime.utcnow(),
                    },
                    "$unset": {"rawBase64": ""},
                },
            )