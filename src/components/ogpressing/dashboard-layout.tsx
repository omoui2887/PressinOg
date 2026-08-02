/**
 * OgPressing — DashboardLayout
 * ----------------------------
 * Coquille de dashboard réutilisable (sidebar + topbar + déconnexion)
 * pour les espaces Super Admin / Admin pressing / Personnel.
 *
 * Client component : gestion de l'état du menu mobile (Sheet), de la
 * navigation active (usePathname) et de la déconnexion (client browser
 * Supabase).
 *
 * Props :
 *   - navItems  : éléments de navigation latérale (icône + libellé + href)
 *   - user      : infos utilisateur affichées en bas de sidebar
 *   - roleLabel : badge de rôle (ex : "Super Admin", "Admin")
 *   - brand?    : surcharge optionnelle de la marque (nom + logo du pressing
 *                 connecté, affiché dans sidebar + topbar mobile)
 *   - bottomNav?: ReactNode optionnel — quand fourni, remplace le burger
 *                 mobile par une BottomNav fixe en bas d'écran (pattern
 *                 mobile admin). Le burger Sheet est masqué sur mobile et
 *                 un padding bas est ajouté au contenu pour ne pas être
 *                 masqué par la barre.
 *   - accent?   : "default" (défaut, light theme) ou "editorial" (Phase 3-a,
 *                 palette navy/or — aside bg-editorial-navy, items actifs
 *                 bg-editorial-gold/10, topbar navy/85, etc.). Non-cassant.
 *   - children  : contenu de la page
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  ShoppingBag,
  LogOut,
  Loader2,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { GoldSeparator } from "@/components/ogpressing/editorial";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "sonner";

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Désactive le lien (page à venir). */
  disabled?: boolean;
  /** Petit badge texte (ex : "Bientôt"). */
  badge?: string;
}

/**
 * Groupe de navigation (EMBELLISSEMENT §4 — sidebar regroupée par sections).
 * Permet aux callers de passer une structure organisée au lieu d'une liste
 * plate. Rétro-compatible : si `navGroups` n'est pas fourni, on retombe sur
 * `navItems` (rendu plat avec un seul header de rôle).
 *
 * Groupes conventionnels (section 4 du prompt) :
 *   - Activité       (POS, commandes, production)
 *   - Relation client (clients, livraisons)
 *   - Gestion        (personnel, stock, services et tarifs)
 *   - Finances       (caisse, rapports)
 *   - Paramètres     (configuration du pressing, abonnement)
 */
export interface DashboardNavGroup {
  /** Libellé du groupe (ex : "Activité", "Finances"). Affiché en uppercase. */
  label: string;
  /** Items du groupe. */
  items: DashboardNavItem[];
}

interface BrandInfo {
  name: string;
  logoUrl?: string | null;
  /**
   * Variante visuelle du logo brand (Phase 4-b — accents éditoriaux subtils).
   * - "default"  : logo primaire (bg-primary text-primary-foreground) — comportement historique.
   * - "editorial" : logo doré sur fond clair (bg-editorial-gold text-white),
   *                cohérent avec la touche « Luxe Éditorial » sans basculer
   *                tout le dashboard en accent="editorial". Opt-in, non-cassant.
   */
  variant?: "default" | "editorial";
}

interface DashboardLayoutProps {
  /**
   * Liste plate de liens. Utilisée si `navGroups` n'est pas fourni.
   * Rétro-compatibilité : les callers existants n'ont pas besoin de changer.
   */
  navItems?: DashboardNavItem[];
  /**
   * Groupes de navigation organisés par section. Si fourni, remplace
   * `navItems` et affiche les liens regroupés sous des headers labellisés.
   */
  navGroups?: DashboardNavGroup[];
  user: { email?: string | null; nom?: string | null };
  roleLabel: string;
  brand?: BrandInfo;
  bottomNav?: React.ReactNode;
  /** Palette visuelle (Phase 3-a). "default" = light theme (par défaut).
   *  "editorial" = palette navy/or pour dashboards luxe (opt-in, non-cassant). */
  accent?: "default" | "editorial";
  children: React.ReactNode;
}

