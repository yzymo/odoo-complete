"""
Unit tests for TargetedScraper.
All 8 required cases from the spec.
"""

import pytest
from bs4 import BeautifulSoup
from app.scrapers.web_scraper import TargetedScraper, ScrapedProduct


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


@pytest.fixture
def scraper() -> TargetedScraper:
    return TargetedScraper()


# CAS 1 — EAN extraction from itemprop
def test_extract_ean_itemprop(scraper):
    soup = _soup('<span itemprop="gtin13">3614272102033</span>')
    result = scraper._extract_ean(soup, "[itemprop='gtin13']")
    assert result == "3614272102033"


# CAS 2 — Price extraction with various currency symbols
@pytest.mark.parametrize("html,expected", [
    ('<span itemprop="price">19,99</span>', 19.99),
    ('<span itemprop="price">$29.99</span>', 29.99),
    ('<span itemprop="price">CHF 45.00</span>', 45.0),
    ('<span class="price">99€</span>', 99.0),
])
def test_extract_price_currencies(scraper, html, expected):
    soup = _soup(html)
    selector = "[itemprop='price'], .price"
    result = scraper._extract_price(soup, selector)
    assert result == pytest.approx(expected, rel=1e-3)


# CAS 3 — Relative URL converted to absolute
def test_make_absolute(scraper):
    base = "https://example.com/catalogue/"
    href = "../products/item-123"
    result = scraper._make_absolute(href, base)
    assert result == "https://example.com/products/item-123"


def test_make_absolute_already_absolute(scraper):
    base = "https://example.com/"
    href = "https://other.com/product/abc"
    result = scraper._make_absolute(href, base)
    assert result == "https://other.com/product/abc"


# CAS 4 — Pagination: collect URLs across multiple pages
@pytest.mark.asyncio
async def test_pagination_collects_all_urls(scraper, monkeypatch):
    pages = {
        "https://example.com/cat?page=1": """
            <html><body>
              <a class="product-link" href="/p/item-1">Item 1</a>
              <a class="product-link" href="/p/item-2">Item 2</a>
              <a rel="next" href="/cat?page=2">Next</a>
            </body></html>
        """,
        "https://example.com/cat?page=2": """
            <html><body>
              <a class="product-link" href="/p/item-3">Item 3</a>
              <a class="product-link" href="/p/item-4">Item 4</a>
              <a rel="next" href="/cat?page=3">Next</a>
            </body></html>
        """,
        "https://example.com/cat?page=3": """
            <html><body>
              <a class="product-link" href="/p/item-5">Item 5</a>
            </body></html>
        """,
    }

    async def mock_fetch(url, config):
        return pages.get(url, "<html><body></body></html>")

    monkeypatch.setattr(scraper, "_fetch", mock_fetch)

    config = {
        "product_link_sel": "a.product-link",
        "pagination_sel": "a[rel='next']",
        "requires_js": False,
        "rate_limit_seconds": 0,
    }
    urls = await scraper.get_product_urls("https://example.com/cat?page=1", config)
    assert len(urls) == 5
    assert "https://example.com/p/item-3" in urls


# CAS 5 — Unknown domain → GENERIC_CONFIG used (no KeyError)
@pytest.mark.asyncio
async def test_unknown_domain_uses_generic_config(scraper, monkeypatch):
    async def mock_fetch(url, config):
        return """<html><body>
          <h1>My Product</h1>
          <span itemprop="price">25.00</span>
        </body></html>"""

    monkeypatch.setattr(scraper, "_fetch", mock_fetch)
    result = await scraper.scrape_product_page("https://unknown-supplier.xyz/product/abc")
    assert isinstance(result, ScrapedProduct)
    assert result.name == "My Product"


# CAS 6 — Network timeout → exception caught, empty ScrapedProduct returned
@pytest.mark.asyncio
async def test_network_timeout_returns_empty(scraper, monkeypatch):
    import httpx

    async def mock_fetch(url, config):
        raise httpx.TimeoutException("Timeout")

    monkeypatch.setattr(scraper, "_fetch", mock_fetch)
    result = await scraper.scrape_product_page("https://example.com/product/slow")
    assert isinstance(result, ScrapedProduct)
    assert result.name is None
    assert result.ean is None
    assert result.scrape_confidence == 0.0


# CAS 7 — Short description (≤2000 chars) → description_short filled, raw_specs_text = None
@pytest.mark.asyncio
async def test_short_description_fills_description_short(scraper, monkeypatch):
    short_desc = "A great product with excellent features." * 10  # ~400 chars

    async def mock_fetch(url, config):
        return f"""<html><body>
          <h1>Product X</h1>
          <div itemprop="description">{short_desc}</div>
        </body></html>"""

    monkeypatch.setattr(scraper, "_fetch", mock_fetch)
    result = await scraper.scrape_product_page("https://example.com/product/x")
    assert result.description_short is not None
    assert len(result.description_short) <= 2000
    assert result.raw_specs_text is None


# CAS 8 — Long description (>2000 chars) → description_short = None, raw_specs_text truncated to 1500
@pytest.mark.asyncio
async def test_long_description_fills_raw_specs(scraper, monkeypatch):
    long_desc = "Feature detail. " * 200  # ~3200 chars

    async def mock_fetch(url, config):
        return f"""<html><body>
          <h1>Product Y</h1>
          <div itemprop="description">{long_desc}</div>
        </body></html>"""

    monkeypatch.setattr(scraper, "_fetch", mock_fetch)
    result = await scraper.scrape_product_page("https://example.com/product/y")
    assert result.description_short is None
    assert result.raw_specs_text is not None
    assert len(result.raw_specs_text) <= 1500
