"""
API routes for the web scraper feature.
Accepts a supplier URL, scrapes product data, and returns Odoo matches.

Flow:
  POST /scrape  → checks URL cache → if hit returns results immediately (from_cache=True)
               → if miss creates a MongoDB job and launches a background task
               → returns {job_id, status: "pending"} immediately
  GET  /jobs/{job_id} → poll for status / results
"""

import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app.core.database import get_database
from app.services.scraper_service import ScraperService
from app.services.openai_service import OpenAIService
from app.services.odoo_service import get_odoo_service
from app.services.scraping_job_service import ScrapingJobService
from app.services.storage_service import StorageService
from app.services.url_cache_service import UrlCacheService

logger = logging.getLogger(__name__)

router = APIRouter()

# Cap concurrent Playwright browser instances to avoid OOM under load.
_scrape_semaphore = asyncio.Semaphore(3)


class ScrapeRequest(BaseModel):
    url: str


def _serialize_result(result) -> dict:
    """Convert a ScrapeResult dataclass tree into a JSON-safe dict."""
    return {
        "url": result.url,
        "total_products": result.total_products,
        "total_matched": result.total_matched,
        "warning": result.error,
        "products": [
            {
                "scraped": {
                    "name": p.scraped.name,
                    "default_code": p.scraped.default_code,
                    "barcode": p.scraped.barcode,
                    "code_ean": p.scraped.code_ean,
                    "constructeur": p.scraped.constructeur,
                    "ref_constructeur": p.scraped.ref_constructeur,
                    "description_courte": p.scraped.description_courte,
                    "description_ecommerce": p.scraped.description_ecommerce,
                    "features_description": p.scraped.features_description,
                    "country_of_origin": p.scraped.country_of_origin,
                    "categ_id": p.scraped.categ_id,
                    "length": p.scraped.length,
                    "width": p.scraped.width,
                    "height": p.scraped.height,
                    "weight": p.scraped.weight,
                    "hs_code": p.scraped.hs_code,
                    "list_price": p.scraped.list_price,
                    "source_url": p.scraped.source_url,
                    "image_urls": p.scraped.image_urls,
                },
                "odoo_matches": [
                    {
                        "odoo_id": m.odoo_id,
                        "name": m.name,
                        "default_code": m.default_code,
                        "barcode": m.barcode,
                        "code_ean": m.code_ean,
                        "constructeur": m.constructeur,
                        "ref_constructeur": m.ref_constructeur,
                        "list_price": m.list_price,
                        "image_128": m.image_128,
                        "score": round(m.score, 2),
                        "match_type": m.match_type,
                        "match_label": m.match_label,
                    }
                    for m in p.odoo_matches
                ],
            }
            for p in result.products
        ],
    }


async def _run_scrape_job(job_id: str, url: str, db) -> None:
    """Background task: scrape the URL, persist results to MongoDB, update the job document."""
    job_svc = ScrapingJobService(db)
    cache_svc = UrlCacheService(db)
    try:
        await job_svc.set_running(job_id)
        async with _scrape_semaphore:
            odoo = get_odoo_service()
            scraper = ScraperService(OpenAIService())
            result = await scraper.scrape_and_match(url, odoo, job_svc=job_svc, job_id=job_id)

        # Persist each scraped product to the products collection so the
        # Odoo Comparator's MatchingService can find them.
        storage = StorageService(db)
        for product_result in result.products:
            sp = product_result.scraped
            product_data = {
                "name": sp.name,
                "default_code": sp.default_code,
                "barcode": sp.barcode,
                "Code_EAN": sp.code_ean,
                "constructeur": sp.constructeur,
                "refConstructeur": sp.ref_constructeur,
                "description_courte": sp.description_courte,
                "description_ecommerce": sp.description_ecommerce,
                "features_description": sp.features_description,
                "country_of_origin": sp.country_of_origin,
                "categ_id": sp.categ_id,
                "length": sp.length,
                "width": sp.width,
                "height": sp.height,
                "weight": sp.weight,
                "hs_code": sp.hs_code,
                "lst_price": sp.list_price,
                "source_url": sp.source_url,
                "image_urls": sp.image_urls,
            }
            source = {
                "source_id": job_id,
                "origin_file": url,
                "origin_file_type": "url",
                "source_type": "web_scrape",        # used by the products-list source filter
                "extraction_type": "web_scrape",
                "confidence_score": 0.7,
                "fields_extracted": [k for k, v in product_data.items() if v is not None],
                "timestamp": datetime.now(timezone.utc),
            }
            try:
                await storage.create_product(
                    product_data=product_data,
                    sources=[source],
                    extraction_job_id=job_id,
                )
            except Exception as save_err:
                logger.warning(f"Could not save scraped product '{sp.name}' to catalog: {save_err}")

        await cache_svc.put(url, result)
        await job_svc.save_result(job_id, result, from_cache=False)
    except Exception as e:
        logger.exception(f"Scrape job {job_id} failed: {e}")
        await job_svc.set_failed(job_id, str(e))


@router.post("/scrape")
async def scrape_url(
    request: ScrapeRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_database),
):
    """
    Start a scrape job for a supplier URL.

    - Returns immediately with {job_id, status: "pending"} for cache misses.
    - Returns {job_id, status: "done", from_cache: true, products: [...]} for cache hits.

    Poll GET /jobs/{job_id} every ~2 seconds until status is "done" or "failed".
    """
    if not request.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="L'URL doit commencer par http:// ou https://")

    cache_svc = UrlCacheService(db)
    job_svc = ScrapingJobService(db)

    # Fast path: return cached result without spawning a background task.
    cached = await cache_svc.get(request.url)
    if cached:
        job_id = await job_svc.create_job(request.url)
        # Mark the job as immediately done so the frontend's polling endpoint works too.
        await db.scraping_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "done",
                "from_cache": True,
                "total_products": cached.get("total_products", 0),
                "total_matched": cached.get("total_matched", 0),
                "warning": cached.get("warning"),
                "products": cached.get("products", []),
            }},
        )
        return {
            "job_id": job_id,
            "status": "done",
            "from_cache": True,
            **cached,
        }

    # Slow path: create pending job and hand off to background task.
    job_id = await job_svc.create_job(request.url)
    background_tasks.add_task(_run_scrape_job, job_id, request.url, db)

    return {
        "job_id": job_id,
        "status": "pending",
        "from_cache": False,
        "url": request.url,
        "total_products": 0,
        "total_matched": 0,
        "warning": None,
        "products": [],
    }


@router.get("/jobs/{job_id}")
async def get_scrape_job(job_id: str, db=Depends(get_database)):
    """
    Poll a scrape job for its current status and (when done) results.

    Status values: pending → running → done | failed
    """
    job_svc = ScrapingJobService(db)
    job = await job_svc.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Tâche introuvable : {job_id}")

    # Convert datetime fields to ISO strings so JSON serialisation works.
    for field in ("created_at", "started_at", "finished_at"):
        if job.get(field) is not None:
            job[field] = job[field].isoformat()

    return job
