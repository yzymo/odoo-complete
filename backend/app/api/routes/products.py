"""
API routes for product CRUD operations.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.api.schemas.product import (
    Product,
    ProductCreate,
    ProductUpdate,
    ProductListResponse,
    ProductResponse
)
from app.services.storage_service import StorageService
from app.services.odoo_service import get_odoo_service
from app.services.scraper_service import (
    ScrapedProduct,
    find_odoo_matches_for_catalog_product,
)
from app.core.database import get_database
import logging
import math

logger = logging.getLogger(__name__)

# Fields pushed into the matched Odoo product when a catalog product is matched.
# Mirrors the web-scraper auto-apply set; keys are Odoo field names.
_ODOO_APPLY_FIELDS = (
    "barcode", "Code_EAN", "refConstructeur",
    "description_courte", "features_description",
)


class MatchToOdooRequest(BaseModel):
    """Payload for POST /products/{id}/match-to-odoo.

    ``odoo_id`` is the match the frontend selected (best candidate). ``score`` and
    ``match_label`` are stored as metadata; ``auto`` flags an automatic (≥90%) match.
    """
    odoo_id: int
    score: Optional[float] = None
    match_label: Optional[str] = None
    auto: bool = False


def _product_to_scraped(product: dict) -> ScrapedProduct:
    """Adapt a catalog product dict to the ScrapedProduct shape the matcher expects."""
    return ScrapedProduct(
        name=product.get("name") or "",
        default_code=product.get("default_code"),
        barcode=product.get("barcode"),
        code_ean=product.get("Code_EAN"),
        constructeur=product.get("constructeur"),
        ref_constructeur=product.get("refConstructeur"),
        list_price=product.get("lst_price"),
    )

router = APIRouter()


async def get_storage_service(db=Depends(get_database)):
    """Dependency to get storage service."""
    return StorageService(db)


@router.get("/", response_model=ProductListResponse)
async def get_products(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None, description="Filter by extraction status"),
    search: Optional[str] = Query(None, description="Full-text search"),
    source_type: Optional[str] = Query(None, description="Filter by source type (pdf, directory, web)"),
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Get paginated list of products with optional filters.

    - **page**: Page number (starts at 1)
    - **limit**: Number of products per page
    - **status**: Filter by extraction status (raw, validated, exported)
    - **search**: Full-text search on name and description
    - **source_type**: Filter by source type (pdf, directory, web)
    """
    try:
        skip = (page - 1) * limit

        # Build filter criteria
        filters = {}
        if status:
            filters["status"] = status
        if source_type:
            filters["source_type"] = source_type

        # Apply filters
        if search:
            products, total = await storage_service.search_products(search, skip, limit, filters)
        elif filters:
            products, total = await storage_service.get_products_with_filters(filters, skip, limit)
        else:
            products, total = await storage_service.get_products(skip, limit)

        pages = math.ceil(total / limit) if total > 0 else 0

        return ProductListResponse(
            products=products,
            total=total,
            page=page,
            limit=limit,
            pages=pages
        )

    except Exception as e:
        logger.error(f"Error getting products: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération des produits : {str(e)}")


@router.get("/duplicates/by-code")
async def get_duplicates_by_code(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    min_count: int = Query(2, ge=2, description="Minimum products per group"),
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Get products grouped by default_code to identify duplicates.

    Returns groups of products that share the same default_code.
    Only returns groups with at least `min_count` products.
    """
    try:
        skip = (page - 1) * limit
        groups, total = await storage_service.get_duplicates_by_code(skip, limit, min_count)

        pages = math.ceil(total / limit) if total > 0 else 0

        return {
            "groups": groups,
            "total_groups": total,
            "page": page,
            "limit": limit,
            "pages": pages
        }

    except Exception as e:
        logger.error(f"Error getting duplicates by code: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération des doublons : {str(e)}")


@router.get("/duplicates/by-code/{default_code}")
async def get_products_by_code(
    default_code: str,
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Get all products with a specific default_code.
    """
    try:
        products = await storage_service.get_products_by_default_code(default_code)

        return {
            "default_code": default_code,
            "count": len(products),
            "products": products
        }

    except Exception as e:
        logger.error(f"Error getting products by code {default_code}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération des produits : {str(e)}")


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: str,
    storage_service: StorageService = Depends(get_storage_service)
):
    """Get a single product by ID."""
    try:
        product = await storage_service.get_product_by_id(product_id)

        if not product:
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable")

        return ProductResponse(product=product)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération du produit : {str(e)}")


