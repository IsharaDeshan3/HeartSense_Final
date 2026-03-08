"""
core/llm_engine.py

Central LLM manager — loads GGUF models once at startup and provides
thread-safe inference methods.

KRA selects a runtime automatically:
    - DeepSeek-R1-Distill-Llama-8B on NVIDIA systems
    - a CPU-safe fallback model when no NVIDIA GPU is detected

ORA always runs on CPU.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, Optional
from tqdm import tqdm

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Default config (overridable via .env)                                       #
# --------------------------------------------------------------------------- #

_ROOT = Path(__file__).resolve().parent.parent  # analysis_flow/

_DEFAULTS: Dict[str, Any] = {
    # KRA primary path (preferred when NVIDIA is available)
    "KRA_MODEL_PATH": str(_ROOT / "models" / "deepseek-r1-8b-q5_k_m.gguf"),
    "KRA_N_GPU_LAYERS": "-1",
    "KRA_N_CTX": "8192",
    "KRA_TEMPERATURE": "0.6",
    "KRA_MAX_TOKENS": "4096",
    # KRA CPU fallback (used automatically when NVIDIA is not available)
    # CPU fallback uses Qwen2.5-7B-Instruct (Q4_K_M) — a stronger 7B model
    # that avoids shared-model lock contention with ORA.
    "KRA_FORCE_CPU": "0",
    "KRA_CPU_FALLBACK_MODEL_PATH": str(_ROOT / "models" / "Qwen2.5-7B-Instruct-Q4_K_M.gguf"),
    "KRA_CPU_FALLBACK_N_GPU_LAYERS": "0",
    "KRA_CPU_FALLBACK_N_CTX": "3072",
    "KRA_CPU_FALLBACK_TEMPERATURE": "0.2",
    "KRA_CPU_FALLBACK_MAX_TOKENS": "1536",

    # ORA (CPU)
    "ORA_MODEL_PATH": str(_ROOT / "models" / "phi-3.5-mini-q4_k_m.gguf"),
    "ORA_N_GPU_LAYERS": "0",        # CPU only
    "ORA_N_CTX": "4096",
    "ORA_TEMPERATURE": "0.3",
    "ORA_MAX_TOKENS": "2048",
}


def _env(key: str) -> str:
    return os.getenv(key, _DEFAULTS.get(key, ""))


def _resolve_model_path(raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser()
    if candidate.is_absolute():
        return candidate
    return (_ROOT / candidate).resolve()


def _has_nvidia_gpu() -> bool:
    if _env("KRA_FORCE_CPU").strip() == "1":
        return False

    nvidia_smi = shutil.which("nvidia-smi")
    if not nvidia_smi:
        return False

    try:
        result = subprocess.run(
            [nvidia_smi, "-L"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except Exception:
        return False

    return result.returncode == 0 and bool(result.stdout.strip())


def _resolve_kra_runtime() -> Dict[str, Any]:
    primary_path = _resolve_model_path(_env("KRA_MODEL_PATH"))
    fallback_path = _resolve_model_path(_env("KRA_CPU_FALLBACK_MODEL_PATH") or _env("ORA_MODEL_PATH"))

    has_nvidia_gpu = _has_nvidia_gpu()
    if has_nvidia_gpu and primary_path.exists():
        return {
            "model_path": str(primary_path),
            "n_gpu_layers": int(_env("KRA_N_GPU_LAYERS")),
            "n_ctx": int(_env("KRA_N_CTX")),
            "temperature": float(_env("KRA_TEMPERATURE")),
            "max_tokens": int(_env("KRA_MAX_TOKENS")),
            "runtime": "nvidia_gpu",
            "fallback_active": False,
            "reason": "nvidia_available",
        }

    if fallback_path.exists():
        return {
            "model_path": str(fallback_path),
            "n_gpu_layers": int(_env("KRA_CPU_FALLBACK_N_GPU_LAYERS")),
            "n_ctx": int(_env("KRA_CPU_FALLBACK_N_CTX")),
            "temperature": float(_env("KRA_CPU_FALLBACK_TEMPERATURE")),
            "max_tokens": int(_env("KRA_CPU_FALLBACK_MAX_TOKENS")),
            "runtime": "cpu_fallback",
            "fallback_active": True,
            "reason": "nvidia_unavailable_or_primary_missing",
        }

    return {
        "model_path": str(primary_path),
        "n_gpu_layers": 0,
        "n_ctx": min(int(_env("KRA_N_CTX")), 3072),
        "temperature": min(float(_env("KRA_TEMPERATURE")), 0.4),
        "max_tokens": min(int(_env("KRA_MAX_TOKENS")), 1536),
        "runtime": "cpu_primary",
        "fallback_active": True,
        "reason": "fallback_model_missing",
    }


# --------------------------------------------------------------------------- #
#  Singleton                                                                   #
# --------------------------------------------------------------------------- #

_instance: Optional["LLMEngine"] = None
_lock = threading.Lock()


class LLMEngine:
    """Thread-safe singleton that holds both LLM model handles."""

    def __init__(self) -> None:
        from llama_cpp import Llama

        self._kra_runtime = _resolve_kra_runtime()

        # Initialize progress bar
        with tqdm(total=2, desc="Loading Models", unit="model") as pbar:
            # ---- KRA model ------------------------------------------------------
            kra_path = self._kra_runtime["model_path"]
            logger.info(
                "Loading KRA model: %s (runtime=%s, n_gpu_layers=%s)",
                kra_path,
                self._kra_runtime["runtime"],
                self._kra_runtime["n_gpu_layers"],
            )
            self.kra_model = Llama(
                model_path=kra_path,
                n_gpu_layers=int(self._kra_runtime["n_gpu_layers"]),
                n_ctx=int(self._kra_runtime["n_ctx"]),
                verbose=False,
            )
            logger.info(
                "KRA model loaded (%d ctx, runtime=%s, reason=%s)",
                int(self._kra_runtime["n_ctx"]),
                self._kra_runtime["runtime"],
                self._kra_runtime["reason"],
            )
            pbar.update(1)

            # ---- ORA model (CPU) ------------------------------------------------
            ora_path = str(_resolve_model_path(_env("ORA_MODEL_PATH")))
            kra_resolved = str(Path(kra_path).resolve())
            ora_resolved = str(Path(ora_path).resolve())

            if kra_resolved == ora_resolved:
                logger.info(
                    "KRA and ORA share the same model file — reusing instance (saves ~2 GB RAM)"
                )
                self.ora_model = self.kra_model
                self._shared_model = True
            else:
                logger.info("Loading ORA model: %s (CPU)", ora_path)
                self.ora_model = Llama(
                    model_path=ora_path,
                    n_gpu_layers=int(_env("ORA_N_GPU_LAYERS")),
                    n_ctx=int(_env("ORA_N_CTX")),
                    verbose=False,
                )
                self._shared_model = False
            logger.info("ORA model ready (%d ctx, CPU only)", int(_env("ORA_N_CTX")))
            pbar.update(1)

        # Inference locks (llama.cpp is not thread-safe per model instance)
        self._kra_lock = threading.Lock()
        # Shared model → single lock; separate models → independent locks
        self._ora_lock = self._kra_lock if self._shared_model else threading.Lock()

    # -- Singleton accessor ------------------------------------------------- #

    @classmethod
    def is_loaded(cls) -> tuple[bool, bool]:
        """Return (kra_loaded, ora_loaded) without triggering initialization.

        Safe to call at any time: returns (False, False) if not yet initialized.
        Both models load together in __init__, so the answer is symmetric.
        """
        global _instance
        loaded = _instance is not None
        return loaded, loaded

    @classmethod
    def instance(cls) -> "LLMEngine":
        """Return the singleton LLMEngine, creating it on first call."""
        global _instance
        if _instance is None:
            with _lock:
                if _instance is None:
                    _instance = cls()
        return _instance

    # -- KRA inference ------------------------------------------------------ #

    def generate_kra(
        self,
        prompt: str,
        *,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        cancel_event: Optional[threading.Event] = None,
    ) -> str:
        """
        Run KRA inference using the selected runtime.

        Args:
            prompt: Full KRA prompt (system + user).
            temperature: Sampling temperature (default from .env).
            max_tokens: Max generation tokens.
            cancel_event: Set this event to abort generation.

        Returns:
            Raw model output string.
        """
        temp = temperature if temperature is not None else float(self._kra_runtime["temperature"])
        tokens = max_tokens if max_tokens is not None else int(self._kra_runtime["max_tokens"])

        logger.info("KRA inference starting (temp=%.2f, max_tokens=%d)", temp, tokens)

        with self._kra_lock:
            if cancel_event and cancel_event.is_set():
                raise RuntimeError("ANALYSIS_CANCELLED")

            result = self.kra_model.create_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                temperature=temp,
                max_tokens=tokens,
                top_p=0.9,
                repeat_penalty=1.1,
            )

        text = result["choices"][0]["message"]["content"]
        logger.info("KRA inference completed (%d chars)", len(text))
        return text

    # -- ORA inference (CPU) ------------------------------------------------ #

    def generate_ora(
        self,
        prompt: str,
        *,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        cancel_event: Optional[threading.Event] = None,
    ) -> str:
        """
        Run ORA inference on CPU.

        Args:
            prompt: Full ORA prompt (system + user).
            temperature: Sampling temperature (default from .env).
            max_tokens: Max generation tokens.
            cancel_event: Set this event to abort generation.

        Returns:
            Raw model output string.
        """
        temp = temperature if temperature is not None else float(_env("ORA_TEMPERATURE"))
        tokens = max_tokens if max_tokens is not None else int(_env("ORA_MAX_TOKENS"))

        logger.info("ORA inference starting on CPU (temp=%.2f, max_tokens=%d)", temp, tokens)

        with self._ora_lock:
            if cancel_event and cancel_event.is_set():
                raise RuntimeError("ANALYSIS_CANCELLED")

            result = self.ora_model.create_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                temperature=temp,
                max_tokens=tokens,
                top_p=0.9,
                repeat_penalty=1.05,
            )

        text = result["choices"][0]["message"]["content"]
        logger.info("ORA inference completed (%d chars)", len(text))
        return text

    # -- Health / diagnostics ----------------------------------------------- #

    def health(self) -> Dict[str, Any]:
        """Report model loading status."""
        return {
            "kra_loaded": self.kra_model is not None,
            "ora_loaded": self.ora_model is not None,
            "kra_model": self._kra_runtime["model_path"],
            "ora_model": str(_resolve_model_path(_env("ORA_MODEL_PATH"))),
            "kra_gpu_layers": int(self._kra_runtime["n_gpu_layers"]),
            "ora_gpu_layers": int(_env("ORA_N_GPU_LAYERS")),
            "kra_runtime": self._kra_runtime["runtime"],
            "kra_fallback_active": bool(self._kra_runtime["fallback_active"]),
            "kra_runtime_reason": self._kra_runtime["reason"],
            "shared_model": getattr(self, "_shared_model", False),
        }
