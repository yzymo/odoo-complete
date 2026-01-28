# Workflow Complet d'Extraction de Catalogue Produits

## Vue d'ensemble

Ce document décrit le workflow complet d'extraction de produits depuis un dossier contenant des PDFs et des images vers MongoDB Atlas, avec association automatique des images aux produits.

---

## Architecture Globale

```
Dossier Source (16 Go)
    ├── documents/ (PDFs avec infos produits)
    └── images/ (JPG/PNG avec référence produit dans le nom)
                    ↓
            ┌──────────────────┐
            │  Scan Directory  │
            └──────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌──────────────┐      ┌──────────────┐
│  PDFs List   │      │  Images List │
└──────────────┘      └──────────────┘
        ↓                       ↓
┌──────────────┐      ┌──────────────┐
│ Extract Text │      │Process Images│
└──────────────┘      └──────────────┘
        ↓                       ↓
┌──────────────┐      ┌──────────────┐
│ Detect Lang  │      │Generate Sizes│
│ (French only)│      │ (4 variants) │
└──────────────┘      └──────────────┘
        ↓                       ↓
┌──────────────┐      ┌──────────────┐
│  OpenAI GPT  │      │Extract Ref   │
│  Structure   │      │from Filename │
└──────────────┘      └──────────────┘
        ↓                       ↓
┌──────────────┐      ┌──────────────┐
│Create Product│      │Store on Disk │
│  in MongoDB  │      │+ Save Paths  │
└──────────────┘      └──────────────┘
        ↓                       ↓
        └───────────┬───────────┘
                    ↓
        ┌──────────────────────┐
        │  Associate Images    │
        │  Product ↔ Image     │
        │  via Reference       │
        └──────────────────────┘
                    ↓
        ┌──────────────────────┐
        │  Update Products     │
        │  with Image Paths    │
        └──────────────────────┘
                    ↓
        ┌──────────────────────┐
        │   MongoDB Atlas      │
        │  Products Complete   │
        └──────────────────────┘
```

---

## Phase 1 : Scan du Dossier Source

### Entrée
```
POST /api/v1/extraction/extract-directory
{
  "source_directory": "c:\\Users\\user\\Documents\\catalogue",
  "recursive": true
}
```

### Processus
1. **Normalisation du chemin Windows**
   - Si chemin > 260 caractères → ajouter préfixe `\\?\`
   - Utilisation de `pathlib` pour support multi-plateforme

2. **Scan récursif**
   ```python
   # Trouve tous les fichiers
   for file in Path(directory).rglob('*'):
       if file.suffix.lower() == '.pdf':
           pdf_files.append(file)
       elif file.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
           image_files.append(file)
   ```

### Sortie
- Liste de chemins vers PDFs : `["path/doc1.pdf", "path/doc2.pdf", ...]`
- Liste de chemins vers images : `["path/PROD001.jpg", "path/PROD002.png", ...]`

---

## Phase 2 : Extraction des Données Produits (PDFs)

### Pour chaque PDF

#### 2.1 Extraction du Contenu

**Extracteur utilisé** : `PDFExtractor` (backend/app/extractors/pdf_extractor.py)

```python
# Utilise pdfplumber (meilleur pour les tableaux)
with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        text += page.extract_text()
```

**Résultat** :
```python
{
    "status": "success",
    "text": "Produit: XYZ123\nPrix: 29.99€\n...",
    "page_count": 5,
    "images": []  # Images embarquées si existantes
}
```

#### 2.2 Détection de Langue

**Service** : `langdetect`

```python
def detect_language(text: str) -> str:
    sample = text[:1000]  # Premiers 1000 caractères
    return detect(sample)  # "fr", "en", "es", etc.
```

**Décision** :
- Si `lang == "fr"` → Continue
- Sinon → Skip ce fichier (économie coûts OpenAI)

**Log** :
```
Skipping non-French document: catalog_EN.pdf (detected: en)
```

#### 2.3 Structuration avec OpenAI

**Service** : `OpenAIService` (backend/app/services/openai_service.py)

**Gestion des textes longs** :
```python
if len(text) > 20000:
    # Chunking intelligent
    chunks = split_text_smart(text, chunk_size=18000, overlap=500)
    for chunk in chunks:
        products += extract_from_chunk(chunk)
else:
    products = extract_direct(text)
