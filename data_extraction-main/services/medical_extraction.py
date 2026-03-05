import json
import google.generativeai as genai
from models.medical_entities import MedicalData
from config import GEMINI_API_KEY

genai.configure(api_key=GEMINI_API_KEY)


MODEL_NAME = "gemini-2.5-flash"

SYSTEM_PROMPT = """
You are a clinical information extraction assistant.
Extract ONLY explicitly mentioned medical facts.
Do NOT infer, diagnose, or recommend treatment.
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
        self.model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            system_instruction=SYSTEM_PROMPT
        )

    def extract(self, text: str) -> MedicalData:
        response = self.model.generate_content(
            USER_PROMPT_TEMPLATE.format(text=text),
            generation_config={
                "temperature": 0,
                "response_mime_type": "application/json"
            }
        )

        parsed = json.loads(response.text)
        return MedicalData(**parsed)
