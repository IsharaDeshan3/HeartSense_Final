from __future__ import annotations

import json
from typing import Any, Dict


def normalize_any_json(value: Any) -> Dict[str, Any]:
    """Best-effort normalization for arbitrary JSON-ish inputs.

    Upstream components emit JSON, but exact shape may vary.
    This function attempts to accept:
    - dict
    - JSON string
    - Pydantic models (model_dump)
    - dataclasses or arbitrary objects (via __dict__)

    Always returns a dict; wraps non-dicts under {"value": ...}.
    """

    if value is None:
        return {}

    # Pydantic v2
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        return dumped if isinstance(dumped, dict) else {"value": dumped}

    if isinstance(value, dict):
        return value

    if isinstance(value, str):
        s = value.strip()
        if not s:
            return {}
        try:
            parsed = json.loads(s)
            return parsed if isinstance(parsed, dict) else {"value": parsed}
        except Exception:
            return {"value": s}

    if isinstance(value, (list, int, float, bool)):
        return {"value": value}

    if hasattr(value, "__dict__"):
        try:
            d = dict(value.__dict__)
            return d
        except Exception:
            pass

    return {"value": str(value)}
