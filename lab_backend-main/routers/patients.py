from fastapi import APIRouter, HTTPException, status
from database import get_database
from models import UserResponse
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("/", response_model=List[UserResponse])
async def get_all_patients(
    skip: int = 0,
    limit: int = 100,
):
    """Get all patients."""
    db = get_database()
    
    try:
        # Find all users with role "patient"
        cursor = db.users.find({"role": "patient"}).skip(skip).limit(limit)
        patients = await cursor.to_list(length=limit)
        
        # Convert to response model (excluding password)
        patient_list = []
        for patient in patients:
            patient_list.append(UserResponse(
                id=str(patient["_id"]),
                name=patient["name"],
                email=patient["email"],
                role=patient["role"],
                created_at=patient.get("created_at")
            ))
        
        return patient_list
    except Exception as e:
        logger.error(f"Error fetching patients: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching patients: {str(e)}"
        )


