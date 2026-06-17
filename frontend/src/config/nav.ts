import {
  LayoutDashboard,
  Upload,
  Package,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Primary navigation, reframed around the 4-step journey rather than raw API
 * endpoints. The back-half pages (Scraper / Odoo / Doublons) are grouped under
 * "Enrichir" and "Vérifier & Exporter" with plain-language subtitles. Every
 * original route still resolves — deep links are untouched.
 */
export interface NavLink {
  label: string;
  to: string;
  subtitle?: string;
}

export interface NavLeaf extends NavLink {
  kind: "link";
  icon: LucideIcon;
}

export interface NavGroup {
  kind: "group";
  label: string;
  icon: LucideIcon;
  children: NavLink[];
}

export type NavEntry = NavLeaf | NavGroup;

export const NAV: NavEntry[] = [
  {
    kind: "link",
    label: "Tableau de bord",
    to: "/",
    icon: LayoutDashboard,
    subtitle: "Vue d'ensemble & prochaine étape",
  },
  {
    kind: "link",
    label: "Importer & Extraire",
    to: "/extract",
    icon: Upload,
    subtitle: "Déposez vos PDF, l'IA crée les fiches",
  },
  {
    kind: "link",
    label: "Produits",
    to: "/products",
    icon: Package,
    subtitle: "Fiches extraites & complétude",
  },
  {
    kind: "group",
    label: "Enrichir",
    icon: Sparkles,
    children: [
      {
        label: "Recherche web",
        to: "/scraper",
        subtitle: "Trouver les produits chez les fournisseurs",
      },
      {
        label: "Rapprochement Odoo",
        to: "/odoo",
        subtitle: "Comparer & compléter via les produits Odoo (EAN → code-barres → réf → nom)",
      },
    ],
  },
  {
    kind: "group",
    label: "Vérifier & Exporter",
    icon: CheckCircle2,
    children: [
      {
        label: "Doublons",
        to: "/duplicates",
        subtitle: "Repérer et regrouper les fiches en double",
      },
      {
        label: "Exporter",
        to: "/products",
        subtitle: "Contrôler les fiches puis exporter (Excel / Odoo)",
      },
    ],
  },
];

/** True when `to` matches the current path (exact for "/", prefix otherwise). */
export function isPathActive(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** True when any child route of a group is active. */
export function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.children.some((c) => isPathActive(c.to, pathname));
}
