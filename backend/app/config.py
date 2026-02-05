"""
Configuration management using Pydantic Settings.
Loads environment variables from .env file.
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # MongoDB Atlas
    mongodb_url: str

    # OpenAI API
    openai_api_key: str

    # Redis (for background tasks)
    redis_url: str = "redis://localhost:6379"

    # Storage
    storage_directory: str = "c:\\Users\\user\\odoo-complete\\storage"

    # API Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Environment
    environment: str = "development"

    # Database
    database_name: str = "odoo_catalog"

    # CORS
    cors_origins: list = ["http://localhost:5173", "http://localhost:3000"]

    # Odoo Configuration
    odoo_url: str = ""
    odoo_db: str = ""
    odoo_username: str = ""
    odoo_password: str = ""

    class Config:
        # Look for .env in parent directory (backend/.env)
        env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        case_sensitive = False


# Global settings instance
settings = Settings()


def get_storage_path(subdir: str = "") -> str:
    """Get absolute path to storage subdirectory."""
    path = os.path.join(settings.storage_directory, subdir)
    os.makedirs(path, exist_ok=True)
    return path
