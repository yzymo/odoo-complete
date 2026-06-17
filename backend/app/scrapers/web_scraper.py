"""
Targeted CSS-selector-based web scraper for product pages.
Uses per-domain configs from site_configs.py.
No LLM — all extraction is via regex and CSS selectors.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.scrapers.site_configs import get_config

logger = logging.getLogger(__name__)

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

_EAN_RE = re.compile(r"\b(\d{8}|\d{13})\b")
_PRICE_RE = re.compile(r"(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|\$|CHF|EUR|USD)?")
_DIM_RE = {
    "length": re.compile(r"(?:longueur|length|L)[:\s]*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b", re.I),
    "width":  re.compile(r"(?:largeur|width|W|l)[:\s]*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b", re.I),
    "height": re.compile(r"(?:hauteur|height|H|h)[:\s]*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b", re.I),
    "weight": re.compile(r"(?:poids|weight|P)[:\s]*(\d+(?:[.,]\d+)?)\s*(kg|g)\b", re.I),
}

_DIM_MULTIPLIER = {"mm": 1.0, "cm": 10.0, "m": 1000.0, "kg": 1.0, "g": 0.001}
_EXPECTED_FIELD_COUNT = 8  # name, ref, ean, price, description/specs, features, images, dimensions


@dataclass
class ScrapedProduct:
    url: str
    name: Optional[str] = None
    ref: Optional[str] = None
    ean: Optional[str] = None
    price: Optional[float] = None
    description_short: Optional[str] = None   # ≤2000 chars → used directly
    features: list = field(default_factory=list)
    image_urls: list = field(default_factory=list)
    dimensions: dict = field(default_factory=dict)
    raw_specs_text: Optional[str] = None       # >2000 chars, truncated to 1500 → LLM input
    scrape_confidence: float = 0.0


class TargetedScraper:
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=15.0,
                headers={"User-Agent": _USER_AGENT},
                follow_redirects=True,
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ------------------------------------------------------------------ public

    async def scrape_product_page(self, url: str) -> ScrapedProduct:
        config = get_config(url)
        logger.debug(f"Scraping product page: {url}")

        try:
            html = await self._fetch(url, config)
        except Exception as exc:
            logger.error(f"Fetch failed for {url}: {exc}")
            return ScrapedProduct(url=url)

        soup = BeautifulSoup(html, "lxml")

        name = self._extract_text(soup, config["sel_name"])
        ref = self._extract_text(soup, config["sel_ref"])
        ean = self._extract_ean(soup, config["sel_ean"])
        price = self._extract_price(soup, config["sel_price"])
        images = self._extract_images(soup, config["sel_images"], url, config)

        desc_text = self._extract_text(soup, config["sel_description"])
        specs_text = self._extract_text(soup, config["sel_specs"])

        combined = desc_text or specs_text or ""
        if combined and len(combined) <= 2000:
            description_short = combined
            raw_specs_text = None
        elif combined:
            description_short = None
            raw_specs_text = combined[:1500]
        else:
            description_short = None
            raw_specs_text = None

        features = []
        if specs_text:
            features = [l.strip() for l in specs_text.splitlines() if l.strip()][:15]

        dimensions = self._extract_dimensions_from_text(combined)

        filled = sum([
            name is not None,
            ref is not None,
            ean is not None,
            price is not None,
            description_short is not None or raw_specs_text is not None,
            bool(features),
            bool(images),
            bool(dimensions),
        ])
        confidence = filled / _EXPECTED_FIELD_COUNT

        return ScrapedProduct(
            url=url,
            name=name,
            ref=ref,
            ean=ean,
            price=price,
            description_short=description_short,
            features=features,
            image_urls=images,
            dimensions=dimensions,
            raw_specs_text=raw_specs_text,
            scrape_confidence=confidence,
        )

    async def get_product_urls(self, base_url: str, config: dict = None) -> list:
        """Crawl catalogue pages and return up to 200 unique product URLs."""
        if config is None:
            config = get_config(base_url)

        visited: set = set()
        product_urls: set = set()
        queue = [base_url]

        while queue and len(product_urls) < 200:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)

            try:
                html = await self._fetch(current, config)
            except Exception as exc:
                logger.warning(f"Failed to fetch catalogue page {current}: {exc}")
                continue

            soup = BeautifulSoup(html, "lxml")

            for a in soup.select(config["product_link_sel"]):
                href = a.get("href") or a.get("data-href")
                if href:
                    abs_url = self._make_absolute(href, current)
                    if abs_url not in product_urls:
                        product_urls.add(abs_url)
                        logger.debug(f"Found product URL: {abs_url}")

            next_link = soup.select_one(config["pagination_sel"])
            if next_link:
                next_href = next_link.get("href")
                if next_href:
                    next_abs = self._make_absolute(next_href, current)
                    if next_abs not in visited:
                        queue.append(next_abs)

            await asyncio.sleep(config.get("rate_limit_seconds", 1.0))

        return list(product_urls)[:200]

    # ----------------------------------------------------------------- private

    async def _fetch(self, url: str, config: dict) -> str:
        if config.get("requires_js"):
            return await self._fetch_playwright(url)
        return await self._fetch_httpx(url)

    async def _fetch_httpx(self, url: str) -> str:
        client = self._get_client()
        response = await client.get(url)
        response.raise_for_status()
        return response.text

    async def _fetch_playwright(self, url: str) -> str:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.warning("playwright not installed — falling back to httpx for JS site")
            return await self._fetch_httpx(url)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                page = await browser.new_page()
                await page.set_extra_http_headers({"User-Agent": _USER_AGENT})
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(2000)
                return await page.content()
            finally:
                await browser.close()

    def _extract_text(self, soup: BeautifulSoup, selector: str) -> Optional[str]:
        try:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(separator=" ", strip=True)
                return text if text else None
        except Exception:
            pass
        return None

    def _extract_ean(self, soup: BeautifulSoup, selector: str) -> Optional[str]:
        try:
            el = soup.select_one(selector)
            if el:
                # Check content attribute (microdata)
                content = el.get("content") or el.get_text(strip=True)
                match = _EAN_RE.search(content)
                if match:
                    return match.group(1)
        except Exception:
            pass
        return None

    def _extract_price(self, soup: BeautifulSoup, selector: str) -> Optional[float]:
        try:
            el = soup.select_one(selector)
            if el:
                raw = el.get("content") or el.get_text(strip=True)
                match = _PRICE_RE.search(raw)
                if match:
                    price_str = match.group(1).replace(",", ".")
                    return float(price_str)
        except Exception:
            pass
        return None

    # Attributes checked in priority order: highest quality first.
    _IMG_SRC_ATTRS = (
        "data-zoom-image", "data-large-src", "data-large",
        "data-full-src", "data-full", "data-original",
        "data-src", "data-lazy-src", "src",
    )

    def _best_img_src(self, el) -> Optional[str]:
        """Return the highest-quality URL from an img element's attributes."""
        for attr in self._IMG_SRC_ATTRS:
            val = (el.get(attr) or "").strip()
            if val and not val.startswith("data:"):
                return val
        # srcset fallback — pick the largest descriptor
        srcset = (el.get("srcset") or "").strip()
        if srcset:
            best = self._pick_best_srcset(srcset)
            if best:
                return best
        return None

    @staticmethod
    def _pick_best_srcset(srcset: str) -> Optional[str]:
        """Return the URL for the widest entry in a srcset string."""
        best_url: Optional[str] = None
        best_width: int = -1
        for part in srcset.split(","):
            tokens = part.strip().split()
            if not tokens:
                continue
            url, width = tokens[0], 0
            if len(tokens) >= 2 and tokens[1].endswith("w"):
                try:
                    width = int(tokens[1][:-1])
                except ValueError:
                    pass
            if width > best_width:
                best_width, best_url = width, url
        return best_url if best_width > 0 else None

    _NOISE_PATTERNS = (
        "/logo", "/icon", "/banner", "/sprite", "/empty",
        "loading.gif", "blank.gif", "pixel.", "spacer.",
        ".svg",
        "youtube", "vimeo", "facebook", "twitter", "instagram",
        "social", "/play-", "video-thumb",
        "/events/",
    )

    def _is_noise_url(self, url: str) -> bool:
        lower = url.lower()
        return any(p in lower for p in self._NOISE_PATTERNS)

    @staticmethod
    def _apply_zoom_upgrade(url: str, zoom_sub: Optional[tuple]) -> str:
        """Apply a site-specific size-folder substitution if configured.

        ``zoom_sub`` is a ``(pattern_str, replacement)`` pair taken from the
        site config's ``image_zoom_sub`` key.  Example for Edox:
        ``(r"/SupplyImages/Items/(?:Mini|…)/", "/SupplyImages/Items/Zoom/")``.
        """
        if not zoom_sub:
            return url
        pattern, replacement = zoom_sub
        return re.sub(pattern, replacement, url, flags=re.I)

    def _extract_images(
        self,
        soup: BeautifulSoup,
        selector: str,
        base_url: str,
        config: Optional[dict] = None,
    ) -> list:
        """Extract up to 10 image URLs from the given CSS selector.

        The first URL in the returned list is the main product image;
        the rest are gallery images.  High-resolution attributes
        (``data-zoom-image``, ``data-large-src``, …) are preferred over ``src``.
        SVGs and known noise patterns (YouTube, social icons, etc.) are excluded.
        When the site config provides ``image_zoom_sub``, the size folder in each
        extracted URL is upgraded to the full-resolution variant (e.g. Edox
        ``/Mini/`` → ``/Zoom/``).
        """
        zoom_sub = (config or {}).get("image_zoom_sub")
        urls: list = []
        seen: set = set()
        try:
            for img in soup.select(selector)[:15]:
                src = self._best_img_src(img)
                if not src:
                    continue
                abs_url = self._make_absolute(src, base_url)
                abs_url = self._apply_zoom_upgrade(abs_url, zoom_sub)
                if abs_url not in seen and not self._is_noise_url(abs_url):
                    seen.add(abs_url)
                    urls.append(abs_url)
                    if len(urls) >= 10:
                        break
        except Exception:
            pass
        return urls

    def _extract_dimensions_from_text(self, text: str) -> dict:
        if not text:
            return {}
        dims = {}
        for field_name, pattern in _DIM_RE.items():
            match = pattern.search(text)
            if match:
                value = float(match.group(1).replace(",", "."))
                unit = match.group(2).lower()
                multiplier = _DIM_MULTIPLIER.get(unit, 1.0)
                dims[field_name] = round(value * multiplier, 4)
        return dims

    @staticmethod
    def _make_absolute(href: str, base_url: str) -> str:
        return urljoin(base_url, href)
