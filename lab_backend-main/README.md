# AI Diagnostic Backend

A Python backend application built with FastAPI and MongoDB.

This backend no longer exposes its own login flow. The frontend owns sign-in,
and this service exposes the lab routes directly.

## Features

- FastAPI framework for high-performance API
- MongoDB database connection using Motor (async driver)
- Environment-based configuration
- Health check endpoints
- CORS middleware support
- Lab Agent Step-1 architecture foundation (orchestration jobs + evidence source registry)
- Frontend-managed access with backend lab routes exposed directly

## Prerequisites

- Python 3.8 and + 
- MongoDB (local or remote instance)

## Installation

1. Clone the repository
2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```

3. Activate the virtual environment:
   - Windows:
     ```bash
     venv\Scripts\activate
     ```
   - Linux/Mac:
     ```bash
     source venv/bin/activate
     ```

4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

6. Update the `.env` file with your MongoDB connection string and other settings.

## Running the Application

Start the development server:
```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Endpoints

- `GET /` - Root endpoint with API information
- `GET /health` - Health check endpoint
- `GET /manual-lab-test` - Standalone browser console for manual backend testing

## API Documentation

Once the server is running, you can access:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Manual lab console: `http://localhost:8000/manual-lab-test`

## MongoDB Connection

The application uses Motor (async MongoDB driver) for database operations. Make sure your MongoDB instance is running and accessible at the connection string specified in your `.env` file.

## Project Structure

```
.
├── main.py              # FastAPI application entry point
├── database.py          # MongoDB connection management
├── config.py            # Application configuration
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variables template
└── README.md           # This file
```

## Development

To add new features:
1. Create new route handlers in `main.py` or separate router files
2. Use `get_database()` from `database.py` to access the database
3. Follow FastAPI best practices for async operations

## Lab Agent Step-2 (Evidence-Grounded Gemini)

This repository now includes a proposal-aligned Step-2 implementation for
evidence-grounded recommendations using Gemini, while keeping the same stack.

What is included:
- `GET /api/lab-agent/architecture`: exposes architecture boundaries and pipeline stages
- `POST /api/lab-agent/evidence-sources`: register trusted guideline/resource URLs
- `GET /api/lab-agent/evidence-sources`: list registered sources
- `POST /api/lab-agent/evidence-sources/{source_id}/ingest`: fetch and chunk source text for retrieval
- `POST /api/lab-agent/jobs`: create a patient-level orchestration job
- `GET /api/lab-agent/jobs` and `GET /api/lab-agent/jobs/{job_id}`: monitor orchestration state
- `POST /api/lab-agent/jobs/{job_id}/analyze`: run Gemini analysis grounded on retrieved evidence chunks
- `GET /api/lab-agent/jobs/{job_id}/result`: retrieve validated result and resolved citations
- `POST /api/lab-agent/ocr/jobs`: enqueue OCR in background (non-blocking)
- `GET /api/lab-agent/ocr/jobs/{ocr_job_id}`: check OCR status and extracted text

Collections and indexes added:
- `evidence_sources`
- `evidence_chunks`
- `agent_jobs`
- `agent_results`
- `ocr_jobs`
- `ocr_cache`

Notes:
- Citation IDs are validated against retrieved local evidence snippets before results are saved.
- The service currently ingests text/html and pdf guideline sources for retrieval.
- OCR runs through background workers so upload requests return quickly.
- OCR deduplicates repeated inputs by SHA-256 hash and serves cache hits instantly.
- Patient categorization is two-layer: deterministic rules assign the category, Gemini provides evidence-cited explanation.
- Trend patterns are deterministic and computed per analyte only when at least 4 points are available.
- Trend outputs include summary + per-test pattern objects (trend direction, relative change, slope, anomaly flags).

#
