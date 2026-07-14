/**
 * Product detail page with all fields and sources.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { productApi } from '../api/products';
import type { ProductOdooMatch } from '../api/products';
import type { ProductUpdate, ProductSource, Product, OdooMatchInfo } from '../types/product';
import { ArrowLeft, CheckCircle, Edit, Link2, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '../lib/cn';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, statusBadge } from '../components/ui/Badge';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<ProductUpdate>({});

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
      toast.success('Produit validé avec succès');
    },
    onError: () => {
      toast.error('Échec de la validation du produit');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updates: ProductUpdate) => productApi.updateProduct(id!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      setIsEditing(false);
      toast.success('Produit mis à jour avec succès');
    },
    onError: () => {
      toast.error('Échec de la mise à jour du produit');
    },
  });

  const handleEditStart = () => {
    if (!product) return;
    setEditData({
      name: product.name,
      default_code: product.default_code,
      barcode: product.barcode,
      Code_EAN: product.Code_EAN,
      constructeur: product.constructeur,
      refConstructeur: product.refConstructeur,
      description_courte: product.description_courte,
      description_ecommerce: product.description_ecommerce,
      features_description: product.features_description,
      length: product.length,
      width: product.width,
      height: product.height,
      weight: product.weight,
      hs_code: product.hs_code,
      contient_du_lithium: product.contient_du_lithium,
      lst_price: product.lst_price,
      categ_id: product.categ_id,
      country_of_origin: product.country_of_origin,
      active: product.active,
      is_published: product.is_published,
    });
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditData({});
  };

  const handleSave = () => {
    updateMutation.mutate(editData);
  };

  const setField = (field: keyof ProductUpdate, value: any) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  // Returns the current value for a field: editData when editing, product otherwise
  const fv = <K extends keyof ProductUpdate>(field: K): ProductUpdate[K] =>
    (isEditing ? editData : (product as unknown as ProductUpdate))[field];

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-12 w-12" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <ErrorState
          title="Produit introuvable"
          description="Ce produit n'existe pas ou n'a pas pu être chargé."
          onRetry={() => navigate('/products')}
        />
      </div>
    );
  }


  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <ProductHeader
          product={product}
          isEditing={isEditing}
          editName={editData.name ?? ''}
          onNameChange={v => setField('name', v)}
          onBack={() => navigate('/products')}
        />
        <ProductActions
          isEditing={isEditing}
          isSaving={updateMutation.isPending}
          isValidated={product.extraction_metadata?.status === 'validated'}
          isValidating={validateMutation.isPending}
          onEdit={handleEditStart}
          onSave={handleSave}
          onCancel={handleEditCancel}
          onValidate={() => validateMutation.mutate(product._id)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identifiers */}
          <Card className="p-6">
            <h2 className="mb-4 font-heading text-h5 font-light text-bleu-nuit">Identifiants</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField
                label="Code par défaut"
                value={fv('default_code')}
                confidence={product.extraction_metadata?.field_confidence_scores?.default_code}
                isEditing={isEditing}
                onChange={v => setField('default_code', v)}
              />
              <InfoField
                label="Code-barres"
                value={fv('barcode')}
                confidence={product.extraction_metadata?.field_confidence_scores?.barcode}
                isEditing={isEditing}
                onChange={v => setField('barcode', v)}
              />
              <InfoField
                label="Code EAN"
                value={fv('Code_EAN')}
                confidence={product.extraction_metadata?.field_confidence_scores?.code_ean}
                isEditing={isEditing}
                onChange={v => setField('Code_EAN', v)}
              />
            </div>
          </Card>

          {/* Manufacturer */}
          <Card className="p-6">
            <h2 className="mb-4 font-heading text-h5 font-light text-bleu-nuit">Fabricant</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField
                label="Fabricant"
                value={fv('constructeur')}
                confidence={product.extraction_metadata?.field_confidence_scores?.constructeur}
                isEditing={isEditing}
                onChange={v => setField('constructeur', v)}
              />
              <InfoField
                label="Référence fabricant"
                value={fv('refConstructeur')}
                confidence={product.extraction_metadata?.field_confidence_scores?.ref_constructeur}
                isEditing={isEditing}
                onChange={v => setField('refConstructeur', v)}
              />
            </div>
          </Card>

          {/* Descriptions */}
          <Card className="p-6">
            <h2 className="mb-4 font-heading text-h5 font-light text-bleu-nuit">Descriptions</h2>
            <div className="space-y-4">
              <InfoField
                label="Description courte"
                value={fv('description_courte')}
                multiline
                isEditing={isEditing}
                onChange={v => setField('description_courte', v)}
              />
              <InfoField
                label="Description e-commerce"
                value={fv('description_ecommerce')}
                multiline
                isEditing={isEditing}
                onChange={v => setField('description_ecommerce', v)}
              />
              <InfoField
                label="Caractéristiques"
                value={fv('features_description')}
                multiline
                isEditing={isEditing}
                onChange={v => setField('features_description', v)}
              />
            </div>
          </Card>

          {/* Dimensions & Logistics */}
          <Card className="p-6">
            <h2 className="mb-4 font-heading text-h5 font-light text-bleu-nuit">
              Dimensions et logistique
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label="Longueur" value={fv('length')} unit="mm" fieldType="number" isEditing={isEditing} onChange={v => setField('length', v)} />
              <InfoField label="Largeur" value={fv('width')} unit="mm" fieldType="number" isEditing={isEditing} onChange={v => setField('width', v)} />
              <InfoField label="Hauteur" value={fv('height')} unit="mm" fieldType="number" isEditing={isEditing} onChange={v => setField('height', v)} />
              <InfoField label="Poids" value={fv('weight')} unit="kg" fieldType="number" isEditing={isEditing} onChange={v => setField('weight', v)} />
              <InfoField label="Code SH" value={fv('hs_code')} isEditing={isEditing} onChange={v => setField('hs_code', v)} />
              <InfoField label="Contient du lithium" value={fv('contient_du_lithium')} fieldType="boolean" isEditing={isEditing} onChange={v => setField('contient_du_lithium', v)} />
            </div>
          </Card>

          {/* Pricing */}
          <Card className="p-6">
            <h2 className="mb-4 font-heading text-h5 font-light text-bleu-nuit">Tarification</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField
                label="Prix"
                value={fv('lst_price')}
                unit="€"
                fieldType="number"
                isEditing={isEditing}
                onChange={v => setField('lst_price', v)}
              />
              <InfoField
                label="Taxes"
                value={product.taxes_id?.join(', ')}
              />
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <ProductSidebar product={product} sourcesData={sourcesData} />
      </div>
    </div>
  );
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  web_scrape: 'Page web',
  url: 'Page web',
  pdf: 'Document PDF',
};

