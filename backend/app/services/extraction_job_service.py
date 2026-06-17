"""
MongoDB-backed job tracking for PDF extraction operations.
Each directory extraction or multi-file upload creates one job document;
the background task updates it per-file so the frontend can poll progress.
"""

import logging
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExtractionJobService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db.extraction_jobs

    async def create_job(self, source: str) -> str:
        """Create a pending job and return its job_id."""
        job_id = f"extract_{uuid.uuid4().hex[:12]}"
        await self.col.insert_one({
            "job_id": job_id,
            "source": source,
            "status": "pending",
            "phase": "pending",
            "phase_detail": "",
            "created_at": _utcnow(),
            "started_at": None,
            "finished_at": None,
            "total_files": 0,
            "processed_files": 0,
            "cached_files_count": 0,
            "failed_files_count": 0,
            "total_products": 0,
            "file_statuses": [],
            "summary": None,
            "error": None,
        })
        return job_id

    async def get_job(self, job_id: str) -> dict | None:
        return await self.col.find_one({"job_id": job_id}, {"_id": 0})

    async def set_running(self, job_id: str) -> None:
        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {"status": "running", "started_at": _utcnow()}},
        )

    async def set_phase(self, job_id: str, phase: str, detail: str = "") -> None:
        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {"phase": phase, "phase_detail": detail, "updated_at": _utcnow()}},
        )

    async def init_file_statuses(self, job_id: str, filenames: list) -> None:
        """Pre-populate file_statuses with a pending entry for each file."""
        entries = [
            {
                "filename": f,
                "status": "pending",
                "products": [],
                "product_count": 0,
                "from_cache": False,
                "error": None,
            }
            for f in filenames
        ]
        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {"file_statuses": entries, "total_files": len(entries)}},
        )

    async def update_file_status(
        self, job_id: str, filename: str, status: str, **fields
    ) -> None:
        """Update a file_status entry by filename."""
        update_fields = {
            "file_statuses.$.status": status,
            "updated_at": _utcnow(),
        }
        for k, v in fields.items():
            update_fields[f"file_statuses.$.{k}"] = v
        await self.col.update_one(
            {"job_id": job_id, "file_statuses.filename": filename},
            {"$set": update_fields},
        )

    async def file_done(
        self,
        job_id: str,
        filename: str,
        products: list,
        from_cache: bool,
    ) -> None:
        """Mark a file as done and update counters atomically."""
        final_status = "cached" if from_cache else "done"
        await self.update_file_status(
            job_id, filename, final_status,
            products=products,
            product_count=len(products),
            from_cache=from_cache,
        )
        inc = {"processed_files": 1, "total_products": len(products)}
        if from_cache:
            inc["cached_files_count"] = 1
        await self.col.update_one({"job_id": job_id}, {"$inc": inc})

    async def file_failed(self, job_id: str, filename: str, error: str) -> None:
        await self.update_file_status(job_id, filename, "failed", error=error)
        await self.col.update_one({"job_id": job_id}, {"$inc": {"failed_files_count": 1}})

    async def complete(self, job_id: str, summary: dict) -> None:
        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "done",
                "phase": "done",
                "phase_detail": "Extraction terminée",
                "finished_at": _utcnow(),
                "summary": summary,
            }},
        )

    async def set_failed(self, job_id: str, error: str) -> None:
        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "failed",
                "phase": "failed",
                "finished_at": _utcnow(),
                "error": error,
            }},
        )
