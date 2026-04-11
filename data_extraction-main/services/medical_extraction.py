import json
import itertools
import re
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from models.medical_entities import MedicalData
from config import GEMINI_API_KEYS


MODEL_NAME = "gemini-2.5-flash"

SYSTEM_PROMPT = """
You are a clinical information extraction assistant.
Extract ONLY explicitly mentioned medical facts.
Do NOT infer, diagnose, or recommend treatment.

**Negation handling:**
Pay close attention to negation cues such as "no", "not", "denies", "denied",
"without", "absent", "negative for", "rules out", "never", "does not have",
"not experiencing", "no history of", "no signs of", etc.
When a medical fact is negated, still extract the item but clearly mentioning that with "no", "not" like "no chest pain" or "not experiencing chest pain" to its value. Place it in the SAME field where it would normally appear.

Return ONLY valid JSON.
"""

USER_PROMPT_TEMPLATE = """
Extract the following medical information from the text:

- Symptoms
- Medical history
- Allergies
- Cardiac-related risk factors

Also, if any critical cardiac symptoms or Risk factors are missing in the text, list them (missing):

Text:
"{text}"

Return JSON exactly in this format:
{{
    "symptoms": [],
    "medical_history": [],
    "allergies": [],
    "risk_factors": [],
    "missing": {{
        "symptoms": [],
        "risk_factors": []
    }}
}}
Only include in "missing" the critical symptoms and risk factors above that are not explicitly mentioned in the text.
"""

CRITICAL_CARDIAC_ITEMS = {
    "symptoms": ["chest pain", "shortness of breath", "palpitations"],
    "risk_factors": ["hypertension", "diabetes", "smoking", "family history"]
}

FALLBACK_KEYWORDS = {
    "symptoms": [
        "chest pain", "shortness of breath", "breathlessness", "palpitations",
        "dizziness", "fainting", "syncope", "fatigue"
    ],
    "medical_history": [
        "heart attack", "mi", "angina", "stroke", "kidney disease", "asthma"
    ],
    "allergies": [
        "penicillin", "aspirin", "ibuprofen", "seafood", "nuts"
    ],
    "risk_factors": [
        "hypertension", "high blood pressure", "diabetes", "smoking", "family history",
        "obesity", "high cholesterol"
    ]
}


class MedicalExtractionService:

    def __init__(self):
        # Create a model instance for each API key
        self.models = []
        for key in GEMINI_API_KEYS:
            genai.configure(api_key=key)
            self.models.append(
                genai.GenerativeModel(
                    model_name=MODEL_NAME,
                    system_instruction=SYSTEM_PROMPT
                )
            )
        # Round-robin iterator over models
        self._model_cycle = itertools.cycle(self.models)

    def extract(self, text: str) -> MedicalData:
        last_error = None

        # Try each key once before giving up
        for _ in range(len(self.models)):
            model = next(self._model_cycle)
            try:
                response = model.generate_content(
                    USER_PROMPT_TEMPLATE.format(text=text),
                    generation_config={
                        "temperature": 0,
                        "response_mime_type": "application/json"
                    }
                )
                parsed = json.loads(response.text)
                return MedicalData(**parsed)
            except ResourceExhausted as e:
                last_error = e
                # Rate limited — try the next key
                continue
            except Exception as e:
                # Any transient or response-shape issue should not crash the API.
                last_error = e
                continue

        return self._fallback_extract(text, last_error)

    def _fallback_extract(self, text: str, last_error: Exception | None = None) -> MedicalData:
        """
        Deterministic keyword fallback used when the model is unavailable/rate-limited.
        This keeps the API responsive and lets the frontend continue the workflow.
        """
        normalized = text.lower()
        extracted = {
            "symptoms": self._find_keywords(normalized, FALLBACK_KEYWORDS["symptoms"]),
            "medical_history": self._find_keywords(normalized, FALLBACK_KEYWORDS["medical_history"]),
            "allergies": self._find_keywords(normalized, FALLBACK_KEYWORDS["allergies"]),
            "risk_factors": self._find_keywords(normalized, FALLBACK_KEYWORDS["risk_factors"]),
        }

        missing = {
            "symptoms": [
                item for item in CRITICAL_CARDIAC_ITEMS["symptoms"]
                if item not in normalized
            ],
            "risk_factors": [
                item for item in CRITICAL_CARDIAC_ITEMS["risk_factors"]
                if item not in normalized
            ],
        }

        result = MedicalData(**extracted, missing=missing)

        if last_error:
            print(f"[MedicalExtractionService] Gemini unavailable; using fallback extraction. Last error: {last_error}")

        return result

    @staticmethod
    def _find_keywords(text: str, keywords: list[str]) -> list[str]:
        matched = []
        for keyword in keywords:
            # Match full phrase boundaries to avoid partial word noise.
            pattern = rf"\b{re.escape(keyword)}\b"
            if re.search(pattern, text):
                matched.append(keyword)
        return matched

