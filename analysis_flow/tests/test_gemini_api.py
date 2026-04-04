"""
Standalone Gemini API smoke test.

Runs a direct generateContent call using environment variables and prints
whether Gemini returns text for the sample question.
"""

from __future__ import annotations

import os
import sys
from typing import Any

import requests
from dotenv import find_dotenv, load_dotenv


QUESTION = "What is quantum computing"


def _load_keys() -> list[str]:
    keys: list[str] = []

    key_list = os.getenv("GEMINI_API_KEYS", "").strip()
    if key_list:
        keys.extend(part.strip() for part in key_list.split(",") if part.strip())

    for key in (os.getenv("GEMINI_API_KEY", "").strip(), os.getenv("GEMINI_API_KEY_2", "").strip()):
        if key and key not in keys:
            keys.append(key)

    return keys


def _extract_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return ""

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content") or {}
        parts = content.get("parts") or []
        chunks: list[str] = []
        for part in parts:
            if isinstance(part, dict):
                text = str(part.get("text") or "").strip()
                if text:
                    chunks.append(text)
        if chunks:
            return "\n".join(chunks)

    return ""


def main() -> int:
    load_dotenv(find_dotenv())

    base = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
    keys = _load_keys()

    if not keys:
        print("ERROR: No Gemini API keys found in GEMINI_API_KEYS/GEMINI_API_KEY/GEMINI_API_KEY_2")
        return 1

    url = f"{base}/models/{model}:generateContent"
    body = {
        "contents": [{"role": "user", "parts": [{"text": QUESTION}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 256,
        },
    }

    print(f"Testing Gemini model: {model}")
    print(f"Question: {QUESTION}")

    for idx, key in enumerate(keys, start=1):
        try:
            response = requests.post(url, params={"key": key}, json=body, timeout=45)
        except requests.RequestException as exc:
            print(f"Attempt {idx}: request failed: {exc}")
            continue

        if response.status_code >= 400:
            detail = response.text[:400].replace("\n", " ")
            print(f"Attempt {idx}: HTTP {response.status_code}: {detail}")
            continue

        try:
            payload = response.json()
        except ValueError:
            print(f"Attempt {idx}: invalid JSON response")
            continue

        text = _extract_text(payload)
        if not text:
            print(f"Attempt {idx}: Gemini returned no text")
            continue

        print("SUCCESS: Gemini returned an answer.")
        print("-" * 80)
        print(text)
        print("-" * 80)
        return 0

    print("FAILED: Gemini did not return a valid answer with available keys.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
