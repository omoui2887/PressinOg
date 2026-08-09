/**
 * OgPressing — Client Supabase ADMIN (service_role)
 * -------------------------------------------------
 * ⚠️  DANGEREUX — À UTILISER AVEC UNE EXTRÊME PRÉCAUTION
 *
 * Ce client contourne totalement la RLS grâce à la clé `service_role`.
 * Il peut lire/écrire/supprimer N'IMPORTE QUELLE ligne de N'IMPORTE QUELLE
 * pressing. À réserver aux opérations réellement privilégiées :
 *
 *   ✅ Cas légitimes :
 *      - Seed initial du Super Admin (configuration V1.2 §3.1)
 *      - Génération de codes d'activation (Super Admin uniquement)
 *      - Création/suspension d'abonnements SaaS (Super Admin uniquement)
 *      - Scripts de migration / maintenance
 *      - Opérations Storage (upload FDS, logos) si nécessaire
 *
 *   ❌ INTERDIT :
 *      - Toute lecture/écriture de données métier pressing (commandes,
 *        clients, paiements) → utiliser getSupabaseServer() à la place
 *      - Import dans un composant client ("use client")
 *      - Exposure de SUPABASE_SERVICE_ROLE_KEY au navigateur
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/supabase/error-handling";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "[supabase/admin] Variables NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquantes."
    );
  }

  adminClient = createClient(url, key, {
    auth: {
      // Désactive la persistance de session : on n'en a pas besoin côté
      // serveur admin, et ça évite toute fuite accidentelle.
      persistSession: false,
      autoRefreshToken: false,
    },
    // Cap la latence d'un appel réseau mort (projet en pause, DNS
    // injoignable, firewall) à 8s au lieu du timeout TCP/undici par
    // défaut (~10-30s). En production (Supabase joignable), ce wrapper
    // est transparent — l'AbortController est nettoyé dès que la requête
    // réussit. Voir `src/lib/supabase/error-handling.ts`.
    global: { fetch: fetchWithTimeout(8000) },
    // Timeout PostgREST (requêtes DB) à 8s également — double sécurité.
    db: { timeout: 8000 },
  });

  return adminClient;
}
