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

    MATCH_SCORES = {
        "manufacturer_ref": 1.00,   # 1. Référence constructeur
        "exact_ean":        0.90,   # 2. Code EAN
        "brand":            0.75,   # 3. Nom du constructeur / marque
        "name_match":       0.60,   # 4. Nom du produit
    }

    def __init__(self, storage_service):
        """
        Initialize the matching service.

        Args:
            storage_service: StorageService instance for database access
        """
        self.storage = storage_service

    def _make_result(self, product: Dict, match_type: str, detail: str) -> MatchResult:
        return MatchResult(
            product_id=product['_id'],
            product_name=product.get('name', ''),
            default_code=product.get('default_code'),
            barcode=product.get('barcode'),
            constructeur=product.get('constructeur'),
            score=self.MATCH_SCORES[match_type],
            match_type=match_type,
            match_details=detail,
        )

    async def find_matches(
        self,
        odoo_product: Dict[str, Any],
        max_results: int = 10,
    ) -> List[MatchResult]:
        """Priority: 1. refConstructeur → 2. Code EAN → 3. Marque → 4. Nom"""
        matches: List[MatchResult] = []
        seen_ids: set = set()

        ref   = odoo_product.get('refConstructeur') or odoo_product.get('ref_constructeur')
        ean   = odoo_product.get('Code_EAN') or odoo_product.get('code_ean')
        brand = odoo_product.get('constructeur')
        name  = odoo_product.get('name', '')

        if ref:
            self._collect(matches, seen_ids, await self._find_by_manufacturer_ref(ref),
                          "manufacturer_ref", f"Réf constructeur: {ref}")
        if ean:
            self._collect(matches, seen_ids, await self._find_by_code_ean(ean),
                          "exact_ean", f"Code EAN: {ean}")
        if brand and len(matches) < max_results:
            self._collect(matches, seen_ids, await self._find_by_brand(brand, seen_ids),
                          "brand", f"Marque: {brand}")
        if name and len(matches) < max_results:
            self._collect_fuzzy(matches, seen_ids,
                                await self._find_by_fuzzy_name(name, seen_ids),
                                max_results)

        matches.sort(key=lambda x: x.score, reverse=True)
        logger.info(f"Found {len(matches)} matches for Odoo product '{name}'")
        return matches[:max_results]

    def _collect(
        self,
        matches: list,
        seen_ids: set,
        products: List[Dict],
        match_type: str,
        detail: str,
    ) -> None:
        """Append unseen products to *matches* with the given match type."""
        for p in products:
            if p['_id'] not in seen_ids:
                seen_ids.add(p['_id'])
                matches.append(self._make_result(p, match_type, detail))

    def _collect_fuzzy(
        self,
        matches: list,
        seen_ids: set,
        fuzzy_results: List[tuple],
        max_results: int,
    ) -> None:
        """Append fuzzy name matches, stopping when max_results is reached."""
        for product, similarity in fuzzy_results:
            if len(matches) >= max_results:
                break
            if product['_id'] not in seen_ids:
                seen_ids.add(product['_id'])
                matches.append(self._make_result(
                    product, "name_match",
                    f"Nom similaire ({similarity:.0%}): {product.get('name', '')[:50]}",
                ))

    # ── MongoDB finders ────────────────────────────────────────────────────────

    async def _find_by_manufacturer_ref(self, ref_constructeur: str) -> List[Dict]:
        try:
            cursor = self.storage.products_collection.find(
                {"refConstructeur": ref_constructeur}
            ).limit(10)
            return [self.storage.serialize_product(p) for p in await cursor.to_list(10)]
        except Exception as e:
            logger.exception(f"Error finding by manufacturer ref: {e}")
            return []

    async def _find_by_code_ean(self, code_ean: str) -> List[Dict]:
        try:
            cursor = self.storage.products_collection.find({
                "$or": [{"Code_EAN": code_ean}, {"barcode": code_ean}]
            }).limit(10)
            return [self.storage.serialize_product(p) for p in await cursor.to_list(10)]
        except Exception as e:
            logger.exception(f"Error finding by code EAN: {e}")
            return []

    async def _find_by_brand(self, constructeur: str, exclude_ids: set) -> List[Dict]:
        try:
            cursor = self.storage.products_collection.find({
                "constructeur": {"$regex": f"^{re.escape(constructeur)}$", "$options": "i"}
            }).limit(20)
            products = await cursor.to_list(20)
            return [
                self.storage.serialize_product(p) for p in products
                if str(p.get('_id')) not in exclude_ids
            ]
        except Exception as e:
            logger.exception(f"Error finding by brand: {e}")
            return []

    async def _find_by_fuzzy_name(
        self, name: str, exclude_ids: set, min_similarity: float = 0.70
    ) -> List[tuple]:
        try:
            words = self._normalize(name).split()
            significant = [w for w in words if len(w) > 3][:5]
            if not significant:
                return []
            pattern = "|".join(re.escape(w) for w in significant)
            cursor = self.storage.products_collection.find(
                {"name": {"$regex": pattern, "$options": "i"}}
            ).limit(50)
            results = []
            for p in await cursor.to_list(50):
                if str(p.get('_id')) in exclude_ids:
                    continue
                sim = self._calculate_similarity(name, p.get('name', ''))
                if sim >= min_similarity:
                    results.append((self.storage.serialize_product(p), sim))
            results.sort(key=lambda x: x[1], reverse=True)
            return results[:10]
        except Exception as e:
            logger.exception(f"Error in fuzzy name search: {e}")
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
