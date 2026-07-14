import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

type ModalSize = "md" | "lg" | "xl";

type ModalProps = Readonly<{
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Panel max width. */
  size?: ModalSize;
  /** Optional actions rendered in a sticky footer bar. */
  footer?: React.ReactNode;
}>;

const SIZES: Record<ModalSize, string> = {
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

/**
 * Accessible modal dialog: portalled to <body>, closes on Escape or overlay
 * click, locks background scroll, and restores focus to the trigger on close.
 * Tokens-only per the GCS charter.
 */
export function Modal({ open, onClose, title, description, children, size = "lg", footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bleu-nuit/40 p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative my-4 w-full rounded-card bg-blanc shadow-strong focus:outline-none",
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gris-0 px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-heading text-h5 font-light text-bleu-nuit">{title}</h2>
            {description && <p className="mt-1 truncate text-sm text-gris-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-button p-1.5 text-gris-1 transition-colors hover:bg-ivoire hover:text-bleu-nuit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gris-0 bg-ivoire/40 px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
