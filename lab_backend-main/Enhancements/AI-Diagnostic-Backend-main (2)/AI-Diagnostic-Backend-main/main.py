from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import connect_to_mongo, close_mongo_connection, get_database, mongodb
from config import settings
from routers import auth, patients, recommendations, patient_history, diabetic, heart
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan events."""
    # Startup
    logger.info("Starting up...")
    await connect_to_mongo()
    yield
    # Shutdown
    logger.info("Shutting down...")
    await close_mongo_connection()


# Create FastAPI app
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(recommendations.router)
app.include_router(patient_history.router)
app.include_router(diabetic.router)
app.include_router(heart.router)

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "AI Diagnostic Backend API",
        "version": settings.API_VERSION,
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        from database import test_connection
        connection_status = await test_connection()
        
        if not connection_status.get("connected"):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database not connected: {connection_status.get('error', 'Unknown error')}"
            )
        
        return {
            "status": "healthy",
            "database": connection_status.get("database"),
            "connection": "active",
            "collections": connection_status.get("collections", 0)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Service unhealthy: {str(e)}"
        )


@app.get("/db/test")
async def test_database():
    """Test database connection and return detailed information."""
    try:
        from database import test_connection, get_database
        connection_status = await test_connection()
        
        if connection_status.get("connected"):
            db = get_database()
            # List all collections
            collections = await db.list_collection_names()
            
            return {
                "status": "success",
                "connection": connection_status,
                "collections": collections,
                "database_name": settings.MONGODB_DATABASE
            }
        else:
            return {
                "status": "failed",
                "error": connection_status.get("error", "Unknown error")
            }
    except Exception as e:
        logger.error(f"Database test failed: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )

