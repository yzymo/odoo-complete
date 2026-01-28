"""
FastAPI application entry point.
Product Catalog Extraction API for Odoo e-commerce enrichment.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import database
from app.api.routes import products, extraction, images, export
from app.config import settings
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/api.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Product Catalog Extraction API",
    description="Extract product information from documents and enrich Odoo e-commerce catalog",
    version="1.0.0 (MVP - Phase 1)",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize resources on startup."""
    logger.info("🚀 Starting Product Catalog Extraction API...")
    logger.info(f"Environment: {settings.environment}")

    try:
        # Connect to MongoDB
        await database.connect()
        logger.info("✅ MongoDB connection established")

    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown."""
    logger.info("Shutting down API...")

    try:
        # Close MongoDB connection
        await database.close()
        logger.info("✅ MongoDB connection closed")

    except Exception as e:
        logger.error(f"Error during shutdown: {e}")


# Include routers
app.include_router(
    products.router,
    prefix="/api/v1/products",
    tags=["Products"]
)

app.include_router(
    extraction.router,
    prefix="/api/v1/extraction",
    tags=["Extraction"]
)

app.include_router(
    images.router,
    prefix="/api/v1",
    tags=["Images"]
)

app.include_router(
    export.router,
    prefix="/api/v1/export",
    tags=["Export"]
)


@app.get("/")
async def root():
    """API root endpoint."""
    return {
        "message": "Product Catalog Extraction API",
        "version": "1.0.0 MVP (Phase 1)",
        "docs": "/api/docs",
        "status": "operational"
    }


@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint."""
    try:
        # Check MongoDB connection
        if database.db is not None:
            await database.db.command('ping')
            db_status = "connected"
        else:
            db_status = "disconnected"

        return {
            "status": "healthy",
            "database": db_status,
            "environment": settings.environment
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "error",
            "error": str(e)
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.environment == "development",
        log_level="info"
    )