```

**Prompt envoyé à GPT** :
```
Tu es un expert en extraction de données produits. Extrait les informations
structurées du texte suivant.

Texte à analyser :
{extracted_text}

Extrait les champs suivants (retourner null si l'information n'est pas présente) :

IDENTIFIANTS:
- default_code (référence interne / SKU)
- barcode
- Code_EAN

INFORMATIONS PRODUIT:
- name
- type (product/service/consu)
- active (boolean)
- is_published (boolean)

FABRICANT:
- constructeur
- refConstructeur

DESCRIPTIONS:
- description_courte
- description_ecommerce
- features_description

DIMENSIONS:
- length, width, height (en mm)
- weight (en kg)

PRIX:
- lst_price
- taxes_id (array)

Pour chaque champ, fournis un score de confiance (0-1).

Retourne UNIQUEMENT du JSON valide :
{
  "products": [
    {
      "fields": { ... },
      "confidence_scores": { ... }
    }
  ],
  "is_multi_product": false
}
```

**Réponse OpenAI** :
```json
{
  "products": [
    {
      "fields": {
        "default_code": "PROD001",
        "name": "Câble HDMI 2m",
        "constructeur": "TechCorp",
        "refConstructeur": "TC-HDMI-2M",
        "lst_price": 15.99,
        "length": 2000,
        "weight": 0.15,
        "type": "product",
        "active": true,
        "is_published": false,
        "taxes_id": ["TVA 20%"]
      },
      "confidence_scores": {
        "default_code": 0.95,
        "name": 0.98,
        "constructeur": 0.90,
        "lst_price": 0.85
      }
    }
  ],
  "is_multi_product": false
}
```

#### 2.4 Stockage MongoDB

**Service** : `StorageService` (backend/app/services/storage_service.py)

**Document MongoDB créé** :
```javascript
{
  "_id": ObjectId("..."),

  // Champs produit extraits
  "default_code": "PROD001",
  "name": "Câble HDMI 2m",
  "type": "product",
  "active": true,
  "is_published": false,
  "barcode": null,
  "Code_EAN": null,
  "categ_id": null,
  "country_of_origin": null,
  "constructeur": "TechCorp",
  "refConstructeur": "TC-HDMI-2M",
  "description_courte": null,
  "description_ecommerce": null,
  "features_description": null,
  "length": 2000,
  "width": null,
  "height": null,
  "weight": 0.15,
  "hs_code": null,
  "contient_du_lithium": false,
  "lst_price": 15.99,
  "taxes_id": ["TVA 20%"],

  // Médias (vides pour l'instant, remplis en Phase 3)
  "images": [],
  "image_256": null,
  "image_512": null,
  "image_1024": null,
  "image_1920": null,
  "product_template_image_ids": [],

  // Documents
  "fiche_constructeur": null,
  "fiche_technique": null,
  "fiche_constructeur_nom": null,
  "fiche_technique_nom": null,

  // Métadonnées d'extraction
  "sources": [
    {
      "source_id": "dir_extract_20260128_143022_1",
      "origin_file": "catalogue_2024.pdf",
      "origin_file_path": "c:\\Users\\...\\catalogue_2024.pdf",
      "origin_file_type": "pdf",
      "extraction_type": "text",
      "extracted_text": "Produit: PROD001...",  // Premiers 500 chars
      "confidence_score": 0.92,
      "fields_extracted": ["default_code", "name", "constructeur", ...],
      "timestamp": ISODate("2026-01-28T14:30:22Z")
    }
  ],

  "extraction_metadata": {
    "extraction_date": ISODate("2026-01-28T14:30:22Z"),
    "extraction_job_id": "dir_extract_20260128_143022",
    "status": "raw",  // raw → enriched → validated → exported
    "validation_date": null,
    "validated_by": null,
    "field_confidence_scores": {
      "default_code": 0.95,
      "name": 0.98,
      "constructeur": 0.90,
      "lst_price": 0.85
    },
    "manual_edits": [],
    "errors": []
  },

  // Intégration Odoo
  "product_tmpl_id": null,
  "odoo_product_tmpl_id": null,
  "odoo_id": null,

  // Déduplication
  "duplicate_group_id": null,
  "is_master_record": false,
  "merged_from": [],

  // Timestamps
  "created_at": ISODate("2026-01-28T14:30:22Z"),
  "updated_at": ISODate("2026-01-28T14:30:22Z"),
  "write_date": null
}
```

**Gestion des doublons** :
Si un produit avec le même `default_code`, `barcode` ou `Code_EAN` existe déjà :

```python
# Au lieu de rejeter, on enrichit le produit existant
def enrich_existing_product(new_data, existing_product):
    for field, new_value in new_data.items():
        new_confidence = new_data["confidence_scores"].get(field, 0)
        existing_confidence = existing_product["extraction_metadata"]["field_confidence_scores"].get(field, 0)

        # Garder la valeur avec le meilleur score
        if new_confidence > existing_confidence:
            updates[field] = new_value

    # Fusionner les sources (traçabilité complète)
    merged_sources = existing_sources + new_sources

    # Update en base
    db.products.update_one({"_id": existing_id}, {"$set": updates})
