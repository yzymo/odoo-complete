/**
 * Product detail page with all fields and sources.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { productApi } from '../api/products';
import { ArrowLeft, CheckCircle, Edit } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productApi.getProduct(id!),
    enabled: !!id,
  });

  const { data: sourcesData } = useQuery({
    queryKey: ['product-sources', id],
    queryFn: () => productApi.getProductSources(id!),
    enabled: !!id,
  });

  const validateMutation = useMutation({
    mutationFn: (productId: string) => productApi.validateProduct(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      toast.success('Product validated successfully');
    },
    onError: () => {
      toast.error('Failed to validate product');
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Product not found</p>
        </div>
      </div>
    );
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-800';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/products')}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {product.name || 'Unnamed Product'}
            </h1>
            <p className="text-gray-600">
              Status: {product.extraction_metadata?.status}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {product.extraction_metadata?.status !== 'validated' && (
            <button
              onClick={() => validateMutation.mutate(product._id)}
              disabled={validateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              Validate
            </button>
          )}
          <button
            onClick={() => toast('Edit mode coming in Phase 3')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Edit className="h-4 w-4" />
            Edit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identifiers */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Identifiers</h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoField
                label="Default Code"
                value={product.default_code}
                confidence={
                  product.extraction_metadata?.field_confidence_scores
                    ?.default_code
                }
              />
              <InfoField
                label="Barcode"
                value={product.barcode}
                confidence={
                  product.extraction_metadata?.field_confidence_scores?.barcode
                }
              />
              <InfoField
                label="EAN Code"
                value={product.code_ean}
                confidence={
                  product.extraction_metadata?.field_confidence_scores?.code_ean
                }
              />
            </div>
          </div>

          {/* Manufacturer */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Manufacturer</h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoField
                label="Manufacturer"
                value={product.constructeur}
                confidence={
                  product.extraction_metadata?.field_confidence_scores
                    ?.constructeur
                }
              />
              <InfoField
                label="Manufacturer Ref"
                value={product.ref_constructeur}
                confidence={
                  product.extraction_metadata?.field_confidence_scores
                    ?.ref_constructeur
                }
              />
            </div>
          </div>

          {/* Descriptions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Descriptions</h2>
            <div className="space-y-4">
              <InfoField
                label="Short Description"
                value={product.description_courte}
                multiline
              />
              <InfoField
                label="E-commerce Description"
                value={product.description_ecommerce}
                multiline
              />
              <InfoField
                label="Features"
                value={product.features_description}
                multiline
              />
            </div>
          </div>

          {/* Dimensions & Logistics */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">
              Dimensions & Logistics
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Length" value={product.length} unit="mm" />
              <InfoField label="Width" value={product.width} unit="mm" />
              <InfoField label="Height" value={product.height} unit="mm" />
              <InfoField label="Weight" value={product.weight} unit="kg" />
              <InfoField label="HS Code" value={product.hs_code} />
              <InfoField
                label="Contains Lithium"
                value={product.contient_du_lithium ? 'Yes' : 'No'}
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Pricing</h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Price" value={product.lst_price} unit="€" />
              <InfoField
                label="Taxes"
                value={product.taxes_id?.join(', ')}
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Extraction Sources */}
          {sourcesData && sourcesData.sources.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">
                Sources ({sourcesData.count})
              </h2>
              <div className="space-y-3">
                {sourcesData.sources.map((source: any, idx: number) => (
                  <div key={idx} className="border-l-4 border-blue-500 pl-3">
                    <p className="font-medium text-sm">{source.origin_file}</p>
                    <p className="text-xs text-gray-600">
                      {source.extraction_type} - Page {source.page_number || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500">
                      Confidence: {(source.confidence_score * 100).toFixed(0)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Metadata</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Created:</span>
                <p className="font-medium">
                  {format(new Date(product.created_at), 'PPp')}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Updated:</span>
                <p className="font-medium">
                  {format(new Date(product.updated_at), 'PPp')}
                </p>
              </div>
              {product.extraction_metadata?.extraction_job_id && (
                <div>
                  <span className="text-gray-600">Job ID:</span>
                  <p className="font-mono text-xs">
                    {product.extraction_metadata.extraction_job_id}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoField({
  label,
  value,
  unit,
  multiline,
  confidence,
}: {
  label: string;
  value?: string | number | null;
  unit?: string;
  multiline?: boolean;
  confidence?: number;
}) {
  const displayValue = value
    ? `${value}${unit ? ' ' + unit : ''}`
    : 'Not available';

  return (
    <div>
      <label className="text-sm text-gray-600 flex items-center gap-2">
        {label}
        {confidence !== undefined && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              confidence >= 0.8
                ? 'bg-green-100 text-green-800'
                : confidence >= 0.6
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </label>
      {multiline ? (
        <p className="mt-1 text-gray-900 whitespace-pre-wrap">{displayValue}</p>
      ) : (
        <p className="mt-1 font-medium text-gray-900">{displayValue}</p>
      )}
    </div>
  );
}
