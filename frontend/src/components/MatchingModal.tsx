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
} from 'lucide-react';
import { odooApi, OdooProduct, CatalogMatch } from '../api/odoo';
import { Badge, type BadgeVariant } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';

interface MatchingModalProps {
  product: OdooProduct;
  isOpen: boolean;
  onClose: () => void;
}

// Score tier -> badge variant mapping (preserves existing tiering)
function getScoreVariant(score: number): BadgeVariant {
  if (score >= 0.95) return 'success';
  if (score >= 0.8) return 'info';
  if (score >= 0.6) return 'warning';
  return 'neutral';
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

export default function MatchingModal({ product, isOpen, onClose }: Readonly<MatchingModalProps>) {
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

  const handleCompareProduct = (productId: string) => {
    navigate(`/odoo/products/${product.id}?match=${productId}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer la fenêtre de correspondance"
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <Card className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-strong">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gris-0">
            <div className="flex items-center gap-3">
              <Search className="h-6 w-6 text-bleu-petrole" aria-hidden="true" />
              <div>
                <h2 className="font-heading text-lg font-semibold text-bleu-nuit">
                  Recherche de correspondances
                </h2>
                <p className="text-sm text-gris-400">
                  Produit Odoo : {product.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="rounded-button text-gris-400 hover:text-bleu-nuit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
            {/* Odoo Product Info */}
            <div className="px-6 py-4 bg-ivoire border-b border-gris-0">
              <h3 className="text-sm font-medium text-bleu-nuit mb-3">
                Produit Odoo source
              </h3>
              <div className="flex items-start gap-4">
                {product.image_small ? (
                  <img
                    src={`data:image/png;base64,${product.image_small}`}
                    alt={product.name}
                    className="w-16 h-16 rounded object-cover bg-blanc"
                  />
                ) : (
                  <div className="w-16 h-16 rounded bg-blanc flex items-center justify-center">
                    <Package className="h-8 w-8 text-gris-400" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div>
                    <span className="text-bleu-petrole">Code :</span>{' '}
                    <span className="font-mono">{product.default_code || '-'}</span>
                  </div>
                  <div>
                    <span className="text-bleu-petrole">Code-barres :</span>{' '}
                    <span className="font-mono">{product.barcode || '-'}</span>
                  </div>
                  <div>
                    <span className="text-bleu-petrole">EAN :</span>{' '}
                    <span className="font-mono">{product.code_ean || '-'}</span>
                  </div>
                  <div>
                    <span className="text-bleu-petrole">Constructeur :</span>{' '}
                    {product.constructeur || '-'}
                  </div>
                  <div>
                    <span className="text-bleu-petrole">Réf :</span>{' '}
                    <span className="font-mono">{product.ref_constructeur || '-'}</span>
                  </div>
                  <div>
                    <span className="text-bleu-petrole">Prix :</span>{' '}
                    {product.list_price?.toFixed(2) || '0.00'} €
                  </div>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-12">
                <Spinner className="h-8 w-8 mb-3" label="Recherche en cours…" />
                <p className="text-gris-1">Recherche en cours…</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="px-6 py-8 text-center">
                <AlertCircle className="h-12 w-12 text-erreur mx-auto mb-3" aria-hidden="true" />
                <p className="text-erreur">Erreur lors de la recherche</p>
                <p className="text-sm text-gris-400 mt-1">
                  {error instanceof Error ? error.message : 'Erreur inconnue'}
                </p>
              </div>
            )}

            {/* Results */}
            {matchingData && !isLoading && (
              <div className="px-6 py-4">
                {/* Results Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-bleu-nuit">
                    Correspondances trouvées
                  </h3>
                  <span className="text-sm text-gris-400">
                    {matchingData.total_matches} résultat(s)
                  </span>
                </div>

                {/* No Results */}
                {matchingData.matches.length === 0 ? (
                  <div className="text-center py-8 bg-ivoire rounded-card">
                    <Package className="h-12 w-12 text-gris-400 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-gris-1 font-medium">
                      Aucune correspondance trouvée
                    </p>
                    <p className="text-sm text-gris-400 mt-1">
                      Ce produit Odoo n'a pas d'équivalent dans le catalogue local
                    </p>
                  </div>
                ) : (
                  /* Match List */
                  <div className="space-y-3">
                    {matchingData.matches.map((match) => (
                      <button
                        type="button"
                        key={match.product_id}
                        className={`border rounded-card p-4 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole ${
                          selectedMatch?.product_id === match.product_id
                            ? 'border-bleu-petrole bg-info-fond'
                            : 'border-gris-0 hover:border-bleu-petrole hover:bg-ivoire'
                        }`}
                        style={{ width: '100%' }}
                        onClick={() => setSelectedMatch(match)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {/* Match Header */}
                            <div className="flex items-center gap-3 mb-2">
                              <Badge variant={getScoreVariant(match.score)}>
                                {(match.score * 100).toFixed(0)}%
                              </Badge>
                              <Badge variant="neutral">
                                {getMatchTypeLabel(match.match_type)}
                              </Badge>
                              {match.score >= 0.95 && (
                                <CheckCircle className="h-4 w-4 text-succes" aria-hidden="true" />
                              )}
                            </div>

                            {/* Product Info */}
                            <p className="font-medium text-bleu-nuit mb-1">
                              {match.product_name}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gris-1">
                              {match.default_code && (
                                <span>
                                  Code : <span className="font-mono">{match.default_code}</span>
                                </span>
                              )}
                              {match.barcode && (
                                <span>
                                  Code-barres : <span className="font-mono">{match.barcode}</span>
                                </span>
                              )}
                              {match.constructeur && (
                                <span>Constructeur : {match.constructeur}</span>
                              )}
                            </div>

                            {/* Match Details */}
                            <p className="text-xs text-gris-400 mt-2">
                              {match.match_details}
                            </p>
                          </div>

                          <span className="flex items-center gap-1 px-3 py-1.5 text-sm text-bleu-petrole rounded-button bg-info-fond">
                            Sélectionner
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Search Criteria (collapsible) */}
                <details className="mt-6">
                  <summary className="text-xs text-gris-400 cursor-pointer hover:text-gris-1">
                    Critères de recherche utilisés
                  </summary>
                  <div className="mt-2 p-3 bg-ivoire rounded-card text-xs font-mono text-gris-1">
                    <pre>{JSON.stringify(matchingData.search_criteria, null, 2)}</pre>
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gris-0 bg-ivoire">
            <p className="text-sm text-gris-400">
              {matchingData?.total_matches
                ? `${matchingData.total_matches} correspondance(s) trouvée(s)`
                : 'Recherche de correspondances'}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Fermer
              </Button>
              {selectedMatch && (
                <Button
                  variant="primary"
                  size="sm"
                  withArrow
                  onClick={() => handleCompareProduct(selectedMatch.product_id)}
                >
                  Ouvrir le comparateur
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
