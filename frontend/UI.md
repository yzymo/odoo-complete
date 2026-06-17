# Charte UI — GCS Catalogue Produits

> **Document obligatoire.** À lire **avant** de créer ou modifier le moindre composant
> ou la moindre page. Toute contribution UI doit respecter ces règles. La checklist en
> fin de document doit être validée avant chaque commit / PR.

Le système de design GCS a **une seule source de vérité** : le bloc `@theme` de
[`src/index.css`](src/index.css). On ne consomme que les utilitaires générés depuis ces
tokens. **Aucune valeur de couleur, police, rayon ou ombre ne doit être écrite en dur
ailleurs.**

---

## 0. Règles d'or (non négociables)

1. **Zéro littéral.** Interdit : `bg-blue-600`, `text-gray-500`, `#11363E`, `style={{color:'…'}}`,
   ombres/ rayons en dur. On utilise **toujours** un token (`bg-bleu-nuit`, `text-gris-1`,
   `rounded-card`, `shadow-card`…). Seule exception : le SVG du logo officiel
   ([`Logo.tsx`](src/components/ui/Logo.tsx)) qui porte sa couleur d'origine `#E95A0C`.
2. **Réutiliser, ne pas recopier.** Avant d'écrire du markup, chercher un composant existant
   dans [`src/components/ui/`](src/components/ui/). On n'écrit pas un bouton/carte/badge à la main.
