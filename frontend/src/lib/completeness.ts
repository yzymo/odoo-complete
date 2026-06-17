import type { Product } from "../types/product";

/**
 * Per-product completeness — the heart of the value proposition. Computed
 * purely from data already present in the product payload (no extra API call,
 * no invented numbers). Defines the "core" fiche fields a complete Odoo product
 * is expected to carry.
 */
export interface CompletenessField {
  key: string;
  label: string;
  filled: (p: Product) => boolean;
}

const hasText = (v: unknown): boolean =>
  v !== undefined && v !== null && String(v).trim() !== "";

const hasNumber = (v: unknown): boolean =>
  v !== undefined && v !== null && !Number.isNaN(Number(v));

export const CORE_FIELDS: CompletenessField[] = [
  { key: "name", label: "Nom", filled: (p) => hasText(p.name) },
  { key: "default_code", label: "Référence", filled: (p) => hasText(p.default_code) },
  {
    key: "identifiant",
    label: "Code-barres / EAN",
    filled: (p) => hasText(p.barcode) || hasText(p.Code_EAN),
  },
  { key: "constructeur", label: "Constructeur", filled: (p) => hasText(p.constructeur) },
  {
    key: "refConstructeur",
    label: "Réf. constructeur",
    filled: (p) => hasText(p.refConstructeur),
  },
  { key: "categ_id", label: "Catégorie", filled: (p) => hasText(p.categ_id) },
  {
    key: "description_courte",
    label: "Description courte",
    filled: (p) => hasText(p.description_courte),
  },
  {
    key: "description_detaillee",
    label: "Description détaillée",
    filled: (p) => hasText(p.features_description) || hasText(p.description_ecommerce),
  },
  {
    key: "dimensions",
    label: "Dimensions & poids",
    filled: (p) =>
      hasNumber(p.length) && hasNumber(p.width) && hasNumber(p.height) && hasNumber(p.weight),
  },
  {
    key: "image",
    label: "Image",
    filled: (p) =>
      (p.images?.length ?? 0) > 0 ||
      (p.image_urls?.length ?? 0) > 0 ||
      hasText(p.image_1920),
  },
];

export interface CompletenessResult {
  filledCount: number;
  total: number;
  /** 0..1 */
  ratio: number;
  /** Labels of the fields still missing. */
  missing: string[];
  isComplete: boolean;
}

export function computeCompleteness(product: Product): CompletenessResult {
  const total = CORE_FIELDS.length;
  const filled = CORE_FIELDS.filter((f) => f.filled(product));
  const missing = CORE_FIELDS.filter((f) => !f.filled(product)).map((f) => f.label);
  return {
    filledCount: filled.length,
    total,
    ratio: filled.length / total,
    missing,
    isComplete: filled.length === total,
  };
}
