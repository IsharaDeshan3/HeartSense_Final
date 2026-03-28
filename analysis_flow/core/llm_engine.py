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

import importlib.util
import logging
import os
import platform
import shutil
import subprocess
import sys
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
_EXPECTED_PYTHON = (3, 10, 11)

_DEFAULTS: Dict[str, Any] = {
    # KRA primary path (preferred when NVIDIA is available)
    "KRA_MODEL_PATH": str(_ROOT / "models" / "deepseek-r1-8b-q5_k_m.gguf"),
    "KRA_N_GPU_LAYERS": "-1",
    "KRA_N_CTX": "8192",
    "KRA_TEMPERATURE": "0.6",
    "KRA_MAX_TOKENS": "4096",
    # KRA CPU fallback (used automatically when NVIDIA is not available)
    # Use a locally available DeepSeek GGUF by default.
    "KRA_FORCE_CPU": "0",
    "KRA_CPU_FALLBACK_MODEL_PATH": str(_ROOT / "models" / "DeepSeek-R1-Distill-Llama-8B-Q5_K_M.gguf"),
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


def _python_runtime_details() -> Dict[str, Any]:
    python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    expected_python = ".".join(str(part) for part in _EXPECTED_PYTHON)
    return {
        "python_version": python_version,
        "python_expected": expected_python,
        "python_version_supported": sys.version_info[:3] == _EXPECTED_PYTHON,
        "python_executable": sys.executable,
    }


def _resolve_model_path(raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser()
    if candidate.is_absolute():
        return candidate
    return (_ROOT / candidate).resolve()


def _probe_nvidia_gpu() -> Dict[str, Any]:
    forced_cpu = _env("KRA_FORCE_CPU").strip() == "1"
    nvidia_smi = shutil.which("nvidia-smi")
    result: Dict[str, Any] = {
        "forced_cpu": forced_cpu,
        "nvidia_smi_path": nvidia_smi,
        "gpu_visible": False,
        "returncode": None,
        "stdout": "",
        "stderr": "",
    }

    if forced_cpu:
        result["stderr"] = "KRA_FORCE_CPU=1"
        return result

    if not nvidia_smi:
        result["stderr"] = "nvidia-smi not found on PATH"
        return result

    try:
        probe = subprocess.run(
            [nvidia_smi, "-L"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except Exception as exc:
        result["stderr"] = str(exc)
        return result

    result["returncode"] = probe.returncode
    result["stdout"] = probe.stdout.strip()
    result["stderr"] = probe.stderr.strip()
    result["gpu_visible"] = probe.returncode == 0 and bool(probe.stdout.strip())
    return result


def _ensure_model_file(path: Path, *, label: str) -> None:
    if not path.exists():
        raise FileNotFoundError(f"{label} model file not found: {path}")


def _ensure_llama_cpp_available() -> None:
    if importlib.util.find_spec("llama_cpp") is not None:
        return

    details = _python_runtime_details()
    raise RuntimeError(
        "llama_cpp is not installed in the active analysis_flow environment "
        f"({details['python_executable']}, Python {details['python_version']}). "
        "Recreate analysis_flow/.venv with Python 3.10.11 and install llama-cpp-python there."
    )


def _has_nvidia_gpu() -> bool:
    return bool(_probe_nvidia_gpu()["gpu_visible"])


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
_last_init_error: Optional[str] = None
_last_init_error_type: Optional[str] = None
_dll_dir_handles: list[Any] = []
_registered_dll_dirs: set[str] = set()


def _detect_windows_cuda_toolkit() -> Dict[str, Any]:
    info: Dict[str, Any] = {
        "platform": platform.system(),
        "toolkit_path": None,
        "toolkit_version": None,
        "bin_dirs": [],
    }
    if os.name != "nt":
        return info

    candidates: list[Path] = []
    env_candidates = [
        os.getenv("CUDA_PATH"),
        *(value for key, value in os.environ.items() if key.startswith("CUDA_PATH_V")),
    ]
    for value in env_candidates:
        if value:
            path = Path(value)
            if path.exists():
                candidates.append(path)

    toolkit_root = Path(r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA")
    if toolkit_root.exists():
        candidates.extend(path for path in toolkit_root.iterdir() if path.is_dir())

    unique_candidates: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate.resolve()).lower()
        if key in seen:
            continue
        seen.add(key)
        unique_candidates.append(candidate)

    def _version_key(path: Path) -> tuple[int, ...]:
        text = path.name.lstrip("vV")
        parts: list[int] = []
        for chunk in text.split("."):
            try:
                parts.append(int(chunk))
            except ValueError:
                parts.append(0)
        return tuple(parts)

    if not unique_candidates:
        return info

    selected = max(unique_candidates, key=_version_key)
    bin_dirs = [selected / "bin" / "x64", selected / "bin"]
    info["toolkit_path"] = str(selected)
    info["toolkit_version"] = selected.name.lstrip("vV") or None
    info["bin_dirs"] = [str(path) for path in bin_dirs if path.exists()]
    return info


def _configure_windows_dll_search_paths() -> Dict[str, Any]:
    info = _detect_windows_cuda_toolkit()
    info["dll_search_paths"] = []

    if os.name != "nt" or not hasattr(os, "add_dll_directory"):
        return info

    spec = importlib.util.find_spec("llama_cpp")
    llama_lib_dir: Optional[Path] = None
    if spec and spec.origin:
        candidate = Path(spec.origin).resolve().parent / "lib"
        if candidate.exists():
            llama_lib_dir = candidate

    candidate_dirs: list[Path] = []
    if llama_lib_dir is not None:
        candidate_dirs.append(llama_lib_dir)
    candidate_dirs.extend(Path(path) for path in info.get("bin_dirs", []))

    for directory in candidate_dirs:
        resolved = str(directory.resolve())
        if resolved in _registered_dll_dirs:
            info["dll_search_paths"].append(resolved)
            continue
        try:
            handle = os.add_dll_directory(resolved)
        except OSError:
            continue
        _dll_dir_handles.append(handle)
        _registered_dll_dirs.add(resolved)
        info["dll_search_paths"].append(resolved)

    return info


class LLMEngine:
    """Thread-safe singleton that holds both LLM model handles."""

    def __init__(self) -> None:
        python_details = _python_runtime_details()
        self._cuda_runtime = _configure_windows_dll_search_paths()
        if not python_details["python_version_supported"]:
            logger.warning(
                "analysis_flow models are pinned to Python %s, current runtime is Python %s (%s)",
                python_details["python_expected"],
                python_details["python_version"],
                python_details["python_executable"],
            )

        _ensure_llama_cpp_available()
        from llama_cpp import Llama

        self._kra_runtime = _resolve_kra_runtime()
        nvidia_probe = _probe_nvidia_gpu()
        logger.info(
            "NVIDIA probe — forced_cpu=%s visible=%s nvidia_smi=%s cuda_toolkit=%s",
            nvidia_probe["forced_cpu"],
            nvidia_probe["gpu_visible"],
            nvidia_probe["nvidia_smi_path"],
            self._cuda_runtime.get("toolkit_path"),
        )

        # Initialize progress bar
        with tqdm(total=2, desc="Loading Models", unit="model") as pbar:
            # ---- KRA model ------------------------------------------------------
            kra_path = Path(self._kra_runtime["model_path"])
            _ensure_model_file(kra_path, label="KRA")
            logger.info(
                "Loading KRA model: %s (runtime=%s, n_gpu_layers=%s)",
                kra_path,
                self._kra_runtime["runtime"],
                self._kra_runtime["n_gpu_layers"],
            )
            self.kra_model = Llama(
                model_path=str(kra_path),
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
            ora_path = _resolve_model_path(_env("ORA_MODEL_PATH"))
            _ensure_model_file(ora_path, label="ORA")
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
                    model_path=str(ora_path),
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
    def diagnostics(cls) -> Dict[str, Any]:
        global _instance, _last_init_error, _last_init_error_type
        python_details = _python_runtime_details()
        diagnostics: Dict[str, Any] = {
            "initialized": _instance is not None,
            "kra_loaded": _instance is not None,
            "ora_loaded": _instance is not None,
            "llama_cpp_installed": importlib.util.find_spec("llama_cpp") is not None,
            "init_error": _last_init_error,
            "init_error_type": _last_init_error_type,
            "nvidia_probe": _probe_nvidia_gpu(),
        }
        diagnostics.update(_configure_windows_dll_search_paths())
        diagnostics.update(python_details)
        if _instance is not None:
            diagnostics.update(_instance.health())
        return diagnostics

    @classmethod
    def instance(cls) -> "LLMEngine":
        """Return the singleton LLMEngine, creating it on first call."""
        global _instance, _last_init_error, _last_init_error_type
        if _instance is None:
            with _lock:
                if _instance is None:
                    try:
                        _instance = cls()
                        _last_init_error = None
                        _last_init_error_type = None
                    except Exception as exc:
                        _last_init_error = str(exc)
                        _last_init_error_type = type(exc).__name__
                        logger.exception("LLM engine initialization failed")
                        raise
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
            "init_error": None,
            "init_error_type": None,
            "cuda_toolkit_path": self._cuda_runtime.get("toolkit_path"),
            "cuda_toolkit_version": self._cuda_runtime.get("toolkit_version"),
            "dll_search_paths": self._cuda_runtime.get("dll_search_paths", []),
        }
