import { Badge, type BadgeVariant } from "./ui/Badge";
import { computeCompleteness } from "../lib/completeness";
import type { Product } from "../types/product";

/** Per-product completeness indicator — "7/10 champs", colour by fill ratio. */
export function CompletenessBadge({
  product,
  showMissing = true,
}: Readonly<{ product: Product; showMissing?: boolean }>) {
  const c = computeCompleteness(product);
  let variant: BadgeVariant = "warning";
  if (c.isComplete) variant = "success";
  else if (c.ratio >= 0.6) variant = "info";

  return (
    <span title={showMissing && c.missing.length ? `Manquant : ${c.missing.join(", ")}` : undefined}>
      <Badge variant={variant}>
        {c.filledCount}/{c.total} champs
      </Badge>
    </span>
  );
}
