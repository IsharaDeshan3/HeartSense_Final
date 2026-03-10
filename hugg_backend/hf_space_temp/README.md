---
title: HeartSense KRA ZeroGPU
colorFrom: blue
colorTo: red
sdk: gradio
app_file: app.py
pinned: false
---

# HeartSense KRA ZeroGPU Space

This folder is a disposable scaffold for a Hugging Face Space that serves your
KRA prompt over ZeroGPU. Copy these files into a new Hugging Face Space repo,
push them there, and then you can delete this local folder.

## Why this shape

- ZeroGPU only supports Gradio Spaces.
- Your local backend already sends a single prompt string to a remote Space.
- This scaffold keeps the Space focused on one job: accept a prompt and return
  generated text.

## Files to copy into the Space repo root

- `README.md`
- `app.py`
- `requirements.txt`
- `.gitignore`
- `.env.example`

## Space settings

1. Create a new **Gradio** Space.
2. In Space hardware settings, choose **ZeroGPU**.
3. Add these Variables/Secrets in the Space settings:

Variables:
- `MODEL_ID=Qwen/Qwen2.5-7B-Instruct`
- `DEFAULT_MAX_NEW_TOKENS=768`
- `MAX_INPUT_CHARS=24000`

Secrets:
- `HF_TOKEN=...` only if the chosen model is gated or private.

## ZeroGPU notes for your PRO quota

- Your PRO plan gives you 25 minutes/day with highest queue priority.
- This scaffold uses the default ZeroGPU size, which is half an H200.
- The generation function requests the GPU only when inference runs.
- Keep `max_new_tokens` moderate. Large outputs waste quota fast.
- Start with `Qwen/Qwen2.5-7B-Instruct`. It is more practical here than trying
  to force the local GGUF workflow into Spaces.

## Local system hookup after Space is live

Update `hugg_backend/.env`:

```env
KRA_SPACE_URL=https://YOUR-SPACE-NAME.hf.space
```

Your local `hugg_backend` already tries `POST /api/generate`, and this scaffold
provides that route.

## Delete policy

This folder is intentionally isolated under `hugg_backend/hf_space_temp` so you
can remove it after you have copied the files into the real Hugging Face Space
repository.