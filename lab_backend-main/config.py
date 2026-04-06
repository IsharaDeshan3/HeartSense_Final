from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # MongoDB Settings
    MONGODB_URL: str = Field(
        default="mongodb+srv://ridmikranasinghe:Ridmi25106@cardiaclabtest.ith9fcq.mongodb.net/",
        validation_alias=AliasChoices("MONGODB_URL", "MONGODB_URI"),
    )
    MONGODB_DATABASE: str = "cardiac_db"
    
    # API Settings
    API_TITLE: str = "AI Diagnostic Backend API"
    API_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # JWT Settings
    SECRET_KEY: str = Field(
        default="your-secret-key-change-this-in-production",
        validation_alias=AliasChoices("SECRET_KEY", "JWT_SECRET"),
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Gemini / Lab Agent Settings
    GEMINI_API_KEY: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("GEMINI_API_KEY", "NEXT_PUBLIC_GEMINI_API_KEY"),
    )
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_API_BASE: str = "https://generativelanguage.googleapis.com/v1beta"
    LAB_AGENT_GEMINI_TIMEOUT_SEC: int = 120
    LAB_AGENT_EVIDENCE_TOP_K: int = 8
    LAB_AGENT_EVIDENCE_CHUNK_SIZE: int = 1200
    LAB_AGENT_EVIDENCE_CHUNK_OVERLAP: int = 200
    LAB_AGENT_MAX_REPORTS_CONTEXT: int = 6

    # OCR (async pipeline)
    LAB_AGENT_OCR_WORKERS: int = 1
    LAB_AGENT_OCR_MAX_BYTES: int = 5 * 1024 * 1024
    LAB_AGENT_OCR_MIN_TEXT_CHARS: int = 30
    LAB_AGENT_OCR_STORE_TEXT_MAX_CHARS: int = 120000
    LAB_AGENT_OCR_GEMINI_TIMEOUT_SEC: int = 90

    # Temporal pattern analysis (Step-5)
    LAB_AGENT_TREND_MIN_POINTS: int = 4
    LAB_AGENT_TREND_MAX_TESTS: int = 40
    LAB_AGENT_TREND_REL_CHANGE_THRESHOLD: float = 0.15
    LAB_AGENT_TREND_JUMP_THRESHOLD: float = 0.30
    LAB_AGENT_TREND_ZSCORE_ALERT: float = 2.0
    
    class Config:
        env_file = Path(__file__).resolve().parent / ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


settings = Settings()

