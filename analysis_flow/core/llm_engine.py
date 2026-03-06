"""
core/llm_engine.py

Central LLM manager — loads GGUF models once at startup and provides
thread-safe inference methods.

  KRA  → DeepSeek-R1-Distill-Llama-8B  Q5_K_M  (GPU, n_gpu_layers=-1)
  ORA  → Phi-3.5-mini-instruct          Q4_K_M  (CPU, n_gpu_layers=0)
"""

from __future__ import annotations

import logging
import os
import re
import threading
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Default config (overridable via .env)                                       #
# --------------------------------------------------------------------------- #

_ROOT = Path(__file__).resolve().parent.parent  # analysis_flow/

_DEFAULTS: Dict[str, Any] = {
    # KRA (GPU)
    "KRA_MODEL_PATH": str(_ROOT / "models" / "deepseek-r1-8b-q5_k_m.gguf"),
    "KRA_N_GPU_LAYERS": "-1",       # -1 = offload all layers to GPU
    "KRA_N_CTX": "8192",
    "KRA_TEMPERATURE": "0.6",
    "KRA_MAX_TOKENS": "4096",

    # ORA (CPU)
    "ORA_MODEL_PATH": str(_ROOT / "models" / "phi-3.5-mini-q4_k_m.gguf"),
    "ORA_N_GPU_LAYERS": "0",        # CPU only
    "ORA_N_CTX": "4096",
    "ORA_TEMPERATURE": "0.3",
    "ORA_MAX_TOKENS": "2048",
}


def _env(key: str) -> str:
    return os.getenv(key, _DEFAULTS.get(key, ""))


# --------------------------------------------------------------------------- #
#  Singleton                                                                   #
# --------------------------------------------------------------------------- #

_instance: Optional["LLMEngine"] = None
_lock = threading.Lock()


class LLMEngine:
    """Thread-safe singleton that holds both LLM model handles."""

    def __init__(self) -> None:
        from llama_cpp import Llama

        # ---- KRA model (GPU) ------------------------------------------------
        kra_path = _env("KRA_MODEL_PATH")
        logger.info("Loading KRA model: %s (GPU)", kra_path)
        self.kra_model = Llama(
            model_path=kra_path,
            n_gpu_layers=int(_env("KRA_N_GPU_LAYERS")),
            n_ctx=int(_env("KRA_N_CTX")),
            verbose=False,
        )
        logger.info("KRA model loaded (%d ctx, GPU offload)", int(_env("KRA_N_CTX")))

        # ---- ORA model (CPU) ------------------------------------------------
        ora_path = _env("ORA_MODEL_PATH")
        logger.info("Loading ORA model: %s (CPU)", ora_path)
        self.ora_model = Llama(
            model_path=ora_path,
            n_gpu_layers=int(_env("ORA_N_GPU_LAYERS")),
            n_ctx=int(_env("ORA_N_CTX")),
            verbose=False,
        )
        logger.info("ORA model loaded (%d ctx, CPU only)", int(_env("ORA_N_CTX")))

        # Inference locks (llama.cpp is not thread-safe per model instance)
        self._kra_lock = threading.Lock()
        self._ora_lock = threading.Lock()

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

    # -- KRA inference (GPU) ------------------------------------------------ #

    def generate_kra(
        self,
        prompt: str,
        *,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        cancel_event: Optional[threading.Event] = None,
    ) -> str:
        """
        Run KRA inference on GPU.

        Args:
            prompt: Full KRA prompt (system + user).
            temperature: Sampling temperature (default from .env).
            max_tokens: Max generation tokens.
            cancel_event: Set this event to abort generation.

        Returns:
            Raw model output string.
        """
        temp = temperature if temperature is not None else float(_env("KRA_TEMPERATURE"))
        tokens = max_tokens if max_tokens is not None else int(_env("KRA_MAX_TOKENS"))

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
            "kra_model": _env("KRA_MODEL_PATH"),
            "ora_model": _env("ORA_MODEL_PATH"),
            "kra_gpu_layers": int(_env("KRA_N_GPU_LAYERS")),
            "ora_gpu_layers": int(_env("ORA_N_GPU_LAYERS")),
        }
