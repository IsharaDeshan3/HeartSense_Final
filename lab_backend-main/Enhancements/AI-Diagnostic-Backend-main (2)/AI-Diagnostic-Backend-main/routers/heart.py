from fastapi import APIRouter, HTTPException, status, Depends
from database import get_database
from models import HeartCreate, HeartResponse
from routers.auth import get_current_user
from bson import ObjectId
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/heart", tags=["heart"])


@router.post("/", response_model=HeartResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_heart_data(
    heart_data: HeartCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create or update heart patient data. If record exists, it updates the fields."""
    db = get_database()
    
    try:
        # Check if user exists (optional - depends on your requirements)
        user = await db.users.find_one({"_id": ObjectId(heart_data.userId)}) if ObjectId.is_valid(heart_data.userId) else None
        
        if not user:
            # Check if userId is a valid ObjectId, if not allow as external ID
            if not ObjectId.is_valid(heart_data.userId):
                # Allow external user IDs that aren't ObjectIds
                pass
        
        # Prepare update data - only include non-null values from the request
        update_data = {k: v for k, v in heart_data.model_dump().items() if v is not None}
        update_data['updatedAt'] = datetime.utcnow()
        
        # Find existing record
        existing_record = await db.heart_data.find_one({"userId": heart_data.userId})
        
        if existing_record:
            # Merge existing data with new data, keeping existing values for null/empty fields
            for key, value in existing_record.items():
                if key in update_data and update_data[key] is not None:
                    # Use new value if provided and not null
                    continue
                elif key not in update_data:
                    # Use existing value if not provided in new data
                    if key not in ['_id', 'userId', 'createdAt', 'updatedAt']:  # Skip system fields
                        update_data[key] = value
            
            # Ensure we don't update the _id field
            if '_id' in update_data:
                del update_data['_id']
            
            # Update the existing record
            result = await db.heart_data.update_one(
                {"userId": heart_data.userId},
                {"$set": update_data}
            )
            
            # Fetch the updated document
            updated_record = await db.heart_data.find_one({"userId": heart_data.userId})
            
            return HeartResponse(
                id=str(updated_record["_id"]),
                userId=updated_record["userId"],
                age=updated_record.get("age"),
                ca=updated_record.get("ca"),
                chol=updated_record.get("chol"),
                cp=updated_record.get("cp"),
                exang=updated_record.get("exang"),
                fbs=updated_record.get("fbs"),
                oldpeak=updated_record.get("oldpeak"),
                restecg=updated_record.get("restecg"),
                sex=updated_record.get("sex"),
                slope=updated_record.get("slope"),
                thal=updated_record.get("thal"),
                thalach=updated_record.get("thalach"),
                trestbps=updated_record.get("trestbps"),
                createdAt=updated_record["createdAt"],
                updatedAt=updated_record["updatedAt"]
            )
        else:
            # Create new record
            insert_data = update_data.copy()
            insert_data['createdAt'] = datetime.utcnow()
            insert_data['updatedAt'] = datetime.utcnow()
            
            result = await db.heart_data.insert_one(insert_data)
            
            # Get the created heart data
            created_heart = await db.heart_data.find_one({"_id": result.inserted_id})
            
            return HeartResponse(
                id=str(created_heart["_id"]),
                userId=created_heart["userId"],
                age=created_heart.get("age"),
                ca=created_heart.get("ca"),
                chol=created_heart.get("chol"),
                cp=created_heart.get("cp"),
                exang=created_heart.get("exang"),
                fbs=created_heart.get("fbs"),
                oldpeak=created_heart.get("oldpeak"),
                restecg=created_heart.get("restecg"),
                sex=created_heart.get("sex"),
                slope=created_heart.get("slope"),
                thal=created_heart.get("thal"),
                thalach=created_heart.get("thalach"),
                trestbps=created_heart.get("trestbps"),
                createdAt=created_heart["createdAt"],
                updatedAt=created_heart["updatedAt"]
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating/updating heart data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating/updating heart data: {str(e)}"
        )


@router.get("/user/{user_id}", response_model=HeartResponse)
async def get_heart_data_by_user_id(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get heart data by user ID."""
    db = get_database()
    
    try:
        # Check if current user can access this data
        if current_user.get("role") == "patient":
            # Patients can only access their own data
            if user_id != str(current_user["_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to view this heart data"
                )
        elif current_user.get("role") != "doctor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access"
            )
        
        # Find heart data for the specified user
        heart_data = await db.heart_data.find_one({"userId": user_id})
        
        if not heart_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Heart data not found for this user"
            )
        
        return HeartResponse(
            id=str(heart_data["_id"]),
            userId=heart_data["userId"],
            age=heart_data.get("age"),
            ca=heart_data.get("ca"),
            chol=heart_data.get("chol"),
            cp=heart_data.get("cp"),
            exang=heart_data.get("exang"),
            fbs=heart_data.get("fbs"),
            oldpeak=heart_data.get("oldpeak"),
            restecg=heart_data.get("restecg"),
            sex=heart_data.get("sex"),
            slope=heart_data.get("slope"),
            thal=heart_data.get("thal"),
            thalach=heart_data.get("thalach"),
            trestbps=heart_data.get("trestbps"),
            createdAt=heart_data["createdAt"],
            updatedAt=heart_data["updatedAt"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching heart data by user ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching heart data by user ID: {str(e)}"
        )


@router.delete("/user/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_heart_data_by_user_id(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete heart data by user ID. Only doctors can delete records."""
    db = get_database()
    
    try:
        # Only doctors can delete records
        if current_user.get("role") != "doctor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only doctors can delete heart data"
            )
        
        # Delete the heart data
        result = await db.heart_data.delete_one({"userId": user_id})
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Heart data not found for this user"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting heart data by user ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting heart data by user ID: {str(e)}"
        )