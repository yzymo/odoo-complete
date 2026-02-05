/**
 * API client for Odoo operations.
 */

import apiClient from './client';

export interface OdooProduct {
  id: number;
  name: string;
  default_code: string | null;
  barcode: string | null;
  code_ean: string | null;
  list_price: number;
  category: string | null;
  category_id: number | null;
  type: string;
  active: boolean;
  is_published: boolean;
  constructeur: string | null;
  ref_constructeur: string | null;
  image_small: string | null; // Base64 encoded
  write_date: string;
}

export interface OdooProductDetail extends OdooProduct {
  // Descriptions
  description_courte: string | null;
  description_ecommerce: string | null;
  features_description: string | null;

  // Category & Origin
  country_of_origin: string | null;

  // Dimensions (mm/kg)
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;

  // Logistics
  hs_code: string | null;
  contient_du_lithium: boolean | null;

  // Tax
  taxes_id: number[] | null;

  // Images (Base64 encoded)
  image_1920: string | null;
  image_1024: string | null;
  image_512: string | null;
  image_256: string | null;
  image_128: string | null;
  product_template_image_ids: number[] | null;

  // Technical documents
  fiche_constructeur_nom: string | null;
  fiche_constructeur: string | null;
  fiche_technique_nom: string | null;
  fiche_technique: string | null;

  // Dates
  create_date: string;
}

export interface OdooProductListResponse {
  products: OdooProduct[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface OdooConnectionStatus {
  status: 'connected' | 'error';
  server_version?: string;
  user_id?: number;
  database?: string;
  url?: string;
  error?: string;
}

export const odooApi = {
  /**
   * Test the connection to Odoo.
   */
  testConnection: async (): Promise<OdooConnectionStatus> => {
    const { data } = await apiClient.get<OdooConnectionStatus>('/odoo/test-connection');
    return data;
  },

  /**
   * Get paginated list of products from Odoo.
   */
  getProducts: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    active_only?: boolean;
  }): Promise<OdooProductListResponse> => {
    const { data } = await apiClient.get<OdooProductListResponse>('/odoo/products', {
      params,
    });
    return data;
  },

  /**
   * Get a single product from Odoo by ID.
   */
  getProduct: async (productId: number): Promise<OdooProductDetail> => {
    const { data } = await apiClient.get<{ product: OdooProductDetail }>(
      `/odoo/products/${productId}`
    );
    return data.product;
  },

  /**
   * Find matching products in our catalog for an Odoo product.
   */
  findCatalogMatch: async (productId: number, maxResults?: number): Promise<MatchingResponse> => {
    const { data } = await apiClient.get(`/odoo/products/${productId}/match`, {
      params: maxResults ? { max_results: maxResults } : undefined,
    });
    return data;
  },
};

// Matching types
export interface CatalogMatch {
  product_id: string;
  product_name: string;
  default_code: string | null;
  barcode: string | null;
  constructeur: string | null;
  score: number;
  match_type: 'exact_barcode' | 'exact_ean' | 'exact_code' | 'manufacturer_ref' | 'fuzzy_name_high' | 'fuzzy_name_medium' | 'partial_code';
  match_details: string;
}

export interface MatchingResponse {
  odoo_product: {
    id: number;
    name: string;
    default_code: string | null;
    barcode: string | null;
    code_ean: string | null;
    constructeur: string | null;
    ref_constructeur: string | null;
    image_128: string | null;
  };
  search_criteria: {
    default_code: string | null;
    barcode: string | null;
    code_ean: string | null;
    ref_constructeur: string | null;
    constructeur: string | null;
    name: string;
  };
  matches: CatalogMatch[];
  total_matches: number;
}
