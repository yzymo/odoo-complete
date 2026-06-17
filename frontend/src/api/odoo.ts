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

export interface OdooProductUpdate {
  name?: string;
  default_code?: string;
  barcode?: string;
  code_ean?: string;
  constructeur?: string;
  ref_constructeur?: string;
  description_courte?: string;
  description_ecommerce?: string;
  features_description?: string;
  country_of_origin?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  hs_code?: string;
  contient_du_lithium?: boolean;
  list_price?: number;
  active?: boolean;
  is_published?: boolean;
}

export interface OdooConnectionStatus {
  status: 'connected' | 'error';
  server_version?: string;
  user_id?: number;
  database?: string;
  url?: string;
  error?: string;
}

export interface OdooGalleryImage {
  id: number;
  name: string;
  /** base64-encoded PNG/JPEG, or null if blank */
  image_1920: string | null;
}

export interface OdooGalleryResponse {
  product_id: number;
  images: OdooGalleryImage[];
}

export interface SetImagesRequest {
  main_image_url?: string | null;
  /** Null = leave gallery untouched. Empty array + clear_gallery=true = wipe gallery. */
  gallery_urls?: string[] | null;
  /** When true (default) wipe existing gallery before writing new images. */
  clear_gallery?: boolean;
}

export interface SetImagesResponse {
  success: boolean;
  product_id: number;
  main_image_updated: boolean;
  gallery_images_written: number;
  gallery_cleared: boolean;
  failed_downloads: number;
  errors: string[] | null;
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
   * Update editable fields on an Odoo product.
   */
  updateProduct: async (
    productId: number,
    updates: OdooProductUpdate
  ): Promise<OdooProductDetail> => {
    const { data } = await apiClient.patch<{ product: OdooProductDetail }>(
      `/odoo/products/${productId}`,
      updates
    );
    return data.product;
  },

  /**
   * Fetch gallery images (product.image records) for an Odoo product template.
   */
  getProductGallery: async (productId: number): Promise<OdooGalleryResponse> => {
    const { data } = await apiClient.get<OdooGalleryResponse>(
      `/odoo/products/${productId}/gallery`,
    );
    return data;
  },

  /**
   * Apply explicitly-assigned images to an Odoo product.
   *
   * mainUrl     → image_1920. Pass null to leave the main image unchanged.
   * galleryUrls → product_template_image_ids. Empty array = clear existing gallery
   *               without adding new ones. Pass null to leave gallery unchanged.
   */
  applyImages: async (
    productId: number,
    mainUrl: string | null,
    galleryUrls: string[],
    clearGallery = true,
  ): Promise<SetImagesResponse> => {
    const body: SetImagesRequest = {
      main_image_url: mainUrl,
      // null = don't touch gallery; [] + clearGallery = clear it
      gallery_urls: galleryUrls.length > 0 ? galleryUrls : null,
      clear_gallery: galleryUrls.length > 0 ? clearGallery : false,
    };
    const { data } = await apiClient.post<SetImagesResponse>(
      `/odoo/products/${productId}/images`,
      body,
    );
    return data;
  },

  /**
   * Download images from supplier URLs and write them to an Odoo product.
   * index 0 of image_urls → image_1920 (main); rest → product_template_image_ids (gallery).
   */
  setProductImages: async (
    productId: number,
    imageUrls: string[],
    clearGallery = true,
  ): Promise<SetImagesResponse> => {
    const body: SetImagesRequest = {
      main_image_url: imageUrls[0] ?? null,
      gallery_urls: imageUrls.length > 1 ? imageUrls.slice(1) : [],
      clear_gallery: clearGallery,
    };
    const { data } = await apiClient.post<SetImagesResponse>(
      `/odoo/products/${productId}/images`,
      body,
    );
    return data;
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
