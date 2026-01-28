"""
OpenAI API service for product data extraction.
Handles GPT-based structured data extraction from text.
"""

import logging
import json
from typing import Dict, Any, List, Optional
from openai import AsyncOpenAI
from app.config import settings
import asyncio

logger = logging.getLogger(__name__)


# Prompt templates for product extraction
PRODUCT_EXTRACTION_PROMPT = """Tu es un expert en extraction de données produits. Extrait les informations structurées du texte suivant.

Texte à analyser :
{extracted_text}

Extrait les champs suivants (retourner null si l'information n'est pas présente - NE PAS INVENTER DE DONNÉES) :

IDENTIFIANTS:
- default_code (référence interne / SKU / code article)
- barcode (code-barres)
- Code_EAN (code EAN européen)

INFORMATIONS PRODUIT:
- name (nom du produit)
- type (type: "product" pour stockable, "service" pour service, "consu" pour consommable)
- active (boolean - produit actif, par défaut true)
- is_published (boolean - publié sur e-commerce, par défaut false)

CLASSIFICATION:
- categ_id (catégorie produit)
- country_of_origin (pays d'origine, code ISO)

FABRICANT:
- constructeur (fabricant / marque)
- refConstructeur (référence fabricant)

DESCRIPTIONS:
- description_courte (description courte du produit)
- description_ecommerce (description détaillée pour e-commerce, format HTML possible)
- features_description (caractéristiques techniques détaillées)

DIMENSIONS ET POIDS:
- length (longueur en mm)
- width (largeur en mm)
- height (hauteur en mm)
- weight (poids en kg)

LOGISTIQUE:
- hs_code (code douanier / nomenclature combinée)
- contient_du_lithium (boolean - contient des batteries lithium)

PRIX ET TAXES:
- lst_price (prix de vente catalogue)
- taxes_id (liste des codes de taxes applicables, ex: ["TVA 20%"])

DOCUMENTS:
- fiche_constructeur_nom (nom du fichier de la fiche constructeur, si mentionné)
- fiche_technique_nom (nom du fichier de la fiche technique, si mentionné)

Pour chaque champ extrait, fournis un score de confiance entre 0 et 1 indiquant ta certitude.

Retourne UNIQUEMENT du JSON valide dans ce format exact :
{{
  "products": [
    {{
      "fields": {{
        "default_code": "valeur ou null",
        "name": "valeur ou null",
        "type": "product",
        "active": true,
        "Code_EAN": "valeur ou null",
        ...
      }},
      "confidence_scores": {{
        "default_code": 0.95,
        "name": 0.90,
        ...
      }}
    }}
  ],
  "is_multi_product": false
}}

IMPORTANT :
- Retourne null si une information n'est pas trouvée
- Ne jamais inventer de données
- Pour "type", utilise "product" par défaut si non spécifié
- Pour "active", utilise true par défaut
- Pour "is_published", utilise false par défaut
- Les taxes_id doivent être une liste (array) même si un seul élément"""


