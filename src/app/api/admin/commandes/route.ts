/**
 * OgPressing — API /api/admin/commandes (GET list + POST create)
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
 * Format du numero_commande : CMD-YYYYMMDD-XXXX où XXXX = 4 chiffres aléatoires.
 * Évite les race conditions d'une séquence SQL centralisée.
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
 * Génère un numero_commande au format CMD-YYYYMMDD-XXXX (4 chiffres aléatoires).
 * La combinaison date + 4 chiffres aléatoires offre 10 000 codes possibles par
 * jour, ce qui suffit largement pour un pressing. En cas de collision (UNIQUE
 * constraint), l'INSERT échouera et le client recevra une 500 — à corriger en
 * réessayant. La probabilité de collision est négligeable.
 */
function generateNumeroCommande(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const rand = String(Math.floor(1000 + Math.random() * 9000)); // 1000-9999
  return `CMD-${y}${m}${d}-${rand}`;
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
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie que l'appelant est un personnel actif
  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, actif, statut_compte")
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
      "id, numero_commande, statut, statut_paiement, montant_total, montant_paye, date_reception, date_pret_prevue, date_livraison, livraison, adresse_livraison, frais_livraison, created_at, client:clients(id, nom_complet, telephone)",
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
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie que l'appelant est un personnel actif (rôle indifférent)
  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, actif, statut_compte")
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

  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;

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
    .select("id, prix, actif")
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

  const serviceMap = new Map<string, { prix: number; actif: boolean }>();
  for (const s of services ?? []) {
    serviceMap.set(s.id, { prix: s.prix, actif: s.actif });
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

  // ---------- 4. Calcul montant_total_avant_remise ----------
  const montantTotalAvantRemise = articles.reduce(
    (sum, a) => sum + (serviceMap.get(a.service_id)?.prix ?? 0) * a.quantite,
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
        montantRemise =
          (serviceMap.get(freeArticle.service_id)?.prix ?? 0) *
          freeArticle.quantite;
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

  // ---------- 9. INSERT commande ----------
  const numeroCommande = generateNumeroCommande();
  const nowIso = new Date().toISOString();

  const { data: newCommande, error: insertCmdErr } = await supabase
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
      date_reception: nowIso,
      date_pret_prevue: datePretPrevue,
      livraison: false,
      frais_livraison: 0,
      notes: notes,
      cree_par: personnelId,
    })
    .select(
      "id, numero_commande, montant_total, montant_paye, statut, statut_paiement"
    )
    .single();

  if (insertCmdErr || !newCommande) {
    console.error(
      "[api/admin/commandes] Erreur INSERT commandes:",
      insertCmdErr
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

  const commandeId = newCommande.id as string;
  const shortCommandeId = commandeId.slice(0, 8);

  // ---------- 10. INSERT lignes + articles_vetements ----------
  for (let ligneIndex = 0; ligneIndex < articles.length; ligneIndex++) {
    const article = articles[ligneIndex];
    const svc = serviceMap.get(article.service_id)!;
    const prixUnitaire = svc.prix;
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
  return NextResponse.json(
    {
      success: true,
      data: {
        id: commandeId,
        pressing_id: pressingId,
        numero_commande: numeroCommande,
        montant_total: montantTotal,
        montant_paye: montantPaye,
        statut: "recu",
        statut_paiement: statutPaiement,
      },
    },
    { status: 201 }
  );
}
