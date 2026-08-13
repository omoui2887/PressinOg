/**
 * e-pressing — API /api/super-admin/demandes/[id] (PATCH)
 * ---------------------------------------------------------
 * Met à jour une demande d'inscription :
 *   - `statut`        : 'contactee' | 'refusee' (passage à 'validee' se fait
 *                       via /generer-code car il faut générer le code)
 *   - `notes_super_admin` : texte libre (notes internes du Super Admin)
 *
 * Si le statut change, on renseigne également `traite_par` (id super_admin
 * connecté) et `date_traitement` (NOW).
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT). RLS
 *    `super_admin_full_access` sur `demandes_inscription` via
 *    `is_super_admin()`.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUTS_PATCHABLE = ["contactee", "refusee"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie que l'appelant est Super Admin actif
  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("actif", true)
    .maybeSingle();

  if (!superAdmin) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — Super Admin requis" },
      { status: 403 }
    );
  }

  const { id: demandeId } = await params;

  // Parse le body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const hasStatut = typeof body.statut === "string";
  const hasNotes = typeof body.notes_super_admin === "string";

  if (!hasStatut && !hasNotes) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Aucun champ à mettre à jour. Attendu : { statut } et/ou { notes_super_admin }.",
      },
      { status: 400 }
    );
  }

  if (
    hasStatut &&
    !(STATUTS_PATCHABLE as readonly string[]).includes(body.statut as string)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Statut invalide. Valeurs attendues : 'contactee' ou 'refusee'. Pour valider une demande, utilisez /generer-code.",
      },
      { status: 400 }
    );
  }

  // Vérifie que la demande existe (RLS garantit l'accès super admin)
  const { data: existing } = await supabase
    .from("demandes_inscription")
    .select("id, statut")
    .eq("id", demandeId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Demande introuvable" },
      { status: 404 }
    );
  }

  // Construit l'objet d'update
  const updates: Record<string, unknown> = {};

  if (hasNotes) {
    const notes = (body.notes_super_admin as string).trim();
    updates.notes_super_admin = notes.length > 0 ? notes : null;
  }

  if (hasStatut) {
    const newStatut = body.statut as (typeof STATUTS_PATCHABLE)[number];
    if (existing.statut === newStatut) {
      return NextResponse.json(
        {
          success: false,
          error: `La demande est déjà au statut '${newStatut}'.`,
        },
        { status: 400 }
      );
    }
    updates.statut = newStatut;
    updates.traite_par = superAdmin.id;
    updates.date_traitement = new Date().toISOString();
  }

  // Applique la mise à jour
  const { data: updated, error: updateErr } = await supabase
    .from("demandes_inscription")
    .update(updates)
    .eq("id", demandeId)
    .select(
      "id, nom_gerant, nom_pressing, telephone, email, ville, commune, message, statut, traite_par, date_traitement, notes_traitement, notes_super_admin, nombre_machines, nombre_employes, plan_souhaite, created_at, updated_at"
    )
    .maybeSingle();

  if (updateErr) {
    console.error(
      "[api/super-admin/demandes/[id]] Erreur UPDATE:",
      updateErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: updated,
  });
}
