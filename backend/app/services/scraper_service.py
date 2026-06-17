"""
Web scraper service: fetches a supplier URL, extracts product data via OpenAI,
then searches Odoo for matching products.
"""

import asyncio
import logging
import re
import urllib.parse
import json as _json
from dataclasses import asdict, dataclass, field
from typing import List, Optional
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse

import httpx
from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession as CurlSession
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from app.services.openai_service import OpenAIService
from app.services.odoo_service import OdooService
from app.services.matcher_service import _fuzzy_ratio, _normalize

logger = logging.getLogger(__name__)

_ODOO_SEARCH_FIELDS = [
    "id", "name", "default_code", "barcode", "Code_EAN",
    "constructeur", "refConstructeur", "list_price", "image_128",
]

_MATCH_SCORES = {
    "manufacturer_ref": 1.00,   # 1. Référence constructeur
    "exact_ean":        0.90,   # 2. Code EAN
    "brand":            0.75,   # 3. Nom du constructeur / marque
    "name_search":      0.60,   # 4. Nom du produit
}

_MATCH_LABELS = {
    "manufacturer_ref": "Réf constructeur",
    "exact_ean":        "EAN exact",
    "brand":            "Marque",
    "name_search":      "Nom similaire",
    "name_fuzzy":       "Nom similaire",
}


@dataclass
class ScrapedProduct:
    name: str
    default_code: Optional[str] = None
    barcode: Optional[str] = None
    code_ean: Optional[str] = None
    constructeur: Optional[str] = None
    ref_constructeur: Optional[str] = None
    description_courte: Optional[str] = None
    description_ecommerce: Optional[str] = None
    features_description: Optional[str] = None
    country_of_origin: Optional[str] = None
    categ_id: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    hs_code: Optional[str] = None
    list_price: Optional[float] = None
    source_url: str = ""
    # Image URLs extracted from the rendered HTML.
    # First entry → image_1920 (main product image).
    # Remaining entries → product_template_image_ids (gallery).
    image_urls: List[str] = field(default_factory=list)


@dataclass
class OdooMatch:
    odoo_id: int
    name: str
    default_code: Optional[str]
    barcode: Optional[str]
    code_ean: Optional[str]
    constructeur: Optional[str]
    ref_constructeur: Optional[str]
    list_price: Optional[float]
    image_128: Optional[str]
    score: float
    match_type: str
    match_label: str


@dataclass
class ScrapeProductResult:
    scraped: ScrapedProduct
    odoo_matches: List[OdooMatch] = field(default_factory=list)


@dataclass
class ScrapeResult:
    url: str
    products: List[ScrapeProductResult] = field(default_factory=list)
    total_products: int = 0
    total_matched: int = 0
    error: Optional[str] = None


def _norm(value: str | None) -> str:
    return (value or "").lower().strip()


def _score_match(odoo_product: dict, scraped: "ScrapedProduct") -> tuple:
    """Return (score, match_type) for a single Odoo product against scraped data."""
    p = odoo_product
    # 1. Référence constructeur (priorité maximale)
    if scraped.ref_constructeur and p.get("refConstructeur") == scraped.ref_constructeur:
        return _MATCH_SCORES["manufacturer_ref"], "manufacturer_ref"
    # 2. Code EAN
    if scraped.code_ean:
        if p.get("Code_EAN") == scraped.code_ean or p.get("barcode") == scraped.code_ean:
            return _MATCH_SCORES["exact_ean"], "exact_ean"
    # 3. Nom du constructeur / marque (comparaison insensible à la casse)
    if scraped.constructeur and _norm(p.get("constructeur")) == _norm(scraped.constructeur):
        return _MATCH_SCORES["brand"], "brand"
    # 4. Nom du produit
    return _MATCH_SCORES["name_search"], "name_search"


def _score_match_fuzzy(odoo_product: dict, scraped: "ScrapedProduct") -> tuple:
    """Continuous-score variant of _score_match for catalog → Odoo matching.

    Keeps the exact tiers (ref constructeur → 1.0, EAN/barcode → 0.9) but replaces
    the flat name score with a real fuzzy-similarity ratio. This gives the Products
    page a meaningful 80–90% "probable match" band (the discrete _score_match used by
    web scraping never produces it). Web-scraping behaviour is left untouched.
    """
    p = odoo_product
    # 1. Référence constructeur (priorité maximale)
    if scraped.ref_constructeur and p.get("refConstructeur") == scraped.ref_constructeur:
        return _MATCH_SCORES["manufacturer_ref"], "manufacturer_ref"
    # 2. Code EAN / code-barres
    if scraped.code_ean and (
        p.get("Code_EAN") == scraped.code_ean or p.get("barcode") == scraped.code_ean
    ):
        return _MATCH_SCORES["exact_ean"], "exact_ean"
    # 3. Similarité de nom (continue) vs. correspondance de marque exacte
    name_score = 0.0
    if scraped.name and p.get("name"):
        name_score = _fuzzy_ratio(_normalize(p["name"]), _normalize(scraped.name))
    brand_score = (
        _MATCH_SCORES["brand"]
        if scraped.constructeur and _norm(p.get("constructeur")) == _norm(scraped.constructeur)
        else 0.0
    )
    if brand_score >= name_score:
        return brand_score, "brand"
    return round(name_score, 2), "name_fuzzy"


