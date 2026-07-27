/**
 * OgPressing — API /api/admin/stock/[id]/mouvements (POST) — LOT 10.1
 * -------------------------------------------------------------------
 * Enregistre un mouvement de stock (entrée ou sortie) pour un produit.
 *
 * Body : { type_mouvement: 'entree'|'sortie', quantite: number, motif?: string }
 *
 * Le trigger DB `trg_mouvement_stock_after_insert` met à jour
 * produits_stock.quantite_actuelle automatiquement :
 *   - entree  → quantite_actuelle += quantite
 *   - sortie  → quantite_actuelle -= quantite (lève une exception si < 0)
 *
 * 🔒 SÉCURITÉ : manager ou réceptionniste actif. RLS isole par pressing.
 *    enregistre_par = me.id (personnel connecté).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: produitId } = await params;
  if (!produitId) {
    return NextResponse.json(
      { success: false, error: "ID produit manquant" },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }
  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !me ||
    !["manager", "receptionniste"].includes(me.role) ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Accès refusé — manager ou réceptionniste requis",
      },
      { status: 403 }
    );
  }

  let body: {
    type_mouvement?: unknown;
    quantite?: unknown;
    motif?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const typeMouvement =
    typeof body.type_mouvement === "string" ? body.type_mouvement : "";
  if (typeMouvement !== "entree" && typeMouvement !== "sortie") {
    return NextResponse.json(
      {
        success: false,
        error: "Type de mouvement invalide ('entree' ou 'sortie' attendu).",
      },
      { status: 400 }
    );
  }

  const quantite =
    typeof body.quantite === "number"
      ? body.quantite
      : parseFloat(String(body.quantite));
  if (Number.isNaN(quantite) || quantite <= 0) {
    return NextResponse.json(
      { success: false, error: "Quantité invalide (doit être > 0)." },
      { status: 400 }
    );
  }

  const motif =
    typeof body.motif === "string" && body.motif.trim()
      ? body.motif.trim().slice(0, 500)
      : null;

  // Insertion du mouvement — le trigger DB met à jour quantite_actuelle.
  const { data: mouvement, error: insertErr } = await supabase
    .from("mouvements_stock")
    .insert({
      produit_id: produitId,
      type_mouvement: typeMouvement,
      quantite,
      motif,
      enregistre_par: me.id,
    })
    .select("id, produit_id, type_mouvement, quantite, motif, date_mouvement, enregistre_par, created_at")
    .maybeSingle();

  if (insertErr) {
    // Le trigger lève une exception si la sortie fait descendre le stock < 0.
    // Le message d'erreur PG contient "quantite_actuelle" ou "négatif".
    const msg = insertErr.message || "";
    if (msg.toLowerCase().includes("négatif") || msg.toLowerCase().includes("negatif") || msg.toLowerCase().includes("stock")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Stock insuffisant : la sortie ferait descendre la quantité sous zéro.",
        },
        { status: 400 }
      );
    }
    console.error("[api/admin/stock/[id]/mouvements POST] Erreur INSERT:", insertErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de l'enregistrement du mouvement." },
      { status: 500 }
    );
  }

  if (!mouvement) {
    return NextResponse.json(
      { success: false, error: "Mouvement non créé (produit introuvable ou hors pressing)." },
      { status: 404 }
    );
  }

  // Récupère le produit mis à jour pour renvoyer la nouvelle quantité.
  const { data: produit } = await supabase
    .from("produits_stock")
    .select("id, nom, quantite_actuelle, seuil_alerte, unite")
    .eq("id", produitId)
    .maybeSingle();

  return NextResponse.json(
    {
      success: true,
      data: mouvement,
      produit: produit ?? null,
    },
    { status: 201 }
  );
}