```

---

## Phase 3 : Traitement et Association des Images

### 3.1 Scan des Images

**Service** : `ImageProcessor` (backend/app/services/image_processor.py)

```python
def scan_directory_for_images(directory, recursive=True):
    for file_path in Path(directory).rglob('*'):
        if file_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
            process_image_file(file_path)
```

### 3.2 Extraction de la Référence Produit

**Patterns de matching** :

```python
def extract_product_reference(filename):
    # Pattern 1: Code au début
    # "PROD001_photo.jpg" → "PROD001"
    match = re.match(r'^([A-Z0-9\-_]{3,20})', filename)

    # Pattern 2: Code EAN (13 chiffres)
    # "3700123456789.jpg" → "3700123456789"
    match = re.search(r'(\d{13})', filename)

    # Pattern 3: Code entre séparateurs
    # "image_PROD001_v2.jpg" → "PROD001"
    match = re.search(r'[_\-]([A-Z0-9]{3,20})[_\-]', filename)

    return match.group(1).upper() if match else None
```

**Exemples** :
- `PROD001.jpg` → `"PROD001"`
- `TC-HDMI-2M_front.jpg` → `"TC-HDMI-2M"`
- `3700123456789.png` → `"3700123456789"`
- `photo_XYZ456_v2.jpg` → `"XYZ456"`

### 3.3 Génération des Variantes

**Bibliothèque** : Pillow (PIL)

```python
def generate_variants(source_path, product_code):
    sizes = {
        "size_256": 256,
        "size_512": 512,
        "size_1024": 1024,
        "size_1920": 1920
    }

    with Image.open(source_path) as img:
        # Conversion en RGB si nécessaire
        if img.mode in ('RGBA', 'LA', 'P'):
            img = convert_to_rgb(img)

        for size_key, size in sizes.items():
            # Calcul dimensions (aspect ratio préservé)
            if width > height:
                new_width = size
                new_height = int((height / width) * size)
            else:
                new_height = size
                new_width = int((width / height) * size)

            # Resize haute qualité (LANCZOS)
            resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Sauvegarde
            output_path = f"storage/extracted_images/{size}/{product_code}_{size}.jpg"
            resized.save(output_path, "JPEG", quality=85, optimize=True)
```

**Structure sur disque** :
```
storage/
└── extracted_images/
    ├── 256/
    │   ├── PROD001_256.jpg
    │   └── PROD002_256.jpg
    ├── 512/
    │   ├── PROD001_512.jpg
    │   └── PROD002_512.jpg
    ├── 1024/
    │   ├── PROD001_1024.jpg
    │   └── PROD002_1024.jpg
    └── 1920/
        ├── PROD001_1920.jpg
        └── PROD002_1920.jpg
