"""
API routes for exporting products to various formats.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from typing import Optional
import logging
import os

from app.services.export_service import ExportService
from app.services.storage_service import StorageService
from app.core.database import get_database

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_storage_service(db=Depends(get_database)):
    """Dependency to get storage service."""
    return StorageService(db)


@router.get("/excel")
async def export_to_excel(
    status: Optional[str] = Query(None, description="Filter by extraction status"),
    search: Optional[str] = Query(None, description="Search term"),
    limit: Optional[int] = Query(None, description="Maximum number of products to export"),
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Export all products to Excel file.

    Query parameters:
    - **status**: Filter by extraction status (raw, enriched, validated, exported)
    - **search**: Full-text search on name and description
    - **limit**: Maximum number of products (default: all)

    Returns Excel file for download.
    """
    try:
        logger.info(f"Starting Excel export (status={status}, search={search}, limit={limit})")

        # Build filters
        filters = {}
        if status:
            filters["extraction_metadata.status"] = status

        # Fetch products
        if search:
            products, total = await storage_service.search_products(search, skip=0, limit=limit or 10000)
        else:
            products, total = await storage_service.get_products(skip=0, limit=limit or 10000, filters=filters)

        if not products:
            raise HTTPException(status_code=404, detail="No products found to export")

        logger.info(f"Exporting {len(products)} products to Excel")

        # Create Excel file
        export_service = ExportService()

        # Prepare filter info for metadata sheet
        filter_info = {}
        if status:
            filter_info["Statut"] = status
        if search:
            filter_info["Recherche"] = search
        if limit:
            filter_info["Limite"] = limit

        file_path = export_service.create_excel_with_filters(
            products,
            filters=filter_info
        )

        # Return file for download
        filename = os.path.basename(file_path)

        return FileResponse(
            path=file_path,
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during Excel export: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.get("/excel/template")
async def download_excel_template():
    """
    Download empty Excel template with all product columns.

    Useful for manual data entry following the correct structure.
    """
    try:
        export_service = ExportService()

        # Create template with empty products list
        file_path = export_service.create_excel_file(
            products=[],
            filename="product_template.xlsx"
        )

        return FileResponse(
            path=file_path,
            filename="product_template.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": 'attachment; filename="product_template.xlsx"'
            }
        )

    except Exception as e:
        logger.error(f"Error creating template: {e}")
        raise HTTPException(status_code=500, detail=f"Template creation failed: {str(e)}")


@router.get("/stats")
async def get_export_stats(
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Get statistics about products available for export.

    Returns counts by status, categories, etc.
    """
    try:
        # Get all products (just count, no data)
        _, total = await storage_service.get_products(skip=0, limit=1)

        # Count by status
        status_counts = {}
        for status in ["raw", "enriched", "validated", "exported"]:
            _, count = await storage_service.get_products_by_status(status, skip=0, limit=1)
            status_counts[status] = count

        # Products with images
        db = await get_database()
        products_with_images = await db.products.count_documents({"images.0": {"$exists": True}})

        return {
            "total_products": total,
            "by_status": status_counts,
            "with_images": products_with_images,
            "without_images": total - products_with_images
        }

    except Exception as e:
        logger.error(f"Error getting export stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")
