import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toasters } from "@/components/ogpressing/toasters";

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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        {/* 🚀 PERF : Toasters lazy-loadés (shadcn/ui + Sonner) — wrapper client */}
        <Toasters />
      </body>
    </html>
  );
}
