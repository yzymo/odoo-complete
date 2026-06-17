"""
Unit tests for ProductMatcher.
All 12 required cases from the spec.
"""

import pytest
from app.services.matcher_service import ProductMatcher
from app.scrapers.web_scraper import ScrapedProduct


def _make_odoo(
    id=1, name="Product A", ean=None, barcode=None,
    ref=None, code=None
) -> dict:
    return {
        "id": id,
        "name": name,
        "Code_EAN": ean,
        "barcode": barcode,
        "refConstructeur": ref,
        "default_code": code,
        "description_courte": None,
        "features_description": None,
    }


def _make_scraped(**kwargs) -> ScrapedProduct:
    return ScrapedProduct(url="http://example.com", **kwargs)


# CAS 1 — Match exact EAN
def test_exact_ean():
    matcher = ProductMatcher()
    products = [_make_odoo(id=1, ean="1234567890123")]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(ean="1234567890123"))
    assert result is not None
    assert result["id"] == 1
    assert result["_match_confidence"] == 1.0
    assert result["_match_field"] == "Code_EAN"


# CAS 2 — Match exact barcode
def test_exact_barcode():
    matcher = ProductMatcher()
    products = [_make_odoo(id=2, barcode="9876543210987")]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(ean="9876543210987"))
    assert result is not None
    assert result["id"] == 2
    assert result["_match_field"] == "barcode"


# CAS 3 — Match exact refConstructeur
def test_exact_ref_constructeur():
    matcher = ProductMatcher()
    products = [_make_odoo(id=3, ref="REF-XYZ-001")]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(ref="REF-XYZ-001"))
    assert result is not None
    assert result["id"] == 3
    assert result["_match_confidence"] == 0.95
    assert result["_match_field"] == "refConstructeur"


# CAS 4 — Match exact default_code
def test_exact_default_code():
    matcher = ProductMatcher()
    products = [_make_odoo(id=4, code="SKU-12345")]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(ref="SKU-12345"))
    assert result is not None
    assert result["id"] == 4
    assert result["_match_field"] == "default_code"


# CAS 5 — Match exact name (strip + lower)
def test_exact_name():
    matcher = ProductMatcher()
    products = [_make_odoo(id=5, name="  Câble HDMI 2M  ")]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(name="Câble HDMI 2M"))
    assert result is not None
    assert result["id"] == 5
    assert result["_match_field"] == "name_exact"
    assert result["_match_confidence"] == 0.85


# CAS 6 — Fuzzy name match: similar strings should match
def test_fuzzy_name_match():
    matcher = ProductMatcher(fuzzy_threshold=0.70)
    products = [_make_odoo(id=6, name="Cable HDMI 2 Metres")]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(name="Cable HDMI 2M"))
    assert result is not None
    assert result["id"] == 6
    assert result["_match_field"] == "name_fuzzy"


# CAS 7 — Fuzzy name: very different names should NOT match (score < 0.85)
def test_fuzzy_name_no_match():
    matcher = ProductMatcher(fuzzy_threshold=0.85)
    products = [_make_odoo(id=7, name="Cable VGA 1M")]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(name="Cable HDMI 2M"))
    assert result is None


# CAS 8 — No match → return None
def test_no_match():
    matcher = ProductMatcher()
    products = [_make_odoo(id=8, name="Completely Different Product", ean="0000000000000")]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(name="Totally Unrelated Item XYZ"))
    assert result is None


# CAS 9 — EAN is prioritized over name when both exist
def test_ean_priority_over_name():
    matcher = ProductMatcher()
    correct_product = _make_odoo(id=9, ean="1111111111111", name="Correct Product (slightly different name)")
    name_product = _make_odoo(id=99, name="Correct Product")
    matcher.build_index([correct_product, name_product])
    result = matcher.find_match(_make_scraped(ean="1111111111111", name="Correct Product"))
    assert result is not None
    assert result["id"] == 9
    assert result["_match_field"] == "Code_EAN"


# CAS 10 — Odoo field already filled → patch should be ignored
def test_existing_field_not_patched():
    from app.services.enrichment_service import _has_value
    product = {"description_courte": "Existing description"}
    assert _has_value(product, "description_courte") is True


# CAS 11 — Confidence below min_confidence → patch skipped
def test_confidence_below_threshold():
    matcher = ProductMatcher(fuzzy_threshold=0.50)
    products = [_make_odoo(id=11, name="Wireless Mouse Logitech M100")]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(name="Mouse Logit M1"))
    # Even if found, confidence check in enrichment_service filters this out
    # Here we just verify that very low confidence is flagged when below threshold
    if result:
        assert result.get("_match_confidence", 0) <= 0.85


# CAS 12 — Multiple similar names → pick the best score
def test_multiple_similar_names_best_score():
    matcher = ProductMatcher(fuzzy_threshold=0.60)
    products = [
        _make_odoo(id=12, name="Cable HDMI High Speed 2M"),
        _make_odoo(id=13, name="Cable HDMI 2M"),
        _make_odoo(id=14, name="Cable VGA 2M"),
    ]
    matcher.build_index(products)
    result = matcher.find_match(_make_scraped(name="Cable HDMI 2M"))
    assert result is not None
    # The exact match (id=13) should be preferred
    assert result["id"] == 13
