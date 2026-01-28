"""
API routes for extraction pipeline.
Support for directory processing and long Windows paths.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
import os
import logging
from datetime import datetime
import uuid
from pathlib import Path
from langdetect import detect, LangDetectException
from app.extractors.pdf_extractor import PDFExtractor
from app.services.openai_service import OpenAIService
from app.services.storage_service import StorageService
from app.services.image_processor import ImageProcessor
from app.core.database import get_database
from app.config import get_storage_path

logger = logging.getLogger(__name__)

router = APIRouter()


class DirectoryExtractionRequest(BaseModel):
    source_directory: str
    recursive: bool = True


async def get_storage_service(db=Depends(get_database)):
    """Dependency to get storage service."""
    return StorageService(db)


def normalize_windows_path(path: str) -> str:
    """
    Normalize Windows path and handle long paths.
    Adds \\?\ prefix for paths longer than 260 chars on Windows.
    """
    # Convert to absolute path
    abs_path = os.path.abspath(path)

    # On Windows, use long path prefix if needed
    if os.name == 'nt' and len(abs_path) > 260:
        if not abs_path.startswith('\\\\?\\'):
            abs_path = '\\\\?\\' + abs_path

    return abs_path


def scan_directory_for_pdfs(directory: str, recursive: bool = True) -> List[str]:
    """
    Scan directory for PDF files.
    Handles long Windows paths.
    """
    pdf_files = []

    try:
        if recursive:
            # Use pathlib for recursive scanning (handles long paths)
            base_path = Path(directory)
            for pdf_path in base_path.rglob('*.pdf'):
                pdf_files.append(str(pdf_path))
        else:
            # Non-recursive: only immediate directory
            for filename in os.listdir(directory):
                if filename.lower().endswith('.pdf'):
                    full_path = os.path.join(directory, filename)
                    pdf_files.append(full_path)

        logger.info(f"Found {len(pdf_files)} PDF files in {directory}")
        return pdf_files

    except Exception as e:
        logger.error(f"Error scanning directory {directory}: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Cannot access directory: {str(e)}"
        )


def detect_language(text: str) -> str:
    """
    Detect the language of the text.
    Returns ISO 639-1 language code (e.g., 'fr', 'en', 'es').
    """
    try:
        # Take a sample of text for detection (first 1000 chars)
        sample = text[:1000] if len(text) > 1000 else text

        if not sample.strip():
            return "unknown"

        lang = detect(sample)
        return lang
    except LangDetectException as e:
        logger.warning(f"Language detection failed: {e}")
        return "unknown"


@router.post("/extract-file")
async def extract_from_file(
    file: UploadFile = File(...),
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Extract product data from a single uploaded PDF file (MVP version).

    This is a simplified synchronous extraction for Phase 1.
    For Phase 2, full directory processing with background tasks will be added.
    """
    try:
        # Validate file type
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400,
                detail="Only PDF files are supported in MVP. Other formats coming in Phase 2."
            )

        # Save uploaded file
        upload_dir = get_storage_path("uploads")
        file_id = str(uuid.uuid4())
        file_path = os.path.join(upload_dir, f"{file_id}_{file.filename}")

        logger.info(f"Saving uploaded file: {file.filename}")
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Extract content from PDF
        logger.info(f"Extracting content from {file.filename}")
        pdf_extractor = PDFExtractor()
        extraction_result = pdf_extractor.extract(file_path)

        if extraction_result.get("status") == "failed":
            raise HTTPException(
                status_code=500,
                detail=f"PDF extraction failed: {extraction_result.get('error')}"
            )

        # Extract product data using OpenAI
        logger.info("Structuring product data with OpenAI...")
        openai_service = OpenAIService()
        extracted_text = extraction_result.get("text", "")

        if not extracted_text or len(extracted_text.strip()) < 50:
            raise HTTPException(
                status_code=400,
                detail="Extracted text is too short. PDF may be empty or scanned (OCR support in Phase 2)."
            )

        structured_data = await openai_service.extract_product_data(extracted_text)

        if structured_data.get("error"):
            raise HTTPException(
                status_code=500,
                detail=f"OpenAI extraction failed: {structured_data['error']}"
            )

        products_data = structured_data.get("products", [])

        if not products_data:
            raise HTTPException(
                status_code=404,
                detail="No products found in the document."
            )

        # Store products in MongoDB
        logger.info(f"Storing {len(products_data)} products in MongoDB...")
        stored_products = []

        for product_data in products_data:
            fields = product_data.get("fields", {})
            confidence_scores = product_data.get("confidence_scores", {})

            # Add confidence scores to fields
            fields["confidence_scores"] = confidence_scores

            # Create source metadata
            source = {
                "source_id": file_id,
                "origin_file": file.filename,
                "origin_file_type": "pdf",
                "extraction_type": "text",
                "extracted_text": extracted_text[:500],  # First 500 chars
                "confidence_score": sum(confidence_scores.values()) / len(confidence_scores) if confidence_scores else 0,
                "fields_extracted": list(fields.keys()),
                "timestamp": datetime.utcnow()
            }

            # Store product
            stored_product = await storage_service.create_product(
                product_data=fields,
                sources=[source],
                extraction_job_id=f"upload_{file_id}"
            )
            stored_products.append(stored_product)

        logger.info(f"Successfully stored {len(stored_products)} products")

        return {
            "message": "Extraction completed successfully",
            "filename": file.filename,
            "products_extracted": len(stored_products),
            "products": [
                {
                    "id": str(p["_id"]),
                    "name": p.get("name"),
                    "default_code": p.get("default_code")
                }
                for p in stored_products
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during extraction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/extract-directory")
async def extract_from_directory(
    request: DirectoryExtractionRequest,
    storage_service: StorageService = Depends(get_storage_service)
):
    """
    Extract products from all PDF files in a directory.

    Supports:
    - Recursive directory scanning
    - Long Windows paths (>260 chars)
    - Multiple PDFs processing
    - Progress tracking
    """
    try:
        # Validate directory exists
        if not os.path.exists(request.source_directory):
            raise HTTPException(
                status_code=404,
                detail=f"Directory not found: {request.source_directory}"
            )

        if not os.path.isdir(request.source_directory):
            raise HTTPException(
                status_code=400,
                detail=f"Path is not a directory: {request.source_directory}"
            )

        # Scan for PDFs
        logger.info(f"Scanning directory: {request.source_directory}")
        pdf_files = scan_directory_for_pdfs(
            request.source_directory,
            recursive=request.recursive
        )

        if not pdf_files:
            raise HTTPException(
                status_code=404,
                detail="No PDF files found in the directory"
            )

        # Create job ID for tracking
        job_id = f"dir_extract_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

        # Initialize extraction services
        pdf_extractor = PDFExtractor()
        openai_service = OpenAIService()

        # Track results
        results = {
            "job_id": job_id,
            "source_directory": request.source_directory,
            "total_files": len(pdf_files),
            "processed_files": 0,
            "total_products": 0,
            "successful_files": [],
            "failed_files": [],
            "products_by_file": {}
        }

        # Process each PDF
        for idx, pdf_path in enumerate(pdf_files, 1):
            try:
                logger.info(f"Processing file {idx}/{len(pdf_files)}: {pdf_path}")

                # Extract content from PDF
                extraction_result = pdf_extractor.extract(pdf_path)

                if extraction_result.get("status") == "failed":
                    results["failed_files"].append({
                        "file": pdf_path,
                        "error": extraction_result.get("error", "Unknown error")
                    })
                    continue

                # Get extracted text
                extracted_text = extraction_result.get("text", "")

                if not extracted_text or len(extracted_text.strip()) < 50:
                    results["failed_files"].append({
                        "file": pdf_path,
                        "error": "Text too short or empty (possibly scanned PDF - OCR needed)"
                    })
                    continue

                # Detect language - only process French documents
                detected_lang = detect_language(extracted_text)
                if detected_lang != "fr":
                    logger.info(f"Skipping non-French document: {pdf_path} (detected: {detected_lang})")
                    results["failed_files"].append({
                        "file": pdf_path,
                        "error": f"Document not in French (detected language: {detected_lang})"
                    })
                    continue

                # Structure product data with OpenAI
                structured_data = await openai_service.extract_product_data(extracted_text)

                if structured_data.get("error"):
                    results["failed_files"].append({
                        "file": pdf_path,
                        "error": f"OpenAI extraction failed: {structured_data['error']}"
                    })
                    continue

                products_data = structured_data.get("products", [])

                if not products_data:
                    results["failed_files"].append({
                        "file": pdf_path,
                        "error": "No products found in document"
                    })
                    continue

                # Store products in MongoDB
                stored_products = []
                for product_data in products_data:
                    fields = product_data.get("fields", {})
                    confidence_scores = product_data.get("confidence_scores", {})
                    fields["confidence_scores"] = confidence_scores

                    # Create source metadata
                    source = {
                        "source_id": f"{job_id}_{idx}",
                        "origin_file": os.path.basename(pdf_path),
                        "origin_file_path": pdf_path,
                        "origin_file_type": "pdf",
                        "extraction_type": "text",
                        "extracted_text": extracted_text[:500],
                        "confidence_score": sum(confidence_scores.values()) / len(confidence_scores) if confidence_scores else 0,
                        "fields_extracted": list(fields.keys()),
                        "timestamp": datetime.utcnow()
                    }

                    # Store product
                    stored_product = await storage_service.create_product(
                        product_data=fields,
                        sources=[source],
                        extraction_job_id=job_id
                    )
                    stored_products.append({
                        "id": str(stored_product["_id"]),
                        "name": stored_product.get("name"),
                        "default_code": stored_product.get("default_code")
                    })

                results["successful_files"].append(pdf_path)
                results["processed_files"] += 1
                results["total_products"] += len(stored_products)
                results["products_by_file"][os.path.basename(pdf_path)] = {
                    "count": len(stored_products),
                    "products": stored_products
                }

                logger.info(f"Successfully processed {pdf_path}: {len(stored_products)} products")

            except Exception as e:
                logger.error(f"Error processing {pdf_path}: {e}", exc_info=True)
                results["failed_files"].append({
                    "file": pdf_path,
                    "error": str(e)
                })

        # Process images and associate with products
        logger.info("Scanning directory for product images...")
        image_processor = ImageProcessor()
        processed_images = image_processor.scan_directory_for_images(
            request.source_directory,
            recursive=request.recursive
        )

        if processed_images:
            logger.info(f"Found {len(processed_images)} images to associate")

            # Fetch all products from this job to associate images
            db = await get_database()
            job_products = await db.products.find(
                {"extraction_metadata.extraction_job_id": job_id}
            ).to_list(length=None)

            if job_products:
                # Associate images with products
                updated_products = image_processor.associate_images_with_products(
                    processed_images,
                    job_products
                )

                # Update products in database with images
                images_associated = 0
                for product in updated_products:
                    if product.get("images"):
                        await db.products.update_one(
                            {"_id": product["_id"]},
                            {
                                "$set": {
                                    "images": product["images"],
                                    "image_256": product.get("image_256"),
                                    "image_512": product.get("image_512"),
                                    "image_1024": product.get("image_1024"),
                                    "image_1920": product.get("image_1920"),
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        images_associated += 1

                logger.info(f"Associated images with {images_associated} products")
                results["images_processed"] = len(processed_images)
                results["images_associated"] = images_associated
            else:
                logger.warning("No products found for this job to associate images")
        else:
            logger.info("No images found in directory")

        # Return summary
        return {
            "message": "Directory extraction completed",
            "job_id": results["job_id"],
            "summary": {
                "total_files": results["total_files"],
                "processed_successfully": len(results["successful_files"]),
                "failed": len(results["failed_files"]),
                "total_products_extracted": results["total_products"],
                "images_processed": results.get("images_processed", 0),
                "images_associated": results.get("images_associated", 0)
            },
            "successful_files": results["successful_files"],
            "failed_files": results["failed_files"],
            "products_by_file": results["products_by_file"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during directory extraction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Directory extraction failed: {str(e)}")


@router.get("/jobs")
async def get_extraction_jobs():
    """Get list of extraction jobs (placeholder for Phase 2)."""
    return {
        "message": "Full job tracking will be implemented in Phase 2",
        "jobs": []
    }
