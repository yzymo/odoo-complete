import { cn } from "../../lib/cn";

type PageHeaderProps = Readonly<{
  title: string;
  subtitle?: string;
  /** Right-aligned actions (buttons, filters…). */
  actions?: React.ReactNode;
  className?: string;
}>;

/** In-app page title block — Anek Latin H5, with optional subtitle and actions. */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        <h1 className="text-h5 font-heading font-light text-bleu-nuit">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-gris-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
