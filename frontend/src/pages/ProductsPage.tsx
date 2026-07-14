/**
 * Products list page with search, filters, completeness and pagination.
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { productApi } from '../api/products';
import type { Product } from '../types/product';
import { Search, Package, Download, Globe, FileText, ListFilter, CheckCircle, Link2, RefreshCw } from 'lucide-react';
import { SyncOdooModal } from '../components/SyncOdooModal';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, statusBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { CompletenessBadge } from '../components/CompletenessBadge';
import { computeCompleteness } from '../lib/completeness';
import { cn } from '../lib/cn';

function SourceBadge({ sources }: { readonly sources?: Array<{ source_type?: string; origin_file_type?: string; origin_file?: string }> }) {
  if (!sources || sources.length === 0) return null;
  const st = sources[0].source_type ?? sources[0].origin_file_type ?? '';
  if (st === 'web_scrape' || st === 'url') {
    return <Badge variant="accent" icon={Globe}>Web</Badge>;
  }
  if (st === 'pdf') {
    return <Badge variant="info" icon={FileText}>PDF</Badge>;
  }
  return null;
}

// Match thresholds — mirror the web scraper: ≥90% applies automatically,
// 80–90% offers a manual button.
const AUTO_MATCH_THRESHOLD = 0.9;
const SUGGEST_MATCH_THRESHOLD = 0.8;

/**
 * Per-product Odoo match control shown on each product card.
 *
 * - Already matched      → "Lié à Odoo" badge (no lookup).
 * - Best candidate ≥90%  → applied automatically (once), then badge.
 * - Best candidate 80–90% → "Mettre en correspondance" button.
 * - Otherwise            → nothing.
 *
 * Matching pushes the catalog product's fields into the Odoo product, exactly
 * like the web-scraper auto-apply.
 */
