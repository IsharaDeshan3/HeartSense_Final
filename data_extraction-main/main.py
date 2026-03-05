import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models.schemas import TranslationRequest, TranslationResponse
from services.translation import TranslationService
from services.medical_extraction import MedicalExtractionService
from services.state_manager import MedicalStateManager
from services.cardiac_checks import check_missing
from models.schemas import MedicalExtractionRequest, OrchestrationRequest, OrchestrationResponse
from models.medical_entities import MedicalData

# Load environment variables from .env file
load_dotenv()

# Set GOOGLE_APPLICATION_CREDENTIALS from .env
if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

app = FastAPI(
    title="Clinical Translation API",
    description="Sinhala to English translation for medical conversations (Demo)",
    version="1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

translator = TranslationService()
extractor = MedicalExtractionService()
state_manager = MedicalStateManager()


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Clinical Translation & Extraction",
        "version": "1.0"
    }


@app.post("/translate", response_model=TranslationResponse)
def translate_text(request: TranslationRequest):
    translated = translator.translate_text(
        text=request.text,
        target_lang=request.target_language
    )

    return TranslationResponse(
        original_text=request.text,
        translated_text=translated
    )

@app.post("/extract-medical", response_model=MedicalData)
def extract_medical_data(request: MedicalExtractionRequest):
    return extractor.extract(request.translated_text)

@app.post("/process-transcript", response_model=OrchestrationResponse)
def process_transcript(request: OrchestrationRequest):

    # 1️⃣ Translate Sinhala → English
    translated = translator.translate_text(request.transcript_si)

    # 2️⃣ Extract medical entities (now returns dict with 'missing')

    extracted_raw = extractor.extract(translated)
    # If already a dict, use as is; if MedicalData, convert to dict
    if hasattr(extracted_raw, 'dict'):
        extracted_dict = extracted_raw.dict()
    else:
        extracted_dict = extracted_raw
    # Convert to MedicalData for state update
    extracted = MedicalData(**{k: v for k, v in extracted_dict.items() if k in ["symptoms", "medical_history", "allergies", "risk_factors"]})

    # 3️⃣ Update patient medical state
    updated_state = state_manager.update_state(
        request.current_state,
        extracted
    )

    # 4️⃣ Check missing critical cardiac info, using agent's missing
    agent_missing = extracted_dict.get("missing", {})
    missing = check_missing(updated_state, extracted_missing=agent_missing)

    return OrchestrationResponse(
        updated_state=updated_state,
        missing_critical=missing,
        translated_text=translated
    )

@app.post("/update-item-status")
def update_item_status(request: dict):
    # In a real research app, this would persist to a session DB
    # For now, we return success to allow UI state progression
    return {"status": "success", "message": f"Item {request.get('item')} {request.get('status')}"}