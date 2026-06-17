import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, RefreshCw, Save, CheckCircle2, Upload,
  Images, ExternalLink, Star, X, Check, Package,
} from 'lucide-react';
import { CatalogMatch, OdooGalleryImage, OdooProductDetail, OdooProductUpdate, odooApi } from '../api/odoo';
import { productApi } from '../api/products';
import { Product } from '../types/product';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';

type ComparatorField = {
  key: keyof OdooProductUpdate;
  label: string;
  type: 'text' | 'number' | 'boolean';
  getExtractedValue: (p: Product) => string | number | boolean | null | undefined;
  readonly?: boolean;
};

const READONLY_KEYS = new Set<keyof OdooProductUpdate>([
  'name', 'default_code', 'constructeur', 'country_of_origin', 'list_price',
]);

const FIELDS: ComparatorField[] = [
  { key: 'name', label: 'Nom', type: 'text', getExtractedValue: p => p.name, readonly: true },
  { key: 'default_code', label: 'Code par défaut', type: 'text', getExtractedValue: p => p.default_code, readonly: true },
  { key: 'barcode', label: 'Code-barres', type: 'text', getExtractedValue: p => p.barcode },
  { key: 'code_ean', label: 'EAN', type: 'text', getExtractedValue: p => p.Code_EAN },
  { key: 'constructeur', label: 'Constructeur', type: 'text', getExtractedValue: p => p.constructeur, readonly: true },
  { key: 'ref_constructeur', label: 'Référence fabricant', type: 'text', getExtractedValue: p => p.refConstructeur },
  { key: 'description_courte', label: 'Description courte', type: 'text', getExtractedValue: p => p.description_courte },
  { key: 'description_ecommerce', label: 'Description e-commerce', type: 'text', getExtractedValue: p => p.description_ecommerce },
  { key: 'features_description', label: 'Caractéristiques', type: 'text', getExtractedValue: p => p.features_description },
  { key: 'country_of_origin', label: 'Pays d\'origine', type: 'text', getExtractedValue: p => p.country_of_origin, readonly: true },
  { key: 'length', label: 'Longueur (mm)', type: 'number', getExtractedValue: p => p.length },
  { key: 'width', label: 'Largeur (mm)', type: 'number', getExtractedValue: p => p.width },
  { key: 'height', label: 'Hauteur (mm)', type: 'number', getExtractedValue: p => p.height },
  { key: 'weight', label: 'Poids (kg)', type: 'number', getExtractedValue: p => p.weight },
  { key: 'hs_code', label: 'HS Code', type: 'text', getExtractedValue: p => p.hs_code },
  { key: 'contient_du_lithium', label: 'Contient du lithium', type: 'boolean', getExtractedValue: p => p.contient_du_lithium },
  { key: 'list_price', label: 'Prix', type: 'number', getExtractedValue: p => p.lst_price, readonly: true },
];

function toDraft(product: OdooProductDetail): OdooProductUpdate {
  return {
    name: product.name ?? undefined,
    default_code: product.default_code ?? undefined,
    barcode: product.barcode ?? undefined,
    code_ean: product.code_ean ?? undefined,
    constructeur: product.constructeur ?? undefined,
    ref_constructeur: product.ref_constructeur ?? undefined,
    description_courte: product.description_courte ?? undefined,
    description_ecommerce: product.description_ecommerce ?? undefined,
    features_description: product.features_description ?? undefined,
    country_of_origin: product.country_of_origin ?? undefined,
    length: product.length ?? undefined,
    width: product.width ?? undefined,
    height: product.height ?? undefined,
    weight: product.weight ?? undefined,
    hs_code: product.hs_code ?? undefined,
    contient_du_lithium: product.contient_du_lithium ?? undefined,
    list_price: product.list_price ?? undefined,
    active: product.active,
    is_published: product.is_published,
  };
}

// ── Image-role types ─────────────────────────────────────────────────────────

type ImageRole = 'main' | 'gallery' | 'skip';

// ── useImageSelection hook ───────────────────────────────────────────────────

