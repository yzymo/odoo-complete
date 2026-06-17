"""
Product deduplication hash computation.
Produces a stable key stored in products.duplicate_group_id so that the
same logical product found from multiple sources maps to one document.
"""

import hashlib
import unicodedata


def _norm(value) -> str:
    if not value:
        return ""
    s = unicodedata.normalize("NFKC", str(value)).lower().strip()
    return " ".join(s.split())


def compute_dedup_hash(product: dict) -> str | None:
    """
    Priority: barcode > Code_EAN > (refConstructeur+constructeur) > (name+constructeur) > name
    Returns a SHA-256 hex string, or None if there are no usable identifiers.
    """
    barcode = _norm(product.get("barcode"))
    ean = _norm(product.get("Code_EAN") or product.get("code_ean"))
    ref = _norm(product.get("refConstructeur") or product.get("ref_constructeur"))
    brand = _norm(product.get("constructeur"))
    name = _norm(product.get("name"))

    if barcode:
        key = f"barcode:{barcode}"
    elif ean:
        key = f"ean:{ean}"
    elif ref and brand:
        key = f"ref:{ref}|brand:{brand}"
    elif ref:
        key = f"ref:{ref}"
    elif name and brand:
        key = f"name:{name}|brand:{brand}"
    elif name:
        key = f"name:{name}"
    else:
        return None

    return hashlib.sha256(key.encode()).hexdigest()
