from fastapi import APIRouter, HTTPException, status
from database import get_database
from models import LabReportCreate, LabReportResponse
from bson import ObjectId
from datetime import datetime
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lab-reports", tags=["lab-reports"])


def _patient_query(patient_id: str) -> dict:
    return {"$or": [{"patientId": patient_id}, {"userId": patient_id}]}


def _to_response(report: dict) -> LabReportResponse:
    return LabReportResponse(
        id=str(report["_id"]),
        patientId=report.get("patientId") or report.get("userId", ""),
        reportDate=report.get("reportDate"),
        reportLabel=report.get("reportLabel"),
        extractedJsonGroup1=report.get("extractedJsonGroup1", {}),
        extractedJsonGroup2=report.get("extractedJsonGroup2", {}),
        labComparison=report.get("labComparison", []),
        summary=report.get("summary", ""),
        recommendedTests=report.get("recommendedTests", []),
        dailyHealthAdvice=report.get("dailyHealthAdvice", []),
        patientInfo=report.get("patientInfo", {}),
        createdAt=report["createdAt"],
    )


@router.post("/", response_model=LabReportResponse, status_code=status.HTTP_201_CREATED)
async def create_lab_report(report_data: LabReportCreate):
    """
    Insert a new lab report for a patient. Always creates a new document —
    never upserts — so the full chronological series is preserved.
    """
    db = get_database()
    try:
        # Auto-label: count existing reports for this patient
        existing_count = await db.lab_reports.count_documents(
            _patient_query(report_data.patientId)
        )
        label = report_data.reportLabel or f"Report {existing_count + 1}"

        doc = {
            "patientId": report_data.patientId,
            "reportDate": report_data.reportDate,
            "reportLabel": label,
            "extractedJsonGroup1": report_data.extractedJsonGroup1,
            "extractedJsonGroup2": report_data.extractedJsonGroup2,
            "labComparison": report_data.labComparison,
            "summary": report_data.summary,
            "recommendedTests": report_data.recommendedTests,
            "dailyHealthAdvice": report_data.dailyHealthAdvice,
            "patientInfo": report_data.patientInfo,
            "createdAt": datetime.utcnow(),
        }

        result = await db.lab_reports.insert_one(doc)
        created = await db.lab_reports.find_one({"_id": result.inserted_id})
        return _to_response(created)
    except Exception as e:
        logger.error(f"Error creating lab report: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating lab report: {str(e)}",
        )


@router.get("/patient/{patient_id}", response_model=List[LabReportResponse])
async def get_lab_reports_by_patient(patient_id: str, skip: int = 0, limit: int = 50):
    """
    Return all lab reports for a patient, sorted chronologically
    (reportDate ASC; falls back to createdAt when reportDate is absent).
    """
    db = get_database()
    try:
        cursor = (
            db.lab_reports.find(_patient_query(patient_id))
            .sort([("reportDate", 1), ("createdAt", 1)])
            .skip(skip)
            .limit(limit)
        )
        reports = await cursor.to_list(length=limit)
        return [_to_response(r) for r in reports]
    except Exception as e:
        logger.error(f"Error fetching lab reports: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching lab reports: {str(e)}",
        )


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lab_report(report_id: str):
    """Delete a single lab report by its MongoDB ObjectId."""
    db = get_database()
    try:
        if not ObjectId.is_valid(report_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid report ID format",
            )
        result = await db.lab_reports.delete_one({"_id": ObjectId(report_id)})
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab report not found",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting lab report: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting lab report: {str(e)}",
        )