function useImageSelection(images: string[], resetKey: string | undefined) {
  const [mainUrl, setMainUrl] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const prevKeyRef = useRef(resetKey);

  // Reset whenever the candidate (resetKey) changes.
  if (prevKeyRef.current !== resetKey) {
    prevKeyRef.current = resetKey;
    setMainUrl(null);
    setSkipped(new Set());
  }

  const getRole = useCallback((url: string): ImageRole => {
    if (url === mainUrl) return 'main';
    if (skipped.has(url)) return 'skip';
    return 'gallery';
  }, [mainUrl, skipped]);

  const toggleSkip = useCallback((url: string) => {
    setSkipped(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
        // Un-main if being skipped
        setMainUrl(current => current === url ? null : current);
      }
      return next;
    });
  }, []);

  const setMain = useCallback((url: string) => {
    setMainUrl(prev => prev === url ? null : url);  // clicking main again → demote to gallery
    // Ensure the chosen main is not in the skipped set
    setSkipped(prev => {
      if (!prev.has(url)) return prev;
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  }, []);

  const galleryUrls = images.filter(u => !skipped.has(u) && u !== mainUrl);
  const skippedCount = skipped.size;
  const hasSelection = mainUrl !== null || galleryUrls.length > 0;

  return { getRole, mainUrl, galleryUrls, skippedCount, hasSelection, toggleSkip, setMain };
}

function getBorderClass(role: ImageRole): string {
  if (role === 'main')    return 'border-2 border-bleu-nuit ring-2 ring-bleu-nuit/15';
  if (role === 'gallery') return 'border-2 border-succes';
  return 'border border-gris-0';
}

// ── ImageTile ────────────────────────────────────────────────────────────────

function ImageTile({
  url, role, onToggleSkip, onSetMain,
}: Readonly<{
  url: string;
  role: ImageRole;
  onToggleSkip: () => void;
  onSetMain: () => void;
}>) {
  const [imgError, setImgError] = useState(false);

  const borderCls = getBorderClass(role);

  const dimCls = role === 'skip' ? 'opacity-35' : '';

  return (
    <div className="relative group select-none" title={url}>
      {/* Main image container — click to toggle skip */}
      <button
        type="button"
        onClick={onToggleSkip}
        className={`w-24 h-24 rounded-card overflow-hidden bg-ivoire flex items-center justify-center transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole ${borderCls} ${dimCls} hover:opacity-90`}
        aria-label={role === 'skip' ? 'Inclure l\'image' : 'Ignorer l\'image'}
      >
        {imgError ? (
          <Package className="h-8 w-8 text-gris-400" />
        ) : (
          <img
            src={url}
            alt=""
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
          />
        )}
      </button>

      {/* Skip overlay */}
      {role === 'skip' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-card">
          <div className="absolute inset-0 bg-bleu-nuit/40 rounded-card" />
          <X className="h-7 w-7 text-blanc relative z-10" />
        </div>
      )}

      {/* Star button — set / unset main (top-right) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSetMain(); }}
        aria-label={role === 'main' ? 'Retirer comme image principale' : 'Définir comme image principale'}
        title={role === 'main' ? 'Retirer comme image principale' : 'Définir comme image principale'}
        className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-card transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole
          ${role === 'main'
            ? 'bg-bleu-nuit text-blanc scale-100'
            : 'bg-blanc/90 text-gris-400 scale-75 opacity-0 group-hover:opacity-100 group-hover:scale-100 hover:text-orange-feu'}`}
      >
        <Star className={`h-3.5 w-3.5 ${role === 'main' ? 'fill-blanc' : ''}`} />
      </button>

      {/* Role badge (bottom) */}
      <div className="mt-1 flex justify-center">
        {role === 'main' && (
          <span className="text-xs font-medium text-bleu-nuit">Principale</span>
        )}
        {role === 'gallery' && (
          <span className="text-xs text-succes flex items-center gap-0.5">
            <Check className="h-3 w-3" /> Galerie
          </span>
        )}
        {role === 'skip' && (
          <span className="text-xs text-gris-400">Ignorée</span>
        )}
      </div>
    </div>
  );
}

// ── OdooCurrentImages (left column) ─────────────────────────────────────────

