from fastapi import APIRouter, HTTPException, status
from database import get_database
from models import DiabeticCreate, DiabeticResponse
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/diabetic", tags=["diabetic"])


def _patient_query(patient_id: str) -> dict:
    return {"$or": [{"patientId": patient_id}, {"userId": patient_id}]}


@router.post("/", response_model=DiabeticResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_diabetic_data(diabetic_data: DiabeticCreate):
    """Create or update diabetic patient data keyed by patientId."""
    db = get_database()

    try:
        update_data = {k: v for k, v in diabetic_data.model_dump().items() if v is not None}
        patient_id = diabetic_data.patientId
        update_data["patientId"] = patient_id
        update_data.pop("userId", None)
        update_data["updatedAt"] = datetime.utcnow()

        existing_record = await db.diabetic_data.find_one(_patient_query(patient_id))

        if existing_record:
            for key, value in existing_record.items():
                if key in update_data and update_data[key] is not None:
                    continue
                if key not in update_data and key not in ["_id", "patientId", "userId", "createdAt", "updatedAt"]:
                    update_data[key] = value

            await db.diabetic_data.update_one(
                {"_id": existing_record["_id"]},
                {"$set": update_data, "$unset": {"userId": ""}},
            )
            record = await db.diabetic_data.find_one({"_id": existing_record["_id"]})
        else:
            update_data["createdAt"] = datetime.utcnow()
            result = await db.diabetic_data.insert_one(update_data)
            record = await db.diabetic_data.find_one({"_id": result.inserted_id})

        return DiabeticResponse(
            id=str(record["_id"]),
            patientId=record.get("patientId") or record.get("userId"),
            Age=record.get("Age"),
            BMI=record.get("BMI"),
            BUN=record.get("BUN"),
            Chol=record.get("Chol"),
            Cr=record.get("Cr"),
            Gender=record.get("Gender"),
            HDL=record.get("HDL"),
            LDL=record.get("LDL"),
            TG=record.get("TG"),
            createdAt=record["createdAt"],
            updatedAt=record["updatedAt"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating/updating diabetic data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating/updating diabetic data: {str(e)}"
        )


@router.get("/patient/{patient_id}", response_model=DiabeticResponse)
async def get_diabetic_data_by_patient_id(patient_id: str):
    """Get diabetic data by patientId."""
    db = get_database()

    try:
        diabetic_data = await db.diabetic_data.find_one(_patient_query(patient_id))

        if not diabetic_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Diabetic data not found for this patient"
            )

        return DiabeticResponse(
            id=str(diabetic_data["_id"]),
            patientId=diabetic_data.get("patientId") or diabetic_data.get("userId"),
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
            updatedAt=diabetic_data["updatedAt"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching diabetic data by patient ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching diabetic data by patient ID: {str(e)}"
        )


@router.delete("/patient/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diabetic_data_by_patient_id(patient_id: str):
    """Delete diabetic data by patientId."""
    db = get_database()

    try:
        result = await db.diabetic_data.delete_one(_patient_query(patient_id))

        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Diabetic data not found for this patient"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting diabetic data by patient ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting diabetic data by patient ID: {str(e)}"
        )