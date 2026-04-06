from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import settings

DEFAULT_IMAGE_PATH = PROJECT_ROOT / "tests" / "lab-reports-for-testing" / "High-troponin.png"
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "testlogs" / "gemini_access_check.json"


def mask_key(value: str) -> str:
    if not value:
        return "<missing>"
    if len(value) <= 8:
        return value[0:2] + "***"
    return value[0:6] + "..." + value[-4:]


def request_gemini(*, endpoint: str, payload: dict, timeout_sec: int) -> tuple[bool, int, str, dict | str]:
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = raw
            return True, int(resp.status), "ok", parsed
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = raw
        return False, int(exc.code), "http_error", parsed
    except URLError as exc:
        return False, 0, "url_error", str(exc)
    except TimeoutError as exc:
        return False, 0, "timeout", str(exc)


def build_text_payload() -> dict:
    return {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "Return exactly this JSON and nothing else: "
                            '{"status":"ok","source":"lab_backend_main"}'
                        )
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "responseMimeType": "application/json",
        },
    }


def build_vision_payload(image_path: Path) -> dict:
    mime = "image/png"
    suffix = image_path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        mime = "image/jpeg"
    elif suffix == ".webp":
        mime = "image/webp"

    image_b64 = base64.b64encode(image_path.read_bytes()).decode("ascii")

    return {
        "contents": [
            {
                "parts": [
                    {"text": "Extract plain text from this lab report image."},
                    {
                        "inlineData": {
                            "mimeType": mime,
                            "data": image_b64,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check Gemini accessibility from lab_backend-main settings."
    )
    parser.add_argument(
        "--model",
        default="gemini-2.5-flash",
        help="Gemini model to test (default: gemini-2.5-flash)",
    )
    parser.add_argument(
        "--api-base",
        default=settings.GEMINI_API_BASE,
        help=f"Gemini API base (default: {settings.GEMINI_API_BASE})",
    )
    parser.add_argument(
        "--timeout-sec",
        type=int,
        default=45,
        help="Request timeout in seconds (default: 45)",
    )
    parser.add_argument(
        "--skip-vision",
        action="store_true",
        help="Only run text check, skip image/vision check.",
    )
    parser.add_argument(
        "--vision-image",
        default=str(DEFAULT_IMAGE_PATH),
        help=f"Path to image for vision check (default: {DEFAULT_IMAGE_PATH})",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help=f"Output JSON path (default: {DEFAULT_OUTPUT_PATH})",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = (settings.GEMINI_API_KEY or "").strip()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    started = int(time.time())
    result: dict = {
        "started_at_unix": started,
        "gemini_api_base": args.api_base,
        "model": args.model,
        "api_key_present": bool(api_key),
        "api_key_masked": mask_key(api_key),
        "checks": {},
    }

    print("=== Gemini Access Check (lab_backend-main) ===")
    print(f"Model: {args.model}")
    print(f"API Base: {args.api_base}")
    print(f"API Key: {mask_key(api_key)}")

    if not api_key:
        result["error"] = "GEMINI_API_KEY is missing in lab_backend-main settings"
        output_path.write_text(json.dumps(result, indent=2, ensure_ascii=True), encoding="utf-8")
        print("Result: FAILED (missing GEMINI_API_KEY)")
        print(f"Saved output: {output_path}")
        return 1

    endpoint = f"{args.api_base.rstrip('/')}/models/{args.model}:generateContent?key={api_key}"

    ok_text, status_text, kind_text, payload_text = request_gemini(
        endpoint=endpoint,
        payload=build_text_payload(),
        timeout_sec=args.timeout_sec,
    )
    result["checks"]["text"] = {
        "ok": ok_text,
        "status": status_text,
        "kind": kind_text,
        "response": payload_text,
    }

    print(f"Text check: {'OK' if ok_text else 'FAILED'} (status={status_text}, kind={kind_text})")

    if not args.skip_vision:
        vision_image = Path(args.vision_image)
        if vision_image.exists() and vision_image.is_file():
            ok_vision, status_vision, kind_vision, payload_vision = request_gemini(
                endpoint=endpoint,
                payload=build_vision_payload(vision_image),
                timeout_sec=args.timeout_sec,
            )
            result["checks"]["vision"] = {
                "ok": ok_vision,
                "status": status_vision,
                "kind": kind_vision,
                "image": str(vision_image),
                "response": payload_vision,
            }
            print(
                f"Vision check: {'OK' if ok_vision else 'FAILED'} "
                f"(status={status_vision}, kind={kind_vision})"
            )
        else:
            result["checks"]["vision"] = {
                "ok": False,
                "status": 0,
                "kind": "missing_image",
                "image": str(vision_image),
                "response": "Vision image file not found",
            }
            print(f"Vision check: SKIPPED (image not found: {vision_image})")

    finished = int(time.time())
    result["finished_at_unix"] = finished

    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=True), encoding="utf-8")
    print(f"Saved output: {output_path}")

    has_failure = any(not bool(check.get("ok")) for check in result["checks"].values())
    print(f"Overall: {'FAILED' if has_failure else 'OK'}")
    return 1 if has_failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
