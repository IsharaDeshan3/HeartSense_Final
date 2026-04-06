from fastapi import APIRouter, HTTPException, status
from database import get_database
from models import RecommendationCreate, RecommendationResponse
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.post("/", response_model=RecommendationResponse, status_code=status.HTTP_201_CREATED)
async def create_recommendation(
    recommendation_data: RecommendationCreate,
):
    """Create a new recommendation."""
    db = get_database()
    
    try:
        # Validate patient_id
        if not ObjectId.is_valid(recommendation_data.patient_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid patient ID format"
            )
        
        # Check if patient exists
        patient = await db.users.find_one({
            "_id": ObjectId(recommendation_data.patient_id),
            "role": "patient"
        })
        
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found"
            )
        
        # Create recommendation document
        recommendation_doc = {
            "doctor_id": "frontend",
            "doctor_name": "Frontend Doctor",
            "patient_id": recommendation_data.patient_id,
            "patient_name": patient.get("name"),
            "date": datetime.utcnow(),
            "recommendation": recommendation_data.recommendation
        }
        
        # Insert into database
        result = await db.recommendations.insert_one(recommendation_doc)
        
        # Get the created recommendation
        created_recommendation = await db.recommendations.find_one({"_id": result.inserted_id})
        
        return RecommendationResponse(
            id=str(created_recommendation["_id"]),
            doctor_id=created_recommendation["doctor_id"],
            doctor_name=created_recommendation["doctor_name"],
            patient_id=created_recommendation["patient_id"],
            patient_name=created_recommendation.get("patient_name"),
            date=created_recommendation["date"],
            recommendation=created_recommendation["recommendation"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating recommendation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating recommendation: {str(e)}"
        )


@router.get("/", response_model=List[RecommendationResponse])
async def get_recommendations(
    patient_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
):
    """Get recommendations."""
    db = get_database()
    
    try:
        # Build query based on user role
        query = {}
        
        if patient_id:
            if not ObjectId.is_valid(patient_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid patient ID format"
                )
            query["patient_id"] = patient_id
        
        # Find recommendations
        cursor = db.recommendations.find(query).sort("date", -1).skip(skip).limit(limit)
        recommendations = await cursor.to_list(length=limit)
        
        # Convert to response model
        recommendation_list = []
        for rec in recommendations:
            recommendation_list.append(RecommendationResponse(
                id=str(rec["_id"]),
                doctor_id=rec["doctor_id"],
                doctor_name=rec["doctor_name"],
                patient_id=rec["patient_id"],
                patient_name=rec.get("patient_name"),
                date=rec["date"],
                recommendation=rec["recommendation"]
            ))
        
        return recommendation_list
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching recommendations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching recommendations: {str(e)}"
        )


@router.get("/{recommendation_id}", response_model=RecommendationResponse)
async def get_recommendation(
    recommendation_id: str,
):
    """Get a specific recommendation by ID."""
    db = get_database()
    
    try:
        # Validate recommendation_id
        if not ObjectId.is_valid(recommendation_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid recommendation ID format"
            )
        
        # Find recommendation
        recommendation = await db.recommendations.find_one({"_id": ObjectId(recommendation_id)})
        
        if not recommendation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recommendation not found"
            )
        
        return RecommendationResponse(
            id=str(recommendation["_id"]),
            doctor_id=recommendation["doctor_id"],
            doctor_name=recommendation["doctor_name"],
            patient_id=recommendation["patient_id"],
            patient_name=recommendation.get("patient_name"),
            date=recommendation["date"],
            recommendation=recommendation["recommendation"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching recommendation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching recommendation: {str(e)}"
        )

