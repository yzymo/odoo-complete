"""
Image processing service for product images.
Handles image extraction, resizing to multiple variants, and product association.
"""

import logging
import os
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from PIL import Image
import re

from app.config import get_storage_path

logger = logging.getLogger(__name__)


class ImageProcessor:
    """Service for processing and associating product images."""

    # Image sizes for variants
    SIZES = {
        "size_256": 256,
        "size_512": 512,
        "size_1024": 1024,
        "size_1920": 1920,
    }

    # Supported image formats
    SUPPORTED_FORMATS = {".jpg", ".jpeg", ".png", ".webp"}

    def __init__(self):
        """Initialize image processor with storage directories."""
        self.base_dir = get_storage_path("extracted_images")

        # Create size subdirectories
        for size_key in self.SIZES.keys():
            size = self.SIZES[size_key]
            os.makedirs(os.path.join(self.base_dir, str(size)), exist_ok=True)

    def extract_product_reference(self, filename: str) -> Optional[str]:
        """
        Extract product reference from image filename.

        Tries to extract:
        - Code at start: "PROD001_photo.jpg" -> "PROD001"
        - Code in middle: "image_PROD001_v2.jpg" -> "PROD001"
        - EAN code: "3700123456789.jpg" -> "3700123456789"

        Args:
            filename: Image filename

        Returns:
            Product reference or None
        """
        # Remove extension
        name = Path(filename).stem

        # Pattern 1: Code at start (alphanumeric + dash/underscore)
        match = re.match(r'^([A-Z0-9\-_]{3,20})', name, re.IGNORECASE)
        if match:
            return match.group(1).upper()

        # Pattern 2: EAN code (13 digits)
        match = re.search(r'(\d{13})', name)
        if match:
            return match.group(1)

        # Pattern 3: Any alphanumeric code between separators
        match = re.search(r'[_\-]([A-Z0-9]{3,20})[_\-]', name, re.IGNORECASE)
        if match:
            return match.group(1).upper()

        logger.warning(f"Could not extract product reference from: {filename}")
        return None

    def generate_variants(
        self,
        source_path: str,
        product_code: str
    ) -> Dict[str, str]:
        """
        Generate image variants at different sizes.

        Args:
            source_path: Path to source image
            product_code: Product code for naming

        Returns:
            Dict mapping size keys to relative paths
        """
        try:
            with Image.open(source_path) as img:
                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                paths = {}

                for size_key, size in self.SIZES.items():
                    # Calculate dimensions maintaining aspect ratio
                    width, height = img.size
                    if width > height:
                        new_width = size
                        new_height = int((height / width) * size)
                    else:
                        new_height = size
                        new_width = int((width / height) * size)

                    # Resize with high-quality algorithm
                    resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

                    # Save to appropriate directory
                    filename = f"{product_code}_{size}.jpg"
                    output_dir = os.path.join(self.base_dir, str(size))
                    output_path = os.path.join(output_dir, filename)

                    resized.save(output_path, "JPEG", quality=85, optimize=True)

                    # Store relative path
                    relative_path = f"extracted_images/{size}/{filename}"
                    paths[size_key] = relative_path

                    logger.debug(f"Generated {size}px variant: {relative_path}")

                return paths

        except Exception as e:
            logger.error(f"Error generating variants for {source_path}: {e}")
            return {}

    def process_image_file(
        self,
        image_path: str,
        source_info: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Process a single image file and prepare for product association.

        Args:
            image_path: Path to image file
            source_info: Optional metadata about source file

        Returns:
            Image data dict or None if processing failed
        """
        try:
            filename = os.path.basename(image_path)

            # Extract product reference from filename
            product_ref = self.extract_product_reference(filename)
            if not product_ref:
                logger.warning(f"Skipping image - no product reference: {filename}")
                return None

            # Generate unique image ID
            image_id = f"img_{uuid.uuid4().hex[:12]}"

            # Generate variants
            variant_paths = self.generate_variants(image_path, product_ref)
            if not variant_paths:
                logger.error(f"Failed to generate variants for: {filename}")
                return None

            # Build image data
            image_data = {
                "image_id": image_id,
                "is_main": False,  # Will be determined when associating
                "original_filename": filename,
                "paths": variant_paths,
                "product_reference": product_ref,
            }

            # Add source info if provided
            if source_info:
                image_data["extracted_from"] = source_info

            logger.info(f"Processed image: {filename} -> Product ref: {product_ref}")
            return image_data

        except Exception as e:
            logger.error(f"Error processing image {image_path}: {e}")
            return None

    def scan_directory_for_images(
        self,
        directory: str,
        recursive: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Scan directory for image files and process them.

        Args:
            directory: Directory to scan
            recursive: Whether to scan recursively

        Returns:
            List of processed image data dicts
        """
        images = []

        try:
            base_path = Path(directory)

            if recursive:
                pattern = "**/*"
            else:
                pattern = "*"

            for file_path in base_path.glob(pattern):
                if file_path.is_file() and file_path.suffix.lower() in self.SUPPORTED_FORMATS:
                    source_info = {
                        "file_path": str(file_path),
                        "confidence": 1.0,
                    }

                    image_data = self.process_image_file(str(file_path), source_info)
                    if image_data:
                        images.append(image_data)

            logger.info(f"Found and processed {len(images)} images in {directory}")
            return images

        except Exception as e:
            logger.error(f"Error scanning directory {directory}: {e}")
            return []

    def associate_images_with_products(
        self,
        images: List[Dict[str, Any]],
        products: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Associate processed images with product data.

        Matches based on:
        1. product_reference == default_code
        2. product_reference == barcode
        3. product_reference == Code_EAN

        Args:
            images: List of processed image data
            products: List of product data dicts

        Returns:
            Updated products list with images attached
        """
        # Create lookup dict for images by product reference
        images_by_ref = {}
        for img in images:
            ref = img.get("product_reference")
            if ref:
                if ref not in images_by_ref:
                    images_by_ref[ref] = []
                images_by_ref[ref].append(img)

        # Associate images with products
        for product in products:
            # Try matching on different fields
            product_refs = [
                product.get("default_code"),
                product.get("barcode"),
                product.get("Code_EAN"),
            ]

            matched_images = []
            for ref in product_refs:
                if ref and ref in images_by_ref:
                    matched_images.extend(images_by_ref[ref])
                    # Remove from lookup to avoid duplicates
                    del images_by_ref[ref]
                    break

            if matched_images:
                # Mark first image as main
                matched_images[0]["is_main"] = True

                # Remove product_reference from final data
                for img in matched_images:
                    img.pop("product_reference", None)

                # Add to product
                product["images"] = matched_images

                # Set individual image fields (use main image)
                main_image_paths = matched_images[0]["paths"]
                product["image_256"] = main_image_paths.get("size_256")
                product["image_512"] = main_image_paths.get("size_512")
                product["image_1024"] = main_image_paths.get("size_1024")
                product["image_1920"] = main_image_paths.get("size_1920")

                logger.info(
                    f"Associated {len(matched_images)} image(s) with product: "
                    f"{product.get('default_code') or product.get('name', 'unknown')}"
                )

        # Log unmatched images
        if images_by_ref:
            logger.warning(
                f"{len(images_by_ref)} image(s) could not be matched to products: "
                f"{list(images_by_ref.keys())}"
            )

        return products
