/**
 * Layout racine des pages PUBLIQUES e-pressing (LOT 17 — Cinématographique)
 * --------------------------------------------------------------------------
 * Route group `(public)` → landing, login, activation.
 * Aucune authentification requise.
 *
 * POLICES (LOT 17) : 3 Google Fonts chargées via next/font/google et scopées
 * à ce groupe de routes via des variables CSS (n'affectent PAS les dashboards
 * admin/personnel qui utilisent Geist) :
 *   - --font-jakarta  : Plus Jakarta Sans (titres, sans-serif premium)
 *   - --font-fraunces : Fraunces (italique dramatique, évoque le tissu soigné)
 *   - --font-plex-mono: IBM Plex Mono (données, mono, traçabilité QR/barres)
 *
 * Les variables sont posées sur un wrapper <div> et consommées via les
 * classes utilitaires Tailwind générées dans globals.css (@theme inline).
 */
import { Plus_Jakarta_Sans, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { PublicChrome } from "@/components/landing/public-chrome";
import "./landing.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${jakarta.variable} ${fraunces.variable} ${plexMono.variable} min-h-screen flex flex-col bg-background font-jakarta`}
    >
      <PublicChrome>{children}</PublicChrome>
    </div>
  );
}
