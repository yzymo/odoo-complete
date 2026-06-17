"""
MongoDB-backed job tracking for scraping operations.
Each POST /scraper/scrape creates a job document; the background task
updates it as it progresses so the frontend can poll for status.
"""

import logging
import uuid
from dataclasses import asdict
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ScrapingJobService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db.scraping_jobs

    async def create_job(self, url: str) -> str:
        """Create a new pending job and return its job_id."""
        job_id = str(uuid.uuid4())
        await self.col.insert_one({
            "job_id": job_id,
            "url": url,
            "status": "pending",
            "from_cache": False,
            "created_at": _utcnow(),
            "finished_at": None,
            "error": None,
            "total_products": 0,
            "total_matched": 0,
            "warning": None,
            "products": [],
        })
        return job_id

    async def get_job(self, job_id: str) -> dict | None:
        doc = await self.col.find_one({"job_id": job_id}, {"_id": 0})
        return doc

    async def set_running(self, job_id: str) -> None:
        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {"status": "running", "started_at": _utcnow()}},
        )

    async def set_phase(self, job_id: str, phase: str, detail: str = "") -> None:
        """Update the current scraping phase shown in the UI."""
        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {"phase": phase, "phase_detail": detail, "updated_at": _utcnow()}},
        )

    async def init_product_statuses(self, job_id: str, urls: list) -> None:
        """Pre-populate product_statuses with a pending entry for every URL discovered."""
        entries = [
            {"source_url": u, "name": None, "status": "pending",
             "scraped": None, "odoo_matches": [], "error": None}
            for u in urls
        ]
        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {
                "product_statuses": entries,
                "total_products": len(entries),
                "processed": 0,
                "total_matched": 0,
            }},
        )

    async def update_product_status(
        self, job_id: str, source_url: str, status: str, **fields
    ) -> None:
        """Update a single entry in product_statuses by source_url."""
        update_fields = {
            "product_statuses.$.status": status,
            "updated_at": _utcnow(),
        }
        for k, v in fields.items():
            update_fields[f"product_statuses.$.{k}"] = v
        await self.col.update_one(
            {"job_id": job_id, "product_statuses.source_url": source_url},
            {"$set": update_fields},
        )

    async def product_done(
        self, job_id: str, source_url: str, scraped: dict, odoo_matches: list
    ) -> None:
        """Mark a product done, append its result to products[], and bump counters."""
        has_matches = bool(odoo_matches)
        await self.update_product_status(
            job_id, source_url, "done",
            scraped=scraped, odoo_matches=odoo_matches, name=scraped.get("name"),
        )
        product_entry = {"scraped": scraped, "odoo_matches": odoo_matches}
        inc = {"processed": 1}
        if has_matches:
            inc["total_matched"] = 1
        await self.col.update_one(
            {"job_id": job_id},
            {"$push": {"products": product_entry}, "$inc": inc},
        )

    async def save_result(self, job_id: str, result, from_cache: bool = False) -> None:
        """Persist the final ScrapeResult into the job document."""
        products_serialized = []
        for p in result.products:
            products_serialized.append({
                "scraped": asdict(p.scraped),
                "odoo_matches": [asdict(m) for m in p.odoo_matches],
            })

        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "done",
                "from_cache": from_cache,
                "finished_at": _utcnow(),
                "total_products": result.total_products,
                "total_matched": result.total_matched,
                "warning": result.error,
                "products": products_serialized,
            }},
        )

    async def set_failed(self, job_id: str, error: str) -> None:
        await self.col.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "failed",
                "finished_at": _utcnow(),
                "error": error,
            }},
        )
