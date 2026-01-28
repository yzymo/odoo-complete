/**
 * Products list page with search, filters, and pagination.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { productApi } from '../api/products';
import { Product } from '../types/product';
import { Search, Package, CheckCircle, Clock, AlertCircle, Download } from 'lucide-react';

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['products', page, search, statusFilter],
    queryFn: () =>
      productApi.getProducts({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter || undefined,
      }),
  });

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);

      // Call API to export
      const blob = await productApi.exportToExcel({
        status: statusFilter || undefined,
        search: search || undefined,
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      raw: {
        color: 'bg-yellow-100 text-yellow-800',
        icon: Clock,
        label: 'Raw',
      },
      validated: {
        color: 'bg-green-100 text-green-800',
        icon: CheckCircle,
        label: 'Validated',
      },
      exported: {
        color: 'bg-blue-100 text-blue-800',
        icon: Package,
        label: 'Exported',
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      color: 'bg-gray-100 text-gray-800',
      icon: AlertCircle,
      label: status,
    };

    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}
      >
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAverageConfidence = (product: Product) => {
    const scores = Object.values(
      product.extraction_metadata?.field_confidence_scores || {}
    );
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Products</h1>
        <p className="text-gray-600">
          Browse and manage extracted product information.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Status</option>
            <option value="raw">Raw</option>
            <option value="validated">Validated</option>
            <option value="exported">Exported</option>
          </select>

          {/* Export Button */}
          <button
            onClick={handleExportExcel}
            disabled={isExporting || !data?.total}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export Excel
              </>
            )}
          </button>

          {/* Stats */}
          <div className="flex items-center justify-end text-sm text-gray-600">
            {data && (
              <span>
                {data.total} products ({data.pages} pages)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading products. Please try again.</p>
        </div>
      )}

      {/* Product Grid */}
      {data && data.products.length > 0 && (
        <div className="grid grid-cols-1 gap-4 mb-6">
          {data.products.map((product) => {
            const avgConfidence = getAverageConfidence(product);

            return (
              <div
                key={product._id}
                onClick={() => navigate(`/products/${product._id}`)}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {product.name || 'Unnamed Product'}
                      </h3>
                      {getStatusBadge(product.extraction_metadata?.status)}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {product.default_code && (
                        <div>
                          <span className="text-gray-600">Code:</span>
                          <p className="font-medium">{product.default_code}</p>
                        </div>
                      )}
                      {product.constructeur && (
                        <div>
                          <span className="text-gray-600">Manufacturer:</span>
                          <p className="font-medium">{product.constructeur}</p>
                        </div>
                      )}
                      {product.lst_price && (
                        <div>
                          <span className="text-gray-600">Price:</span>
                          <p className="font-medium">{product.lst_price} €</p>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-600">Confidence:</span>
                        <p className={`font-medium ${getConfidenceColor(avgConfidence)}`}>
                          {(avgConfidence * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>

                    {product.description_courte && (
                      <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                        {product.description_courte}
                      </p>
                    )}
                  </div>

                  {product.images.length > 0 && (
                    <div className="ml-4">
                      <div className="w-16 h-16 bg-gray-100 rounded-md flex items-center justify-center">
                        <Package className="h-8 w-8 text-gray-400" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {data && data.products.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600">No products found.</p>
          <p className="text-sm text-gray-500 mt-1">
            Try uploading a PDF to extract products.
          </p>
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-700">
            Page {page} of {data.pages}
          </span>
          <button
            onClick={() => setPage(Math.min(data.pages, page + 1))}
            disabled={page === data.pages}
            className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