function ProductMatchAction({ product }: { readonly product: Product }) {
  const queryClient = useQueryClient();
  const matched = !!product.odoo_match;
  const autoFiredRef = useRef(false);

  const { data } = useQuery({
    queryKey: ['product-odoo-matches', product._id],
    queryFn: () => productApi.getOdooMatches(product._id),
    enabled: !matched,
    staleTime: 5 * 60 * 1000,
  });

  const best = data?.matches?.[0];

  const mutation = useMutation({
    mutationFn: (auto: boolean) =>
      productApi.matchToOdoo(product._id, {
        odoo_id: best!.odoo_id,
        score: best!.score,
        match_label: best!.match_label,
        auto,
      }),
    onSuccess: (_res, auto) => {
      const pct = best ? `${Math.round(best.score * 100)}%` : '';
      const label = product.name || 'Produit';
      toast.success(
        auto
          ? `« ${label} » mis en correspondance automatiquement (${pct})`
          : `« ${label} » mis en correspondance avec Odoo (${pct})`,
        { duration: 4000 },
      );
      queryClient.invalidateQueries({ queryKey: ['products'] });
      // The fiche moves raw → enriched, so the dashboard counts change too.
      queryClient.invalidateQueries({ queryKey: ['export-stats'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Échec de la mise en correspondance'),
  });

  // Auto-match near-certain candidates (≥90%) exactly once.
  useEffect(() => {
    if (matched || !best) return;
    if (best.score >= AUTO_MATCH_THRESHOLD && !autoFiredRef.current) {
      autoFiredRef.current = true;
      mutation.mutate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best?.odoo_id, best?.score, matched]);

  if (matched) {
    const pct = product.odoo_match?.score != null ? Math.round(product.odoo_match.score * 100) : null;
    return (
      <Badge variant="success" icon={CheckCircle}>
        {pct != null ? `Lié à Odoo · ${pct}%` : 'Lié à Odoo'}
      </Badge>
    );
  }

  if (!best) return null;

  // ≥90% — automatic match is firing / about to fire.
  if (best.score >= AUTO_MATCH_THRESHOLD) {
    return <Badge variant="info">Mise en correspondance…</Badge>;
  }

  // 80–90% — manual button.
  if (best.score >= SUGGEST_MATCH_THRESHOLD) {
    return (
      <Button
        type="button"
        variant="accent"
        size="sm"
        loading={mutation.isPending}
        onClick={(e) => { e.stopPropagation(); mutation.mutate(false); }}
        className="whitespace-nowrap"
      >
        {!mutation.isPending && <Link2 className="h-4 w-4" aria-hidden="true" />}
        Mettre en correspondance ({Math.round(best.score * 100)}%)
      </Button>
    );
  }

  return null;
}

export default function ProductsPage() {
  // List state lives in the URL so the page/filters survive navigation
  // (e.g. opening a product and pressing Back returns to the same page).
  const [searchParams, setSearchParams] = useSearchParams();
  const [isExporting, setIsExporting] = useState(false);
  const [syncProduct, setSyncProduct] = useState<Product | null>(null);
  const navigate = useNavigate();

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const search = searchParams.get('q') ?? '';
  const statusFilter = searchParams.get('status') ?? '';
  const sourceFilter = searchParams.get('source') ?? '';
  const onlyIncomplete = searchParams.get('incomplete') === '1';

  /** Merge query-param updates; empty/false/null values drop the param. */
  const updateParams = (
    updates: Record<string, string | number | boolean | null>,
    opts?: { replace?: boolean },
  ) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '' || value === false) next.delete(key);
      else if (value === true) next.set(key, '1');
      else next.set(key, String(value));
    }
    setSearchParams(next, opts);
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products', page, search, statusFilter, sourceFilter],
    queryFn: () =>
      productApi.getProducts({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter || undefined,
        source_type: sourceFilter || undefined,
      }),
  });

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const blob = await productApi.exportToExcel({
        status: statusFilter || undefined,
        search: search || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed:', err);
      alert("L'export a échoué. Veuillez réessayer.");
    } finally {
      setIsExporting(false);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-succes';
    if (score >= 0.6) return 'text-alerte';
    return 'text-erreur';
  };

  const getAverageConfidence = (product: Product) => {
    const scores = Object.values(product.extraction_metadata?.field_confidence_scores || {});
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  const allProducts = data?.products ?? [];
  // Completeness filter is client-side over the loaded page (the API exposes no
  // completeness filter); the toggle label makes the page-scope explicit.
  const visibleProducts = onlyIncomplete
    ? allProducts.filter((p) => !computeCompleteness(p).isComplete)
    : allProducts;

  const inputCls =
    'w-full rounded-card border border-gris-0 bg-blanc px-4 py-2 text-sm text-bleu-nuit focus:border-bleu-petrole focus:outline-none focus:ring-2 focus:ring-bleu-petrole/30';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Produits"
        subtitle="Parcourez, contrôlez la complétude et exportez vos fiches produits."
        actions={
          <Button onClick={handleExportExcel} disabled={isExporting || !data?.total} loading={isExporting}>
            {!isExporting && <Download className="h-4 w-4" />}
            {isExporting ? 'Exportation…' : 'Exporter Excel'}
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-[16rem]">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gris-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Rechercher des produits…"
              value={search}
              onChange={(e) => updateParams({ q: e.target.value, page: null }, { replace: true })}
              className={cn(inputCls, 'pl-10')}
              aria-label="Rechercher des produits"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => updateParams({ status: e.target.value, page: null })}
            className={cn(inputCls, 'sm:w-44')}
            aria-label="Filtrer par statut"
          >
            <option value="">Tous les statuts</option>
            <option value="raw">Brut</option>
            <option value="enriched">Enrichi</option>
            <option value="validated">Validé</option>
            <option value="exported">Exporté</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => updateParams({ source: e.target.value, page: null })}
            className={cn(inputCls, 'sm:w-44')}
            aria-label="Filtrer par source"
          >
            <option value="">Toutes les sources</option>
            <option value="web_scrape">Scraping web</option>
            <option value="pdf">PDF</option>
          </select>

          <Button
            type="button"
            size="sm"
            variant={onlyIncomplete ? 'accent' : 'secondary'}
            onClick={() => updateParams({ incomplete: !onlyIncomplete, page: null })}
            aria-pressed={onlyIncomplete}
            className="w-full sm:w-auto"
          >
            <ListFilter className="h-4 w-4" />
            Incomplets
          </Button>
        </div>

        {data && (
          <p className="mt-3 text-sm text-gris-1">
            {data.total} produit(s) · {data.pages} page(s)
            {onlyIncomplete && ` · ${visibleProducts.length} incomplet(s) sur cette page`}
          </p>
        )}
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <ErrorState
          title="Chargement des produits impossible"
          description="La liste des produits n'a pas pu être chargée. Veuillez réessayer."
          onRetry={refetch}
        />
      )}

      {/* Product list */}
      {data && visibleProducts.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4">
          {visibleProducts.map((product) => {
            const avgConfidence = getAverageConfidence(product);
            const sb = statusBadge(product.extraction_metadata?.status);
            const open = () => navigate(`/products/${product._id}`);

            return (
              <Card
                key={product._id}
                hoverable
                role="button"
                tabIndex={0}
                onClick={open}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
                className="cursor-pointer p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-bleu-nuit">
                        {product.name || 'Produit sans nom'}
                      </h3>
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                      <SourceBadge sources={product.sources} />
                      <CompletenessBadge product={product} />
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                      {product.default_code && (
                        <div>
                          <span className="text-gris-1">Code :</span>
                          <p className="font-medium text-bleu-nuit">{product.default_code}</p>
                        </div>
                      )}
                      {product.constructeur && (
                        <div>
                          <span className="text-gris-1">Fabricant :</span>
                          <p className="font-medium text-bleu-nuit">{product.constructeur}</p>
                        </div>
                      )}
                      {product.lst_price && (
                        <div>
                          <span className="text-gris-1">Prix :</span>
                          <p className="font-medium text-bleu-nuit">{product.lst_price} €</p>
                        </div>
                      )}
                      <div>
                        <span className="text-gris-1">Confiance :</span>
                        <p className={cn('font-medium', getConfidenceColor(avgConfidence))}>
                          {(avgConfidence * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>

                    {product.description_courte && (
                      <p className="mt-2 line-clamp-2 text-sm text-gris-1">
                        {product.description_courte}
                      </p>
                    )}
                  </div>

                  <div className="ml-4 flex flex-col items-end gap-2">
                    {!product.odoo_match && product.extraction_metadata?.status === 'validated' ? (
                      <Button
                        type="button"
                        variant="accent"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setSyncProduct(product); }}
                        className="whitespace-nowrap"
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Synchroniser
                      </Button>
                    ) : (
                      <ProductMatchAction product={product} />
                    )}
                    {product.images.length > 0 && (
                      <div className="flex h-16 w-16 items-center justify-center rounded-card bg-ivoire">
                        <Package className="h-8 w-8 text-gris-400" />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {data && visibleProducts.length === 0 && (
        <EmptyState
          icon={Package}
          title={onlyIncomplete ? 'Aucun produit incomplet sur cette page' : 'Aucun produit trouvé'}
          description={
            onlyIncomplete
              ? 'Toutes les fiches de cette page sont complètes. Désactivez le filtre pour tout voir.'
              : "Importez des documents PDF pour extraire automatiquement des produits."
          }
          action={
            onlyIncomplete ? (
              <Button variant="secondary" onClick={() => updateParams({ incomplete: null, page: null })}>
                Voir tous les produits
              </Button>
            ) : (
              <Button onClick={() => navigate('/extract')} withArrow>
                Importer des documents
              </Button>
            )
          }
        />
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => updateParams({ page: Math.max(1, page - 1) })} disabled={page === 1}>
            Précédent
          </Button>
          <span className="text-sm text-gris-1">
            Page {page} sur {data.pages}
          </span>
          <Button variant="secondary" onClick={() => updateParams({ page: Math.min(data.pages, page + 1) })} disabled={page === data.pages}>
            Suivant
          </Button>
        </div>
      )}

      <SyncOdooModal
        product={syncProduct}
        open={!!syncProduct}
        onClose={() => setSyncProduct(null)}
      />
    </div>
  );
}
