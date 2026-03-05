---
title: KRA Cardiology Agent
emoji: 🫀
colorFrom: red
colorTo: purple
sdk: gradio
sdk_version: "5.12.0"
python_version: "3.10"
app_file: app.py
pinned: false
---

# Cardiology AI Agent (KRA)

Knowledge Reasoning Agent for cardiac diagnostic analysis, powered by **Phi-3-mini-4k-instruct**.

## API Integration

This Space is called programmatically by the Heart-Sense AI local backend via Gradio 6.x SSE queue protocol.

### Function Index

| fn_index | Function | Args | Returns |
|---|---|---|---|
| `0` | `analyze_from_supabase` | `payload_id (str), temperature (float), show_reasoning (bool)` | `str` (Markdown diagnostic report) |

### Data Flow

```
Local FastAPI backend
  → saves patient data to Supabase `analysis_payloads`
  → POST /gradio_api/queue/join  { data: [payload_id, 0.6, false], fn_index: 0 }
  → GET  /gradio_api/queue/data  (SSE stream)
  → Receives Markdown diagnostic report
```

## Required HF Space Secrets

| Secret | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Service role key — bypasses Row Level Security |

## Model

| Model | Quantization | VRAM |
|---|---|---|
| `microsoft/Phi-3-mini-4k-instruct` | 4-bit NF4 | ~4GB |

The model is pre-loaded at Space startup to minimise cold-start latency on API calls.

## Local Backend Configuration

Set these in your local `.env` file:

```env
KRA_ENDPOINT=https://YOUR-USERNAME-kra-agent.hf.space
HF_TOKEN=hf_your_token_here
```

## Notes

- The `model_choice` parameter in older client versions is **deprecated** — this Space always uses Phi-3-mini-4k-instruct
- Temperature defaults to `0.6` and show_reasoning to `false`
- The Space uses `@spaces.GPU(duration=300)` — GPU is borrowed per-request
