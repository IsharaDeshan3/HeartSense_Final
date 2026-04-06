from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
import sys
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from bson import ObjectId
from pymongo import MongoClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import settings

DEFAULT_REPORTS_DIR = PROJECT_ROOT / "tests" / "lab-reports-for-testing"
DEFAULT_OUTPUT_FILE = PROJECT_ROOT / "testlogs" / "lab_orchestration_output.json"

SUPPORTED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"}


def _to_json_payload(raw: str) -> Any:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text}


def api_request(
    *,
    base_url: str,
    method: str,
    path: str,
    query: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
    timeout_sec: int = 60,
    max_attempts: int = 3,
) -> Any:
    query_str = f"?{urlencode(query, doseq=True)}" if query else ""
    url = f"{base_url.rstrip('/')}{path}{query_str}"

    headers = {"Accept": "application/json"}
    data: bytes | None = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    request = Request(url=url, method=method.upper(), headers=headers, data=data)
    attempts = max(1, int(max_attempts))
    for attempt in range(1, attempts + 1):
        try:
            with urlopen(request, timeout=timeout_sec) as response:
                content = response.read().decode("utf-8", errors="replace")
                return _to_json_payload(content)
        except HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            detail = _to_json_payload(raw)
            raise RuntimeError(
                f"{method.upper()} {path} failed [{exc.code}]: {json.dumps(detail, ensure_ascii=True)}"
            ) from exc
        except (URLError, TimeoutError) as exc:
            timed_out = "timed out" in str(exc).lower()
            if attempt < attempts and timed_out:
                time.sleep(min(2.0, 0.5 * attempt))
                continue
            raise RuntimeError(f"{method.upper()} {path} could not reach backend: {exc}") from exc

    raise RuntimeError(f"{method.upper()} {path} failed after {attempts} attempts")


@dataclass
class OcrResult:
    job_id: str
    status: str
    char_count: int
    extracted_text: str
    error: str | None


def find_patient_id(base_url: str, explicit_patient_id: str | None) -> str:
    if explicit_patient_id:
        return explicit_patient_id.strip()

    patients = api_request(base_url=base_url, method="GET", path="/api/patients/")
    if not isinstance(patients, list) or not patients:
        raise RuntimeError(
            "No patients found from /api/patients/. Pass --patient-id with a valid patient ObjectId."
        )

    first = patients[0]
    patient_id = str(first.get("id") or first.get("_id") or "").strip()
    if not patient_id:
        raise RuntimeError("Could not derive patient ID from first /api/patients/ record.")
    return patient_id


def seed_sample_patient() -> str:
    now = time.time()
    patient_id = str(ObjectId())
    sample_doc = {
        "_id": ObjectId(patient_id),
        "name": "Sample Orchestration Patient",
        "email": f"sample.orchestration.{int(now)}@local.test",
        "age": 45,
        "role": "patient",
        "hashed_password": "manual-test-only",
        "created_at": date.today().isoformat(),
    }

    client = MongoClient(settings.MONGODB_URL)
    try:
        db = client[settings.MONGODB_DATABASE]
        db.users.insert_one(sample_doc)
    finally:
        client.close()

    return patient_id


def find_or_seed_patient_id(
    *,
    base_url: str,
    explicit_patient_id: str | None,
    seed_if_missing: bool,
) -> str:
    if explicit_patient_id and explicit_patient_id.strip():
        return explicit_patient_id.strip()

    patients = api_request(base_url=base_url, method="GET", path="/api/patients/")
    if isinstance(patients, list) and patients:
        first = patients[0]
        patient_id = str(first.get("id") or first.get("_id") or "").strip()
        if patient_id:
            return patient_id

    if not seed_if_missing:
        raise RuntimeError(
            "No patients found from /api/patients/. Pass --patient-id or enable patient seeding."
        )

    print("No patient found. Seeding a sample patient in MongoDB for this test run...")
    seeded_id = seed_sample_patient()
    print(f"Seeded patient -> {seeded_id}")
    return seeded_id


def discover_sample_reports(reports_dir: Path) -> list[Path]:
    if not reports_dir.exists() or not reports_dir.is_dir():
        raise RuntimeError(f"Reports directory not found: {reports_dir}")

    files = [
        path
        for path in sorted(reports_dir.iterdir())
        if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES
    ]
    if not files:
        raise RuntimeError(
            f"No supported image files found in {reports_dir}. "
            f"Supported: {', '.join(sorted(SUPPORTED_IMAGE_SUFFIXES))}"
        )
    return files


