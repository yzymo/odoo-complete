"""
PDF text and image extraction using pdfplumber and PyPDF2.
"""

import logging
from typing import Dict, List, Any, Optional
import pdfplumber
import PyPDF2
from PIL import Image
import io
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class PDFExtractor:
    """Extract text and images from PDF files."""

    def __init__(self):
        self.name = "PDFExtractor"

    def extract(self, file_path: str) -> Dict[str, Any]:
        """
        Extract text and images from a PDF file.

        Args:
            file_path: Path to the PDF file

        Returns:
            Dict containing extracted text, images, and metadata
        """
        try:
            logger.info(f"Extracting content from PDF: {file_path}")

            # Try pdfplumber first (better for structured content)
            result = self._extract_with_pdfplumber(file_path)

            # If pdfplumber fails or returns minimal text, try PyPDF2
            if not result.get("text") or len(result["text"].strip()) < 100:
                logger.warning("pdfplumber extraction minimal, trying PyPDF2...")
                pypdf_result = self._extract_with_pypdf2(file_path)
                if len(pypdf_result.get("text", "")) > len(result.get("text", "")):
                    result["text"] = pypdf_result["text"]

            logger.info(
                f"Extracted {len(result.get('text', ''))} characters "
                f"and {len(result.get('images', []))} images"
            )

            return result

        except Exception as e:
            logger.error(f"Error extracting PDF {file_path}: {e}")
            return {
                "text": "",
                "images": [],
                "page_count": 0,
                "error": str(e),
                "status": "failed",
            }

    def _extract_with_pdfplumber(self, file_path: str) -> Dict[str, Any]:
        """Extract using pdfplumber (better for tables and layout)."""
        result = {
            "text": "",
            "images": [],
            "page_count": 0,
            "has_tables": False,
            "status": "success",
        }

        try:
            with pdfplumber.open(file_path) as pdf:
                result["page_count"] = len(pdf.pages)

                for page_num, page in enumerate(pdf.pages, start=1):
                    # Extract text
                    page_text = page.extract_text()
                    if page_text:
                        result["text"] += f"\n\n--- Page {page_num} ---\n{page_text}"

                    # Check for tables
                    tables = page.extract_tables()
                    if tables:
                        result["has_tables"] = True
                        for table in tables:
                            # Convert table to text representation
                            table_text = self._table_to_text(table)
                            result["text"] += f"\n\nTable on page {page_num}:\n{table_text}\n"

                    # Extract images (basic metadata)
                    if hasattr(page, 'images'):
                        for img_num, img in enumerate(page.images):
                            result["images"].append({
                                "page": page_num,
                                "image_num": img_num,
                                "x0": img.get("x0"),
                                "y0": img.get("y0"),
                                "width": img.get("width"),
                                "height": img.get("height"),
                            })

        except Exception as e:
            logger.error(f"pdfplumber extraction error: {e}")
            result["error"] = str(e)
            result["status"] = "failed"

        return result

    def _extract_with_pypdf2(self, file_path: str) -> Dict[str, Any]:
        """Extract using PyPDF2 (fallback method)."""
        result = {
            "text": "",
            "page_count": 0,
            "status": "success",
        }

        try:
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                result["page_count"] = len(reader.pages)

                for page_num, page in enumerate(reader.pages, start=1):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            result["text"] += f"\n\n--- Page {page_num} ---\n{page_text}"
                    except Exception as e:
                        logger.warning(f"Error extracting page {page_num}: {e}")
                        continue

        except Exception as e:
            logger.error(f"PyPDF2 extraction error: {e}")
            result["error"] = str(e)
            result["status"] = "failed"

        return result

    def _table_to_text(self, table: List[List[Any]]) -> str:
        """Convert table data to text format."""
        if not table:
            return ""

        lines = []
        for row in table:
            # Filter out None values and convert to strings
            clean_row = [str(cell) if cell is not None else "" for cell in row]
            lines.append(" | ".join(clean_row))

        return "\n".join(lines)

    def is_scanned_pdf(self, file_path: str) -> bool:
        """
        Determine if PDF is scanned (image-based) or text-based.

        Returns:
            True if scanned (requires OCR), False if text-based
        """
        try:
            with pdfplumber.open(file_path) as pdf:
                if not pdf.pages:
                    return False

                # Sample first 3 pages
                sample_pages = pdf.pages[:min(3, len(pdf.pages))]

                text_chars = 0
                for page in sample_pages:
                    text = page.extract_text()
                    if text:
                        text_chars += len(text.strip())

                # If we extracted less than 50 characters from sample pages,
                # it's likely a scanned PDF
                if text_chars < 50:
                    logger.info(f"PDF appears to be scanned (minimal text: {text_chars} chars)")
                    return True

                return False

        except Exception as e:
            logger.error(f"Error checking if PDF is scanned: {e}")
            return False  # Assume text-based if we can't determine

    def extract_images_to_files(
        self,
        file_path: str,
        output_dir: str
    ) -> List[str]:
        """
        Extract images from PDF and save to files.

        Args:
            file_path: Path to PDF
            output_dir: Directory to save extracted images

        Returns:
            List of paths to saved image files
        """
        saved_images = []
        os.makedirs(output_dir, exist_ok=True)

        try:
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)

                for page_num, page in enumerate(reader.pages, start=1):
                    if '/XObject' in page['/Resources']:
                        xObject = page['/Resources']['/XObject'].get_object()

                        for obj in xObject:
                            if xObject[obj]['/Subtype'] == '/Image':
                                try:
                                    size = (xObject[obj]['/Width'], xObject[obj]['/Height'])
                                    data = xObject[obj].get_data()

                                    # Create image
                                    if xObject[obj]['/ColorSpace'] == '/DeviceRGB':
                                        img = Image.frombytes('RGB', size, data)
                                    else:
                                        img = Image.frombytes('P', size, data)

                                    # Save image
                                    filename = f"page_{page_num}_img_{obj[1:]}.png"
                                    filepath = os.path.join(output_dir, filename)
                                    img.save(filepath)
                                    saved_images.append(filepath)

                                except Exception as e:
                                    logger.warning(f"Could not extract image from page {page_num}: {e}")

        except Exception as e:
            logger.error(f"Error extracting images from PDF: {e}")

        return saved_images
