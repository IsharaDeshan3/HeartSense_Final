from __future__ import annotations

from enum import Enum


class WorkflowState(str, Enum):
    SESSION_CREATED = "SESSION_CREATED"
    EXTRACTION_DONE = "EXTRACTION_DONE"
    ECG_DONE = "ECG_DONE"
    LAB_DONE = "LAB_DONE"
    ANALYSIS_RUNNING = "ANALYSIS_RUNNING"
    ANALYSIS_DONE = "ANALYSIS_DONE"
    FAILED = "FAILED"


ALLOWED_TRANSITIONS: dict[WorkflowState, set[WorkflowState]] = {
    WorkflowState.SESSION_CREATED: {WorkflowState.EXTRACTION_DONE, WorkflowState.FAILED},
    WorkflowState.EXTRACTION_DONE: {WorkflowState.ECG_DONE, WorkflowState.FAILED},
    WorkflowState.ECG_DONE: {WorkflowState.LAB_DONE, WorkflowState.FAILED},
    WorkflowState.LAB_DONE: {WorkflowState.ANALYSIS_RUNNING, WorkflowState.FAILED},
    WorkflowState.ANALYSIS_RUNNING: {WorkflowState.ANALYSIS_DONE, WorkflowState.FAILED},
    WorkflowState.ANALYSIS_DONE: {WorkflowState.FAILED},
    WorkflowState.FAILED: set(),
}


def can_transition(current: WorkflowState, next_state: WorkflowState) -> bool:
    return next_state in ALLOWED_TRANSITIONS.get(current, set())
