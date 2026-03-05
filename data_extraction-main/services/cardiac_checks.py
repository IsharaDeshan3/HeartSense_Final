CRITICAL_CARDIAC_ITEMS = {
    "symptoms": ["chest pain", "shortness of breath", "palpitations"],
    "risk_factors": ["hypertension", "diabetes", "smoking", "family history"]
}


def check_missing(state, extracted_missing=None):
    """
    Compare state with agent's missing output. Remove any symptoms/risk_factors that are present in state or extracted data from the missing list.
    """
    missing = {"symptoms": [], "risk_factors": []}

    # Get present items from state
    for category in ["symptoms", "risk_factors"]:
        present = set(state.__dict__[category].keys())
        # If agent provided missing, use that as base
        if extracted_missing and category in extracted_missing:
            needed = [item for item in extracted_missing[category] if item not in present]
        else:
            needed = [item for item in CRITICAL_CARDIAC_ITEMS[category] if item not in present]
        missing[category] = needed

    return missing