class OpenAIService:
    """Service for interacting with OpenAI API."""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.default_model = "gpt-3.5-turbo"  # MVP uses GPT-3.5 for cost efficiency

    async def extract_product_data(
        self,
        extracted_text: str,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract structured product data from raw text using GPT.

        Args:
            extracted_text: Raw text extracted from document
            model: OpenAI model to use (defaults to gpt-3.5-turbo)

        Returns:
            Dict containing extracted product data and confidence scores
        """
        if not extracted_text or len(extracted_text.strip()) < 10:
            logger.warning("Extracted text is too short for processing")
            return {
                "products": [],
                "is_multi_product": False,
                "error": "Text too short"
            }

        # Handle very long text with intelligent chunking
        max_chars = 20000  # ~5000 tokens (safe for GPT-3.5-turbo 16k limit)

        if len(extracted_text) > max_chars:
            logger.info(f"Text is long ({len(extracted_text)} chars), using chunking strategy")
            return await self._extract_with_chunking(extracted_text, model)

        # For reasonable length text, process normally
        return await self._call_openai(extracted_text, model)

    async def _call_openai(
        self,
        text: str,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Internal method to call OpenAI API without length checking.

        Args:
            text: Text to process (should be pre-validated for length)
            model: OpenAI model to use

        Returns:
            Extracted product data
        """
        try:
            # Prepare prompt
            prompt = PRODUCT_EXTRACTION_PROMPT.format(extracted_text=text)

            # Call OpenAI API
            model_to_use = model or self.default_model
            logger.info(f"Calling OpenAI API with model {model_to_use} ({len(text)} chars)")

            response = await self.client.chat.completions.create(
                model=model_to_use,
                messages=[
                    {
                        "role": "system",
                        "content": "Tu es un expert en extraction de données produits. "
                                   "Tu retournes UNIQUEMENT du JSON valide, sans aucun texte supplémentaire."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0,  # Deterministic output
                max_tokens=2000,
                response_format={"type": "json_object"}  # Force JSON response
            )

            # Parse response
            content = response.choices[0].message.content
            result = json.loads(content)

            logger.info(
                f"Successfully extracted {len(result.get('products', []))} products "
                f"(tokens used: {response.usage.total_tokens})"
            )

            return result

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI JSON response: {e}")
            return {
                "products": [],
                "is_multi_product": False,
                "error": "JSON parsing failed"
            }
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}")
            return {
                "products": [],
                "is_multi_product": False,
                "error": str(e)
            }

    async def _extract_with_chunking(
        self,
        text: str,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract product data from very long text by splitting into chunks.

        Args:
            text: Long text to process
            model: OpenAI model to use

        Returns:
            Merged results from all chunks
        """
        chunk_size = 18000  # Safe size per chunk (~4500 tokens)
        overlap = 500  # Overlap between chunks to avoid cutting product descriptions

        chunks = []
        start = 0

        # Split text into overlapping chunks
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]

            # Try to find a good breaking point (paragraph or sentence)
            if end < len(text):
                # Look for paragraph break
                last_paragraph = chunk.rfind('\n\n')
                if last_paragraph > chunk_size * 0.7:  # At least 70% of chunk
                    end = start + last_paragraph
                else:
                    # Look for sentence break
                    last_sentence = max(chunk.rfind('. '), chunk.rfind('.\n'))
                    if last_sentence > chunk_size * 0.7:
                        end = start + last_sentence + 1

            chunks.append(text[start:end])
            start = end - overlap  # Overlap to avoid cutting products

        logger.info(f"Split text into {len(chunks)} chunks for processing")

        # Process each chunk
        all_products = []
        total_tokens = 0

        for i, chunk in enumerate(chunks):
            logger.info(f"Processing chunk {i+1}/{len(chunks)} ({len(chunk)} chars)")

            try:
                # Use internal method to avoid recursion
                result = await self._call_openai(chunk, model)

                if result.get("products"):
                    all_products.extend(result["products"])
                    logger.info(f"Chunk {i+1} extracted {len(result['products'])} products")

                # Small delay to avoid rate limiting
                if i < len(chunks) - 1:
                    await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"Error processing chunk {i+1}: {e}")
                continue

        # Merge results and deduplicate if needed
        logger.info(f"Total products extracted from all chunks: {len(all_products)}")

        return {
            "products": all_products,
            "is_multi_product": len(all_products) > 1,
            "chunks_processed": len(chunks)
        }

    async def analyze_image(
        self,
        image_path: str,
        prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze product image using GPT-4 Vision.

        Args:
            image_path: Path to image file
            prompt: Custom prompt for image analysis

        Returns:
            Dict containing extracted information from image
        """
        # Placeholder for Phase 3 - GPT-4 Vision integration
        logger.info(f"Image analysis not implemented yet: {image_path}")
        return {
            "analysis": "Image analysis will be implemented in Phase 3",
            "error": "Not implemented"
        }

    def select_model(self, text_length: int, complexity_score: float = 0.5) -> str:
        """
        Intelligently select GPT model based on text characteristics.

        Args:
            text_length: Length of text in characters
            complexity_score: Estimated complexity (0-1)

        Returns:
            Model name to use
        """
        # Simple logic for MVP - always use GPT-3.5
        # In Phase 3, we'll add intelligent selection for GPT-4

        if text_length < 500 and complexity_score < 0.3:
            return "gpt-3.5-turbo"

        if complexity_score > 0.7 or text_length > 5000:
            # For complex/long text, GPT-4 would be better
            # But for MVP, stick with GPT-3.5
            logger.info("Complex text detected - in production would use GPT-4")
            return "gpt-3.5-turbo"

        return "gpt-3.5-turbo"

    async def batch_extract(
        self,
        text_list: List[str],
        max_concurrent: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Extract product data from multiple texts concurrently.

        Args:
            text_list: List of text extracts to process
            max_concurrent: Maximum concurrent API calls

        Returns:
            List of extraction results
        """
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_with_semaphore(text):
            async with semaphore:
                return await self.extract_product_data(text)

        tasks = [extract_with_semaphore(text) for text in text_list]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Handle exceptions
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Batch extraction failed for item {i}: {result}")
                processed_results.append({
                    "products": [],
                    "error": str(result)
                })
            else:
                processed_results.append(result)

        return processed_results