```

**Données image préparées** :
```python
{
    "image_id": "img_a1b2c3d4e5f6",
    "is_main": False,  # Sera déterminé lors de l'association
    "original_filename": "PROD001.jpg",
    "paths": {
        "size_256": "extracted_images/256/PROD001_256.jpg",
        "size_512": "extracted_images/512/PROD001_512.jpg",
        "size_1024": "extracted_images/1024/PROD001_1024.jpg",
        "size_1920": "extracted_images/1920/PROD001_1920.jpg"
    },
    "product_reference": "PROD001",
    "extracted_from": {
        "file_path": "c:\\...\\PROD001.jpg",
        "confidence": 1.0
    }
}
```

### 3.4 Association Images ↔ Produits

**Algorithme de matching** :

```python
def associate_images_with_products(images, products):
    # Index images par référence
    images_by_ref = {}
    for img in images:
        ref = img["product_reference"]
        images_by_ref[ref] = images_by_ref.get(ref, [])
        images_by_ref[ref].append(img)

    # Pour chaque produit
    for product in products:
        # Essayer de matcher sur 3 champs
        refs_to_try = [
            product.get("default_code"),
            product.get("barcode"),
            product.get("Code_EAN")
        ]

        for ref in refs_to_try:
            if ref and ref in images_by_ref:
                # MATCH TROUVÉ !
                matched_images = images_by_ref[ref]

                # Première image = main
                matched_images[0]["is_main"] = True

                # Attacher au produit
                product["images"] = matched_images

                # Remplir champs individuels (image principale)
                product["image_256"] = matched_images[0]["paths"]["size_256"]
                product["image_512"] = matched_images[0]["paths"]["size_512"]
                product["image_1024"] = matched_images[0]["paths"]["size_1024"]
                product["image_1920"] = matched_images[0]["paths"]["size_1920"]

                # Retirer de l'index pour éviter doublons
                del images_by_ref[ref]
                break

    return products
```

**Exemple de matching** :

| Image Filename | Référence Extraite | Produit Matché | Champ Utilisé |
|----------------|-------------------|----------------|---------------|
| `PROD001.jpg` | `PROD001` | Product #1 | `default_code` |
| `3700123456789.jpg` | `3700123456789` | Product #2 | `Code_EAN` |
| `TC-HDMI-2M_side.jpg` | `TC-HDMI-2M` | Product #1 | `refConstructeur` |

### 3.5 Update MongoDB avec Images

```python
for product in updated_products:
    if product.get("images"):
        await db.products.update_one(
            {"_id": product["_id"]},
            {
                "$set": {
                    "images": product["images"],
                    "image_256": product.get("image_256"),
                    "image_512": product.get("image_512"),
                    "image_1024": product.get("image_1024"),
                    "image_1920": product.get("image_1920"),
                    "updated_at": datetime.utcnow()
                }
            }
        )
```

**Produit MongoDB final avec images** :
```javascript
{
  "_id": ObjectId("..."),
  "default_code": "PROD001",
  "name": "Câble HDMI 2m",
  "constructeur": "TechCorp",
  "refConstructeur": "TC-HDMI-2M",

  // IMAGES ASSOCIÉES
  "images": [
    {
      "image_id": "img_a1b2c3d4e5f6",
      "is_main": true,
      "original_filename": "PROD001.jpg",
      "paths": {
        "size_256": "extracted_images/256/PROD001_256.jpg",
        "size_512": "extracted_images/512/PROD001_512.jpg",
        "size_1024": "extracted_images/1024/PROD001_1024.jpg",
        "size_1920": "extracted_images/1920/PROD001_1920.jpg"
      },
      "extracted_from": {
        "file_path": "c:\\Users\\user\\catalogue\\images\\PROD001.jpg",
        "confidence": 1.0
      }
    },
    {
      "image_id": "img_x7y8z9a0b1c2",
      "is_main": false,
      "original_filename": "TC-HDMI-2M_side.jpg",
      "paths": {
        "size_256": "extracted_images/256/TC-HDMI-2M_256.jpg",
        "size_512": "extracted_images/512/TC-HDMI-2M_512.jpg",
        "size_1024": "extracted_images/1024/TC-HDMI-2M_1024.jpg",
        "size_1920": "extracted_images/1920/TC-HDMI-2M_1920.jpg"
      },
      "extracted_from": {
        "file_path": "c:\\Users\\user\\catalogue\\images\\TC-HDMI-2M_side.jpg",
        "confidence": 1.0
      }
    }
  ],

  // Champs individuels (image principale)
  "image_256": "extracted_images/256/PROD001_256.jpg",
  "image_512": "extracted_images/512/PROD001_512.jpg",
  "image_1024": "extracted_images/1024/PROD001_1024.jpg",
  "image_1920": "extracted_images/1920/PROD001_1920.jpg",

  // ... autres champs
  "updated_at": ISODate("2026-01-28T14:35:10Z")
}
```

---

## Phase 4 : Réponse API

### Format de Réponse

```json
{
  "message": "Directory extraction completed",
  "job_id": "dir_extract_20260128_143022",

  "summary": {
    "total_files": 120,
    "processed_successfully": 115,
    "failed": 5,
    "total_products_extracted": 450,
    "images_processed": 680,
    "images_associated": 420
  },

  "successful_files": [
    "c:\\Users\\...\\catalogue_2024.pdf",
    "c:\\Users\\...\\fiches_techniques.pdf",
    ...
  ],

  "failed_files": [
    {
      "file": "c:\\Users\\...\\catalog_EN.pdf",
      "error": "Document not in French (detected language: en)"
    },
    {
      "file": "c:\\Users\\...\\scanned.pdf",
      "error": "Text too short or empty (possibly scanned PDF - OCR needed)"
    }
  ],

  "products_by_file": {
    "catalogue_2024.pdf": {
      "count": 25,
      "products": [
        {
          "id": "679988f2a3d4e1b2c3f4a5b6",
          "name": "Câble HDMI 2m",
          "default_code": "PROD001"
        },
        ...
      ]
    },
    ...
  }
}
```

---

## API pour Servir les Images

### Endpoint

```
GET /api/v1/images/{size}/{filename}
```

**Exemples** :
```
GET /api/v1/images/512/PROD001_512.jpg
GET /api/v1/images/1024/TC-HDMI-2M_1024.jpg
```

**Réponse** :
- Content-Type: `image/jpeg`
- Cache-Control: `public, max-age=31536000` (1 an)
- Body: Contenu binaire de l'image

**Sécurité** :
- Validation du paramètre `size` (256/512/1024/1920)
- Vérification que le chemin reste dans `storage/extracted_images/`
- 404 si fichier n'existe pas

### Utilisation Frontend

```typescript
// Dans React
const imageUrl = `http://localhost:8000/api/v1/images/512/${product.image_512.split('/').pop()}`;

