import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# Ensure project root is importable when running this file directly.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import app as app_module


def _generate_gray_image(mode, width, height):
    if mode == "blank":
        return np.full((height, width), 250, dtype=np.uint8)

    if mode == "high_quality_grid":
        canvas = np.full((height, width), 225, dtype=np.uint8)

        # ECG-like grid lines.
        canvas[::20, :] = 185
        canvas[:, ::20] = 185
        canvas[::100, :] = 155
        canvas[:, ::100] = 155

        # Draw a deterministic synthetic waveform.
        x = np.arange(width)
        baseline = int(height * 0.55)
        signal = (
            baseline
            + 25 * np.sin(2 * np.pi * x / 180)
            + 6 * np.sin(2 * np.pi * x / 35)
        )
        signal = np.clip(signal.astype(int), 0, height - 1)

        for offset in range(-1, 2):
            y = np.clip(signal + offset, 0, height - 1)
            canvas[y, x] = 20
        return canvas

    raise ValueError(f"Unsupported QC generation mode: {mode}")


def _evaluate_schema_case(case):
    expected_valid = bool(case["expect"].get("valid", True))

    error_message = None
    try:
        app_module._validate_analysis_schema(case["input"])
        is_valid = True
    except Exception as exc:
        is_valid = False
        error_message = str(exc)

    passed = is_valid == expected_valid
    details = {
        "is_valid": is_valid,
        "expected_valid": expected_valid,
    }
    if error_message:
        details["error"] = error_message

    return passed, details


def _evaluate_qc_case(case):
    payload = case["input"]
    expect = case["expect"]

    width = int(payload.get("width", 1000))
    height = int(payload.get("height", 500))
    mode = payload["mode"]

    gray = _generate_gray_image(mode=mode, width=width, height=height)
    segment = app_module._evaluate_segment_quality(gray, width, height, segment_id=1)

    score = float(segment["quality_score"])
    grade = segment["quality_grade"]

    checks = []
    if "min_score" in expect:
        checks.append(score >= float(expect["min_score"]))
    if "max_score" in expect:
        checks.append(score <= float(expect["max_score"]))
    if "required_grade" in expect:
        checks.append(grade == expect["required_grade"])
    if "allowed_grades" in expect:
        checks.append(grade in set(expect["allowed_grades"]))

    passed = all(checks) if checks else False
    details = {
        "score": score,
        "grade": grade,
        "issues": segment.get("issues", []),
        "expect": expect,
    }
    return passed, details


def run_benchmark(cases_payload):
    results = []

    for case in cases_payload.get("cases", []):
        case_type = case.get("type")

        if case_type == "schema":
            passed, details = _evaluate_schema_case(case)
        elif case_type == "qc":
            passed, details = _evaluate_qc_case(case)
        else:
            passed = False
            details = {"error": f"Unsupported case type: {case_type}"}

        results.append(
            {
                "id": case.get("id", "unknown"),
                "type": case_type,
                "passed": passed,
                "details": details,
            }
        )

    total = len(results)
    passed_count = sum(1 for r in results if r["passed"])
    failed_count = total - passed_count

    return {
        "run_at_utc": datetime.now(timezone.utc).isoformat(),
        "benchmark": cases_payload.get("metadata", {}),
        "summary": {
            "total_cases": total,
            "passed": passed_count,
            "failed": failed_count,
            "pass_rate": round((passed_count / total), 4) if total else 0.0,
        },
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(description="Run ECG backend offline benchmark cases")
    parser.add_argument(
        "--cases",
        default="benchmark/cases.json",
        help="Path to benchmark case JSON file",
    )
    parser.add_argument(
        "--output",
        default="benchmark/last_report.json",
        help="Path to write benchmark result JSON",
    )
    args = parser.parse_args()

    cases_path = Path(args.cases)
    output_path = Path(args.output)

    with cases_path.open("r", encoding="utf-8") as f:
        cases_payload = json.load(f)

    report = run_benchmark(cases_payload)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    summary = report["summary"]
    print(
        f"Benchmark complete: {summary['passed']}/{summary['total_cases']} passed "
        f"(pass_rate={summary['pass_rate']})"
    )


if __name__ == "__main__":
    main()
