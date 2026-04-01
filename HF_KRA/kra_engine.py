from __future__ import annotations

import json
import os
import re
from pathlib import Path
from functools import lru_cache
from typing import Any

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from prompt_builder import build_prompt
from schemas import KRARequest, KRAResponse, KRAResult


DEFAULT_MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-1.5B-Instruct")
DEFAULT_MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "768"))
DEFAULT_TEMPERATURE = float(os.getenv("TEMPERATURE", "0.2"))
DEFAULT_TOP_P = float(os.getenv("TOP_P", "0.9"))


def _resolve_writable_cache_dir() -> str:
    """Pick a writable HF cache directory with safe fallback for Spaces runtimes."""

    candidates = []
    env_hf_home = os.getenv("HF_HOME", "").strip()
    if env_hf_home:
        candidates.append(env_hf_home)
    # Keep /data as an optional candidate for users who enabled persistent storage.
    candidates.append("/data/.huggingface")
    candidates.append("/home/user/.cache/huggingface")

    for path in candidates:
        try:
            p = Path(path)
            p.mkdir(parents=True, exist_ok=True)
            probe = p / ".write_test"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return str(p)
        except Exception:
            continue

    # Last-resort fallback under current working directory.
    fallback = Path(".hf_cache")
    fallback.mkdir(parents=True, exist_ok=True)
    return str(fallback.resolve())


def _env_flag(name: str, default: str = "0") -> bool:
    value = os.getenv(name, default).strip().lower()
    return value in {"1", "true", "yes", "on"}


def _cuda_usable() -> bool:
    if not torch.cuda.is_available():
        return False
    try:
        _ = torch.tensor([0.0], device="cuda")
        return True
    except Exception:
        return False


class KRAEngine:
    """Lazy loader and inference wrapper for the Hugging Face Space."""

    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        self.cache_dir = _resolve_writable_cache_dir()
        os.environ["HF_HOME"] = self.cache_dir
        self.force_cpu = _env_flag("FORCE_CPU", "0")
        self.cuda_available = torch.cuda.is_available()
        self.cuda_usable = _cuda_usable()
        self.device = "cuda" if (not self.force_cpu and self.cuda_usable) else "cpu"
        self.torch_dtype = torch.float16 if self.device == "cuda" else torch.float32

        self.tokenizer = AutoTokenizer.from_pretrained(
            model_id,
            token=os.getenv("HF_TOKEN") or None,
            cache_dir=self.cache_dir,
            trust_remote_code=False,
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            model_id,
            token=os.getenv("HF_TOKEN") or None,
            cache_dir=self.cache_dir,
            torch_dtype=self.torch_dtype,
            trust_remote_code=False,
        )
        self.model.to(self.device)
        self.model.eval()

    def analyze(self, payload: KRARequest) -> KRAResponse:
        prompt = build_prompt(payload)
        raw_output = self._generate(prompt)
        result = self._parse_output(raw_output)

        metadata = {
            "temperature": DEFAULT_TEMPERATURE,
            "top_p": DEFAULT_TOP_P,
            "max_new_tokens": DEFAULT_MAX_NEW_TOKENS,
            "device": self.device,
            "torch_dtype": str(self.torch_dtype).replace("torch.", ""),
            "force_cpu": self.force_cpu,
            "cuda_available": self.cuda_available,
            "cuda_usable": self.cuda_usable,
        }
        return KRAResponse(ok=True, model_id=self.model_id, result=result, metadata=metadata)

    def _generate(self, prompt: str) -> str:
        inputs = self.tokenizer(prompt, return_tensors="pt")
        inputs = {key: value.to(self.device) for key, value in inputs.items()}

        with torch.no_grad():
            output_ids = self.model.generate(
                **inputs,
                max_new_tokens=DEFAULT_MAX_NEW_TOKENS,
                temperature=DEFAULT_TEMPERATURE,
                top_p=DEFAULT_TOP_P,
                do_sample=DEFAULT_TEMPERATURE > 0,
                pad_token_id=self.tokenizer.eos_token_id,
            )

        generated = self.tokenizer.decode(output_ids[0], skip_special_tokens=True)
        # The prompt is included in the decoded text, so remove it when possible.
        if generated.startswith(prompt):
            generated = generated[len(prompt) :]
        return generated.strip()

    def _parse_output(self, raw_output: str) -> KRAResult:
        parsed = _extract_json(raw_output)

        if parsed is None:
            return KRAResult(
                summary=raw_output.strip()[:1200],
                diagnoses=[],
                differential=[],
                red_flags=[],
                recommended_tests=[],
                confidence=0.0,
                reasoning="Model output was not valid JSON; raw text preserved in summary.",
                raw_output=raw_output,
            )

        return KRAResult(
            summary=str(parsed.get("summary", "")).strip(),
            diagnoses=_to_string_list(parsed.get("diagnoses")),
            differential=_to_string_list(parsed.get("differential")),
            red_flags=_to_string_list(parsed.get("red_flags")),
            recommended_tests=_to_string_list(parsed.get("recommended_tests")),
            confidence=_coerce_confidence(parsed.get("confidence")),
            reasoning=str(parsed.get("reasoning", "")).strip(),
            raw_output=raw_output,
        )


@lru_cache(maxsize=1)
def get_engine() -> KRAEngine:
    """Build the model once and reuse it for subsequent requests."""

    return KRAEngine(DEFAULT_MODEL_ID)


def analyze_request(payload: KRARequest) -> KRAResponse:
    """Public helper used by the FastAPI route."""

    return get_engine().analyze(payload)


def get_runtime_info() -> dict[str, Any]:
    """Return current runtime details to verify CPU/GPU selection."""

    engine = get_engine()
    return {
        "model_id": engine.model_id,
        "device": engine.device,
        "torch_dtype": str(engine.torch_dtype).replace("torch.", ""),
        "cache_dir": engine.cache_dir,
        "force_cpu": engine.force_cpu,
        "cuda_available": engine.cuda_available,
        "cuda_usable": engine.cuda_usable,
    }


def _extract_json(text: str) -> dict[str, Any] | None:
    if not text:
        return None

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None

    candidate = match.group(0)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _to_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, dict):
        return [f"{key}: {value[key]}" for key in value]
    text = str(value).strip()
    return [text] if text else []


def _coerce_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, confidence))
