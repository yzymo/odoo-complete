"""
Per-domain CSS selector configurations for the targeted web scraper.
Add a new entry per supplier domain to improve extraction accuracy.
"""

from urllib.parse import urlparse

SITE_CONFIGS: dict = {
    "edox.com": {
        # Edox B2B webshop — custom Vue.js SPA at /Webshop/products/{id}/{sku}.
        # Image quality upgrade: /SupplyImages/Items/Mini/ → /SupplyImages/Items/Zoom/
        # /Mini/ = thumbnail (low-res); /Zoom/ = original full-resolution file.
        # Verified by user testing: simply replacing the folder name works.
        "image_zoom_sub": (r"/SupplyImages/Items/(?:Mini|Small|Thumb|Medium|Large|Preview)/",
                           "/SupplyImages/Items/Zoom/"),
        # Requires JavaScript rendering (Playwright) for full content.
        "sel_name":           "h1, .product-name h1, .product-title",
        "sel_ref":            ".product-ref, [data-ref], .ref-edox, "
                              ".product-reference, [data-reference]",
        "sel_ean":            "[itemprop='gtin13'], [data-ean], .ean-code",
        "sel_price":          "[itemprop='price'], .product-price .price, "
                              ".our_price_display, .price-box .price",
        "sel_description":    ".product-description, .product-short-description, "
                              ".description-content, [data-tab='description'] .content",
        "sel_specs":          ".product-attributes, .product-features, "
                              ".specifications-table, table.table-striped, "
                              ".datasheet, .product-specs",
        # Main image: data-zoom-image holds the highest-resolution version.
        # Gallery: thumbnails are in the left-rail thumb list.
        "sel_images":         ".product-cover img[data-zoom-image], "
                              ".product-cover img, "
                              "#main-product-image img, "
                              ".product-image-main img, "
                              ".js-product-main-image img, "
                              ".product-images-thumbs img, "
                              ".slick-slide:not(.slick-cloned) img, "
                              ".swiper-slide:not(.swiper-slide-duplicate) img",
        "product_link_sel":   "a[href*='/Webshop/products/'], "
                              "a[href*='/products/'], "
                              "a.product_img_link, a.product-name",
        "pagination_sel":     "a[rel='next'], .pagination .next",
        "requires_js":        True,
        "rate_limit_seconds": 1.5,
    },
    "amazon.fr": {
        "sel_name":           "#productTitle",
        "sel_ref":            "#ASIN, [data-asin]",
        "sel_ean":            "[itemprop='gtin13'], .a-expander-content tr td",
        "sel_price":          ".a-price .a-offscreen, #priceblock_ourprice",
        "sel_description":    "#productDescription p, #feature-bullets ul",
        "sel_specs":          "#productDetails_techSpec_section_1, #detailBullets_feature_div",
        "sel_images":         "#imgTagWrapperId img, #altImages img",
        "product_link_sel":   "a.a-link-normal.s-no-outline",
        "pagination_sel":     ".s-pagination-next",
        "requires_js":        False,
        "rate_limit_seconds": 2.0,
    },
    "cdiscount.com": {
        "sel_name":           "h1.title-2",
        "sel_ref":            ".ref-produit span",
        "sel_ean":            "[itemprop='gtin13']",
        "sel_price":          "[itemprop='price']",
        "sel_description":    ".dsc-txt",
        "sel_specs":          ".fiche-tech table",
        "sel_images":         ".carrousel-item img",
        "product_link_sel":   "a.prdtBlkLnk",
        "pagination_sel":     "a.pagination-next",
        "requires_js":        False,
        "rate_limit_seconds": 1.0,
    },
    "fnac.com": {
        "sel_name":           "h1.f-productHeader-Title",
        "sel_ref":            ".f-productRef",
        "sel_ean":            "[itemprop='gtin13']",
        "sel_price":          "[itemprop='price']",
        "sel_description":    ".userHtml-content",
        "sel_specs":          ".specifications-table",
        "sel_images":         ".f-productVisuals-main img",
        "product_link_sel":   "a.ProductGridItem__title",
        "pagination_sel":     "a[rel='next']",
        "requires_js":        False,
        "rate_limit_seconds": 1.5,
    },
}

GENERIC_CONFIG: dict = {
    "sel_name":           "h1, [itemprop='name']",
    "sel_ref":            "[itemprop='sku'], [data-sku], .sku, .product-ref",
    "sel_ean":            "[itemprop='gtin13'], [itemprop='gtin'], [itemprop='gtin8']",
    "sel_price":          "[itemprop='price'], .price, .product-price",
    "sel_description":    "[itemprop='description'], .description, .product-description",
    "sel_specs":          ".specifications, .technical-data, table.specs, .product-specs",
    "sel_images":         "[itemprop='image'], .product-image img, .product-gallery img",
    "product_link_sel":   "a[href*='/product'], a[href*='/p/'], a[href*='/produit']",
    "pagination_sel":     "a[rel='next'], .pagination .next, .pagination-next",
    "requires_js":        False,
    "rate_limit_seconds": 1.0,
}


def get_config(url: str) -> dict:
    """Return the per-domain config, or GENERIC_CONFIG if the domain is unknown."""
    host = urlparse(url).netloc.replace("www.", "")
    return SITE_CONFIGS.get(host, GENERIC_CONFIG)


def get_configured_domains() -> list:
    """Return list of domains that have explicit configs."""
    return list(SITE_CONFIGS.keys())
