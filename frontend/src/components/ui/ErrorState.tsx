import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

type ErrorStateProps = Readonly<{
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}>;

/** Clear error state with an optional retry. */
export function ErrorState({
  title = "Une erreur est survenue",
  description = "Le chargement a échoué. Veuillez réessayer.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-erreur/30 bg-erreur-fond px-6 py-12 text-center",
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="h-8 w-8 text-erreur" aria-hidden="true" />
      <h3 className="mt-3 text-lg font-semibold text-bleu-nuit">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-gris-1">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
