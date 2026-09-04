import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ✅ AUDIT A-CODE C2 : `ignoreBuildErrors: true` masquait les erreurs TS.
  //   tsc --noEmit sur src/ → 0 erreur (les 55 erreurs restantes sont dans
  //   tests/ qui est exclu du build par tsconfig.json). On peut donc retirer
  //   ce masque en toute sécurité pour détecter les régressions futures.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "yqaitafigfxlrprrouhr.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
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
  // 🚀 PERF (audit PERF-AUDIT-1) : optimizePackageImports force le tree-shaking
  // au niveau des imports nommés pour les libs à barrel exports. Sans cette
  // option, `import { Camera } from "lucide-react"` peut tirer tout le barrel
  // (~2000 icônes) dans le bundle client. Avec, seules les icônes réellement
  // utilisées sont incluses. Même logique pour date-fns (200+ helpers) et
  // recharts (chart components). Réduction typique du bundle : -30 à -50%.
  experimental: {
    // TEMP-DISABLE: optimizePackageImports désactivé temporairement pour
    // réduire la pression mémoire pendant le dev (le scanner de barrel
    // exports consomme ~500MB-1GB de RAM supplémentaire). À réactiver
    // quand le système aura plus de RAM ou pour la prod.
    // optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
  },
};

export default nextConfig;
