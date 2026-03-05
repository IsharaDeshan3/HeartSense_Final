from pydantic import BaseModel
from typing import Dict

class TrackedItem(BaseModel):
    value: str
    status: str = "pending"  # pending | accepted | rejected


class PatientState(BaseModel):
    symptoms: Dict[str, TrackedItem] = {}
    medical_history: Dict[str, TrackedItem] = {}
    allergies: Dict[str, TrackedItem] = {}
    risk_factors: Dict[str, TrackedItem] = {}
