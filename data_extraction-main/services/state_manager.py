from models.patient_state import PatientState, TrackedItem
from models.medical_entities import MedicalData


class MedicalStateManager:

    def update_state(
        self,
        state: PatientState,
        extracted: MedicalData
    ) -> PatientState:

        self._merge(state.symptoms, extracted.symptoms)
        self._merge(state.medical_history, extracted.medical_history)
        self._merge(state.allergies, extracted.allergies)
        self._merge(state.risk_factors, extracted.risk_factors)

        return state

    def _merge(self, state_dict, new_items):
        for item in new_items:
            key = item.lower().strip()
            if key not in state_dict:
                state_dict[key] = TrackedItem(value=item)
