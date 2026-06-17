import { cn } from "../../lib/cn";

type SkeletonProps = Readonly<{ className?: string }>;

/** Neutral animated placeholder used to build loading skeletons. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-card bg-gris-0/70", className)}
      aria-hidden="true"
    />
  );
}
