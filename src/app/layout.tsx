import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toasters } from "@/components/ogpressing/toasters";

/**
 * Polices globales e-pressing — AUTO-HÉBERGÉES via @fontsource
 * --------------------------------------------------------------------
 *  Raison du passage à @fontsource (au lieu de next/font/google) :
 *   - next/font/google échoue sous Turbopack 16.2.12 avec l'erreur
 *     « Module not found: Can't resolve
 *        '@vercel/turbopack-next/internal/font/google/font' »
 *   - next/font/google télécharge les polices à la build depuis Google
 *     Fonts, ce qui échoue aussi dans ce sandbox sans accès réseau
 *     (dev.log : "Failed to download IBM Plex Mono from Google Fonts").
 *
 *  Solution : @fontsource téléverse les fichiers .woff2 dans /node_modules
 *  et les sert localement. Aucune résolution de module interne Turbopack,
 *  aucune dépendance réseau build-time. Les @font-face sont importés ci-
 *  dessous ; les variables CSS (--font-jakarta, --font-plex-mono, etc.)
 *  sont définies dans :root de globals.css.
 *
 *  Polices chargées :
 *   - Geist + Geist Mono       : rétro-compat composants shadcn (--font-geist-*)
 *   - Plus Jakarta Sans        : police d'INTERFACE par défaut (--font-jakarta)
 *   - IBM Plex Mono            : police des DONNÉES / montants FCFA (--font-plex-mono)
 *   - Playfair Display         : serif éditorial premium (--font-playfair)
 *   - Fraunces (italique inc.) : serif dramatique landing (--font-fraunces)
 *
 *  Les @font-face sont globaux (un seul import suffit pour tout l'app).
 */

// --- Geist (interface par défaut des composants shadcn) ---
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

// --- Plus Jakarta Sans (interface e-pressing, titres ET corps) ---
// Version variable : 1 fichier .woff2 couvre toutes les graisses 400→800.
import "@fontsource-variable/plus-jakarta-sans";

// --- IBM Plex Mono (données, montants FCFA, codes, horodatages) ---
// Pas de version variable sur Google Fonts → on importe les graisses
// utilisées (400 normal, 500 medium, 600 semibold).
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";

// --- Playfair Display (serif éditorial — titres premium "luxe fonctionnel") ---
// Versions variable normal + italique (axe ital séparé).
import "@fontsource-variable/playfair-display/wght.css";
import "@fontsource-variable/playfair-display/wght-italic.css";

// --- Fraunces (serif italique dramatique — landing (public) uniquement) ---
// Versions variable normal + italique.
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";

export const metadata: Metadata = {
  title: {
    default: "e-pressing — Gestion professionnelle de pressings",
    template: "%s · e-pressing",
  },
  description:
    "SaaS de gestion de pressings pour la Côte d'Ivoire : Point de Vente, suivi de production, CRM, gestion du personnel et des biodétergents.",
  keywords: [
    "e-pressing",
    "pressing",
    "blanchisserie",
    "laverie",
    "Côte d'Ivoire",
    "FCFA",
    "SaaS",
  ],
  authors: [{ name: "e-pressing" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "e-pressing — Gestion professionnelle de pressings",
    description:
      "Digitalisez votre pressing en Côte d'Ivoire : POS, suivi de production, CRM, personnel.",
    siteName: "e-pressing",
    type: "website",
    locale: "fr_FR",
  },
};

// 🚀 PERF : Viewport séparé (Next.js 16 recommande export viewport séparé)
// themeColor colore l'onglet du navigateur mobile (Safari iOS, Chrome Android)
// — Aligné sur la palette éditoriale (navy #080F1F, brief §1).
export const viewport: Viewport = {
  themeColor: "#080F1F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      {/* Les variables --font-* sont posées dans :root (globals.css) via
          @fontsource — pas besoin des classes .variable de next/font. */}
      <body className="antialiased bg-background text-foreground font-jakarta">
        {children}
        {/* 🚀 PERF : Toasters lazy-loadés (shadcn/ui + Sonner) — wrapper client */}
        <Toasters />
      </body>
    </html>
  );
}
