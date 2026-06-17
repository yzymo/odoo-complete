/**
 * Page for viewing products from Odoo instance.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { odooApi, OdooProduct } from '../api/odoo';
import MatchingModal from '../components/MatchingModal';
import {
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
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { cn } from '../lib/cn';

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

  const inputCls =
    'w-full rounded-card border border-gris-0 bg-blanc px-4 py-2 text-sm text-bleu-nuit focus:border-bleu-petrole focus:outline-none focus:ring-2 focus:ring-bleu-petrole/30';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Produits Odoo"
        subtitle="Parcourez et synchronisez les produits depuis votre instance Odoo."
        actions={
          <Button
            onClick={() => {
              retestConnection();
              refetchProducts();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </Button>
        }
      />

      {/* Connection Status */}
      <Card className="mb-6 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isTestingConnection ? (
              <>
                <Spinner label="Test de connexion…" />
                <span className="text-gris-1">Test de connexion...</span>
              </>
            ) : connectionStatus?.status === 'connected' ? (
              <>
                <Badge variant="success" icon={CheckCircle}>
                  Connecté à Odoo
                </Badge>
                <span className="text-sm text-gris-400">
                  | {connectionStatus.url} | DB: {connectionStatus.database}
                </span>
              </>
            ) : (
              <>
                <Badge variant="error" icon={XCircle}>
                  Échec de connexion
                </Badge>
                {connectionStatus?.error && (
                  <span className="text-sm text-erreur">| {connectionStatus.error}</span>
                )}
              </>
            )}
          </div>

          {connectionStatus?.server_version && (
            <span className="text-sm text-gris-400">
              Odoo v{connectionStatus.server_version}
            </span>
          )}
        </div>
      </Card>

      {/* Search Bar */}
      {connectionStatus?.status === 'connected' && (
        <Card className="mb-6 p-4">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gris-400" aria-hidden="true" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Rechercher par nom, code ou code-barres..."
                className={cn(inputCls, 'pl-10')}
                aria-label="Rechercher des produits Odoo"
              />
            </div>
            <Button type="submit">Rechercher</Button>
            {search && (
              <Button type="button" variant="secondary" onClick={clearSearch}>
                Effacer
              </Button>
            )}
          </form>
        </Card>
      )}

      {/* Products Table */}
      {connectionStatus?.status === 'connected' && (
        <>
          {isLoadingProducts ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-12 w-12" label="Chargement des produits…" />
            </div>
          ) : productsError ? (
            <ErrorState
              title="Chargement des produits impossible"
              description="Erreur lors du chargement des produits depuis Odoo."
              onRetry={refetchProducts}
            />
          ) : productsData && productsData.products.length > 0 ? (
            <>
              {/* Stats */}
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gris-1">
                  Affichage {((page - 1) * limit) + 1} - {Math.min(page * limit, productsData.total)} sur{' '}
                  <strong>{productsData.total}</strong> produits
                  {search && <span> correspondant à "{search}"</span>}
                </p>
              </div>

              {/* Table */}
              <Card className="overflow-hidden">
                <table className="w-full">
                  <thead className="bg-ivoire">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gris-400">
                        Produit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gris-400">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gris-400">
                        Catégorie
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gris-400">
                        Constructeur
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gris-400">
                        Prix
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gris-400">
                        Statut
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gris-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gris-0">
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
              </Card>

              {/* Pagination */}
              {productsData.pages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-gris-1">
                    Page {productsData.page} sur {productsData.pages}
                  </p>

                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Précédent
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setPage((p) => Math.min(productsData.pages, p + 1))}
                      disabled={page === productsData.pages}
                    >
                      Suivant
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={Package}
              title="Aucun produit trouvé"
              description={
                search
                  ? `Aucun produit ne correspond à "${search}"`
                  : 'Aucun produit disponible dans Odoo'
              }
            />
          )}
        </>
      )}

      {/* Connection Failed State */}
      {connectionStatus?.status === 'error' && (
        <ErrorState
          title="Impossible de se connecter à Odoo"
          description="Veuillez vérifier votre configuration Odoo et réessayer."
          onRetry={() => retestConnection()}
        />
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
    <tr className="hover:bg-ivoire">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {product.image_small ? (
            <img
              src={`data:image/png;base64,${product.image_small}`}
              alt={product.name}
              className="h-10 w-10 rounded object-cover bg-ivoire"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-ivoire">
              <Package className="h-5 w-5 text-gris-400" />
            </div>
          )}
          <div>
            <p className="max-w-xs truncate font-medium text-bleu-nuit" title={product.name}>
              {product.name}
            </p>
            {(product.barcode || product.code_ean) && (
              <p className="text-xs text-gris-400">
                {product.code_ean ? `EAN: ${product.code_ean}` : `Code-barres: ${product.barcode}`}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div>
          <span className="font-mono text-sm text-gris-1">
            {product.default_code || '-'}
          </span>
          {product.ref_constructeur && (
            <p className="text-xs text-gris-400">Ref: {product.ref_constructeur}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gris-1">{product.category || '-'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gris-1">{product.constructeur || '-'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="font-medium text-bleu-nuit">
          {product.list_price?.toFixed(2) || '0.00'} €
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <Badge variant={product.active ? 'success' : 'neutral'}>
            {product.active ? 'Actif' : 'Inactif'}
          </Badge>
          {product.is_published && <Badge variant="info">Publié</Badge>}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onFindMatch}
            className="flex items-center gap-1 rounded text-sm text-bleu-petrole hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
            title="Chercher des correspondances dans le catalogue"
          >
            <Link2 className="h-4 w-4" />
            Correspondance
          </button>
          <button
            onClick={onViewDetail}
            className="flex items-center gap-1 rounded text-sm text-bleu-petrole hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
          >
            Voir
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}
