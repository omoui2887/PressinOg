/**
 * e-pressing — API /api/admin/commandes/[id]/articles/[articleId] (PATCH)
 * -----------------------------------------------------------------------
 * LOT 7.6 — Mise à jour du statut d'un article `articles_vetements` depuis
 * la page de détail commande. Permet au personnel de suivi (manager,
 * réceptionniste, laveur, repassage) de faire avancer un article dans le
 * workflow : recu → en_traitement → lave → repasse → pret → retire/livre.
 *
 * Body JSON : {
 *   statut: StatutArticle,                  // obligatoire
 *   zone_stockage?: string | null,          // optionnel — casier (ex: "A1")
 *                                            //   - renseigné quand statut cible = "pret"
 *                                            //   - ignoré (forcé à null) pour les autres statuts
 *                                            //   - format: 1-10 caractères alphanumériques
 * }
 * Réponse    : { success: true, data: { id, statut, zone_stockage, date_rangeement } }
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`.
 *   - L'UPDATE filtre sur `id = articleId AND commande_id = commandeId`.
 *     La commande_id est elle-même isolée par RLS (le personnel ne peut
 *     voir/updater que les commandes de son pressing). Si l'article
 *     n'existe pas ou n'appartient pas à une commande du pressing, la
 *     clause WHERE ne matche aucune ligne → 404.
 *   - Auth : uniquement Admin/Manager/Laveur/Repassage/Livreur peuvent
 *     modifier le statut d'un article (PRD §3.4 — matrice "Modifier statut").
 *     Fix (FIX-WAVE1-A #7) : avant ce fix, n'importe quel personnel actif
 *     pouvait modifier le statut. Désormais les rôles Receptionniste,
 *     Caissier et Comptable sont exclus.
 *   - 401 si non authentifié, 403 si personnel inactif ou rôle insuffisant,
 *     404 si article introuvable.
 *
 * 🛡️ GUARD WORKFLOW (WORKFLOW-FIX-V1) :
 *   - La transition `from → to` doit être autorisée par la matrice
 *     `TRANSITIONS_ARTICLE_AUTORISEES` (cf. src/lib/workflow/commande-statut.ts).
 *   - On ne peut jamais reculer dans le workflow (ex: pret → recu interdit).
 *   - Les rôles "manager" peuvent forcer une transition arbitraire
 *     (override manuel pour intervention).
 *   - 409 si transition refusée.
 *
 * 🗄️ GESTION DES CASIERS (CASIER-FIX-V1) :
 *   - Si `statut` cible = "pret" et `zone_stockage` fourni : on enregistre
 *     le casier + date_rangeement = NOW() + rangee_par = personnel connecté.
 *   - Si `statut` cible = "pret" mais `zone_stockage` non fourni : on
 *     accepte (le casier peut être assigné plus tard via un 2e PATCH ou
 *     via la page Casiers).
 *   - Si `statut` cible ≠ "pret" (recu, en_traitement, lave, repasse,
 *     retire, livre) : `zone_stockage` est ignoré et forcé à NULL
 *     (libération du casier). Cas particulier : pour "retire" et "livre",
 *     on vide explicitement zone_stockage + date_rangeement + rangee_par
 *     pour libérer le casier physique.
 *   - Robustesse : si la colonne `zone_stockage` n'existe pas en DB
 *     (migration 015 non appliquée), on retombe sur l'UPDATE simple sans
 *     zone_stockage (l'erreur PostgREST est captée et l'UPDATE est retry
 *     sans les colonnes de casier).
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

/**
 * Rôles autorisés à modifier le statut d'un article (PRD §3.4 — matrice
 * "Modifier statut" : ✅ Admin/Manager/Laveur/Repassage/Livreur ;
 * ❌ Receptionniste/Caissier/Comptable). L'admin pressing a le rôle
 * "manager" côté `personnel`. Fix (FIX-WAVE1-A #7).
 */
const ROLES_AUTORISES_MODIFIER_STATUT_ARTICLE = new Set<string>([
  "manager",
  "laveur",
  "repassage",
  "livreur",
]);

interface RouteParams {
  params: Promise<{ id: string; articleId: string }>;
}

/** Regex de validation du code casier (1-10 alphanumériques). */
const ZONE_STOCKAGE_REGEX = /^[A-Za-z0-9]{1,10}$/;

