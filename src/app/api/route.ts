import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Route racine /api — health check minimal.
 * Renvoie un statut 200 simple pour vérifier que l'API est joignable.
 * (anciennement un placeholder "Hello, world!" — remplacé par un
 * endpoint de health check utile pour les monitoring Vercel/UptimeRobot.)
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "e-pressing-api",
    timestamp: new Date().toISOString(),
  });
}
