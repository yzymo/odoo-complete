import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { Logo } from "../ui/Logo";
import { NAV, isPathActive, isGroupActive, type NavGroup, type NavLink as NavLinkT } from "../../config/nav";

export function Nav() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Close menus whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup(null);
  }, [pathname]);

  // Close the open dropdown on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenGroup(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <nav className="sticky top-0 z-40 border-b border-gris-0 bg-blanc">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2" aria-label="GCS — accueil">
          <Logo className="h-7" title="GCS — Catalogue Produits" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {NAV.map((entry) =>
            entry.kind === "link" ? (
              <DesktopLink key={entry.to + entry.label} to={entry.to} label={entry.label} subtitle={entry.subtitle} active={isPathActive(entry.to, pathname)} />
            ) : (
              <DesktopGroup
                key={entry.label}
                group={entry}
                active={isGroupActive(entry, pathname)}
                open={openGroup === entry.label}
                onToggle={() => setOpenGroup((g) => (g === entry.label ? null : entry.label))}
                pathname={pathname}
              />
            ),
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="rounded-button p-2 text-bleu-nuit hover:bg-bleu-nuit/5 lg:hidden"
          aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="border-t border-gris-0 bg-blanc px-4 py-3 lg:hidden">
          {NAV.map((entry) =>
            entry.kind === "link" ? (
              <MobileLink key={entry.to + entry.label} to={entry.to} label={entry.label} subtitle={entry.subtitle} active={isPathActive(entry.to, pathname)} />
            ) : (
              <div key={entry.label} className="py-2">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gris-400">
                  {entry.label}
                </p>
                {entry.children.map((c) => (
                  <MobileLink key={c.to + c.label} to={c.to} label={c.label} subtitle={c.subtitle} active={isPathActive(c.to, pathname)} />
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </nav>
  );
}

function DesktopLink({ to, label, subtitle, active }: { to: string; label: string; subtitle?: string; active: boolean }) {
  return (
    <Link
      to={to}
      title={subtitle}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-button px-3 py-2 text-sm font-medium transition-colors",
        active ? "text-bleu-nuit" : "text-gris-1 hover:text-bleu-nuit",
      )}
    >
      <span className={cn("border-b-2 pb-1", active ? "border-orange-feu" : "border-transparent")}>
        {label}
      </span>
    </Link>
  );
}

function DesktopGroup({
  group,
  active,
  open,
  onToggle,
  pathname,
}: {
  group: NavGroup;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  pathname: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "flex items-center gap-1 rounded-button px-3 py-2 text-sm font-medium transition-colors",
          active || open ? "text-bleu-nuit" : "text-gris-1 hover:text-bleu-nuit",
        )}
      >
        <span className={cn("border-b-2 pb-1", active ? "border-orange-feu" : "border-transparent")}>
          {group.label}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <>
          {/* outside-click catcher */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="fixed inset-0 z-10 cursor-default"
            onClick={onToggle}
          />
          <div className="absolute right-0 z-20 mt-1 w-80 rounded-card border border-gris-0 bg-blanc p-2 shadow-strong">
            {group.children.map((c: NavLinkT) => {
              const childActive = isPathActive(c.to, pathname);
              return (
                <Link
                  key={c.to + c.label}
                  to={c.to}
                  className={cn(
                    "block rounded-card px-3 py-2.5 transition-colors",
                    childActive ? "bg-ivoire" : "hover:bg-ivoire",
                  )}
                >
                  <span className="block text-sm font-semibold text-bleu-nuit">{c.label}</span>
                  {c.subtitle && <span className="mt-0.5 block text-xs text-gris-1">{c.subtitle}</span>}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MobileLink({ to, label, subtitle, active }: { to: string; label: string; subtitle?: string; active: boolean }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-card px-3 py-2.5 transition-colors",
        active ? "bg-ivoire" : "hover:bg-ivoire",
      )}
    >
      <span className={cn("block text-sm font-semibold", active ? "text-bleu-nuit" : "text-gris-1")}>
        {label}
      </span>
      {subtitle && <span className="mt-0.5 block text-xs text-gris-1">{subtitle}</span>}
    </Link>
  );
}
