# Claude Code Prompt — Intégration Web Enrichment Service

## Rôle
Tu es un **ingénieur senior Python/FastAPI** avec une expertise en scraping web, optimisation de tokens LLM, et architecture de microservices. Tu dois d'abord analyser la codebase existante en profondeur, puis implémenter la solution, puis jouer le rôle de **reviewer senior** pour critiquer ta propre implémentation.

---

## Contraintes absolues (NE PAS VIOLER)

- **ZERO modification** des services existants : `OpenAIService`, `StorageService`, `PDFExtractor`, `ImageProcessor`
- **ZERO LLM** pour les champs structurés (ref, EAN, prix, dimensions) — regex/CSS sélecteurs uniquement
- **LLM uniquement** pour `description_courte` et `features_description`, input tronqué à **1500 chars max**, `max_tokens=300`
- **Ne pas écraser** un champ Odoo qui a déjà une valeur — enrichissement uniquement sur les champs `null`/vides
- **Respecter** le schéma MongoDB existant documenté dans `WORKFLOW.md` (champs, structure `sources`, `extraction_metadata`)
- Tout nouveau code doit respecter les conventions du projet (nommage, structure de dossiers, patterns async/await)

---

## Phase 0 — Analyse obligatoire AVANT d'écrire une seule ligne de code

### 0.1 Lire et cartographier la codebase

```
Lire dans cet ordre :
1. backend/app/main.py              → routes enregistrées, middlewares
2. backend/app/services/            → tous les services (lire chaque fichier)
3. backend/app/extractors/          → extracteurs existants
4. backend/app/routers/             → endpoints existants, patterns de réponse
5. backend/app/models/              → modèles Pydantic/schémas
6. backend/app/core/config.py       → variables d'environnement, settings
7. requirements.txt ou pyproject.toml → dépendances installées
```

### 0.2 Répondre à ces questions AVANT de coder

Rédige un bloc `## Pre-Analysis` dans ta réponse avec :

1. **Structure exacte** du document MongoDB produit (liste tous les champs présents)
2. **Pattern d'injection** des services (DI manuelle ? FastAPI Depends ? instanciation directe ?)
3. **Pattern de réponse API** : les endpoints retournent quoi exactement ? (pydantic model, dict, JSONResponse ?)
4. **Gestion d'erreurs** : comment les autres services gèrent-ils les exceptions ? (try/catch global ? middleware ?)
5. **Variables d'environnement** disponibles (OPENAI_API_KEY, MONGODB_URI, etc.)
6. **Dépendances déjà installées** parmi : `httpx`, `playwright`, `beautifulsoup4`, `lxml`, `rapidfuzz`, `difflib`
7. **Y a-t-il déjà un pattern de "job" async** (background tasks FastAPI, Celery, etc.) ?

---

## Phase 1 — Fichiers à créer

### 1.1 `backend/app/scrapers/__init__.py`
Vide.

### 1.2 `backend/app/scrapers/site_configs.py`

Dictionnaire de configs par domaine. Structure :

```python
SITE_CONFIGS: dict[str, dict] = {
    "example.com": {
        # Sélecteurs CSS pour chaque champ
        "sel_name":           "h1.product-title",
        "sel_ref":            "[data-sku]",
        "sel_ean":            "[itemprop='gtin13']",
        "sel_price":          "[itemprop='price']",
        "sel_description":    ".product-description",
        "sel_specs":          ".technical-specs",
        "sel_images":         ".product-gallery img",
        # Navigation catalogue
        "product_link_sel":   "a.product-card-link",
        "pagination_sel":     "a[rel='next']",
        # Options
        "requires_js":        False,   # True → utiliser Playwright
        "rate_limit_seconds": 0.5,
    }
}

def get_config(url: str) -> dict:
    """Retourne la config pour un domaine, ou config générique si inconnu."""
    from urllib.parse import urlparse
    host = urlparse(url).netloc.replace("www.", "")
    return SITE_CONFIGS.get(host, GENERIC_CONFIG)

GENERIC_CONFIG: dict = {
    # Sélecteurs génériques heuristiques (schema.org, microdata)
    "sel_name":        "h1, [itemprop='name']",
    "sel_ref":         "[itemprop='sku'], [data-sku], .sku",
    "sel_ean":         "[itemprop='gtin13'], [itemprop='gtin']",
    "sel_price":       "[itemprop='price'], .price",
    "sel_description": "[itemprop='description'], .description",
    "sel_specs":       ".specifications, .technical-data, table.specs",
    "sel_images":      "[itemprop='image'], .product-image img",
    "product_link_sel":"a[href*='/product'], a[href*='/p/']",
    "pagination_sel":  "a[rel='next'], .pagination .next",
    "requires_js":     False,
    "rate_limit_seconds": 1.0,
}
```