export function DashboardLayout({
  navItems,
  navGroups,
  user,
  roleLabel,
  brand,
  bottomNav,
  accent = "default",
  children,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isEditorial = accent === "editorial";

  // Normalisation : si `navGroups` est fourni, on l'utilise. Sinon, on
  // construit un groupe unique "Navigation" à partir de `navItems` pour
  // garder un rendu rétro-compatible (header de rôle + liste plate).
  const groups: DashboardNavGroup[] = navGroups ?? (navItems && navItems.length > 0
    ? [{ label: roleLabel, items: navItems }]
    : []);

  // Si une bottomNav est fournie, on l'utilise à la place du burger Sheet
  // sur mobile (pattern admin). Le burger reste utile uniquement quand il
  // n'y a pas de bottomNav (cas super-admin / personnel).
  const useBottomNav = Boolean(bottomNav);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = getSupabaseBrowser();
      await supabase.auth.signOut();
      toast.success("Vous êtes déconnecté.");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Erreur lors de la déconnexion.");
      setLoggingOut(false);
    }
  }

  /** Renvoie true si l'item correspond à la route courante. */
  function isActive(href: string) {
    if (href === pathname) return true;
    // Correspondance préfixe (ex : /admin/dashboard actif sur /admin/dashboard/xxx)
    return pathname.startsWith(href + "/");
  }

  // Bloc de marque : logo du pressing si fourni, sinon logo OgPressing.
  // Phase 4-b : `brand.variant === "editorial"` active le logo doré même en
  // accent="default" (touche « Luxe Éditorial » sans basculer tout le dashboard).
  const editorialLogo = isEditorial || brand?.variant === "editorial";
  const BrandLogo = (
    <span
      className={cn(
        "flex size-8 items-center justify-center overflow-hidden rounded-lg",
        editorialLogo
          ? isEditorial
            ? "bg-editorial-gold text-editorial-navy"
            : "bg-editorial-gold text-white"
          : "bg-primary text-primary-foreground"
      )}
    >
      {brand?.logoUrl ? (
        <Image
          src={brand.logoUrl}
          alt={brand.name}
          width={32}
          height={32}
          sizes="32px"
          className="size-8 rounded-lg object-cover"
          unoptimized
        />
      ) : (
        <ShoppingBag className="size-4" />
      )}
    </span>
  );

  const BrandLabel = (
    <span className={cn("truncate", isEditorial ? "text-editorial-ivory" : "text-foreground")}>
      {brand ? (
        <span className="block max-w-[10rem] truncate sm:max-w-[12rem]">
          {brand.name}
        </span>
      ) : (
        <>
          Og<span className={isEditorial ? "text-editorial-gold" : "text-primary"}>Pressing</span>
        </>
      )}
    </span>
  );

  const SidebarContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div
        className={cn(
          "flex h-16 items-center gap-2 border-b px-5",
          isEditorial ? "border-[rgba(197,160,61,0.15)]" : "border-border"
        )}
      >
        <Link href="/" className="flex items-center gap-2 font-bold">
          {BrandLogo}
          {BrandLabel}
        </Link>
      </div>

      {/* GoldSeparator — accent éditorial subtil sous le brand (Phase 4-b).
          Rendu dans les deux modes (default + editorial) : ligne gradient
          fine + point doré central, purement décoratif (role=presentation). */}
      <GoldSeparator className="mx-3 my-2" />

      {/* Nav — groupée par sections (EMBELLISSEMENT §4) */}
      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* Bandeau de rôle en haut (cosmétique — repère de sécurité).
            Phase 4-b : couleur unifiée text-editorial-gold-deep (#A8862B — or
            cuivré profond) pour cohérence avec la palette éditoriale, en mode
            default comme en mode editorial. */}
        <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-editorial-gold-deep">
          {roleLabel}
        </p>

        {groups.map((group, gi) => (
          <div key={group.label + gi} className="space-y-1">
            {/* Header de section */}
            <p
              className={cn(
                "px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider",
                isEditorial ? "text-editorial-ivory-dim/80" : "text-muted-foreground/80"
              )}
            >
              {group.label}
            </p>
            {/* Items du groupe */}
            {group.items.map((item) => {
              const active = isActive(item.href);
              const content = (
                <span
                  className={cn(
                    "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-fast ease-smooth motion-reduce:transition-none motion-reduce:translate-x-0",
                    active
                      ? isEditorial
                        ? "bg-editorial-gold/10 text-editorial-gold font-semibold shadow-sm before:absolute before:left-0 before:top-1/2 before:h-6 before:-translate-y-1/2 before:w-[3px] before:rounded-full before:bg-editorial-gold before:transition-all before:duration-base"
                        : "bg-primary/10 text-primary font-semibold shadow-sm before:absolute before:left-0 before:top-1/2 before:h-6 before:-translate-y-1/2 before:w-1 before:rounded-full before:bg-primary before:transition-all before:duration-base"
                      : isEditorial
                      ? "text-editorial-ivory-dim hover:bg-white/5 hover:text-editorial-ivory hover:translate-x-0.5 motion-reduce:hover:translate-x-0"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground hover:translate-x-0.5 motion-reduce:hover:translate-x-0",
                    item.disabled && "pointer-events-none opacity-50"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        active
                          ? isEditorial
                            ? "bg-editorial-gold/20 text-editorial-gold"
                            : "bg-primary/20 text-primary"
                          : isEditorial
                          ? "bg-white/5 text-editorial-ivory-dim"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                  {active && <ChevronRight className="size-4" />}
                </span>
              );
              return item.disabled ? (
                <div
                  key={item.href}
                  aria-disabled
                  title="Bientôt disponible"
                  className="cursor-not-allowed"
                >
                  {content}
                </div>
              ) : (
                <Link key={item.href} href={item.href}>
                  {content}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User card + logout */}
      <div
        className={cn(
          "border-t p-3",
          isEditorial ? "border-[rgba(197,160,61,0.15)]" : "border-border"
        )}
      >
        <div
          className={cn(
            "mb-2 rounded-lg px-3 py-2",
            isEditorial ? "bg-white/5" : "bg-muted/50"
          )}
        >
          <p
            className={cn(
              "truncate text-sm font-medium",
              isEditorial ? "text-editorial-ivory" : "text-foreground"
            )}
          >
            {user.nom || "Utilisateur"}
          </p>
          <p
            className={cn(
              "truncate text-xs",
              isEditorial ? "text-editorial-ivory-dim" : "text-muted-foreground"
            )}
          >
            {user.email || "—"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "w-full justify-start gap-2 hover:bg-danger/5",
            isEditorial
              ? "border-[rgba(197,160,61,0.15)] text-editorial-danger hover:text-editorial-danger"
              : "text-danger hover:text-danger"
          )}
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          Se déconnecter
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn(isEditorial ? "bg-editorial-navy-deep" : "bg-muted/30", "min-h-screen")}>
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-64 border-r md:block",
          isEditorial
            ? "bg-editorial-navy border-[rgba(197,160,61,0.15)]"
            : "bg-card border-border"
        )}
      >
        {SidebarContent}
      </aside>

      {/* Colonne principale */}
      <div className="flex min-h-screen flex-col md:pl-64">
        {/* Topbar */}
        <header
          className={cn(
            "sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6",
            isEditorial
              ? "bg-editorial-navy/85 border-[rgba(197,160,61,0.1)]"
              : "bg-background/85 border-border"
          )}
        >
          {/* Dégradé doré subtil au centre du topbar éditorial */}
          {isEditorial && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(197,160,61,0.4)] to-transparent"
            />
          )}
          {/* Burger mobile — masqué si bottomNav est utilisée */}
          {!useBottomNav && (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Ouvrir le menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
                <div className="relative h-full">
                  {SidebarContent}
                  <SheetClose
                    asChild
                    className="absolute right-3 top-3 md:hidden"
                  >
                    <Button variant="ghost" size="icon" aria-label="Fermer">
                      <X className="size-4" />
                    </Button>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          )}

          <div className="flex min-w-0 items-center gap-2">
            <span className="md:hidden">{BrandLogo}</span>
            <span
              className={cn(
                "truncate font-semibold md:hidden",
                isEditorial ? "text-editorial-ivory" : "text-foreground"
              )}
            >
              {brand ? (
                <span className="block max-w-[12rem] truncate">
                  {brand.name}
                </span>
              ) : (
                <>
                  Og<span className={isEditorial ? "text-editorial-gold" : "text-primary"}>Pressing</span>
                </>
              )}
            </span>
            {/* Desktop : nom du pressing dans le topbar (cosmétique) */}
            {brand && (
              <span
                className={cn(
                  "hidden text-sm md:inline",
                  isEditorial ? "text-editorial-ivory-dim" : "text-muted-foreground"
                )}
              >
                {brand.name}
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "hidden text-sm sm:inline",
                isEditorial ? "text-editorial-ivory-dim" : "text-muted-foreground"
              )}
            >
              {user.nom || user.email || "—"}
            </span>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-bold",
                isEditorial
                  ? "bg-editorial-gold/15 text-editorial-gold"
                  : "bg-primary/10 text-primary"
              )}
            >
              {(user.nom || user.email || "?").slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>

        {/* Contenu — padding bas supplémentaire sur mobile si bottomNav */}
        <main
          className={cn(
            "flex-1 p-4 sm:p-6 lg:p-8",
            useBottomNav && "pb-28 md:pb-8"
          )}
        >
          {children}
        </main>
      </div>

      {/* BottomNav mobile (optionnelle — pattern admin) */}
      {useBottomNav && (
        <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">{bottomNav}</div>
      )}
    </div>
  );
}
