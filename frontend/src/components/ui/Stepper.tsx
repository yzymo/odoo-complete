import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { cn } from "../../lib/cn";
import { PIPELINE_STEPS } from "../../config/pipeline";

type StepperProps = Readonly<{
  /** Active step 1-4, or 0 for none (dashboard overview). */
  current: number;
  className?: string;
}>;

/**
 * Persistent 4-step journey indicator. Each node links to where that step
 * begins. Steps before `current` read as done, the current one is emphasized.
 */
export function Stepper({ current, className }: StepperProps) {
  return (
    <nav aria-label="Étapes du parcours" className={className}>
      {/* Compact (mobile) */}
      <p className="text-sm text-gris-1 sm:hidden">
        Étape {Math.max(current, 1)} / {PIPELINE_STEPS.length} ·{" "}
        <span className="font-semibold text-bleu-nuit">
          {PIPELINE_STEPS[Math.max(current, 1) - 1].label}
        </span>
      </p>

      {/* Full (tablet & up) */}
      <ol className="hidden items-center sm:flex">
        {PIPELINE_STEPS.map((step, i) => {
          const isDone = step.id < current;
          const isActive = step.id === current;
          const Icon = step.icon;
          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <Link
                to={step.to}
                aria-current={isActive ? "step" : undefined}
                className="group flex items-center gap-3 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    isActive && "border-orange-feu bg-bleu-nuit text-blanc",
                    isDone && "border-bleu-petrole bg-bleu-petrole text-blanc",
                    !isActive && !isDone && "border-gris-0 bg-blanc text-gris-1",
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span
                  className={cn(
                    "hidden text-sm font-medium md:inline",
                    isActive ? "text-bleu-nuit" : "text-gris-1 group-hover:text-bleu-nuit",
                  )}
                >
                  {step.label}
                </span>
              </Link>
              {i < PIPELINE_STEPS.length - 1 && (
                <span
                  className={cn(
                    "mx-3 h-px flex-1",
                    step.id < current ? "bg-bleu-petrole" : "bg-gris-0",
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
