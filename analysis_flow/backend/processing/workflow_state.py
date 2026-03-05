from __future__ import annotations

from enum import Enum
from typing import List


class WorkflowState(str, Enum):
    SESSION_CREATED = "SESSION_CREATED"
    EXTRACTION_DONE = "EXTRACTION_DONE"
    ECG_DONE = "ECG_DONE"
    LAB_DONE = "LAB_DONE"
    ANALYSIS_RUNNING = "ANALYSIS_RUNNING"
    ANALYSIS_DONE = "ANALYSIS_DONE"
    FAILED = "FAILED"


# Linear ordering — used for idempotent step-save comparisons
STATE_ORDER: List[WorkflowState] = [
    WorkflowState.SESSION_CREATED,
    WorkflowState.EXTRACTION_DONE,
    WorkflowState.ECG_DONE,
    WorkflowState.LAB_DONE,
    WorkflowState.ANALYSIS_RUNNING,
    WorkflowState.ANALYSIS_DONE,
]


def state_index(state: WorkflowState) -> int:
    """Return the ordinal position of a state in the pipeline (FAILED returns -1)."""
    try:
        return STATE_ORDER.index(state)
    except ValueError:
        return -1


ALLOWED_TRANSITIONS: dict[WorkflowState, set[WorkflowState]] = {
    # Normal forward progression
    WorkflowState.SESSION_CREATED: {
        WorkflowState.EXTRACTION_DONE,
        WorkflowState.FAILED,
    },
    WorkflowState.EXTRACTION_DONE: {
        WorkflowState.ECG_DONE,
        WorkflowState.LAB_DONE,       # skip ECG
        WorkflowState.ANALYSIS_RUNNING,  # skip ECG + Lab
        WorkflowState.FAILED,
    },
    WorkflowState.ECG_DONE: {
        WorkflowState.LAB_DONE,
        WorkflowState.ANALYSIS_RUNNING,  # skip Lab
        WorkflowState.FAILED,
    },
    WorkflowState.LAB_DONE: {
        WorkflowState.ANALYSIS_RUNNING,
        WorkflowState.FAILED,
    },
    # Analysis can complete, fail, or be rolled back to LAB_DONE
    WorkflowState.ANALYSIS_RUNNING: {
        WorkflowState.ANALYSIS_DONE,
        WorkflowState.FAILED,
        WorkflowState.LAB_DONE,  # cancellation / rollback
    },
    WorkflowState.ANALYSIS_DONE: {
        WorkflowState.FAILED,
        WorkflowState.ANALYSIS_RUNNING,  # re-run analysis
    },
    WorkflowState.FAILED: set(),
}


def can_transition(current: WorkflowState, next_state: WorkflowState) -> bool:
    return next_state in ALLOWED_TRANSITIONS.get(current, set())
