/**
 * e-pressing — API /api/super-admin/users (GET)
 * ------------------------------------------------
 * Liste des utilisateurs Supabase Auth (vue Super Admin).
 *
 * Fonctionnalités :
 *   - Recherche par email (param `q`)
 *   - Pagination (param `page`, `perPage` default 50, max 200)
 *   - Pour chaque utilisateur : id, email, created_at, last_sign_in_at,
 *     email_confirmed_at, user_metadata (role, nom_complet, pressing_id)
 *   - Enrichissement : pour les utilisateurs liés au personnel, on ajoute
 *     `personnel` (nom_complet, role, pressing_nom) via une jointure côté JS
 *
 * 🔒 SÉCURITÉ : ensureSuperAdmin() + getSupabaseAdmin() (service_role, bypass RLS).
 *   L'API utilise le client admin pour lister les users (supabase.auth.admin.listUsers)
 *   car les users Auth ne sont pas soumis à RLS — seul le service_role peut les lire.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureSuperAdmin } from "@/lib/auth/super-admin";

export const dynamic = "force-dynamic";

const PER_PAGE_DEFAULT = 50;
const PER_PAGE_MAX = 200;

interface AuthUserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  user_metadata: {
    role?: string;
    nom_complet?: string;
    pressing_id?: string;
  };
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
}

interface PersonnelJoin {
  user_id: string;
  nom_complet: string;
  role: string;
  pressing_nom: string | null;
  pressing_id: string | null;
  actif: boolean;
  statut_compte: string | null;
}

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const guard = await ensureSuperAdmin(supabase);
  if ("error" in guard) return guard.error;

  const admin = getSupabaseAdmin();

  // ---- Paramètres de requête ----
  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const perPage = Math.min(
    PER_PAGE_MAX,
    Math.max(1, parseInt(searchParams.get("perPage") || String(PER_PAGE_DEFAULT), 10))
  );

  // ---- 1. Liste paginée des users Auth ----
  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({
    page,
    perPage,
  });

  if (usersErr) {
    console.error("[api/super-admin/users GET] listUsers error:", usersErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des utilisateurs." },
      { status: 500 }
    );
  }

  let users: AuthUserRow[] = (usersData.users as unknown as AuthUserRow[]) ?? [];

  // ---- 2. Filtrage par email si `q` fourni ----
  if (q) {
    users = users.filter((u) => (u.email || "").toLowerCase().includes(q));
  }

  // ---- 3. Enrichissement : jointure avec `personnel` ----
  const userIds = users.map((u) => u.id);
  let personnelMap: Map<string, PersonnelJoin> = new Map();

  if (userIds.length > 0) {
    const { data: personnelRows, error: personnelErr } = await admin
      .from("personnel")
      .select(
        `
        user_id,
        nom_complet,
        role,
        pressing_id,
        actif,
        statut_compte,
        pressing:pressing_id (nom)
      `
      )
      .in("user_id", userIds);

    if (!personnelErr && personnelRows) {
      personnelMap = new Map(
        (personnelRows as unknown as Array<PersonnelJoin & { pressing?: { nom: string } | null }>).map(
          (p) => [
            p.user_id,
            {
              user_id: p.user_id,
              nom_complet: p.nom_complet,
              role: p.role,
              pressing_nom: p.pressing?.nom ?? null,
              pressing_id: p.pressing_id,
              actif: p.actif,
              statut_compte: p.statut_compte,
            },
          ]
        )
      );
    }
  }

  // ---- 4. Vérifie si chaque user est super admin ----
  const { data: superAdminRows } = await admin
    .from("super_admins")
    .select("user_id, nom_complet")
    .in("user_id", userIds);

  const superAdminMap = new Map(
    (superAdminRows ?? []).map((sa: { user_id: string; nom_complet: string }) => [
      sa.user_id,
      sa.nom_complet,
    ])
  );

  // ---- 5. Formatage de la réponse ----
  const formatted = users.map((u) => {
    const personnel = personnelMap.get(u.id);
    const isSuperAdmin = superAdminMap.has(u.id);
    const role =
      u.user_metadata?.role ??
      (isSuperAdmin ? "super_admin" : personnel?.role ?? null);
    const nomComplet =
      u.user_metadata?.nom_complet ??
      personnel?.nom_complet ??
      superAdminMap.get(u.id) ??
      null;

    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
      provider: u.app_metadata?.provider ?? "email",
      role,
      nom_complet: nomComplet,
      is_super_admin: isSuperAdmin,
      personnel: personnel
        ? {
            pressing_nom: personnel.pressing_nom,
            pressing_id: personnel.pressing_id,
            actif: personnel.actif,
            statut_compte: personnel.statut_compte,
          }
        : null,
    };
  });

  return NextResponse.json({
    success: true,
    users: formatted,
    total: usersData.aud ?? formatted.length,
    page,
    perPage,
  });
}
