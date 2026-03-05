from __future__ import annotations

from typing import List

from .models import KRAResult, ORAResult, SafetyReport


class SafetyValidator:
    def __init__(self, *, confidence_threshold: float = 0.6):
        self.confidence_threshold = confidence_threshold

    def validate(self, *, kra: KRAResult, ora_newbie: ORAResult, ora_seasoned: ORAResult) -> SafetyReport:
        reasons: List[str] = []

        top_conf = 0.0
        if kra.diagnoses:
            top_conf = max(d.confidence for d in kra.diagnoses)

        if top_conf < self.confidence_threshold:
            reasons.append(f"Low model confidence (<{self.confidence_threshold:.2f})")

        if kra.red_flags:
            reasons.append("Red flags present")

        if not (ora_newbie.disclaimer or ora_seasoned.disclaimer):
            reasons.append("Missing disclaimer")

        is_critical = top_conf < self.confidence_threshold or bool(kra.red_flags)
        banner = ""
        if is_critical:
            banner = "LOW CONFIDENCE / REVIEW REQUIRED"
        if any((d.severity or "").upper() == "CRITICAL" for d in kra.diagnoses):
            banner = "CRITICAL / URGENT REVIEW"
            is_critical = True

        return SafetyReport(passed=True, is_critical=is_critical, banner=banner, reasons=reasons)
