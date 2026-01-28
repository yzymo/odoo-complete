"""
API routes for serving product images.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os
import logging
from app.config import get_storage_path

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/images/{size}/{filename}")
async def get_image(size: str, filename: str):
    """
    Serve product image at specified size.

    Args:
        size: Image size (256, 512, 1024, 1920)
        filename: Image filename

    Returns:
        Image file
    """
    # Validate size
    valid_sizes = ["256", "512", "1024", "1920"]
    if size not in valid_sizes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid size. Must be one of: {', '.join(valid_sizes)}"
        )

    # Build file path
    base_dir = get_storage_path("extracted_images")
    file_path = os.path.join(base_dir, size, filename)

    # Security: ensure path is within images directory
    if not os.path.abspath(file_path).startswith(os.path.abspath(base_dir)):
        raise HTTPException(status_code=403, detail="Invalid file path")

    # Check if file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Image not found")

    # Return image
    return FileResponse(
        file_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000"}  # Cache for 1 year
    )