/** Statuts terminaux qui libèrent le casier. */
const STATUTS_LIBERATION_CASIER = new Set<string>(["retire", "livre"]);

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

  // Fix (FIX-WAVE1-A #7) — Role guard PRD §3.4 : seuls Admin/Manager/Laveur/
  // Repassage/Livreur peuvent modifier le statut d'un article. Les rôles
  // Receptionniste, Caissier et Comptable sont refusés (403) avant tout
  // accès DB. Le check `me.role` se fait après isPersonnelActive pour
  // éviter de leak l'existence d'un compte inactif.
  if (!ROLES_AUTORISES_MODIFIER_STATUT_ARTICLE.has(me.role)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Accès refusé — rôle insuffisant pour modifier le statut d'un article (Admin/Manager/Laveur/Repassage/Livreur requis).",
      },
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

  // Validation du zone_stockage (optionnel, mais si fourni doit être valide)
  const zoneStockageRaw = body.zone_stockage;
  let zoneStockage: string | null = null;
  if (zoneStockageRaw !== undefined && zoneStockageRaw !== null) {
    if (typeof zoneStockageRaw !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "zone_stockage doit être une chaîne de caractères",
        },
        { status: 400 }
      );
    }
    const trimmed = zoneStockageRaw.trim().toUpperCase();
    if (trimmed === "") {
      zoneStockage = null;
    } else if (!ZONE_STOCKAGE_REGEX.test(trimmed)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "zone_stockage invalide : 1 à 10 caractères alphanumériques (ex: A1, B2, C10)",
        },
        { status: 400 }
      );
    } else {
      zoneStockage = trimmed;
    }
  }

  // --- Fetch du statut actuel de l'article (pour valider la transition) ---
  // On essaie d'abord avec les colonnes de casier (migration 015 appliquée),
  // puis sans (fallback robuste).
  const { data: articleExistantRiche, error: fetchErrRiche } = await supabase
    .from("articles_vetements")
    .select("id, statut, zone_stockage")
    .eq("id", articleId)
    .eq("commande_id", commandeId)
    .maybeSingle();

  let statutActuel: string | null;
  let casierColumnExists = true;

  if (fetchErrRiche) {
    // La colonne zone_stockage n'existe probablement pas (migration 015
    // non appliquée). On retente sans cette colonne.
    casierColumnExists = false;
    const { data: articleExistantMin, error: fetchErrMin } = await supabase
      .from("articles_vetements")
      .select("id, statut")
      .eq("id", articleId)
      .eq("commande_id", commandeId)
      .maybeSingle();

    if (fetchErrMin) {
      console.error(
        "[api/admin/commandes/[id]/articles/[articleId]] Erreur SELECT article (minimal):",
        fetchErrMin
      );
      return NextResponse.json(
        { success: false, error: "Erreur lors de la récupération de l'article" },
        { status: 500 }
      );
    }
    if (!articleExistantMin) {
      return NextResponse.json(
        {
          success: false,
          error: "Article introuvable (vérifiez l'ID et la commande associée)",
        },
        { status: 404 }
      );
    }
    statutActuel = articleExistantMin.statut as string | null;
  } else if (!articleExistantRiche) {
    return NextResponse.json(
      {
        success: false,
        error: "Article introuvable (vérifiez l'ID et la commande associée)",
      },
      { status: 404 }
    );
  } else {
    statutActuel = articleExistantRiche.statut as string | null;
  }

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

  // --- Construction du payload UPDATE ---
  // Si la migration 015 n'est pas appliquée, on fait un UPDATE simple sans
  // les colonnes de casier (la fonctionnalité casier est désactivée mais
  // le workflow continue de fonctionner).
  const nowIso = new Date().toISOString();

  // Statuts qui libèrent le casier (retire, livre) → on vide les champs
  const libereCasier = STATUTS_LIBERATION_CASIER.has(statutValid);

  // Pour "pret" : on applique zone_stockage si fourni
  // Pour "retire"/"livre" : on vide zone_stockage, date_rangeement, rangee_par
  // Pour les autres statuts : on ne touche pas au casier existant
  //   (sauf si l'appelant a explicitement passé zone_stockage=null pour le vider)
  let updatePayload: Record<string, unknown>;
  let updateSelect = "id, statut";

  if (casierColumnExists) {
    updateSelect = "id, statut, zone_stockage, date_rangeement";

    if (statutValid === "pret") {
      if (zoneStockageRaw === undefined) {
        // Pas de champ zone_stockage dans le body → on garde le casier
        // existant (peut être assigné plus tard). On met juste à jour le statut.
        updatePayload = { statut: statutValid };
      } else if (zoneStockage === null) {
        // zone_stockage explicitement null → libérer le casier
        // (bouton "Libérer le casier" dans l'UI CommandeDetail).
        updatePayload = {
          statut: statutValid,
          zone_stockage: null,
          date_rangeement: null,
          rangee_par: null,
        };
      } else {
        // zone_stockage fourni et valide → assigner le casier
        updatePayload = {
          statut: statutValid,
          zone_stockage: zoneStockage,
          date_rangeement: nowIso,
          rangee_par: me.id,
        };
      }
    } else if (libereCasier) {
      // retire / livre → libération du casier
      updatePayload = {
        statut: statutValid,
        zone_stockage: null,
        date_rangeement: null,
        rangee_par: null,
      };
    } else {
      // recu / en_traitement / lave / repasse
      // Si l'appelant a explicitement passé zone_stockage=null, on vide.
      // Sinon on ne touche pas au casier.
      if (zoneStockageRaw === null) {
        updatePayload = {
          statut: statutValid,
          zone_stockage: null,
          date_rangeement: null,
          rangee_par: null,
        };
      } else {
        updatePayload = { statut: statutValid };
      }
    }
  } else {
    // Migration 015 non appliquée — UPDATE simple
    updatePayload = { statut: statutValid };
  }

  // UPDATE avec double filtre id + commande_id (sécurité défensive en plus
  // de RLS). RLS isole par pressing via la commande parent.
  const { data: updated, error: updateErr } = await supabase
    .from("articles_vetements")
    .update(updatePayload)
    .eq("id", articleId)
    .eq("commande_id", commandeId)
    .select(updateSelect)
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
