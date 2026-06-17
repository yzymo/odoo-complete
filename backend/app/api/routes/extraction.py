"""
API routes for extraction pipeline.
Support for directory processing and long Windows paths.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import os
import logging
from datetime import datetime, timezone
import uuid
from pathlib import Path
from bson import ObjectId
from langdetect import detect, LangDetectException
from app.extractors.pdf_extractor import PDFExtractor
from app.services.openai_service import OpenAIService
from app.services.storage_service import StorageService
from app.services.image_processor import ImageProcessor
from app.services.file_cache_service import FileCacheService
from app.services.extraction_job_service import ExtractionJobService
from app.core.database import get_database
from app.config import get_storage_path

logger = logging.getLogger(__name__)

router = APIRouter()


class DirectoryExtractionRequest(BaseModel):
    source_directory: str
    recursive: bool = True


def get_storage_service(db=Depends(get_database)):
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
        logger.exception(f"Error scanning directory {directory}: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Impossible d'accéder au répertoire : {str(e)}"
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


async def _fetch_products_by_ids(db, product_ids: list) -> list:
    """Return minimal product info (id, name, default_code) from MongoDB by ObjectId list."""
    docs = []
    for pid in product_ids:
        try:
            doc = await db.products.find_one(
                {"_id": ObjectId(pid)},
                {"_id": 1, "name": 1, "default_code": 1},
            )
            if doc:
                docs.append({
                    "id": str(doc["_id"]),
                    "name": doc.get("name"),
                    "default_code": doc.get("default_code"),
                })
            else:
                docs.append({"id": pid, "name": None, "default_code": None})
        except Exception:
            docs.append({"id": pid, "name": None, "default_code": None})
    return docs


def _read_file_bytes(path: str) -> bytes:
    with open(path, "rb") as fh:
        return fh.read()


def _write_file_bytes(path: str, content: bytes) -> None:
    with open(path, "wb") as fh:
        fh.write(content)


def _accumulate_file_result(
    results: dict, pdf_path: str, file_result: dict
) -> None:
    """Update the running results dict with a single file's outcome."""
    status   = file_result["status"]
    products = file_result["products"]
    filename = os.path.basename(pdf_path)
    if status == "cached":
        results["cached_files"].append(pdf_path)
        results["cached_files_count"] += 1
        results["total_products"] += len(products)
        results["products_by_file"][filename] = {
            "count": len(products), "products": products, "from_cache": True,
        }
    elif status == "success":
        results["successful_files"].append(pdf_path)
        results["processed_files"] += 1
        results["total_products"] += len(products)
        results["products_by_file"][filename] = {
            "count": len(products), "products": products, "from_cache": False,
        }
    else:
        results["failed_files"].append({
            "file": pdf_path,
            "error": file_result.get("error", "Unknown"),
        })


async def _associate_images(
    db, job_id: str, directory: str, recursive: bool
) -> tuple[int, int]:
    """Scan *directory* for images, associate them with products in *job_id*.

    Returns (images_processed, images_associated).
    """
    image_processor = ImageProcessor()
    processed_images = image_processor.scan_directory_for_images(
        directory, recursive=recursive
    )
    if not processed_images:
        logger.info("No images found in directory")
        return 0, 0

    logger.info(f"Found {len(processed_images)} images to associate")
    job_products = await db.products.find(
        {"extraction_metadata.extraction_job_id": job_id}
    ).to_list(length=None)

    if not job_products:
        logger.warning("No products found for this job to associate images")
        return len(processed_images), 0

    updated_products = image_processor.associate_images_with_products(
        processed_images, job_products
    )
    images_associated = 0
    for product in updated_products:
        if product.get("images"):
            await db.products.update_one(
                {"_id": product["_id"]},
                {"$set": {
                    "images":      product["images"],
                    "image_256":   product.get("image_256"),
                    "image_512":   product.get("image_512"),
                    "image_1024":  product.get("image_1024"),
                    "image_1920":  product.get("image_1920"),
                    "updated_at":  datetime.now(timezone.utc),
                }},
            )
            images_associated += 1

    logger.info(f"Associated images with {images_associated} products")
    return len(processed_images), images_associated