### 1.3 `backend/app/scrapers/web_scraper.py`

Classe `TargetedScraper`. Implémenter :

```
Méthodes publiques :
- async scrape_product_page(url) -> ScrapedProduct
- async get_product_urls(base_url, config) -> list[str]  # avec pagination

Méthodes privées :
- _extract_text(soup, selector) -> Optional[str]
- _extract_ean(soup, selector) -> Optional[str]      # regex \b\d{13}\b
- _extract_price(soup, selector) -> Optional[float]   # regex + nettoyage devise
- _extract_images(soup, selector) -> list[str]        # max 5, filtrer data-src
- _extract_dimensions(soup, selector) -> dict         # regex L/W/H/poids
- _make_absolute(href, base_url) -> str               # urljoin
```

**Dataclass ScrapedProduct** :
```python
@dataclass
class ScrapedProduct:
    url: str
    name: Optional[str] = None
    ref: Optional[str] = None
    ean: Optional[str] = None
    price: Optional[float] = None
    description_short: Optional[str] = None   # texte court (<2000 chars) → direct
    features: list[str] = field(default_factory=list)
    image_urls: list[str] = field(default_factory=list)
    dimensions: dict = field(default_factory=dict)
    raw_specs_text: Optional[str] = None      # texte long → input LLM (max 1500 chars)
    scrape_confidence: float = 0.0            # 0.0-1.0 basé sur champs trouvés
```

**Règles critiques du scraper** :
- Timeout httpx : 15s
- User-Agent réaliste (pas "python-requests")
- Si `requires_js=True` dans config → utiliser Playwright (si installé), sinon logger un warning et continuer avec httpx
- Déduplication des URLs dans `get_product_urls` (utiliser un `set`)
- Max 200 URLs par appel (protection boucle infinie)
- Logger chaque URL scrapée au niveau DEBUG
- `scrape_confidence` = (nombre de champs non-None) / (nombre total de champs attendus)

### 1.4 `backend/app/services/matcher_service.py`

```
Classe ProductMatcher :

Méthodes :
- build_index(odoo_products) → construit 4 index dict en mémoire
- find_match(scraped, odoo_products) -> Optional[dict]
- _exact_match(value, field) -> Optional[dict]
- _fuzzy_name_match(name, threshold=0.85) -> Optional[dict]

Index construits :
- index_ean:  {Code_EAN.upper(): product}
- index_barcode: {barcode.upper(): product}
- index_ref:  {refConstructeur.upper(): product}
- index_code: {default_code.upper(): product}
- index_name: {name.lower().strip(): product}  ← NOUVEAU

Ordre de priorité du matching :
1. EAN exact (Code_EAN)           → confiance 1.0
2. Barcode exact                   → confiance 1.0
3. Ref constructeur exact          → confiance 0.95
4. Default code exact              → confiance 0.95
5. Nom exact (strip + lower)       → confiance 0.85
6. Nom fuzzy (difflib ou rapidfuzz si dispo, threshold 0.85) → confiance 0.70

Retourner un dict enrichi :
{
  **odoo_product,
  "_match_confidence": float,
  "_match_field": str  # "Code_EAN" | "barcode" | "refConstructeur" | "default_code" | "name_exact" | "name_fuzzy"
}

Pour le fuzzy name matching :
- Utiliser rapidfuzz.fuzz.ratio si disponible (pip install rapidfuzz)
- Sinon fallback sur difflib.get_close_matches
- Normaliser avant comparison : lower(), strip(), supprimer caractères spéciaux
- Logger le match avec le score de confiance
```

### 1.5 `backend/app/services/enrichment_service.py`

