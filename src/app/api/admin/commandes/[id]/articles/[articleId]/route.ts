/**
 * OgPressing — API /api/admin/commandes/[id]/articles/[articleId] (PATCH)
 * -----------------------------------------------------------------------
 * LOT 7.6 — Mise à jour du statut d'un article `articles_vetements` depuis
 * la page de détail commande. Permet au personnel de suivi (manager,
 * réceptionniste, laveur, repassage) de faire avancer un article dans le
 * workflow : recu → en_traitement → lave → repasse → pret → retire/livre.
 *
 * Body JSON : { statut: StatutArticle }
 * Réponse    : { success: true, data: { id, statut } }
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`.
 *   - L'UPDATE filtre sur `id = articleId AND commande_id = commandeId`.
 *     La commande_id est elle-même isolée par RLS (le personnel ne peut
 *     voir/updater que les commandes de son pressing). Si l'article
 *     n'existe pas ou n'appartient pas à une commande du pressing, la
 *     clause WHERE ne matche aucune ligne → 404.
 *   - Auth : n'importe quel personnel actif (manager, réceptionniste,
 *     laveur, repassage, livreur, caissier, comptable).
 *   - 401 si non authentifié, 403 si personnel inactif, 404 si article
 *     introuvable.
 *
 * 🛡️ GUARD WORKFLOW (WORKFLOW-FIX-V1) :
 *   - La transition `from → to` doit être autorisée par la matrice
 *     `TRANSITIONS_ARTICLE_AUTORISEES` (cf. src/lib/workflow/commande-statut.ts).
 *   - On ne peut jamais reculer dans le workflow (ex: pret → recu interdit).
 *   - Les rôles "manager" peuvent forcer une transition arbitraire
 *     (override manuel pour intervention).
 *   - 409 si transition refusée.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  canTransitionArticle,
  expliquerRefusTransition,
  STATUTS_ARTICLE,
} from "@/lib/workflow/commande-statut";

export const dynamic = "force-dynamic";

/** 7 statuts valides pour un article (enum SQL `statut_article`). */
const STATUT_ARTICLE_VALID = STATUTS_ARTICLE;

type StatutArticleValid = (typeof STATUT_ARTICLE_VALID)[number];

interface RouteParams {
  params: Promise<{ id: string; articleId: string }>;
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie que l'appelant est un personnel actif + récupère son rôle
  // (le rôle est nécessaire pour le guard de transition — les managers
  // peuvent forcer une transition arbitraire).
  const { data: me } = await supabase
    .from("personnel")
    .select("id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!me) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — personnel introuvable" },
      { status: 403 }
    );
  }
  if (me.actif !== true || me.statut_compte !== "actif") {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }

  const { id: commandeId, articleId } = await params;

  // Parse + validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const statut = body.statut;
  if (
    typeof statut !== "string" ||
    !(STATUT_ARTICLE_VALID as readonly string[]).includes(statut)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: `statut invalide (valeurs attendues : ${STATUT_ARTICLE_VALID.join(
          ", "
        )})`,
      },
      { status: 400 }
    );
  }

  const statutValid = statut as StatutArticleValid;

  // --- Fetch du statut actuel de l'article (pour valider la transition) ---
  const { data: articleExistant, error: fetchErr } = await supabase
    .from("articles_vetements")
    .select("id, statut")
    .eq("id", articleId)
    .eq("commande_id", commandeId)
    .maybeSingle();

  if (fetchErr) {
    console.error(
      "[api/admin/commandes/[id]/articles/[articleId]] Erreur SELECT article:",
      fetchErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération de l'article" },
      { status: 500 }
    );
  }
  if (!articleExistant) {
    return NextResponse.json(
      {
        success: false,
        error: "Article introuvable (vérifiez l'ID et la commande associée)",
      },
      { status: 404 }
    );
  }

  const statutActuel = articleExistant.statut as string | null;

  // --- Guard de transition (WORKFLOW-FIX-V1) ---
  // Vérifie que from → to est autorisé par la matrice. Les managers peuvent
  // forcer (override). Les autres rôles doivent respecter le workflow.
  if (!canTransitionArticle(statutActuel, statutValid, me.role)) {
    const explication = expliquerRefusTransition(statutActuel, statutValid);
    console.warn(
      `[api/admin/commandes/[id]/articles/[articleId]] Transition refusée — ` +
        `user=${userData.user.id} role=${me.role} article=${articleId} ` +
        `from=${statutActuel} to=${statutValid}`
    );
    return NextResponse.json(
      {
        success: false,
        error: explication,
        code: "WORKFLOW_TRANSITION_REFUSEE",
        details: {
          statut_actuel: statutActuel,
          statut_cible: statutValid,
          role: me.role,
          // Indique si l'utilisateur a un rôle d'override disponible
          override_disponible: me.role === "manager",
        },
      },
      { status: 409 }
    );
  }

  // UPDATE avec double filtre id + commande_id (sécurité défensive en plus
  // de RLS). RLS isole par pressing via la commande parent.
  const { data: updated, error: updateErr } = await supabase
    .from("articles_vetements")
    .update({ statut: statutValid })
    .eq("id", articleId)
    .eq("commande_id", commandeId)
    .select("id, statut")
    .maybeSingle();

  if (updateErr) {
    console.error(
      "[api/admin/commandes/[id]/articles/[articleId]] Erreur UPDATE:",
      updateErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour de l'article" },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      {
        success: false,
        error: "Article introuvable (vérifiez l'ID et la commande associée)",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: updated,
  });
}