async def _process_one_pdf(
    pdf_path: str,
    idx: int,
    job_id: str,
    pdf_extractor,
    openai_service,
    file_cache,
    storage_service,
    db,
    content_override: bytes | None = None,
) -> dict:
    """
    Process a single PDF: check cache → extract → store → cache.

    *content_override* lets callers pass raw bytes (e.g. from an UploadFile)
    so the function does not read from disk a second time.

    Returns a dict with:
      status  : "cached" | "success" | "skipped" | "failed"
      products: list[{id, name, default_code}]
      error   : str | None
    """
    filename = os.path.basename(pdf_path)

    # Obtain file bytes — from caller or disk.
    if content_override is not None:
        file_content = content_override
    else:
        try:
            file_content = await asyncio.to_thread(_read_file_bytes, pdf_path)
        except OSError as read_err:
            return {"status": "failed", "products": [], "error": f"Cannot read: {read_err}"}

    # Cache hit — return stored products without touching pdfplumber or OpenAI.
    file_hash = file_cache.compute_hash(file_content)
    cached_entry = await file_cache.get(file_hash)
    if cached_entry:
        products = await _fetch_products_by_ids(db, cached_entry["product_ids"])
        logger.info(f"Cache hit: {filename} → {len(products)} products from MongoDB")
        return {"status": "cached", "products": products, "error": None}

    # PDF text extraction — synchronous lib, run in thread pool.
    extraction_result = await asyncio.to_thread(pdf_extractor.extract, pdf_path)
    if extraction_result.get("status") == "failed":
        return {"status": "failed", "products": [], "error": extraction_result.get("error", "Unknown")}

    extracted_text = extraction_result.get("text", "")
    if not extracted_text or len(extracted_text.strip()) < 50:
        return {"status": "skipped", "products": [], "error": "Text too short or empty (possibly scanned)"}

    # Language gate — French documents only.
    detected_lang = detect_language(extracted_text)
    if detected_lang != "fr":
        return {"status": "skipped", "products": [], "error": f"Not French (detected: {detected_lang})"}

    # OpenAI structuring.
    structured = await openai_service.extract_product_data(extracted_text)
    if structured.get("error"):
        return {"status": "failed", "products": [], "error": f"OpenAI: {structured['error']}"}

    products_data = structured.get("products", [])
    if not products_data:
        return {"status": "skipped", "products": [], "error": "No products found in document"}

    # MongoDB storage.
    stored_products = []
    for product_data in products_data:
        fields = product_data.get("fields", {})
        scores = product_data.get("confidence_scores", {})
        fields["confidence_scores"] = scores
        source = {
            "source_id": f"{job_id}_{idx}",
            "origin_file": filename,
            "origin_file_path": pdf_path,
            "origin_file_type": "pdf",
            "source_type": "pdf",               # used by the products-list source filter
            "extraction_type": "text",
            "extracted_text": extracted_text[:500],
            "confidence_score": sum(scores.values()) / len(scores) if scores else 0,
            "fields_extracted": list(fields.keys()),
            "timestamp": datetime.now(timezone.utc),
        }
        stored = await storage_service.create_product(
            product_data=fields, sources=[source], extraction_job_id=job_id
        )
        stored_products.append({
            "id": str(stored["_id"]),
            "name": stored.get("name"),
            "default_code": stored.get("default_code"),
        })

    # Persist file cache so the next scan is instant.
    await file_cache.put(file_hash, filename, [p["id"] for p in stored_products])

    return {"status": "success", "products": stored_products, "error": None}


