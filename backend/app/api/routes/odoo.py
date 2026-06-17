"""
API routes for Odoo integration.
Handles fetching products from Odoo and synchronization.
"""

import asyncio
import base64
import logging
import math
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

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


class OdooProductUpdate(BaseModel):
    """Payload for updating Odoo product fields from comparator UI."""
    name: Optional[str] = None
    default_code: Optional[str] = None
    barcode: Optional[str] = None
    code_ean: Optional[str] = None
    constructeur: Optional[str] = None
    ref_constructeur: Optional[str] = None
    description_courte: Optional[str] = None
    description_ecommerce: Optional[str] = None
    features_description: Optional[str] = None
    country_of_origin: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    hs_code: Optional[str] = None
    contient_du_lithium: Optional[bool] = None
    list_price: Optional[float] = None
    active: Optional[bool] = None
    is_published: Optional[bool] = None


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
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération des produits Odoo : {str(e)}")


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
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable dans Odoo")

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
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération du produit Odoo : {str(e)}")


@router.patch("/products/{product_id}")
async def update_odoo_product(product_id: int, payload: OdooProductUpdate):
    """
    Update editable fields of a single Odoo product.
    """
    try:
        odoo = get_odoo_service()

        update_data = payload.dict(exclude_none=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")

        # Map API field names to Odoo field names
        field_mapping = {
            "code_ean": "Code_EAN",
            "ref_constructeur": "refConstructeur",
        }

        odoo_values = {
            field_mapping.get(key, key): value
            for key, value in update_data.items()
        }

        product = odoo.update_product(product_id, odoo_values)

        if not product:
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable dans Odoo")

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

        return {
            "product": formatted,
            "message": "Produit Odoo mis à jour avec succès"
        }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating Odoo product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la mise à jour du produit Odoo : {str(e)}")


@router.get("/products/{product_id}/gallery")
async def get_product_gallery(product_id: int):
    """
    Return the gallery images (product.image records) for an Odoo product template.
    Each item: { id, name, image_1920 (base64 | null) }.
    """
    odoo = get_odoo_service()
    try:
        images = await asyncio.to_thread(odoo.get_product_gallery, product_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erreur Odoo : {exc}") from exc
    return {"product_id": product_id, "images": images}


class SetImagesRequest(BaseModel):
    """
    Payload for POST /products/{id}/images.

    main_image_url  — URL to download and write to ``image_1920``.
                      Odoo auto-generates all thumbnails (512/256/128/64).
                      Omit (or pass null) to leave the main image untouched.
    gallery_urls    — URLs to download and write as ``product_template_image_ids``.
                      Pass an empty list to skip gallery.
                      Pass null to leave gallery untouched even when clear_gallery=True.
    clear_gallery   — When True and gallery_urls is not None, sends ORM command
                      (5,0,0) to wipe existing gallery before writing new images.
    """
    main_image_url: Optional[str] = None
    gallery_urls: Optional[List[str]] = None
    clear_gallery: bool = True


_DOWNLOAD_TIMEOUT = 20.0
_MAX_IMAGE_BYTES = 10 * 1_048_576   # 10 MB
_DOWNLOAD_UA = "Mozilla/5.0 (compatible; OdooImageSync/1.0)"


async def _download_image_b64(url: str) -> tuple:
    """Download *url* and return ``(base64_str, error_msg)``.

    Returns ``(None, error)`` on any failure so the caller can continue
    with the images that did download successfully.
    """
    try:
        async with httpx.AsyncClient(
            timeout=_DOWNLOAD_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": _DOWNLOAD_UA},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            ct = resp.headers.get("content-type", "")
            if not ct.startswith("image/"):
                return None, f"Not an image (content-type: {ct!r})"
            if len(resp.content) > _MAX_IMAGE_BYTES:
                return None, f"Too large ({len(resp.content) // 1024} KB > 10 MB)"
            return base64.b64encode(resp.content).decode("ascii"), None
    except httpx.HTTPStatusError as exc:
        return None, f"HTTP {exc.response.status_code}"
    except httpx.TimeoutException:
        return None, "Download timed out"
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


def _gallery_name(url: str, idx: int) -> str:
    """Derive a short display name from the image URL."""
    segment = url.rstrip("/").split("/")[-1].split("?")[0]
    return segment[:80] or f"Image {idx + 1}"


def _build_download_tasks(request: "SetImagesRequest") -> List[tuple]:
    """Return a deduplicated [(role, url), ...] list: main first, then gallery."""
    raw: List[tuple] = []
    if request.main_image_url:
        raw.append(("main", request.main_image_url))
    for url in (request.gallery_urls or []):
        raw.append(("gallery", url))
    seen: set = set()
    deduped: List[tuple] = []
    for item in raw:
        if item[1] not in seen:
            seen.add(item[1])
            deduped.append(item)
    return deduped


def _parse_download_results(
    tasks: List[tuple], results: List[tuple]
) -> tuple:
    """Split download outcomes into (main_b64, gallery_list, errors)."""
    main_b64: Optional[str] = None
    gallery_list: List[dict] = []
    errors: List[str] = []
    for idx, ((role, url), (b64, err)) in enumerate(zip(tasks, results)):
        if err:
            errors.append(f"{url}: {err}")
            logger.warning("[images] download failed — %s: %s", url, err)
        elif role == "main":
            main_b64 = b64
        else:
            gallery_list.append({"name": _gallery_name(url, idx), "b64": b64})
    return main_b64, gallery_list, errors


@router.post(
    "/products/{product_id}/images",
    responses={400: {}, 422: {}, 502: {}},
)
async def set_product_images(product_id: int, request: SetImagesRequest):
    """
    Download images from URLs and write them to an Odoo product.

    * ``main_image_url``  → ``product.template.image_1920``
      Odoo auto-generates all thumbnail sizes (512 / 256 / 128 / 64).
    * ``gallery_urls``    → ``product.template.product_template_image_ids``
      Each URL becomes one ``product.image`` record.
      ``clear_gallery=True`` (default) wipes existing gallery via ORM ``(5,0,0)``
      before writing new images.
    """
    if not request.main_image_url and not request.gallery_urls:
        raise HTTPException(status_code=400, detail="Aucune URL d'image fournie")

    tasks = _build_download_tasks(request)
    raw_results = await asyncio.gather(*[_download_image_b64(url) for _, url in tasks])
    main_b64, gallery_list, errors = _parse_download_results(tasks, list(raw_results))

    if main_b64 is None and not gallery_list:
        raise HTTPException(
            status_code=422,
            detail={"message": "Échec du téléchargement de toutes les images", "errors": errors},
        )

    # None = skip gallery field entirely; list (even empty) = write/clear it
    gallery_arg = gallery_list if request.gallery_urls is not None else None

    odoo = get_odoo_service()
    try:
        success = await asyncio.to_thread(
            odoo.update_product_images,
            product_id, main_b64, gallery_arg, request.clear_gallery,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erreur Odoo lors de l'écriture : {exc}") from exc

    return {
        "success": success,
        "product_id": product_id,
        "main_image_updated": main_b64 is not None,
        "gallery_images_written": len(gallery_list),
        "gallery_cleared": request.clear_gallery and request.gallery_urls is not None,
        "failed_downloads": len(errors),
        "errors": errors or None,
    }


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
            raise HTTPException(status_code=404, detail=f"Produit {product_id} introuvable dans Odoo")

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