@router.post("/", response_model=ProductResponse, status_code=201)
async def create_product(
    product: ProductCreate,
    storage_service: StorageService = Depends(get_storage_service)
):
    """Create a new product manually."""
    try:
        product_dict = product.dict(exclude_unset=True)
        created_product = await storage_service.create_product(product_dict)

        return ProductResponse(
            product=created_product,
            message="Produit créé avec succès"
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating product: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création du produit : {str(e)}")


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    product_update: ProductUpdate,
    storage_service: StorageService = Depends(get_storage_service)
):
    """Update an existing product."""
    try:
        update_dict = product_update.dict(exclude_unset=True, exclude_none=True)

        # Extract edited_by if provided
        edited_by = update_dict.pop("edited_by", None)

        if not update_dict:
            raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")

        updated_product = await storage_service.update_product(
            product_id,
            update_dict,
            edited_by=edited_by
        )

        if not updated_product:
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable")

        return ProductResponse(
            product=updated_product,
            message="Produit mis à jour avec succès"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la mise à jour du produit : {str(e)}")


@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    storage_service: StorageService = Depends(get_storage_service)
):
    """Delete a product."""
    try:
        success = await storage_service.delete_product(product_id)

        if not success:
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable")

        return {"message": f"Produit {product_id} supprimé avec succès"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression du produit : {str(e)}")


@router.patch("/{product_id}/validate", response_model=ProductResponse)
async def validate_product(
    product_id: str,
    validated_by: Optional[str] = Query(None),
    storage_service: StorageService = Depends(get_storage_service)
):
    """Mark a product as validated."""
    try:
        validated_product = await storage_service.validate_product(product_id, validated_by)

        if not validated_product:
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable")

        return ProductResponse(
            product=validated_product,
            message="Produit validé avec succès"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la validation du produit : {str(e)}")


@router.get("/{product_id}/sources")
async def get_product_sources(
    product_id: str,
    storage_service: StorageService = Depends(get_storage_service)
):
    """Get extraction sources for a product."""
    try:
        product = await storage_service.get_product_by_id(product_id)

        if not product:
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable")

        sources = product.get("sources", [])
        return {"sources": sources, "count": len(sources)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting sources for product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération des sources : {str(e)}")


@router.get("/{product_id}/odoo-matches")
async def get_product_odoo_matches(
    product_id: str,
    max_results: int = Query(5, ge=1, le=20),
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Find matching Odoo products for a local catalog product.

    Same Odoo search as the web scraper (ref / EAN / brand / name) but with
    continuous fuzzy-name scoring, so the response supports a meaningful
    "Mettre en correspondance" button (≥80%) and automatic match (≥90%).

    ``odoo_match`` echoes any previously-recorded link so the frontend can skip
    products that are already matched.
    """
    try:
        product = await storage_service.get_product_by_id(product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable")

        scraped = _product_to_scraped(product)
        odoo = get_odoo_service()
        matches = await find_odoo_matches_for_catalog_product(scraped, odoo, limit=max_results)

        return {
            "product_id": product_id,
            "matches": [
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
                for m in matches
            ],
            "total_matches": len(matches),
            "odoo_match": product.get("odoo_match"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding Odoo matches for product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{product_id}/match-to-odoo")
async def match_product_to_odoo(
    product_id: str,
    payload: MatchToOdooRequest,
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Apply a catalog product's fields into the matched Odoo product and record the link.

    Mirrors the web-scraper behaviour: pushes barcode / Code EAN / réf constructeur /
    description courte / caractéristiques into the Odoo product, then stores the link
    so the match is not repeated on the next visit.
    """
    try:
        product = await storage_service.get_product_by_id(product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable")

        odoo_values = {
            field: product[field]
            for field in _ODOO_APPLY_FIELDS
            if product.get(field)
        }
        if not odoo_values:
            raise HTTPException(
                status_code=400,
                detail="Ce produit n'a aucun champ à transférer vers Odoo",
            )

        odoo = get_odoo_service()
        try:
            updated = odoo.update_product(payload.odoo_id, odoo_values)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erreur Odoo : {str(e)}")

        if not updated:
            raise HTTPException(status_code=404, detail=f"Produit Odoo {payload.odoo_id} introuvable")

        match_info = {
            "odoo_id": payload.odoo_id,
            "score": payload.score,
            "match_label": payload.match_label,
            "auto": payload.auto,
            "applied_fields": list(odoo_values.keys()),
            "matched_at": datetime.now(timezone.utc),
        }
        await storage_service.set_odoo_match(product_id, match_info)

        return {
            "success": True,
            "odoo_id": payload.odoo_id,
            "applied_fields": list(odoo_values.keys()),
            "odoo_match": match_info,
            "message": "Produit mis en correspondance avec Odoo",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error matching product {product_id} to Odoo: {e}")
        raise HTTPException(status_code=500, detail=str(e))
