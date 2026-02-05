/**
 * Modal for displaying product matching results between Odoo and catalog.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Search,
  CheckCircle,
  AlertCircle,
  Package,
  ExternalLink,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { odooApi, OdooProduct, CatalogMatch } from '../api/odoo';

interface MatchingModalProps {
  product: OdooProduct;
  isOpen: boolean;
  onClose: () => void;
}

// Score color mapping
function getScoreColor(score: number): string {
  if (score >= 0.95) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 0.80) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (score >= 0.60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-gray-100 text-gray-800 border-gray-200';
}

// Match type labels
function getMatchTypeLabel(matchType: string): string {
  const labels: Record<string, string> = {
    exact_barcode: 'Barcode exact',
    exact_ean: 'EAN exact',
    exact_code: 'Code exact',
    manufacturer_ref: 'Ref constructeur',
    fuzzy_name_high: 'Nom similaire (fort)',
    fuzzy_name_medium: 'Nom similaire',
    partial_code: 'Code partiel',
  };
  return labels[matchType] || matchType;
}

export default function MatchingModal({ product, isOpen, onClose }: MatchingModalProps) {
  const navigate = useNavigate();
  const [selectedMatch, setSelectedMatch] = useState<CatalogMatch | null>(null);

  // Fetch matching results
  const {
    data: matchingData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['odoo-match', product.id],
    queryFn: () => odooApi.findCatalogMatch(product.id),
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const handleViewProduct = (productId: string) => {
    navigate(`/products/${productId}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Search className="h-6 w-6 text-purple-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Recherche de correspondances
                </h2>
                <p className="text-sm text-gray-500">
                  Produit Odoo: {product.name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
            {/* Odoo Product Info */}
            <div className="px-6 py-4 bg-purple-50 border-b border-purple-100">
              <h3 className="text-sm font-medium text-purple-900 mb-3">
                Produit Odoo source
              </h3>
              <div className="flex items-start gap-4">
                {product.image_small ? (
                  <img
                    src={`data:image/png;base64,${product.image_small}`}
                    alt={product.name}
                    className="w-16 h-16 rounded object-cover bg-white"
                  />
                ) : (
                  <div className="w-16 h-16 rounded bg-white flex items-center justify-center">
                    <Package className="h-8 w-8 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div>
                    <span className="text-purple-700">Code:</span>{' '}
                    <span className="font-mono">{product.default_code || '-'}</span>
                  </div>
                  <div>
                    <span className="text-purple-700">Barcode:</span>{' '}
                    <span className="font-mono">{product.barcode || '-'}</span>
                  </div>
                  <div>
                    <span className="text-purple-700">EAN:</span>{' '}
                    <span className="font-mono">{product.code_ean || '-'}</span>
                  </div>
                  <div>
                    <span className="text-purple-700">Constructeur:</span>{' '}
                    {product.constructeur || '-'}
                  </div>
                  <div>
                    <span className="text-purple-700">Ref:</span>{' '}
                    <span className="font-mono">{product.ref_constructeur || '-'}</span>
                  </div>
                  <div>
                    <span className="text-purple-700">Prix:</span>{' '}
                    {product.list_price?.toFixed(2) || '0.00'} €
                  </div>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 text-purple-600 animate-spin mb-3" />
                <p className="text-gray-600">Recherche en cours...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="px-6 py-8 text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                <p className="text-red-600">Erreur lors de la recherche</p>
                <p className="text-sm text-gray-500 mt-1">
                  {error instanceof Error ? error.message : 'Erreur inconnue'}
                </p>
              </div>
            )}

            {/* Results */}
            {matchingData && !isLoading && (
              <div className="px-6 py-4">
                {/* Results Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-900">
                    Correspondances trouvées
                  </h3>
                  <span className="text-sm text-gray-500">
                    {matchingData.total_matches} résultat(s)
                  </span>
                </div>

                {/* No Results */}
                {matchingData.matches.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">
                      Aucune correspondance trouvée
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Ce produit Odoo n'a pas d'équivalent dans le catalogue local
                    </p>
                  </div>
                ) : (
                  /* Match List */
                  <div className="space-y-3">
                    {matchingData.matches.map((match) => (
                      <div
                        key={match.product_id}
                        className={`border rounded-lg p-4 transition-all cursor-pointer ${
                          selectedMatch?.product_id === match.product_id
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedMatch(match)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {/* Match Header */}
                            <div className="flex items-center gap-3 mb-2">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getScoreColor(
                                  match.score
                                )}`}
                              >
                                {(match.score * 100).toFixed(0)}%
                              </span>
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                {getMatchTypeLabel(match.match_type)}
                              </span>
                              {match.score >= 0.95 && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                            </div>

                            {/* Product Info */}
                            <p className="font-medium text-gray-900 mb-1">
                              {match.product_name}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                              {match.default_code && (
                                <span>
                                  Code: <span className="font-mono">{match.default_code}</span>
                                </span>
                              )}
                              {match.barcode && (
                                <span>
                                  Barcode: <span className="font-mono">{match.barcode}</span>
                                </span>
                              )}
                              {match.constructeur && (
                                <span>Constructeur: {match.constructeur}</span>
                              )}
                            </div>

                            {/* Match Details */}
                            <p className="text-xs text-gray-500 mt-2">
                              {match.match_details}
                            </p>
                          </div>

                          {/* View Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewProduct(match.product_id);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-md transition-colors"
                          >
                            Voir
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search Criteria Debug (collapsible) */}
                <details className="mt-6">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    Critères de recherche utilisés
                  </summary>
                  <div className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono text-gray-600">
                    <pre>{JSON.stringify(matchingData.search_criteria, null, 2)}</pre>
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              {matchingData?.total_matches
                ? `${matchingData.total_matches} correspondance(s) trouvée(s)`
                : 'Recherche de correspondances'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Fermer
              </button>
              {selectedMatch && (
                <button
                  onClick={() => handleViewProduct(selectedMatch.product_id)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-purple-600 rounded-md hover:bg-purple-700"
                >
                  Voir le produit
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
