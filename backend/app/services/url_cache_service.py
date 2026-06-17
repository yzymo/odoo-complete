"""
URL-based product scrape cache backed by MongoDB.
Stores scraping results keyed by a normalized URL hash with a 24-hour TTL.
"""

import hashlib
import logging
import re
import urllib.parse
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# Query params that are purely tracking noise and should be stripped before hashing.
_TRACKING_PARAMS = re.compile(
    r'^(utm_\w+|fbclid|gclid|msclkid|mc_eid|ref|affiliate|source|medium|campaign)$',
    re.IGNORECASE,
)


def _normalize_url(url: str) -> str:
    """Return a canonical URL suitable for cache-key generation."""
    parsed = urllib.parse.urlparse(url.lower().strip())
    # Strip tracking query params and sort remaining ones for stable keys.
    qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=False)
    clean_qs = {k: v for k, v in qs.items() if not _TRACKING_PARAMS.match(k)}
    sorted_query = urllib.parse.urlencode(sorted(clean_qs.items()), doseq=True)
    normalized = parsed._replace(query=sorted_query, fragment="").geturl()
    return normalized.rstrip("/")


def _hash_url(url: str) -> str:
    return hashlib.sha256(_normalize_url(url).encode()).hexdigest()


class UrlCacheService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db.url_product_cache

    # Increment whenever the scraped product schema gains new fields.
    # A cached entry with an older version is treated as a miss and re-scraped.
    _SCHEMA_VERSION = 2  # v2: added image_urls

    async def get(self, url: str) -> dict | None:
        """Return cached result dict or None if not cached / expired / stale schema."""
        url_hash = _hash_url(url)
        now = datetime.now(timezone.utc)
        doc = await self.col.find_one(
            {
                "url_hash": url_hash,
                "expires_at": {"$gt": now},
                "schema_version": self._SCHEMA_VERSION,
            },
            {"_id": 0, "result": 1},
        )
        if doc:
            logger.info(f"URL cache hit for {url}")
            return doc["result"]
        return None

    async def put(self, url: str, result) -> None:
        """Upsert the scraping result; TTL index on expires_at handles eviction."""
        url_hash = _hash_url(url)
        now = datetime.now(timezone.utc)
        products_serialized = []
        for p in result.products:
            products_serialized.append({
                "scraped": asdict(p.scraped),
                "odoo_matches": [asdict(m) for m in p.odoo_matches],
            })
        result_doc = {
            "url": result.url,
            "total_products": result.total_products,
            "total_matched": result.total_matched,
            "warning": result.error,
            "products": products_serialized,
        }
        await self.col.update_one(
            {"url_hash": url_hash},
            {"$set": {
                "url_hash": url_hash,
                "url": url,
                "schema_version": self._SCHEMA_VERSION,
                "created_at": now,
                "expires_at": now + timedelta(hours=24),
                "result": result_doc,
            }},
            upsert=True,
        )
        logger.info(f"URL cache stored for {url} (schema_version={self._SCHEMA_VERSION})")
