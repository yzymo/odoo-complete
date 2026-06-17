import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

export type BannerVariant = "info" | "warning";

const VARIANTS: Record<BannerVariant, string> = {
  // GCS "Today Best Deals" pattern — bleuPetrole, white text
  info: "bg-bleu-petrole text-blanc",
  warning: "bg-alerte text-blanc",
};

type BannerProps = Readonly<{
  variant?: BannerVariant;
  icon?: LucideIcon;
  onDismiss?: () => void;
  className?: string;
  children: React.ReactNode;
}>;

/** Full-width announcement banner. */
export function Banner({ variant = "info", icon: Icon, onDismiss, className, children }: BannerProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 px-6 py-2.5 text-sm",
        VARIANTS[variant],
        className,
      )}
      role="status"
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <div className="text-center">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer la bannière"
          className="ml-2 shrink-0 rounded-button p-0.5 hover:bg-blanc/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blanc"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
