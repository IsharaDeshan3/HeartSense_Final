# HuggingFace KRA Backend

Standalone FastAPI backend that sends KRA analysis requests to a Hugging Face
Space instead of the local GGUF model.  Reads patient data from the **same
workflow SQLite database** used by `analysis_flow` — zero data duplication.

## Architecture

```
┌─────────────────────────────┐
│   Existing Frontend (Next)  │
│  /dashboard → AiDiagnostics │
│  + "Analyze with HF" button │
└──────────┬──────────────────┘
           │ POST /api/huggingface/analyze
           ▼
┌─────────────────────────────┐
│  Next.js API proxy route    │
│  /app/api/huggingface/...   │
└──────────┬──────────────────┘
           │ POST http://localhost:8090/analyze
           ▼
┌─────────────────────────────┐
│  hugg_backend (FastAPI)     │
│  Port 8090                  │
│                             │
│  1. Read session from       │
│     shared SQLite DB        │
│  2. Read FAISS context      │
│     already generated       │
│  3. Build KRA prompt        │
│  4. POST to HF Space       │
│  5. Return parsed result    │
└──────────┬──────────────────┘
           │ HTTP
           ▼
┌─────────────────────────────┐
│  HuggingFace Space          │
│  (remote LLM inference)     │
└─────────────────────────────┘
```

## Quick Start

```bash
cd hugg_backend
pip install -r requirements.txt
python main.py
```

Server starts on **http://localhost:8090**.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — shows HF Space URL and token status |
| POST | `/analyze` | Run KRA analysis via HF Space |
| GET | `/session/{id}` | Read-only view of session data |

### POST /analyze

```json
{
  "session_id": "uuid-from-workflow",
  "experience_level": "seasoned"
}
```

### Response

```json
{
  "session_id": "...",
  "status": "COMPLETED",
  "kra_raw": "raw model output ...",
  "kra_result": {
    "diagnoses": [...],
    "uncertainties": [...],
    "recommended_tests": [...],
    "red_flags": [...]
  },
  "source": "huggingface_space",
  "space_url": "https://...",
  "duration_ms": 12345
}
```

## Configuration (.env)

| Variable | Description |
|----------|-------------|
| `HF_TOKEN` | Preferred Hugging Face API token |
| `HUGGINGFACEHUB_API_TOKEN` | Standard Hugging Face token env name, also supported |
| `HUGGINGFACE_API_TOKEN` | Alternate token env name, also supported |
| `KRA_SPACE_URL` | URL of the HF Space running the KRA model |
| `WORKFLOW_DB_PATH` | Path to the shared workflow SQLite DB |
| `HF_INFERENCE_TIMEOUT` | Request timeout in seconds (default: 300) |

Token-based login is enough for this app. You do not need to run `huggingface-cli login` unless you also want CLI access on the machine. Add one of the token variables above to `hugg_backend/.env`, then restart the backend.

## How It Works

1. User clicks **"Analyze with Hugging Face"** in the main dashboard.
2. A popup window opens at `/huggingface-analysis?sessionId=...`.
3. The popup calls `POST /api/huggingface/analyze` (Next.js proxy → hugg_backend).
4. `hugg_backend` reads the patient's symptoms, ECG, and lab data from the
   **same SQLite DB** used by the local pipeline.
5. It also reads the FAISS retrieval context that was already generated.
6. It builds the KRA prompt and sends it to the configured HF Space.
7. The response is parsed and displayed in the popup window.

**The existing local analysis pipeline is completely untouched.**
