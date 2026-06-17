# GCS Rebrand + UX Overhaul — Frontend

Re-skin and re-flow of the `odooComplete` front-end onto the **GCS design system**,
reframed around a guided **4-step product journey**. This is a **re-skin + re-flow only**
— no backend changes, no business-logic or matching changes, no new dependencies.

## ✅ No API / behavior changes
- Every route in `App.tsx` is unchanged (`/`, `/extract`, `/products`, `/products/:id`,
  `/duplicates`, `/odoo`, `/odoo/products/:id`, `/scraper`, `*`).
- Every API call from Phase 0 is still present and unchanged: all `productApi.*`,
  `odooApi.*`, `scraperApi.*` methods, queryKeys, mutations, polling and handlers are intact.
- The matching pipeline (EAN → barcode → réf. constructeur → nom) is untouched — it lives
  in the backend behind `/odoo/products/{id}/match` and is only re-skinned where displayed.
- The FastAPI backend was not modified.
- `npx tsc -b` → **0 errors**; `npm run build` → **succeeds** (previously the working tree did
  **not** type-check — see "Type-only fixes" below).

## 🎨 Design system (single source of truth)
- **`src/index.css`** — all GCS tokens live in a Tailwind v4 `@theme` block (colors,
  Anek Latin / Public Sans fonts, H1–H5 scale, `rounded-button` 2px / `rounded-card` 6px,
  `shadow-card` / `shadow-card-hover` / `shadow-strong`). Components consume the generated
  utilities (`bg-bleu-nuit`, `text-gris-1`, …) — **no color/font literals anywhere else**
  (verified: 0 numeric color utilities outside the logo asset; 656 literals removed).
- **`src/lib/cn.ts`** — `clsx` + `tailwind-merge` helper powering variant components.
- **Fonts** loaded via Google Fonts `<link>` in `index.html`; title → `GCS — Catalogue Produits`;
  favicon → official GCS icon (`public/gcs-icon.svg`).
- Removed the dead Vite-template `src/App.css`.

## 🧩 Reusable components (`src/components/ui/`)
`Button` (primary/secondary/accent/ghost + `buttonVariants` for links), `Card`, `Badge`
(+ `statusBadge` for raw/enriched/validated/exported), `StatTile`, `PageHeader`, `Stepper`,
`Banner`, `EmptyState`, `ErrorState`, `Skeleton`, `Spinner`, and **`Logo`** (official GCS SVG,
`brand`/`light` tones). Plus `CompletenessBadge`.

## 🧭 UX overhaul
- **Dashboard** (`src/pages/DashboardPage.tsx`) replaces the 2-card home: real-data StatTiles
  (Total · À enrichir · Enrichis · Doublons · Exportés — all from `/export/stats` +
  duplicates), a **"Prochaine étape"** CTA computed from real counts, the 4-step pipeline
  explainer, and an Odoo-connection banner. Unavailable metrics render `—` (never faked).
- **Persistent Stepper** (in `AppShell`) shows the 4 stages and the current one on every page.
- **Navigation reframed to task language** (`src/config/nav.ts`): *Tableau de bord* ·
  *Importer & Extraire* · *Produits* · **Enrichir ▾** (Recherche web / Rapprochement Odoo) ·
  **Vérifier & Exporter ▾** (Doublons / Exporter) — grouped with plain-language subtitles,
  responsive (mobile sheet). All deep links preserved.
- **Per-product completeness** (`src/lib/completeness.ts` + `CompletenessBadge`): "X/10 champs"
  on each product, plus an **"Incomplets"** filter on the Products page.
  *Note:* the filter is client-side over the loaded page (the API exposes no completeness
  filter); the count label states the page scope.
- **Empty / loading / error states** added across all pages (designed `EmptyState`,
  `Skeleton`/`Spinner`, `ErrorState` with retry).
- **Dev language removed**: footer is now a clean bleu-nuit GCS bar ("Catalogue Produits ·
  v1.0.0"); no more "MVP - Phase 1" / "Powered by FastAPI + React + OpenAI"; English UI words
  (Previous/Next/…) translated to French.

## ♿ Accessibility
- AA-aware color choices: the **accent button uses bleu-nuit text on orangeFeu** (white on
  `#FF6637` is only 2.91:1 and fails AA); links use bleu-petrole (5.15:1).
- Visible focus rings (`focus-visible` outline), `aria-label`s on icon-only buttons,
  keyboard-activatable product cards, `aria-current` on active nav/step.

## 🔧 Type-only fixes (approved — pre-existing breakage, no behavior change)
The working tree did not type-check before this work. Fixed, all type-only:
1. Added `productApi.getDuplicatesByCode` + `Duplicate*` types (route `/products/duplicates/by-code`
   already existed) — DuplicatesPage was calling an undeclared method.
2. Added `label` to `InfoFieldProps` (ProductDetailPage).
3. Added optional `scrape_source_urls?: string[]` to `Product` (OdooComparatorPage).
4. `tsconfig.app.json` lib → `ES2023` (enables `Array.findLast` used by WebScraperPage).
5. Removed an unused `navigate` (ExtractionPage).

## Logo note
The official GCS logo SVG (provided) is vendored in `src/components/ui/Logo.tsx`. Its intrinsic
orange (`#E95A0C`) is the artwork's own color and is the only hex outside the token file; the
teal reuses the `bleu-nuit` token.
