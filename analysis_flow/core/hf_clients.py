from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional

import requests


def _ensure_predict_endpoint(url: str) -> str:
    url = url.strip()
    if not url:
        return url
    if url.endswith("/api/predict"):
        return url
    return url.rstrip("/") + "/api/predict"


def _extract_first_json_object(text: str) -> Optional[Dict[str, Any]]:
    """Best-effort JSON object extraction from imperfect model output."""
    if not text:
        return None
    text = text.strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass

    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    candidate = m.group(0)
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


class HFGradioClient:
    def __init__(self, endpoint_env: str, default_url: Optional[str] = None, timeout: int = 120):
        url = os.getenv(endpoint_env, default_url or "")
        if not url:
            raise ValueError(f"Missing required env var: {endpoint_env}")
        self.endpoint = _ensure_predict_endpoint(url)
        self.timeout = int(os.getenv("REQUEST_TIMEOUT", str(timeout)))
        self.hf_token = os.getenv("HF_TOKEN", "")

        self.headers = {"Content-Type": "application/json"}
        if self.hf_token:
            self.headers["Authorization"] = f"Bearer {self.hf_token}"

    def predict(self, data: list) -> Dict[str, Any]:
        payload = {"data": data}
        resp = requests.post(self.endpoint, json=payload, headers=self.headers, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()


class KRAClient(HFGradioClient):
    def analyze(self, symptoms: str, context: str, retrieval_quality_label: str) -> Dict[str, Any]:
        result = self.predict([symptoms, context, retrieval_quality_label])
        out = (result.get("data") or [None])[0]
        if isinstance(out, dict):
            return out
        if isinstance(out, str):
            parsed = _extract_first_json_object(out)
            if parsed is not None:
                return parsed
        raise ValueError("KRA returned an unsupported output format")


class ORAClient(HFGradioClient):
    def refine(self, kra_json: str, symptoms: str, experience_level: str) -> Dict[str, Any]:
        result = self.predict([kra_json, symptoms, experience_level])
        out = (result.get("data") or [None])[0]
        if isinstance(out, dict):
            return out
        if isinstance(out, str):
            parsed = _extract_first_json_object(out)
            if parsed is not None:
                return parsed
            return {"formatted_diagnosis": out}
        raise ValueError("ORA returned an unsupported output format")
