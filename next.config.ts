import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // TODO 14.2: corriger les 75 erreurs TypeScript restantes puis passer à false.
  //   75 erreurs constatées (catalogue-form generics RHF, services/stock dialogs,
  //   inscription-form, commande-wizard state, shared/index exports).
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "yqaitafigfxlrprrouhr.supabase.co" },
    ],
  },
  // Autorise les origines de développement qui accèdent au serveur via
  // 127.0.0.1 / localhost (évite le blocage intermittent des ressources
  // /_next/* en cross-origin sous Next.js 16 dev).
  // ⚠️ Le preview panel tourne dans un iframe depuis *.space-z.ai : on doit
  //    autoriser ce domaine sinon les navigations client-side (router.push)
  //    échouent silencieusement (RSC payload bloqué en cross-origin).
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "21.0.12.22",
    "space-z.ai",
    "*.space-z.ai",
  ],
};

export default nextConfig;
