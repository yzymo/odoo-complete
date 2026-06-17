/**
 * Page for viewing and managing duplicate products grouped by default_code.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { productApi } from '../api/products';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Package,
  Copy,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, statusBadge, type BadgeVariant } from '../components/ui/Badge';
import { StatTile } from '../components/ui/StatTile';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../lib/cn';

const SOURCE_VARIANT: Record<string, BadgeVariant> = {
  web: 'accent',
  web_scrape: 'accent',
  directory: 'info',
};

export default function DuplicatesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const limit = 20;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['duplicates-by-code', page, limit],
    queryFn: () => productApi.getDuplicatesByCode({ page, limit, min_count: 2 }),
  });

  const toggleGroup = (code: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const expandAll = () => {
    if (data?.groups) setExpandedGroups(new Set(data.groups.map((g) => g.default_code)));
  };
  const collapseAll = () => setExpandedGroups(new Set());

  const totalDuplicateProducts = data?.groups?.reduce((sum, g) => sum + g.count, 0) || 0;
  const maxCount = data?.groups?.length ? Math.max(...data.groups.map((g) => g.count)) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Produits en double"
        subtitle="Fiches regroupées par référence (default_code) pour repérer les doublons."
        actions={
          data?.groups && data.groups.length > 0 ? (
            <>
              <Button variant="secondary" size="sm" onClick={expandAll}>Tout déplier</Button>
              <Button variant="secondary" size="sm" onClick={collapseAll}>Tout replier</Button>
            </>
          ) : undefined
        }
      />

      {/* Summary */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile icon={Copy} label="Groupes de doublons" value={data ? data.total_groups : null} loading={isLoading} />
        <StatTile icon={Package} label="Produits en double" value={data ? totalDuplicateProducts : null} loading={isLoading} />
        <StatTile icon={Layers} label="Doublons max" value={data ? maxCount : null} loading={isLoading} />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {/* Error */}
      {error && (
        <ErrorState
          title="Chargement des doublons impossible"
          description="La liste des doublons n'a pas pu être chargée. Veuillez réessayer."
          onRetry={refetch}
        />
      )}

      {/* Empty */}
      {data && (!data.groups || data.groups.length === 0) && (
        <EmptyState
          icon={Package}
          title="Aucun doublon trouvé"
          description="Toutes les fiches ont une référence (default_code) unique."
        />
      )}

      {/* Groups */}
      {data?.groups && data.groups.length > 0 && (
        <div className="space-y-3">
          {data.groups.map((group) => {
            const expanded = expandedGroups.has(group.default_code);
            return (
              <Card key={group.default_code} className="overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.default_code)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-ivoire"
                >
                  <div className="flex items-center gap-3">
                    {expanded ? (
                      <ChevronDown className="h-5 w-5 text-gris-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gris-400" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-bleu-nuit">{group.default_code}</span>
                        <Badge variant="accent">{group.count} produit(s)</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-gris-1">
                        {group.products[0]?.name || 'Produit inconnu'}
                      </p>
                    </div>
                  </div>

                  {group.products.some((p) => p.image_count > 0) && (
                    <span className="flex items-center gap-1 text-xs text-gris-1">
                      <ImageIcon className="h-4 w-4" />
                      Contient des images
                    </span>
                  )}
                </button>

                {expanded && (
                  <div className="border-t border-gris-0">
                    <table className="w-full">
                      <thead className="bg-ivoire">
                        <tr>
                          {['Nom', 'Fabricant', 'Source', 'Statut', 'Images', 'Actions'].map((h) => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase text-gris-1">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gris-0">
                        {group.products.map((product, idx) => {
                          const sb = statusBadge(product.status);
                          return (
                            <tr key={product._id} className={idx === 0 ? 'bg-info-fond/40' : 'hover:bg-ivoire'}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {idx === 0 && <Badge variant="info">Premier</Badge>}
                                  <span className="max-w-xs truncate text-sm text-bleu-nuit">
                                    {product.name || 'Sans nom'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gris-1">{product.constructeur || '-'}</td>
                              <td className="px-4 py-3">
                                <Badge variant={SOURCE_VARIANT[product.source_type ?? ''] ?? 'neutral'}>
                                  {product.source_type || 'inconnue'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={sb.variant}>{sb.label}</Badge>
                              </td>
                              <td className="px-4 py-3 text-sm text-gris-1">
                                {product.image_count > 0 ? (
                                  <span className="flex items-center gap-1">
                                    <ImageIcon className="h-4 w-4 text-succes" />
                                    {product.image_count}
                                  </span>
                                ) : (
                                  <span className="text-gris-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => navigate(`/products/${product._id}`)}
                                  className="flex items-center gap-1 text-sm text-bleu-petrole hover:underline"
                                >
                                  Voir
                                  <ExternalLink className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className={cn('mt-6 flex items-center justify-between')}>
          <p className="text-sm text-gris-1">Page {data.page} sur {data.pages}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Précédent
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page === data.pages}>
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
