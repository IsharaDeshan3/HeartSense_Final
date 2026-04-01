from fastapi import APIRouter, HTTPException, status, Depends
from database import get_database
from models import PatientHistoryCreate, PatientHistoryResponse
from routers.auth import get_current_user
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/patient-history", tags=["patient-history"])


@router.post("/", response_model=PatientHistoryResponse, status_code=status.HTTP_201_CREATED)
async def create_patient_history(
    history_data: PatientHistoryCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new patient history record."""
    db = get_database()
    
    try:
        # Validate user_id format if it's supposed to be an ObjectId
        if not ObjectId.is_valid(history_data.userId):
            # If not a valid ObjectId, treat as string (could be external user ID)
            pass
        
        # Check if user exists (optional - depends on your requirements)
        user = await db.users.find_one({"_id": ObjectId(history_data.userId)}) if ObjectId.is_valid(history_data.userId) else None
        
        # Create patient history document
        history_doc = {
            "userId": history_data.userId,
            "extractedJsonGroup1": history_data.extractedJsonGroup1,
            "extractedJsonGroup2": history_data.extractedJsonGroup2,
            "isMedical": history_data.isMedical,
            "labComparison": history_data.labComparison,
            "patientInfo": history_data.patientInfo,
            "recommendedTests": history_data.recommendedTests,
            "summary": history_data.summary,
            "createdAt": datetime.utcnow()
        }
        
        # Insert into database
        result = await db.patient_history.insert_one(history_doc)
        
        # Get the created patient history
        created_history = await db.patient_history.find_one({"_id": result.inserted_id})
        
        return PatientHistoryResponse(
            id=str(created_history["_id"]),
            userId=created_history["userId"],
            extractedJsonGroup1=created_history["extractedJsonGroup1"],
            extractedJsonGroup2=created_history["extractedJsonGroup2"],
            isMedical=created_history["isMedical"],
            labComparison=created_history["labComparison"],
            patientInfo=created_history["patientInfo"],
            recommendedTests=created_history["recommendedTests"],
            summary=created_history["summary"],
            createdAt=created_history["createdAt"]
        )
        
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
    user_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get patient histories. Users can see their own or all if they're a doctor."""
    db = get_database()
    
    try:
        # Build query based on user role
        query = {}
        
        if current_user.get("role") == "patient":
            # Patients can only see their own history
            query["userId"] = str(current_user["_id"])
        elif current_user.get("role") == "doctor":
            # Doctors can see all or filter by user_id
            if user_id:
                if not ObjectId.is_valid(user_id):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid user ID format"
                    )
                query["userId"] = user_id
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access"
            )
        
        # Find patient histories
        cursor = db.patient_history.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        histories = await cursor.to_list(length=limit)
        
        # Convert to response model
        history_list = []
        for hist in histories:
            history_list.append(PatientHistoryResponse(
                id=str(hist["_id"]),
                userId=hist["userId"],
                extractedJsonGroup1=hist["extractedJsonGroup1"],
                extractedJsonGroup2=hist["extractedJsonGroup2"],
                isMedical=hist["isMedical"],
                labComparison=hist["labComparison"],
                patientInfo=hist["patientInfo"],
                recommendedTests=hist["recommendedTests"],
                summary=hist["summary"],
                createdAt=hist["createdAt"]
            ))
        
        return history_list
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient histories: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching patient histories: {str(e)}"
        )


@router.get("/{history_id}", response_model=PatientHistoryResponse)
async def get_patient_history(
    history_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific patient history by ID."""
    db = get_database()
    
    try:
        # Validate history_id
        if not ObjectId.is_valid(history_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid history ID format"
            )
        
        # Find patient history
        history = await db.patient_history.find_one({"_id": ObjectId(history_id)})
        
        if not history:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient history not found"
            )
        
        # Check access permissions
        if current_user.get("role") == "patient":
            # Patients can only see their own history
            if history["userId"] != str(current_user["_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to view this patient history"
                )
        elif current_user.get("role") != "doctor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access"
            )
        
        return PatientHistoryResponse(
            id=str(history["_id"]),
            userId=history["userId"],
            extractedJsonGroup1=history["extractedJsonGroup1"],
            extractedJsonGroup2=history["extractedJsonGroup2"],
            isMedical=history["isMedical"],
            labComparison=history["labComparison"],
            patientInfo=history["patientInfo"],
            recommendedTests=history["recommendedTests"],
            summary=history["summary"],
            createdAt=history["createdAt"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching patient history: {str(e)}"
        )


@router.get("/user/{user_id}", response_model=List[PatientHistoryResponse])
async def get_patient_histories_by_user_id(
    user_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get patient histories by user ID."""
    db = get_database()
    
    try:
        # Validate user_id
        if not ObjectId.is_valid(user_id) and current_user.get("role") != "doctor":
            # Allow non-ObjectId user IDs but restrict access to doctors
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid user ID format"
            )
        
        # Build query based on permissions
        query = {"userId": user_id}
        
        # Check if current user can access this data
        if current_user.get("role") == "patient":
            # Patients can only access their own data
            if user_id != str(current_user["_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to view this patient history"
                )
        elif current_user.get("role") != "doctor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access"
            )
        
        # Find patient histories for the specified user
        cursor = db.patient_history.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        histories = await cursor.to_list(length=limit)
        
        # Convert to response model
        history_list = []
        for hist in histories:
            history_list.append(PatientHistoryResponse(
                id=str(hist["_id"]),
                userId=hist["userId"],
                extractedJsonGroup1=hist["extractedJsonGroup1"],
                extractedJsonGroup2=hist["extractedJsonGroup2"],
                isMedical=hist["isMedical"],
                labComparison=hist["labComparison"],
                patientInfo=hist["patientInfo"],
                recommendedTests=hist["recommendedTests"],
                summary=hist["summary"],
                createdAt=hist["createdAt"]
            ))
        
        return history_list
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient histories by user ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching patient histories by user ID: {str(e)}"
        )