"""
WebEnrichmentService — orchestrates scraping → matching → patching for Odoo product enrichment.

Rules:
- Never overwrite an Odoo field that already has a value.
- LLM only for description_courte / description_ecommerce / features_description, input ≤1500 chars, max_tokens=300.
- Minimum match confidence > 0.70 to accept a patch.
- dry_run=True by default — never writes to Odoo unless apply_patches=True is explicitly set.
"""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Optional

from openai import AsyncOpenAI

from app.config import settings
from app.scrapers.site_configs import get_config
from app.scrapers.web_scraper import ScrapedProduct, TargetedScraper
from app.services.matcher_service import ProductMatcher

logger = logging.getLogger(__name__)

FIELDS_NO_LLM = frozenset({
    "name", "default_code", "barcode", "Code_EAN", "refConstructeur",
    "lst_price", "length", "width", "height", "weight",
})
FIELDS_NEEDING_LLM = frozenset({
    "description_courte", "description_ecommerce", "features_description",
})

# Maps ScrapedProduct attributes to Odoo field names
_SCRAPER_TO_ODOO: dict = {
    "name":              "name",
    "ref":               "refConstructeur",
    "ean":               "Code_EAN",
    "price":             "lst_price",
    "description_short": "description_courte",
}

_LLM_DESCRIPTION_PROMPT = """Extract the following product information from the specification text below.
Fields to extract: {fields}

Specification text (truncated):
{text}

Return ONLY valid JSON with the requested field names as keys. Use null for missing fields.
Keep descriptions concise (max 300 chars each)."""


@dataclass
class EnrichmentResult:
    job_id: str
    total_urls_scraped: int = 0
    total_matched: int = 0
    total_enriched: int = 0
    total_unmatched: int = 0
    patches: list = field(default_factory=list)
    unmatched_urls: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    llm_calls_made: int = 0
    tokens_used: int = 0


