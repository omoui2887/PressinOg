import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans, IBM_Plex_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toasters } from "@/components/ogpressing/toasters";

/**
 * Polices globales OgPressing (EMBELLISSEMENT — section 3 du prompt)
 * --------------------------------------------------------------------
 *  - Geist + Geist_Mono : conservées pour rétro-compat (utilisées par
 *    certains composants shadcn/ui qui pointent sur --font-geist-*).
 *  - Plus Jakarta Sans (--font-jakarta) : police d'INTERFACE par défaut,
 *    titres ET corps, sur TOUS les espaces (public, admin, personnel,
 *    super-admin). Identity premium, lisible en plein jour.
 *  - IBM Plex Mono (--font-plex-mono) : police des DONNÉES — montants
 *    FCFA, numéros de commande (CMD-XXXX), codes d'activation
 *    (PRS-XXXX-XXXX), références de paiement, horodatages, quantités.
 *    Mono + tabular-nums garantit l'alignement vertical des montants
 *    dans les tableaux et journaux de caisse.
 *  - Playfair Display (--font-playfair) : police SERIF éditoriale pour
 *    titres premium "luxe fonctionnel" (brief §2). Usage opt-in via
 *    className `font-playfair` sur les H1/H2 éditoriaux des pages
 *    auth, landing, et cards premium.
 *
 *  Les variables CSS --font-jakarta, --font-plex-mono et --font-playfair
 *  sont mappées vers les utilities Tailwind correspondantes dans
 *  globals.css (@theme inline).
 *
 * 🚀 PERF (audit PERF-AUDIT-1) : Jakarta et Playfair utilisent désormais
 *  leurs versions VARIABLE (1 fichier couvrant toutes les graisses au
 *  lieu de 5 + 8 fichiers séparés). IBM Plex Mono (pas de version
 *  variable sur Google Fonts) est réduit à 2 graisses (400 + 500).
 *  Total requêtes police : 7 fichiers au lieu de 18 → -60% sur le
 *  waterfall initial mobile.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// 🚀 PERF : Plus Jakarta Sans a une version variable sur Google Fonts.
// Ne PAS spécifier `weight` → next/font charge 1 seul fichier couvrant
// toutes les graisses (400, 500, 600, 700, 800) au lieu de 5 fichiers.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

// IBM Plex Mono n'a PAS de version variable sur Google Fonts : on doit
// lister les graisses. Audit : seules 400 et 500 sont utilisées (grep
// `font-plex-mono.*font-(medium|semibold|bold)` → aucun match semibold/bold).
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-mono",
  weight: ["400", "500"],
});

// 🚀 PERF : Playfair Display a une version variable sur Google Fonts.
// Ne PAS spécifier `weight` → 1 fichier couvrant toutes les graisses
// (400, 500, 600, 700, 800, 900) au lieu de 4×2=8 fichiers.
// On garde `style: ["normal", "italic"]` car Playfair utilise l'axe ital
// (masters italiques séparés dans le même fichier variable).
const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "OgPressing — Gestion professionnelle de pressings",
    template: "%s · OgPressing",
  },
  description:
    "SaaS de gestion de pressings pour la Côte d'Ivoire : Point de Vente, suivi de production, CRM, gestion du personnel et des biodétergents.",
  keywords: [
    "OgPressing",
    "pressing",
    "blanchisserie",
    "laverie",
    "Côte d'Ivoire",
    "FCFA",
    "SaaS",
  ],
  authors: [{ name: "OgPressing" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "OgPressing — Gestion professionnelle de pressings",
    description:
      "Digitalisez votre pressing en Côte d'Ivoire : POS, suivi de production, CRM, personnel.",
    siteName: "OgPressing",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} ${plexMono.variable} ${playfair.variable} antialiased bg-background text-foreground font-jakarta`}
      >
        {children}
        {/* 🚀 PERF : Toasters lazy-loadés (shadcn/ui + Sonner) — wrapper client */}
        <Toasters />
      </body>
    </html>
  );
}
