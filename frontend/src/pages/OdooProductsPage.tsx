/**
 * Page for viewing products from Odoo instance.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { odooApi, OdooProduct } from '../api/odoo';
import MatchingModal from '../components/MatchingModal';
import {
  Server,
  Package,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Link2,
} from 'lucide-react';

export default function OdooProductsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [matchingProduct, setMatchingProduct] = useState<OdooProduct | null>(null);
  const limit = 25;

  // Test connection query
  const {
    data: connectionStatus,
    isLoading: isTestingConnection,
    refetch: retestConnection,
  } = useQuery({
    queryKey: ['odoo-connection'],
    queryFn: () => odooApi.testConnection(),
    retry: false,
  });

  // Products query
  const {
    data: productsData,
    isLoading: isLoadingProducts,
    error: productsError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['odoo-products', page, limit, search],
    queryFn: () => odooApi.getProducts({ page, limit, search: search || undefined }),
    enabled: connectionStatus?.status === 'connected',
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Server className="h-8 w-8 text-purple-600" />
              Odoo Products
            </h1>
            <p className="text-gray-600 mt-1">
              Browse and sync products from your Odoo instance
            </p>
          </div>

          <button
            onClick={() => {
              retestConnection();
              refetchProducts();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isTestingConnection ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                <span className="text-gray-600">Testing connection...</span>
              </>
            ) : connectionStatus?.status === 'connected' ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-green-700 font-medium">Connected to Odoo</span>
                <span className="text-gray-500 text-sm">
                  | {connectionStatus.url} | DB: {connectionStatus.database}
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                <span className="text-red-700 font-medium">Connection failed</span>
                {connectionStatus?.error && (
                  <span className="text-red-500 text-sm">| {connectionStatus.error}</span>
                )}
              </>
            )}
          </div>

          {connectionStatus?.server_version && (
            <span className="text-sm text-gray-500">
              Odoo v{connectionStatus.server_version}
            </span>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {connectionStatus?.status === 'connected' && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, code, or barcode..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={clearSearch}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                Clear
              </button>
            )}
          </form>
        </div>
      )}

      {/* Products Table */}
      {connectionStatus?.status === 'connected' && (
        <>
          {isLoadingProducts ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : productsError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error loading products from Odoo</p>
            </div>
          ) : productsData && productsData.products.length > 0 ? (
            <>
              {/* Stats */}
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, productsData.total)} of{' '}
                  <strong>{productsData.total}</strong> products
                  {search && <span> matching "{search}"</span>}
                </p>
              </div>

              {/* Table */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Category
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Constructeur
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Price
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {productsData.products.map((product) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        onViewDetail={() => navigate(`/odoo/products/${product.id}`)}
                        onFindMatch={() => setMatchingProduct(product)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {productsData.pages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Page {productsData.page} of {productsData.pages}
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="flex items-center gap-1 px-4 py-2 bg-white border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(productsData.pages, p + 1))}
                      disabled={page === productsData.pages}
                      className="flex items-center gap-1 px-4 py-2 bg-white border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No products found</h3>
              <p className="text-gray-500 mt-1">
                {search
                  ? `No products match "${search}"`
                  : 'No products available in Odoo'}
              </p>
            </div>
          )}
        </>
      )}

      {/* Connection Failed State */}
      {connectionStatus?.status === 'error' && (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <XCircle className="h-12 w-12 mx-auto text-red-400 mb-3" />
          <h3 className="text-lg font-medium text-gray-900">Cannot connect to Odoo</h3>
          <p className="text-gray-500 mt-1">
            Please check your Odoo configuration and try again.
          </p>
          <button
            onClick={() => retestConnection()}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Matching Modal */}
      {matchingProduct && (
        <MatchingModal
          product={matchingProduct}
          isOpen={!!matchingProduct}
          onClose={() => setMatchingProduct(null)}
        />
      )}
    </div>
  );
}

function ProductRow({
  product,
  onViewDetail,
  onFindMatch,
}: {
  product: OdooProduct;
  onViewDetail: () => void;
  onFindMatch: () => void;
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {product.image_small ? (
            <img
              src={`data:image/png;base64,${product.image_small}`}
              alt={product.name}
              className="w-10 h-10 rounded object-cover bg-gray-100"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
              <Package className="h-5 w-5 text-gray-400" />
            </div>
          )}
          <div>
            <p className="font-medium text-gray-900 truncate max-w-xs" title={product.name}>
              {product.name}
            </p>
            {(product.barcode || product.code_ean) && (
              <p className="text-xs text-gray-500">
                {product.code_ean ? `EAN: ${product.code_ean}` : `Barcode: ${product.barcode}`}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div>
          <span className="font-mono text-sm text-gray-700">
            {product.default_code || '-'}
          </span>
          {product.ref_constructeur && (
            <p className="text-xs text-gray-500">Ref: {product.ref_constructeur}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600">{product.category || '-'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600">{product.constructeur || '-'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="font-medium text-gray-900">
          {product.list_price?.toFixed(2) || '0.00'} €
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              product.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {product.active ? 'Active' : 'Inactive'}
          </span>
          {product.is_published && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Published
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onFindMatch}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
            title="Chercher correspondances dans le catalogue"
          >
            <Link2 className="h-4 w-4" />
            Match
          </button>
          <button
            onClick={onViewDetail}
            className="text-purple-600 hover:text-purple-800 text-sm flex items-center gap-1"
          >
            View
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}