class ScraperService:
    def __init__(self, openai_service: OpenAIService):
        self.openai = openai_service

    # URLs containing these path segments are listing/category pages.
    _CATEGORY_PATH_RE = re.compile(
        r'/(categor|catalog|listing|search|collection|brand|marque|famille)',
        re.I,
    )
    # Product detail page paths — used to filter links on listing pages.
    _PRODUCT_PATH_RE = re.compile(
        r'/(products?|produits?|items?|article|p|ref|webshop/products?)[/_-]',
        re.I,
    )

    async def scrape_and_match(
        self,
        url: str,
        odoo_service: OdooService,
        job_svc=None,
        job_id: str | None = None,
    ) -> ScrapeResult:
        result = ScrapeResult(url=url)
        try:
            if job_svc and job_id:
                await job_svc.set_phase(job_id, "fetching", "Chargement de la page…")

            html, pre_image_urls = await self._fetch_html_and_images(url)
            logger.info(f"HTML received: {len(html)} chars from {url}")

            product_links = self._extract_product_links(html, url)
            if self._is_category_page(url, product_links):
                return await self._scrape_category_page(
                    url, product_links, odoo_service, job_svc, job_id
                )

            return await self._scrape_single_page(
                url, html, odoo_service, job_svc, job_id,
                pre_image_urls=pre_image_urls,
            )

        except (httpx.HTTPStatusError, ValueError) as e:
            logger.warning(f"Fetch/HTTP error for {url}: {e}")
            result.error = str(e)
        except httpx.RequestError as e:
            logger.warning(f"Network error for {url}: {e}")
            result.error = f"Could not reach URL: {str(e)}"
        except Exception as e:
            logger.exception(f"Scraping error for {url}: {e}")
            result.error = f"Scraping failed: {str(e)}"

        return result

    async def _scrape_single_page(
        self,
        url: str,
        html: str,
        odoo_service: OdooService,
        job_svc=None,
        job_id: str | None = None,
        pre_image_urls: Optional[List[str]] = None,
    ) -> ScrapeResult:
        """Extract products from a single-product HTML page and match them to Odoo."""
        result = ScrapeResult(url=url)

        if job_svc and job_id:
            await job_svc.set_phase(job_id, "extracting", "Extraction des données produit…")

        # Use Playwright-extracted images when available (live DOM, accurate sizes).
        # Fall back to BeautifulSoup HTML parsing only when Playwright was not used.
        image_urls = pre_image_urls if pre_image_urls is not None else self._extract_image_urls(html, url)
        text = self._extract_text(html)
        if not text.strip():
            result.error = "No content could be extracted from the URL"
            return result

        ai_result = await self.openai.extract_product_data(text)
        raw_products = ai_result.get("products", [])
        if not raw_products:
            result.error = "No products found on this page"
            return result

        fallback_name = url.rstrip("/").split("/")[-1]
        scraped_list = [
            self._build_scraped_product(raw.get("fields", {}), fallback_name, url, image_urls)
            for raw in raw_products
        ]
        scraped_list = [p for p in scraped_list if p.name]

        if job_svc and job_id:
            await job_svc.set_phase(
                job_id, "matching",
                f"Correspondance Odoo pour {len(scraped_list)} produit(s)…",
            )

        match_results = await asyncio.gather(
            *[self._find_odoo_matches(p, odoo_service) for p in scraped_list],
            return_exceptions=True,
        )
        for sp, matches in zip(scraped_list, match_results):
            if isinstance(matches, Exception):
                logger.warning(f"Odoo match failed for '{sp.name}': {matches}")
                matches = []
            result.products.append(ScrapeProductResult(scraped=sp, odoo_matches=matches))

        result.total_products = len(result.products)
        result.total_matched = sum(1 for p in result.products if p.odoo_matches)
        return result

    def _build_scraped_product(
        self,
        fields: dict,
        fallback_name: str,
        source_url: str,
        image_urls: Optional[List[str]] = None,
    ) -> ScrapedProduct:
        """Construct a ScrapedProduct from an OpenAI fields dict."""
        def _float(key: str) -> Optional[float]:
            v = fields.get(key)
            try:
                return float(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        return ScrapedProduct(
            name=fields.get("name") or fallback_name,
            default_code=fields.get("default_code") or None,
            barcode=fields.get("barcode") or None,
            code_ean=fields.get("Code_EAN") or None,
            constructeur=fields.get("constructeur") or None,
            ref_constructeur=fields.get("refConstructeur") or None,
            description_courte=fields.get("description_courte") or None,
            description_ecommerce=fields.get("description_ecommerce") or None,
            features_description=fields.get("features_description") or None,
            country_of_origin=fields.get("country_of_origin") or None,
            categ_id=fields.get("categ_id") or None,
            length=_float("length"),
            width=_float("width"),
            height=_float("height"),
            weight=_float("weight"),
            hs_code=fields.get("hs_code") or None,
            list_price=fields.get("lst_price") or None,
            source_url=source_url,
            image_urls=image_urls or [],
        )

    @staticmethod
    def _to_absolute_url(href: str, scheme: str, base_domain: str, base_url: str) -> str:
        """Resolve a raw href to an absolute URL."""
        if href.startswith("//"):
            return f"{scheme}:{href}"
        if href.startswith("/"):
            return f"{scheme}://{base_domain}{href}"
        if not href.startswith("http"):
            return urljoin(base_url, href)
        return href

    def _extract_product_links(self, html: str, base_url: str, limit: int = 30) -> list:
        """Extract distinct product-page URLs from a listing/category page HTML."""
        parsed_base = urlparse(base_url)
        base_domain = parsed_base.netloc
        soup = BeautifulSoup(html, "lxml")
        seen: set[str] = set()
        links: list[str] = []

        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            href = self._to_absolute_url(href, parsed_base.scheme, base_domain, base_url)

            purl = urlparse(href)
            # Same domain, not the page itself, not already collected.
            if purl.netloc != base_domain or href == base_url or href in seen:
                continue

            if self._PRODUCT_PATH_RE.search(purl.path):
                seen.add(href)
                links.append(href)
                if len(links) >= limit:
                    break

        return links

    def _is_category_page(self, url: str, product_links: list) -> bool:
        """Return True when the URL looks like a category/listing page."""
        return bool(self._CATEGORY_PATH_RE.search(url)) or len(product_links) >= 3

    async def _scrape_category_page(
        self,
        url: str,
        product_links: list,
        odoo_service: OdooService,
        job_svc=None,
        job_id: str | None = None,
    ) -> ScrapeResult:
        """Crawl each product URL individually and report per-product progress."""
        result = ScrapeResult(url=url)
        total = len(product_links)
        logger.info(f"Category page: {total} product URLs found on {url}")

        if job_svc and job_id:
            await job_svc.set_phase(
                job_id, "crawling", f"{total} produit(s) trouvé(s) sur cette page"
            )
            await job_svc.init_product_statuses(job_id, product_links)

        for i, purl in enumerate(product_links, 1):
            logger.info(f"[{i}/{total}] Scraping: {purl}")
            if job_svc and job_id:
                await job_svc.update_product_status(job_id, purl, "scraping")
                await job_svc.set_phase(job_id, "scraping", f"Scraping produit {i}/{total}…")

            product_result = await self._scrape_one_product(purl, odoo_service, job_svc, job_id)
            if product_result:
                result.products.append(product_result)

        result.total_products = len(result.products)
        result.total_matched = sum(1 for p in result.products if p.odoo_matches)
        return result

    async def _scrape_one_product(
        self,
        purl: str,
        odoo_service: OdooService,
        job_svc=None,
        job_id: str | None = None,
    ):
        """Fetch, extract, and match one product page. Returns ScrapeProductResult or None."""
        try:
            p_html, p_image_urls = await self._fetch_html_and_images(purl)
            p_text = self._extract_text(p_html)
            if not p_text.strip():
                raise ValueError("Empty content")

            if job_svc and job_id:
                await job_svc.update_product_status(job_id, purl, "extracting")

            ai_result = await self.openai.extract_product_data(p_text)
            raw_list = ai_result.get("products", [])
            if not raw_list:
                raise ValueError("OpenAI found no products")

            fallback = purl.rstrip("/").split("/")[-1]
            scraped = self._build_scraped_product(
                raw_list[0].get("fields", {}), fallback, purl, p_image_urls
            )

            if job_svc and job_id:
                await job_svc.update_product_status(job_id, purl, "matching", name=scraped.name)

            matches = await self._find_odoo_matches(scraped, odoo_service)

            if job_svc and job_id:
                await job_svc.product_done(
                    job_id, purl,
                    scraped=asdict(scraped),
                    odoo_matches=[asdict(m) for m in matches],
                )
            return ScrapeProductResult(scraped=scraped, odoo_matches=matches)

        except Exception as exc:
            logger.warning(f"Failed to scrape {purl}: {exc}")
            if job_svc and job_id:
                await job_svc.update_product_status(job_id, purl, "failed", error=str(exc))
            return None

    async def _fetch_html(self, url: str) -> str:
        """Fetch HTML — images are discarded (use _fetch_html_and_images when needed)."""
        html, _ = await self._fetch_html_and_images(url)
        return html

    async def _fetch_html_and_images(self, url: str) -> tuple:
        """Two-tier fetch that returns (html, image_urls) in a single request.

        Tier 1 — Playwright: renders JS, then extracts image URLs from the LIVE
          DOM via JavaScript evaluation (naturalWidth / currentSrc).  This is the
          only reliable method for Vue/React/Angular SPAs where rendered <img>
          attributes are not present in the static HTML string.
        Tier 2 — curl_cffi: fast Chrome impersonation for static/server-rendered
          sites; images fall back to BeautifulSoup HTML parsing.
        """
        try:
            return await self._fetch_playwright_with_images(url)
        except Exception as e:
            logger.warning(f"Playwright fetch failed ({e}), falling back to curl_cffi")

        html = await self._fetch_curl(url)
        return html, self._extract_image_urls(html, url)

    # JavaScript run inside Playwright's browser context to extract rendered images.
    # Uses naturalWidth/Height (true rendered size) to filter out icons & sprites,
    # and currentSrc to get the actual URL being displayed (handles srcset / lazy-load).
    #
    # Exclusion rules applied in-browser (faster than round-tripping to Python):
    #   - SVG files  → always UI/icons; product photos are JPEG/PNG/WebP only
    #   - Aspect ratio > 3.5:1  → wide banner/hero strip, not a product photo
    #   - MIN_PX = 150 (raised from 120 to exclude small social icons)
    #   - URL contains known noise keywords
    # IMPORTANT: JavaScript regex literals cannot span multiple lines.
    # Every regex must be written as a single unbroken line.
    _PLAYWRIGHT_IMG_JS = (
        "() => {"
        "  const MIN_PX = 150;"
        "  const SVG_RE = /\\.svg(\\?.*)?$/i;"
        "  const NOISE_RE = /youtube|vimeo|facebook|twitter|instagram|tiktok|social|share[-_]|play[-_]btn|video[-_]thumb|banner|\\/logo|\\/icon|\\/sprite|loading|placeholder|spinner|arrow|chevron|close[-_]|search[-_]icon|cart[-_]icon/i;"
        "  return [...document.querySelectorAll('img')]"
        "    .filter(i => {"
        "      const src = i.currentSrc || i.src || '';"
        "      return src && !src.startsWith('data:')"
        "        && i.naturalWidth >= MIN_PX && i.naturalHeight >= MIN_PX"
        "        && !SVG_RE.test(src) && !NOISE_RE.test(src)"
        "        && i.naturalWidth <= i.naturalHeight * 3.5;"
        "    })"
        "    .map(i => ({"
        "      src:   i.currentSrc || i.src,"
        "      zoom:  i.getAttribute('data-zoom-image')  || '',"
        "      large: i.getAttribute('data-large-src') || i.getAttribute('data-large') || i.getAttribute('data-original') || '',"
        "      w: i.naturalWidth, h: i.naturalHeight"
        "    }));"
        "}"
    )

    @classmethod
    async def _js_images_to_urls(cls, raw: list, base_url: str) -> List[str]:
        """Convert raw Playwright JS-DOM image records to a deduplicated URL list.

        Sort order: largest natural pixel area first (naturalWidth × naturalHeight).
        This is the primary quality signal — it works regardless of HTTP/2
        Content-Length availability.

        After resolving the best src attribute for each image, _upgrade_image_url
        strips CDN size parameters to recover the highest-resolution variant.
        The original URL is kept as a fallback if the upgrade changes nothing.
        """
        seen: set = set()
        urls: List[str] = []
        for item in sorted(raw or [], key=lambda x: -(x.get("w", 0) * x.get("h", 0))):
            raw_url = item.get("zoom") or item.get("large") or item.get("src", "")
            if not raw_url or raw_url.startswith("data:"):
                continue
            abs_url = urljoin(base_url, raw_url)
            if any(p in abs_url.lower() for p in cls._IMG_SKIP_PATTERNS):
                continue
            # Try the upgraded (size-stripped) URL first; keep original as key so
            # we don't emit the same logical image twice if upgrade is a no-op.
            upgraded = cls._upgrade_image_url(abs_url)
            key = upgraded  # dedup key is the upgraded URL
            if key not in seen:
                seen.add(key)
                urls.append(upgraded)
        return urls[:10]

    # Query-param names that CDNs use to request a specific image size.
    # Stripping these from a URL often returns the original full-resolution image.
    _CDN_SIZE_PARAMS: frozenset = frozenset({
        "width", "height", "w", "h", "size", "scale",
        "maxwidth", "maxheight", "resize", "imgwidth", "imgheight",
        "fit", "crop", "dpr", "quality", "q",
        # Cloudinary / imgix / Fastly / BunnyCDN common names
        "tr", "f", "ar", "c", "g",
    })
    # /200x200/ or /200X200/ segments in URL paths (re.I covers both cases)
    _PATH_SIZE_RE = re.compile(r"/\d{2,4}x\d{2,4}(?=/|$)", re.I)
    # _200x200.jpg or -200x200.jpg before extension
    _FNAME_SIZE_RE = re.compile(
        r"[_-]\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp|avif|gif)$)", re.I
    )

    # ── Site-specific size-folder upgrades ──────────────────────────────────────
    # Maps netloc suffix → (size_folder_re, replacement_folder).
    # These are applied BEFORE the generic CDN-param stripping because they are
    # verified to return valid images at the replacement path.
    #
    # Edox.com (confirmed by user testing):
    #   /Webshop/SupplyImages/Items/Mini/…  →  /Webshop/SupplyImages/Items/Zoom/…
    #   /Mini/ is the thumbnail folder; /Zoom/ is the original full-resolution folder.
    _SITE_FOLDER_UPGRADES: tuple = (
        (
            "edox.com",
            re.compile(r"/SupplyImages/Items/(?:Mini|Small|Thumb|Medium|Large|Preview)/", re.I),
            "/SupplyImages/Items/Zoom/",
        ),
    )

    @classmethod
    def _apply_site_folder_upgrade(cls, url: str, parsed) -> str:
        """Apply site-specific size-folder substitutions (e.g. Edox /Mini/ → /Zoom/)."""
        netloc = parsed.netloc.lower()
        for domain, pattern, replacement in cls._SITE_FOLDER_UPGRADES:
            if domain in netloc:
                new_path = pattern.sub(replacement, parsed.path)
                if new_path != parsed.path:
                    return urlunparse(parsed._replace(path=new_path))
        return url

    @classmethod
    def _upgrade_image_url(cls, url: str) -> str:
        """Return the highest-quality variant of an image URL.

        Applies two upgrade passes in order:
          1. **Site-specific folder upgrade** (verified, safe, site name matched):
             e.g. Edox /Mini/ → /Zoom/ — confirmed to return original resolution.
          2. **Generic CDN size-param stripping** (best-effort, frontend onError fallback):
             Query params (?width=400), path segments (/400x400/), filename infixes
             (_400x400.jpg) are stripped to request the parameterless original.
        """
        try:
            parsed = urlparse(url)

            # Pass 1 — site-specific (verified safe)
            upgraded = cls._apply_site_folder_upgrade(url, parsed)
            if upgraded != url:
                return upgraded  # site-specific rule matched — don't also strip params

            # Pass 2 — generic CDN size-param stripping
            qs = parse_qs(parsed.query, keep_blank_values=True)
            cleaned = {k: v for k, v in qs.items() if k.lower() not in cls._CDN_SIZE_PARAMS}
            path = cls._PATH_SIZE_RE.sub("", parsed.path)
            path = cls._FNAME_SIZE_RE.sub("", path)
            if cleaned == qs and path == parsed.path:
                return url
            new_query = urlencode(cleaned, doseq=True) if cleaned else ""
            return urlunparse(parsed._replace(path=path, query=new_query))
        except Exception:
            return url

    @classmethod
    def _net_images_as_supplement(cls, responses: List[dict], dom_urls: List[str]) -> List[str]:
        """Return network-captured image URLs that were NOT already found via JS DOM.

        Network interception catches zoom / preload images that are fetched by the
        browser but not visible as <img> elements in the DOM.

        We do NOT sort by Content-Length — HTTP/2 servers routinely omit it, making
        it an unreliable quality proxy.  The JS DOM result (sorted by naturalWidth ×
        naturalHeight) is the primary quality-ordered source; this only supplements.
        """
        dom_set = set(dom_urls)
        seen: set = set(dom_urls)
        extras: List[str] = []
        for r in responses:
            raw_url = r.get("url", "")
            if not raw_url or any(p in raw_url.lower() for p in cls._IMG_SKIP_PATTERNS):
                continue
            upgraded = cls._upgrade_image_url(raw_url)
            if upgraded not in seen and upgraded not in dom_set:
                seen.add(upgraded)
                extras.append(upgraded)
        return extras

    async def _dom_fallback_images(self, page, html: str, url: str) -> List[str]:
        """Tier 2/3 fallback: JS DOM evaluation → BeautifulSoup when network gives nothing."""
        try:
            raw_imgs = await page.evaluate(self._PLAYWRIGHT_IMG_JS)
            urls = await self._js_images_to_urls(raw_imgs, url)
            logger.info("[images] %d URL(s) via JS DOM from %s", len(urls), url)
            return urls
        except Exception as exc:
            logger.warning("[images] JS eval failed (%s), HTML fallback", exc)
            return self._extract_image_urls(html, url)

    async def _fetch_playwright_with_images(self, url: str) -> tuple:
        """Render with Playwright; return (html, image_urls) from the same session.

        Image extraction strategy (in priority order):
          1. **Network interception** — captures every image the browser fetches,
             sorted by Content-Length so the largest (= highest-res) images come
             first.  CDN size parameters are stripped from each URL to recover
             the original-resolution version.
          2. **JS DOM evaluation** — fallback using naturalWidth/naturalHeight to
             identify rendered product images in the live DOM.
          3. **HTML/BeautifulSoup** — last resort when Playwright JS eval fails.
        """
        async with async_playwright() as p:
            Stealth().hook_playwright_context(p)
            browser = await p.chromium.launch(headless=True)
            try:
                page = await browser.new_page()

                # ── Network interception ──────────────────────────────────────
                _net_imgs: List[dict] = []

                def _on_response(response) -> None:
                    try:
                        if response.request.resource_type != "image":
                            return
                        resp_url = response.url
                        headers = response.headers
                        ct = headers.get("content-type", "")
                        if "svg" in ct or resp_url.lower().endswith(".svg"):
                            return
                        cl = headers.get("content-length", "")
                        size = int(cl) if cl.isdigit() else 0
                        # Skip obvious tracking pixels / tiny icons (< 2 KB)
                        if 0 < size < 2048:
                            return
                        _net_imgs.append({"url": resp_url, "size": size})
                    except Exception:
                        pass

                page.on("response", _on_response)

                # ── Page render ───────────────────────────────────────────────
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=12000)
                except Exception:
                    logger.warning(f"networkidle timeout for {url}, proceeding")

                # Incremental scroll — triggers lazy-loaded images to enter the
                # viewport and be fetched by the browser.
                await page.evaluate("""
                    async () => {
                        await new Promise(resolve => {
                            const distance = 400, delay = 150;
                            let scrolled = 0;
                            const timer = setInterval(() => {
                                window.scrollBy(0, distance);
                                scrolled += distance;
                                if (scrolled >= document.body.scrollHeight) {
                                    clearInterval(timer); resolve();
                                }
                            }, delay);
                        });
                    }
                """)
                await page.wait_for_timeout(1500)

                html = await page.content()
                logger.info(
                    f"Playwright: {len(html)} chars, "
                    f"{len(_net_imgs)} image response(s) from {url}"
                )

                # Primary: JS DOM evaluation sorted by naturalWidth × naturalHeight.
                # This is the reliable quality signal regardless of HTTP/2 (which
                # omits Content-Length, making network-size sorting unreliable).
                # URL upgrading strips CDN size params / folder names from each URL.
                dom_images = await self._dom_fallback_images(page, html, url)

                # Supplement: network-captured URLs not already in the DOM result
                # (e.g. zoom layers preloaded by JS but not rendered as <img>).
                net_extras = self._net_images_as_supplement(_net_imgs, dom_images)
                image_urls = (dom_images + net_extras)[:10]

                logger.info(
                    "[images] %d DOM + %d net-only → %d total URL(s) from %s",
                    len(dom_images), len(net_extras), len(image_urls), url,
                )

                return html, image_urls
            finally:
                await browser.close()

    async def _fetch_curl(self, url: str) -> str:
        """Fetch with curl_cffi Chrome TLS impersonation (no JS execution)."""
        parsed = urllib.parse.urlparse(url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"

        async with CurlSession() as session:
            if base_url.rstrip("/") != url.rstrip("/"):
                try:
                    await session.get(base_url, impersonate="chrome124", timeout=10)
                except Exception:
                    pass

            response = await session.get(url, impersonate="chrome124", timeout=30)

            if response.status_code == 403:
                raise ValueError(
                    f"403 Forbidden — {parsed.netloc} is blocking automated access. "
                    "The site may require login or use bot protection we cannot bypass."
                )

            response.raise_for_status()
            return response.text

    def _extract_text(self, html: str) -> str:
        soup = BeautifulSoup(html, "lxml")

        def _chars():
            return len(soup.get_text(separator=" ", strip=True))

        logger.info(f"[extract] raw soup text: {_chars()} chars")

        # 1. Remove structural noise elements
        for tag in soup(["script", "style", "nav", "footer", "header", "aside",
                          "iframe", "noscript", "meta", "link"]):
            tag.decompose()
        logger.info(f"[extract] after step1 (script/style/nav…): {_chars()} chars")

        # 2. Remove only clearly non-content elements by role or well-known class patterns.
        n = 0
        for tag in soup.find_all(attrs={"role": ["dialog", "alertdialog", "tooltip"]}):
            tag.decompose(); n += 1
        logger.info(f"[extract] after role removal ({n} tags): {_chars()} chars")

        n = 0
        for tag in soup.find_all(class_=re.compile(
            r'cookie[-_]?(banner|bar|notice|consent|popup|modal|wall)|'
            r'gdpr|privacy[-_]?(notice|banner)|'
            r'chat[-_]?widget|live[-_]?chat|intercom|tawk',
            re.I
        )):
            tag.decompose(); n += 1
        logger.info(f"[extract] after class removal ({n} tags): {_chars()} chars")

        # 3. Try to focus on the main product content area.
        # For product detail pages, also try common detail-page class patterns.
        # NOTE: bare 'content' is intentionally excluded from the id regex — it is
        # too broad and matches empty dialog/overlay wrappers (e.g. id="content" on Edox).
        def _non_empty(tag):
            return tag and bool(tag.get_text(strip=True))

        product_area = next(
            (t for t in [
                soup.find(class_=re.compile(
                    r'item[-_]?list|product[-_]?list|product[-_]?grid|search[-_]?result|'
                    r'product[-_]?detail|product[-_]?page|pdp|product[-_]?content|'
                    r'product[-_]?info|product[-_]?description',
                    re.I
                )),
                soup.find(id=re.compile(
                    r'item[-_]?list|product[-_]?list|product[-_]?grid|main[-_]?content|'
                    r'product[-_]?detail|product[-_]?page|pdp',
                    re.I
                )),
                soup.find('main'),
                soup.find(role='main'),
                soup.body,
            ] if _non_empty(t)),
            soup.body,
        )
        logger.info(
            f"[extract] product_area: "
            f"tag={getattr(product_area, 'name', 'None')} "
            f"class={getattr(product_area, 'get', lambda k, d=None: d)('class', '?')!r}"
        )

        root = product_area if product_area else soup
        primary_text = root.get_text(separator="\n", strip=True)

        # 4. Supplement with description / features / specs sections that may live
        #    in sibling containers outside the detected product_area.
        #    Many sites (e.g. Edox) keep the product-info header in one div and the
        #    Caractéristiques / Spécifications blocks in separate sibling divs.
        extra_parts = self._collect_extra_sections(soup, product_area, primary_text)

        all_text = primary_text + "".join(f"\n\n{p}" for p in extra_parts)
        text = re.sub(r"\n{3,}", "\n\n", all_text)

        # 5. Stay within a limit the OpenAI service can process (it chunks above 20 000 chars)
        return text[:25000]

    _EXTRA_SECTION_RE = re.compile(
        r'description|features?|char(acteristics?|acteristique)?|'
        r'spec(ification)?s?|fiche[_-]?tech|datasheet|product[_-]?attr|'
        r'tab[_-]?content|product[_-]?detail',
        re.I,
    )

    def _collect_extra_sections(self, soup, product_area, primary_text: str) -> list:
        """
        Return up to 4 additional text blocks from description/features/specs
        containers that are NOT already inside product_area.
        """
        candidates: list[str] = []
        for tag in soup.find_all(True):
            if product_area and (tag is product_area or product_area in tag.parents):
                continue
            combined = " ".join(tag.get("class", [])) + " " + tag.get("id", "")
            if not self._EXTRA_SECTION_RE.search(combined):
                continue
            part = tag.get_text(separator="\n", strip=True)
            if len(part) > 80 and part not in primary_text:
                candidates.append(part)

        # Remove entries that are substrings of other entries (nested containers).
        seen: set[str] = set()
        deduped: list[str] = []
        for part in candidates:
            if not any(part in s or s in part for s in seen):
                seen.add(part)
                deduped.append(part)

        return deduped[:4]

    # ---------------------------------------------------------------- image helpers

    _DATA_URI_PREFIX = "data:"
    _IMG_SKIP_PATTERNS = (
        "/logo", "/icon", "/banner", "/sprite", "/empty",
        "loading.gif", "blank.gif", "pixel.", "spacer.",
        ".svg",
        "youtube", "vimeo", "facebook", "twitter", "instagram",
        "social", "/play-", "video-thumb",
    )
    _MAIN_IMG_SELECTORS = (
        "[itemprop='image']",
        ".product-cover img",
        "#main-product-image img",
        ".product-main-image img",
        ".product-image-main img",
        ".js-product-main-image img",
        ".product-img-box img",
        ".product-gallery__main img",
        ".product-photo-container img",
        ".swiper-slide.swiper-slide-active img",
        ".slick-active:not(.slick-cloned) img",
        "figure.product img",
    )
    _GALLERY_IMG_SELECTORS = (
        ".product-images-thumbs img",
        ".js-thumb img",
        ".product-thumbnails img",
        ".thumbnail-images img",
        ".product-gallery-thumbs img",
        ".product-secondary-images img",
        ".product-images li img",
        ".swiper-slide:not(.swiper-slide-duplicate) img",
        ".slick-slide:not(.slick-cloned) img",
    )

    @staticmethod
    def _pick_best_srcset(srcset: str) -> Optional[str]:
        """Return the URL for the largest image from a srcset string."""
        best_url: Optional[str] = None
        best_width: int = -1
        for part in srcset.split(","):
            tokens = part.strip().split()
            if not tokens:
                continue
            url, width = tokens[0], 0
            if len(tokens) >= 2:
                desc = tokens[1]
                try:
                    width = int(desc[:-1]) if desc.endswith("w") else int(float(desc[:-1]) * 1000)
                except (ValueError, IndexError):
                    pass
            if width > best_width:
                best_width, best_url = width, url
        return best_url if best_width > 0 else None

    @staticmethod
    def _best_img_src(el) -> Optional[str]:
        """Return the highest-quality image URL from a BeautifulSoup element.

        Priority: zoom/large data attributes > srcset largest > data-src > src.
        """
        _skip = ScraperService._DATA_URI_PREFIX
        for attr in ("data-zoom-image", "data-large-src", "data-large",
                     "data-full-src", "data-full", "data-original"):
            val = (el.get(attr) or "").strip()
            if val and not val.startswith(_skip):
                return val
        srcset = (el.get("srcset") or "").strip()
        if srcset:
            best = ScraperService._pick_best_srcset(srcset)
            if best:
                return best
        for attr in ("data-src", "src"):
            val = (el.get(attr) or "").strip()
            if val and not val.startswith(_skip):
                return val
        return None

    def _make_img_adder(self, base_url: str):
        """Return a closure (_add) plus the shared lists (seen, urls)."""
        seen: set = set()
        urls: List[str] = []

        def _add(src: Optional[str]) -> bool:
            if not src:
                return False
            src = src.strip()
            if not src or src.startswith(self._DATA_URI_PREFIX):
                return False
            abs_url = urljoin(base_url, src)
            if any(p in abs_url.lower() for p in self._IMG_SKIP_PATTERNS):
                return False
            if abs_url not in seen:
                seen.add(abs_url)
                urls.append(abs_url)
                return True
            return False

        return _add, urls

    @staticmethod
    def _urls_from_jsonld_node(node: dict) -> List[str]:
        """Yield image URLs from a single JSON-LD Product/ItemPage node."""
        if node.get("@type") not in ("Product", "ItemPage"):
            return []
        img = node.get("image")
        if isinstance(img, str):
            return [img]
        if isinstance(img, dict):
            return [img.get("url") or img.get("contentUrl") or ""]
        if isinstance(img, list):
            result = []
            for i in img:
                if isinstance(i, str):
                    result.append(i)
                elif isinstance(i, dict):
                    result.append(i.get("url") or i.get("contentUrl") or "")
            return result
        return []

    @staticmethod
    def _nodes_from_jsonld_script(script_text: str) -> List[dict]:
        """Return all JSON-LD graph nodes found in one <script> tag."""
        try:
            data = _json.loads(script_text or "{}")
        except Exception:
            return []
        items = data if isinstance(data, list) else [data]
        nodes: List[dict] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            for node in item.get("@graph", [item]):
                if isinstance(node, dict):
                    nodes.append(node)
        return nodes

    def _collect_jsonld_images(self, soup, _add) -> None:
        """Parse all JSON-LD scripts and feed Product image URLs to _add."""
        for script in soup.find_all("script", type="application/ld+json"):
            for node in self._nodes_from_jsonld_script(script.string):
                for url in self._urls_from_jsonld_node(node):
                    _add(url)

    def _collect_main_css_image(self, soup, _add) -> None:
        """Try each main-image CSS selector until one yields a URL."""
        for sel in self._MAIN_IMG_SELECTORS:
            for el in soup.select(sel)[:1]:
                if _add(self._best_img_src(el)):
                    return

    def _collect_gallery_css_images(self, soup, _add, urls: List[str]) -> None:
        """Append gallery thumbnails to urls via CSS selectors."""
        for sel in self._GALLERY_IMG_SELECTORS:
            for el in soup.select(sel)[:10]:
                _add(self._best_img_src(el))
            if len(urls) >= 10:
                break

    def _collect_all_img_fallback(self, soup, _add, urls: List[str]) -> None:
        """Tier 5: scan every <img> on the page when all targeted tiers found nothing.

        This is the catch-all for sites whose HTML uses non-standard class names
        (custom SPAs, proprietary CMSs).  The existing noise filter in _add()
        already removes logos/icons/banners, so we just iterate all img tags.
        """
        if urls:
            return
        for el in soup.find_all("img")[:30]:
            _add(self._best_img_src(el))

    def _extract_image_urls(self, html: str, base_url: str) -> List[str]:
        """Extract product image URLs from Playwright-rendered HTML.

        Returns an ordered list capped at 10:
          urls[0]   → main product image  (→ Odoo image_1920)
          urls[1:]  → gallery images      (→ Odoo product_template_image_ids)

        Extraction tiers (first hit wins for main; gallery always appended):
          1. <meta property="og:image"> — canonical, highest quality
          2. JSON-LD Product/ItemPage image field
          3. CSS selectors for main product image containers
          4. CSS selectors for gallery thumbnails
        """
        soup = BeautifulSoup(html, "lxml")
        _add, urls = self._make_img_adder(base_url)

        # Tier 1 — OpenGraph
        og = soup.find("meta", {"property": "og:image"})
        if og:
            _add(og.get("content"))

        # Tier 2 — JSON-LD
        self._collect_jsonld_images(soup, _add)

        # Tier 3 — CSS main image (only if tiers 1+2 found nothing)
        if not urls:
            self._collect_main_css_image(soup, _add)

        # Tier 4 — CSS gallery (always)
        self._collect_gallery_css_images(soup, _add, urls)

        # Tier 5 — catch-all: scan every <img> when all targeted tiers found nothing
        self._collect_all_img_fallback(soup, _add, urls)

        logger.debug(
            "[images] %s → %d URL(s): main=%s gallery=%d",
            base_url, len(urls), "yes" if urls else "no", max(0, len(urls) - 1),
        )
        return urls[:10]

    # ---------------------------------------------------------------- search helpers

    @staticmethod
    def _build_search_domain(scraped: ScrapedProduct) -> list:
        """Build an Odoo OR-domain from the four active matching criteria."""
        conditions = []
        if scraped.ref_constructeur:
            conditions.append(["refConstructeur", "=", scraped.ref_constructeur])
        if scraped.code_ean:
            conditions.append(["Code_EAN", "=", scraped.code_ean])
            conditions.append(["barcode",   "=", scraped.code_ean])
        if scraped.constructeur:
            conditions.append(["constructeur", "ilike", scraped.constructeur[:50]])
        if scraped.name:
            conditions.append(["name", "ilike", scraped.name[:50]])
        if not conditions:
            return []
        return ["|"] * (len(conditions) - 1) + conditions

    @staticmethod
    def _to_odoo_match(p: dict, scraped: ScrapedProduct, scorer=_score_match) -> OdooMatch:
        score, match_type = scorer(p, scraped)
        return OdooMatch(
            odoo_id=p["id"],
            name=p.get("name", ""),
            default_code=p.get("default_code") or None,
            barcode=p.get("barcode") or None,
            code_ean=p.get("Code_EAN") or None,
            constructeur=p.get("constructeur") or None,
            ref_constructeur=p.get("refConstructeur") or None,
            list_price=p.get("list_price"),
            image_128=p.get("image_128") or None,
            score=score,
            match_type=match_type,
            match_label=_MATCH_LABELS.get(match_type, match_type),
        )

    async def _find_odoo_matches(
        self, scraped: ScrapedProduct, odoo: OdooService
    ) -> List[OdooMatch]:
        def do_search() -> List[OdooMatch]:
            domain = self._build_search_domain(scraped)
            if not domain:
                return []
            try:
                products, _ = odoo.get_products(
                    search_domain=domain, limit=10, fields=_ODOO_SEARCH_FIELDS
                )
            except Exception as e:
                logger.warning(f"Odoo search failed for '{scraped.name}': {e}")
                return []
            seen: set = set()
            results: List[OdooMatch] = []
            for p in products:
                if p["id"] not in seen:
                    seen.add(p["id"])
                    results.append(self._to_odoo_match(p, scraped))
            return sorted(results, key=lambda x: x.score, reverse=True)[:5]

        return await asyncio.to_thread(do_search)


async def find_odoo_matches_for_catalog_product(
    scraped: ScrapedProduct, odoo: OdooService, limit: int = 5
) -> List[OdooMatch]:
    """Find Odoo product matches for a local catalog product.

    Reuses the web-scraper Odoo search (same OR-domain on ref / EAN / brand / name)
    but scores candidates with ``_score_match_fuzzy`` so the name tier is continuous.
    This powers the Products-page "Mettre en correspondance" button (≥80%) and the
    automatic match (≥90%).
    """
    def do_search() -> List[OdooMatch]:
        domain = ScraperService._build_search_domain(scraped)
        if not domain:
            return []
        try:
            products, _ = odoo.get_products(
                search_domain=domain, limit=10, fields=_ODOO_SEARCH_FIELDS
            )
        except Exception as e:
            logger.warning(f"Odoo search failed for catalog product '{scraped.name}': {e}")
            return []
        seen: set = set()
        results: List[OdooMatch] = []
        for p in products:
            if p["id"] not in seen:
                seen.add(p["id"])
                results.append(ScraperService._to_odoo_match(p, scraped, scorer=_score_match_fuzzy))
        return sorted(results, key=lambda x: x.score, reverse=True)[:limit]

    return await asyncio.to_thread(do_search)