<img
  src={imageUrl}
  alt={product.name}
  loading="lazy"
/>
```

Ou directement avec le chemin relatif :
```typescript
const getImageUrl = (relativePath: string) => {
  // "extracted_images/512/PROD001_512.jpg"
  // -> "http://localhost:8000/api/v1/images/512/PROD001_512.jpg"
  const parts = relativePath.split('/');
  const size = parts[1];    // "512"
  const filename = parts[2]; // "PROD001_512.jpg"
  return `${API_BASE}/images/${size}/${filename}`;
};
```

---

## Gestion des Cas Particuliers

### Cas 1 : Plusieurs Images pour un Produit

**Fichiers** :
- `PROD001.jpg` (photo principale)
- `PROD001_side.jpg` (vue latérale)
- `PROD001_back.jpg` (vue arrière)

**Référence extraite** : `PROD001` (pour les 3)

**Résultat** :
```javascript
"images": [
  { "is_main": true, "original_filename": "PROD001.jpg", ... },
  { "is_main": false, "original_filename": "PROD001_side.jpg", ... },
  { "is_main": false, "original_filename": "PROD001_back.jpg", ... }
]
```

La première image détectée devient `is_main: true`.

### Cas 2 : Produit sans Image

**Produit créé** : `default_code: "PROD999"`
**Images disponibles** : Aucune avec référence "PROD999"

**Résultat MongoDB** :
```javascript
{
  "default_code": "PROD999",
  "images": [],  // Array vide
  "image_256": null,
  "image_512": null,
  "image_1024": null,
  "image_1920": null
}
```

### Cas 3 : Image sans Produit Correspondant

**Image** : `PROD999.jpg` → Référence extraite : `PROD999`
**Produits en base** : Aucun avec `default_code/barcode/Code_EAN = "PROD999"`

**Résultat** :
- Image traitée et variantes générées sur disque
- **Warning log** : `Image PROD999.jpg could not be matched to any product`
- Image non associée (reste orpheline)
- Peut être associée manuellement plus tard via l'interface

### Cas 4 : PDF Multi-Produits + Images

**Fichier** : `catalogue_2024.pdf`
**Contenu** : Infos de 50 produits (PROD001 à PROD050)

**Images** : `PROD001.jpg` à `PROD050.jpg`

**Workflow** :
1. Extraction PDF → Crée 50 produits en base
2. Scan images → Trouve 50 images
3. Association → 50 matches réussis
4. Update → 50 produits avec images

**Résultat** : 100% des produits ont leur image associée.

### Cas 5 : Doublons Détectés

**Scénario** :
- `catalogue_A.pdf` → Extrait produit `default_code: "PROD001"`, `name: "Câble HDMI"`
- `catalogue_B.pdf` → Extrait produit `default_code: "PROD001"`, `name: "Câble HDMI 2m"`

**Comportement** :
```python
# Produit A créé en premier
product_A = {
    "default_code": "PROD001",
    "name": "Câble HDMI",
    "constructeur": null,
    "confidence_scores": { "name": 0.85 }
}

