import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CheckCircle, Link2, Package } from "lucide-react";
import { productApi, type ProductOdooMatch } from "../api/products";
import { odooApi } from "../api/odoo";
import type { Product } from "../types/product";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Badge, type BadgeVariant } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Spinner } from "./ui/Spinner";
import { EmptyState } from "./ui/EmptyState";
import { cn } from "../lib/cn";
import { OdooCurrentImages, ExtractedImagePicker } from "../pages/OdooComparatorPage";

// ── helpers ──────────────────────────────────────────────────────────────────

function scoreVariant(score: number): BadgeVariant {
  if (score >= 0.9) return "success";
  if (score >= 0.8) return "info";
  if (score >= 0.6) return "warning";
  return "neutral";
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toFixed(2);
  return String(value);
}

const COMPARE_FIELDS: { label: string; fiche: (p: Product) => unknown; odoo: (m: ProductOdooMatch) => unknown }[] = [
  { label: "Nom",            fiche: (p) => p.name,           odoo: (m) => m.name },
  { label: "Code",           fiche: (p) => p.default_code,   odoo: (m) => m.default_code },
  { label: "Code-barres",    fiche: (p) => p.barcode,        odoo: (m) => m.barcode },
  { label: "EAN",            fiche: (p) => p.Code_EAN,       odoo: (m) => m.code_ean },
  { label: "Marque",         fiche: (p) => p.constructeur,   odoo: (m) => m.constructeur },
  { label: "Réf. fabricant", fiche: (p) => p.refConstructeur, odoo: (m) => m.ref_constructeur },
  { label: "Prix (€)",       fiche: (p) => p.lst_price,      odoo: (m) => m.list_price },
];

// ── sub-components ─────────────────────────────────────────────────────────────

function CandidateList({
  matches, selectedId, onSelect,
}: Readonly<{ matches: ProductOdooMatch[]; selectedId: number | null; onSelect: (id: number) => void }>) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase text-gris-1">Candidats Odoo</p>
      {matches.map((m) => (
        <button
          key={m.odoo_id}
          type="button"
          onClick={() => onSelect(m.odoo_id)}
          className={cn(
            "w-full rounded-card border p-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole",
            selectedId === m.odoo_id
              ? "border-bleu-petrole bg-info-fond"
              : "border-gris-0 hover:border-bleu-petrole/50 hover:bg-ivoire",
          )}
        >
          <div className="flex items-center gap-2">
            {m.image_128 ? (
              <img
                src={`data:image/png;base64,${m.image_128}`}
                alt=""
                className="h-9 w-9 shrink-0 rounded border border-gris-0 bg-blanc object-contain"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gris-0 bg-ivoire">
                <Package className="h-4 w-4 text-gris-400" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-bleu-nuit">{m.name}</p>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gris-1">
                {m.default_code && <span className="font-mono">{m.default_code}</span>}
                {m.constructeur && <span>{m.constructeur}</span>}
              </div>
            </div>
            <Badge variant={scoreVariant(m.score)}>{Math.round(m.score * 100)}%</Badge>
          </div>
        </button>
      ))}
    </div>
  );
}

