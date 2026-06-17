import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";

type StatTileProps = Readonly<{
  icon: LucideIcon;
  label: string;
  /** null = metric unavailable → graceful "—" (never a fake number). */
  value: number | string | null;
  hint?: string;
  /** Emphasize this tile (orange accent strip). */
  accent?: boolean;
  loading?: boolean;
  /** Make the whole tile a link. */
  to?: string;
}>;

export function StatTile({ icon: Icon, label, value, hint, accent, loading, to }: StatTileProps) {
  const display = value === null || value === undefined ? "—" : value;

  const body = (
    <Card
      hoverable={Boolean(to)}
      className={cn(
        "h-full p-5",
        accent && "border-l-4 border-l-orange-feu",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-gris-1">{label}</span>
        <Icon
          className={cn("h-5 w-5 shrink-0", accent ? "text-orange-feu" : "text-bleu-petrole")}
          aria-hidden="true"
        />
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-20" />
      ) : (
        <p className="mt-2 text-3xl font-light text-bleu-nuit">{display}</p>
      )}
      {hint && <p className="mt-1 text-xs text-gris-400">{hint}</p>}
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block focus-visible:outline-none">
        {body}
      </Link>
    );
  }
  return body;
}
