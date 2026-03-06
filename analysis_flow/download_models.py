"""
download_models.py

One-time setup script to download GGUF models from HuggingFace Hub.
Downloads:
  - DeepSeek-R1-Distill-Llama-8B Q5_K_M  → models/deepseek-r1-8b-q5_k_m.gguf  (KRA, GPU)
  - Phi-3.5-mini-instruct Q4_K_M          → models/phi-3.5-mini-q4_k_m.gguf    (ORA, CPU)

Usage:
    python download_models.py
"""

import os
import sys
from pathlib import Path

MODELS_DIR = Path(__file__).parent / "models"

MODELS = [
    {
        "repo_id": "bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF",
        "filename": "DeepSeek-R1-Distill-Llama-8B-Q5_K_M.gguf",
        "local_name": "deepseek-r1-8b-q5_k_m.gguf",
        "description": "KRA Agent — DeepSeek-R1-Distill-Llama-8B (Q5_K_M, ~5.5 GB, GPU)",
    },
    {
        "repo_id": "bartowski/Phi-3.5-mini-instruct-GGUF",
        "filename": "Phi-3.5-mini-instruct-Q4_K_M.gguf",
        "local_name": "phi-3.5-mini-q4_k_m.gguf",
        "description": "ORA Agent — Phi-3.5-mini-instruct (Q4_K_M, ~2.3 GB, CPU)",
    },
]


def download_all():
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("ERROR: huggingface-hub is not installed.")
        print("  pip install huggingface-hub")
        sys.exit(1)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    for model in MODELS:
        dest = MODELS_DIR / model["local_name"]
        if dest.exists():
            size_gb = dest.stat().st_size / (1024 ** 3)
            print(f"[SKIP] {model['local_name']} already exists ({size_gb:.1f} GB)")
            continue

        print(f"\n{'='*60}")
        print(f"Downloading: {model['description']}")
        print(f"  From: {model['repo_id']}/{model['filename']}")
        print(f"  To:   {dest}")
        print(f"{'='*60}\n")

        try:
            downloaded_path = hf_hub_download(
                repo_id=model["repo_id"],
                filename=model["filename"],
                local_dir=str(MODELS_DIR),
                local_dir_use_symlinks=False,
            )
            # Rename if the downloaded filename differs
            downloaded = Path(downloaded_path)
            if downloaded.name != model["local_name"]:
                final = MODELS_DIR / model["local_name"]
                downloaded.rename(final)
                print(f"  Renamed to: {model['local_name']}")

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
    download_all()