function OdooCurrentImages({
  mainImage1920,
  galleryImages,
}: Readonly<{
  mainImage1920: string | null | undefined;
  galleryImages: OdooGalleryImage[];
}>) {
  return (
    <div className="p-5">
      <p className="text-xs font-semibold text-gris-400 uppercase tracking-wide mb-3">
        Images Odoo actuelles
      </p>
      <div className="flex flex-wrap gap-3">
        {mainImage1920 ? (
          <div className="relative group">
            <img
              src={`data:image/png;base64,${mainImage1920}`}
              alt="Principale"
              className="w-24 h-24 object-contain rounded-card border-2 border-info bg-ivoire"
            />
            <div className="mt-1 flex justify-center">
              <span className="text-xs font-medium text-info">Principale</span>
            </div>
          </div>
        ) : (
          <div className="w-24 h-24 rounded-card border-2 border-dashed border-gris-0 bg-ivoire flex flex-col items-center justify-center gap-1">
            <Package className="h-6 w-6 text-gris-400" />
            <span className="text-xs text-gris-400">Aucune principale</span>
          </div>
        )}
        {galleryImages.map(img =>
          img.image_1920 ? (
            <div key={img.id} title={img.name}>
              <img
                src={`data:image/png;base64,${img.image_1920}`}
                alt={img.name}
                className="w-20 h-20 object-contain rounded-card border border-gris-0 bg-ivoire"
              />
              <div className="mt-1 flex justify-center">
                <span className="text-xs text-gris-400 truncate max-w-20">{img.name}</span>
              </div>
            </div>
          ) : null,
        )}
        {!mainImage1920 && galleryImages.length === 0 && (
          <p className="text-sm text-gris-400 italic">Aucune image dans Odoo</p>
        )}
      </div>
    </div>
  );
}

// ── ExtractedImagePicker (right column) ─────────────────────────────────────