function sourceTypeLabel(source: ProductSource): string {
  const key = source.source_type ?? source.extraction_type ?? '';
  return SOURCE_TYPE_LABELS[key] ?? 'Source';
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function OdooLinkedView({ linked }: Readonly<{ linked: OdooMatchInfo }>) {
  const navigate = useNavigate();
  const pct = linked.score != null ? Math.round(linked.score * 100) : null;
  return (
    <div className="space-y-3">
      <Badge variant="success" icon={CheckCircle}>
        {pct != null ? `Lié à Odoo · ${pct}%` : 'Lié à Odoo'}
      </Badge>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gris-1">Produit Odoo</dt>
          <dd className="font-medium text-bleu-nuit">#{linked.odoo_id}</dd>
        </div>
        {linked.matched_at && (
          <div className="flex justify-between gap-3">
            <dt className="text-gris-1">Synchronisé le</dt>
            <dd className="font-medium text-bleu-nuit">{format(new Date(linked.matched_at), 'PPp', { locale: fr })}</dd>
          </div>
        )}
        {linked.applied_fields?.length > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-gris-1">Champs transférés</dt>
            <dd className="font-medium text-bleu-nuit">{linked.applied_fields.length}</dd>
          </div>
        )}
      </dl>
      <Button variant="secondary" size="sm" withArrow onClick={() => navigate(`/odoo/products/${linked.odoo_id}`)}>
        Ouvrir le comparateur Odoo
      </Button>
    </div>
  );
}

function OdooCandidate({ match, onMatch, loading, disabled }: Readonly<{
  match: ProductOdooMatch;
  onMatch: (m: ProductOdooMatch) => void;
  loading: boolean;
  disabled: boolean;
}>) {
  return (
    <div className="rounded-card border border-gris-0 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-bleu-nuit">{match.name}</p>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gris-1">
            {match.default_code && <span className="font-mono">{match.default_code}</span>}
            {match.constructeur && <span>{match.constructeur}</span>}
          </div>
        </div>
        <Badge variant={getConfidenceBadgeVariant(match.score)}>{Math.round(match.score * 100)}%</Badge>
      </div>
      <Button
        variant="accent"
        size="sm"
        className="mt-3 w-full"
        loading={loading}
        disabled={disabled}
        onClick={() => onMatch(match)}
      >
        {!loading && <Link2 className="h-4 w-4" aria-hidden="true" />}
        Mettre en correspondance
      </Button>
    </div>
  );
}

