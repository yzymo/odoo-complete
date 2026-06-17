import { forwardRef } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "accent" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
  "group inline-flex items-center justify-center gap-2 font-body font-semibold rounded-button transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  // bleuNuit + white text; hover lifts slightly (orange arrow accent handled below)
  primary: "bg-bleu-nuit text-blanc hover:-translate-y-px hover:shadow-card-hover",
  // outline bleuPetrole, transparent bg
  secondary:
    "border border-bleu-petrole bg-transparent text-bleu-petrole hover:bg-bleu-petrole/5",
  // orangeFeu accent — bleuNuit text keeps AA contrast on orange
  accent:
    "bg-orange-feu text-bleu-nuit hover:bg-orange-hover hover:-translate-y-px hover:shadow-card-hover",
  ghost: "bg-transparent text-bleu-nuit hover:bg-bleu-nuit/5",
};

const SIZES: Record<ButtonSize, string> = {
  // 12px 24px, SemiBold 16/24
  md: "px-6 py-3 text-base leading-6",
  sm: "px-4 py-2 text-sm leading-5",
};

/** Shared class builder so react-router <Link>s can look like buttons too. */
export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type ButtonProps = Readonly<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Append a trailing arrow that turns orange on hover (primary). */
    withArrow?: boolean;
    loading?: boolean;
  }
>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", withArrow, loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonVariants({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
      {withArrow && !loading && (
        <ArrowRight
          className={cn(
            "h-4 w-4 transition-colors",
            variant === "primary" && "group-hover:text-orange-feu",
          )}
          aria-hidden="true"
        />
      )}
    </button>
  );
});