function ExtractedImagePicker({
  odooId,
  extractedProduct,
  selectedMatchId,
}: Readonly<{
  odooId: number;
  extractedProduct: Product | undefined;
  selectedMatchId: string | undefined;
}>) {
  const queryClient = useQueryClient();
  const images = useMemo(
    () => (extractedProduct ? extractedImageSrcs(extractedProduct) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extractedProduct?._id],
  );

  const { getRole, mainUrl, galleryUrls, skippedCount, hasSelection, toggleSkip, setMain }
    = useImageSelection(images, selectedMatchId);

  const applyMutation = useMutation({
    mutationFn: () => odooApi.applyImages(odooId, mainUrl, galleryUrls),
    onSuccess: res => {
      const parts = [
        res.main_image_updated && '1 main',
        res.gallery_images_written > 0 && `${res.gallery_images_written} gallery`,
      ].filter(Boolean).join(' + ');
      toast.success('Images appliquées dans Odoo' + (parts ? ' : ' + parts : ''));
      queryClient.invalidateQueries({ queryKey: ['odoo-product', odooId] });
      queryClient.invalidateQueries({ queryKey: ['odoo-gallery', odooId] });
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Échec de la mise à jour des images'),
  });

  const sourceUrl = extractedProduct?.scrape_source_urls?.[0]
    ?? extractedProduct?.source_url;

  if (!extractedProduct) {
    return (
      <div className="p-5 flex items-center justify-center h-full">
        <EmptyState
          icon={Images}
          title="Aucun candidat sélectionné"
          description="Sélectionnez un candidat à gauche pour voir les images."
          className="border-0 bg-transparent py-8 px-0"
        />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="p-5 flex items-center justify-center h-full">
        <EmptyState
          icon={Images}
          title="Aucune image"
          description="Aucune image trouvée pour ce produit extrait."
          className="border-0 bg-transparent py-8 px-0"
        />
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gris-400 uppercase tracking-wide">
            Images extraites
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-2 normal-case font-normal text-bleu-petrole hover:underline"
              >
                <ExternalLink className="inline h-3 w-3 mr-0.5" />source
              </a>
            )}
          </p>
          <p className="text-xs text-gris-1 mt-0.5">
            Cliquez sur <Star className="inline h-3 w-3 text-orange-feu" /> pour définir la principale
            &nbsp;·&nbsp;
            cliquez sur l'image pour inclure / ignorer
          </p>
        </div>
      </div>

      {/* Image grid */}
      <div className="flex flex-wrap gap-4">
        {images.map(url => (
          <ImageTile
            key={url}
            url={url}
            role={getRole(url)}
            onToggleSkip={() => toggleSkip(url)}
            onSetMain={() => setMain(url)}
          />
        ))}
      </div>

      {/* Summary + apply */}
      <div className="flex items-center justify-between pt-2 border-t border-gris-0">
        <div className="flex items-center gap-3 text-xs text-gris-1">
          {mainUrl && (
            <span className="flex items-center gap-1 text-bleu-nuit font-medium">
              <Star className="h-3.5 w-3.5 fill-bleu-nuit" /> 1 principale
            </span>
          )}
          {galleryUrls.length > 0 && (
            <span className="flex items-center gap-1 text-succes font-medium">
              <Check className="h-3.5 w-3.5" /> {galleryUrls.length} galerie
            </span>
          )}
          {skippedCount > 0 && (
            <span className="flex items-center gap-1 text-gris-400">
              <X className="h-3.5 w-3.5" /> {skippedCount} ignorée(s)
            </span>
          )}
          {!hasSelection && (
            <span className="text-gris-400 italic">Aucune sélection — cliquez sur les images pour les inclure</span>
          )}
        </div>
        <Button
          variant="accent"
          size="sm"
          onClick={() => applyMutation.mutate()}
          disabled={!hasSelection || applyMutation.isPending}
          loading={applyMutation.isPending}
        >
          {!applyMutation.isPending && <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
          {applyMutation.isPending ? 'Application…' : 'Appliquer dans Odoo'}
        </Button>
      </div>
    </div>
  );
}

/** Resolve a stored image path to an absolute URL.
 *
 *  File-based (PDF) images are stored as relative paths like
 *  "extracted_images/512/product_A212_0.jpg".  They are served by the backend
 *  at its root (not under /api/v1), so we strip the api path segment.
 */
function resolveImagePath(path: string): string {
  const apiBase = import.meta.env.VITE_API_URL as string || 'http://localhost:8000/api/v1';
  const backendOrigin = new URL(apiBase).origin;
  return `${backendOrigin}/${path}`;
}

/** Return all displayable image URLs for an extracted (catalog) product.
 *
 *  Priority:
 *  1. `image_urls`  — web-scraped external URLs (highest quality, direct links)
 *  2. `image_1920`  — base64 or relative path stored on the product document
 *  3. `images[]`    — file-based images from PDF extraction
 *
 *  Returns an array of strings.  Each entry is either an external URL or a
 *  data-URI or a backend-resolved URL — all safe to use as <img src>.
 */
function extractedImageSrcs(product: Product): string[] {
  // Web-scrape images (preferred)
  if ((product.image_urls?.length ?? 0) > 0) {
    return product.image_urls!.filter(u => !u.includes('/events/'));
  }

  const srcs: string[] = [];

  // Stored base64 / relative path images
  for (const field of ['image_1920', 'image_1024', 'image_512'] as const) {
    const val = product[field];
    if (val) {
      srcs.push(val.startsWith('data:') || val.startsWith('http') ? val : resolveImagePath(val));
      break;  // just take the first available size as main
    }
  }

  // File-based images from PDF extraction
  for (const img of product.images ?? []) {
    const path = img.paths?.size_512 || img.paths?.size_256 || img.paths?.size_1024 || img.paths?.size_1920;
    if (path) {
      srcs.push(resolveImagePath(path));
    }
  }

  return srcs;
}

function hasUsableValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Map a match score to a semantic badge tier: strong→success, medium→info, weak→alerte. */
function matchBadgeVariant(score: number): BadgeVariant {
  if (score >= 0.9) return 'success';
  if (score >= 0.7) return 'info';
  return 'warning';
}

export default function OdooComparatorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const odooId = Number(id);
  const initialMatchId = searchParams.get('match') || undefined;

  const [selectedMatchId, setSelectedMatchId] = useState<string | undefined>(initialMatchId);
  const [draft, setDraft] = useState<OdooProductUpdate>({});

  const { data: odooProduct, isLoading: isLoadingOdoo } = useQuery({
    queryKey: ['odoo-product', odooId],
    queryFn: () => odooApi.getProduct(odooId),
    enabled: Number.isFinite(odooId),
  });

  const { data: matchesData, isLoading: isLoadingMatches, refetch: refetchMatches } = useQuery({
    queryKey: ['odoo-match', odooId, 30],
    queryFn: () => odooApi.findCatalogMatch(odooId, 30),
    enabled: Number.isFinite(odooId),
  });

  const selectedMatch = useMemo<CatalogMatch | undefined>(
    () => matchesData?.matches.find(m => m.product_id === selectedMatchId),
    [matchesData, selectedMatchId]
  );

  const { data: extractedProduct, isLoading: isLoadingExtracted } = useQuery({
    queryKey: ['product', selectedMatchId],
    queryFn: () => productApi.getProduct(selectedMatchId as string),
    enabled: !!selectedMatchId,
  });

  useEffect(() => {
    if (odooProduct) {
      setDraft(toDraft(odooProduct));
    }
  }, [odooProduct]);

  useEffect(() => {
    if (!matchesData || matchesData.matches.length === 0) return;
    const exists = selectedMatchId && matchesData.matches.some(m => m.product_id === selectedMatchId);
    if (!exists) {
      setSelectedMatchId(initialMatchId && matchesData.matches.some(m => m.product_id === initialMatchId)
        ? initialMatchId
        : matchesData.matches[0].product_id);
    }
  }, [matchesData, selectedMatchId, initialMatchId]);

  const autoAppliedForRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!extractedProduct || !selectedMatch || isLoadingExtracted) return;
    if (selectedMatch.score < 0.9) return;
    if (autoAppliedForRef.current === selectedMatchId) return;
    autoAppliedForRef.current = selectedMatchId;

    const updates: OdooProductUpdate = {};
    for (const field of FIELDS) {
      if (field.readonly) continue;
      const nextValue = field.getExtractedValue(extractedProduct);
      if (hasUsableValue(nextValue)) {
        updates[field.key] = nextValue as never;
      }
    }
    setDraft(prev => ({ ...prev, ...updates }));
    toast.success(
      `Champs extraits appliqués automatiquement — correspondance à ${(selectedMatch.score * 100).toFixed(0)}%`,
      { duration: 4000 }
    );
  }, [extractedProduct, selectedMatch, isLoadingExtracted, selectedMatchId]);

  const { data: galleryData } = useQuery({
    queryKey: ['odoo-gallery', odooId],
    queryFn: () => odooApi.getProductGallery(odooId),
    enabled: Number.isFinite(odooId),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: OdooProductUpdate) => odooApi.updateProduct(odooId, updates),
    onSuccess: () => {
      toast.success('Produit Odoo mis à jour avec succès');
      queryClient.invalidateQueries({ queryKey: ['odoo-product', odooId] });
      queryClient.invalidateQueries({ queryKey: ['odoo-products'] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Échec de la mise à jour du produit Odoo';
      toast.error(message);
    },
  });

  const applyExtractedField = (field: ComparatorField) => {
    if (!extractedProduct) return;
    const nextValue = field.getExtractedValue(extractedProduct);
    if (!hasUsableValue(nextValue)) return;
    setDraft(prev => ({ ...prev, [field.key]: nextValue as never }));
  };

  const applyAllExtracted = () => {
    if (!extractedProduct) return;
    const updates: OdooProductUpdate = {};
    for (const field of FIELDS) {
      if (field.readonly) continue;
      const nextValue = field.getExtractedValue(extractedProduct);
      if (hasUsableValue(nextValue)) {
        updates[field.key] = nextValue as never;
      }
    }
    setDraft(prev => ({ ...prev, ...updates }));
    toast.success('Valeurs extraites copiées dans le brouillon');
  };

  const buildUpdatePayload = (d: OdooProductUpdate): OdooProductUpdate => {
    const payload = { ...d };
    for (const key of READONLY_KEYS) {
      delete payload[key];
    }
    return payload;
  };

  if (!Number.isFinite(odooId)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        <ErrorState
          title="Identifiant invalide"
          description="Identifiant de produit Odoo invalide."
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/odoo')}
            className="p-2 rounded-button text-bleu-nuit hover:bg-ivoire focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
            aria-label="Retour aux produits Odoo"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-h5 font-heading font-light text-bleu-nuit">Comparateur Odoo</h1>
            <p className="text-sm text-gris-1">
              Comparez les données extraites du catalogue avec le produit Odoo et choisissez les mises à jour champ par champ.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetchMatches()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Actualiser les correspondances
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => updateMutation.mutate(buildUpdatePayload(draft))}
            disabled={updateMutation.isPending}
            loading={updateMutation.isPending}
          >
            {!updateMutation.isPending && <Save className="h-4 w-4" aria-hidden="true" />}
            {updateMutation.isPending ? 'Enregistrement...' : 'Mettre à jour le produit Odoo'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 p-4">
          <h2 className="text-sm font-semibold text-bleu-nuit mb-3">Produits extraits candidats</h2>
          {isLoadingMatches ? (
            <p className="text-sm text-gris-1">Chargement des correspondances...</p>
          ) : (
            (!matchesData || matchesData.matches.length === 0) ? (
              <p className="text-sm text-gris-1">Aucune correspondance extraite trouvée pour ce produit Odoo.</p>
            ) : (
            <div className="space-y-2">
              {matchesData.matches.map(match => (
                <button
                  key={match.product_id}
                  onClick={() => setSelectedMatchId(match.product_id)}
                  className={`w-full text-left border rounded-card p-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole ${
                    selectedMatchId === match.product_id
                      ? 'border-bleu-nuit bg-bleu-nuit/5'
                      : 'border-gris-0 hover:border-bleu-petrole'
                  }`}
                >
                  <p className="font-medium text-sm text-bleu-nuit truncate">{match.product_name}</p>
                  <div className="mt-1">
                    <Badge variant={matchBadgeVariant(match.score)}>
                      Score : {(match.score * 100).toFixed(0)}% | {match.match_type}
                    </Badge>
                  </div>
                  {match.default_code && (
                    <p className="text-xs text-gris-400 font-mono mt-1">{match.default_code}</p>
                  )}
                </button>
              ))}
            </div>
            )
          )}
        </Card>

        <Card className="lg:col-span-2 overflow-hidden p-0">
          <div className="border-b border-gris-0 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-bleu-nuit">
                {isLoadingOdoo ? 'Chargement du produit Odoo...' : `Odoo : ${odooProduct?.name || '-'}`}
              </h2>
              <p className="text-xs text-gris-1">
                {selectedMatch
                  ? `Comparaison avec le candidat extrait : ${selectedMatch.product_name}`
                  : 'Sélectionnez un candidat à gauche pour comparer'}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={applyAllExtracted}
              disabled={!extractedProduct}
            >
              Utiliser tous les champs extraits
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-ivoire">
                <tr>
                  <th className="text-left text-xs font-medium text-gris-1 uppercase px-4 py-3">Champ</th>
                  <th className="text-left text-xs font-medium text-gris-1 uppercase px-4 py-3">Odoo actuel</th>
                  <th className="text-left text-xs font-medium text-gris-1 uppercase px-4 py-3">Extrait</th>
                  <th className="text-left text-xs font-medium text-gris-1 uppercase px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris-0">
                {FIELDS.map(field => {
                  const odooValue = draft[field.key];
                  const extractedValue = extractedProduct ? field.getExtractedValue(extractedProduct) : undefined;
                  const canApply = hasUsableValue(extractedValue);
                  const isSame = displayValue(odooValue) === displayValue(extractedValue);

                  return (
                    <tr key={field.key} className={field.readonly ? 'bg-ivoire' : undefined}>
                      <td className="px-4 py-3 text-sm font-medium text-bleu-nuit">
                        {field.label}
                        {field.readonly && (
                          <span className="ml-1.5 text-xs font-normal text-gris-400">(lecture seule)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gris-1 align-top">{displayValue(odooValue)}</td>
                      <td className="px-4 py-3 text-sm text-gris-1 align-top">
                        {isLoadingExtracted && selectedMatchId ? 'Chargement...' : displayValue(extractedValue)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => applyExtractedField(field)}
                          disabled={field.readonly || !canApply || isSame || !extractedProduct}
                          className="text-xs px-2.5 py-1.5 rounded-button border border-bleu-petrole text-bleu-petrole hover:bg-bleu-petrole/5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Utiliser l'extrait
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {/* ── Images panel ─────────────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gris-0">
          <Images className="h-4 w-4 text-gris-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-bleu-nuit">Images</h2>
        </div>
        <div className="grid grid-cols-2 divide-x divide-gris-0">
          <OdooCurrentImages
            mainImage1920={odooProduct?.image_1920}
            galleryImages={galleryData?.images ?? []}
          />
          <ExtractedImagePicker
            odooId={odooId}
            extractedProduct={extractedProduct}
            selectedMatchId={selectedMatchId}
          />
        </div>
      </Card>
    </div>
  );
}
