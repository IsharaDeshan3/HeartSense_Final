from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # MongoDB Settings
    MONGODB_URL: str = "mongodb+srv://ridmikranasinghe:Ridmi25106@cardiaclabtest.ith9fcq.mongodb.net/"
    MONGODB_DATABASE: str = "cardiac_db"
    
    # API Settings
    API_TITLE: str = "AI Diagnostic Backend API"
    API_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # JWT Settings
    SECRET_KEY: str = "your-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