# Produit B (même default_code) → Enrichissement
product_B_data = {
    "default_code": "PROD001",
    "name": "Câble HDMI 2m",
    "constructeur": "TechCorp",
    "confidence_scores": { "name": 0.95, "constructeur": 0.90 }
}

# Résultat : Fusion basée sur confiance
final_product = {
    "default_code": "PROD001",
    "name": "Câble HDMI 2m",  // Score 0.95 > 0.85
    "constructeur": "TechCorp",  // Nouveau champ ajouté
    "sources": [
        { "origin_file": "catalogue_A.pdf", ... },
        { "origin_file": "catalogue_B.pdf", ... }
    ]
}
```

### Cas 6 : Image avec Référence EAN

**Image** : `3700123456789.jpg`
**Référence extraite** : `3700123456789`

**Produit** :
```javascript
{
  "default_code": "PROD001",
  "Code_EAN": "3700123456789",
  "barcode": null
}
```

**Matching** :
1. Essaie `default_code: "3700123456789"` → Pas de match
2. Essaie `barcode: "3700123456789"` → Pas de match
3. Essaie `Code_EAN: "3700123456789"` → **MATCH !**

**Résultat** : Image associée au produit PROD001 via Code_EAN.

---

## Performances et Optimisations

### Traitement Parallèle

Pour 16 Go de données :

**PDFs** : Traitement séquentiel (éviter surcharge OpenAI)
```python
for pdf in pdf_files:
    extract_and_structure(pdf)  # 1 par 1
```

**Images** : Traitement parallèle (pas d'API externe)
```python
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=4) as executor:
    futures = [executor.submit(process_image, img) for img in image_files]
    results = [f.result() for f in futures]
```

### Gestion Mémoire

**PDFs volumineux** : Chunking
```python
if pdf.page_count > 100:
    for i in range(0, page_count, 50):
        chunk_pages = pages[i:i+50]
        process_chunk(chunk_pages)
        gc.collect()  # Libérer mémoire
```

**Images** : Traitement stream
```python
with Image.open(path) as img:
    # Traitement
    img.save(...)
# Image automatiquement fermée et mémoire libérée
```

### Cache OpenAI

**3 niveaux** :
1. **Mémoire** : LRU cache pour requêtes répétées dans la même session
2. **Disque** : `diskcache` pour cache persistant local
3. **MongoDB** : Collection `openai_cache` avec TTL 30 jours

```python
def extract_product_data(text):
    cache_key = hashlib.sha256(text.encode()).hexdigest()

    # Check cache
    if cached := check_all_caches(cache_key):
        return cached

    # Call OpenAI
    result = openai.chat.completions.create(...)

    # Store in cache
    save_to_caches(cache_key, result)

    return result
```

---

## Logs et Monitoring

### Logs Types

**INFO** :
```
Processing file 25/120: catalogue_2024.pdf
Found and processed 68 images in c:\Users\...
Associated images with 65 products
Successfully processed catalogue_2024.pdf: 25 products
```

**WARNING** :
```
Could not extract product reference from: random_photo.jpg
Image PROD999.jpg could not be matched to any product
Skipping non-French document: catalog_EN.pdf (detected: en)
```

**ERROR** :
```
Error processing file_xyz.pdf: Invalid PDF structure
OpenAI extraction failed: Rate limit exceeded
```

### Métriques Finales

```
=== EXTRACTION JOB COMPLETED ===
Job ID: dir_extract_20260128_143022
Duration: 8h 32min

Files:
  Total scanned: 120
  Successfully processed: 115
  Failed: 5

Products:
  Total extracted: 450
  New products: 380
  Enriched existing: 70

Images:
  Total processed: 680
  Successfully associated: 420
  Orphaned: 260

OpenAI:
  Total API calls: 115
  Tokens used: 2,450,000
  Estimated cost: $32.50
