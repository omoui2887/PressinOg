/**
 * e-pressing — API /api/super-admin/pressings/[id] (GET + PATCH)
 * ----------------------------------------------------------------
 * Détails d'un pressing client (vue Super Admin) :
 *   - GET  : renvoie le pressing + historique complet des abonnements
 *            (date_debut DESC) + liste du personnel + nombre total de commandes
 *   - PATCH : met à jour `pressing.statut` (actif | suspendu) — suspendre un
 *             pressing bloque automatiquement la connexion de tout son personnel
 *             (cf. middleware — `pressing.statut='suspendu'` → signOut + redirect
 *             /login?error=pressing_suspendu).
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (client anon + JWT utilisateur).
 *   - Vérification super admin en défense en profondeur (table super_admins).
 *   - RLS : `super_admin_full_access` sur `pressing`, `abonnements`,
 *     `personnel`, `commandes` → le super admin peut lire/modifier tous les
 *     pressings.
 *
 * ⚠️ NOTE : on ne touche PAS à `personnel.actif` lors de la suspension/réactivation.
 *   Le middleware vérifie `pressing.statut` directement (cf. §5.5 du middleware),
 *   il n'y a donc pas besoin de "double-lock" en désactivant le personnel.
 *   Cela évite aussi d'écraser l'état `statut_compte` (actif / invite_en_attente /
 *   desactive) que le manager aurait pu configurer manuellement.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUTS_VALID = ["actif", "suspendu"] as const;
type StatutCible = (typeof STATUTS_VALID)[number];

/**
 * Vérifie que l'utilisateur courant est super admin.
 * Retourne une Response d'erreur 401/403 si non, sinon null.
 */
async function ensureSuperAdmin() {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      supabase,
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
  const { data: superAdminRow } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("actif", true)
    .maybeSingle();
  if (!superAdminRow) {
    return {
      supabase,
      error: NextResponse.json(
        { success: false, error: "Accès refusé — super admin requis" },
        { status: 403 }
      ),
    };
  }
  return { supabase, error: null };
}

/* -------------------------------------------------------------------------- */
/*  GET — détails pressing                                                    */
/* -------------------------------------------------------------------------- */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, error: authError } = await ensureSuperAdmin();
  if (authError) return authError;

  const { id } = await params;

  // ---- 1. Récupère le pressing ----
  const { data: pressing, error: pressingErr } = await supabase
    .from("pressing")
    .select(
      "id, nom, slug, telephone, email, adresse, ville, commune, logo_url, statut, date_activation, date_suspension, motif_suspension, horaires, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (pressingErr) {
    console.error("[api/super-admin/pressings/[id]] Erreur SELECT pressing:", pressingErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du pressing" },
      { status: 500 }
    );
  }
  if (!pressing) {
    return NextResponse.json(
      { success: false, error: "Pressing introuvable" },
      { status: 404 }
    );
  }

  // ---- 2. Récupère en parallèle : abonnements, personnel, count commandes ----
  const [abonnementsRes, personnelRes, commandesCountRes] = await Promise.all([
    supabase
      .from("abonnements")
      .select(
        "id, plan, statut, date_debut, date_fin, montant_mensuel, mode_paiement_derniere_echeance, date_derniere_echeance, reference_paiement, justificatif_url, created_at"
      )
      .eq("pressing_id", id)
      .order("date_debut", { ascending: false }),
    supabase
      .from("personnel")
      .select(
        "id, nom_complet, email, telephone, role, statut_compte, actif, created_at"
      )
      .eq("pressing_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .eq("pressing_id", id),
  ]);

  // Les erreurs sur les sous-requêtes ne sont pas fatales : on renvoie des
  // tableaux vides / 0 plutôt que de tout faire échouer.
  if (abonnementsRes.error) {
    console.error(
      "[api/super-admin/pressings/[id]] Erreur SELECT abonnements:",
      abonnementsRes.error
    );
  }
  if (personnelRes.error) {
    console.error(
      "[api/super-admin/pressings/[id]] Erreur SELECT personnel:",
      personnelRes.error
    );
  }
  if (commandesCountRes.error) {
    console.error(
      "[api/super-admin/pressings/[id]] Erreur count commandes:",
      commandesCountRes.error
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      ...pressing,
      abonnements: abonnementsRes.data ?? [],
      personnel: personnelRes.data ?? [],
      total_commandes: commandesCountRes.count ?? 0,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  PATCH — suspendre / réactiver un pressing                                 */
/* -------------------------------------------------------------------------- */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, error: authError } = await ensureSuperAdmin();
  if (authError) return authError;

  const { id } = await params;

  // ---- Parse le body ----
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const statut = typeof body.statut === "string" ? body.statut : "";
  if (!STATUTS_VALID.includes(statut as StatutCible)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Statut invalide. Valeurs attendues : 'actif' ou 'suspendu'.",
      },
      { status: 400 }
    );
  }

  const motifSuspension =
    typeof body.motif_suspension === "string" && body.motif_suspension.trim()
      ? body.motif_suspension.trim().slice(0, 500)
      : null;

  // ---- Récupère le statut actuel (coherence check) ----
  const { data: current } = await supabase
    .from("pressing")
    .select("id, statut")
    .eq("id", id)
    .maybeSingle();

  if (!current) {
    return NextResponse.json(
      { success: false, error: "Pressing introuvable" },
      { status: 404 }
    );
  }

  if (statut === "suspendu" && current.statut === "suspendu") {
    return NextResponse.json(
      { success: false, error: "Ce pressing est déjà suspendu" },
      { status: 400 }
    );
  }
  if (statut === "actif" && current.statut === "actif") {
    return NextResponse.json(
      { success: false, error: "Ce pressing est déjà actif" },
      { status: 400 }
    );
  }

  // ---- Applique la mise à jour ----
  // On en profite pour tracer date_suspension + motif_suspension (cohérence audit).
  const updates: Record<string, unknown> =
    statut === "suspendu"
      ? {
          statut: "suspendu",
          date_suspension: new Date().toISOString(),
          motif_suspension: motifSuspension,
          updated_at: new Date().toISOString(),
        }
      : {
          statut: "actif",
          date_suspension: null,
          motif_suspension: null,
          updated_at: new Date().toISOString(),
        };

  const { data: updated, error: updateErr } = await supabase
    .from("pressing")
    .update(updates)
    .eq("id", id)
    .select(
      "id, nom, slug, telephone, email, adresse, ville, commune, logo_url, statut, date_activation, date_suspension, motif_suspension, horaires, created_at, updated_at"
    )
    .maybeSingle();

  if (updateErr) {
    console.error(
      "[api/super-admin/pressings/[id]] Erreur UPDATE pressing:",
      updateErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour du pressing" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: updated,
    action: statut === "suspendu" ? "suspendre" : "reactiver",
  });
}
