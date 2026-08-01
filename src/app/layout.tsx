import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
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
 *
 *  Les variables CSS --font-jakarta et --font-plex-mono sont mappées
 *  vers les utilities Tailwind `font-jakarta` et `font-plex-mono` dans
 *  globals.css (@theme inline).
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

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
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
export const viewport: Viewport = {
  themeColor: "#2563EB",
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
        className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} ${plexMono.variable} antialiased bg-background text-foreground font-jakarta`}
      >
        {children}
        {/* 🚀 PERF : Toasters lazy-loadés (shadcn/ui + Sonner) — wrapper client */}
        <Toasters />
      </body>
    </html>
  );
}
