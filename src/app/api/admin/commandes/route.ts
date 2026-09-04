/**
 * e-pressing — API /api/admin/commandes (GET list + POST create)
 * ----------------------------------------------------------------
 * POST est désormais un ORCHESTRATEUR MINCE qui appelle la RPC
 * PostgreSQL `create_commande_atomic` (migration 038).
 *
 * RÔLE DE CETTE ROUTE (orchestrateur) :
 *   1. Authentification + autorisation (getCurrentPersonnel + hasRole)
 *   2. Parse + validation de surface du body (types + enums)
 *   3. Appel à createCommandeAtomique(params)
 *   4. Mapping du résultat RPC → réponse HTTP (statut + body)
 *
 * CE QUE LA ROUTE NE FAIT PLUS :
 *   - INSERTs séquentiels (commandes → lignes → articles → paiements)
 *   - Calcul des montants (sous-total, remise, total)
 *   - Rollback manuel (DELETE cascade)
 *   - Lookup des services / catalogue / tarifs
 *   - Retry loop sur collision numero_commande (géré par le trigger DB)
 *
 * Toute cette logique vit dans la RPC SQL, qui s'exécute en UNE
 * transaction atomique. Si une étape échoue → ROLLBACK automatique
 * de tout (commande, lignes, articles, paiement, audit). La commande
 * est soit entièrement créée, soit totalement absente.
 *
 * 1) GET /api/admin/commandes
 *    Liste paginée des commandes du pressing connecté, avec recherche
 *    textuelle (numero_commande OU nom du client) et filtres par statut /
 *    statut_paiement. Réponse :
 *      { success, data, total, page, pageSize, totalPages }
 *
 * 2) POST /api/admin/commandes
 *    Crée une commande complète en appelant la RPC atomique. Réponse :
 *      { success: true, data: { id, pressing_id, numero_commande,
 *        montant_total, montant_paye, statut, statut_paiement,
 *        priorite, date_pret_prevue, date_retrait } }
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`
 *     isole par pressing_id.
 *   - pressing_id dérivé du personnel connecté (jamais trusté du client).
 *   - Auth : n'importe quel personnel actif du pressing.
 *   - 401 si non authentifié, 403 si personnel inactif/non trouvé.
 *   - Aucune donnée financière frontend n'est trustée : la RPC
 *     recalcule les montants à partir de services.prix / tarifs_articles.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  CAN_CREATE_COMMANDES,
  getCurrentPersonnel,
  hasRole,
  isPersonnelActive,
} from "@/lib/auth/roles";
import { getPressingPlan, getHistoryCutoff } from "@/lib/auth/plan-gating";
import {
  createCommandeAtomique,
  codeRpcToHttpStatus,
  type ArticleInputRpc,
  type RemiseInputRpc,
  type AcompteInputRpc,
} from "@/lib/financial/create-commande";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES & VALIDATION CONSTANTS                                              */
/* -------------------------------------------------------------------------- */

const COULEUR_VALID = [
  "blanc",
  "noir",
  "bleu",
  "rouge",
  "vert",
  "jaune",
  "gris",
  "marron",
  "autre",
] as const;
type CouleurValid = (typeof COULEUR_VALID)[number];

const ETAT_VALID = ["bon", "acceptable", "use", "dechire", "tache"] as const;
type EtatValid = (typeof ETAT_VALID)[number];

const REMISE_TYPE_VALID = [
  "aucune",
  "pourcentage",
  "montant_fixe",
  "article_gratuit",
  "fidelite",
] as const;
type RemiseTypeValid = (typeof REMISE_TYPE_VALID)[number];

const METHODE_PAIEMENT_VALID = [
  "especes",
  "mobile_money",
  "carte_bancaire",
] as const;
type MethodePaiementValid = (typeof METHODE_PAIEMENT_VALID)[number];

