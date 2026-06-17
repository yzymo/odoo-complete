import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

type SpinnerProps = Readonly<{
  className?: string;
  /** Accessible label announced to screen readers. */
  label?: string;
}>;

/** Indeterminate loading spinner. */
export function Spinner({ className, label = "Chargement…" }: SpinnerProps) {
  return (
    <Loader2
      className={cn("h-5 w-5 animate-spin text-bleu-petrole", className)}
      role="status"
      aria-label={label}
    />
  );
}
