from fastapi import APIRouter, HTTPException, status
from database import get_database
from models import HeartCreate, HeartResponse
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/heart", tags=["heart"])


def _patient_query(patient_id: str) -> dict:
    return {"$or": [{"patientId": patient_id}, {"userId": patient_id}]}


@router.post("/", response_model=HeartResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_heart_data(heart_data: HeartCreate):
    """Create or update heart patient data keyed by patientId."""
    db = get_database()

    try:
        update_data = {k: v for k, v in heart_data.model_dump().items() if v is not None}
        patient_id = heart_data.patientId
        update_data["patientId"] = patient_id
        update_data.pop("userId", None)
        update_data["updatedAt"] = datetime.utcnow()

        existing_record = await db.heart_data.find_one(_patient_query(patient_id))

        if existing_record:
            for key, value in existing_record.items():
                if key in update_data and update_data[key] is not None:
                    continue
                if key not in update_data and key not in ["_id", "patientId", "userId", "createdAt", "updatedAt"]:
                    update_data[key] = value

            await db.heart_data.update_one(
                {"_id": existing_record["_id"]},
                {"$set": update_data, "$unset": {"userId": ""}},
            )
            record = await db.heart_data.find_one({"_id": existing_record["_id"]})
        else:
            update_data["createdAt"] = datetime.utcnow()
            result = await db.heart_data.insert_one(update_data)
            record = await db.heart_data.find_one({"_id": result.inserted_id})

        return HeartResponse(
            id=str(record["_id"]),
            patientId=record.get("patientId") or record.get("userId"),
            age=record.get("age"),
            ca=record.get("ca"),
            chol=record.get("chol"),
            cp=record.get("cp"),
            exang=record.get("exang"),
            fbs=record.get("fbs"),
            oldpeak=record.get("oldpeak"),
            restecg=record.get("restecg"),
            sex=record.get("sex"),
            slope=record.get("slope"),
            thal=record.get("thal"),
            thalach=record.get("thalach"),
            trestbps=record.get("trestbps"),
            createdAt=record["createdAt"],
            updatedAt=record["updatedAt"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating/updating heart data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating/updating heart data: {str(e)}"
        )


@router.get("/patient/{patient_id}", response_model=HeartResponse)
async def get_heart_data_by_patient_id(patient_id: str):
    """Get heart data by patientId."""
    db = get_database()

    try:
        heart_data = await db.heart_data.find_one(_patient_query(patient_id))

        if not heart_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Heart data not found for this patient"
            )

        return HeartResponse(
            id=str(heart_data["_id"]),
            patientId=heart_data.get("patientId") or heart_data.get("userId"),
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
            updatedAt=heart_data["updatedAt"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching heart data by patient ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching heart data by patient ID: {str(e)}"
        )


@router.delete("/patient/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_heart_data_by_patient_id(patient_id: str):
    """Delete heart data by patientId."""
    db = get_database()

    try:
        result = await db.heart_data.delete_one(_patient_query(patient_id))

        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Heart data not found for this patient"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting heart data by patient ID: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting heart data by patient ID: {str(e)}"
        )