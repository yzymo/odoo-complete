"""
Storage service for MongoDB operations on products.
Handles CRUD operations and bulk inserts.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from bson import ObjectId
from pymongo.errors import BulkWriteError, DuplicateKeyError
from app.api.schemas.product import Product, ProductCreate, ProductUpdate, ProductSource, ExtractionMetadata
from app.core.database import get_database

logger = logging.getLogger(__name__)


class StorageService:
    """Service for storing and retrieving products from MongoDB."""

    def __init__(self, db):
        self.db = db
        self.products_collection = db.products

    @staticmethod
    def serialize_product(product: Dict[str, Any]) -> Dict[str, Any]:
        """Convert MongoDB document to JSON-serializable format and normalize fields."""
        if not product:
            return product

        # Convert ObjectId to string
        if "_id" in product:
            product["_id"] = str(product["_id"])

        # Clean string "null" values (OpenAI sometimes returns "null" as string)
        null_string_fields = [
            "length", "width", "height", "weight", "lst_price",
            "default_code", "barcode", "Code_EAN", "name", "categ_id",
            "country_of_origin", "constructeur", "refConstructeur",
            "description_courte", "description_ecommerce", "features_description",
            "hs_code", "fiche_constructeur_nom", "fiche_technique_nom"
        ]

        for field in null_string_fields:
            if field in product and product[field] == "null":
                product[field] = None

        # Ensure list fields have default values
        list_fields_defaults = {
            "images": [],
            "product_template_image_ids": [],
            "sources": [],
            "taxes_id": ["TVA 20%"],
            "merged_from": []
        }

        for field, default_value in list_fields_defaults.items():
            if field not in product or product[field] is None:
                product[field] = default_value

        # Ensure nested objects have defaults
        if "extraction_metadata" not in product or product["extraction_metadata"] is None:
            product["extraction_metadata"] = {
                "extraction_date": product.get("created_at"),
                "status": "raw",
                "field_confidence_scores": {},
                "manual_edits": [],
                "errors": []
            }
        else:
            # Ensure nested lists exist
            if "manual_edits" not in product["extraction_metadata"]:
                product["extraction_metadata"]["manual_edits"] = []
            if "errors" not in product["extraction_metadata"]:
                product["extraction_metadata"]["errors"] = []

        # Ensure boolean fields have defaults
        boolean_defaults = {
            "active": True,
            "is_published": False,
            "contient_du_lithium": False,
            "is_master_record": False
        }

        for field, default_value in boolean_defaults.items():
            if field not in product or product[field] is None:
                product[field] = default_value

        # Ensure string fields have defaults
        string_defaults = {
            "type": "product"
        }

        for field, default_value in string_defaults.items():
            if field not in product or product[field] is None:
                product[field] = default_value

        return product

    async def create_product(
        self,
        product_data: Dict[str, Any],
        sources: List[ProductSource] = None,
        extraction_job_id: str = None
    ) -> Dict[str, Any]:
        """
        Create a new product in the database.

        Args:
            product_data: Product fields dict
            sources: List of extraction sources
            extraction_job_id: ID of the extraction job that created this product

        Returns:
            Created product dict with _id
        """
        try:
            # Prepare document
            document = product_data.copy()
            document["sources"] = [s.dict() if hasattr(s, 'dict') else s for s in (sources or [])]
            document["extraction_metadata"] = {
                "extraction_date": datetime.utcnow(),
                "extraction_job_id": extraction_job_id,
                "status": "raw",
                "field_confidence_scores": product_data.get("confidence_scores", {}),
                "manual_edits": [],
                "errors": []
            }
            document["created_at"] = datetime.utcnow()
            document["updated_at"] = datetime.utcnow()

            # Remove confidence_scores from main document if present
            document.pop("confidence_scores", None)

            # Remove null/empty unique fields to avoid duplicate key errors
            # MongoDB unique sparse index doesn't allow multiple null values
            if not document.get("default_code"):
                document.pop("default_code", None)
            if not document.get("barcode"):
                document.pop("barcode", None)
            if not document.get("Code_EAN"):
                document.pop("Code_EAN", None)

            # Insert into MongoDB
            result = await self.products_collection.insert_one(document)
            document["_id"] = result.inserted_id

            logger.info(f"Created product with ID: {result.inserted_id}")
            return document

        except DuplicateKeyError as e:
            # Product already exists - try to enrich it instead
            logger.warning(f"Duplicate detected, attempting to enrich existing product")
            try:
                return await self.enrich_existing_product(
                    product_data=product_data,
                    sources=sources,
                    extraction_job_id=extraction_job_id
                )
            except Exception as enrich_error:
                logger.error(f"Failed to enrich existing product: {enrich_error}")
                raise ValueError(f"Product already exists and enrichment failed: {enrich_error}")
        except Exception as e:
            logger.error(f"Error creating product: {e}")
            raise

    async def enrich_existing_product(
        self,
        product_data: Dict[str, Any],
        sources: List[ProductSource] = None,
        extraction_job_id: str = None
    ) -> Dict[str, Any]:
        """
        Find and enrich an existing product with new data.
        Merges fields, keeping the most complete information.
        """
        try:
            # Find existing product by unique identifiers
            query = {}
            if product_data.get("default_code"):
                query = {"default_code": product_data["default_code"]}
            elif product_data.get("barcode"):
                query = {"barcode": product_data["barcode"]}
            elif product_data.get("Code_EAN"):
                query = {"Code_EAN": product_data["Code_EAN"]}
            else:
                # No unique identifier - can't find existing product
                raise ValueError("No unique identifier to find existing product")

            existing = await self.products_collection.find_one(query)

            if not existing:
                raise ValueError("Existing product not found")

            logger.info(f"Enriching existing product: {existing['_id']}")

            # Prepare enrichment data
            confidence_scores = product_data.get("confidence_scores", {})
            existing_scores = existing.get("extraction_metadata", {}).get("field_confidence_scores", {})

            # Merge fields: keep non-null values with higher confidence
            updates = {}
            for field, new_value in product_data.items():
                if field in ["confidence_scores", "_id"]:
                    continue

                # Skip if new value is None or empty
                if new_value is None or (isinstance(new_value, str) and not new_value.strip()):
                    continue

                existing_value = existing.get(field)
                new_confidence = confidence_scores.get(field, 0.5)
                existing_confidence = existing_scores.get(field, 0.5)

                # Keep new value if:
                # 1. Existing is null/empty, OR
                # 2. New confidence is higher
                should_update = (
                    existing_value is None or
                    (isinstance(existing_value, str) and not existing_value.strip()) or
                    new_confidence > existing_confidence
                )

                if should_update:
                    updates[field] = new_value
                    existing_scores[field] = new_confidence

            # Add new sources
            new_sources = [s.dict() if hasattr(s, 'dict') else s for s in (sources or [])]
            existing_sources = existing.get("sources", [])
            merged_sources = existing_sources + new_sources

            # Update the product
            update_doc = {
                "$set": {
                    **updates,
                    "extraction_metadata.field_confidence_scores": existing_scores,
                    "sources": merged_sources,
                    "updated_at": datetime.utcnow()
                }
            }

            result = await self.products_collection.update_one(
                {"_id": existing["_id"]},
                update_doc
            )

            logger.info(f"Enriched product {existing['_id']} with {len(updates)} fields")

            # Return updated document
            updated_product = await self.products_collection.find_one({"_id": existing["_id"]})
            return updated_product

        except Exception as e:
            logger.error(f"Error enriching product: {e}")
            raise

    async def bulk_insert_products(
        self,
        products: List[Dict[str, Any]],
        batch_size: int = 100
    ) -> Dict[str, Any]:
        """
        Bulk insert products with batching.

        Args:
            products: List of product dicts
            batch_size: Number of products per batch

        Returns:
            Dict with insert stats
        """
        total_inserted = 0
        total_errors = 0
        errors = []

        try:
            # Process in batches
            for i in range(0, len(products), batch_size):
                batch = products[i:i+batch_size]

                # Prepare documents
                documents = []
                for product in batch:
                    doc = product.copy()
                    doc["created_at"] = datetime.utcnow()
                    doc["updated_at"] = datetime.utcnow()
                    documents.append(doc)

                try:
                    result = await self.products_collection.insert_many(
                        documents,
                        ordered=False  # Continue on error
                    )
                    total_inserted += len(result.inserted_ids)
                    logger.info(f"Inserted batch of {len(result.inserted_ids)} products")

                except BulkWriteError as bwe:
                    inserted_count = bwe.details.get('nInserted', 0)
                    total_inserted += inserted_count
                    total_errors += len(bwe.details.get('writeErrors', []))
                    errors.extend(bwe.details.get('writeErrors', []))
                    logger.warning(f"Bulk write partial success: {inserted_count} inserted, {total_errors} errors")

            return {
                "total_inserted": total_inserted,
                "total_errors": total_errors,
                "errors": errors[:10]  # Return first 10 errors
            }

        except Exception as e:
            logger.error(f"Error in bulk insert: {e}")
            raise

    async def get_product_by_id(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Get a product by its MongoDB _id."""
        try:
            product = await self.products_collection.find_one({"_id": ObjectId(product_id)})
            return self.serialize_product(product) if product else None
        except Exception as e:
            logger.error(f"Error getting product {product_id}: {e}")
            return None

    async def get_product_by_code(self, default_code: str) -> Optional[Dict[str, Any]]:
        """Get a product by its default_code."""
        try:
            product = await self.products_collection.find_one({"default_code": default_code})
            return product
        except Exception as e:
            logger.error(f"Error getting product by code {default_code}: {e}")
            return None

    async def get_products(
        self,
        skip: int = 0,
        limit: int = 50,
        filters: Dict[str, Any] = None
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Get paginated list of products with optional filters.

        Args:
            skip: Number of products to skip
            limit: Maximum number of products to return
            filters: MongoDB query filters

        Returns:
            Tuple of (products list, total count)
        """
        try:
            query = filters or {}

            # Get total count
            total = await self.products_collection.count_documents(query)

            # Get products
            cursor = self.products_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
            products = await cursor.to_list(length=limit)

            # Serialize ObjectIds to strings
            products = [self.serialize_product(p) for p in products]

            return products, total

        except Exception as e:
            logger.error(f"Error getting products: {e}")
            return [], 0

    async def update_product(
        self,
        product_id: str,
        update_data: Dict[str, Any],
        edited_by: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Update a product and track manual edits.

        Args:
            product_id: Product MongoDB _id
            update_data: Fields to update
            edited_by: User who made the edit

        Returns:
            Updated product dict
        """
        try:
            # Get current product
            current = await self.get_product_by_id(product_id)
            if not current:
                return None

            # Track manual edits
            manual_edits = current.get("extraction_metadata", {}).get("manual_edits", [])

            for field, new_value in update_data.items():
                if field in current and current[field] != new_value:
                    manual_edits.append({
                        "field": field,
                        "old_value": current[field],
                        "new_value": new_value,
                        "edited_date": datetime.utcnow(),
                        "edited_by": edited_by
                    })

            # Update document
            update_data["updated_at"] = datetime.utcnow()
            update_data["extraction_metadata.manual_edits"] = manual_edits

            result = await self.products_collection.update_one(
                {"_id": ObjectId(product_id)},
                {"$set": update_data}
            )

            if result.modified_count > 0:
                logger.info(f"Updated product {product_id}")
                return await self.get_product_by_id(product_id)
            else:
                logger.warning(f"No changes made to product {product_id}")
                return current

        except Exception as e:
            logger.error(f"Error updating product {product_id}: {e}")
            raise

    async def delete_product(self, product_id: str) -> bool:
        """Delete a product by ID."""
        try:
            result = await self.products_collection.delete_one({"_id": ObjectId(product_id)})
            if result.deleted_count > 0:
                logger.info(f"Deleted product {product_id}")
                return True
            else:
                logger.warning(f"Product {product_id} not found")
                return False
        except Exception as e:
            logger.error(f"Error deleting product {product_id}: {e}")
            return False

    async def search_products(
        self,
        search_text: str,
        skip: int = 0,
        limit: int = 50,
        filters: Dict[str, Any] = None
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Full-text search on products with optional additional filters.

        Args:
            search_text: Text to search for
            skip: Pagination skip
            limit: Max results
            filters: Additional filters (status, source_type)

        Returns:
            Tuple of (products, total count)
        """
        try:
            query = {"$text": {"$search": search_text}}

            # Add additional filters
            if filters:
                additional_query = self._build_filter_query(filters)
                query = {"$and": [query, additional_query]}

            total = await self.products_collection.count_documents(query)
            cursor = self.products_collection.find(query).skip(skip).limit(limit)
            products = await cursor.to_list(length=limit)

            # Serialize ObjectIds to strings
            products = [self.serialize_product(p) for p in products]

            return products, total
        except Exception as e:
            logger.error(f"Error searching products: {e}")
            return [], 0

    def _build_filter_query(self, filters: Dict[str, Any]) -> Dict[str, Any]:
        """Build MongoDB query from filter dict."""
        query = {}

        if "status" in filters:
            query["extraction_metadata.status"] = filters["status"]

        if "source_type" in filters:
            query["sources.source_type"] = filters["source_type"]

        return query

    async def get_products_with_filters(
        self,
        filters: Dict[str, Any],
        skip: int = 0,
        limit: int = 50
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Get products with multiple filters.

        Args:
            filters: Dict with filter keys (status, source_type)
            skip: Pagination skip
            limit: Max results

        Returns:
            Tuple of (products, total count)
        """
        try:
            query = self._build_filter_query(filters)
            return await self.get_products(skip, limit, query)
        except Exception as e:
            logger.error(f"Error getting products with filters: {e}")
            return [], 0

    async def get_products_by_status(
        self,
        status: str,
        skip: int = 0,
        limit: int = 50
    ) -> tuple[List[Dict[str, Any]], int]:
        """Get products filtered by extraction status."""
        filters = {"extraction_metadata.status": status}
        return await self.get_products(skip, limit, filters)

    async def validate_product(
        self,
        product_id: str,
        validated_by: str = None
    ) -> Optional[Dict[str, Any]]:
        """Mark a product as validated."""
        update_data = {
            "extraction_metadata.status": "validated",
            "extraction_metadata.validation_date": datetime.utcnow(),
            "extraction_metadata.validated_by": validated_by,
            "updated_at": datetime.utcnow()
        }

        result = await self.products_collection.update_one(
            {"_id": ObjectId(product_id)},
            {"$set": update_data}
        )

        if result.modified_count > 0:
            logger.info(f"Validated product {product_id}")
            return await self.get_product_by_id(product_id)
        return None

    async def get_duplicates_by_code(
        self,
        skip: int = 0,
        limit: int = 50,
        min_count: int = 2
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Get products grouped by default_code to identify duplicates.

        Uses MongoDB aggregation to group products by their default_code
        and returns only groups with at least `min_count` products.

        Args:
            skip: Number of groups to skip
            limit: Maximum number of groups to return
            min_count: Minimum products per group (default 2 for duplicates)

        Returns:
            Tuple of (list of groups, total count of groups)
        """
        try:
            # Aggregation pipeline to group by default_code
            pipeline = [
                # Match only products with non-null default_code
                {
                    "$match": {
                        "default_code": {"$ne": None, "$exists": True, "$ne": ""}
                    }
                },
                # Group by default_code
                {
                    "$group": {
                        "_id": "$default_code",
                        "count": {"$sum": 1},
                        "products": {
                            "$push": {
                                "_id": {"$toString": "$_id"},
                                "name": "$name",
                                "constructeur": "$constructeur",
                                "barcode": "$barcode",
                                "created_at": "$created_at",
                                "status": "$extraction_metadata.status",
                                "source_type": {"$arrayElemAt": ["$sources.source_type", 0]},
                                "image_count": {"$size": {"$ifNull": ["$images", []]}}
                            }
                        }
                    }
                },
                # Filter groups with at least min_count products
                {
                    "$match": {
                        "count": {"$gte": min_count}
                    }
                },
                # Sort by count descending (most duplicates first)
                {
                    "$sort": {"count": -1}
                }
            ]

            # Get total count first
            count_pipeline = pipeline + [{"$count": "total"}]
            count_result = await self.products_collection.aggregate(count_pipeline).to_list(1)
            total = count_result[0]["total"] if count_result else 0

            # Get paginated results
            paginated_pipeline = pipeline + [
                {"$skip": skip},
                {"$limit": limit}
            ]

            groups = await self.products_collection.aggregate(paginated_pipeline).to_list(limit)

            # Format response
            formatted_groups = [
                {
                    "default_code": group["_id"],
                    "count": group["count"],
                    "products": group["products"]
                }
                for group in groups
            ]

            logger.info(f"Found {total} duplicate groups (showing {len(formatted_groups)})")
            return formatted_groups, total

        except Exception as e:
            logger.error(f"Error getting duplicates by code: {e}")
            return [], 0

    async def get_products_by_default_code(
        self,
        default_code: str
    ) -> List[Dict[str, Any]]:
        """
        Get all products with a specific default_code.

        Args:
            default_code: The default_code to search for

        Returns:
            List of products with that default_code
        """
        try:
            cursor = self.products_collection.find(
                {"default_code": default_code}
            ).sort("created_at", -1)

            products = await cursor.to_list(length=100)

            # Serialize all products
            products = [self.serialize_product(p) for p in products]

            logger.info(f"Found {len(products)} products with code {default_code}")
            return products

        except Exception as e:
            logger.error(f"Error getting products by code {default_code}: {e}")
            return []
