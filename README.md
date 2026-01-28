# Product Catalog Extraction - Application Fullstack

Application fullstack pour extraire des informations produits à partir de documents variés (PDF, DOCX, images, vidéos) et les stocker dans MongoDB Atlas pour enrichir un catalogue Odoo e-commerce.

**Version actuelle** : Phase 1 MVP (v1.0.0)

## 🎯 Fonctionnalités Implémentées (Phase 1+)

### Extraction & Traitement
✅ **Extraction PDF** : Upload et extraction de texte depuis des fichiers PDF
✅ **Extraction par Dossier** : Traitement récursif de dossiers complets avec support chemins longs Windows (>260 chars)
✅ **Détection Langue** : Filtrage automatique pour ne traiter que les documents français
✅ **Chunking Intelligent** : Traitement des PDFs volumineux (>20k caractères) par chunks avec overlap

### Intelligence Artificielle
✅ **AI-powered Structuring** : Utilisation d'OpenAI GPT-3.5/GPT-4 pour structurer les données produits
✅ **Scores de Confiance** : Score de confiance par champ extrait (0-1)
✅ **Gestion Doublons** : Détection et enrichissement automatique des produits existants

### Gestion des Images
✅ **Traitement Images** : Scan automatique des images JPG/PNG dans le dossier source
✅ **Extraction Référence** : Extraction intelligente de la référence produit depuis le nom de fichier
✅ **Variantes Multi-Tailles** : Génération automatique de 4 tailles (256, 512, 1024, 1920 px)
✅ **Association Automatique** : Matching images ↔ produits via default_code/barcode/Code_EAN

### Export & Stockage
✅ **Stockage MongoDB Atlas** : Base de données cloud avec schéma complet Odoo (34 champs)
✅ **Export Excel** : Export complet avec tous les champs Odoo + métadonnées
✅ **Template Excel** : Modèle vide téléchargeable pour saisie manuelle

### Interface Utilisateur
✅ **Interface React** : Navigation, recherche, filtres et pagination
✅ **Validation Workflow** : Workflow de validation manuel avant export
✅ **API REST** : Documentation interactive avec FastAPI
✅ **Statistiques** : Stats par statut, images, sources

## 📋 Prérequis

### Outils système requis

