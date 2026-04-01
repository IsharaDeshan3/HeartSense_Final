from fastapi import APIRouter, HTTPException, status
from database import get_database
from models import PatientHistoryCreate, PatientHistoryResponse
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/patient-history", tags=["patient-history"])


def _patient_query(patient_id: str) -> dict:
    return {"$or": [{"patientId": patient_id}, {"userId": patient_id}]}


def _to_response(history: dict) -> PatientHistoryResponse:
    return PatientHistoryResponse(
        id=str(history["_id"]),
        patientId=history.get("patientId") or history.get("userId"),
        extractedJsonGroup1=history["extractedJsonGroup1"],
        extractedJsonGroup2=history["extractedJsonGroup2"],
        isMedical=history["isMedical"],
        labComparison=history["labComparison"],
        patientInfo=history["patientInfo"],
        recommendedTests=history["recommendedTests"],
        summary=history["summary"],
        createdAt=history["createdAt"],
    )


@router.post("/", response_model=PatientHistoryResponse, status_code=status.HTTP_201_CREATED)
async def create_patient_history(history_data: PatientHistoryCreate):
    """Create a new patient history record keyed by patientId."""
    db = get_database()

    try:
        history_doc = {
            "patientId": history_data.patientId,
            "extractedJsonGroup1": history_data.extractedJsonGroup1,
            "extractedJsonGroup2": history_data.extractedJsonGroup2,
            "isMedical": history_data.isMedical,
            "labComparison": history_data.labComparison,
            "patientInfo": history_data.patientInfo,
            "recommendedTests": history_data.recommendedTests,
            "summary": history_data.summary,
            "createdAt": datetime.utcnow(),
        }

        result = await db.patient_history.insert_one(history_doc)
        created_history = await db.patient_history.find_one({"_id": result.inserted_id})
        return _to_response(created_history)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating patient history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating patient history: {str(e)}"
        )


@router.get("/", response_model=List[PatientHistoryResponse])
async def get_patient_histories(
    patient_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
):
    """Get patient histories, optionally filtered by patientId."""
    db = get_database()

    try:
        query = _patient_query(patient_id) if patient_id else {}
        cursor = db.patient_history.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        histories = await cursor.to_list(length=limit)
        return [_to_response(hist) for hist in histories]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient histories: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching patient histories: {str(e)}"
        )


@router.get("/{history_id}", response_model=PatientHistoryResponse)
async def get_patient_history(history_id: str):
    """Get a specific patient history by ID."""
    db = get_database()

    try:
        if not ObjectId.is_valid(history_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid history ID format"
            )

        history = await db.patient_history.find_one({"_id": ObjectId(history_id)})

        if not history:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient history not found"
            )

        return _to_response(history)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching patient history: {str(e)}"
        )


@router.get("/patient/{patient_id}", response_model=List[PatientHistoryResponse])
async def get_patient_histories_by_patient_id(
    patient_id: str,
    skip: int = 0,
    limit: int = 100,
):
    """Get patient histories by patientId."""
    db = get_database()

    try:
        cursor = db.patient_history.find(_patient_query(patient_id)).sort("createdAt", -1).skip(skip).limit(limit)
        histories = await cursor.to_list(length=limit)
        return [_to_response(hist) for hist in histories]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient histories by patient ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching patient histories by patient ID: {str(e)}"
        )