from fastapi import APIRouter, HTTPException, status, Depends
from database import get_database
from models import DiabeticCreate, DiabeticResponse
from routers.auth import get_current_user
from bson import ObjectId
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/diabetic", tags=["diabetic"])


@router.post("/", response_model=DiabeticResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_diabetic_data(
    diabetic_data: DiabeticCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create or update diabetic patient data. If record exists, it updates the fields."""
    db = get_database()
    print(diabetic_data)
    try:
        # Check if user exists (optional - depends on your requirements)
        user = await db.users.find_one({"_id": ObjectId(diabetic_data.userId)}) if ObjectId.is_valid(diabetic_data.userId) else None
        
        if not user:
            # Check if userId is a valid ObjectId, if not allow as external ID
            if not ObjectId.is_valid(diabetic_data.userId):
                # Allow external user IDs that aren't ObjectIds
                pass
        
        # Prepare update data - only include non-null values from the request
        update_data = {k: v for k, v in diabetic_data.model_dump().items() if v is not None}
        update_data['updatedAt'] = datetime.utcnow()
        
        # Find existing record
        existing_record = await db.diabetic_data.find_one({"userId": diabetic_data.userId})
        
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
            result = await db.diabetic_data.update_one(
                {"userId": diabetic_data.userId},
                {"$set": update_data}
            )
            
            # Fetch the updated document
            updated_record = await db.diabetic_data.find_one({"userId": diabetic_data.userId})
            
            return DiabeticResponse(
                id=str(updated_record["_id"]),
                userId=updated_record["userId"],
                Age=updated_record.get("Age"),
                BMI=updated_record.get("BMI"),
                BUN=updated_record.get("BUN"),
                Chol=updated_record.get("Chol"),
                Cr=updated_record.get("Cr"),
                Gender=updated_record.get("Gender"),
                HDL=updated_record.get("HDL"),
                LDL=updated_record.get("LDL"),
                TG=updated_record.get("TG"),
                createdAt=updated_record["createdAt"],
                updatedAt=updated_record["updatedAt"]
            )
        else:
            # Create new record
            insert_data = update_data.copy()
            insert_data['createdAt'] = datetime.utcnow()
            insert_data['updatedAt'] = datetime.utcnow()
            
            result = await db.diabetic_data.insert_one(insert_data)
            
            # Get the created diabetic data
            created_diabetic = await db.diabetic_data.find_one({"_id": result.inserted_id})
            
            return DiabeticResponse(
                id=str(created_diabetic["_id"]),
                userId=created_diabetic["userId"],
                Age=created_diabetic.get("Age"),
                BMI=created_diabetic.get("BMI"),
                BUN=created_diabetic.get("BUN"),
                Chol=created_diabetic.get("Chol"),
                Cr=created_diabetic.get("Cr"),
                Gender=created_diabetic.get("Gender"),
                HDL=created_diabetic.get("HDL"),
                LDL=created_diabetic.get("LDL"),
                TG=created_diabetic.get("TG"),
                createdAt=created_diabetic["createdAt"],
                updatedAt=created_diabetic["updatedAt"]
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating/updating diabetic data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating/updating diabetic data: {str(e)}"
        )


@router.get("/user/{user_id}", response_model=DiabeticResponse)
async def get_diabetic_data_by_user_id(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get diabetic data by user ID."""
    db = get_database()
    
    try:
        # Check if current user can access this data
        if current_user.get("role") == "patient":
            # Patients can only access their own data
            if user_id != str(current_user["_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to view this diabetic data"
                )
        elif current_user.get("role") != "doctor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access"
            )
        
        # Find diabetic data for the specified user
        diabetic_data = await db.diabetic_data.find_one({"userId": user_id})
        
        if not diabetic_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Diabetic data not found for this user"
            )
        
        return DiabeticResponse(
            id=str(diabetic_data["_id"]),
            userId=diabetic_data["userId"],
            Age=diabetic_data.get("Age"),
            BMI=diabetic_data.get("BMI"),
            BUN=diabetic_data.get("BUN"),
            Chol=diabetic_data.get("Chol"),
            Cr=diabetic_data.get("Cr"),
            Gender=diabetic_data.get("Gender"),
            HDL=diabetic_data.get("HDL"),
            LDL=diabetic_data.get("LDL"),
            TG=diabetic_data.get("TG"),
            createdAt=diabetic_data["createdAt"],
            updatedAt=diabetic_data["updatedAt"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching diabetic data by user ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching diabetic data by user ID: {str(e)}"
        )


@router.delete("/user/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diabetic_data_by_user_id(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete diabetic data by user ID. Only doctors can delete records."""
    db = get_database()
    
    try:
        # Only doctors can delete records
        if current_user.get("role") != "doctor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only doctors can delete diabetic data"
            )
        
        # Delete the diabetic data
        result = await db.diabetic_data.delete_one({"userId": user_id})
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Diabetic data not found for this user"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting diabetic data by user ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting diabetic data by user ID: {str(e)}"
        )