```
Classe WebEnrichmentService :

Méthodes publiques :
- async enrich_products_from_url(base_url, odoo_products, missing_fields) -> EnrichmentResult
- async enrich_single_product(product_url, odoo_product, missing_fields) -> dict

Méthodes privées :
- _build_patch(scraped, odoo_product, missing_fields) -> dict
- async _llm_extract_description(raw_text, target_fields) -> dict
- _fields_needing_llm(missing_fields) -> set
- _fields_no_llm(missing_fields) -> set

Dataclass EnrichmentResult :
@dataclass
class EnrichmentResult:
    total_urls_scraped: int
    total_matched: int
    total_enriched: int
    total_unmatched: int
    patches: list[dict]           # [{odoo_id, patch, match_confidence, match_field}]
    unmatched_urls: list[str]     # URLs scrapées sans match Odoo
    errors: list[dict]            # [{url, error}]
    llm_calls_made: int
    tokens_used: int

FIELDS_NO_LLM = frozenset({
    "name", "default_code", "barcode", "Code_EAN", "refConstructeur",
    "lst_price", "length", "width", "height", "weight"
})
FIELDS_NEEDING_LLM = frozenset({
    "description_courte", "description_ecommerce", "features_description"
})

Règles métier :
1. Ne patcher un champ QUE si la valeur Odoo existante est None/vide/"" ET la valeur scrapée est non-nulle
2. Minimum match_confidence > 0.70 pour accepter un patch
3. Si match_confidence < 0.85 → logger un warning avec les deux noms pour review manuelle
4. LLM appelé UNIQUEMENT si :
   a. Le champ cible est dans FIELDS_NEEDING_LLM
   b. Le champ est dans missing_fields
   c. La valeur Odoo est vide
   d. raw_specs_text est disponible
5. Ajouter une entrée dans product["sources"] pour traçabilité (origin: "web_scrape", url: ...)
6. Rate limiting : await asyncio.sleep(config.rate_limit_seconds) entre chaque page
```

### 1.6 `backend/app/routers/enrichment_router.py`

```
Endpoints :

POST /api/v1/enrichment/from-url
Body (Pydantic model) :
{
  "base_url": str,                    # URL catalogue ou page produit unique
  "odoo_product_ids": list[str],      # ObjectIds des produits Odoo à enrichir
  "missing_fields": list[str],        # Champs à remplir
  "dry_run": bool = True,             # Si True → retourner patches SANS les appliquer
  "min_confidence": float = 0.85,     # Seuil minimum pour appliquer un patch
  "apply_patches": bool = False       # Si True → écrire en MongoDB
}

Response :
{
  "job_id": str,
  "dry_run": bool,
  "summary": {
    "total_urls_scraped": int,
    "total_matched": int,
    "total_enriched": int,
    "llm_calls_made": int,
    "tokens_used": int
  },
  "patches": [...],        # Toujours retourné pour review
  "unmatched_urls": [...],
  "errors": [...]
}

GET /api/v1/enrichment/sites
→ Retourner la liste des domaines configurés dans SITE_CONFIGS

POST /api/v1/enrichment/preview-scrape
Body: { "url": str }
→ Scraper UNE page et retourner le ScrapedProduct brut (pour debug/config)
```

### 1.7 `backend/app/models/enrichment_models.py`

Tous les schémas Pydantic pour le router enrichissement. Séparer clairement request/response models.

---

## Phase 2 — Modifications dans les fichiers existants

### 2.1 `backend/app/main.py`
Enregistrer le nouveau router :
```python
from app.routers.enrichment_router import router as enrichment_router
app.include_router(enrichment_router, prefix="/api/v1", tags=["enrichment"])
```

### 2.2 `requirements.txt` (ou `pyproject.toml`)
Ajouter si absent :
- `httpx>=0.27.0`
- `beautifulsoup4>=4.12.0`
- `lxml>=5.0.0`
- `rapidfuzz>=3.0.0`
- `playwright>=1.40.0` (optionnel, pour sites JS)

---

## Phase 3 — Tests unitaires

Créer `backend/tests/test_matcher_service.py` avec ces cas de test **obligatoires** :

```python
# CAS 1 : Match exact EAN
# CAS 2 : Match exact barcode
# CAS 3 : Match exact refConstructeur
# CAS 4 : Match exact default_code
# CAS 5 : Match exact nom (strip + lower)
# CAS 6 : Match fuzzy nom — "Câble HDMI 2M" vs "Câble HDMI 2 Mètres" → match
# CAS 7 : Match fuzzy nom — "Câble HDMI" vs "Câble VGA" → pas de match (< 0.85)
# CAS 8 : Aucun match → retourner None
# CAS 9 : EAN prioritaire sur nom (même produit, EAN correct, nom légèrement différent)
# CAS 10: Champ Odoo déjà rempli → patch ignoré
# CAS 11: Confiance < min_confidence → patch ignoré
# CAS 12: multiple produits avec noms similaires → prendre le meilleur score
```

Créer `backend/tests/test_web_scraper.py` :
```python
# CAS 1 : Extraction EAN depuis itemprop
# CAS 2 : Extraction prix avec devise (€, $, CHF)
# CAS 3 : URL relative → absolute (urljoin)
# CAS 4 : Pagination — 3 pages → toutes les URLs collectées
# CAS 5 : Site sans sélecteur configuré → fallback GENERIC_CONFIG
# CAS 6 : Timeout réseau → exception gérée, error loggé
# CAS 7 : Description < 2000 chars → description_short rempli, raw_specs_text = None
# CAS 8 : Description > 2000 chars → description_short = None, raw_specs_text tronqué à 1500
```

---

