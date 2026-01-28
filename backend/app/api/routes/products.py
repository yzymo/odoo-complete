"""
API routes for product CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from app.api.schemas.product import (
    Product,
    ProductCreate,
    ProductUpdate,
    ProductListResponse,
    ProductResponse
)
from app.services.storage_service import StorageService
from app.core.database import get_database
import logging
import math

logger = logging.getLogger(__name__)

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
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Get paginated list of products with optional filters.

    - **page**: Page number (starts at 1)
    - **limit**: Number of products per page
    - **status**: Filter by extraction status (raw, validated, exported)
    - **search**: Full-text search on name and description
    """
    try:
        skip = (page - 1) * limit

        # Apply filters
        if search:
            products, total = await storage_service.search_products(search, skip, limit)
        elif status:
            products, total = await storage_service.get_products_by_status(status, skip, limit)
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
        raise HTTPException(status_code=500, detail=f"Error retrieving products: {str(e)}")


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: str,
    storage_service: StorageService = Depends(get_storage_service)
):
    """Get a single product by ID."""
    try:
        product = await storage_service.get_product_by_id(product_id)

        if not product:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

        return ProductResponse(product=product)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving product: {str(e)}")


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
            message="Product created successfully"
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating product: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating product: {str(e)}")


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
            raise HTTPException(status_code=400, detail="No fields to update")

        updated_product = await storage_service.update_product(
            product_id,
            update_dict,
            edited_by=edited_by
        )

        if not updated_product:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

        return ProductResponse(
            product=updated_product,
            message="Product updated successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating product: {str(e)}")


@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    storage_service: StorageService = Depends(get_storage_service)
):
    """Delete a product."""
    try:
        success = await storage_service.delete_product(product_id)

        if not success:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

        return {"message": f"Product {product_id} deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting product: {str(e)}")


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
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

        return ProductResponse(
            product=validated_product,
            message="Product validated successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error validating product: {str(e)}")


@router.get("/{product_id}/sources")
async def get_product_sources(
    product_id: str,
    storage_service: StorageService = Depends(get_storage_service)
):
    """Get extraction sources for a product."""
    try:
        product = await storage_service.get_product_by_id(product_id)

        if not product:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

        sources = product.get("sources", [])
        return {"sources": sources, "count": len(sources)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting sources for product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving sources: {str(e)}")