@router.post("/extract-file")
async def extract_from_file(
    file: UploadFile = File(...),
    storage_service: StorageService = Depends(get_storage_service),
    db=Depends(get_database),
):
    """
    Extract product data from a single uploaded PDF file.
    Re-uploading the same file returns cached results instantly.
    """
    try:
        # Validate file type
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400,
                detail="Seuls les fichiers PDF sont pris en charge dans le MVP. D'autres formats arriveront en Phase 2."
            )

        # Read once — reuse for hash, disk write, and extraction.
        content = await file.read()

        # Check file hash cache before doing any processing.
        file_cache = FileCacheService(db)
        file_hash = file_cache.compute_hash(content)
        cached = await file_cache.get(file_hash)
        if cached:
            # Fetch the real product documents so the response matches a fresh extraction.
            product_docs = await _fetch_products_by_ids(db, cached["product_ids"])
            return {
                "message": "Extraction terminée (depuis le cache)",
                "filename": file.filename,
                "from_cache": True,
                "products_extracted": len(product_docs),
                "products": product_docs,
            }

        # Save uploaded file
        upload_dir = get_storage_path("uploads")
        file_id = str(uuid.uuid4())
        file_path = os.path.join(upload_dir, f"{file_id}_{file.filename}")

        logger.info(f"Saving uploaded file: {file.filename}")
        await asyncio.to_thread(_write_file_bytes, file_path, content)

        # Extract content from PDF
        logger.info(f"Extracting content from {file.filename}")
        pdf_extractor = PDFExtractor()
        extraction_result = pdf_extractor.extract(file_path)

        if extraction_result.get("status") == "failed":
            raise HTTPException(
                status_code=500,
                detail=f"Échec de l'extraction PDF : {extraction_result.get('error')}"
            )

        # Extract product data using OpenAI
        logger.info("Structuring product data with OpenAI...")
        openai_service = OpenAIService()
        extracted_text = extraction_result.get("text", "")

        if not extracted_text or len(extracted_text.strip()) < 50:
            raise HTTPException(
                status_code=400,
                detail="Le texte extrait est trop court. Le PDF est peut-être vide ou scanné (prise en charge OCR en Phase 2)."
            )

        structured_data = await openai_service.extract_product_data(extracted_text)

        if structured_data.get("error"):
            raise HTTPException(
                status_code=500,
                detail=f"Échec de l'extraction OpenAI : {structured_data['error']}"
            )

        products_data = structured_data.get("products", [])

        if not products_data:
            raise HTTPException(
                status_code=404,
                detail="Aucun produit trouvé dans le document."
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
                "source_type": "pdf",
                "extraction_type": "text",
                "extracted_text": extracted_text[:500],
                "confidence_score": sum(confidence_scores.values()) / len(confidence_scores) if confidence_scores else 0,
                "fields_extracted": list(fields.keys()),
                "timestamp": datetime.now(timezone.utc)
            }

            # Store product
            stored_product = await storage_service.create_product(
                product_data=fields,
                sources=[source],
                extraction_job_id=f"upload_{file_id}"
            )
            stored_products.append(stored_product)

        logger.info(f"Successfully stored {len(stored_products)} products")

        # Persist cache entry so the same file is instant next time.
        product_ids = [str(p["_id"]) for p in stored_products]
        await file_cache.put(file_hash, file.filename, product_ids)

        return {
            "message": "Extraction terminée avec succès",
            "filename": file.filename,
            "from_cache": False,
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
        logger.exception(f"Error during extraction: {e}")
        raise HTTPException(status_code=500, detail=f"Échec de l'extraction : {str(e)}")


async def _run_extraction_job(
    job_id: str,
    pdf_files: list,
    source_directory: str,
    recursive: bool,
    db,
) -> None:
    """Background task: process every PDF in *pdf_files* and update the job document."""
    job_svc = ExtractionJobService(db)
    storage_svc = StorageService(db)
    try:
        await job_svc.set_running(job_id)
        filenames = [os.path.basename(p) for p in pdf_files]
        await job_svc.init_file_statuses(job_id, filenames)
        await job_svc.set_phase(job_id, "processing", f"Traitement de {len(pdf_files)} fichier(s)…")

        pdf_extractor  = PDFExtractor()
        openai_service = OpenAIService()
        file_cache     = FileCacheService(db)
        total_products = 0

        for idx, pdf_path in enumerate(pdf_files, 1):
            filename = os.path.basename(pdf_path)
            await job_svc.update_file_status(job_id, filename, "processing")
            await job_svc.set_phase(
                job_id, "processing",
                f"Fichier {idx}/{len(pdf_files)} : {filename}"
            )
            try:
                result = await _process_one_pdf(
                    pdf_path, idx, job_id,
                    pdf_extractor, openai_service, file_cache, storage_svc, db,
                )
                if result["status"] in ("success", "cached"):
                    await job_svc.file_done(
                        job_id, filename, result["products"],
                        from_cache=(result["status"] == "cached"),
                    )
                    total_products += len(result["products"])
                else:
                    await job_svc.file_failed(job_id, filename, result.get("error", "Unknown"))
            except Exception as exc:
                logger.exception(f"Error processing {pdf_path}: {exc}")
                await job_svc.file_failed(job_id, filename, str(exc))

        await job_svc.set_phase(job_id, "associating", "Association des images…")
        imgs_processed, imgs_associated = await _associate_images(
            db, job_id, source_directory, recursive
        )

        job_doc = await job_svc.get_job(job_id)
        await job_svc.complete(job_id, {
            "total_files":             len(pdf_files),
            "processed_successfully":  job_doc.get("processed_files", 0),
            "cached":                  job_doc.get("cached_files_count", 0),
            "failed":                  job_doc.get("failed_files_count", 0),
            "total_products_extracted": total_products,
            "images_processed":        imgs_processed,
            "images_associated":       imgs_associated,
        })
    except Exception as exc:
        logger.exception(f"Extraction job {job_id} failed: {exc}")
        await job_svc.set_failed(job_id, str(exc))


async def _run_upload_extraction_job(
    job_id: str,
    files_data: list,   # list of {"filename": str, "content": bytes}
    db,
) -> None:
    """Background task for browser-uploaded PDFs."""
    job_svc = ExtractionJobService(db)
    storage_svc = StorageService(db)
    try:
        await job_svc.set_running(job_id)
        filenames = [f["filename"] for f in files_data]
        await job_svc.init_file_statuses(job_id, filenames)
        await job_svc.set_phase(job_id, "processing", f"Traitement de {len(files_data)} fichier(s) uploadé(s)…")

        pdf_extractor  = PDFExtractor()
        openai_service = OpenAIService()
        file_cache     = FileCacheService(db)
        total_products = 0
        upload_dir     = get_storage_path("uploads")

        for idx, file_info in enumerate(files_data, 1):
            filename = file_info["filename"]
            content  = file_info["content"]

            await job_svc.update_file_status(job_id, filename, "processing")
            await job_svc.set_phase(
                job_id, "processing",
                f"Fichier {idx}/{len(files_data)} : {filename}"
            )

            # Write to a temp path so PDFExtractor (path-based) can read it.
            tmp_path = os.path.join(upload_dir, f"{uuid.uuid4().hex}_{filename}")
            try:
                await asyncio.to_thread(_write_file_bytes, tmp_path, content)
                result = await _process_one_pdf(
                    tmp_path, idx, job_id,
                    pdf_extractor, openai_service, file_cache, storage_svc, db,
                    content_override=content,
                )
                if result["status"] in ("success", "cached"):
                    await job_svc.file_done(
                        job_id, filename, result["products"],
                        from_cache=(result["status"] == "cached"),
                    )
                    total_products += len(result["products"])
                else:
                    await job_svc.file_failed(job_id, filename, result.get("error", "Unknown"))
            except Exception as exc:
                logger.exception(f"Error processing upload {filename}: {exc}")
                await job_svc.file_failed(job_id, filename, str(exc))
            finally:
                try:
                    await asyncio.to_thread(os.unlink, tmp_path)
                except Exception:
                    pass

        job_doc = await job_svc.get_job(job_id)
        await job_svc.complete(job_id, {
            "total_files":             len(files_data),
            "processed_successfully":  job_doc.get("processed_files", 0),
            "cached":                  job_doc.get("cached_files_count", 0),
            "failed":                  job_doc.get("failed_files_count", 0),
            "total_products_extracted": total_products,
        })
    except Exception as exc:
        logger.exception(f"Upload extraction job {job_id} failed: {exc}")
        await job_svc.set_failed(job_id, str(exc))


@router.post("/extract-directory")
async def extract_from_directory(
    request: DirectoryExtractionRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_database),
):
    """
    Start an async extraction job for all PDFs in a server-side directory.
    Returns {job_id} immediately; poll GET /extraction/jobs/{job_id} for progress.
    """
    if not os.path.exists(request.source_directory):
        raise HTTPException(status_code=404, detail=f"Répertoire introuvable : {request.source_directory}")
    if not os.path.isdir(request.source_directory):
        raise HTTPException(status_code=400, detail=f"Ce n'est pas un répertoire : {request.source_directory}")

    pdf_files = scan_directory_for_pdfs(request.source_directory, recursive=request.recursive)
    if not pdf_files:
        raise HTTPException(status_code=404, detail="Aucun fichier PDF trouvé dans le répertoire")

    job_svc = ExtractionJobService(db)
    job_id  = await job_svc.create_job(source=request.source_directory)
    background_tasks.add_task(
        _run_extraction_job, job_id, pdf_files,
        request.source_directory, request.recursive, db,
    )

    return {
        "job_id": job_id,
        "status": "pending",
        "total_files": len(pdf_files),
        "message": f"Tâche d'extraction démarrée pour {len(pdf_files)} fichier(s)",
    }


