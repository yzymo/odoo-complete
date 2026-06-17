import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

export type BadgeVariant =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "accent";

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-ivoire text-gris-1 border border-gris-0",
  primary: "bg-bleu-nuit/10 text-bleu-nuit",
  info: "bg-info-fond text-info",
  success: "bg-succes-fond text-succes",
  warning: "bg-alerte-fond text-alerte",
  error: "bg-erreur-fond text-erreur",
  accent: "bg-orange-feu/15 text-alerte",
};

type BadgeProps = Readonly<{
  variant?: BadgeVariant;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}>;

export function Badge({ variant = "neutral", icon: Icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Maps the product workflow status to a badge variant + French label. */
export const STATUS_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  raw: { variant: "neutral", label: "Brut" },
  enriched: { variant: "info", label: "Enrichi" },
  validated: { variant: "success", label: "Validé" },
  exported: { variant: "primary", label: "Exporté" },
};

export function statusBadge(status?: string): { variant: BadgeVariant; label: string } {
  return STATUS_BADGE[status ?? ""] ?? { variant: "neutral", label: status || "—" };
}
