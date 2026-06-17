"""
Pydantic request/response schemas for the enrichment API.
"""

from typing import List, Optional
from pydantic import BaseModel, HttpUrl, field_validator


# ------------------------------------------------------------------ Requests

class EnrichFromUrlRequest(BaseModel):
    base_url: str
    odoo_product_ids: List[int]
    missing_fields: List[str]
    dry_run: bool = True
    min_confidence: float = 0.85
    apply_patches: bool = False

    @field_validator("base_url")
    @classmethod
    def must_be_http(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("base_url must start with http:// or https://")
        return v

    @field_validator("min_confidence")
    @classmethod
    def confidence_range(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("min_confidence must be between 0.0 and 1.0")
        return v

    @field_validator("missing_fields")
    @classmethod
    def non_empty_fields(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("missing_fields must contain at least one field name")
        return v


class PreviewScrapeRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def must_be_http(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("url must start with http:// or https://")
        return v


# ------------------------------------------------------------------ Responses

class PatchSourceInfo(BaseModel):
    origin: str
    url: str
    scrape_confidence: float


class PatchEntry(BaseModel):
    odoo_id: Optional[int]
    odoo_name: Optional[str]
    source_url: str
    match_confidence: float
    match_field: str
    patch: dict
    source: PatchSourceInfo


class EnrichmentSummary(BaseModel):
    total_urls_scraped: int
    total_matched: int
    total_enriched: int
    total_unmatched: int
    llm_calls_made: int
    tokens_used: int


class EnrichFromUrlResponse(BaseModel):
    job_id: str
    dry_run: bool
    applied: bool
    summary: EnrichmentSummary
    patches: List[PatchEntry]
    unmatched_urls: List[str]
    errors: List[dict]


class SiteInfo(BaseModel):
    domain: str


class SitesResponse(BaseModel):
    configured_domains: List[str]
    total: int


class ScrapedProductResponse(BaseModel):
    url: str
    name: Optional[str]
    ref: Optional[str]
    ean: Optional[str]
    price: Optional[float]
    description_short: Optional[str]
    features: List[str]
    image_urls: List[str]
    dimensions: dict
    raw_specs_text: Optional[str]
    scrape_confidence: float
