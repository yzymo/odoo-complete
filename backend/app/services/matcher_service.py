"""
ProductMatcher — in-memory multi-criteria matching of scraped products to Odoo products.

Priority order:
  1. EAN exact          → confidence 1.0
  2. Barcode exact      → confidence 1.0
  3. refConstructeur    → confidence 0.95
  4. default_code       → confidence 0.95
  5. Name exact         → confidence 0.85
  6. Name fuzzy         → confidence 0.70  (threshold 0.85)
"""

import logging
import re
import unicodedata
from typing import Optional

logger = logging.getLogger(__name__)

_FUZZ_THRESHOLD = 0.85

try:
    from rapidfuzz import fuzz as _fuzz

    def _fuzzy_ratio(a: str, b: str) -> float:
        return _fuzz.ratio(a, b) / 100.0

    logger.debug("Using rapidfuzz for fuzzy matching")
except ImportError:
    try:
        from fuzzywuzzy import fuzz as _fwfuzz

        def _fuzzy_ratio(a: str, b: str) -> float:
            return _fwfuzz.ratio(a, b) / 100.0

        logger.debug("Using fuzzywuzzy for fuzzy matching")
    except ImportError:
        import difflib

        def _fuzzy_ratio(a: str, b: str) -> float:
            return difflib.SequenceMatcher(None, a, b).ratio()

        logger.debug("Using difflib for fuzzy matching")


def _normalize(text: str) -> str:
    """Lower, strip accents, remove non-alphanumeric characters."""
    nfkd = unicodedata.normalize("NFKD", text.lower().strip())
    ascii_text = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9 ]", " ", ascii_text).strip()


class ProductMatcher:
    """Build an in-memory index from Odoo products, then match scraped data against it."""

    def __init__(self, fuzzy_threshold: float = _FUZZ_THRESHOLD):
        self.fuzzy_threshold = fuzzy_threshold
        self._index_ean: dict = {}
        self._index_barcode: dict = {}
        self._index_ref: dict = {}
        self._index_code: dict = {}
        self._index_name: dict = {}
        self._products: list = []

    def build_index(self, odoo_products: list) -> None:
        """
        Build lookup indexes from the provided Odoo product list.
        Call once before repeated find_match() calls.
        """
        self._products = odoo_products
        self._index_ean = {}
        self._index_barcode = {}
        self._index_ref = {}
        self._index_code = {}
        self._index_name = {}

        for p in odoo_products:
            if p.get("Code_EAN"):
                self._index_ean[str(p["Code_EAN"]).upper()] = p
            if p.get("barcode"):
                self._index_barcode[str(p["barcode"]).upper()] = p
            if p.get("refConstructeur"):
                self._index_ref[str(p["refConstructeur"]).upper()] = p
            if p.get("default_code"):
                self._index_code[str(p["default_code"]).upper()] = p
            if p.get("name"):
                self._index_name[p["name"].lower().strip()] = p

        logger.debug(
            f"Index built — EAN:{len(self._index_ean)} barcode:{len(self._index_barcode)} "
            f"ref:{len(self._index_ref)} code:{len(self._index_code)} name:{len(self._index_name)}"
        )

    def find_match(self, scraped, odoo_products: list = None) -> Optional[dict]:
        """
        Find the best Odoo product match for a scraped product.

        Args:
            scraped: ScrapedProduct or dict with fields: ean, ref, price, name, etc.
            odoo_products: if provided, rebuild the index first (convenience overload)

        Returns:
            Odoo product dict enriched with _match_confidence and _match_field, or None.
        """
        if odoo_products is not None:
            self.build_index(odoo_products)

        # 1. EAN exact
        ean = getattr(scraped, "ean", None) or (scraped.get("ean") if isinstance(scraped, dict) else None)
        if ean:
            result = self._exact_match(str(ean).upper(), self._index_ean)
            if result:
                return {**result, "_match_confidence": 1.0, "_match_field": "Code_EAN"}

        # 2. Barcode exact (same value, different Odoo field)
        if ean:
            result = self._exact_match(str(ean).upper(), self._index_barcode)
            if result:
                return {**result, "_match_confidence": 1.0, "_match_field": "barcode"}

        # 3. refConstructeur exact
        ref = getattr(scraped, "ref", None) or (scraped.get("ref") if isinstance(scraped, dict) else None)
        if ref:
            result = self._exact_match(str(ref).upper(), self._index_ref)
            if result:
                return {**result, "_match_confidence": 0.95, "_match_field": "refConstructeur"}

        # 4. default_code exact
        if ref:
            result = self._exact_match(str(ref).upper(), self._index_code)
            if result:
                return {**result, "_match_confidence": 0.95, "_match_field": "default_code"}

        # 5. Name exact
        name = getattr(scraped, "name", None) or (scraped.get("name") if isinstance(scraped, dict) else None)
        if name:
            result = self._exact_match(name.lower().strip(), self._index_name)
            if result:
                return {**result, "_match_confidence": 0.85, "_match_field": "name_exact"}

        # 6. Name fuzzy
        if name:
            result, score = self._fuzzy_name_match(name)
            if result:
                if score < 0.85:
                    logger.warning(
                        f"Low-confidence fuzzy match (score={score:.2f}): "
                        f'"{name}" → "{result.get("name")}" — review manually'
                    )
                return {**result, "_match_confidence": score * 0.70 / 1.0, "_match_field": "name_fuzzy"}

        return None

    def _exact_match(self, key: str, index: dict) -> Optional[dict]:
        return index.get(key)

    def _fuzzy_name_match(self, name: str) -> tuple:
        """Return (best_product, score) or (None, 0.0) if no match above threshold."""
        if not self._index_name:
            return None, 0.0

        normalized_query = _normalize(name)
        best_product = None
        best_score = 0.0

        for odoo_name, product in self._index_name.items():
            score = _fuzzy_ratio(_normalize(odoo_name), normalized_query)
            if score > best_score:
                best_score = score
                best_product = product

        if best_score >= self.fuzzy_threshold:
            logger.debug(f"Fuzzy match: '{name}' → '{best_product.get('name')}' (score={best_score:.2f})")
            return best_product, best_score

        return None, 0.0


# Module-level singleton
_matcher: Optional[ProductMatcher] = None


def get_matcher_service() -> ProductMatcher:
    global _matcher
    if _matcher is None:
        _matcher = ProductMatcher()
    return _matcher