```

---

## Frontend : Affichage des Produits avec Images

### Liste Produits

```typescript
// ProductsPage.tsx
<table>
  {products.map(product => (
    <tr key={product._id}>
      <td>
        {product.image_256 ? (
          <img
            src={getImageUrl(product.image_256)}
            alt={product.name}
            className="w-16 h-16 object-cover rounded"
          />
        ) : (
          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
            <ImageIcon className="text-gray-400" />
          </div>
        )}
      </td>
      <td>{product.name}</td>
      <td>{product.default_code}</td>
    </tr>
  ))}
</table>
```

### Détail Produit avec Galerie

```typescript
// ProductDetailPage.tsx
<div className="image-gallery">
  {product.images.map((img, idx) => (
    <div key={img.image_id} className={img.is_main ? 'main-image' : 'thumbnail'}>
      <img
        src={getImageUrl(img.paths.size_512)}
        alt={`${product.name} - ${idx + 1}`}
        onClick={() => openLightbox(img.paths.size_1920)}
      />
      {img.is_main && <span className="badge">Principal</span>}
    </div>
  ))}
</div>
```

### Lightbox Haute Résolution

```typescript
// Clic sur image → Ouvre en 1920px
const openLightbox = (imagePath: string) => {
  const fullSizeUrl = getImageUrl(imagePath);
  // Modal avec image 1920px pour zoom
  showModal(<img src={fullSizeUrl} className="max-w-full" />);
};
```

---

## Résumé du Workflow

| Étape | Input | Service | Output |
|-------|-------|---------|--------|
| 1. Scan | Dossier source | `scan_directory_for_pdfs()` | Liste PDFs + Images |
| 2. Extract | PDFs | `PDFExtractor` | Texte brut |
| 3. Detect | Texte | `langdetect` | Langue (fr/en/...) |
| 4. Filter | Langue | Logic | Garde français uniquement |
| 5. Structure | Texte FR | `OpenAIService` (GPT) | JSON produits structurés |
| 6. Store | JSON produits | `StorageService` | Docs MongoDB |
| 7. Process Images | JPG/PNG | `ImageProcessor` | 4 variantes sur disque |
| 8. Extract Ref | Filename | Regex patterns | Référence produit |
| 9. Associate | Images + Produits | Matching algorithm | Produits + images |
| 10. Update | Association | MongoDB update | Produits finaux complets |
| 11. Serve | Request | FastAPI `/images/` | Image au client |

---

## Commandes Complètes

### Démarrer l'extraction

```bash
# Frontend (interface utilisateur)
cd frontend
npm run dev

# Backend (API)
cd backend
uvicorn app.main:app --reload

# Puis dans l'interface :
# 1. Aller sur "Extraction"
# 2. Mode: "Directory"
# 3. Path: "c:\Users\user\Documents\catalogue"
# 4. Recursive: ✓
# 5. Cliquer "Start Extraction"
```

Ou via API directe :

```bash
curl -X POST http://localhost:8000/api/v1/extraction/extract-directory \
  -H "Content-Type: application/json" \
  -d '{
    "source_directory": "c:\\Users\\user\\Documents\\catalogue",
    "recursive": true
  }'
```

### Consulter les résultats

```bash
# Liste des produits
curl http://localhost:8000/api/v1/products

# Détail produit
curl http://localhost:8000/api/v1/products/{product_id}

# Récupérer une image
curl http://localhost:8000/api/v1/images/512/PROD001_512.jpg --output prod.jpg
```

---

## Évolutions Futures (Phase 2+)

1. **OCR pour PDFs scannés** : `pytesseract` + prétraitement `OpenCV`
2. **Extraction de tableaux** : Améliorer parsing des catalogues multi-colonnes
3. **Vision AI** : Utiliser GPT-4 Vision pour extraire infos des images directement
4. **Détection auto image principale** : ML pour choisir la meilleure vue
5. **Compression WebP** : Format moderne plus léger que JPEG
6. **CDN** : Stocker images sur S3 + CloudFront pour performance
7. **Background jobs** : Redis Queue pour traitement asynchrone avec progression temps réel
8. **Validation interface** : Workflow de validation manuelle des produits extraits

---

**Document généré le** : 2026-01-28
**Version** : 1.0 - MVP Phase 1
**Auteur** : System d'extraction catalogue Odoo