3. **Tout en français.** 100 % du texte visible est en français. Aucun mot anglais
   (« Loading », « Next »…) ni jargon technique/interne (« MVP », « Powered by… », noms d'endpoints).
4. **Trois états minimum.** Toute vue qui charge des données fournit un état **chargement**,
   **vide** et **erreur** dédiés (jamais d'écran blanc).
5. **Accessibilité AA.** Contraste AA, focus visible, `aria-label` sur les boutons icône-seule,
   navigation clavier. (voir §6)
6. **Re-skin ≠ refactor logique.** Modifier le style ne doit jamais changer un appel API,
   une `queryKey`, un handler ou un comportement.
7. **Pas de nouvelle dépendance de style** sans validation explicite. On reste sur Tailwind v4.

---

## 1. Couleurs (tokens)

Utilisables en `bg-*`, `text-*`, `border-*`, `ring-*`, avec opacité (`bg-bleu-nuit/10`).

| Token | Hex | Usage |
|---|---|---|
| `bleu-nuit` | `#11363E` | **Primaire** : titres, texte clé, boutons primaires, footer |
| `orange-feu` | `#FF6637` | **Accent** : état actif, surbrillance, CTA unique le plus important |
| `orange-hover` | `#FA8232` | survol des éléments orange |
| `bleu-petrole` | `#027986` | **Secondaire** : actions secondaires, liens, bannières info |
| `ivoire` | `#EEEBE4` | fond chaud : sections, fonds de page, cartes douces |
| `sable` | `#B89F91` | blocs décoratifs |
| `gris-1` | `#5F6C72` | **texte courant / secondaire** |
| `gris-0` | `#D4D8DD` | **bordures** cartes & champs |
| `gris-400` | `#929FA5` | texte atténué (footer, hints) |
| `blanc` | `#FFFFFF` | surfaces |
| `succes` / `succes-fond` | — | retours positifs (validé, connecté, complet) |
| `info` / `info-fond` | = bleu-pétrole | informations, statut « enrichi » |
| `alerte` / `alerte-fond` | — | avertissements |
| `erreur` / `erreur-fond` | — | erreurs |

**Fonds de section** : alterner `bg-blanc` et `bg-ivoire`. Le canvas applicatif est `ivoire`,
les cartes sont `blanc`.

**Contraste (AA obligatoire)**
- ❌ **Texte blanc sur `orange-feu` interdit** (2,9:1, échec AA). Le bouton accent utilise
  **`text-bleu-nuit` sur fond `orange-feu`**.
- ✅ Liens / texte emphase : `text-bleu-petrole` (5,1:1 sur blanc).
- ✅ `text-gris-1` réservé au texte secondaire (sur blanc surtout). Le texte principal est `text-bleu-nuit`.

---

## 2. Typographie

| Token | Police | Usage |
|---|---|---|
| `font-heading` | **Anek Latin** Light (300) | tous les titres |
| `font-body` | **Public Sans** | tout le reste (défaut global) |

Échelle de titres : `text-h1`…`text-h5` (interligne 100 %, comme la charte GCS).
- `text-h1` (70px) → **uniquement** hero marketing.
- **`text-h4` / `text-h5`** → titres de pages applicatives. Toujours via
  [`PageHeader`](src/components/ui/PageHeader.tsx).

Corps de texte : `text-base` (16/24) standard · `text-sm` (14) médium · **boutons : SemiBold 16**
(géré par `Button`). Les `<h1>…<h6>` héritent déjà de `font-heading font-light text-bleu-nuit`
via la couche `base`.

---

## 3. Formes & élévation

| Token | Valeur | Usage |
|---|---|---|
| `rounded-button` | 2px | boutons |
| `rounded-card` | 6px | cartes, champs, tuiles |
| `shadow-card` | douce | carte au repos |
| `shadow-card-hover` | `0 0 12px rgba(71,81,86,.2)` | survol de carte cliquable |
| `shadow-strong` | `0 8px 32px rgba(0,0,0,.08)` | menus / overlays |

---

## 4. Composants partagés (catalogue obligatoire)

Importer depuis [`src/components/ui/`](src/components/ui/). **Ne pas réimplémenter.**
Si un besoin n'est pas couvert, **étendre le composant existant** (nouvelle variante/prop),
on ne crée pas de variante locale en dur.

| Composant | Props clés | Quand l'utiliser |
|---|---|---|
| [`Button`](src/components/ui/Button.tsx) | `variant` `primary`\|`secondary`\|`accent`\|`ghost`, `size` `sm`\|`md`, `withArrow`, `loading` | tout bouton. Pour styler un `<Link>` en bouton : `buttonVariants({variant,size,className})` |
| [`Card`](src/components/ui/Card.tsx) | `hoverable` | toute surface blanche encadrée (remplace `bg-white rounded-lg shadow`) |
| [`Badge`](src/components/ui/Badge.tsx) | `variant`, `icon` + `statusBadge(status)` | pastilles de statut/étiquettes. Statuts produit via `statusBadge` (raw/enriched/validated/exported) |
| [`StatTile`](src/components/ui/StatTile.tsx) | `icon`,`label`,`value`,`hint`,`accent`,`loading`,`to` | indicateurs chiffrés (tableau de bord). `value={null}` → « — » |
| [`PageHeader`](src/components/ui/PageHeader.tsx) | `title`,`subtitle`,`actions` | en-tête de **chaque** page |
| [`Stepper`](src/components/ui/Stepper.tsx) | `current` | parcours 4 étapes (déjà global via `AppShell`) |
| [`Banner`](src/components/ui/Banner.tsx) | `variant`,`icon`,`onDismiss` | bandeau d'annonce (bleu pétrole) |
| [`EmptyState`](src/components/ui/EmptyState.tsx) | `icon`,`title`,`description`,`action` | état vide |
| [`ErrorState`](src/components/ui/ErrorState.tsx) | `title`,`description`,`onRetry` | état erreur |
| [`Skeleton`](src/components/ui/Skeleton.tsx) | `className` | squelette de chargement |
| [`Spinner`](src/components/ui/Spinner.tsx) | `label` | chargement ponctuel (jamais de spinner « fait main ») |
| [`Logo`](src/components/ui/Logo.tsx) | `tone` `brand`\|`light`, `iconOnly` | logo officiel GCS uniquement |
| [`CompletenessBadge`](src/components/CompletenessBadge.tsx) | `product` | complétude « X/10 champs » |

**Fusion de classes** : toujours via [`cn()`](src/lib/cn.ts) (`clsx` + `tailwind-merge`),
jamais de concaténation de chaînes.

---

## 5. États chargement / vide / erreur (obligatoires)

```tsx
if (isLoading) return <Skeleton className="h-28 w-full" /> /* ou plusieurs */;
if (error)     return <ErrorState onRetry={refetch} />;
if (!data?.length) return <EmptyState icon={Package} title="Aucun produit" action={…} />;
```

- **Chargement** : `Skeleton` (préféré) ou `Spinner` — jamais de `<div className="animate-spin rounded-full border-b-2">`.
- **Vide** : `EmptyState` avec une icône, une phrase et **une action** (CTA).
- **Erreur** : `ErrorState` avec `onRetry` quand un refetch est possible.
- **Métrique indisponible** : afficher « — » (`StatTile value={null}`). **Ne jamais inventer** de chiffre.

---

## 6. Accessibilité

- Contraste **AA** mini (voir §1). Vérifier `gris-1` sur fond et blanc sur orange (interdit).
- **Focus visible** partout : ne pas poser `outline-none` sans `focus-visible:outline-2
  focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole` (ou équivalent).
- **`aria-label`** sur tout bouton icône-seule ; `aria-current` sur l'élément de nav/étape actif ;
  `aria-expanded`/`aria-haspopup` sur les menus.
- Éléments cliquables non-`<button>` : `role`, `tabIndex={0}` et gestion clavier (Enter/Espace).
- Responsive **jusqu'à la tablette** au minimum ; la nav se replie (menu mobile).

---

## 7. Navigation & parcours

L'interface est structurée autour du **parcours en 4 étapes** :
**Importer → Extraire → Enrichir → Vérifier & Exporter**.

- La navigation et le `Stepper` lisent la **même** source de données :
  [`config/nav.ts`](src/config/nav.ts) et [`config/pipeline.ts`](src/config/pipeline.ts).
  Pour ajouter/renommer une destination, **modifier ces fichiers**, pas le markup.
- Libellés en **langage métier**, jamais en jargon. Toute entrée de nav a un `subtitle` explicatif.
- Le cadre (nav + stepper + footer) est fourni par [`AppShell`](src/components/layout/AppShell.tsx).
  Une page **n'ajoute jamais** sa propre nav/footer ; elle enveloppe son contenu dans
  `<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">`.

---

## 8. Structure des fichiers

```
src/index.css              ← tokens GCS (@theme) — SOURCE DE VÉRITÉ
src/lib/cn.ts              ← fusion de classes
src/lib/completeness.ts    ← logique de complétude produit
src/config/{nav,pipeline}.ts ← IA (nav + parcours), data-driven
src/components/ui/         ← composants du design system (génériques)
src/components/layout/     ← AppShell, Nav, Footer
src/components/            ← composants métier transverses (ex. CompletenessBadge)
src/pages/                 ← pages (1 par route)
src/hooks/                 ← hooks de données
```

Un nouveau composant **générique** va dans `components/ui/` ; un composant **métier**
réutilisable dans `components/`. Pas de composant de présentation dans `pages/`.

---

## 9. Checklist avant commit / PR

- [ ] Aucun littéral couleur/police/rayon/ombre hors `index.css` (`grep` des classes `-50…-900` = 0).
- [ ] Boutons, cartes, badges, en-têtes, états = composants partagés (rien de recopié).
- [ ] États **chargement + vide + erreur** présents sur les vues à données.
- [ ] 100 % du texte en français ; aucun jargon/anglais/langage interne.
- [ ] Contraste AA ; focus visible ; `aria-label` sur boutons icône ; clavier OK.
- [ ] Nav/parcours pilotés par `config/*`, pas en dur.
- [ ] Aucun changement de logique (API, queryKeys, handlers) si l'objectif est cosmétique.
- [ ] `npx tsc -b` **et** `npm run build` passent.

---

### Vérifications rapides

```bash
# Littéraux de couleur résiduels (doit renvoyer 0, hors Logo.tsx) :
grep -rEn "(bg|text|border|ring|from|to)-(blue|green|red|yellow|gray|purple|indigo|orange|slate|amber|emerald|teal|sky)-[0-9]{2,3}" src --include="*.tsx" | grep -v "Logo.tsx"

# Hex en dur (doit renvoyer 0, hors Logo.tsx) :
grep -rEn "#[0-9a-fA-F]{6}" src --include="*.tsx" | grep -v "Logo.tsx"

# Build complet :
npm run build
```
