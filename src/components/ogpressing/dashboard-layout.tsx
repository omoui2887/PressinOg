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

interface BrandInfo {
  name: string;
  logoUrl?: string | null;
}

interface DashboardLayoutProps {
  navItems: DashboardNavItem[];
  user: { email?: string | null; nom?: string | null };
  roleLabel: string;
  brand?: BrandInfo;
  bottomNav?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardLayout({
  navItems,
  user,
  roleLabel,
  brand,
  bottomNav,
  children,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
  const BrandLogo = (
    <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
      {brand?.logoUrl ? (
        <Image
          src={brand.logoUrl}
          alt={brand.name}
          width={32}
          height={32}
          className="size-8 rounded-lg object-cover"
          unoptimized
        />
      ) : (
        <ShoppingBag className="size-4" />
      )}
    </span>
  );

  const BrandLabel = (
    <span className="truncate text-foreground">
      {brand ? (
        <span className="block max-w-[10rem] truncate sm:max-w-[12rem]">
          {brand.name}
        </span>
      ) : (
        <>
          Og<span className="text-primary">Pressing</span>
        </>
      )}
    </span>
  );

  const SidebarContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <Link href="/" className="flex items-center gap-2 font-bold">
          {BrandLogo}
          {BrandLabel}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-2 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {roleLabel}
        </p>
        {navItems.map((item) => {
          const active = isActive(item.href);
          const content = (
            <span
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-fast ease-smooth",
                active
                  ? "bg-primary/10 text-primary font-semibold shadow-sm before:absolute before:left-0 before:top-1/2 before:h-6 before:-translate-y-1/2 before:w-1 before:rounded-full before:bg-primary before:transition-all before:duration-base"
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
                      ? "bg-primary/20 text-primary"
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
      </nav>

      {/* User card + logout */}
      <div className="border-t p-3">
        <div className="mb-2 rounded-lg bg-muted/50 px-3 py-2">
          <p className="truncate text-sm font-medium text-foreground">
            {user.nom || "Utilisateur"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {user.email || "—"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-danger hover:bg-danger/5 hover:text-danger"
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
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-card md:block">
        {SidebarContent}
      </aside>

      {/* Colonne principale */}
      <div className="flex min-h-screen flex-col md:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
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
            <span className="truncate font-semibold text-foreground md:hidden">
              {brand ? (
                <span className="block max-w-[12rem] truncate">
                  {brand.name}
                </span>
              ) : (
                <>
                  Og<span className="text-primary">Pressing</span>
                </>
              )}
            </span>
            {/* Desktop : nom du pressing dans le topbar (cosmétique) */}
            {brand && (
              <span className="hidden text-sm text-muted-foreground md:inline">
                {brand.name}
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.nom || user.email || "—"}
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
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
