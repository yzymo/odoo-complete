import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  Sparkles,
  Copy,
  Server,
  FileWarning,
  ArrowRight,
  PlugZap,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { StatTile } from "../components/ui/StatTile";
import { Card } from "../components/ui/Card";
import { Banner } from "../components/ui/Banner";
import { ErrorState } from "../components/ui/ErrorState";
import { Skeleton } from "../components/ui/Skeleton";
import { buttonVariants } from "../components/ui/Button";
import { PIPELINE_STEPS } from "../config/pipeline";
import { useDashboardStats } from "../hooks/useDashboardStats";

type NextAction = { message: string; cta: string; to: string };

function resolveNextAction(s: ReturnType<typeof useDashboardStats>): NextAction {
  if (s.total === 0)
    return { message: "Aucun produit pour l'instant.", cta: "Importer des documents", to: "/extract" };
  if ((s.raw ?? 0) > 0)
    return {
      message: `${s.raw} produit(s) brut(s) à enrichir.`,
      cta: "Rapprocher les fiches avec Odoo",
      to: "/products?status=raw",
    };
  if ((s.duplicateGroups ?? 0) > 0)
    return {
      message: `${s.duplicateGroups} groupe(s) de doublons à traiter.`,
      cta: "Voir les doublons",
      to: "/duplicates",
    };
  if ((s.validated ?? 0) > 0)
    return {
      message: `${s.validated} produit(s) prêt(s) à exporter vers Odoo.`,
      cta: "Vérifier & exporter",
      to: "/products",
    };
  return { message: "Tout est à jour. 🎉", cta: "Voir les produits", to: "/products" };
}

export default function DashboardPage() {
  const stats = useDashboardStats();
  const [bannerOpen, setBannerOpen] = useState(true);
  const odooConnected = stats.odoo?.status === "connected";
  const next = resolveNextAction(stats);

  return (
    <>
      {bannerOpen && odooConnected && (
        <Banner icon={PlugZap} onDismiss={() => setBannerOpen(false)}>
          Connecté à Odoo
          {stats.odoo?.database ? ` · base ${stats.odoo.database}` : ""}
          {stats.total !== null ? ` · ${stats.total} produit(s) dans le catalogue` : ""}
        </Banner>
      )}

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <PageHeader
          title="Tableau de bord"
          subtitle="Suivez vos produits, de l'import jusqu'à Odoo."
        />

        {stats.isError ? (
          <ErrorState
            title="Impossible de charger les statistiques"
            description="Le service de statistiques n'a pas répondu. Vérifiez que l'API est démarrée."
            onRetry={stats.refetch}
          />
        ) : (
          <>
            {/* Status tiles — all from real endpoints */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <StatTile icon={Package} label="Total produits" value={stats.total} loading={stats.isLoading} to="/products" />
              <StatTile icon={FileWarning} label="À enrichir" value={stats.raw} hint="Fiches brutes" loading={stats.isLoading} to="/products?status=raw" accent />
              <StatTile icon={Sparkles} label="Enrichis" value={stats.enriched} loading={stats.isLoading} to="/products" />
              <StatTile icon={Copy} label="Doublons" value={stats.duplicateGroups} hint="Groupes" loading={stats.duplicatesLoading} to="/duplicates" />
              <StatTile icon={Server} label="Exportés Odoo" value={stats.exported} loading={stats.isLoading} to="/odoo" />
            </div>

            {/* Next action */}
            <Card className="mt-6 overflow-hidden border-l-4 border-l-orange-feu">
              <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-orange-feu">
                    Prochaine étape
                  </p>
                  {stats.isLoading ? (
                    <Skeleton className="mt-2 h-6 w-72" />
                  ) : (
                    <p className="mt-1 text-lg text-bleu-nuit">{next.message}</p>
                  )}
                </div>
                <Link to={next.to} className={buttonVariants({ variant: "accent" })}>
                  {next.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </Card>

            {/* 4-step pipeline explainer */}
            <section className="mt-10">
              <h2 className="text-h5 font-heading font-light text-bleu-nuit">
                Le parcours en 4 étapes
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {PIPELINE_STEPS.map((step) => {
                  const Icon = step.icon;
                  return (
                    <Link key={step.id} to={step.to} className="block focus-visible:outline-none">
                      <Card hoverable className="h-full p-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ivoire text-sm font-semibold text-bleu-nuit">
                            {step.id}
                          </span>
                          <Icon className="h-5 w-5 text-bleu-petrole" aria-hidden="true" />
                        </div>
                        <h3 className="mt-3 text-base font-semibold text-bleu-nuit">{step.label}</h3>
                        <p className="mt-1 text-sm text-gris-1">{step.description}</p>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
