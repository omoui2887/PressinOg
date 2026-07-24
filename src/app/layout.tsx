import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        {/* Toasts shadcn/ui (radix-toast based) */}
        <Toaster />
        {/* Toasts sonner (recommandé pour les feedbacks d'action) */}
        <SonnerToaster richColors position="top-right" />
      </body>
    </html>
  );
}
