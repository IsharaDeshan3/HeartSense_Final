from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from config import settings
import logging

logger = logging.getLogger(__name__)


class MongoDB:
    """MongoDB database connection manager."""
    
    client: AsyncIOMotorClient = None
    database = None
    is_connected: bool = False


mongodb = MongoDB()


async def connect_to_mongo():
    """Create and test database connection."""
    try:
        logger.info(f"Attempting to connect to MongoDB at: {settings.MONGODB_URL}")
        logger.info(f"Target database: {settings.MONGODB_DATABASE}")
        
        # Create MongoDB client with connection options
        mongodb.client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=10000,  # 10 seconds timeout
            connectTimeoutMS=10000,
            socketTimeoutMS=10000,
            maxPoolSize=50,
            minPoolSize=10
        )
        
        # Test the connection by pinging the server
        await mongodb.client.admin.command('ping')
        logger.info("✓ MongoDB server ping successful")
        
        # Get database instance
        mongodb.database = mongodb.client[settings.MONGODB_DATABASE]
        
        # Verify database access by listing collections
        collections = await mongodb.database.list_collection_names()
        logger.info(f"✓ Connected to database: {settings.MONGODB_DATABASE}")
        logger.info(f"✓ Existing collections: {collections if collections else 'None'}")
        
        mongodb.is_connected = True
        logger.info("✓ MongoDB connection established successfully")
        
    except ServerSelectionTimeoutError as e:
        logger.error(f"✗ Server selection timeout: {e}")
        logger.error("Please check if MongoDB is running and the connection string is correct")
        mongodb.is_connected = False
        raise
    except ConnectionFailure as e:
        logger.error(f"✗ Connection failure: {e}")
        mongodb.is_connected = False
        raise
    except Exception as e:
        logger.error(f"✗ Unexpected error connecting to MongoDB: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        mongodb.is_connected = False
        raise


async def close_mongo_connection():
    """Close database connection."""
    if mongodb.client:
        try:
            mongodb.client.close()
            mongodb.is_connected = False
            logger.info("✓ MongoDB connection closed")
        except Exception as e:
            logger.error(f"Error closing MongoDB connection: {e}")


def get_database():
    """Get database instance."""
    if not mongodb.is_connected or mongodb.database is None:
        raise ConnectionError("Database is not connected. Please ensure MongoDB connection is established.")
    return mongodb.database


def get_client():
    """Get MongoDB client instance."""
    if not mongodb.is_connected or mongodb.client is None:
        raise ConnectionError("MongoDB client is not connected. Please ensure MongoDB connection is established.")
    return mongodb.client


async def test_connection():
    """Test the MongoDB connection."""
    try:
        if not mongodb.is_connected:
            return {"connected": False, "error": "Not connected"}
        
        # Ping the server
        await mongodb.client.admin.command('ping')
        
        # Get database stats
        db_stats = await mongodb.database.command("dbStats")
        
        return {
            "connected": True,
            "database": settings.MONGODB_DATABASE,
            "collections": db_stats.get("collections", 0),
            "data_size": db_stats.get("dataSize", 0),
            "storage_size": db_stats.get("storageSize", 0)
        }
    except Exception as e:
        return {
            "connected": False,
            "error": str(e)
        }