function ComparisonTable({ product, match }: Readonly<{ product: Product; match: ProductOdooMatch }>) {
  return (
    <div className="overflow-hidden rounded-card border border-gris-0">
      <table className="w-full text-sm">
        <thead className="bg-ivoire">
          <tr>
            <th className="w-1/4 px-3 py-2 text-left text-xs font-medium uppercase text-gris-1">Champ</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gris-1">Fiche</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gris-1">Odoo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gris-0">
          {COMPARE_FIELDS.map((f) => {
            const fv = fmt(f.fiche(product));
            const ov = fmt(f.odoo(match));
            const differs = fv !== "—" && ov !== "—" && fv !== ov;
            return (
              <tr key={f.label} className={differs ? "bg-orange-feu/10" : undefined}>
                <td className="px-3 py-2 font-medium text-gris-1">{f.label}</td>
                <td className="px-3 py-2 font-mono text-bleu-nuit">{fv}</td>
                <td className="px-3 py-2 font-mono text-bleu-nuit">{ov}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── modal body ─────────────────────────────────────────────────────────────────

function SyncOdooBody({ product }: Readonly<{ product: Product }>) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["product-odoo-matches", product._id],
    queryFn: () => productApi.getOdooMatches(product._id),
    staleTime: 5 * 60 * 1000,
  });

  const matches = data?.matches ?? [];

  useEffect(() => {
    if (selectedId === null && matches.length > 0) setSelectedId(matches[0].odoo_id);
  }, [matches, selectedId]);

  const selected = matches.find((m) => m.odoo_id === selectedId) ?? null;

  const matchMutation = useMutation({
    mutationFn: (m: ProductOdooMatch) =>
      productApi.matchToOdoo(product._id, {
        odoo_id: m.odoo_id,
        score: m.score,
        match_label: m.match_label,
        auto: false,
      }),
    onSuccess: (res) => {
      toast.success(res.message || "Fiche mise en correspondance avec Odoo");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product", product._id] });
      queryClient.invalidateQueries({ queryKey: ["export-stats"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Échec de la mise en correspondance"),
  });

  // Current Odoo images for the selected candidate (drives the left image column).
  const { data: odooProduct } = useQuery({
    queryKey: ["odoo-product", selectedId],
    queryFn: () => odooApi.getProduct(selectedId!),
    enabled: selectedId !== null,
  });
  const { data: gallery } = useQuery({
    queryKey: ["odoo-gallery", selectedId],
    queryFn: () => odooApi.getProductGallery(selectedId!),
    enabled: selectedId !== null,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError) {
    return <p className="py-6 text-sm text-erreur">Impossible de récupérer les correspondances Odoo.</p>;
  }

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Aucune correspondance Odoo trouvée"
        description="Aucun produit Odoo ne correspond à cette fiche (EAN → code-barres → référence → nom)."
      />
    );
  }

  const linked = matchMutation.isSuccess;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Candidates */}
      <div className="lg:col-span-1">
        <CandidateList matches={matches} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Comparison + images */}
      <div className="space-y-4 lg:col-span-2">
        {selected && <ComparisonTable product={product} match={selected} />}

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gris-1">
            Applique les champs de la fiche dans le produit Odoo sélectionné et enregistre le lien.
          </p>
          {linked ? (
            <Badge variant="success" icon={CheckCircle}>Lié à Odoo</Badge>
          ) : (
            <Button
              variant="accent"
              size="sm"
              loading={matchMutation.isPending}
              disabled={!selected || matchMutation.isPending}
              onClick={() => selected && matchMutation.mutate(selected)}
            >
              {!matchMutation.isPending && <Link2 className="h-4 w-4" aria-hidden="true" />}
              Mettre en correspondance
            </Button>
          )}
        </div>

        {selected && (
          <Card className="overflow-hidden p-0">
            <div className="border-b border-gris-0 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-bleu-nuit">Images</h3>
            </div>
            <div className="grid grid-cols-1 divide-y divide-gris-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <OdooCurrentImages
                mainImage1920={odooProduct?.image_1920}
                galleryImages={gallery?.images ?? []}
              />
              <ExtractedImagePicker
                odooId={selected.odoo_id}
                extractedProduct={product}
                selectedMatchId={String(selected.odoo_id)}
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── public component ───────────────────────────────────────────────────────────

export function SyncOdooModal({
  product, open, onClose,
}: Readonly<{ product: Product | null; open: boolean; onClose: () => void }>) {
  return (
    <Modal
      open={open && !!product}
      onClose={onClose}
      title="Synchroniser avec Odoo"
      description={product?.name ?? undefined}
      size="xl"
    >
      {product && <SyncOdooBody product={product} />}
    </Modal>
  );
}
