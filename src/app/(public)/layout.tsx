/**
 * Layout racine des pages PUBLIQUES OgPressing
 * --------------------------------------------
 * Route group `(public)` → landing, login, activation.
 * Aucune authentification requise.
 *
 * Header sticky en haut, footer collé en bas (sticky footer pattern).
 */
import { PublicHeader, PublicFooter } from "@/components/ogpressing";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
