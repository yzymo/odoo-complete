"""
API routes for Odoo integration.
Handles fetching products from Odoo and synchronization.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List
from pydantic import BaseModel
import logging
import math

from app.services.odoo_service import OdooService, get_odoo_service
from app.services.storage_service import StorageService
from app.services.matching_service import MatchingService, get_matching_service
from app.core.database import get_database

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_storage_service(db=Depends(get_database)):
    """Dependency to get StorageService instance."""
    return StorageService(db)


class OdooProductListResponse(BaseModel):
    """Response schema for Odoo product list."""
    products: List[dict]
    total: int
    page: int
    limit: int
    pages: int


@router.get("/test-connection")
async def test_odoo_connection():
    """
    Test the connection to Odoo.
    Returns connection status and server info.
    """
    try:
        odoo = get_odoo_service()
        result = odoo.test_connection()
        return result
    except Exception as e:
        logger.error(f"Error testing Odoo connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products")
async def get_odoo_products(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, description="Search by name, code, or barcode"),
    active_only: bool = Query(True, description="Only show active products")
):
    """
    Get paginated list of products from Odoo.

    Args:
        page: Page number (starts at 1)
        limit: Number of products per page
        search: Optional search term
        active_only: Filter for active products only
    """
    try:
        odoo = get_odoo_service()
        offset = (page - 1) * limit

        # Build domain filter
        domain = []
        if active_only:
            domain.append(['active', '=', True])

        if search:
            # Search in name, default_code, and barcode
            search_domain = [
                '|', '|',
                ['name', 'ilike', search],
                ['default_code', 'ilike', search],
                ['barcode', 'ilike', search]
            ]
            if domain:
                domain = ['&'] + domain + search_domain
            else:
                domain = search_domain

        products, total = odoo.get_products(
            limit=limit,
            offset=offset,
            search_domain=domain if domain else None
        )

        pages = math.ceil(total / limit) if total > 0 else 0

        # Format products for frontend (list view - lighter fields)
        formatted_products = []
        for p in products:
            formatted_products.append({
                "id": p.get('id'),
                "name": p.get('name'),
                "default_code": p.get('default_code') or None,
                "barcode": p.get('barcode') or None,
                "code_ean": p.get('Code_EAN') or None,
                "list_price": p.get('list_price'),
                "category": p.get('categ_id')[1] if p.get('categ_id') else None,
                "category_id": p.get('categ_id')[0] if p.get('categ_id') else None,
                "type": p.get('type'),
                "active": p.get('active'),
                "is_published": p.get('is_published'),
                "constructeur": p.get('constructeur') or None,
                "ref_constructeur": p.get('refConstructeur') or None,
                "image_small": p.get('image_128'),  # Base64 encoded
                "write_date": p.get('write_date'),
            })

        return {
            "products": formatted_products,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": pages
        }

    except Exception as e:
        logger.error(f"Error getting Odoo products: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching Odoo products: {str(e)}")


@router.get("/products/{product_id}")
async def get_odoo_product(product_id: int):
    """
    Get a single product from Odoo by ID.
    Returns full product details including images.
    """
    try:
        odoo = get_odoo_service()
        product = odoo.get_product_by_id(product_id)

        if not product:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found in Odoo")

        # Format for frontend (full detail view matching catalog schema)
        formatted = {
            # Identifiers
            "id": product.get('id'),
            "default_code": product.get('default_code') or None,
            "barcode": product.get('barcode') or None,
            "code_ean": product.get('Code_EAN') or None,

            # Basic info
            "name": product.get('name'),
            "type": product.get('type'),
            "active": product.get('active'),
            "is_published": product.get('is_published'),

            # Category & Origin
            "category": product.get('categ_id')[1] if product.get('categ_id') else None,
            "category_id": product.get('categ_id')[0] if product.get('categ_id') else None,
            "country_of_origin": product.get('country_of_origin') or None,

            # Manufacturer
            "constructeur": product.get('constructeur') or None,
            "ref_constructeur": product.get('refConstructeur') or None,

            # Descriptions
            "description_courte": product.get('description_courte') or None,
            "description_ecommerce": product.get('description_ecommerce') or None,
            "features_description": product.get('features_description') or None,

            # Dimensions (mm/kg)
            "length": product.get('length'),
            "width": product.get('width'),
            "height": product.get('height'),
            "weight": product.get('weight'),

            # Logistics
            "hs_code": product.get('hs_code') or None,
            "contient_du_lithium": product.get('contient_du_lithium'),

            # Price & Tax
            "list_price": product.get('list_price'),
            "taxes_id": product.get('taxes_id'),

            # Images (Base64 encoded)
            "image_1920": product.get('image_1920'),
            "image_1024": product.get('image_1024'),
            "image_512": product.get('image_512'),
            "image_256": product.get('image_256'),
            "image_128": product.get('image_128'),
            "product_template_image_ids": product.get('product_template_image_ids'),

            # Technical documents
            "fiche_constructeur_nom": product.get('fiche_constructeur_nom') or None,
            "fiche_constructeur": product.get('fiche_constructeur'),
            "fiche_technique_nom": product.get('fiche_technique_nom') or None,
            "fiche_technique": product.get('fiche_technique'),

            # Dates
            "create_date": product.get('create_date'),
            "write_date": product.get('write_date'),
        }

        return {"product": formatted}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting Odoo product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching Odoo product: {str(e)}")


@router.get("/products/{product_id}/match")
async def find_catalog_match(
    product_id: int,
    max_results: int = Query(10, ge=1, le=50, description="Maximum matches to return"),
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Find matching products in our catalog for an Odoo product.

    Uses multi-criteria matching:
    1. Exact barcode match (score: 1.0)
    2. Exact Code EAN match (score: 1.0)
    3. Exact default_code match (score: 0.95)
    4. Manufacturer reference match (score: 0.85)
    5. Fuzzy name matching (score: 0.60-0.75)
    """
    try:
        # Get the Odoo product first
        odoo = get_odoo_service()
        product = odoo.get_product_by_id(product_id)

        if not product:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found in Odoo")

        # Create matching service and find matches
        matching_service = get_matching_service(storage_service)
        matches = await matching_service.find_matches(product, max_results=max_results)

        # Format matches for response
        formatted_matches = [
            {
                "product_id": match.product_id,
                "product_name": match.product_name,
                "default_code": match.default_code,
                "barcode": match.barcode,
                "constructeur": match.constructeur,
                "score": round(match.score, 2),
                "match_type": match.match_type,
                "match_details": match.match_details,
            }
            for match in matches
        ]

        return {
            "odoo_product": {
                "id": product.get('id'),
                "name": product.get('name'),
                "default_code": product.get('default_code'),
                "barcode": product.get('barcode'),
                "code_ean": product.get('Code_EAN'),
                "constructeur": product.get('constructeur'),
                "ref_constructeur": product.get('refConstructeur'),
                "image_128": product.get('image_128'),
            },
            "search_criteria": {
                "default_code": product.get('default_code'),
                "barcode": product.get('barcode'),
                "code_ean": product.get('Code_EAN'),
                "ref_constructeur": product.get('refConstructeur'),
                "constructeur": product.get('constructeur'),
                "name": product.get('name'),
            },
            "matches": formatted_matches,
            "total_matches": len(formatted_matches),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding catalog match for Odoo product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
