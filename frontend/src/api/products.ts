/**
 * API client for product operations.
 */

import apiClient from './client';
import type {
  Product,
  ProductListResponse,
  ProductResponse,
  ProductUpdate,
  ExtractionResult,
  ExtractionJob,
  DuplicatesByCodeResponse,
  OdooMatchInfo,
} from '../types/product';

/** One Odoo product candidate for a catalog product (continuous score). */
export interface ProductOdooMatch {
  odoo_id: number;
  name: string;
  default_code: string | null;
  barcode: string | null;
  code_ean: string | null;
  constructeur: string | null;
  ref_constructeur: string | null;
  list_price: number | null;
  image_128: string | null;
  score: number;
  match_type: string;
  match_label: string;
}

export interface ProductOdooMatchesResponse {
  product_id: string;
  matches: ProductOdooMatch[];
  total_matches: number;
  /** Existing recorded link, if the product was already matched. */
  odoo_match: OdooMatchInfo | null;
}

export interface MatchToOdooResponse {
  success: boolean;
  odoo_id: number;
  applied_fields: string[];
  odoo_match: OdooMatchInfo;
  message: string;
}

export const productApi = {
  /**
   * Get paginated list of products with optional filters.
   */
  getProducts: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    source_type?: string;
  }): Promise<ProductListResponse> => {
    const { data } = await apiClient.get<ProductListResponse>('/products', {
      params,
    });
    return data;
  },

  /**
   * Get a single product by ID.
   */
  getProduct: async (id: string): Promise<Product> => {
    const { data } = await apiClient.get<ProductResponse>(`/products/${id}`);
    return data.product;
  },

  /**
   * Update an existing product.
   */
  updateProduct: async (
    id: string,
    updates: ProductUpdate
  ): Promise<Product> => {
    const { data } = await apiClient.patch<ProductResponse>(
      `/products/${id}`,
      updates
    );
    return data.product;
  },

  /**
   * Delete a product.
   */
  deleteProduct: async (id: string): Promise<void> => {
    await apiClient.delete(`/products/${id}`);
  },

  /**
   * Mark a product as validated.
   */
  validateProduct: async (
    id: string,
    validated_by?: string
  ): Promise<Product> => {
    const { data } = await apiClient.patch<ProductResponse>(
      `/products/${id}/validate`,
      null,
      {
        params: { validated_by },
      }
    );
    return data.product;
  },

  /**
   * Get products grouped by default_code to identify duplicates.
   */
  getDuplicatesByCode: async (params?: {
    page?: number;
    limit?: number;
    min_count?: number;
  }): Promise<DuplicatesByCodeResponse> => {
    const { data } = await apiClient.get<DuplicatesByCodeResponse>(
      '/products/duplicates/by-code',
      { params }
    );
    return data;
  },

  /**
   * Get extraction sources for a product.
   */
  getProductSources: async (id: string) => {
    const { data } = await apiClient.get(`/products/${id}/sources`);
    return data;
  },

  /**
   * Find matching Odoo products for a catalog product (continuous scoring).
   */
  getOdooMatches: async (id: string): Promise<ProductOdooMatchesResponse> => {
    const { data } = await apiClient.get<ProductOdooMatchesResponse>(
      `/products/${id}/odoo-matches`
    );
    return data;
  },

  /**
   * Apply a catalog product's fields into the matched Odoo product and record the link.
   */
  matchToOdoo: async (
    id: string,
    body: { odoo_id: number; score?: number; match_label?: string; auto?: boolean }
  ): Promise<MatchToOdooResponse> => {
    const { data } = await apiClient.post<MatchToOdooResponse>(
      `/products/${id}/match-to-odoo`,
      body
    );
    return data;
  },

  /**
   * Extract products from an uploaded PDF file.
   */
  extractFromFile: async (file: File): Promise<ExtractionResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await apiClient.post<ExtractionResult>(
      '/extraction/extract-file',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return data;
  },

  /**
   * Extract products from all PDF files in a directory (async — returns job_id).
   */
  extractFromDirectory: async (params: {
    source_directory: string;
    recursive: boolean;
  }): Promise<{ job_id: string; status: string; total_files: number }> => {
    const { data } = await apiClient.post('/extraction/extract-directory', params);
    return data;
  },

  /**
   * Upload multiple PDF files from the browser (async — returns job_id).
   */
  uploadFiles: async (files: File[]): Promise<{ job_id: string; status: string; total_files: number }> => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    const { data } = await apiClient.post('/extraction/upload-files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  /**
   * Poll an extraction job for per-file progress and final results.
   */
  getExtractionJob: async (jobId: string): Promise<ExtractionJob> => {
    const { data } = await apiClient.get<ExtractionJob>(`/extraction/jobs/${jobId}`);
    return data;
  },

  /**
   * Export all products to Excel file.
   */
  exportToExcel: async (params?: {
    status?: string;
    search?: string;
    limit?: number;
  }): Promise<Blob> => {
    const { data } = await apiClient.get('/export/excel', {
      params,
      responseType: 'blob',
    });
    return data;
  },

  /**
   * Get export statistics.
   */
  getExportStats: async (): Promise<{
    total_products: number;
    by_status: Record<string, number>;
    with_images: number;
    without_images: number;
  }> => {
    const { data } = await apiClient.get('/export/stats');
    return data;
  },

  /**
   * Download Excel template.
   */
  downloadTemplate: async (): Promise<Blob> => {
    const { data } = await apiClient.get('/export/excel/template', {
      responseType: 'blob',
    });
    return data;
  },
};