def submit_ocr_job(base_url: str, patient_id: str, image_path: Path) -> str:
    mime = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    content_base64 = base64.b64encode(image_path.read_bytes()).decode("ascii")

    created = api_request(
        base_url=base_url,
        method="POST",
        path="/api/lab-agent/ocr/jobs",
        body={
            "patientId": patient_id,
            "fileName": image_path.name,
            "mimeType": mime,
            "contentBase64": content_base64,
        },
        timeout_sec=120,
    )

    job_id = str((created or {}).get("id") or "").strip()
    if not job_id:
        raise RuntimeError(f"OCR job did not return an id for {image_path.name}: {created}")
    return job_id


def wait_for_ocr(
    base_url: str,
    ocr_job_id: str,
    *,
    poll_interval_sec: float,
    timeout_sec: int,
) -> OcrResult:
    start = time.time()
    while True:
        payload = api_request(
            base_url=base_url,
            method="GET",
            path=f"/api/lab-agent/ocr/jobs/{ocr_job_id}",
            timeout_sec=30,
        )

        status = str((payload or {}).get("status") or "").strip().lower()
        if status in {"completed", "failed"}:
            return OcrResult(
                job_id=ocr_job_id,
                status=status,
                char_count=int((payload or {}).get("charCount") or 0),
                extracted_text=str((payload or {}).get("extractedText") or ""),
                error=(str(payload.get("error")) if payload and payload.get("error") else None),
            )

        if time.time() - start > timeout_sec:
            return OcrResult(
                job_id=ocr_job_id,
                status="timeout",
                char_count=int((payload or {}).get("charCount") or 0),
                extracted_text=str((payload or {}).get("extractedText") or ""),
                error="OCR polling timed out",
            )

        time.sleep(max(0.1, poll_interval_sec))