class WebEnrichmentService:
    def __init__(self):
        self.scraper = TargetedScraper()
        self.matcher = ProductMatcher()
        self._openai = AsyncOpenAI(api_key=settings.openai_api_key)

    async def enrich_products_from_url(
        self,
        base_url: str,
        odoo_products: list,
        missing_fields: list,
        min_confidence: float = 0.85,
    ) -> EnrichmentResult:
        """
        Scrape a catalogue or product URL, match pages to Odoo products,
        and build field patches.

        Args:
            base_url: Catalogue or single product URL.
            odoo_products: Odoo product dicts fetched before calling this method.
            missing_fields: Fields to fill (only these will be patched).
            min_confidence: Minimum match confidence to accept a patch.

        Returns:
            EnrichmentResult (patches list, stats, errors).
        """
        result = EnrichmentResult(job_id=str(uuid.uuid4()))
        self.matcher.build_index(odoo_products)
        config = get_config(base_url)

        # Determine if base_url is a catalogue or a single product page.
        # Heuristic: try to find product links; if there are none, treat as a single page.
        product_urls = await self.scraper.get_product_urls(base_url, config)
        if not product_urls:
            product_urls = [base_url]

        for url in product_urls:
            try:
                scraped = await self.scraper.scrape_product_page(url)
                result.total_urls_scraped += 1

                match = self.matcher.find_match(scraped)
                if not match:
                    result.total_unmatched += 1
                    result.unmatched_urls.append(url)
                    continue

                result.total_matched += 1
                confidence = match.get("_match_confidence", 0.0)

                if confidence < min_confidence:
                    logger.warning(
                        f"Match below min_confidence ({confidence:.2f} < {min_confidence}): "
                        f'"{scraped.name}" → "{match.get("name")}" — skipped'
                    )
                    result.unmatched_urls.append(url)
                    continue

                patch, llm_calls, tokens = await self._build_patch_with_llm(
                    scraped, match, missing_fields
                )
                result.llm_calls_made += llm_calls
                result.tokens_used += tokens

                if patch:
                    result.patches.append({
                        "odoo_id": match.get("id"),
                        "odoo_name": match.get("name"),
                        "source_url": url,
                        "match_confidence": confidence,
                        "match_field": match.get("_match_field"),
                        "patch": patch,
                        "source": {
                            "origin": "web_scrape",
                            "url": url,
                            "scrape_confidence": scraped.scrape_confidence,
                        },
                    })
                    result.total_enriched += 1

            except Exception as exc:
                logger.error(f"Error processing URL {url}: {exc}", exc_info=True)
                result.errors.append({"url": url, "error": str(exc)})

            await asyncio.sleep(config.get("rate_limit_seconds", 1.0))

        return result

    async def enrich_single_product(
        self,
        product_url: str,
        odoo_product: dict,
        missing_fields: list,
    ) -> dict:
        """
        Scrape a single product URL and return a patch for the given Odoo product.
        Does NOT perform matching — the caller already knows which product this URL belongs to.
        """
        scraped = await self.scraper.scrape_product_page(product_url)
        patch, llm_calls, tokens = await self._build_patch_with_llm(
            scraped, odoo_product, missing_fields
        )
        return {
            "patch": patch,
            "scrape_confidence": scraped.scrape_confidence,
            "llm_calls_made": llm_calls,
            "tokens_used": tokens,
            "source": {
                "origin": "web_scrape",
                "url": product_url,
                "scrape_confidence": scraped.scrape_confidence,
            },
        }

    # ----------------------------------------------------------------- private

    async def _build_patch_with_llm(
        self,
        scraped: ScrapedProduct,
        odoo_product: dict,
        missing_fields: list,
    ) -> tuple:
        """Return (patch_dict, llm_calls_count, tokens_used)."""
        patch = self._build_patch(scraped, odoo_product, missing_fields)
        llm_calls = 0
        tokens = 0

        # Determine which LLM fields are needed
        llm_targets = [
            f for f in self._fields_needing_llm(set(missing_fields))
            if not _has_value(odoo_product, f) and scraped.raw_specs_text
        ]

        if llm_targets:
            try:
                llm_result, call_tokens = await self._llm_extract_description(
                    scraped.raw_specs_text, set(llm_targets)
                )
                llm_calls = 1
                tokens = call_tokens
                for f in llm_targets:
                    value = llm_result.get(f)
                    if value and not _has_value(odoo_product, f):
                        patch[f] = value
            except Exception as exc:
                logger.error(f"LLM extraction failed: {exc}")

        return patch, llm_calls, tokens

    def _build_patch(
        self,
        scraped: ScrapedProduct,
        odoo_product: dict,
        missing_fields: list,
    ) -> dict:
        """
        Build the non-LLM patch: map scraper fields → Odoo fields,
        skipping any field already present in the Odoo product.
        """
        patch = {}

        for scraper_attr, odoo_field in _SCRAPER_TO_ODOO.items():
            if odoo_field not in missing_fields:
                continue
            if _has_value(odoo_product, odoo_field):
                continue
            value = getattr(scraped, scraper_attr, None)
            if value is not None:
                patch[odoo_field] = value

        # Dimensions
        for dim in ("length", "width", "height", "weight"):
            if dim not in missing_fields:
                continue
            if _has_value(odoo_product, dim):
                continue
            if scraped.dimensions.get(dim) is not None:
                patch[dim] = scraped.dimensions[dim]

        # barcode (same as ean)
        if "barcode" in missing_fields and not _has_value(odoo_product, "barcode") and scraped.ean:
            patch["barcode"] = scraped.ean

        # features_description from features list (non-LLM path when raw_specs_text absent)
        if (
            "features_description" in missing_fields
            and not _has_value(odoo_product, "features_description")
            and scraped.features
            and not scraped.raw_specs_text
        ):
            patch["features_description"] = "\n".join(scraped.features[:10])

        return patch

    async def _llm_extract_description(self, raw_text: str, target_fields: set) -> tuple:
        """
        Call OpenAI to extract description fields from raw specs text.
        Input is truncated to 1500 chars; max_tokens=300.

        Returns: (result_dict, tokens_used)
        """
        truncated = raw_text[:1500]
        fields_list = ", ".join(sorted(target_fields))
        prompt = _LLM_DESCRIPTION_PROMPT.format(fields=fields_list, text=truncated)

        response = await self._openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": "You are a product data extractor. Return ONLY valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=300,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        tokens = response.usage.total_tokens

        try:
            result = json.loads(content)
        except json.JSONDecodeError as exc:
            logger.error(f"LLM returned invalid JSON: {exc} — content: {content[:200]}")
            result = {}

        return result, tokens

    @staticmethod
    def _fields_needing_llm(missing_fields: set) -> set:
        return missing_fields & FIELDS_NEEDING_LLM

    @staticmethod
    def _fields_no_llm(missing_fields: set) -> set:
        return missing_fields & FIELDS_NO_LLM


def _has_value(product: dict, field: str) -> bool:
    """Return True if the Odoo product already has a non-empty value for the field."""
    val = product.get(field)
    if val is None:
        return False
    if isinstance(val, str) and not val.strip():
        return False
    if isinstance(val, (int, float)) and val == 0:
        return False
    return True


# Module-level singleton
_enrichment_service: Optional[WebEnrichmentService] = None


def get_enrichment_service() -> WebEnrichmentService:
    global _enrichment_service
    if _enrichment_service is None:
        _enrichment_service = WebEnrichmentService()
    return _enrichment_service