/* -------------------------------------------------------------------------- */
/*  GET — LISTE PAGINÉE (inchangé)                                            */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const me = await getCurrentPersonnel(supabase);
  if (!me) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }
  if (!isPersonnelActive(me)) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }

  // 🚫 PLAN GATING (PRD §16) — limitation d'historique selon le plan :
  //   starter → 3 derniers mois, pro → 12 derniers mois, business → illimité.
  const plan = await getPressingPlan(supabase, me.pressing_id);
  const historyCutoff = getHistoryCutoff(plan);

  // Paramètres de requête
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const statut = sp.get("statut") || "";
  const statutPaiement = sp.get("statut_paiement") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(sp.get("pageSize") || "20", 10))
  );

  // Étape 1 : si `q` est fourni, on récupère d'abord les client_ids
  // correspondants (recherche sur nom_complet). Puis on filtrera les
  // commandes par (numero_commande ilike q) OR (client_id in clientIds).
  let matchingClientIds: string[] | null = null;
  if (q) {
    const { data: matchingClients } = await supabase
      .from("clients")
      .select("id")
      .ilike("nom_complet", `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`);
    matchingClientIds = (matchingClients ?? []).map((c) => c.id);
  }

  // Construction de la requête de base
  let query = supabase
    .from("commandes")
    .select(
      "id, numero_commande, statut, statut_paiement, montant_total, montant_paye, date_reception, date_pret_prevue, date_livraison, livraison, adresse_livraison, frais_livraison, priorite, created_at, client:clients(id, nom_complet, telephone)",
      { count: "exact" }
    );

  // Filtre statut
  if (statut) {
    query = query.eq("statut", statut);
  }
  // Filtre statut_paiement
  if (statutPaiement) {
    query = query.eq("statut_paiement", statutPaiement);
  }

  // 🚫 PLAN GATING (PRD §16) — limitation d'historique selon le plan.
  // Les commandes créées avant `historyCutoff` ne sont pas visibles pour
  // les plans Starter (3 mois) et Pro (12 mois). Business = illimité.
  if (historyCutoff) {
    query = query.gte("created_at", historyCutoff);
  }

  // Filtre `q` : OR sur numero_commande OU client_id IN matchingClientIds
  if (q) {
    const safeQ = q
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_")
      .replace(/,/g, "");
    if (matchingClientIds && matchingClientIds.length > 0) {
      // OR : numero_commande ilike q OR client_id in (...)
      const inList = matchingClientIds.join(",");
      query = query.or(
        `numero_commande.ilike.%${safeQ}%,client_id.in.(${inList})`
      );
    } else if (matchingClientIds && matchingClientIds.length === 0) {
      // Aucun client ne correspond → on ne filtre que sur numero_commande
      query = query.ilike("numero_commande", `%${safeQ}%`);
    }
  }

  // Tri + pagination
  query = query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data: commandes, error: cmdErr, count } = await query;

  if (cmdErr) {
    console.error("[api/admin/commandes] Erreur SELECT:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des commandes" },
      { status: 500 }
    );
  }

  const total = count ?? 0;
  return NextResponse.json({
    success: true,
    data: commandes ?? [],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

/* -------------------------------------------------------------------------- */
/*  POST — CRÉATION ATOMIQUE via RPC PostgreSQL (orchestrateur mince)         */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  // ---------- 1. Auth + autorisation ----------
  const supabase = await getSupabaseServer();
  const me = await getCurrentPersonnel(supabase);
  if (!me) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }
  if (!isPersonnelActive(me)) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }
  // Rôles autorisés à créer une commande (manager, réceptionniste)
  if (!hasRole(me, CAN_CREATE_COMMANDES)) {
    return NextResponse.json(
      {
        success: false,
        error: "Accès refusé — rôle insuffisant pour créer une commande",
      },
      { status: 403 }
    );
  }

  const personnelId = me.id;
  const pressingId = me.pressing_id;

  // ---------- 2. Récupère l'auth.users.id pour audit_log.user_id ----------
  // (effectué tôt car le résultat est passé à la RPC ; best-effort)
  let authUserId: string | null = null;
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    authUserId = authUser?.id ?? null;
  } catch {
    authUserId = null;
  }

  // ---------- 3. Parse + validation de surface du body ----------
  // La validation financière (calcul des montants, lookup tarifs, etc.)
  // est déléguée à la RPC SQL — le serveur reste l'unique autorité.
  // Ici on valide uniquement le SHAPE du payload (types, enums, présence).
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const clientId =
    typeof body.client_id === "string" ? body.client_id.trim() : "";
  if (!clientId) {
    return NextResponse.json(
      { success: false, error: "client_id est requis" },
      { status: 400 }
    );
  }

  const datePretPrevue =
    typeof body.date_pret_prevue === "string" && body.date_pret_prevue.trim()
      ? body.date_pret_prevue.trim()
      : "";
  if (!datePretPrevue) {
    return NextResponse.json(
      { success: false, error: "date_pret_prevue est requis (ISO date)" },
      { status: 400 }
    );
  }
  // Validation défensive : date_pret_prevue doit être une date ISO parsable.
  const datePretParsed = new Date(datePretPrevue);
  if (Number.isNaN(datePretParsed.getTime())) {
    return NextResponse.json(
      {
        success: false,
        error: "date_pret_prevue doit être une date ISO valide",
      },
      { status: 400 }
    );
  }

  // Notes ≤ 2000 caractères (la RPC vérifie aussi, mais on échoue tôt
  // pour renvoyer un message plus actionnable).
  if (
    typeof body.notes === "string" &&
    body.notes.trim().length > 2000
  ) {
    return NextResponse.json(
      {
        success: false,
        code: "NOTES_TOO_LONG",
        error: "Les notes ne peuvent pas dépasser 2000 caractères.",
      },
      { status: 400 }
    );
  }
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;

  // Priorité (optionnelle, défaut 'normal')
  const prioriteRaw =
    typeof body.priorite === "string" ? body.priorite.trim() : "";
  const priorite: "normal" | "express" =
    prioriteRaw === "express" ? "express" : "normal";

  // Idempotence key (optionnelle)
  let idempotenceKey: string | null = null;
  if (typeof body.idempotence_key === "string" && body.idempotence_key.trim()) {
    idempotenceKey = body.idempotence_key.trim().slice(0, 100);
  }

  // ---------- 3b. Validation articles (shape + enums) ----------
  const rawArticles = Array.isArray(body.articles) ? body.articles : [];
  if (rawArticles.length === 0) {
    return NextResponse.json(
      { success: false, error: "Au moins un article est requis" },
      { status: 400 }
    );
  }

  const articles: ArticleInputRpc[] = [];
  for (let i = 0; i < rawArticles.length; i++) {
    const a = rawArticles[i] as Record<string, unknown>;
    if (!a || typeof a !== "object") {
      return NextResponse.json(
        { success: false, error: `Article ${i + 1} invalide` },
        { status: 400 }
      );
    }
    const serviceId =
      typeof a.service_id === "string" ? a.service_id.trim() : "";
    if (!serviceId) {
      return NextResponse.json(
        {
          success: false,
          error: `Article ${i + 1} : service_id est requis`,
        },
        { status: 400 }
      );
    }
    const catalogueArticleId =
      typeof a.catalogue_article_id === "string"
        ? a.catalogue_article_id.trim()
        : "";
    // catalogue_article_id est OPTIONNEL (colonne nullable en DB).
    // Si non fourni, la RPC utilisera services.prix comme fallback.
    const catalogueArticleNom =
      typeof a.catalogue_article_nom === "string"
        ? a.catalogue_article_nom.trim()
        : "";
    // catalogue_article_nom optionnel aussi (fallback sur nom du service côté RPC)
    const couleur = a.couleur;
    // Validation couleur : si absente/invalid, fallback sur 'autre'
    let couleurValid: string = couleur && typeof couleur === "string" && (COULEUR_VALID as readonly string[]).includes(couleur) ? couleur : "autre";
    let couleurLibre: string | null = null;
    if (typeof a.couleur_libre === "string" && a.couleur_libre.trim()) {
      couleurLibre = a.couleur_libre.trim().slice(0, 100);
    }
    // couleur_libre non requis si couleur=autre (le fallback 'autre' sans couleur_libre est valide)
    const etat = a.etat;
    // Validation etat : si absent/invalid, fallback sur 'bon'
    const etatValid: string = etat && typeof etat === "string" && (ETAT_VALID as readonly string[]).includes(etat) ? etat : "bon";
    const quantite =
      typeof a.quantite === "number" &&
      Number.isFinite(a.quantite) &&
      Number.isInteger(a.quantite) &&
      a.quantite >= 1
        ? a.quantite
        : 0;
    if (quantite < 1) {
      return NextResponse.json(
        {
          success: false,
          error: `Article ${i + 1} : quantite doit être un entier >= 1`,
        },
        { status: 400 }
      );
    }
    const descriptionEtat =
      typeof a.description_etat === "string" && a.description_etat.trim()
        ? a.description_etat.trim().slice(0, 500)
        : null;

    // Article personnalisé : prix_unitaire est requis et doit être ≥ 0.
    const isCustom = a.is_custom === true;
    let prixUnitaireCustom: number | undefined;
    if (isCustom) {
      const p =
        typeof a.prix_unitaire === "number"
          ? a.prix_unitaire
          : parseInt(String(a.prix_unitaire ?? "0"), 10);
      if (Number.isNaN(p) || p < 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Article ${i + 1} : prix_unitaire invalide (entier ≥ 0 FCFA requis pour un article personnalisé)`,
          },
          { status: 400 }
        );
      }
      prixUnitaireCustom = Math.trunc(p);
    }

    articles.push({
      service_id: serviceId,
      catalogue_article_id: catalogueArticleId || undefined,
      catalogue_article_nom: catalogueArticleNom || undefined,
      couleur: couleurValid as CouleurValid,
      couleur_libre: couleurLibre,
      etat: etatValid as EtatValid,
      description_etat: descriptionEtat,
      quantite,
      is_custom: isCustom || undefined,
      prix_unitaire: prixUnitaireCustom,
    });
  }

  // ---------- 3c. Validation remise (shape) ----------
  let remise: RemiseInputRpc | null = null;
  if (body.remise !== null && body.remise !== undefined) {
    const r = body.remise as Record<string, unknown>;
    if (!r || typeof r !== "object") {
      return NextResponse.json(
        { success: false, error: "remise doit être un objet ou null" },
        { status: 400 }
      );
    }
    const rType = r.type;
    if (
      typeof rType !== "string" ||
      !(REMISE_TYPE_VALID as readonly string[]).includes(rType)
    ) {
      return NextResponse.json(
        { success: false, error: "remise.type invalide" },
        { status: 400 }
      );
    }
    const rValeur =
      typeof r.valeur === "number" &&
      Number.isFinite(r.valeur) &&
      Number.isInteger(r.valeur) &&
      r.valeur >= 0
        ? r.valeur
        : NaN;
    if (Number.isNaN(rValeur)) {
      return NextResponse.json(
        { success: false, error: "remise.valeur doit être un entier >= 0" },
        { status: 400 }
      );
    }
    remise = { type: rType as RemiseTypeValid, valeur: rValeur };
  }

  // ---------- 3d. Validation acompte (shape) ----------
  let acompte: AcompteInputRpc | null = null;
  if (body.acompte !== null && body.acompte !== undefined) {
    const ac = body.acompte as Record<string, unknown>;
    if (!ac || typeof ac !== "object") {
      return NextResponse.json(
        { success: false, error: "acompte doit être un objet ou null" },
        { status: 400 }
      );
    }
    const acMontant =
      typeof ac.montant === "number" &&
      Number.isFinite(ac.montant) &&
      Number.isInteger(ac.montant) &&
      ac.montant > 0
        ? ac.montant
        : NaN;
    if (Number.isNaN(acMontant)) {
      return NextResponse.json(
        {
          success: false,
          error: "acompte.montant doit être un entier > 0",
        },
        { status: 400 }
      );
    }
    const acMethode = ac.methode;
    if (
      typeof acMethode !== "string" ||
      !(METHODE_PAIEMENT_VALID as readonly string[]).includes(acMethode)
    ) {
      return NextResponse.json(
        { success: false, error: "acompte.methode invalide" },
        { status: 400 }
      );
    }
    const acReference =
      typeof ac.reference === "string" && ac.reference.trim()
        ? ac.reference.trim().slice(0, 200)
        : null;
    acompte = {
      montant: acMontant,
      methode: acMethode as MethodePaiementValid,
      reference: acReference ?? undefined,
    };
  }

  // ---------- 4. Extraction IP + user-agent pour audit_log ----------
  const ipAddress = extractIpAddress(request);
  const userAgent = request.headers.get("user-agent");

  // ---------- 5. Appel à la RPC atomique ----------
  // Toute la logique métier (lookup services/catalogue/tarifs, calcul
  // montants, INSERTs, audit) s'exécute en une transaction SQL.
  // En cas d'erreur à n'importe quelle étape → ROLLBACK automatique.
  const result = await createCommandeAtomique({
    pressing_id: pressingId,
    user_id: authUserId,
    personnel_id: personnelId,
    role: me.role,
    client_id: clientId,
    date_pret_prevue: datePretPrevue,
    notes,
    priorite,
    idempotence_key: idempotenceKey,
    articles,
    remise,
    acompte,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  // ---------- 6. Mapping du résultat RPC → réponse HTTP ----------
  if (!result.success) {
    const status = codeRpcToHttpStatus(result.code);
    // Sécurité (audit #8) : masque les messages DB bruts pour les 500.
    const isClientError = status >= 400 && status < 500;
    const responseBody: Record<string, unknown> = {
      success: false,
      code: result.code,
    };
    if (isClientError) {
      // Messages métier actionnables (peuvent être affichés au client).
      responseBody.error = result.error || "Requête invalide.";
      if (result.details) responseBody.details = result.details;
    } else {
      // Erreur serveur — message générique, log complet côté serveur.
      console.error(
        "[api/admin/commandes] RPC create_commande_atomic a échoué:",
        result.code,
        result.error,
        result.details
      );
      responseBody.error = "Erreur interne du serveur";
    }
    return NextResponse.json(responseBody, { status });
  }

  // ---------- 7. Succès : 201 (création) ou 200 (replay idempotent) ----------
  const status = result.code === "IDEMPOTENT_REPLAY" ? 200 : 201;
  return NextResponse.json(
    {
      success: true,
      data: result.data,
    },
    { status }
  );
}

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Extrait l'adresse IP du client depuis une NextRequest.
 *
 * Priorité : X-Forwarded-For (proxy/Vercel) > x-real-ip > fallback null.
 * Pour X-Forwarded-For, on prend le premier IP de la liste (client original).
 */
function extractIpAddress(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}
