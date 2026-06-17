import { Logo } from "../ui/Logo";

const APP_VERSION = "1.0.0";

/** Clean GCS footer — bleu nuit, product name + version only. */
export function Footer() {
  return (
    <footer className="mt-16 bg-bleu-nuit text-gris-400">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-6 py-8 sm:flex-row sm:justify-between">
        <Logo tone="light" className="h-7 text-blanc" title="GCS" />
        <p className="text-sm">
          Catalogue Produits · v{APP_VERSION}
        </p>
      </div>
    </footer>
  );
}