/**
 * Odoo sync panel for the detail page. Surfaces the link state the list page
 * already shows (and that this page previously hid), and — unlike the list,
 * which only offers a button in the 80–90% band — lets the user match to any
 * candidate so a validated fiche is never stuck without a way to reach Odoo.
 */
function ProductOdooSync({ product }: Readonly<{ product: Product }>) {
  const queryClient = useQueryClient();
  const linked = product.odoo_match ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product-odoo-matches', product._id],
    queryFn: () => productApi.getOdooMatches(product._id),
    enabled: !linked,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (match: ProductOdooMatch) =>
      productApi.matchToOdoo(product._id, {
        odoo_id: match.odoo_id,
        score: match.score,
        match_label: match.match_label,
        auto: false,
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Fiche mise en correspondance avec Odoo');
      queryClient.invalidateQueries({ queryKey: ['product', product._id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['export-stats'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Échec de la mise en correspondance'),
  });

  const matches = data?.matches ?? [];
  const loadingId = mutation.isPending ? mutation.variables?.odoo_id ?? null : null;

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-heading text-h5 font-light text-bleu-nuit">Odoo</h2>
      {linked ? (
        <>
          <p className="mb-4 text-sm text-gris-1">Cette fiche est liée à un produit Odoo.</p>
          <OdooLinkedView linked={linked} />
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-gris-1">Cette fiche n'est pas encore liée à Odoo.</p>
          {isLoading && (
            <div className="flex justify-center py-4">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          {isError && (
            <p className="text-sm text-erreur">Impossible de récupérer les correspondances Odoo.</p>
          )}
          {!isLoading && !isError && matches.length === 0 && (
            <p className="text-sm text-gris-400">Aucune correspondance Odoo trouvée pour cette fiche.</p>
          )}
          {matches.length > 0 && (
            <div className="space-y-2">
              {matches.slice(0, 3).map((m) => (
                <OdooCandidate
                  key={m.odoo_id}
                  match={m}
                  onMatch={mutation.mutate}
                  loading={loadingId === m.odoo_id}
                  disabled={mutation.isPending}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ProductSidebar({ product, sourcesData }: Readonly<{ product: any; sourcesData: any }>) {
  return (
    <div className="space-y-6">
      <ProductOdooSync product={product} />
      {sourcesData && sourcesData.sources.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 font-heading text-h5 font-light text-bleu-nuit">Sources ({sourcesData.count})</h2>
          <div className="space-y-3">
            {sourcesData.sources.map((source: ProductSource) => (
              <div key={source.source_id ?? source.origin_file} className="border-l-4 border-bleu-petrole pl-3">
                {isHttpUrl(source.origin_file) ? (
                  <a
                    href={source.origin_file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm font-medium text-bleu-petrole underline decoration-gris-0 underline-offset-2 hover:decoration-bleu-petrole focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
                  >
                    {source.origin_file}
                  </a>
                ) : (
                  <p className="break-all text-sm font-medium text-bleu-nuit">{source.origin_file}</p>
                )}
                <p className="text-xs text-gris-1">
                  {sourceTypeLabel(source)}
                  {source.page_number ? ` · page ${source.page_number}` : ''}
                </p>
                <p className="text-xs text-gris-400">
                  Confiance : {(source.confidence_score * 100).toFixed(0)}%
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card className="p-6">
        <h2 className="mb-4 font-heading text-h5 font-light text-bleu-nuit">Métadonnées</h2>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gris-1">Créé le :</span>
            <p className="font-medium text-bleu-nuit">{format(new Date(product.created_at), 'PPp', { locale: fr })}</p>
          </div>
          <div>
            <span className="text-gris-1">Mis à jour le :</span>
            <p className="font-medium text-bleu-nuit">{format(new Date(product.updated_at), 'PPp', { locale: fr })}</p>
          </div>
          {product.extraction_metadata?.extraction_job_id && (
            <div>
              <span className="text-gris-1">ID de tâche :</span>
              <p className="font-mono text-xs text-bleu-nuit">{product.extraction_metadata.extraction_job_id}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

interface InfoFieldProps {
  readonly label: string;
  readonly value?: string | number | boolean | null;
  readonly unit?: string;
  readonly multiline?: boolean;
  readonly confidence?: number;
  readonly isEditing?: boolean;
  readonly fieldType?: 'text' | 'number' | 'boolean';
  readonly onChange?: (value: any) => void;
}

function getConfidenceBadgeVariant(confidence: number): 'success' | 'warning' | 'error' {
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.6) return 'warning';
  return 'error';
}

function InfoFieldEditor({ value, multiline, fieldType = 'text', onChange }: Readonly<{
  value?: string | number | boolean | null;
  multiline?: boolean;
  fieldType?: 'text' | 'number' | 'boolean';
  onChange: (value: any) => void;
}>) {
  const inputClass = 'mt-1 w-full rounded-button border border-gris-0 bg-blanc px-3 py-1.5 text-sm text-bleu-nuit focus:outline-none focus:ring-2 focus:ring-bleu-petrole';
  if (fieldType === 'boolean') {
    return (
      <select
        value={value ? 'true' : 'false'}
        onChange={e => onChange(e.target.value === 'true')}
        className={inputClass}
      >
        <option value="true">Oui</option>
        <option value="false">Non</option>
      </select>
    );
  }
  if (multiline) {
    return (
      <textarea
        value={(value as string) ?? ''}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className={`${inputClass} resize-y`}
      />
    );
  }
  return (
    <input
      type={fieldType === 'number' ? 'number' : 'text'}
      value={(value as string | number) ?? ''}
      onChange={e => onChange(
        fieldType === 'number' ? Number.parseFloat(e.target.value) || '' : e.target.value
      )}
      className={inputClass}
    />
  );
}

function InfoField({ label, value, unit, multiline, confidence, isEditing, fieldType = 'text', onChange }: InfoFieldProps) {
  const hasValue = value !== undefined && value !== null && value !== '';
  const suffix = unit ? ' ' + unit : '';
  const displayValue = hasValue ? `${value}${suffix}` : 'Non disponible';

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-gris-1">
        {label}
        {confidence !== undefined && (
          <Badge variant={getConfidenceBadgeVariant(confidence)}>
            {(confidence * 100).toFixed(0)}%
          </Badge>
        )}
      </label>
      {isEditing && onChange ? (
        <InfoFieldEditor value={value} multiline={multiline} fieldType={fieldType} onChange={onChange} />
      ) : renderReadOnlyValue(displayValue, hasValue, multiline)}
    </div>
  );
}

function renderReadOnlyValue(displayValue: string, hasValue: boolean, multiline?: boolean) {
  // Absent data must read as absent — mute it so it never looks like a real value.
  const tone = hasValue ? 'font-medium text-bleu-nuit' : 'text-gris-400';
  return (
    <p className={cn('mt-1', multiline && 'whitespace-pre-wrap', tone)}>{displayValue}</p>
  );
}

function ProductHeader({ product, isEditing, editName, onNameChange, onBack }: Readonly<{
  product: any;
  isEditing: boolean;
  editName: string;
  onNameChange: (v: string) => void;
  onBack: () => void;
}>) {
  const sb = statusBadge(product.extraction_metadata?.status);
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={onBack}
        aria-label="Retour à la liste des produits"
        className="rounded-button p-2 text-bleu-nuit transition-colors hover:bg-ivoire focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div>
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={e => onNameChange(e.target.value)}
            aria-label="Nom du produit"
            className="w-full border-b-2 border-bleu-petrole bg-transparent font-heading text-h5 font-light text-bleu-nuit focus:outline-none"
          />
        ) : (
          <h1 className="font-heading text-h5 font-light text-bleu-nuit">
            {product.name || 'Produit sans nom'}
          </h1>
        )}
        <div className="mt-1 flex items-center gap-2 text-sm text-gris-1">
          <span>Statut :</span>
          <Badge variant={sb.variant}>{sb.label}</Badge>
          {isEditing && <span className="font-medium text-bleu-petrole">(Modification en cours)</span>}
        </div>
      </div>
    </div>
  );
}

function ProductActions({ isEditing, isSaving, isValidated, isValidating, onEdit, onSave, onCancel, onValidate }: Readonly<{
  isEditing: boolean;
  isSaving: boolean;
  isValidated: boolean;
  isValidating: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onValidate: () => void;
}>) {
  return (
    <div className="flex gap-2">
      {!isEditing && !isValidated && (
        <Button
          variant="accent"
          size="sm"
          onClick={onValidate}
          loading={isValidating}
        >
          <CheckCircle className="h-4 w-4" aria-hidden="true" />
          Valider
        </Button>
      )}
      {isEditing ? (
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" aria-hidden="true" />
            Annuler
          </Button>
          <Button size="sm" onClick={onSave} loading={isSaving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={onEdit}>
          <Edit className="h-4 w-4" aria-hidden="true" />
          Modifier
        </Button>
      )}
    </div>
  );
}
