/**
 * Page for viewing and managing duplicate products grouped by default_code.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { productApi } from '../api/products';
import {
  Copy,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Package,
  AlertTriangle,
  Image as ImageIcon
} from 'lucide-react';

export default function DuplicatesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const limit = 20;

  const { data, isLoading, error } = useQuery({
    queryKey: ['duplicates-by-code', page, limit],
    queryFn: () => productApi.getDuplicatesByCode({ page, limit, min_count: 2 }),
  });

  const toggleGroup = (code: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(code)) {
        newSet.delete(code);
      } else {
        newSet.add(code);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    if (data?.groups) {
      setExpandedGroups(new Set(data.groups.map((g) => g.default_code)));
    }
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading duplicates</p>
        </div>
      </div>
    );
  }

  const totalDuplicateProducts = data?.groups?.reduce((sum, g) => sum + g.count, 0) || 0;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Copy className="h-8 w-8 text-orange-500" />
              Duplicate Products
            </h1>
            <p className="text-gray-600 mt-1">
              Products grouped by default_code - {data?.total_groups || 0} groups with {totalDuplicateProducts} products
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data?.total_groups || 0}</p>
              <p className="text-sm text-gray-500">Duplicate Groups</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalDuplicateProducts}</p>
              <p className="text-sm text-gray-500">Total Duplicate Products</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Copy className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.groups?.length ? Math.max(...data.groups.map((g) => g.count)) : 0}
              </p>
              <p className="text-sm text-gray-500">Max Duplicates</p>
            </div>
          </div>
        </div>
      </div>

      {/* No duplicates message */}
      {(!data?.groups || data.groups.length === 0) && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <Package className="h-12 w-12 mx-auto text-green-500 mb-3" />
          <h3 className="text-lg font-medium text-green-900">No Duplicates Found</h3>
          <p className="text-green-700 mt-1">
            All products have unique default_code values.
          </p>
        </div>
      )}

      {/* Duplicate Groups List */}
      {data?.groups && data.groups.length > 0 && (
        <div className="space-y-3">
          {data.groups.map((group) => (
            <div
              key={group.default_code}
              className="bg-white rounded-lg shadow overflow-hidden"
            >
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.default_code)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedGroups.has(group.default_code) ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-gray-900">
                        {group.default_code}
                      </span>
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                        {group.count} products
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {group.products[0]?.name || 'Unknown product'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {group.products.some((p) => p.image_count > 0) && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <ImageIcon className="h-4 w-4" />
                      Has images
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded Products */}
              {expandedGroups.has(group.default_code) && (
                <div className="border-t border-gray-200">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Name
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Manufacturer
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Source
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Images
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {group.products.map((product, idx) => (
                        <tr
                          key={product._id}
                          className={idx === 0 ? 'bg-blue-50' : 'hover:bg-gray-50'}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {idx === 0 && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                  First
                                </span>
                              )}
                              <span className="text-sm text-gray-900 truncate max-w-xs">
                                {product.name || 'Unnamed'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {product.constructeur || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${
                                product.source_type === 'web'
                                  ? 'bg-purple-100 text-purple-700'
                                  : product.source_type === 'directory'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {product.source_type || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${
                                product.status === 'validated'
                                  ? 'bg-green-100 text-green-700'
                                  : product.status === 'exported'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {product.status || 'raw'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {product.image_count > 0 ? (
                              <span className="flex items-center gap-1">
                                <ImageIcon className="h-4 w-4 text-green-500" />
                                {product.image_count}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => navigate(`/products/${product._id}`)}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                            >
                              View
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Page {data.page} of {data.pages}
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page === data.pages}
              className="px-4 py-2 bg-white border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
