"""

Authentication Routes - Supabase Auth integration (no SDK)

Handles user authentication and profile management using direct
GoTrue REST API calls via requests.

"""



import os

import logging

import requests as http_requests

from typing import Optional

from fastapi import APIRouter, HTTPException, Header, status

from pydantic import BaseModel, EmailStr



from database import get_supabase_client



logger = logging.getLogger(__name__)

router = APIRouter()


# --------------------------------------------------------------------------- #
#  GoTrue auth helper                                                          #
# --------------------------------------------------------------------------- #

def _gotrue_url():
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    if not base:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase not configured",
        )
    return base + "/auth/v1"


def _anon_key():
    key = os.getenv("SUPABASE_ANON_KEY")
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase not configured",
        )
    return key


def _auth_headers(bearer_token=None):
    key = _anon_key()
    headers = {
        "apikey": key,
        "Content-Type": "application/json",
    }
    if bearer_token:
        headers["Authorization"] = "Bearer " + bearer_token
    else:
        headers["Authorization"] = "Bearer " + key
    return headers


class LoginRequest(BaseModel):

    """Login request body"""

    email: EmailStr

    password: str



class SignupRequest(BaseModel):

    """Signup request body"""

    email: EmailStr

    password: str

    full_name: str



class UserProfile(BaseModel):

    """User profile response"""

    id: str

    email: str

    full_name: Optional[str]

    role: str



class AuthResponse(BaseModel):

    """Authentication response"""

    access_token: str

    refresh_token: str

    user: UserProfile



async def get_current_user(authorization: str = Header(...)) -> dict:

    """

    Dependency to get current user from JWT token.


    Args:

        authorization: Bearer token from Authorization header


    Returns:

        User data from token

    """

    if not authorization.startswith("Bearer "):

        raise HTTPException(

            status_code=status.HTTP_401_UNAUTHORIZED,

            detail="Invalid authorization header"

        )



    token = authorization[7:]



    try:
        resp = http_requests.get(
            _gotrue_url() + "/user",
            headers=_auth_headers(token),
            timeout=15,
        )

        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        user_data = resp.json()
        user_id = user_data.get("id")
        user_email = user_data.get("email", "")

        supabase = get_supabase_client()
        profile = supabase.get_user_profile(user_id)

        return {
            "id": user_id,
            "email": user_email,
            "full_name": profile.get("full_name") if profile else None,
            "role": profile.get("role", "newbie") if profile else "newbie",
        }

    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Auth error: {e}")

        raise HTTPException(

            status_code=status.HTTP_401_UNAUTHORIZED,

            detail="Authentication failed"

        )



@router.post("/signup", response_model=AuthResponse)

async def signup(request: SignupRequest):

    """

    Register a new user account.


    Creates user in Supabase Auth and triggers profile creation.

    """

    try:
        resp = http_requests.post(
            _gotrue_url() + "/signup",
            headers=_auth_headers(),
            json={
                "email": request.email,
                "password": request.password,
                "data": {"full_name": request.full_name},
            },
            timeout=15,
        )

        if resp.status_code not in (200, 201):
            detail = resp.json().get("msg", resp.text)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

        body = resp.json()
        session = body.get("session") or {}
        user = body.get("user") or {}

        if not session.get("access_token"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signup failed — no session returned",
            )

        return AuthResponse(
            access_token=session["access_token"],
            refresh_token=session.get("refresh_token", ""),
            user=UserProfile(
                id=user.get("id", ""),
                email=user.get("email", ""),
                full_name=request.full_name,
                role="newbie",
            ),
        )

    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Signup error: {e}")

        raise HTTPException(

            status_code=status.HTTP_400_BAD_REQUEST,

            detail=str(e)

        )



@router.post("/login", response_model=AuthResponse)

async def login(request: LoginRequest):

    """

    Authenticate user and return tokens.

    """

    try:
        resp = http_requests.post(
            _gotrue_url() + "/token?grant_type=password",
            headers=_auth_headers(),
            json={
                "email": request.email,
                "password": request.password,
            },
            timeout=15,
        )

        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        body = resp.json()
        user = body.get("user", {})

        supabase = get_supabase_client()
        profile = supabase.get_user_profile(user.get("id", ""))

        return AuthResponse(
            access_token=body["access_token"],
            refresh_token=body.get("refresh_token", ""),
            user=UserProfile(
                id=user.get("id", ""),
                email=user.get("email", ""),
                full_name=profile.get("full_name") if profile else None,
                role=profile.get("role", "newbie") if profile else "newbie",
            ),
        )

    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Login error: {e}")

        raise HTTPException(

            status_code=status.HTTP_401_UNAUTHORIZED,

            detail="Authentication failed"

        )



@router.post("/logout")

async def logout(authorization: str = Header(...)):

    """

    Sign out user and invalidate token.

    """

    try:
        token = authorization.replace("Bearer ", "")
        http_requests.post(
            _gotrue_url() + "/logout",
            headers=_auth_headers(token),
            timeout=10,
        )
        return {"message": "Logged out successfully"}

    except Exception as e:

        logger.error(f"Logout error: {e}")

        return {"message": "Logged out"}



@router.get("/me", response_model=UserProfile)

async def get_profile(authorization: str = Header(...)):

    """

    Get current user profile.

    """

    user = await get_current_user(authorization)

    return UserProfile(**user)



@router.post("/refresh")

async def refresh_token(refresh_token: str):

    """

    Refresh access token using refresh token.

    """

    try:
        resp = http_requests.post(
            _gotrue_url() + "/token?grant_type=refresh_token",
            headers=_auth_headers(),
            json={"refresh_token": refresh_token},
            timeout=15,
        )

        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token refresh failed",
            )

        body = resp.json()
        return {
            "access_token": body["access_token"],
            "refresh_token": body.get("refresh_token", ""),
        }

    except Exception as e:

        logger.error(f"Token refresh error: {e}")

        raise HTTPException(

            status_code=status.HTTP_401_UNAUTHORIZED,

            detail="Token refresh failed"

        )
