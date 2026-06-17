import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Globe,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  Package,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  XCircle,
  Upload,
  Zap,
} from 'lucide-react';
import {
  scraperApi,
  type ProductStatus,
  ScrapeProductResult,
  ScrapedOdooMatch,
  ScrapedProduct,
  ScrapeJobResponse,
} from '../api/scraper';
import { odooApi, OdooProductUpdate } from '../api/odoo';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { cn } from '../lib/cn';

// ── helpers ──────────────────────────────────────────────────────────────────

function scoreVariant(score: number): BadgeVariant {
  if (score >= 0.95) return 'success';
  if (score >= 0.80) return 'info';
  if (score >= 0.60) return 'warning';
  return 'neutral';
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toFixed(2);
  return String(value);
}

// ── comparison fields shown in the inline diff table ─────────────────────────

const COMPARE_FIELDS: { label: string; scraped: (p: ScrapeProductResult['scraped']) => unknown; odoo: (m: ScrapedOdooMatch) => unknown }[] = [
  { label: 'Nom',              scraped: p => p.name,                  odoo: m => m.name },
  { label: 'Code',             scraped: p => p.default_code,          odoo: m => m.default_code },
  { label: 'Code-barres',      scraped: p => p.barcode,               odoo: m => m.barcode },
  { label: 'EAN',              scraped: p => p.code_ean,              odoo: m => m.code_ean },
  { label: 'Marque',           scraped: p => p.constructeur,          odoo: m => m.constructeur },
  { label: 'Réf. fabricant',   scraped: p => p.ref_constructeur,      odoo: m => m.ref_constructeur },
  { label: 'Description',      scraped: p => p.description_courte,    odoo: () => null },
  { label: 'Caractéristiques', scraped: p => p.features_description,  odoo: () => null },
  { label: 'Prix (€)',         scraped: p => p.list_price,            odoo: m => m.list_price },
];

// ── auto-apply helpers ────────────────────────────────────────────────────────

const AUTO_APPLY_THRESHOLD = 0.9;

function buildAutoUpdatePayload(scraped: ScrapedProduct): OdooProductUpdate {
  const u: OdooProductUpdate = {};
  if (scraped.barcode)              u.barcode              = scraped.barcode;
  if (scraped.code_ean)             u.code_ean             = scraped.code_ean;
  if (scraped.ref_constructeur)     u.ref_constructeur     = scraped.ref_constructeur;
  if (scraped.description_courte)   u.description_courte   = scraped.description_courte;
  if (scraped.features_description) u.features_description = scraped.features_description;
  return u;
}

// ── sub-components ────────────────────────────────────────────────────────────

