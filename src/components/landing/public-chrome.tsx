/**
 * e-pressing — PublicChrome (LOT 17)
 * ----------------------------------
 * Wrapper client qui décide d'afficher ou non le header/footer par défaut
 * du layout `(public)` selon la route courante.
 *
 * Sur la landing (`/`), la landing page fournit SA PROPRE navbar flottante
 * et SON PROPRE footer arrondi (LOT 17). On masque donc le PublicHeader et
 * PublicFooter hérités pour éviter un double chrome.
 *
 * Sur `/login` et `/activation`, on garde le header/footer par défaut.
 */
"use client";

import { usePathname } from "next/navigation";
import { PublicHeader, PublicFooter } from "@/components/ogpressing";

export function PublicChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Sur la landing racine, on laisse la page gérer son propre chrome.
  const isLanding = pathname === "/";

  if (isLanding) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </>
  );
}

export default PublicChrome;
