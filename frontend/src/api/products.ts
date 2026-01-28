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
} from '../types/product';

export const productApi = {
  /**
   * Get paginated list of products with optional filters.
   */
  getProducts: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
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
   * Get extraction sources for a product.
   */
  getProductSources: async (id: string) => {
    const { data } = await apiClient.get(`/products/${id}/sources`);
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
   * Extract products from all PDF files in a directory.
   */
  extractFromDirectory: async (params: {
    source_directory: string;
    recursive: boolean;
  }): Promise<any> => {
    const { data } = await apiClient.post(
      '/extraction/extract-directory',
      params
    );
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