## Phase 4 — Review Senior (OBLIGATOIRE après implémentation)

**Après avoir terminé toute l'implémentation**, jouer le rôle d'un **senior engineer reviewer** et auditer le code produit selon ces axes. Pour chaque point, indiquer : ✅ OK / ⚠️ Warning / ❌ Problème critique.

### 4.1 Sécurité
- [ ] SSRF : l'URL passée par l'utilisateur est-elle validée ? (whitelist domaines ou validation scheme http/https)
- [ ] Path traversal : les URLs scrapées sont-elles assainies avant usage ?
- [ ] Rate limit sur l'endpoint `/from-url` (pour éviter abus)
- [ ] Injection : les sélecteurs CSS venant de l'API sont-ils filtrés ?

### 4.2 Performance
- [ ] Le `build_index()` du matcher est-il appelé une seule fois ou à chaque `find_match()` ?
- [ ] Les appels `httpx` sont-ils vraiment async ou bloquants ?
- [ ] Y a-t-il des requêtes MongoDB N+1 dans l'enrichissement ?
- [ ] La pagination est-elle protégée contre les boucles infinies (max pages, visited set) ?

### 4.3 Robustesse
- [ ] Que se passe-t-il si BeautifulSoup retourne None sur un sélecteur absent ?
- [ ] Que se passe-t-il si OpenAI retourne du JSON malformé ?
- [ ] Que se passe-t-il si le site retourne un 429 (rate limit) ?
- [ ] Que se passe-t-il si `playwright` n'est pas installé mais `requires_js=True` ?

### 4.4 Cohérence architecturale
- [ ] Le nouveau service suit-il le même pattern d'injection que les services existants ?
- [ ] Les entrées `sources` ajoutées respectent-elles le schéma existant de `WORKFLOW.md` ?
- [ ] Les logs utilisent-ils le même logger que le reste du projet ?
- [ ] `dry_run=True` par défaut — est-ce bien protégé (on ne doit jamais écrire sans `apply_patches=True` explicite) ?

### 4.5 Maintenabilité
- [ ] Les `SITE_CONFIGS` sont-ils facilement extensibles sans toucher au code ?
- [ ] Le fuzzy matching a-t-il un seuil configurable via settings/env ?
- [ ] Les `FIELDS_NO_LLM` et `FIELDS_NEEDING_LLM` sont-ils des constantes centralisées (pas dupliquées) ?

### 4.6 Use cases manquants — vérifier que chacun est couvert
- [ ] **Catalogue avec pagination** : toutes les pages parcourues
- [ ] **URL produit unique** (pas un catalogue) : fonctionne aussi
- [ ] **Produit sans match Odoo** : listé dans `unmatched_urls`, pas d'erreur
- [ ] **Champ déjà rempli** : jamais écrasé
- [ ] **Site avec JS** : warning clair si playwright absent, fallback httpx
- [ ] **Match par nom fuzzy** : confidence loggée, flaggée pour review si < 0.85
- [ ] **LLM appelé 0 fois** si tous les champs manquants sont structurés
- [ ] **dry_run** : patches calculés mais MongoDB non modifié
- [ ] **apply_patches=True** : MongoDB mis à jour, `sources` enrichi, `updated_at` mis à jour
- [ ] **Erreur réseau sur une URL** : les autres URLs continuent (pas d'arrêt total)
- [ ] **EAN à 8 chiffres** (EAN-8) en plus de EAN-13 : géré dans le regex

### 4.7 Output du Review
Produire un tableau récapitulatif :
```
| Axe              | Statut | Détail |
|------------------|--------|--------|
| SSRF protection  | ✅/⚠️/❌ | ... |
| build_index perf | ✅/⚠️/❌ | ... |
| ...              |        |        |
```

Et une liste de **quick fixes** ordonnés par criticité (P0 → P2).

---

## Résumé des fichiers attendus en output

```
backend/
├── app/
│   ├── scrapers/
│   │   ├── __init__.py                  [CRÉER]
│   │   ├── site_configs.py              [CRÉER]
│   │   └── web_scraper.py               [CRÉER]
│   ├── services/
│   │   ├── matcher_service.py           [CRÉER]
│   │   └── enrichment_service.py        [CRÉER]
│   ├── routers/
│   │   └── enrichment_router.py         [CRÉER]
│   ├── models/
│   │   └── enrichment_models.py         [CRÉER]
│   └── main.py                          [MODIFIER — ajouter router]
├── tests/
│   ├── test_matcher_service.py          [CRÉER]
│   └── test_web_scraper.py              [CRÉER]
└── requirements.txt                     [MODIFIER — ajouter dépendances]
```

**Aucun autre fichier existant ne doit être modifié.**
