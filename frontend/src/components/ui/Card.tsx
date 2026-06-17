import { cn } from "../../lib/cn";

type CardProps = Readonly<
  React.HTMLAttributes<HTMLDivElement> & {
    /** Add the GCS hover elevation (use for clickable cards). */
    hoverable?: boolean;
  }
>;

/** White surface, 1px gris0 border, 6px radius — the GCS card. */
export function Card({ hoverable, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-gris-0 bg-blanc shadow-card",
        hoverable && "transition-shadow hover:shadow-card-hover",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
