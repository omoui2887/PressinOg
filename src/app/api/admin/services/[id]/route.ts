/**
 * e-pressing — API /api/admin/services/[id] (PATCH + DELETE) — LOT 11.1
 * --------------------------------------------------------------------
 * Modification d'un service : nom, prix, actif, duree_estimee.
 * Le `type` n'est PAS modifiable ici (l'UI ne l'édite pas — spec LOT 11.1).
 *
 * Suppression d'un service (DELETE) : supprime définitivement le service.
 * ⚠️ Si des commandes référencent déjà ce service (via commande_lignes.service_id
 *    FK), la suppression peut échouer (contrainte FK) — l'API renvoie 409
 *    avec un message clair invitant à désactiver le service plutôt que le
 *    supprimer.
 *
 * 🔒 SÉCURITÉ : manager actif du pressing. RLS isole par pressing_id
 *    (un manager ne peut modifier/supprimer que les services de son propre
 *    pressing).
 *
 * Référence : pattern identique à /api/admin/stock/[id] (LOT 10.1).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Vérifie l'auth + retourne le personnel connecté (manager only). */
async function getConnectedManager() {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
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
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — manager requis" },
        { status: 403 }
      ),
    };
  }
  return { me, supabase };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "ID service manquant" },
      { status: 400 }
    );
  }

  const auth = await getConnectedManager();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  // Construit l'objet update uniquement avec les champs fournis et valides.
  const update: Record<string, unknown> = {};

  if (body.nom !== undefined) {
    if (typeof body.nom !== "string") {
      return NextResponse.json(
        { success: false, error: "Le nom doit être une chaîne de caractères." },
        { status: 400 }
      );
    }
    const nom = body.nom.trim();
    if (nom.length < 2 || nom.length > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Le nom doit comporter entre 2 et 100 caractères.",
        },
        { status: 400 }
      );
    }
    update.nom = nom;
  }

  if (body.prix !== undefined && body.prix !== null) {
    const prix =
      typeof body.prix === "number"
        ? body.prix
        : parseInt(String(body.prix), 10);
    if (Number.isNaN(prix) || prix < 0 || !Number.isInteger(prix)) {
      return NextResponse.json(
        {
          success: false,
          error: "Prix unitaire invalide (entier ≥ 0 FCFA).",
        },
        { status: 400 }
      );
    }
    update.prix = prix;
  }

  if (body.actif !== undefined) {
    if (typeof body.actif !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Le champ 'actif' doit être un booléen." },
        { status: 400 }
      );
    }
    update.actif = body.actif;
  }

  if (body.duree_estimee !== undefined) {
    // Interval PostgreSQL : on accepte une chaîne libre ("2 hours", "1 day",
    // "90 minutes") ou null pour effacer. La validation réelle est faite par
    // PostgreSQL (code 22007 si format invalide).
    if (
      typeof body.duree_estimee === "string" &&
      body.duree_estimee.trim() !== ""
    ) {
      update.duree_estimee = body.duree_estimee.trim();
    } else {
      update.duree_estimee = null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { success: false, error: "Aucun champ à mettre à jour." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("services")
    .update(update)
    .eq("id", id)
    .select(
      "id, type, nom, prix, duree_estimee, actif, created_at, updated_at"
    )
    .maybeSingle();

  if (updateErr) {
    console.error("[api/admin/services PATCH] Erreur UPDATE:", updateErr);
    // Format duree_estimee invalide → 22007
    if (updateErr.code === "22007") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Format de durée estimée invalide. Exemples valides : « 2 hours », « 1 day », « 90 minutes ».",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour du service." },
      { status: 500 }
    );
  }

  if (!updated) {
    // Soit l'ID n'existe pas, soit la RLS a bloqué (service hors pressing).
    return NextResponse.json(
      {
        success: false,
        error: "Service introuvable ou accès refusé.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: updated });
}

/* ================================================================
 *  DELETE — Suppression d'un service (LOT 11.1)
 * ================================================================
 *
 * Supprime définitivement un service du pressing. RLS garantit qu'un
 * manager ne peut supprimer que les services de son propre pressing.
 *
 * ⚠️ Si des commande_lignes référencent ce service (FK service_id),
 *    PostgreSQL lèvera une erreur 23503 (foreign_key_violation). On
 *    intercepte ce code et on renvoie 409 avec un message invitant à
 *    désactiver le service plutôt que le supprimer (pour préserver
 *    l'historique des commandes).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "ID service manquant" },
      { status: 400 }
    );
  }

  const auth = await getConnectedManager();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // Vérification préventive : compte les commande_lignes qui référencent
  // ce service. Si > 0, on refuse la suppression (préserve l'historique).
  const { count, error: countErr } = await supabase
    .from("commande_lignes")
    .select("id", { count: "exact", head: true })
    .eq("service_id", id);

  if (countErr) {
    console.error(
      "[api/admin/services DELETE] Erreur COUNT commande_lignes:",
      countErr
    );
    // On continue quand même vers la tentative de DELETE — si la table
    // n'existe pas ou la FK est absente, le DELETE passera.
  }

  if (count && count > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Impossible de supprimer ce service : ${count} commande(s) y font référence. Désactivez-le plutôt pour le retirer du wizard tout en préservant l'historique.`,
      },
      { status: 409 }
    );
  }

  const { error: deleteErr } = await supabase
    .from("services")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    console.error("[api/admin/services DELETE] Erreur DELETE:", deleteErr);
    // 23503 = foreign_key_violation (une commande référence encore ce service)
    if (deleteErr.code === "23503") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de supprimer ce service : des commandes y font référence. Désactivez-le plutôt pour le retirer du wizard tout en préservant l'historique.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Erreur lors de la suppression du service." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
