# Backend — Linux Setup Guide

## Quick Start (TL;DR)

```bash
# From the project root
sudo apt-get install -y libmagic1
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-linux.txt
cp ../.env.example ../.env   # then fill in your values
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API runs at **http://localhost:8000** — docs at **http://localhost:8000/api/docs**

---

## Step-by-Step

### 1. System dependencies

```bash
# Ubuntu / Debian
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv libmagic1

# Fedora / RHEL
# sudo dnf install python3 python3-pip libmagic

# Arch Linux
# sudo pacman -S python python-pip file
```

### 2. Virtual environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

> To deactivate later: `deactivate`

### 3. Python dependencies

```bash
pip install -r requirements-linux.txt
```

> Uses `python-magic` instead of `python-magic-bin` (Windows only).

### 4. Environment variables

```bash
cp ../.env.example ../.env
nano ../.env        # or use any editor
```

Fill in all required values:

```env
# MongoDB Atlas connection string
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/odoo_catalog?retryWrites=true&w=majority

# OpenAI API key — https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-key-here

# Redis (for background tasks) — default local Redis
REDIS_URL=redis://localhost:6379

# Storage — use a Linux absolute path
STORAGE_DIRECTORY=/home/your-user/odoo-complete/storage

# API
API_HOST=0.0.0.0
API_PORT=8000
ENVIRONMENT=development
```

### 5. Start the server

```bash
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## Verify it's running

```bash
curl http://localhost:8000/api/v1/products
# or open the docs
xdg-open http://localhost:8000/api/docs
```

---

## Windows vs Linux differences

| Aspect | Windows | Linux |
|---|---|---|
| Activate venv | `venv\Scripts\activate` | `source venv/bin/activate` |
| Python command | `python` | `python3` |
| Requirements file | `requirements.txt` | `requirements-linux.txt` |
| python-magic | `python-magic-bin` (bundled DLL) | `python-magic` + `libmagic1` system lib |
| Storage path | `C:\Users\...` | `/home/...` |

---

## Troubleshooting

**`ImportError: failed to find libmagic`**
```bash
sudo apt-get install libmagic1
```

**`command 'python' not found`**
```bash
# Use python3 explicitly
python3 -m venv venv
python3 -m uvicorn app.main:app --reload
```

**`Permission denied` on port 8000**
```bash
# Use a different port
python3 -m uvicorn app.main:app --reload --port 8080
# or set API_PORT=8080 in your .env
```

**MongoDB connection error**
- Check your `MONGODB_URL` in `.env`
- Make sure your IP is whitelisted in MongoDB Atlas (Network Access)
