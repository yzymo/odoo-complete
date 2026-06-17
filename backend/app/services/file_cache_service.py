"""
File content hash cache for PDF/file extraction.
Same bytes → same result, so there is no TTL; the cache is permanent.
"""

import hashlib
import logging
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)


class FileCacheService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db.file_hash_cache

    def compute_hash(self, content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    async def get(self, file_hash: str) -> dict | None:
        """Return cached extraction result or None."""
        doc = await self.col.find_one({"file_hash": file_hash}, {"_id": 0})
        if doc:
            logger.info(f"File cache hit for hash {file_hash[:12]}…")
        return doc

    async def put(self, file_hash: str, filename: str, product_ids: list[str]) -> None:
        """Store cache entry. Silently ignores duplicate inserts from concurrent requests."""
        try:
            await self.col.insert_one({
                "file_hash": file_hash,
                "original_filename": filename,
                "created_at": datetime.now(timezone.utc),
                "product_ids": product_ids,
                "product_count": len(product_ids),
            })
        except DuplicateKeyError:
            pass
