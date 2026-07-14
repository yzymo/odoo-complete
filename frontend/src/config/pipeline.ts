import { Upload, ScanText, Sparkles, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The 4-step product journey. Single source of truth shared by the persistent
 * Stepper and the dashboard pipeline explainer. Step destinations map onto the
 * existing routes — no behaviour changes, only framing.
 */
export interface PipelineStep {
  /** 1-based position in the journey. */
  id: number;
  label: string;
  /** Compact label for the responsive stepper. */
  short: string;
  description: string;
  /** Where this step begins. */
  to: string;
  icon: LucideIcon;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: 1,
    label: "Importer",
    short: "Importer",
    description: "Déposez vos documents PDF à analyser.",
    to: "/extract",
    icon: Upload,
  },
  {
    id: 2,
    label: "Extraire",
    short: "Extraire",
    description: "L'IA lit les documents et crée des fiches produits brutes.",
    to: "/products",
    icon: ScanText,
  },
  {
    id: 3,
    label: "Enrichir",
    short: "Enrichir",
    description:
      "Rapprochement des fiches brutes avec Odoo (EAN → code-barres → réf. constructeur → nom) pour compléter les champs manquants.",
    to: "/products?status=raw",
    icon: Sparkles,
  },
  {
    id: 4,
    label: "Vérifier & Exporter",
    short: "Vérifier",
    description: "Contrôle des fiches, détection des doublons, puis envoi vers Odoo.",
    to: "/duplicates",
    icon: CheckCircle2,
  },
];

/**
 * Resolve which pipeline step the current route belongs to (1-4), or 0 for the
 * dashboard / unmapped routes. Used to highlight "where am I" in the Stepper.
 */
export function getActiveStep(pathname: string, search = ""): number {
  if (pathname.startsWith("/extract")) return 1;
  if (pathname.startsWith("/products")) {
    // The Produits page is the hub for both viewing the extracted fiches
    // (step 2) and enriching the raw ones via Odoo matching (step 3). The
    // "?status=raw" filter is the "à enrichir" view, so it belongs to Enrichir.
    return new URLSearchParams(search).get("status") === "raw" ? 3 : 2;
  }
  if (pathname.startsWith("/scraper") || pathname.startsWith("/odoo")) return 3;
  if (pathname.startsWith("/duplicates")) return 4;
  return 0;
}