function ComparisonTable({
  product,
  match,
}: {
  product: ScrapeProductResult;
  match: ScrapedOdooMatch;
}) {
  return (
    <div className="mt-3 border border-info/30 rounded-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-info-fond">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-medium text-gris-1 uppercase w-1/4">Champ</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gris-1 uppercase w-3/8">Site web</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gris-1 uppercase w-3/8">Odoo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gris-0">
          {COMPARE_FIELDS.map(f => {
            const sv = fmt(f.scraped(product.scraped));
            const ov = fmt(f.odoo(match));
            const differs = sv !== '—' && ov !== '—' && sv !== ov;
            return (
              <tr key={f.label} className={differs ? 'bg-orange-feu/10' : ''}>
                <td className="px-3 py-2 font-medium text-gris-1">{f.label}</td>
                <td className="px-3 py-2 font-mono text-bleu-nuit">{sv}</td>
                <td className="px-3 py-2 font-mono text-bleu-nuit">{ov}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function applyBtnIcon(isPending: boolean, isSuccess: boolean) {
  if (isPending) return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (isSuccess) return <CheckCircle className="h-3.5 w-3.5" />;
  return <Upload className="h-3.5 w-3.5" />;
}

function applyBtnLabel(isPending: boolean, isSuccess: boolean, count: number) {
  if (isPending) return 'Application…';
  if (isSuccess) return 'Image(s) appliquée(s)';
  return `Appliquer ${count} image${count === 1 ? '' : 's'} dans Odoo`;
}

function applyBtnError(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : 'Échec';
}

function ApplyImagesButton({
  odooId,
  imageUrls,
}: Readonly<{ odooId: number; imageUrls: string[] }>) {
  const { mutate, isPending, isSuccess, error } = useMutation({
    mutationFn: () => odooApi.setProductImages(odooId, imageUrls),
  });
  const errMsg = applyBtnError(error);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => mutate()}
        disabled={isPending || isSuccess}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-succes bg-succes-fond border border-succes/30 rounded-button hover:bg-succes/10 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
      >
        {applyBtnIcon(isPending, isSuccess)}
        {applyBtnLabel(isPending, isSuccess, imageUrls.length)}
      </button>
      {errMsg && <span className="text-xs text-erreur">{errMsg}</span>}
    </div>
  );
}

function ProductCard({
  product,
  index,
}: Readonly<{ product: ScrapeProductResult; index: number }>) {
  const navigate = useNavigate();
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(
    product.odoo_matches[0]?.odoo_id ?? null
  );
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [autoApplied, setAutoApplied] = useState(false);
  const autoAppliedRef = useRef<number | null>(null);

  const selectedMatch = product.odoo_matches.find(m => m.odoo_id === selectedMatchId) ?? null;
  const hasMatches = product.odoo_matches.length > 0;
  const imageUrls = product.scraped.image_urls ?? [];
  const mainImageUrl = imageUrls[0];

  const autoUpdateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: OdooProductUpdate }) =>
      odooApi.updateProduct(id, updates),
    onSuccess: (_, { id }) => {
      const match = product.odoo_matches.find(m => m.odoo_id === id);
      const pct = match ? `${(match.score * 100).toFixed(0)}%` : null;
      const msg = pct ? `Champs appliqués automatiquement dans Odoo (${pct} de correspondance)` : 'Champs appliqués automatiquement dans Odoo';
      toast.success(msg, { duration: 4000 });
      setAutoApplied(true);
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Échec de l\'application automatique'),
  });

  useEffect(() => {
    if (!selectedMatch || selectedMatch.score < AUTO_APPLY_THRESHOLD) return;
    if (autoAppliedRef.current === selectedMatch.odoo_id) return;
    const payload = buildAutoUpdatePayload(product.scraped);
    if (Object.keys(payload).length === 0) return;
    autoAppliedRef.current = selectedMatch.odoo_id;
    autoUpdateMutation.mutate({ id: selectedMatch.odoo_id, updates: payload });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatch?.odoo_id, selectedMatch?.score]);

  return (
    <Card className="overflow-hidden">
      {/* Product header */}
      <div className="px-5 py-4 bg-ivoire border-b border-gris-0 flex items-start gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-bleu-nuit/10 text-bleu-nuit text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>

        {/* Scraped image thumbnail */}
        {mainImageUrl && !imgError ? (
          <img
            src={mainImageUrl}
            alt={product.scraped.name}
            className="shrink-0 w-14 h-14 rounded border border-gris-0 bg-blanc object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="shrink-0 w-14 h-14 rounded border border-dashed border-gris-0 bg-ivoire flex items-center justify-center">
            <Package className="h-5 w-5 text-gris-400" aria-hidden="true" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-bleu-nuit truncate">{product.scraped.name}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gris-1">
            {product.scraped.default_code && <span>Code : <span className="font-mono">{product.scraped.default_code}</span></span>}
            {product.scraped.barcode && <span>Code-barres : <span className="font-mono">{product.scraped.barcode}</span></span>}
            {product.scraped.code_ean && <span>EAN : <span className="font-mono">{product.scraped.code_ean}</span></span>}
            {product.scraped.constructeur && <span>Marque : {product.scraped.constructeur}</span>}
            {product.scraped.ref_constructeur && <span>Réf. : <span className="font-mono">{product.scraped.ref_constructeur}</span></span>}
            {product.scraped.list_price != null && <span>Prix : {product.scraped.list_price.toFixed(2)} €</span>}
          </div>
          {mainImageUrl && (
            <p className="mt-1 text-xs text-bleu-petrole">
              {imageUrls.length} image{imageUrls.length === 1 ? '' : 's'} trouvée{imageUrls.length === 1 ? '' : 's'}
            </p>
          )}
          {product.scraped.description_courte && (
            <p className="mt-1 text-xs text-gris-400 truncate">{product.scraped.description_courte}</p>
          )}
        </div>
        <div className="shrink-0">
          {hasMatches ? (
            <Badge variant="success" icon={CheckCircle}>
              {product.odoo_matches.length} correspondance{product.odoo_matches.length > 1 ? 's' : ''}
            </Badge>
          ) : (
            <Badge variant="neutral" icon={Package}>
              Aucune correspondance
            </Badge>
          )}
        </div>
      </div>

      {/* Odoo matches */}
      {hasMatches && (
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gris-1 uppercase">Candidats Odoo</p>
            {selectedMatch && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1 text-xs text-bleu-petrole hover:text-bleu-nuit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole rounded"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expanded ? 'Masquer la comparaison' : 'Comparer les champs'}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {product.odoo_matches.map(match => (
              <button
                key={match.odoo_id}
                type="button"
                onClick={() => {
                  setSelectedMatchId(match.odoo_id);
                  setExpanded(true);
                }}
                className={cn(
                  'w-full text-left border rounded-card p-3 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole',
                  selectedMatchId === match.odoo_id
                    ? 'border-bleu-petrole bg-info-fond'
                    : 'border-gris-0 hover:border-bleu-petrole/50 hover:bg-ivoire',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {match.image_128 && (
                      <img
                        src={`data:image/png;base64,${match.image_128}`}
                        alt={match.name}
                        className="w-8 h-8 rounded object-cover flex-shrink-0 bg-blanc border border-gris-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-bleu-nuit truncate">{match.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gris-1 mt-0.5">
                        {match.default_code && <span className="font-mono">{match.default_code}</span>}
                        {match.constructeur && <span>{match.constructeur}</span>}
                        {match.list_price != null && <span>{match.list_price.toFixed(2)} €</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={scoreVariant(match.score)}>
                      {(match.score * 100).toFixed(0)}%
                    </Badge>
                    <span className="text-xs text-gris-400 bg-ivoire px-1.5 py-0.5 rounded hidden sm:inline">
                      {match.match_label}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Inline comparison table */}
          {expanded && selectedMatch && (
            <ComparisonTable product={product} match={selectedMatch} />
          )}

          {/* Actions: apply images + open comparator */}
          {selectedMatch && (
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {imageUrls.length > 0 && (
                  <ApplyImagesButton
                    odooId={selectedMatch.odoo_id}
                    imageUrls={imageUrls}
                  />
                )}
                {autoApplied && (
                  <Badge variant="success" icon={Zap}>
                    Champs appliqués automatiquement
                  </Badge>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                withArrow
                onClick={() => navigate(`/odoo/products/${selectedMatch.odoo_id}`)}
              >
                Ouvrir le comparateur Odoo complet
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── scraping progress panel ────────────────────────────────────────────────────

const PHASE_META: Record<string, { label: string; spinning: boolean }> = {
  fetching:   { label: 'Chargement de la page…',         spinning: true  },
  crawling:   { label: 'Analyse de la page catégorie…',  spinning: false },
  scraping:   { label: 'Scraping des produits…',         spinning: true  },
  extracting: { label: 'Extraction des données…',        spinning: false },
  matching:   { label: 'Correspondance Odoo…',           spinning: false },
};

function StatusIcon({ status }: { readonly status: ProductStatus['status'] }) {
  if (status === 'done')    return <CheckCircle  className="h-4 w-4 text-succes shrink-0" aria-hidden="true" />;
  if (status === 'failed')  return <XCircle      className="h-4 w-4 text-erreur shrink-0" aria-hidden="true" />;
  if (status === 'pending') return <Clock        className="h-4 w-4 text-gris-400 shrink-0" aria-hidden="true" />;
  return <Loader2 className="h-4 w-4 text-bleu-petrole animate-spin shrink-0" aria-hidden="true" />;
}

const STATUS_LABEL: Record<ProductStatus['status'], string> = {
  pending:    'En attente',
  scraping:   'Scraping',
  extracting: 'Extraction',
  matching:   'Matching',
  done:       'Terminé',
  failed:     'Erreur',
};

const STATUS_BADGE_VARIANT: Record<ProductStatus['status'], BadgeVariant> = {
  pending:    'neutral',
  scraping:   'info',
  extracting: 'info',
  matching:   'info',
  done:       'success',
  failed:     'error',
};

function ProductStatusRow({
  item, index,
}: {
  readonly item: ProductStatus;
  readonly index: number;
}) {
  const name = item.name
    ?? item.source_url.split('/').findLast(Boolean)
    ?? `Produit ${index + 1}`;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-ivoire transition-colors">
      <span className="shrink-0 w-6 h-6 rounded-full bg-ivoire text-gris-1 text-xs font-medium flex items-center justify-center">
        {index + 1}
      </span>
      <StatusIcon status={item.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-bleu-nuit truncate">{name}</p>
        <p className="text-xs text-gris-400 truncate">{item.source_url}</p>
        {item.error && (
          <p className="text-xs text-erreur mt-0.5 truncate">{item.error}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.status === 'done' && item.odoo_matches.length > 0 && (
          <Badge variant="success">
            {item.odoo_matches.length} correspondance{item.odoo_matches.length > 1 ? 's' : ''}
          </Badge>
        )}
        {item.status === 'done' && item.odoo_matches.length === 0 && (
          <Badge variant="neutral">
            Aucune correspondance
          </Badge>
        )}
        <Badge variant={STATUS_BADGE_VARIANT[item.status]}>
          {STATUS_LABEL[item.status]}
        </Badge>
      </div>
    </div>
  );
}

function ScrapingProgressPanel({
  jobData,
}: {
  readonly jobData: ScrapeJobResponse | undefined;
}) {
  if (!jobData) {
    return (
      <Card className="flex items-center justify-center py-16">
        <Spinner className="h-8 w-8" />
      </Card>
    );
  }

  const phase      = jobData.phase ?? 'fetching';
  const meta       = PHASE_META[phase] ?? PHASE_META.fetching;
  const total      = jobData.total_products ?? 0;
  const processed  = jobData.processed ?? 0;
  const pct        = total > 0 ? Math.round((processed / total) * 100) : 0;
  const statuses   = jobData.product_statuses ?? [];
  const doneCount  = statuses.filter(s => s.status === 'done').length;
  const failCount  = statuses.filter(s => s.status === 'failed').length;

  return (
    <Card className="overflow-hidden">
      {/* Phase header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-info-fond border-b border-info/20">
        <Loader2 className={cn('h-5 w-5 text-bleu-petrole shrink-0', meta.spinning && 'animate-spin')} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-bleu-nuit text-sm">{meta.label}</p>
          {jobData.phase_detail && (
            <p className="text-xs text-bleu-petrole truncate mt-0.5">{jobData.phase_detail}</p>
          )}
        </div>
        {total > 0 && (
          <div className="flex items-center gap-3 shrink-0 text-sm">
            {doneCount > 0 && (
              <span className="text-succes font-medium">{doneCount} ✓</span>
            )}
            {failCount > 0 && (
              <span className="text-erreur font-medium">{failCount} ✗</span>
            )}
            <span className="text-bleu-nuit bg-info-fond px-3 py-1 rounded-full font-medium">
              {processed} / {total}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1.5 bg-ivoire">
          <div
            className="h-full bg-bleu-petrole transition-all duration-700 ease-out rounded-r-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Product list */}
      {statuses.length > 0 ? (
        <div className="divide-y divide-gris-0 max-h-[55vh] overflow-y-auto">
          {statuses.map((item, i) => (
            <ProductStatusRow key={item.source_url} item={item} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gris-400">
          <Spinner className="h-4 w-4" />
          Initialisation du scraping…
        </div>
      )}

      {/* Live summary footer when some products already done */}
      {doneCount > 0 && (
        <div className="px-5 py-2.5 bg-succes-fond border-t border-succes/20 text-xs text-succes font-medium">
          {doneCount} produit{doneCount > 1 ? 's' : ''} extrait{doneCount > 1 ? 's' : ''} —
          résultats complets disponibles à la fin
        </div>
      )}
    </Card>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  const m = PHASE_META[status];
  return m ? m.label : 'Scraping en cours…';
}

export default function WebScraperPage() {
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeJobResponse | null>(null);

  // Phase 1: submit URL → get job_id or immediate result on cache hit
  const { mutate: scrape, isPending: isSubmitting, error } = useMutation({
    mutationFn: (u: string) => scraperApi.scrapeUrl(u),
    onSuccess: data => {
      if (data.status === 'done') {
        setResult(data);
        setJobId(null);
      } else {
        setJobId(data.job_id);
      }
    },
    onError: () => {
      setResult(null);
      setJobId(null);
    },
  });

  // Phase 2: poll until done or failed
  const { data: jobData } = useQuery({
    queryKey: ['scrape-job', jobId],
    queryFn: () => scraperApi.getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: query => {
      const s = query.state.data?.status;
      return s === 'done' || s === 'failed' ? false : 2000;
    },
  });

  useEffect(() => {
    if (!jobData) return;
    if (jobData.status === 'done' || jobData.status === 'failed') {
      setResult(jobData);
      setJobId(null);
    }
  }, [jobData]);

  const isPolling = !!jobId && jobData?.status !== 'done' && jobData?.status !== 'failed';
  const isPending = isSubmitting || isPolling;
  const currentStatus = jobData?.status ?? '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      setResult(null);
      setJobId(null);
      scrape(url.trim());
    }
  };

  const axiosDetail = error instanceof Error
    ? (error as unknown as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? error.message
    : null;
  const errorMessage = axiosDetail ?? (result?.status === 'failed' ? (result.error ?? 'Échec du scraping') : null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Scraper Web"
        subtitle="Collez l'URL d'une page produit fournisseur — nous extrairons les produits et trouverons automatiquement les correspondances Odoo."
        className="mb-0"
      />

      {/* URL form */}
      <Card className="p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gris-400" aria-hidden="true" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://fournisseur.com/produit/cable-hdmi-2m"
              required
              aria-label="URL de la page produit fournisseur"
              className="w-full rounded-button border border-gris-0 bg-blanc py-2.5 pl-9 pr-4 text-sm text-bleu-nuit placeholder:text-gris-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            loading={isPending}
            disabled={isPending || !url.trim()}
          >
            {isPending ? (
              statusLabel(currentStatus)
            ) : (
              <><Search className="h-4 w-4" aria-hidden="true" /> Scraper</>
            )}
          </Button>
        </form>
      </Card>

      {/* Live progress panel — shown while the job is running */}
      {isPolling && (
        <ScrapingProgressPanel jobData={jobData} />
      )}

      {/* Error state */}
      {errorMessage && !isPending && (
        <div className="flex items-start gap-3 bg-erreur-fond border border-erreur/30 rounded-card px-4 py-3" role="alert">
          <AlertCircle className="h-5 w-5 text-erreur flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium text-bleu-nuit text-sm">Échec du scraping</p>
            <p className="text-erreur text-sm mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result?.status === 'done' && !isPending && (
        <>
          {/* Summary bar */}
          <Card className="flex items-center gap-4 px-5 py-3 text-sm">
            <ExternalLink className="h-4 w-4 text-gris-400 flex-shrink-0" aria-hidden="true" />
            <span className="text-gris-1 truncate flex-1">{result.url}</span>
            {result.from_cache && (
              <Badge variant="info" className="shrink-0">
                depuis le cache
              </Badge>
            )}
            <span className="text-bleu-nuit font-medium flex-shrink-0">
              {result.total_products} produit{result.total_products === 1 ? '' : 's'} trouvé{result.total_products === 1 ? '' : 's'}
            </span>
            <span className={cn('font-medium flex-shrink-0', result.total_matched > 0 ? 'text-succes' : 'text-gris-1')}>
              {result.total_matched} correspondance{result.total_matched === 1 ? '' : 's'} dans Odoo
            </span>
          </Card>

          {result.warning && (
            <div className="flex items-center gap-2 bg-alerte-fond border border-alerte/30 rounded-card px-4 py-2.5 text-sm text-alerte">
              <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {result.warning}
            </div>
          )}

          {/* Product cards */}
          {result.products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Aucun produit n'a pu être extrait de cette page"
              description="Essayez une page de détail produit ou une page de liste de catégorie"
            />
          ) : (
            <div className="space-y-4">
              {result.products.map((product, i) => (
                <ProductCard key={`${product.scraped.name}-${i}`} product={product} index={i} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
