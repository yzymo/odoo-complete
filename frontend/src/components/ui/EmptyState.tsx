import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

type EmptyStateProps = Readonly<{
  icon: LucideIcon;
  title: string;
  description?: string;
  /** A CTA (Button / Link styled as button). */
  action?: React.ReactNode;
  className?: string;
}>;

/** Designed empty state — icon, one line, optional CTA. No blank screens. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-gris-0 bg-blanc px-6 py-16 text-center",
        className,
      )}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ivoire">
        <Icon className="h-7 w-7 text-bleu-petrole" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-bleu-nuit">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-gris-1">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
