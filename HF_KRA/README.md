---
title: KRA Analysis API
emoji: 🧠
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# KRA Analysis API

This Hugging Face Space exposes a standalone HTTP API for KRA-style analysis.
It is intentionally isolated from the current analysis backend so you can delete
this folder later without affecting the existing system.

This repository is meant to be deployed as a Docker Space on GPU hardware such
as Nvidia T4 medium. It serves JSON over HTTP and keeps clinical/session state
outside the Space filesystem.

## Endpoints

- `GET /` - basic service info
- `GET /health` - readiness check
- `GET /runtime` - reports selected device and fallback flags
- `POST /v1/kra/analyze` - run one KRA analysis request

## Environment variables

- `MODEL_ID` - Hugging Face model id to load
- `HF_TOKEN` - optional token for gated models
- `MAX_NEW_TOKENS` - generation limit, default `768`
- `TEMPERATURE` - generation temperature, default `0.2`
- `TOP_P` - nucleus sampling parameter, default `0.9`
- `FORCE_CPU` - force CPU even when CUDA is visible (`1` or `0`)
- `WARMUP_ON_STARTUP` - preload model at startup (`1` or `0`)
- `HF_HOME` - cache directory, default `/home/user/.cache/huggingface` (set `/data/.huggingface` only when `/data` is writable)
- `PORT` - optional server port override, defaults to `7860`

Set `MODEL_ID` as a runtime variable and `HF_TOKEN` as a secret in the Space
Settings tab. Avoid storing patient data or workflow state in the Space disk.

## Deployment notes

Use a Docker Space on Nvidia T4 medium for the best balance of cost and performance.
Default cache path is `/home/user/.cache/huggingface`, which is writable in Spaces.
If you enable persistent storage and verify `/data` is writable in your runtime,
you can set `HF_HOME=/data/.huggingface` so model downloads survive restarts.

Keep the clinical workflow state in your backend or external database.
Do not rely on the Space filesystem for patient/session persistence.
The Space should remain stateless so it can be recreated or deleted safely.

## CPU fallback testing before buying GPU

You can validate KRA inference on CPU in two ways:

1. No GPU assigned: the engine auto-selects CPU.
2. GPU assigned but forced CPU: set `FORCE_CPU=1`.

Suggested test setup for faster startup:

- `MODEL_ID=sshleifer/tiny-gpt2`
- `FORCE_CPU=1`
- `WARMUP_ON_STARTUP=0`

After startup, call `GET /runtime` and confirm:

- `device` is `cpu`
- `force_cpu` is `true` when enabled
- `cuda_available` and `cuda_usable` reflect runtime availability
