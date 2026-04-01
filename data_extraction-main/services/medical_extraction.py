import json
import itertools
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

        raise RuntimeError(
            f"All API keys are rate-limited. Last error: {last_error}"
        )

