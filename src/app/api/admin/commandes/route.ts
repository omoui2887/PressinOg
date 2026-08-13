/**
 * e-pressing — API /api/admin/commandes (GET list + POST create)
 * ----------------------------------------------------------------
 * LOT 7 — fondations du wizard POS. Deux endpoints :
 *
 * 1) GET /api/admin/commandes
 *    Liste paginée des commandes du pressing connecté, avec recherche
 *    textuelle (numero_commande OU nom du client) et filtres par statut /
 *    statut_paiement. Réponse :
 *      { success, data, total, page, pageSize, totalPages }
 *
 * 2) POST /api/admin/commandes
 *    Crée une commande complète en une seule requête : articles (lignes +
 *    articles_vetements individuels par QR), remise optionnelle, acompte
 *    optionnel. Inserts séquentiels avec rollback manuel (DELETE cascade)
 *    en cas d'erreur à n'importe quelle étape. Réponse :
 *      { success: true, data: { id, pressing_id, numero_commande,
 *        montant_total, montant_paye, statut, statut_paiement } }
 *    `pressing_id` est renvoyé pour permettre au wizard (Étape 4) de
 *    générer le QR Code sans refetch.
 *
 * Format du numero_commande : CMD-YYYYMMDD-XXXXXX où XXXXXX = 6 chiffres
 * aléatoires (900 000 combinaisons/jour). Un retry loop (5 tentatives)
 * gère les collisions sur la contrainte UNIQUE en régénérant le numéro.
 *
 * Idempotence (#15) : si le client fournit un `idempotence_key`, on
 * vérifie d'abord qu'aucune commande n'existe déjà pour ce
 * (pressing_id, idempotence_key). Si oui → on renvoie la commande
 * existante (200) sans recréer. Sinon → création normale avec la clé.
 *
 * Priorité express (#2) : un champ optionnel `priorite` ('normal' | 'express')
 * est stocké sur la commande pour le MVP express.
 *
 * Date de retrait (#8) : calculée automatiquement côté serveur comme
 *   date_pret_prevue + 7 jours (commandes normales) OU + 3 jours (commandes
 *   'express'). Stockée dans `commandes.date_retrait` (TIMESTAMPTZ nullable,
 *   cf. migration 002_tables.sql ligne 258). Le client n'a PAS la main sur
 *   cette date — c'est le serveur qui la calcule pour garantir la cohérence.
 *   Le client peut l'afficher après réception de la commande créée.
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`
 *     isole par pressing_id.
 *   - pressing_id dérivé du personnel connecté (jamais trusté du client).
 *   - Auth : n'importe quel personnel actif du pressing.
 *   - 401 si non authentifié, 403 si personnel inactif/non trouvé.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  CAN_CREATE_COMMANDES,
  getCurrentPersonnel,
  hasRole,
  isPersonnelActive,
} from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import {
  isPostgrestSchemaCacheError,
  reloadPostgrestSchema,
} from "@/lib/supabase/reload-schema";

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

interface ArticleInput {
  service_id: string;
  /** FK vers catalogue_articles.id (LOT 15 — remplace type_vetement). */
  catalogue_article_id: string;
  /** Nom du catalogue (snapshot client, utilisé pour la description lisible). */
  catalogue_article_nom: string;
  couleur: CouleurValid;
  couleur_libre?: string;
  etat: EtatValid;
  description_etat?: string;
  quantite: number;
}

interface RemiseInput {
  type: RemiseTypeValid;
  valeur: number;
}

interface AcompteInput {
  montant: number;
  methode: MethodePaiementValid;
  reference?: string;
}

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Génère un numero_commande au format CMD-YYYYMMDD-XXXXXX (6 chiffres aléatoires).
 * La combinaison date + 6 chiffres aléatoires offre 900 000 codes possibles par
 * jour, ce qui rend la probabilité de collision négligeable. En cas de collision
 * malgré tout (UNIQUE constraint), l'appelant doit réessayer en régénérant le
 * numéro — voir la boucle de retry dans le POST (Step 9).
 */
