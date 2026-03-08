"""
download_models.py

One-time setup script to download GGUF models from HuggingFace Hub.
Downloads:
  - DeepSeek-R1-Distill-Llama-8B Q5_K_M  → models/deepseek-r1-8b-q5_k_m.gguf
      Primary KRA model when NVIDIA is available
  - Qwen2.5-7B-Instruct Q4_K_M           → models/Qwen2.5-7B-Instruct-Q4_K_M.gguf
      KRA CPU fallback model
  - Phi-3.5-mini-instruct Q4_K_M         → models/phi-3.5-mini-q4_k_m.gguf
      ORA model (CPU only)

Usage:
    python download_models.py
"""

import os
import sys
from pathlib import Path

import requests
from dotenv import find_dotenv, load_dotenv
from huggingface_hub import hf_hub_url
from tqdm import tqdm

load_dotenv(find_dotenv())

MODELS_DIR = Path(__file__).parent / "models"

MODELS = [
    {
        "repo_id": "bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF",
        "filename": "DeepSeek-R1-Distill-Llama-8B-Q5_K_M.gguf",
        "local_name": "deepseek-r1-8b-q5_k_m.gguf",
        "description": "KRA primary model — DeepSeek-R1-Distill-Llama-8B (Q5_K_M, ~5.5 GB, prefers NVIDIA)",
    },
    {
        "repo_id": "bartowski/Qwen2.5-7B-Instruct-GGUF",
        "filename": "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        "local_name": "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        "description": "KRA CPU fallback — Qwen2.5-7B-Instruct (Q4_K_M, ~4.4 GB, CPU)",
    },
    {
        "repo_id": "bartowski/Phi-3.5-mini-instruct-GGUF",
        "filename": "Phi-3.5-mini-instruct-Q4_K_M.gguf",
        "local_name": "phi-3.5-mini-q4_k_m.gguf",
        "description": "ORA model — Phi-3.5-mini-instruct (Q4_K_M, ~2.3 GB, CPU)",
    },
]


def _build_headers() -> dict[str, str]:
    token = os.getenv("HF_TOKEN", "").strip()
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _resolve_download_url(repo_id: str, filename: str) -> str:
    return hf_hub_url(repo_id=repo_id, filename=filename)


def _get_remote_size(session: requests.Session, url: str, headers: dict[str, str]) -> int | None:
    response = session.head(url, headers=headers, allow_redirects=True, timeout=30)
    response.raise_for_status()

    content_length = response.headers.get("Content-Length")
    if not content_length:
        return None

    try:
        return int(content_length)
    except ValueError:
        return None


def _get_expected_size(repo_id: str, filename: str) -> int | None:
    headers = _build_headers()
    url = _resolve_download_url(repo_id, filename)

    with requests.Session() as session:
        return _get_remote_size(session, url, headers)


def _model_matches_selection(model: dict[str, str], selected_models: set[str] | None) -> bool:
    if not selected_models:
        return True

    aliases = {
        model["local_name"].lower(),
        model["filename"].lower(),
        model["repo_id"].lower(),
        model["repo_id"].split("/", 1)[-1].lower(),
        model["local_name"].split("-", 1)[0].lower(),
    }

    for selected in selected_models:
        if any(selected in alias or alias in selected for alias in aliases):
            return True

    return False


def _download_with_progress(repo_id: str, filename: str, dest: Path, description: str) -> None:
    url = _resolve_download_url(repo_id, filename)
    headers = _build_headers()
    temp_path = dest.with_suffix(dest.suffix + ".part")
    active_path = temp_path if temp_path.exists() else dest

    with requests.Session() as session:
        remote_size = _get_remote_size(session, url, headers)
        existing_size = active_path.stat().st_size if active_path.exists() else 0

        request_headers = dict(headers)
        mode = "wb"
        if existing_size and remote_size and existing_size < remote_size:
            request_headers["Range"] = f"bytes={existing_size}-"
            mode = "ab"
        elif existing_size and remote_size and existing_size >= remote_size:
            if active_path == temp_path and not dest.exists():
                temp_path.replace(dest)
            return
        elif existing_size and remote_size is None:
            active_path.unlink(missing_ok=True)
            existing_size = 0

        with session.get(url, headers=request_headers, stream=True, allow_redirects=True, timeout=30) as response:
            if response.status_code == 416 and remote_size and existing_size >= remote_size:
                if active_path == temp_path and not dest.exists():
                    temp_path.replace(dest)
                return

            if response.status_code == 200 and mode == "ab":
                active_path.unlink(missing_ok=True)
                existing_size = 0
                mode = "wb"

            response.raise_for_status()

            total_size = remote_size
            if response.status_code == 206:
                content_range = response.headers.get("Content-Range", "")
                if "/" in content_range:
                    try:
                        total_size = int(content_range.rsplit("/", 1)[1])
                    except ValueError:
                        total_size = remote_size
                elif response.headers.get("Content-Length"):
                    total_size = existing_size + int(response.headers["Content-Length"])
            elif response.headers.get("Content-Length"):
                try:
                    total_size = int(response.headers["Content-Length"])
                except ValueError:
                    total_size = remote_size

            progress = tqdm(
                total=total_size,
                initial=existing_size,
                unit="B",
                unit_scale=True,
                unit_divisor=1024,
                desc=description[:32],
                ascii=True,
            )

            try:
                with active_path.open(mode) as handle:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if not chunk:
                            continue
                        handle.write(chunk)
                        progress.update(len(chunk))
            finally:
                progress.close()

    if active_path == temp_path:
        temp_path.replace(dest)


def download_all(selected_models: set[str] | None = None):
    try:
        import huggingface_hub  # noqa: F401
    except ImportError:
        print("ERROR: huggingface-hub is not installed.")
        print("  pip install huggingface-hub")
        sys.exit(1)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    for model in MODELS:
        if not _model_matches_selection(model, selected_models):
            continue

        dest = MODELS_DIR / model["local_name"]
        if dest.exists():
            local_size = dest.stat().st_size
            expected_size = _get_expected_size(model["repo_id"], model["filename"])
            if expected_size and local_size < expected_size:
                current_gb = local_size / (1024 ** 3)
                total_gb = expected_size / (1024 ** 3)
                print(f"[RESUME] {model['local_name']} is partial ({current_gb:.1f} / {total_gb:.1f} GB)")
            else:
                size_gb = local_size / (1024 ** 3)
                print(f"[SKIP] {model['local_name']} already exists ({size_gb:.1f} GB)")
                continue

        print(f"\n{'='*60}")
        print(f"Downloading: {model['description']}")
        print(f"  From: {model['repo_id']}/{model['filename']}")
        print(f"  To:   {dest}")
        print(f"{'='*60}\n")

        try:
            _download_with_progress(
                repo_id=model["repo_id"],
                filename=model["filename"],
                dest=dest,
                description=model["local_name"],
            )

            size_gb = dest.stat().st_size / (1024 ** 3)
            print(f"[OK] Downloaded {model['local_name']} ({size_gb:.1f} GB)")

        except Exception as exc:
            print(f"[ERROR] Failed to download {model['local_name']}: {exc}")
            sys.exit(1)

    print(f"\n{'='*60}")
    print("All models downloaded successfully!")
    print(f"  Models directory: {MODELS_DIR}")
    print(f"{'='*60}")


if __name__ == "__main__":
    selected = {arg.strip().lower() for arg in sys.argv[1:] if arg.strip()}
    download_all(selected or None)
