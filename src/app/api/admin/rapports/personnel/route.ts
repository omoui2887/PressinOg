/**
 * e-pressing — API /api/admin/rapports/personnel (GET) — LOT 12.3
 * ---------------------------------------------------------------
 * Export .xlsx — Rapport Personnel : liste des employés du pressing.
 *
 * Aucun filtre de période. Tous les employés du pressing ( RLS isole par
 * pressing_id ).
 *
 * Colonnes retournées ( alignées sur COLONNES_PERSONNEL ) :
 *   nom | prenom | role | telephone | email | statut_compte |
 *   methode_creation | date_creation
 *
 * - nom    : dernier mot de nom_complet ( ex : "Jean Dupont" → "Dupont" ).
 *   Si nom_complet a un seul mot → nom = ce mot, prenom = "".
 * - prenom : le reste de nom_complet avant le dernier mot.
 * - role   : libellé FR ( mapping local — les rôles ne sont pas dans un
 *   helper partagé car spécifiques au module personnel ).
 * - statut_compte : libellé FR ( actif / invite_en_attente / desactive ).
 * - methode_creation : libellé FR ( creation_directe / lien_invitation ).
 * - Tri : created_at DESC.
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT) → RLS isole par pressing_id.
 *   Auth : MANAGER actif uniquement ( données RH sensibles ).
 *   Miroir du pattern de src/app/api/admin/personnel/route.ts GET.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePlanFeature } from "@/lib/auth/plan-gating";
import { formatDateOnly } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface PersonnelRow {
  id: string;
  nom_complet: string;
  email: string | null;
  telephone: string | null;
  role: string;
  methode_creation: string;
  statut_compte: string;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/*  HELPERS — libellés FR locaux                                               */
/* -------------------------------------------------------------------------- */

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  receptionniste: "Réceptionniste",
  caissier: "Caissier",
  laveur: "Laveur",
  repassage: "Repassage",
  livreur: "Livreur",
  comptable: "Comptable",
};

const STATUT_COMPTE_LABELS: Record<string, string> = {
  actif: "Actif",
  invite_en_attente: "Invitation en attente",
  desactive: "Désactivé",
};

const METHODE_CREATION_LABELS: Record<string, string> = {
  creation_directe: "Création directe",
  lien_invitation: "Lien d'invitation",
};

/**
 * Découpe un nom_complet ( format "Prenom Nom" ) en prenom et nom.
 * - "Jean Dupont" → prenom="Jean", nom="Dupont"
 * - "Awa"         → prenom="", nom="Awa"
 * - ""            → prenom="", nom=""
 */
function splitNomComplet(nomComplet: string): { prenom: string; nom: string } {
  const parts = nomComplet.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { prenom: "", nom: "" };
  if (parts.length === 1) return { prenom: "", nom: parts[0] };
  const nom = parts[parts.length - 1];
  const prenom = parts.slice(0, -1).join(" ");
  return { prenom, nom };
}

/* -------------------------------------------------------------------------- */
/*  GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Auth : MANAGER actif uniquement ( données RH )
  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !me ||
    me.role !== "manager" ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — manager requis" },
      { status: 403 }
    );
  }

  // 🚫 PLAN GATING (PRD §16) — Starter ne peut pas exporter en .xlsx.
  const forbidden = await requirePlanFeature(
    supabase,
    me.pressing_id,
    "export_xlsx"
  );
  if (forbidden) return forbidden;

  // Pas de paramètres de requête
  void request;

  // Récupère tout le personnel du pressing ( RLS isole par pressing_id )
  const { data: personnel, error: personnelErr } = await supabase
    .from("personnel")
    .select(
      "id, nom_complet, email, telephone, role, methode_creation, statut_compte, created_at"
    )
    .order("created_at", { ascending: false });

  if (personnelErr) {
    console.error("[api/admin/rapports/personnel] Erreur SELECT:", personnelErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du personnel" },
      { status: 500 }
    );
  }

  const rows: Record<string, unknown>[] = (personnel ?? []).map((pRaw) => {
    const p = pRaw as unknown as PersonnelRow;
    const { prenom, nom } = splitNomComplet(p.nom_complet ?? "");
    return {
      nom,
      prenom,
      role: p.role ? ROLE_LABELS[p.role] ?? p.role : "—",
      telephone: p.telephone && p.telephone.trim() ? p.telephone : "—",
      email: p.email && p.email.trim() ? p.email : "—",
      statut_compte: p.statut_compte
        ? STATUT_COMPTE_LABELS[p.statut_compte] ?? p.statut_compte
        : "—",
      methode_creation: p.methode_creation
        ? METHODE_CREATION_LABELS[p.methode_creation] ?? p.methode_creation
        : "—",
      date_creation: formatDateOnly(p.created_at),
    };
  });

  return NextResponse.json({ success: true, data: rows });
}
