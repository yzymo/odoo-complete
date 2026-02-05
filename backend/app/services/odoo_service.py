"""
Odoo XML-RPC service for connecting to Odoo instances.
Handles authentication and product operations.
"""

import xmlrpc.client
import logging
from typing import List, Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)


class OdooService:
    """Service for interacting with Odoo via XML-RPC."""

    def __init__(
        self,
        url: str = None,
        db: str = None,
        username: str = None,
        password: str = None
    ):
        """
        Initialize Odoo connection parameters.

        Args:
            url: Odoo instance URL
            db: Database name
            username: Odoo username
            password: Odoo password/API key
        """
        self.url = (url or settings.odoo_url).rstrip('/')
        self.db = db or settings.odoo_db
        self.username = username or settings.odoo_username
        self.password = password or settings.odoo_password
        self._uid = None
        self._common = None
        self._models = None

    def _get_common_endpoint(self):
        """Get the common XML-RPC endpoint."""
        if self._common is None:
            self._common = xmlrpc.client.ServerProxy(
                f'{self.url}/xmlrpc/2/common',
                allow_none=True
            )
        return self._common

    def _get_models_endpoint(self):
        """Get the object/models XML-RPC endpoint."""
        if self._models is None:
            self._models = xmlrpc.client.ServerProxy(
                f'{self.url}/xmlrpc/2/object',
                allow_none=True
            )
        return self._models

    def authenticate(self) -> int:
        """
        Authenticate with Odoo and return the user ID.

        Returns:
            User ID if successful

        Raises:
            Exception if authentication fails
        """
        if self._uid is not None:
            return self._uid

        try:
            common = self._get_common_endpoint()
            self._uid = common.authenticate(
                self.db,
                self.username,
                self.password,
                {}
            )

            if not self._uid:
                raise Exception("Authentication failed - invalid credentials")

            logger.info(f"Authenticated with Odoo as user ID: {self._uid}")
            return self._uid

        except Exception as e:
            logger.error(f"Odoo authentication error: {e}")
            raise

    def execute_kw(
        self,
        model: str,
        method: str,
        args: List = None,
        kwargs: Dict = None
    ) -> Any:
        """
        Execute a method on an Odoo model.

        Args:
            model: Odoo model name (e.g., 'product.template')
            method: Method to call (e.g., 'search_read')
            args: Positional arguments
            kwargs: Keyword arguments

        Returns:
            Result from Odoo
        """
        uid = self.authenticate()
        models = self._get_models_endpoint()

        try:
            result = models.execute_kw(
                self.db,
                uid,
                self.password,
                model,
                method,
                args or [],
                kwargs or {}
            )
            return result

        except Exception as e:
            logger.error(f"Odoo execute_kw error on {model}.{method}: {e}")
            raise

    # Standard fields to retrieve from Odoo (matching our catalog schema)
    PRODUCT_FIELDS = [
        "id",
        "default_code",
        "name",
        "type",
        "categ_id",
        "country_of_origin",
        "active",
        "description_courte",
        "description_ecommerce",
        "image_512",
        "image_256",
        "image_1920",
        "image_1024",
        "image_128",  # For list view thumbnail
        "product_template_image_ids",
        "is_published",
        "constructeur",
        "refConstructeur",
        "barcode",
        "fiche_constructeur_nom",
        "fiche_constructeur",
        "fiche_technique_nom",
        "fiche_technique",
        "length",
        "width",
        "height",
        "weight",
        "contient_du_lithium",
        "hs_code",
        "list_price",
        "write_date",
        "features_description",
        "Code_EAN",
        "taxes_id",
        "create_date",
    ]

    # Lighter fields for list view
    PRODUCT_LIST_FIELDS = [
        "id",
        "name",
        "default_code",
        "barcode",
        "Code_EAN",
        "list_price",
        "categ_id",
        "type",
        "active",
        "is_published",
        "constructeur",
        "refConstructeur",
        "image_128",
        "write_date",
    ]

    def get_products(
        self,
        limit: int = 50,
        offset: int = 0,
        search_domain: List = None,
        fields: List[str] = None
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Get products from Odoo with pagination.

        Args:
            limit: Maximum number of products to return
            offset: Number of products to skip
            search_domain: Odoo domain filter (e.g., [['active', '=', True]])
            fields: List of fields to retrieve

        Returns:
            Tuple of (products list, total count)
        """
        domain = search_domain or []

        # Default fields to retrieve (lighter version for list)
        if fields is None:
            fields = self.PRODUCT_LIST_FIELDS

        try:
            # Get total count
            total = self.execute_kw(
                'product.template',
                'search_count',
                [domain]
            )

            # Get products
            products = self.execute_kw(
                'product.template',
                'search_read',
                [domain],
                {
                    'fields': fields,
                    'limit': limit,
                    'offset': offset,
                    'order': 'write_date desc'
                }
            )

            logger.info(f"Retrieved {len(products)} products from Odoo (total: {total})")
            return products, total

        except Exception as e:
            logger.error(f"Error getting Odoo products: {e}")
            raise

    def get_product_by_id(
        self,
        product_id: int,
        fields: List[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get a single product by ID with all details.

        Args:
            product_id: Odoo product.template ID
            fields: List of fields to retrieve

        Returns:
            Product dict or None if not found
        """
        # Use full PRODUCT_FIELDS for detail view
        if fields is None:
            fields = self.PRODUCT_FIELDS

        try:
            products = self.execute_kw(
                'product.template',
                'search_read',
                [[['id', '=', product_id]]],
                {'fields': fields}
            )

            if products:
                return products[0]
            return None

        except Exception as e:
            logger.error(f"Error getting Odoo product {product_id}: {e}")
            raise

    def search_products(
        self,
        search_term: str,
        limit: int = 50,
        offset: int = 0
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Search products by name, default_code, or barcode.

        Args:
            search_term: Search string
            limit: Maximum results
            offset: Pagination offset

        Returns:
            Tuple of (products list, total count)
        """
        # Search in name, default_code, and barcode
        domain = [
            '|', '|',
            ['name', 'ilike', search_term],
            ['default_code', 'ilike', search_term],
            ['barcode', 'ilike', search_term]
        ]

        return self.get_products(
            limit=limit,
            offset=offset,
            search_domain=domain
        )

    def test_connection(self) -> Dict[str, Any]:
        """
        Test the connection to Odoo.

        Returns:
            Dict with connection status and info
        """
        try:
            common = self._get_common_endpoint()

            # Get server version
            version = common.version()

            # Try to authenticate
            uid = self.authenticate()

            return {
                "status": "connected",
                "server_version": version.get('server_version'),
                "user_id": uid,
                "database": self.db,
                "url": self.url
            }

        except Exception as e:
            logger.error(f"Odoo connection test failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "url": self.url,
                "database": self.db
            }


# Singleton instance for reuse
_odoo_service = None


def get_odoo_service() -> OdooService:
    """Get or create the Odoo service singleton."""
    global _odoo_service
    if _odoo_service is None:
        _odoo_service = OdooService()
    return _odoo_service