def _extract_first_number(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return float(match.group(1))
    except (ValueError, TypeError):
        return None


def infer_lab_comparison_from_text(extracted_text: str) -> list[dict[str, Any]]:
    text = extracted_text or ""
    rows: list[dict[str, Any]] = []

    troponin = _extract_first_number(r"troponin[^0-9]{0,20}(\d+(?:\.\d+)?)", text)
    if troponin is not None:
        rows.append(
            {
                "test": "Troponin",
                "actualValue": troponin,
                "normalRange": "0.00-0.10 ng/mL",
                "status": "High" if troponin > 0.10 else "Normal",
            }
        )

    chol = _extract_first_number(r"(?:total\s+)?chol(?:esterol)?[^0-9]{0,20}(\d+(?:\.\d+)?)", text)
    if chol is not None:
        rows.append(
            {
                "test": "Total Cholesterol",
                "actualValue": chol,
                "normalRange": "<200 mg/dL",
                "status": "High" if chol >= 200 else "Normal",
            }
        )

    ldl = _extract_first_number(r"ldl[^0-9]{0,20}(\d+(?:\.\d+)?)", text)
    if ldl is not None:
        rows.append(
            {
                "test": "LDL Cholesterol",
                "actualValue": ldl,
                "normalRange": "<100 mg/dL",
                "status": "High" if ldl >= 100 else "Normal",
            }
        )

    hdl = _extract_first_number(r"hdl[^0-9]{0,20}(\d+(?:\.\d+)?)", text)
    if hdl is not None:
        rows.append(
            {
                "test": "HDL Cholesterol",
                "actualValue": hdl,
                "normalRange": ">=40 mg/dL",
                "status": "Low" if hdl < 40 else "Normal",
            }
        )

    tg = _extract_first_number(r"(?:tg|triglycerides?)[^0-9]{0,20}(\d+(?:\.\d+)?)", text)
    if tg is not None:
        rows.append(
            {
                "test": "Triglycerides",
                "actualValue": tg,
                "normalRange": "<150 mg/dL",
                "status": "High" if tg >= 150 else "Normal",
            }
        )

    return rows


def create_lab_report_from_ocr(
    *,
    base_url: str,
    patient_id: str,
    source_file: Path,
    source_index: int,
    ocr: OcrResult,
) -> str:
    if ocr.status != "completed":
        raise RuntimeError(
            f"OCR is not completed for {source_file.name} (status={ocr.status}, error={ocr.error})"
        )

    extracted_text = (ocr.extracted_text or "").strip()
    short_text = extracted_text[:420] if extracted_text else f"OCR extracted from {source_file.name}."
    lab_comparison = infer_lab_comparison_from_text(extracted_text)

    payload = {
        "patientId": patient_id,
        "reportDate": str(date.today()),
        "reportLabel": f"Sample Report {source_index}: {source_file.stem}",
        "extractedJsonGroup1": {
            "source_file": source_file.name,
            "ocr_job_id": ocr.job_id,
            "ocr_char_count": ocr.char_count,
        },
        "extractedJsonGroup2": {},
        "labComparison": lab_comparison,
        "summary": short_text,
        "recommendedTests": ["ECG", "Troponin"] if "troponin" in extracted_text.lower() else [],
        "dailyHealthAdvice": ["Discuss report findings with your clinician."],
        "patientInfo": {"source": "sample_orchestration_test"},
    }

    created = api_request(
        base_url=base_url,
        method="POST",
        path="/api/lab-reports/",
        body=payload,
        timeout_sec=60,
    )

    report_id = str((created or {}).get("id") or "").strip()
    if not report_id:
        raise RuntimeError(f"Lab report create did not return id for {source_file.name}: {created}")
    return report_id


def run_pipeline(args: argparse.Namespace) -> dict[str, Any]:
    base_url = args.base_url.rstrip("/")
    patient_id = find_or_seed_patient_id(
        base_url=base_url,
        explicit_patient_id=args.patient_id,
        seed_if_missing=args.seed_patient_if_missing,
    )
    sample_reports = discover_sample_reports(Path(args.reports_dir))

    run_output: dict[str, Any] = {
        "base_url": base_url,
        "patient_id": patient_id,
        "reports_dir": str(Path(args.reports_dir).resolve()),
        "started_at_unix": int(time.time()),
        "report_runs": [],
        "created_report_ids": [],
    }

    print("\n=== Lab Orchestration Sample Run ===")
    print(f"Backend: {base_url}")
    print(f"Patient ID: {patient_id}")
    print(f"Sample reports: {len(sample_reports)}\n")

    for idx, image_path in enumerate(sample_reports, start=1):
        print(f"[{idx}/{len(sample_reports)}] OCR submit -> {image_path.name}")
        report_run = {
            "file": image_path.name,
            "ocr": None,
            "lab_report_id": None,
        }

        try:
            ocr_job_id = submit_ocr_job(base_url=base_url, patient_id=patient_id, image_path=image_path)
            ocr_result = wait_for_ocr(
                base_url=base_url,
                ocr_job_id=ocr_job_id,
                poll_interval_sec=args.poll_interval_sec,
                timeout_sec=args.ocr_timeout_sec,
            )
        except Exception as exc:  # noqa: BLE001
            report_run["ocr"] = {
                "job_id": None,
                "status": "request_failed",
                "char_count": 0,
                "error": str(exc),
            }
            report_run["lab_report_error"] = "Skipped due to OCR request failure"
            run_output["report_runs"].append(report_run)
            print(f"  OCR request failed -> {exc}")
            continue

        report_run["ocr"] = {
            "job_id": ocr_result.job_id,
            "status": ocr_result.status,
            "char_count": ocr_result.char_count,
            "error": ocr_result.error,
        }

        print(
            f"  OCR status={ocr_result.status}, chars={ocr_result.char_count}, "
            f"error={ocr_result.error or '-'}"
        )

        if ocr_result.status == "completed":
            try:
                report_id = create_lab_report_from_ocr(
                    base_url=base_url,
                    patient_id=patient_id,
                    source_file=image_path,
                    source_index=idx,
                    ocr=ocr_result,
                )
                report_run["lab_report_id"] = report_id
                run_output["created_report_ids"].append(report_id)
                print(f"  Lab report saved -> {report_id}")
            except Exception as exc:  # noqa: BLE001
                report_run["lab_report_error"] = str(exc)
                print(f"  Lab report save failed -> {exc}")
        else:
            print("  Skipping lab report save (OCR not completed).")

        run_output["report_runs"].append(report_run)

    report_ids = run_output["created_report_ids"]
    if not report_ids:
        raise RuntimeError("No lab reports were created from sample images, so orchestration cannot continue.")

    print("\nCreating lab-agent orchestration job...")
    created_job = api_request(
        base_url=base_url,
        method="POST",
        path="/api/lab-agent/jobs",
        body={
            "patientId": patient_id,
            "reportIds": report_ids,
            "minReportsForTrend": args.min_reports_for_trend,
            "notes": "sample orchestration test from lab report images",
        },
        timeout_sec=180,
    )

    job_id = str((created_job or {}).get("id") or "").strip()
    if not job_id:
        raise RuntimeError(f"Lab-agent job create did not return id: {created_job}")

    print(f"Job created -> {job_id}")
    run_output["job"] = created_job

    active_sources = api_request(
        base_url=base_url,
        method="GET",
        path="/api/lab-agent/evidence-sources",
        query={"active_only": "true"},
    )
    source_ids = [str(item.get("id") or "").strip() for item in (active_sources or []) if item]
    source_ids = [sid for sid in source_ids if sid]
    run_output["active_evidence_source_ids"] = source_ids

    if args.skip_analyze:
        print("Skipping /analyze and /result because --skip-analyze was provided.")
        run_output["analysis_skipped"] = True
        return run_output

    if not source_ids:
        print("No active evidence sources found. Skipping analyze/result steps.")
        run_output["analysis_skipped"] = True
        run_output["analysis_skip_reason"] = "No active evidence sources available"
        return run_output

    if args.ingest_first_source:
        first_source_id = source_ids[0]
        print(f"Ingesting first active source before analyze -> {first_source_id}")
        ingest_result = api_request(
            base_url=base_url,
            method="POST",
            path=f"/api/lab-agent/evidence-sources/{first_source_id}/ingest",
            timeout_sec=120,
        )
        run_output["ingest_result"] = ingest_result

    print("Running lab-agent analyze...")
    analyze_result = api_request(
        base_url=base_url,
        method="POST",
        path=f"/api/lab-agent/jobs/{job_id}/analyze",
        body={
            "evidenceSourceIds": source_ids,
            "topK": args.top_k,
            "force": args.force,
        },
        timeout_sec=180,
        max_attempts=2,
    )
    run_output["analyze_result"] = analyze_result

    print("Fetching lab-agent result...")
    final_result = api_request(
        base_url=base_url,
        method="GET",
        path=f"/api/lab-agent/jobs/{job_id}/result",
        timeout_sec=60,
    )
    run_output["result"] = final_result

    category = ((final_result or {}).get("patientCategory") or {}).get("label")
    summary = str((final_result or {}).get("summary") or "").strip()
    print(f"Analyze complete -> category={category or 'unknown'}")
    print(f"Summary: {summary[:180]}{'...' if len(summary) > 180 else ''}")

    return run_output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run a sample lab orchestration pipeline against lab backend using image files in "
            "lab_backend-main/tests/lab-reports-for-testing."
        )
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Lab backend base URL (default: http://127.0.0.1:8000)",
    )
    parser.add_argument(
        "--patient-id",
        default="",
        help="Patient ObjectId. If omitted, first patient from /api/patients/ is used.",
    )
    parser.add_argument(
        "--seed-patient-if-missing",
        action=argparse.BooleanOptionalAction,
        default=True,
        help=(
            "If /api/patients returns empty and --patient-id is not provided, "
            "seed one sample patient directly in MongoDB (default: true)."
        ),
    )
    parser.add_argument(
        "--reports-dir",
        default=str(DEFAULT_REPORTS_DIR),
        help=f"Directory with sample report images (default: {DEFAULT_REPORTS_DIR})",
    )
    parser.add_argument(
        "--ocr-timeout-sec",
        type=int,
        default=180,
        help="Timeout per OCR job while polling (default: 180)",
    )
    parser.add_argument(
        "--poll-interval-sec",
        type=float,
        default=1.5,
        help="OCR poll interval in seconds (default: 1.5)",
    )
    parser.add_argument(
        "--min-reports-for-trend",
        type=int,
        default=2,
        help="minReportsForTrend for lab-agent job create (default: 2)",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=8,
        help="topK value for /analyze (default: 8)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Pass force=true when calling /analyze",
    )
    parser.add_argument(
        "--skip-analyze",
        action="store_true",
        help="Run OCR + report save + job create only; skip analyze/result.",
    )
    parser.add_argument(
        "--ingest-first-source",
        action="store_true",
        help="Try ingesting the first active evidence source before analyze.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_FILE),
        help=f"Output JSON path (default: {DEFAULT_OUTPUT_FILE})",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        run_output = run_pipeline(args)
        run_output["finished_at_unix"] = int(time.time())
        output_path.write_text(json.dumps(run_output, indent=2, ensure_ascii=True), encoding="utf-8")

        print("\n=== Run Complete ===")
        print(f"Saved run output: {output_path}")
        return 0
    except Exception as exc:  # noqa: BLE001
        error_payload = {
            "error": str(exc),
            "finished_at_unix": int(time.time()),
        }
        output_path.write_text(json.dumps(error_payload, indent=2, ensure_ascii=True), encoding="utf-8")

        print("\n=== Run Failed ===")
        print(str(exc))
        print(f"Saved failure output: {output_path}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
