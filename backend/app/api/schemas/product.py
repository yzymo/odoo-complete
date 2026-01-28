"""
Pydantic schemas for Product data models.
Defines request/response schemas aligned with Odoo structure.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any, Annotated
from datetime import datetime
from bson import ObjectId
from pydantic_core import core_schema


class PyObjectId(str):
    """Custom type for MongoDB ObjectId compatible with Pydantic v2."""

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        return core_schema.no_info_after_validator_function(
            cls.validate,
            core_schema.str_schema(),
        )

    @classmethod
    def validate(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str):
            if not ObjectId.is_valid(v):
                raise ValueError("Invalid ObjectId")
            return v
        raise ValueError("Invalid ObjectId")


class ProductImage(BaseModel):
    """Product image with size variants."""
    image_id: str
    is_main: bool = False
    original_filename: str
    paths: Dict[str, str] = Field(default_factory=dict)  # size_256, size_512, etc.
    extracted_from: Optional[Dict[str, Any]] = None


class ProductDocument(BaseModel):
    """Product document (fiche technique, etc.)."""
    name: str
    path: str


class ProductSource(BaseModel):
    """Extraction source metadata."""
    source_id: str
    origin_file: str
    origin_file_type: str  # "pdf", "docx", "image", "video"
    page_number: Optional[int] = None
    extraction_type: str  # "text", "ocr", "vision", "audio"
    extracted_text: Optional[str] = None
    confidence_score: float = 0.0
    fields_extracted: List[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ManualEdit(BaseModel):
    """Manual edit history for a field."""
    field: str
    old_value: Any
    new_value: Any
    edited_date: datetime = Field(default_factory=datetime.utcnow)
    edited_by: Optional[str] = None


class ExtractionError(BaseModel):
    """Extraction error details."""
    error_type: str
    error_message: str
    field: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ExtractionMetadata(BaseModel):
    """Metadata about product extraction."""
    extraction_date: datetime = Field(default_factory=datetime.utcnow)
    extraction_job_id: Optional[str] = None
    status: str = "raw"  # raw, enriched, validated, exported
    validation_date: Optional[datetime] = None
    validated_by: Optional[str] = None
    field_confidence_scores: Dict[str, float] = Field(default_factory=dict)
    manual_edits: List[ManualEdit] = Field(default_factory=list)
    errors: List[ExtractionError] = Field(default_factory=list)


class ProductBase(BaseModel):
    """Base product fields (for create/update)."""

    # Identifiers
    default_code: Optional[str] = None
    barcode: Optional[str] = None
    Code_EAN: Optional[str] = None  # Nom exact Odoo

    # Product Information
    name: Optional[str] = None
    type: str = "product"  # product, service, consumable
    active: bool = True
    is_published: bool = False

    # Classification
    categ_id: Optional[str] = None
    country_of_origin: Optional[str] = None

    # Manufacturer
    constructeur: Optional[str] = None
    refConstructeur: Optional[str] = None  # Nom exact Odoo

    # Descriptions
    description_courte: Optional[str] = None
    description_ecommerce: Optional[str] = None
    features_description: Optional[str] = None

    # Dimensions (mm and kg)
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    weight: Optional[float] = None

    # Logistics
    hs_code: Optional[str] = None
    contient_du_lithium: bool = False

    # Pricing
    lst_price: Optional[float] = None
    taxes_id: List[str] = Field(default_factory=lambda: ["TVA 20%"])

    # Media
    images: List[ProductImage] = Field(default_factory=list)
    image_512: Optional[str] = None
    image_256: Optional[str] = None
    image_1920: Optional[str] = None
    image_1024: Optional[str] = None
    product_template_image_ids: List[int] = Field(default_factory=list)

    # Documents
    fiche_constructeur: Optional[ProductDocument] = None
    fiche_technique: Optional[ProductDocument] = None
    fiche_constructeur_nom: Optional[str] = None
    fiche_technique_nom: Optional[str] = None


class ProductCreate(ProductBase):
    """Schema for creating a new product."""
    pass


class ProductUpdate(BaseModel):
    """Schema for updating a product (all fields optional)."""

    # Identifiers
    default_code: Optional[str] = None
    barcode: Optional[str] = None
    Code_EAN: Optional[str] = None  # Nom exact Odoo

    # Product Information
    name: Optional[str] = None
    type: Optional[str] = None
    active: Optional[bool] = None
    is_published: Optional[bool] = None

    # Classification
    categ_id: Optional[str] = None
    country_of_origin: Optional[str] = None

    # Manufacturer
    constructeur: Optional[str] = None
    refConstructeur: Optional[str] = None  # Nom exact Odoo

    # Descriptions
    description_courte: Optional[str] = None
    description_ecommerce: Optional[str] = None
    features_description: Optional[str] = None

    # Dimensions
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    weight: Optional[float] = None

    # Logistics
    hs_code: Optional[str] = None
    contient_du_lithium: Optional[bool] = None

    # Pricing
    lst_price: Optional[float] = None
    taxes_id: Optional[List[str]] = None

    # Documents
    fiche_constructeur_nom: Optional[str] = None
    fiche_technique_nom: Optional[str] = None

    # Metadata for tracking edits
    edited_by: Optional[str] = None


class Product(ProductBase):
    """Complete product schema (response from DB)."""

    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")

    # Extraction Metadata
    sources: List[ProductSource] = Field(default_factory=list)
    extraction_metadata: ExtractionMetadata = Field(default_factory=ExtractionMetadata)

    # Odoo Integration
    product_tmpl_id: Optional[int] = None
    odoo_product_tmpl_id: Optional[int] = None
    odoo_id: Optional[int] = None

    # Deduplication
    duplicate_group_id: Optional[str] = None
    is_master_record: bool = False
    merged_from: List[str] = Field(default_factory=list)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    write_date: Optional[datetime] = None

    class Config:
        json_encoders = {ObjectId: str}
        populate_by_name = True


class ProductListResponse(BaseModel):
    """Response schema for product list."""
    products: List[Product]
    total: int
    page: int
    limit: int
    pages: int


class ProductResponse(BaseModel):
    """Response schema for single product."""
    product: Product
    message: Optional[str] = None
