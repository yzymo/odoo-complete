"""
API routes for the Web Enrichment Service.

POST /from-url       — scrape a URL and produce field patches for Odoo products
GET  /sites          — list domains with explicit CSS-selector configs
POST /preview-scrape — scrape a single page and return raw ScrapedProduct (debug)
"""

import asyncio
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Query

from app.models.enrichment_models import (
    EnrichFromUrlRequest,
    EnrichFromUrlResponse,
    EnrichmentSummary,
    PatchEntry,
    PatchSourceInfo,
    PreviewScrapeRequest,
    ScrapedProductResponse,
    SitesResponse,
)
from app.scrapers.site_configs import get_configured_domains
from app.scrapers.web_scraper import TargetedScraper
from app.services.enrichment_service import get_enrichment_service
from app.services.odoo_service import get_odoo_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/from-url", response_model=EnrichFromUrlResponse)
async def enrich_from_url(request: EnrichFromUrlRequest):
    """
    Scrape a catalogue or product URL, match pages to the specified Odoo products,
    and return field patches.

    - dry_run=True (default): compute and return patches without writing to Odoo.
    - apply_patches=True AND dry_run=False: write patches to Odoo via XML-RPC.
    """
    try:
        odoo = get_odoo_service()

        # Fetch the target Odoo products (synchronous XML-RPC in thread)
        odoo_products = await asyncio.to_thread(
            _fetch_odoo_products, odoo, request.odoo_product_ids
        )

        if not odoo_products:
            raise HTTPException(
                status_code=404,
                detail="Aucun des identifiants de produits Odoo demandés n'a été trouvé",
            )

        service = get_enrichment_service()
        result = await service.enrich_products_from_url(
            base_url=request.base_url,
            odoo_products=odoo_products,
            missing_fields=request.missing_fields,
            min_confidence=request.min_confidence,
        )

        applied = False
        if request.apply_patches and not request.dry_run and result.patches:
            await asyncio.to_thread(
                _apply_patches_to_odoo, odoo, result.patches, request.min_confidence
            )
            applied = True
            logger.info(f"Applied {len(result.patches)} patches to Odoo")

        return EnrichFromUrlResponse(
            job_id=result.job_id,
            dry_run=request.dry_run,
            applied=applied,
            summary=EnrichmentSummary(
                total_urls_scraped=result.total_urls_scraped,
                total_matched=result.total_matched,
                total_enriched=result.total_enriched,
                total_unmatched=result.total_unmatched,
                llm_calls_made=result.llm_calls_made,
                tokens_used=result.tokens_used,
            ),
            patches=[
                PatchEntry(
                    odoo_id=p.get("odoo_id"),
                    odoo_name=p.get("odoo_name"),
                    source_url=p.get("source_url", ""),
                    match_confidence=p.get("match_confidence", 0.0),
                    match_field=p.get("match_field", ""),
                    patch=p.get("patch", {}),
                    source=PatchSourceInfo(
                        origin=p["source"]["origin"],
                        url=p["source"]["url"],
                        scrape_confidence=p["source"]["scrape_confidence"],
                    ),
                )
                for p in result.patches
            ],
            unmatched_urls=result.unmatched_urls,
            errors=result.errors,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Enrichment from-url error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/sites", response_model=SitesResponse)
async def get_configured_sites():
    """Return list of domains that have explicit CSS-selector configurations."""
    domains = get_configured_domains()
    return SitesResponse(configured_domains=domains, total=len(domains))


@router.post("/preview-scrape", response_model=ScrapedProductResponse)
async def preview_scrape(request: PreviewScrapeRequest):
    """
    Scrape a single product page and return the raw extracted data.
    Useful for debugging site configs and verifying selector accuracy.
    """
    try:
        scraper = TargetedScraper()
        scraped = await scraper.scrape_product_page(request.url)
        await scraper.close()

        return ScrapedProductResponse(
            url=scraped.url,
            name=scraped.name,
            ref=scraped.ref,
            ean=scraped.ean,
            price=scraped.price,
            description_short=scraped.description_short,
            features=scraped.features,
            image_urls=scraped.image_urls,
            dimensions=scraped.dimensions,
            raw_specs_text=scraped.raw_specs_text,
            scrape_confidence=scraped.scrape_confidence,
        )

    except Exception as exc:
        logger.error(f"Preview scrape error for {request.url}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ------------------------------------------------------------------ helpers

def _fetch_odoo_products(odoo, product_ids: List[int]) -> list:
    """Synchronous helper — call inside asyncio.to_thread."""
    from app.services.odoo_service import OdooService

    fields = [
        "id", "name", "default_code", "barcode", "Code_EAN", "refConstructeur",
        "description_courte", "description_ecommerce", "features_description",
        "length", "width", "height", "weight", "lst_price",
    ]
    products, _ = odoo.get_products(
        search_domain=[["id", "in", product_ids]],
        limit=len(product_ids) + 1,
        fields=fields,
    )
    return products


def _apply_patches_to_odoo(odoo, patches: list, min_confidence: float) -> None:
    """Synchronous helper — call inside asyncio.to_thread."""
    for entry in patches:
        odoo_id = entry.get("odoo_id")
        patch = entry.get("patch", {})
        confidence = entry.get("match_confidence", 0.0)

        if not odoo_id or not patch or confidence < min_confidence:
            continue

        try:
            odoo.update_product(odoo_id, patch)
            logger.info(f"Patched Odoo product {odoo_id} with fields: {list(patch.keys())}")
        except Exception as exc:
            logger.error(f"Failed to patch Odoo product {odoo_id}: {exc}")
