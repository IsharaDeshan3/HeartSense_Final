from fastapi import APIRouter, HTTPException, status, Depends
from database import get_database
from models import UserResponse
from routers.auth import get_current_user
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("/", response_model=List[UserResponse])
async def get_all_patients(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get all patients. Requires authentication."""
    # Check if user is a doctor (only doctors can view all patients)
    if current_user.get("role") != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only doctors can view all patients"
        )
    
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


@router.get("/me", response_model=UserResponse)
async def get_my_patient_info(current_user: dict = Depends(get_current_user)):
    """Get current patient's own information."""
    # Check if user is a patient
    if current_user.get("role") != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only for patients"
        )
    
    return UserResponse(
        id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"],
        created_at=current_user["created_at"]
    )

