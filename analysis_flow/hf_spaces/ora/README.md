---
title: ORA Output Refinement Agent
emoji: 🩺
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: "5.12.0"
python_version: "3.10"
app_file: app.py
pinned: false
---

# Output Refinement Agent (ORA)

Refines KRA diagnostic output into clinician-facing text, powered by **OpenChat-3.5-0106**.

## API Integration

This Space is called programmatically by the Heart-Sense AI local backend via Gradio 6.x SSE queue protocol.

### Function Index

| fn_index | Function | Args | Returns |
|---|---|---|---|
| `0` | `refine` | `kra_json (str), symptoms (str), experience_level (str)` | `dict` |
| `1` | `refine_from_supabase` | `kra_output_id (str), experience_level (str)` | `dict` |

**The local backend uses `fn_index=1` (`refine_from_supabase`).**

### Return Format

```json
{
  "refined_output": "## Clinical Assessment\n...",
  "disclaimer": "[!] AI-generated. Verify clinically.",
  "status": "success"
}
```

### Data Flow

```
Local FastAPI backend
  → saves KRA output to Supabase `kra_outputs`
  → POST /gradio_api/queue/join  { data: [kra_output_id, "SEASONED"], fn_index: 1 }
  → GET  /gradio_api/queue/data  (SSE stream)
  → Receives refined output dict
```

## Required HF Space Secrets

| Secret | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key |

## Experience Levels

| Level | Target Audience | Output Style |
|---|---|---|
| `NEWBIE` | Junior clinicians, medical students | Plain language, numbered steps, explained terms |
| `SEASONED` | Experienced clinicians | Standard medical terminology, ranked differentials |
| `EXPERT` | Specialists, consultants | Concise, high-signal, abbreviated notation |

## Local Backend Configuration

```env
ORA_ENDPOINT=https://YOUR-USERNAME-ora-agent.hf.space
HF_TOKEN=hf_your_token_here
```

## Notes

- `fn_index=0` (`refine`) accepts raw KRA JSON strings directly — useful for testing
- `fn_index=1` (`refine_from_supabase`) is the production endpoint called by the backend
- The Space uses `@spaces.GPU(duration=120)` per-request
