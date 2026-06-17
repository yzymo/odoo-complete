/**
 * Product detail page with all fields and sources.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { productApi } from '../api/products';
import type { ProductUpdate } from '../types/product';
import { ArrowLeft, CheckCircle, Edit, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
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
      <div className="mb-8 flex items-start justify-between gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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

function ProductSidebar({ product, sourcesData }: Readonly<{ product: any; sourcesData: any }>) {
  return (
    <div className="space-y-6">
      {sourcesData && sourcesData.sources.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 font-heading text-h5 font-light text-bleu-nuit">Sources ({sourcesData.count})</h2>
          <div className="space-y-3">
            {sourcesData.sources.map((source: any) => (
              <div key={source.source_id ?? source.origin_file} className="border-l-4 border-bleu-petrole pl-3">
                <p className="text-sm font-medium text-bleu-nuit">{source.origin_file}</p>
                <p className="text-xs text-gris-1">
                  {source.extraction_type} - Page {source.page_number || 'N/A'}
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
            <p className="font-medium text-bleu-nuit">{format(new Date(product.created_at), 'PPp')}</p>
          </div>
          <div>
            <span className="text-gris-1">Mis à jour le :</span>
            <p className="font-medium text-bleu-nuit">{format(new Date(product.updated_at), 'PPp')}</p>
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
      ) : renderReadOnlyValue(displayValue, multiline)}
    </div>
  );
}

function renderReadOnlyValue(displayValue: string, multiline?: boolean) {
  if (multiline) {
    return <p className="mt-1 whitespace-pre-wrap text-bleu-nuit">{displayValue}</p>;
  }
  return <p className="mt-1 font-medium text-bleu-nuit">{displayValue}</p>;
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