- **Python 3.11+** avec pip
- **Node.js 18+** avec npm
- **MongoDB Atlas** : Compte et cluster créé (gratuit)
- **OpenAI API Key** : Clé API OpenAI (https://platform.openai.com/api-keys)

### Services externes

- **MongoDB Atlas** : Créer un cluster gratuit sur https://www.mongodb.com/cloud/atlas
- **OpenAI API** : Créer une clé API sur https://platform.openai.com/api-keys

## 🚀 Installation

### 1. Cloner et configurer l'environnement

```bash
cd c:\Users\user\odoo-complete
```

### 2. Configuration Backend

```bash
# Créer l'environnement virtuel Python
cd backend
python -m venv venv

# Activer l'environnement virtuel (Windows)
venv\Scripts\activate

# Installer les dépendances
pip install -r requirements.txt
```

### 3. Configuration des variables d'environnement

Créer un fichier `.env` à la racine du projet :

```bash
cp .env.example .env
```

Éditer `.env` et remplir les valeurs :

```env
# MongoDB Atlas
MONGODB_URL=mongodb+srv://votre_username:votre_password@cluster.mongodb.net/odoo_catalog?retryWrites=true&w=majority

# OpenAI API
OPENAI_API_KEY=sk-votre-cle-api-openai

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
ENVIRONMENT=development
```

**Important** :
- Remplacer `votre_username`, `votre_password` et `cluster` par vos credentials MongoDB Atlas
- Remplacer `sk-votre-cle-api-openai` par votre vraie clé API OpenAI

### 4. Configuration Frontend

```bash
cd frontend

# Installer les dépendances
npm install
```

Créer un fichier `frontend/.env` :

```bash
cp frontend/.env.example frontend/.env
```

Éditer `frontend/.env` :

```env
VITE_API_URL=http://localhost:8000/api/v1
```

### 5. Créer le dossier logs

```bash
cd c:\Users\user\odoo-complete
mkdir logs
```

## ▶️ Démarrage de l'application

### Backend FastAPI

Terminal 1 :

```bash
cd c:\Users\user\odoo-complete\backend
venv\Scripts\activate
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Le backend démarre sur **http://localhost:8000**

Documentation API interactive : **http://localhost:8000/api/docs**

### Frontend React

Terminal 2 :

```bash
cd c:\Users\user\odoo-complete\frontend
npm run dev
```

Le frontend démarre sur **http://localhost:5173**

## 📖 Utilisation

### 1. Accéder à l'application

Ouvrir votre navigateur : **http://localhost:5173**

### 2. Extraire des produits depuis un PDF

1. Cliquer sur **"Extract"** dans la navigation
2. Sélectionner un fichier PDF contenant des informations produits
3. Cliquer sur **"Extract Products"**
4. Attendre la fin du traitement (peut prendre 1-2 minutes selon la taille du PDF)
5. Les produits extraits s'affichent automatiquement

### 3. Consulter et gérer les produits

1. Cliquer sur **"Products"** dans la navigation
2. Utiliser la barre de recherche pour filtrer
3. Filtrer par statut (Raw, Validated, Exported)
4. Cliquer sur un produit pour voir les détails

### 4. Valider un produit

1. Ouvrir le détail d'un produit
2. Vérifier les informations extraites
3. Consulter les sources d'extraction et scores de confiance
4. Cliquer sur **"Validate"** pour marquer comme validé

### 5. Tester l'API

Accéder à la documentation interactive : **http://localhost:8000/api/docs**

Exemples d'endpoints :

**Produits**
- `GET /api/v1/products` - Liste des produits (pagination, filtres, recherche)
- `GET /api/v1/products/{id}` - Détail d'un produit
- `PATCH /api/v1/products/{id}` - Modifier un produit
- `PATCH /api/v1/products/{id}/validate` - Valider un produit

**Extraction**
- `POST /api/v1/extraction/extract-file` - Upload et extraction d'un PDF
- `POST /api/v1/extraction/extract-directory` - Extraction d'un dossier complet

**Images**
- `GET /api/v1/images/{size}/{filename}` - Récupérer une image produit

**Export**
- `GET /api/v1/export/excel` - Exporter tous les produits en Excel
- `GET /api/v1/export/excel/template` - Télécharger template Excel vide
- `GET /api/v1/export/stats` - Statistiques d'export

## 📊 Schéma MongoDB

### Collection `products`

Champs principaux :
- **Identifiants** : `default_code`, `barcode`, `code_ean`
- **Informations** : `name`, `type`, `active`, `is_published`
- **Fabricant** : `constructeur`, `ref_constructeur`
- **Descriptions** : `description_courte`, `description_ecommerce`, `features_description`
- **Dimensions** : `length`, `width`, `height`, `weight`
- **Prix** : `lst_price`, `taxes_id`
- **Métadonnées** : `sources[]`, `extraction_metadata`, `created_at`, `updated_at`

## 🛠️ Architecture technique

### Backend (Python + FastAPI)

```
backend/
├── app/
│   ├── main.py                    # Point d'entrée FastAPI
│   ├── config.py                  # Configuration et variables d'environnement
│   ├── api/
│   │   ├── routes/
│   │   │   ├── products.py        # Routes CRUD produits
│   │   │   └── extraction.py     # Routes extraction
│   │   └── schemas/
│   │       └── product.py         # Schémas Pydantic
│   ├── core/
│   │   └── database.py            # Connexion MongoDB
│   ├── services/
│   │   ├── openai_service.py     # Service OpenAI
│   │   └── storage_service.py    # Service stockage MongoDB
│   └── extractors/
│       └── pdf_extractor.py      # Extraction PDF
└── requirements.txt
```

### Frontend (React + Vite + TypeScript)

```
frontend/
├── src/
│   ├── App.tsx                    # Application principale + routing
│   ├── api/
│   │   ├── client.ts              # Configuration Axios
│   │   └── products.ts            # API client produits
│   ├── types/
│   │   └── product.ts             # Types TypeScript
│   └── pages/
│       ├── ExtractionPage.tsx    # Page upload et extraction
│       ├── ProductsPage.tsx      # Liste des produits
│       └── ProductDetailPage.tsx # Détail produit
└── package.json
```

## 🔄 Roadmap - Phases suivantes

### Phase 2 : Pipeline complet (à venir)

- ⏳ OCR pour PDFs scannés avec Tesseract
- ⏳ Extraction DOCX, images, vidéos
- ⏳ Traitement en arrière-plan avec Redis Queue (RQ)
- ⏳ Progression temps réel avec Server-Sent Events (SSE)
- ⏳ Traitement de dossiers complets (16 Go)
- ⏳ Gestion des erreurs et reprise après interruption

### Phase 3 : Intelligence & Qualité (à venir)

- ⏳ Cache OpenAI multi-niveaux (mémoire, disque, MongoDB)
- ⏳ Sélection intelligente GPT-4 vs GPT-3.5
- ⏳ GPT-4 Vision pour analyse d'images
- ⏳ Déduplication automatique
- ⏳ Fusion intelligente des doublons
- ⏳ Édition manuelle des produits

### Phase 4 : Production Ready (à venir)

- ⏳ Optimisations performances (traitement parallèle, chunking)
- ⏳ Export format Odoo (CSV/XML)
- ⏳ Dashboard avec statistiques avancées
- ⏳ Tests automatisés
- ⏳ Documentation complète

## 🐛 Dépannage

### Erreur de connexion MongoDB

```
Error: Failed to connect to MongoDB
```

**Solution** :
1. Vérifier que le cluster MongoDB Atlas est actif
2. Vérifier que l'adresse IP est autorisée dans MongoDB Atlas (Network Access)
3. Vérifier le `MONGODB_URL` dans `.env`

### Erreur OpenAI API

```
Error: OpenAI API key invalid
```

**Solution** :
1. Vérifier que la clé API est valide sur https://platform.openai.com/api-keys
2. Vérifier le `OPENAI_API_KEY` dans `.env`
3. Vérifier que vous avez des crédits OpenAI disponibles

### Port déjà utilisé

```
Error: Address already in use
```

**Solution** :
```bash
# Windows : Trouver le processus utilisant le port
netstat -ano | findstr :8000
# Tuer le processus
taskkill /PID <PID> /F
```

### Frontend ne se connecte pas au backend

**Solution** :
1. Vérifier que le backend est démarré sur port 8000
2. Vérifier `VITE_API_URL` dans `frontend/.env`
3. Vérifier la configuration CORS dans `backend/app/main.py`

## 📝 Logs

Les logs sont stockés dans le dossier `logs/` :
- `logs/api.log` - Logs de l'API backend
- `logs/extraction.log` - Logs d'extraction
- `logs/errors.log` - Erreurs

## 🤝 Support

Pour toute question ou problème :
1. Consulter la documentation API : http://localhost:8000/api/docs
2. Vérifier les logs dans le dossier `logs/`
3. Consulter le plan d'implémentation détaillé : [Plan d'implémentation](C:\Users\user\.claude\plans\mellow-marinating-peach.md)

## 📄 Licence

Ce projet est un POC / MVP pour l'enrichissement de catalogue Odoo e-commerce.

---

**Version** : 1.0.0 (MVP - Phase 1)
**Dernière mise à jour** : 2026-01-28