function generateNumeroCommande(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const rand = String(Math.floor(100000 + Math.random() * 900000)); // 100000-999999
  return `CMD-${y}${m}${d}-${rand}`;
}

/**
 * Détecte si une erreur Supabase/PostgREST correspond à une violation de
 * contrainte UNIQUE (code SQLSTATE 23505). Utilisé pour décider si l'on
 * doit régénérer le numero_commande et réessayer l'INSERT.
 */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "23505") return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("unique") ||
    msg.includes("duplicate") ||
    msg.includes("déjà") ||
    msg.includes("existe déjà")
  );
}

/**
 * Rollback manuel : supprime une commande et tout ce qui y est rattaché
 * (articles_vetements, commande_lignes, paiements). Utilisé en cas d'erreur
 * pendant la création séquentielle.
 */
async function rollbackCommande(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  commandeId: string
): Promise<void> {
  try {
    await supabase
      .from("paiements")
      .delete()
      .eq("commande_id", commandeId);
  } catch {
    /* ignore */
  }
  try {
    await supabase
      .from("articles_vetements")
      .delete()
      .eq("commande_id", commandeId);
  } catch {
    /* ignore */
  }
  try {
    await supabase
      .from("commande_lignes")
      .delete()
      .eq("commande_id", commandeId);
  } catch {
    /* ignore */
  }
  try {
    await supabase.from("commandes").delete().eq("id", commandeId);
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/*  GET — LISTE PAGINÉE                                                        */
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
/*  POST — CRÉATION COMPLÈTE (commande + lignes + articles + acompte)         */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
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
  // Rôles autorisés à créer une commande (manager, réceptionniste, caissier, comptable)
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

  // ---------- 1. Parse + validate body ----------
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
  // On n'utilise PAS cette valeur directement pour les timestamp serveur —
  // c'est une date métier fournie par le client (le réceptionniste choisit
  // la date prévue de prêt dans le wizard). On vérifie juste qu'elle est
  // parsable pour pouvoir calculer date_retrait ci-dessous.
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

  // AUDIT #19 + migration 031 — Validation notes (≤ 2000 caractères).
  // Sans ce check, un `notes` > 2000 chars déclencherait une 23514
  // (check_violation) sur le CHECK `check_notes_max_length` (migration 031)
  // → 500 générique côté client. On renvoie un 400 propre à la place.
  //
  // NB : le schéma Zod canonique `createCommandeSchema` (P4-C) possède
  // `notes: z.string().max(2000).optional()`. On extrait uniquement cette
  // contrainte ici pour ne pas perturber les validations métier existantes
  // (client_id, articles, services, etc.) qui renvoient des messages
  // spécifiques et plus actionnables pour l'utilisateur.
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

  // #2 — Priorité (optionnelle, défaut 'normal'). Valide : 'normal' | 'express'.
  const prioriteRaw =
    typeof body.priorite === "string" ? body.priorite.trim() : "";
  const priorite: "normal" | "express" =
    prioriteRaw === "express" ? "express" : "normal";

  // #8 — Date de retrait calculée côté serveur (le client ne fournit PAS cette
  // date — c'est le serveur qui la calcule à partir de date_pret_prevue + un
  // délai selon la priorité). Délai par défaut : 7 jours pour les commandes
  // normales (le client a une semaine pour récupérer ses vêtements après la
  // date prévue de prêt). Pour les commandes 'express', on raccourcit à 3
  // jours (le client express attend une livraison rapide → retrait rapide).
  // Stockée dans `commandes.date_retrait` (TIMESTAMPTZ, nullable — migration
  // 002_tables.sql ligne 258). Configurable plus tard via une table de params.
  const RETRAIT_DELAY_NORMAL_MS = 7 * 24 * 60 * 60 * 1000; // +7 jours
  const RETRAIT_DELAY_EXPRESS_MS = 3 * 24 * 60 * 60 * 1000; // +3 jours
  const retraitDelayMs =
    priorite === "express"
      ? RETRAIT_DELAY_EXPRESS_MS
      : RETRAIT_DELAY_NORMAL_MS;
  const dateRetraitIso = new Date(
    datePretParsed.getTime() + retraitDelayMs
  ).toISOString();

  // #15 — Idempotence key (optionnelle). Si fournie, on vérifiera plus loin
  // si une commande existe déjà pour ce (pressing_id, key) afin de renvoyer
  // la commande existante au lieu d'en créer une nouvelle (idempotent replay).
  let idempotenceKey: string | null = null;
  if (typeof body.idempotence_key === "string" && body.idempotence_key.trim()) {
    idempotenceKey = body.idempotence_key.trim().slice(0, 100);
  }

  // #15 — Idempotent replay : si une clé est fournie, vérifie si une commande
  // existe déjà pour ce (pressing_id, idempotence_key). Si oui, on renvoie
  // cette commande avec un statut 200 (au lieu de 201) pour indiquer que la
  // commande a été créée lors d'une requête précédente. Cela protège contre
  // les doublons en cas de retry réseau ou double-clic côté client.
  if (idempotenceKey) {
    const { data: existingCmd, error: existingErr } = await supabase
      .from("commandes")
      .select(
        "id, pressing_id, numero_commande, montant_total, montant_paye, statut, statut_paiement"
      )
      .eq("pressing_id", pressingId)
      .eq("idempotence_key", idempotenceKey)
      .maybeSingle();
    if (existingErr) {
      console.error(
        "[api/admin/commandes] Erreur SELECT idempotence lookup:",
        existingErr
      );
      // Sécurité (audit #8) : masque le message Supabase au client.
      return NextResponse.json(
        { success: false, error: "Erreur interne du serveur" },
        { status: 500 }
      );
    }
    if (existingCmd) {
      // Replay idempotent : même payload réponse qu'un 201, mais code 200.
      return NextResponse.json(
        { success: true, data: existingCmd },
        { status: 200 }
      );
    }
    // Sinon, on continue normalement avec la création.
  }

  // Validation des articles
  const rawArticles = Array.isArray(body.articles) ? body.articles : [];
  if (rawArticles.length === 0) {
    return NextResponse.json(
      { success: false, error: "Au moins un article est requis" },
      { status: 400 }
    );
  }

  const articles: ArticleInput[] = [];
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
    if (!catalogueArticleId) {
      return NextResponse.json(
        {
          success: false,
          error: `Article ${i + 1} : catalogue_article_id est requis`,
        },
        { status: 400 }
      );
    }
    const catalogueArticleNom =
      typeof a.catalogue_article_nom === "string"
        ? a.catalogue_article_nom.trim()
        : "";
    if (!catalogueArticleNom) {
      return NextResponse.json(
        {
          success: false,
          error: `Article ${i + 1} : catalogue_article_nom est requis`,
        },
        { status: 400 }
      );
    }
    const couleur = a.couleur;
    if (
      typeof couleur !== "string" ||
      !(COULEUR_VALID as readonly string[]).includes(couleur)
    ) {
      return NextResponse.json(
        { success: false, error: `Article ${i + 1} : couleur invalide` },
        { status: 400 }
      );
    }
    let couleurLibre: string | null = null;
    if (typeof a.couleur_libre === "string" && a.couleur_libre.trim()) {
      couleurLibre = a.couleur_libre.trim().slice(0, 100);
    }
    if (couleur === "autre" && !couleurLibre) {
      return NextResponse.json(
        {
          success: false,
          error: `Article ${i + 1} : couleur_libre est requis quand couleur='autre'`,
        },
        { status: 400 }
      );
    }
    const etat = a.etat;
    if (
      typeof etat !== "string" ||
      !(ETAT_VALID as readonly string[]).includes(etat)
    ) {
      return NextResponse.json(
        { success: false, error: `Article ${i + 1} : etat invalide` },
        { status: 400 }
      );
    }
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

    articles.push({
      service_id: serviceId,
      catalogue_article_id: catalogueArticleId,
      catalogue_article_nom: catalogueArticleNom,
      couleur: couleur as CouleurValid,
      couleur_libre: couleurLibre ?? undefined,
      etat: etat as EtatValid,
      description_etat: descriptionEtat ?? undefined,
      quantite,
    });
  }

  // Validation remise (optionnelle)
  let remise: RemiseInput | null = null;
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

  // Validation acompte (optionnel)
  let acompte: AcompteInput | null = null;
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

  // ---------- 2. Vérifie que le client appartient au pressing ----------
  const { data: clientRow } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (!clientRow) {
    return NextResponse.json(
      { success: false, error: "Client introuvable dans votre pressing" },
      { status: 404 }
    );
  }

  // ---------- 3. Fetch services pour les articles (verify actif + pressing) ----------
  const serviceIds = Array.from(new Set(articles.map((a) => a.service_id)));
  const { data: services, error: servicesErr } = await supabase
    .from("services")
    .select("id, type, prix, actif")
    .in("id", serviceIds);

  if (servicesErr) {
    console.error(
      "[api/admin/commandes] Erreur SELECT services:",
      servicesErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la vérification des services" },
      { status: 500 }
    );
  }

  const serviceMap = new Map<
    string,
    { type: string; prix: number; actif: boolean }
  >();
  for (const s of services ?? []) {
    serviceMap.set(s.id, { type: s.type, prix: s.prix, actif: s.actif });
  }

  // Vérifie que tous les services existent + sont actifs
  for (let i = 0; i < articles.length; i++) {
    const svc = serviceMap.get(articles[i].service_id);
    if (!svc) {
      return NextResponse.json(
        {
          success: false,
          error: `Article ${i + 1} : service introuvable dans votre pressing`,
        },
        { status: 400 }
      );
    }
    if (!svc.actif) {
      return NextResponse.json(
        {
          success: false,
          error: `Article ${i + 1} : service inactif, impossible de l'utiliser`,
        },
        { status: 400 }
      );
    }
  }

  // ---------- 3b. Vérifie que tous les catalogue_article_id existent + actifs ----------
  // LOT 15 : valide les FK vers catalogue_articles pour éviter d'insérer des
  // références orphelines. Le catalogue est global (pas de pressing_id).
  const catalogueIds = Array.from(
    new Set(articles.map((a) => a.catalogue_article_id))
  );
  const { data: catalogueRows, error: catalogueErr } = await supabase
    .from("catalogue_articles")
    .select("id, nom, actif")
    .in("id", catalogueIds);

  if (catalogueErr) {
    console.error(
      "[api/admin/commandes] Erreur SELECT catalogue_articles:",
      catalogueErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la vérification du catalogue" },
      { status: 500 }
    );
  }

  const catalogueMap = new Map<
    string,
    { nom: string; actif: boolean }
  >();
  for (const c of catalogueRows ?? []) {
    catalogueMap.set(c.id, { nom: c.nom, actif: c.actif });
  }
  for (let i = 0; i < articles.length; i++) {
    const cat = catalogueMap.get(articles[i].catalogue_article_id);
    if (!cat) {
      return NextResponse.json(
        {
          success: false,
          error: `Article ${i + 1} : article du catalogue introuvable`,
        },
        { status: 400 }
      );
    }
    if (!cat.actif) {
      return NextResponse.json(
        {
          success: false,
          error: `Article ${i + 1} : article du catalogue inactif, impossible de l'utiliser`,
        },
        { status: 400 }
      );
    }
    // Le nom vérifié côté serveur prime sur le snapshot client (sécurité).
    articles[i].catalogue_article_nom = cat.nom;
  }

  // ---------- 3c. Fetch tarifs spécifiques par article (override prix service) ----------
  // Pour chaque couple (catalogue_article_id × type_service) présent dans la
  // commande, on cherche un tarif spécifique dans tarifs_articles. Si présent,
  // son prix remplace service.prix pour le calcul du montant_total et l'INSERT
  // de commande_lignes.prix_unitaire. Sinon, fallback sur service.prix.
  const tarifKeys = new Set<string>();
  for (const a of articles) {
    const svc = serviceMap.get(a.service_id);
    if (svc) {
      tarifKeys.add(`${a.catalogue_article_id}::${svc.type}`);
    }
  }
  const tarifByArticleType = new Map<string, number>();
  if (tarifKeys.size > 0) {
    const catalogueArticleIds = Array.from(
      new Set(articles.map((a) => a.catalogue_article_id))
    );
    const { data: tarifs, error: tarifsErr } = await supabase
      .from("tarifs_articles")
      .select("catalogue_article_id, type_service, prix, actif")
      .eq("pressing_id", pressingId)
      .in("catalogue_article_id", catalogueArticleIds);
    if (tarifsErr) {
      console.error(
        "[api/admin/commandes] Erreur SELECT tarifs_articles:",
        tarifsErr
      );
      // Non-bloquant : on fallback sur service.prix si tarifs injoignables.
    } else if (tarifs) {
      for (const t of tarifs) {
        if (t.actif === false) continue;
        tarifByArticleType.set(
          `${t.catalogue_article_id}::${t.type_service}`,
          t.prix
        );
      }
    }
  }

  /**
   * Résout le prix unitaire d'un article : tarif spécifique si configuré,
   * sinon fallback sur service.prix. Garantit que le prix facturé correspond
   * toujours à ce que l'utilisateur a vu dans le POS (data.ts applique la
   * même logique côté client).
   */
  function resolvePrixUnitaire(
    catalogueArticleId: string,
    serviceId: string
  ): number {
    const svc = serviceMap.get(serviceId);
    if (!svc) return 0;
    const tarifPrix = tarifByArticleType.get(
      `${catalogueArticleId}::${svc.type}`
    );
    return Math.trunc(tarifPrix ?? svc.prix ?? 0);
  }

  // ---------- 4. Calcul montant_total_avant_remise ----------
  const montantTotalAvantRemise = articles.reduce(
    (sum, a) =>
      sum + resolvePrixUnitaire(a.catalogue_article_id, a.service_id) * a.quantite,
    0
  );

  // ---------- 5. Calcul montant_remise ----------
  let montantRemise = 0;
  let remiseType: RemiseTypeValid = "aucune";
  let remiseValeur = 0;

  if (remise && remise.type !== "aucune") {
    remiseType = remise.type;
    remiseValeur = remise.valeur;

    switch (remise.type) {
      case "pourcentage":
      case "fidelite": {
        // valeur = % (0-100)
        const pct = Math.max(0, Math.min(100, remise.valeur));
        montantRemise = Math.round((montantTotalAvantRemise * pct) / 100);
        break;
      }
      case "montant_fixe": {
        montantRemise = Math.min(remise.valeur, montantTotalAvantRemise);
        break;
      }
      case "article_gratuit": {
        // valeur = index (0-based) de l'article offert
        const idx = remise.valeur;
        if (idx < 0 || idx >= articles.length) {
          return NextResponse.json(
            {
              success: false,
              error: `remise.valeur (article_gratuit) hors limites : index ${idx} invalide pour ${articles.length} article(s)`,
            },
            { status: 400 }
          );
        }
        const freeArticle = articles[idx];
        // Fix (FIX-WAVE1-A #1) : on doit utiliser le prix résolu (tarif override
        // si configuré, sinon service.prix) pour rester cohérent avec le prix
        // réellement facturé au client. Sinon, si un tarif override inférieur
        // à service.prix est configuré, la remise "article offert" serait
        // calculée sur service.prix (trop élevé) et la commande pourrait être
        // gratuite à tort (montant_total = 0).
        montantRemise =
          resolvePrixUnitaire(
            freeArticle.catalogue_article_id,
            freeArticle.service_id
          ) * freeArticle.quantite;
        break;
      }
      default:
        montantRemise = 0;
        break;
    }
  }

  // ---------- 6. montant_total ----------
  const montantTotal = Math.max(0, montantTotalAvantRemise - montantRemise);

  // ---------- 7. Validation acompte <= montant_total ----------
  if (acompte && acompte.montant > montantTotal) {
    return NextResponse.json(
      {
        success: false,
        error: `acompte.montant (${acompte.montant}) ne peut pas dépasser le montant_total (${montantTotal})`,
      },
      { status: 400 }
    );
  }

  // ---------- 8. Détermine statut_paiement + montant_paye ----------
  const montantPaye = acompte?.montant ?? 0;
  let statutPaiement: "non_paye" | "partiel" | "paye";
  if (!acompte) {
    statutPaiement = "non_paye";
  } else if (acompte.montant >= montantTotal) {
    statutPaiement = "paye";
  } else {
    statutPaiement = "partiel";
  }

  // ---------- 9. INSERT commande (avec retry sur collision numero_commande) ----------
  // #1 — La colonne `numero_commande` est UNIQUE. Le format CMD-YYYYMMDD-XXXXXX
  // (6 chiffres aléatoires) rend la collision très improbable, mais on gère
  // quand même le cas en régénérant le numéro et en réessayant jusqu'à 5 fois.
  // On vérifie le code d'erreur PostgREST 23505 (unique_violation) ou un
  // message contenant "unique" / "duplicate" / "déjà".
  interface NewCommandeRow {
    id: string;
    numero_commande: string;
    montant_total: number;
    montant_paye: number;
    statut: string;
    statut_paiement: string;
  }
  const nowIso = new Date().toISOString();
  const MAX_NUMERO_RETRIES = 5;
  let newCommande: NewCommandeRow | null = null;
  let lastInsertCmdErr: unknown = null;
  // Track si on a déjà tenté un reload du cache PostgREST (pour éviter les
  // loops infinies : on reload au max une fois sur l'ensemble des retries).
  let schemaReloaded = false;

  for (let attempt = 1; attempt <= MAX_NUMERO_RETRIES; attempt++) {
    const numeroCommande = generateNumeroCommande();
    const { data: inserted, error: insertErr } = await supabase
      .from("commandes")
      .insert({
        pressing_id: pressingId,
        client_id: clientId,
        numero_commande: numeroCommande,
        statut: "recu",
        statut_paiement: statutPaiement,
        montant_total: montantTotal,
        montant_paye: montantPaye,
        remise_type: remiseType,
        remise_valeur: remiseType === "aucune" ? 0 : remiseValeur,
        montant_total_avant_remise: montantTotalAvantRemise,
        montant_remise: montantRemise,
        // #12 — Server-side timestamp (UTC) — could also rely on DB DEFAULT NOW()
        // (la colonne date_reception a DEFAULT NOW() dans 002_tables.sql:254).
        // On garde la valeur explicite pour compatibilité avec l'existant et
        // pour que le timestamp soit cohérent avec `nowIso` utilisé pour
        // l'acompte (paiements.date_paiement) ci-dessous.
        date_reception: nowIso,
        date_pret_prevue: datePretPrevue,
        // #8 — date_retrait calculée côté serveur (+7j normal, +3j express).
        // Voir calcul + haut dans le handler.
        date_retrait: dateRetraitIso,
        livraison: false,
        frais_livraison: 0,
        notes: notes,
        priorite: priorite,
        // #15 — idempotence_key : incluse uniquement si non-null pour éviter
        // PGRST204 si la colonne n'existe pas encore en base (migration 024
        // non appliquée). Si la clé est null, l'omet du payload → la DB
        // applique DEFAULT NULL (colonne nullable). Résilience défense-en-profondeur.
        ...(idempotenceKey ? { idempotence_key: idempotenceKey } : {}),
        cree_par: personnelId,
      })
      .select(
        "id, numero_commande, montant_total, montant_paye, statut, statut_paiement"
      )
      .single();

    if (!insertErr && inserted) {
      newCommande = inserted as NewCommandeRow;
      break;
    }

    lastInsertCmdErr = insertErr;

    // Si c'est une collision sur numero_commande, on retry avec un nouveau n°.
    if (isUniqueViolation(insertErr) && attempt < MAX_NUMERO_RETRIES) {
      console.warn(
        `[api/admin/commandes] Collision numero_commande (tentative ${attempt}/${MAX_NUMERO_RETRIES}), régénération...`,
        insertErr
      );
      continue;
    }

    // PGRST204 / 22P02 = cache PostgREST stale (ex: colonne idempotence_key
    // ou enum 'annule' pas encore dans le cache après une migration).
    // On tente un reload du cache + retry unique. Voir migration 033 +
    // src/lib/supabase/reload-schema.ts.
    if (
      !schemaReloaded &&
      isPostgrestSchemaCacheError(insertErr) &&
      attempt < MAX_NUMERO_RETRIES
    ) {
      console.warn(
        `[api/admin/commandes] Erreur cache PostgREST détectée (tentative ${attempt}/${MAX_NUMERO_RETRIES}), reload + retry...`,
        insertErr
      );
      await reloadPostgrestSchema();
      schemaReloaded = true;
      continue; // retry avec le même numero_commande (pas de collision)
    }

    // Erreur non récupérable ou nombre de tentatives épuisé : on sort.
    break;
  }

  if (!newCommande) {
    console.error(
      "[api/admin/commandes] Erreur INSERT commandes (après retries):",
      lastInsertCmdErr
    );
    // Sécurité (audit #8) : on ne renvoie pas err.message au client.
    return NextResponse.json(
      {
        success: false,
        error: "Erreur interne du serveur",
      },
      { status: 500 }
    );
  }

  const commandeId = newCommande.id;
  const numeroCommandeFinal = newCommande.numero_commande;
  const shortCommandeId = commandeId.slice(0, 8);

  // ---------- 10. INSERT lignes + articles_vetements ----------
  for (let ligneIndex = 0; ligneIndex < articles.length; ligneIndex++) {
    const article = articles[ligneIndex];
    const prixUnitaire = resolvePrixUnitaire(
      article.catalogue_article_id,
      article.service_id
    );
    const montantLigne = prixUnitaire * article.quantite;

    // Description lisible : "Costumes & Vêtements de Cérémonie blanc — bon"
    // (utilise le nom du catalogue validé côté serveur, LOT 15)
    const descParts: string[] = [
      article.catalogue_article_nom,
      article.couleur === "autre" && article.couleur_libre
        ? article.couleur_libre
        : article.couleur,
    ];
    descParts.push("—");
    descParts.push(article.etat);
    if (article.description_etat) {
      descParts.push("—");
      descParts.push(article.description_etat);
    }
    const description = descParts.join(" ");

    // LOT 15 : la colonne `type_vetement` a été renommée `type_vetement_legacy`
    // par la migration 014. On ne l'insère plus (NULL). L'info article est
    // portée par `description` (lisible) et par `catalogue_article_id` sur
    // les articles_vetements individuels (FK).
    const { data: newLigne, error: insertLigneErr } = await supabase
      .from("commande_lignes")
      .insert({
        commande_id: commandeId,
        service_id: article.service_id,
        description,
        quantite: article.quantite,
        prix_unitaire: prixUnitaire,
        montant_ligne: montantLigne,
      })
      .select("id")
      .single();

    if (insertLigneErr || !newLigne) {
      console.error(
        "[api/admin/commandes] Erreur INSERT commande_lignes:",
        insertLigneErr
      );
      await rollbackCommande(supabase, commandeId);
      // Sécurité (audit #8) : on ne renvoie pas err.message au client.
      return NextResponse.json(
        {
          success: false,
          error: "Erreur interne du serveur",
        },
        { status: 500 }
      );
    }

    const ligneId = newLigne.id as string;

    // INSERT N articles_vetements (1 par unité de quantite)
    // NB: on type en `unknown[]` pour éviter les conflits avec le fichier
    // database.types.ts (obsolète — schéma appliqué en DB plus récent).
    const articleRows: Record<string, unknown>[] = [];
    for (let i = 0; i < article.quantite; i++) {
      articleRows.push({
        commande_id: commandeId,
        ligne_id: ligneId,
        code_qr: `${shortCommandeId}-${ligneIndex}-${i}`,
        catalogue_article_id: article.catalogue_article_id,
        couleur: article.couleur,
        couleur_libre: article.couleur_libre ?? null,
        etat: article.etat,
        description_etat: article.description_etat ?? null,
        statut: "recu",
      });
    }

    const { error: insertArticlesErr } = await supabase
      .from("articles_vetements")
      .insert(articleRows as never);

    if (insertArticlesErr) {
      console.error(
        "[api/admin/commandes] Erreur INSERT articles_vetements:",
        insertArticlesErr
      );
      await rollbackCommande(supabase, commandeId);
      // Sécurité (audit #8) : on ne renvoie pas err.message au client.
      return NextResponse.json(
        {
          success: false,
          error: "Erreur interne du serveur",
        },
        { status: 500 }
      );
    }
  }

  // ---------- 11. INSERT acompte (si fourni) ----------
  if (acompte) {
    const { error: insertPaiementErr } = await supabase
      .from("paiements")
      .insert({
        commande_id: commandeId,
        montant: acompte.montant,
        methode: acompte.methode,
        reference: acompte.reference ?? null,
        // #12 — Server-side timestamp (UTC) — could also rely on DB DEFAULT NOW()
        // (la colonne date_paiement a DEFAULT NOW() dans 002_tables.sql:325).
        // On garde la valeur explicite pour cohérence avec date_reception.
        date_paiement: nowIso,
        enregistre_par: personnelId,
        est_acompte: true,
      });

    if (insertPaiementErr) {
      console.error(
        "[api/admin/commandes] Erreur INSERT paiements:",
        insertPaiementErr
      );
      await rollbackCommande(supabase, commandeId);
      // Sécurité (audit #8) : on ne renvoie pas err.message au client.
      return NextResponse.json(
        {
          success: false,
          error: "Erreur interne du serveur",
        },
        { status: 500 }
      );
    }
  }

  // ---------- 12. Réponse succès ----------
  // `pressing_id` est inclus dans la réponse pour que le client (wizard Étape 4)
  // puisse générer le QR Code sans avoir à refetch la commande. Le QR encode
  // un payload JSON `{ commande_id, numero_commande, pressing_id }` qui sera
  // utilisé par le scanner de l'application mobile / borne de retrait.
  // #8 — `date_pret_prevue` et `date_retrait` sont renvoyées pour que le
  // client puisse les afficher immédiatement (sans refetch) sur le ticket
  // et l'écran de confirmation.

  // ---------- 12b. AUDIT-B-13 — Journalisation create_commande ----------
  // Best-effort : ne bloque jamais le flux métier. logAudit catch toutes
  // les erreurs en interne (console.error) et retourne false en cas d'échec.
  //
  // Récupère l'auth.users.id pour audit_log.user_id (FK → auth.users(id)).
  // `getCurrentPersonnel` ne l'expose pas dans AuthPersonnel (seulement
  // personnel.id), on le récupère ici via getUser(). On le fait EN FIN de
  // handler pour éviter l'appel réseau sur les chemins d'erreur (400/404/500).
  let authUserId: string | null = null;
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    authUserId = authUser?.id ?? null;
  } catch {
    // Ne doit pas arriver (déjà authentifié plus haut), mais défensif.
    authUserId = null;
  }

  await logAudit({
    pressing_id: pressingId,
    user_id: authUserId,
    action: "create_commande",
    entity_type: "commande",
    entity_id: commandeId,
    after_state: {
      id: commandeId,
      pressing_id: pressingId,
      client_id: clientId,
      numero_commande: numeroCommandeFinal,
      statut: "recu",
      statut_paiement: statutPaiement,
      montant_total: montantTotal,
      montant_paye: montantPaye,
      priorite: priorite,
      date_pret_prevue: datePretPrevue,
      date_retrait: dateRetraitIso,
      notes: notes,
    },
    req: request,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        id: commandeId,
        pressing_id: pressingId,
        numero_commande: numeroCommandeFinal,
        montant_total: montantTotal,
        montant_paye: montantPaye,
        statut: "recu",
        statut_paiement: statutPaiement,
        priorite: priorite,
        date_pret_prevue: datePretPrevue,
        date_retrait: dateRetraitIso,
      },
    },
    { status: 201 }
  );
}
