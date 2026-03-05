from pydantic import BaseModel
from typing import List

from typing import Dict

class MedicalData(BaseModel):
    symptoms: List[str] = []
    medical_history: List[str] = []
    allergies: List[str] = []
    risk_factors: List[str] = []
    missing: Dict[str, List[str]] = {"symptoms": [], "risk_factors": []}
