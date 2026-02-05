"""
Product matching service for finding similar products between Odoo and local catalog.
Implements multi-criteria matching with confidence scores.
"""

import logging
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    """Represents a match between an Odoo product and a catalog product."""
    product_id: str
    product_name: str
    default_code: Optional[str]
    barcode: Optional[str]
    constructeur: Optional[str]
    score: float
    match_type: str
    match_details: str


class MatchingService:
    """Service for matching Odoo products with local catalog products."""

    # Match type weights and scores
    MATCH_SCORES = {
        "exact_barcode": 1.0,
        "exact_ean": 1.0,
        "exact_code": 0.95,
        "manufacturer_ref": 0.85,
        "fuzzy_name_high": 0.75,
        "fuzzy_name_medium": 0.60,
        "partial_code": 0.50,
    }

    def __init__(self, storage_service):
        """
        Initialize the matching service.

        Args:
            storage_service: StorageService instance for database access
        """
        self.storage = storage_service

    async def find_matches(
        self,
        odoo_product: Dict[str, Any],
        max_results: int = 10
    ) -> List[MatchResult]:
        """
        Find matching products in the catalog for an Odoo product.

        Uses multiple criteria in order of priority:
        1. Exact barcode match
        2. Exact Code EAN match
        3. Exact default_code match
        4. Manufacturer reference + name match
        5. Fuzzy name matching

        Args:
            odoo_product: The Odoo product to match
            max_results: Maximum number of matches to return

        Returns:
            List of MatchResult sorted by score descending
        """
        matches: List[MatchResult] = []
        seen_ids = set()  # Track already matched products

        # Extract search criteria from Odoo product
        barcode = odoo_product.get('barcode')
        code_ean = odoo_product.get('Code_EAN') or odoo_product.get('code_ean')
        default_code = odoo_product.get('default_code')
        ref_constructeur = odoo_product.get('refConstructeur') or odoo_product.get('ref_constructeur')
        constructeur = odoo_product.get('constructeur')
        name = odoo_product.get('name', '')

        # 1. Exact barcode match
        if barcode:
            barcode_matches = await self._find_by_barcode(barcode)
            for product in barcode_matches:
                if product['_id'] not in seen_ids:
                    seen_ids.add(product['_id'])
                    matches.append(MatchResult(
                        product_id=product['_id'],
                        product_name=product.get('name', ''),
                        default_code=product.get('default_code'),
                        barcode=product.get('barcode'),
                        constructeur=product.get('constructeur'),
                        score=self.MATCH_SCORES["exact_barcode"],
                        match_type="exact_barcode",
                        match_details=f"Barcode exact: {barcode}"
                    ))

        # 2. Exact Code EAN match
        if code_ean and code_ean != barcode:
            ean_matches = await self._find_by_code_ean(code_ean)
            for product in ean_matches:
                if product['_id'] not in seen_ids:
                    seen_ids.add(product['_id'])
                    matches.append(MatchResult(
                        product_id=product['_id'],
                        product_name=product.get('name', ''),
                        default_code=product.get('default_code'),
                        barcode=product.get('barcode'),
                        constructeur=product.get('constructeur'),
                        score=self.MATCH_SCORES["exact_ean"],
                        match_type="exact_ean",
                        match_details=f"Code EAN exact: {code_ean}"
                    ))

        # 3. Exact default_code match
        if default_code:
            code_matches = await self._find_by_default_code(default_code)
            for product in code_matches:
                if product['_id'] not in seen_ids:
                    seen_ids.add(product['_id'])
                    matches.append(MatchResult(
                        product_id=product['_id'],
                        product_name=product.get('name', ''),
                        default_code=product.get('default_code'),
                        barcode=product.get('barcode'),
                        constructeur=product.get('constructeur'),
                        score=self.MATCH_SCORES["exact_code"],
                        match_type="exact_code",
                        match_details=f"Code exact: {default_code}"
                    ))

        # 4. Manufacturer reference match
        if ref_constructeur:
            ref_matches = await self._find_by_manufacturer_ref(
                ref_constructeur, constructeur
            )
            for product in ref_matches:
                if product['_id'] not in seen_ids:
                    seen_ids.add(product['_id'])
                    # Boost score if manufacturer also matches
                    score = self.MATCH_SCORES["manufacturer_ref"]
                    if constructeur and product.get('constructeur'):
                        if self._normalize(constructeur) == self._normalize(product['constructeur']):
                            score = min(score + 0.10, 0.95)

                    matches.append(MatchResult(
                        product_id=product['_id'],
                        product_name=product.get('name', ''),
                        default_code=product.get('default_code'),
                        barcode=product.get('barcode'),
                        constructeur=product.get('constructeur'),
                        score=score,
                        match_type="manufacturer_ref",
                        match_details=f"Ref constructeur: {ref_constructeur}"
                    ))

        # 5. Fuzzy name matching (only if we don't have enough matches)
        if len(matches) < max_results and name:
            fuzzy_matches = await self._find_by_fuzzy_name(name, seen_ids)
            for product, similarity in fuzzy_matches:
                if product['_id'] not in seen_ids:
                    seen_ids.add(product['_id'])

                    if similarity >= 0.90:
                        score = self.MATCH_SCORES["fuzzy_name_high"]
                        match_type = "fuzzy_name_high"
                    else:
                        score = self.MATCH_SCORES["fuzzy_name_medium"]
                        match_type = "fuzzy_name_medium"

                    matches.append(MatchResult(
                        product_id=product['_id'],
                        product_name=product.get('name', ''),
                        default_code=product.get('default_code'),
                        barcode=product.get('barcode'),
                        constructeur=product.get('constructeur'),
                        score=score,
                        match_type=match_type,
                        match_details=f"Nom similaire ({similarity:.0%}): {product.get('name', '')[:50]}"
                    ))

                    if len(matches) >= max_results:
                        break

        # 6. Partial code match (if code contains recognizable pattern)
        if default_code and len(matches) < max_results:
            partial_matches = await self._find_by_partial_code(default_code, seen_ids)
            for product in partial_matches:
                if product['_id'] not in seen_ids:
                    seen_ids.add(product['_id'])
                    matches.append(MatchResult(
                        product_id=product['_id'],
                        product_name=product.get('name', ''),
                        default_code=product.get('default_code'),
                        barcode=product.get('barcode'),
                        constructeur=product.get('constructeur'),
                        score=self.MATCH_SCORES["partial_code"],
                        match_type="partial_code",
                        match_details=f"Code partiel: {product.get('default_code')}"
                    ))

                    if len(matches) >= max_results:
                        break

        # Sort by score descending
        matches.sort(key=lambda x: x.score, reverse=True)

        logger.info(f"Found {len(matches)} matches for Odoo product '{name}'")
        return matches[:max_results]

    async def _find_by_barcode(self, barcode: str) -> List[Dict]:
        """Find products by exact barcode match."""
        try:
            cursor = self.storage.products_collection.find(
                {"barcode": barcode}
            ).limit(5)
            products = await cursor.to_list(length=5)
            return [self.storage.serialize_product(p) for p in products]
        except Exception as e:
            logger.error(f"Error finding by barcode: {e}")
            return []

    async def _find_by_code_ean(self, code_ean: str) -> List[Dict]:
        """Find products by exact Code EAN match."""
        try:
            cursor = self.storage.products_collection.find({
                "$or": [
                    {"code_ean": code_ean},
                    {"Code_EAN": code_ean},
                    {"barcode": code_ean}
                ]
            }).limit(5)
            products = await cursor.to_list(length=5)
            return [self.storage.serialize_product(p) for p in products]
        except Exception as e:
            logger.error(f"Error finding by code EAN: {e}")
            return []

    async def _find_by_default_code(self, default_code: str) -> List[Dict]:
        """Find products by exact default_code match."""
        try:
            cursor = self.storage.products_collection.find(
                {"default_code": default_code}
            ).limit(5)
            products = await cursor.to_list(length=5)
            return [self.storage.serialize_product(p) for p in products]
        except Exception as e:
            logger.error(f"Error finding by default code: {e}")
            return []

    async def _find_by_manufacturer_ref(
        self,
        ref_constructeur: str,
        constructeur: Optional[str] = None
    ) -> List[Dict]:
        """Find products by manufacturer reference."""
        try:
            query = {"ref_constructeur": ref_constructeur}
            if constructeur:
                # Try to match with or without manufacturer
                query = {
                    "$or": [
                        {"ref_constructeur": ref_constructeur, "constructeur": constructeur},
                        {"ref_constructeur": ref_constructeur}
                    ]
                }

            cursor = self.storage.products_collection.find(query).limit(10)
            products = await cursor.to_list(length=10)
            return [self.storage.serialize_product(p) for p in products]
        except Exception as e:
            logger.error(f"Error finding by manufacturer ref: {e}")
            return []

    async def _find_by_fuzzy_name(
        self,
        name: str,
        exclude_ids: set,
        min_similarity: float = 0.70
    ) -> List[tuple]:
        """
        Find products with similar names using fuzzy matching.

        Returns list of (product, similarity_score) tuples.
        """
        try:
            # Normalize the search name
            normalized_name = self._normalize(name)
            words = normalized_name.split()

            # Build regex pattern from significant words (>3 chars)
            significant_words = [w for w in words if len(w) > 3][:5]
            if not significant_words:
                return []

            # Search for products containing any of the significant words
            regex_pattern = "|".join(re.escape(w) for w in significant_words)
            cursor = self.storage.products_collection.find({
                "name": {"$regex": regex_pattern, "$options": "i"}
            }).limit(50)

            products = await cursor.to_list(length=50)
            results = []

            for product in products:
                product_id = str(product.get('_id'))
                if product_id in exclude_ids:
                    continue

                product_name = product.get('name', '')
                similarity = self._calculate_similarity(name, product_name)

                if similarity >= min_similarity:
                    serialized = self.storage.serialize_product(product)
                    results.append((serialized, similarity))

            # Sort by similarity
            results.sort(key=lambda x: x[1], reverse=True)
            return results[:10]

        except Exception as e:
            logger.error(f"Error in fuzzy name search: {e}")
            return []

    async def _find_by_partial_code(
        self,
        default_code: str,
        exclude_ids: set
    ) -> List[Dict]:
        """Find products with partially matching codes."""
        try:
            # Extract alphanumeric parts of the code
            parts = re.findall(r'[A-Za-z0-9]+', default_code)
            if not parts:
                return []

            # Search for codes containing any significant part
            significant_parts = [p for p in parts if len(p) >= 3]
            if not significant_parts:
                return []

            regex_pattern = "|".join(re.escape(p) for p in significant_parts)
            cursor = self.storage.products_collection.find({
                "default_code": {"$regex": regex_pattern, "$options": "i"}
            }).limit(20)

            products = await cursor.to_list(length=20)
            results = []

            for product in products:
                product_id = str(product.get('_id'))
                if product_id in exclude_ids:
                    continue
                # Don't include exact matches (already handled)
                if product.get('default_code') == default_code:
                    continue
                results.append(self.storage.serialize_product(product))

            return results[:5]

        except Exception as e:
            logger.error(f"Error in partial code search: {e}")
            return []

    def _normalize(self, text: str) -> str:
        """Normalize text for comparison."""
        if not text:
            return ""
        # Lowercase, remove extra spaces, normalize unicode
        text = text.lower().strip()
        text = re.sub(r'\s+', ' ', text)
        return text

    def _calculate_similarity(self, str1: str, str2: str) -> float:
        """Calculate similarity ratio between two strings."""
        if not str1 or not str2:
            return 0.0

        # Normalize both strings
        s1 = self._normalize(str1)
        s2 = self._normalize(str2)

        # Use SequenceMatcher for similarity
        return SequenceMatcher(None, s1, s2).ratio()


def get_matching_service(storage_service) -> MatchingService:
    """Factory function to create a MatchingService instance."""
    return MatchingService(storage_service)
