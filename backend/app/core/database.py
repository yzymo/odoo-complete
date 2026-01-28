"""
MongoDB connection management using Motor (async MongoDB driver).
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ConnectionFailure
from app.config import settings
import logging

logger = logging.getLogger(__name__)


class Database:
    """Singleton database connection manager."""

    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase = None

    async def connect(self):
        """Connect to MongoDB Atlas."""
        try:
            logger.info("Connecting to MongoDB Atlas...")
            self.client = AsyncIOMotorClient(
                settings.mongodb_url,
                serverSelectionTimeoutMS=5000,
                maxPoolSize=10,
                minPoolSize=1,
            )

            # Verify connection
            await self.client.admin.command('ping')

            self.db = self.client[settings.database_name]
            logger.info(f"Connected to MongoDB database: {settings.database_name}")

            # Create indexes
            await self._create_indexes()

        except ConnectionFailure as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error connecting to MongoDB: {e}")
            raise

    async def close(self):
        """Close MongoDB connection."""
        if self.client:
            logger.info("Closing MongoDB connection...")
            self.client.close()
            logger.info("MongoDB connection closed")

    async def _create_indexes(self):
        """Create MongoDB indexes for optimized queries."""
        logger.info("Creating MongoDB indexes...")

        try:
            # Products collection indexes
            await self.db.products.create_index("default_code", unique=True, sparse=True)
            await self.db.products.create_index("barcode")
            await self.db.products.create_index("Code_EAN")
            await self.db.products.create_index([("refConstructeur", 1), ("constructeur", 1)])
            await self.db.products.create_index("extraction_metadata.status")
            await self.db.products.create_index("extraction_metadata.extraction_job_id")
            await self.db.products.create_index("duplicate_group_id")
            await self.db.products.create_index([("name", "text"), ("description_courte", "text")])
            await self.db.products.create_index("created_at")

            # Extraction jobs collection indexes
            await self.db.extraction_jobs.create_index("job_id", unique=True)
            await self.db.extraction_jobs.create_index("status")
            await self.db.extraction_jobs.create_index("created_at")

            # File inventory collection indexes
            await self.db.file_inventory.create_index([("extraction_job_id", 1), ("file_path", 1)], unique=True)
            await self.db.file_inventory.create_index("processing_status")
            await self.db.file_inventory.create_index("file_type")

            # OpenAI cache collection indexes
            await self.db.openai_cache.create_index("cache_key", unique=True)
            await self.db.openai_cache.create_index("prompt_hash")
            await self.db.openai_cache.create_index("expires_at", expireAfterSeconds=0)  # TTL index

            logger.info("MongoDB indexes created successfully")

        except Exception as e:
            logger.error(f"Error creating indexes: {e}")
            # Don't raise - indexes may already exist


# Global database instance
database = Database()


async def get_database() -> AsyncIOMotorDatabase:
    """Dependency to get database instance."""
    return database.db
