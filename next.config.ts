import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Autorise les origines de développement qui accèdent au serveur via
  // 127.0.0.1 / localhost (évite le blocage intermittent des ressources
  // /_next/* en cross-origin sous Next.js 16 dev).
  allowedDevOrigins: ["127.0.0.1", "localhost", "21.0.12.22"],
};

export default nextConfig;