@router.post("/upload-files")
async def upload_files(
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db=Depends(get_database),
):
    """
    Upload multiple PDFs from the browser and start an async extraction job.
    Returns {job_id} immediately; poll GET /extraction/jobs/{job_id} for progress.
    """
    files_data = []
    for f in files:
        if not f.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"Seuls les fichiers PDF sont pris en charge : {f.filename}")
        content = await f.read()
        files_data.append({"filename": f.filename, "content": content})

    if not files_data:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni")

    job_svc = ExtractionJobService(db)
    job_id  = await job_svc.create_job(source=f"{len(files_data)} uploaded file(s)")
    background_tasks.add_task(_run_upload_extraction_job, job_id, files_data, db)

    return {
        "job_id": job_id,
        "status": "pending",
        "total_files": len(files_data),
        "message": f"Tâche d'extraction par import démarrée pour {len(files_data)} fichier(s)",
    }


@router.get("/jobs/{job_id}")
async def get_extraction_job(job_id: str, db=Depends(get_database)):
    """Poll an extraction job for its current status and per-file progress."""
    job_svc = ExtractionJobService(db)
    job = await job_svc.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Tâche introuvable : {job_id}")

    for field in ("created_at", "started_at", "finished_at", "updated_at"):
        if job.get(field) is not None:
            job[field] = job[field].isoformat()

    return job
