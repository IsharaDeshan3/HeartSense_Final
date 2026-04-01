from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from database import get_database
from models import DoctorSignup, PatientSignup, UserLogin, Token, UserResponse
from auth_utils import verify_password, get_password_hash, create_access_token, decode_access_token
from bson import ObjectId
from datetime import datetime, timedelta
from config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["authentication"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# Doctor Signup
@router.post("/signup/doctor", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup_doctor(doctor_data: DoctorSignup):
    """Register a new doctor."""
    db = get_database()
    
    # Check if email already exists
    existing_user = await db.users.find_one({"email": doctor_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check if doctor_id already exists
    existing_doctor = await db.users.find_one({"doctor_id": doctor_data.doctor_id, "role": "doctor"})
    if existing_doctor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Doctor ID already exists"
        )
    
    # Hash password
    hashed_password = get_password_hash(doctor_data.password)
    
    # Create doctor document
    doctor_doc = {
        "name": doctor_data.name,
        "email": doctor_data.email,
        "doctor_id": doctor_data.doctor_id,
        "role": "doctor",
        "hashed_password": hashed_password,
        "created_at": datetime.utcnow()
    }
    
    # Insert into database
    result = await db.users.insert_one(doctor_doc)
    
    # Return user response (without password)
    created_doctor = await db.users.find_one({"_id": result.inserted_id})
    created_doctor["_id"] = str(created_doctor["_id"])
    
    return UserResponse(
        id=str(created_doctor["_id"]),
        name=created_doctor["name"],
        email=created_doctor["email"],
        role=created_doctor["role"],
        created_at=created_doctor["created_at"]
    )


# Patient Signup
@router.post("/signup/patient", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup_patient(patient_data: PatientSignup):
    """Register a new patient."""
    db = get_database()
    
    # Check if email already exists
    existing_user = await db.users.find_one({"email": patient_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash password
    hashed_password = get_password_hash(patient_data.password)
    
    # Create patient document
    patient_doc = {
        "name": patient_data.name,
        "email": patient_data.email,
        "age": patient_data.age,
        "role": "patient",
        "hashed_password": hashed_password,
        "created_at": datetime.utcnow()
    }
    
    # Insert into database
    result = await db.users.insert_one(patient_doc)
    
    # Return user response (without password)
    created_patient = await db.users.find_one({"_id": result.inserted_id})
    created_patient["_id"] = str(created_patient["_id"])
    
    return UserResponse(
        id=str(created_patient["_id"]),
        name=created_patient["name"],
        email=created_patient["email"],
        role=created_patient["role"],
        created_at=created_patient["created_at"]
    )


# Login (for both doctor and patient)
@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login endpoint for both doctors and patients."""
    db = get_database()
    
    # Find user by email
    user = await db.users.find_one({"email": form_data.username})
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(user["_id"]),
            "email": user["email"],
            "role": user["role"]
        },
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=str(user["_id"]),
        role=user["role"],
        name=user["name"]
    )


# Alternative login endpoint using JSON body
@router.post("/login/json", response_model=Token)
async def login_json(login_data: UserLogin):
    """Login endpoint using JSON body (alternative to form data)."""
    db = get_database()
    
    # Find user by email
    user = await db.users.find_one({"email": login_data.email})
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Verify password
    if not verify_password(login_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(user["_id"]),
            "email": user["email"],
            "role": user["role"]
        },
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=str(user["_id"]),
        role=user["role"],
        name=user["name"]
    )


# Get current user
async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Get current authenticated user from token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    db = get_database()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    if user is None:
        raise credentials_exception
    
    user["_id"] = str(user["_id"])
    return user


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user information."""
    return UserResponse(
        id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"],
        created_at=current_user["created_at"]
    )

