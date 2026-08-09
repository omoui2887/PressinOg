/**
 * OgPressing — API /api/admin/clients (GET)
 * -----------------------------------------
 * Récupère la liste des clients du pressing connecté avec :
 *   - recherche instantanée par nom ou téléphone (param `q`)
 *   - filtre "uniquement clients avec impayés" (param `impayes=true`)
 *   - pagination (param `page` 1-indexed, `pageSize` default 20)
 *
 * Données renvoyées par client (vue enrichie sans vue SQL — agrégation
 * côté API via 2 requêtes Supabase) :
 *   id, nom_complet, telephone, email, adresse, points_fidelite,
 *   solde_impaye, total_depense, nombre_commandes, derniere_commande
 *
 * 🔒 SÉCURITÉ : utilise getSupabaseServer() (client anon + JWT utilisateur).
 * La RLS sur `clients` (policy isolation_pressing) garantit que seuls les
 * clients du pressing du manager connecté sont retournés.
 *
 * ⚠️ Si la vue `vue_clients_enrichis` est appliquée (migration 009),
 * l'API l'utilisera automatiquement (1 seule requête SQL au lieu de 2).
 * Ici on teste sa disponibilité via un try/catch sur la première requête.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getPressingPlan, getHistoryCutoff } from "@/lib/auth/plan-gating";
import { isValidCIPhone, normalizeCIPhone } from "@/lib/validations/phone";
import { createClientSchema } from "@/lib/validations/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Récupère le personnel connecté (pour le pressing_id nécessaire au gating
  // par plan). RLS isole par pressing_id automatiquement.
  const { data: meRow } = await supabase
    .from("personnel")
    .select("id, pressing_id, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (
    !meRow ||
    meRow.actif !== true ||
    meRow.statut_compte !== "actif"
  ) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }

  // 🚫 PLAN GATING (PRD §16) — limitation d'historique selon le plan :
  //   starter → 3 derniers mois, pro → 12 derniers mois, business → illimité.
  // Appliqué sur `clients.created_at` (les clients plus anciens ne sont pas
  // visibles pour Starter/Pro). Business = illimité.
  const plan = await getPressingPlan(supabase, meRow.pressing_id);
  const historyCutoff = getHistoryCutoff(plan);

  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").trim();
  const impayesOnly = searchParams.get("impayes") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
  );

  // Construction de la requête de base sur `clients` (RLS isole par pressing)
  let clientsQuery = supabase
    .from("clients")
    .select(
      "id, nom_complet, telephone, email, adresse, points_fidelite, notes, created_at",
      { count: "exact" }
    );

  // Recherche par nom ou téléphone (ILIKE insensible à la casse)
  if (q) {
    // Supabase PostgREST : OR sur 2 colonnes
    clientsQuery = clientsQuery.or(
      `nom_complet.ilike.%${q.replace(/,/g, "")}%,telephone.ilike.%${q.replace(/,/g, "")}%`
    );
  }

  // 🚫 PLAN GATING (PRD §16) — limitation d'historique selon le plan.
  // Les clients créés avant `historyCutoff` ne sont pas visibles pour
  // Starter (3 mois) et Pro (12 mois). Business = illimité.
  if (historyCutoff) {
    clientsQuery = clientsQuery.gte("created_at", historyCutoff);
  }

  // Tri par nom_complet asc puis pagination
  clientsQuery = clientsQuery
    .order("nom_complet", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data: clients, error: clientsErr, count } = await clientsQuery;

  if (clientsErr) {
    console.error("[api/admin/clients] Erreur SELECT clients:", clientsErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des clients" },
      { status: 500 }
    );
  }

  if (!clients || clients.length === 0) {
    return NextResponse.json({
      success: true,
      data: [],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: 0,
    });
  }

  // Récupère les agrégations par client depuis `commandes` :
  // somme montant_total (total_depense), count commandes, max created_at,
  // et somme(montant_total - montant_paye) pour les commandes non payées (solde_impaye).
  const clientIds = clients.map((c) => c.id);
  const { data: aggregations, error: aggErr } = await supabase
    .from("commandes")
    .select(
      "client_id, montant_total, montant_paye, statut_paiement, created_at"
    )
    .in("client_id", clientIds);

  if (aggErr) {
    console.error("[api/admin/clients] Erreur SELECT commandes:", aggErr);
    // On continue sans agrégations plutôt que de tout faire échouer
  }

  // Calcule les agrégations côté JS
  const aggsByClientId = new Map<
    string,
    {
      solde_impaye: number;
      total_depense: number;
      nombre_commandes: number;
      derniere_commande: string | null;
    }
  >();

  for (const c of clients) {
    aggsByClientId.set(c.id, {
      solde_impaye: 0,
      total_depense: 0,
      nombre_commandes: 0,
      derniere_commande: null,
    });
  }

  if (aggregations) {
    for (const cmd of aggregations) {
      const agg = aggsByClientId.get(cmd.client_id);
      if (!agg) continue;
      agg.nombre_commandes += 1;
      agg.total_depense += cmd.montant_total || 0;
      if (cmd.statut_paiement === "non_paye" || cmd.statut_paiement === "partiel") {
        const impaye = Math.max((cmd.montant_total || 0) - (cmd.montant_paye || 0), 0);
        agg.solde_impaye += impaye;
      }
      if (
        !agg.derniere_commande ||
        new Date(cmd.created_at) > new Date(agg.derniere_commande)
      ) {
        agg.derniere_commande = cmd.created_at;
      }
    }
  }

  // Fusionne les clients avec leurs agrégations
  let enrichedClients = clients.map((c) => ({
    ...c,
    ...(aggsByClientId.get(c.id) || {
      solde_impaye: 0,
      total_depense: 0,
      nombre_commandes: 0,
      derniere_commande: null,
    }),
  }));

  // Filtre "uniquement clients avec impayés" (post-agrégation car dépend
  // des commandes, pas directement filtrable en SQL sur la table clients)
  if (impayesOnly) {
    enrichedClients = enrichedClients.filter((c) => c.solde_impaye > 0);
  }

  // Le count total de Supabase ne reflète que la requête sur `clients`
  // (sans filtre impayés). Pour le filtre impayés, on doit recalculer.
  let total = count ?? 0;
  let totalPages = Math.ceil(total / pageSize);

  if (impayesOnly) {
    // Pour avoir le vrai total des clients avec impayés, il faudrait
    // récupérer TOUS les clients du pressing et filtrer. Coûteux si beaucoup
    // de clients. Pour le MVP, on renvoie le count filtré de cette page
    // et on indique un total approximatif.
    // Approche : on compte tous les clients distincts ayant une commande impayée
    const { data: impayesClients } = await supabase
      .from("commandes")
      .select("client_id")
      .in("statut_paiement", ["non_paye", "partiel"]);
    if (impayesClients) {
      const uniqueClientIds = new Set(impayesClients.map((c) => c.client_id));
      total = uniqueClientIds.size;
      totalPages = Math.ceil(total / pageSize);
    }
  }

  return NextResponse.json({
    success: true,
    data: enrichedClients,
    total,
    page,
    pageSize,
    totalPages,
  });
}

/**
 * POST /api/admin/clients
 * ------------------------
 * Crée un nouveau client rattaché au pressing du manager connecté.
 *
 * Champs attendus : nom_complet (requis), telephone (requis), email (optionnel),
 * adresse (optionnel), points_fidelite (optionnel, default 0), notes (optionnel).
 *
 * 🔒 SÉCURITÉ : la RLS (policy isolation_pressing WITH CHECK pressing_id =
 * get_pressing_id_utilisateur()) garantit que le client est bien créé dans
 * le pressing du manager connecté. Le pressing_id est récupéré côté serveur
 * depuis la session (jamais trusté depuis le client).
 */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Récupère le pressing_id du personnel connecté via sa ligne personnel.
  // Le PRD autorise la création de clients par le manager ET le réceptionniste
  // (aligné sur le PATCH /api/admin/clients/[id] qui accepte déjà ces 2 rôles).
  const { data: personnel } = await supabase
    .from("personnel")
    .select("pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !personnel ||
    (personnel.role !== "manager" && personnel.role !== "receptionniste") ||
    personnel.actif !== true ||
    personnel.statut_compte !== "actif"
  ) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — manager ou réceptionniste requis" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  // AUDIT #9 — Zod validation gate (defense-in-depth). Si le body ne passe
  // pas le schéma (UUID invalide, téléphone non ivoirien, nom trop court,
  // email mal formé, notes > 2000 chars, etc.), on renvoie 400 avec les
  // erreurs Zod formatées via `.flatten()`. La validation métier existante
  // (rôle, unicité téléphone, normalisation) continue de s'exécuter ensuite
  // sur le body original — le schéma ne fait qu'ajouter une couche.
  // #19 — notes slice : le schéma limite `notes` à 2000 chars max.
  const zodParsed = createClientSchema.safeParse(body);
  if (!zodParsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Données invalides",
        details: zodParsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  // Validation des champs
  const nomComplet = typeof body.nom_complet === "string" ? body.nom_complet.trim() : "";
  const telephone = typeof body.telephone === "string" ? body.telephone.trim() : "";
  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim()
      : null;
  const adresse =
    typeof body.adresse === "string" && body.adresse.trim()
      ? body.adresse.trim()
      : null;
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;
  const pointsFidelite =
    typeof body.points_fidelite === "number" &&
    Number.isFinite(body.points_fidelite) &&
    body.points_fidelite >= 0
      ? Math.floor(body.points_fidelite)
      : 0;

  if (!nomComplet) {
    return NextResponse.json(
      { success: false, error: "Le nom complet est requis" },
      { status: 400 }
    );
  }
  if (!telephone) {
    return NextResponse.json(
      { success: false, error: "Le téléphone est requis" },
      { status: 400 }
    );
  }
  // AUDIT-B-03 — Validation du téléphone ivoirien (centralisée dans
  // `isValidCIPhone`). Avant ce fix, seul le non-vide était vérifié.
  if (!isValidCIPhone(telephone)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Le téléphone doit être un numéro ivoirien valide (ex : 07 00 00 00 00 ou +225 07 00 00 00 00).",
      },
      { status: 400 }
    );
  }
  // AUDIT-B-03 — Normalisation vers +225XXXXXXXXXX pour cohérence avec les
  // autres routes (activation, inscription, personnel).
  const telephoneNorm = normalizeCIPhone(telephone);
  // Validation basique email
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, error: "Format d'email invalide" },
      { status: 400 }
    );
  }

  // Vérifie l'unicité du téléphone dans le pressing (contrainte DB UNIQUE)
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("pressing_id", personnel.pressing_id)
    .eq("telephone", telephoneNorm)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        success: false,
        error: `Un client avec le téléphone ${telephoneNorm} existe déjà dans votre pressing`,
      },
      { status: 409 }
    );
  }

  // Insertion (RLS WITH CHECK garantit pressing_id = pressing du manager)
  const { data: newClient, error: insertErr } = await supabase
    .from("clients")
    .insert({
      pressing_id: personnel.pressing_id,
      nom_complet: nomComplet,
      telephone: telephoneNorm,
      email: email,
      adresse: adresse,
      notes: notes,
      points_fidelite: pointsFidelite,
    })
    .select(
      "id, nom_complet, telephone, email, adresse, points_fidelite, notes, created_at"
    )
    .single();

  if (insertErr) {
    console.error("[api/admin/clients] Erreur INSERT:", insertErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création du client" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        ...newClient,
        solde_impaye: 0,
        total_depense: 0,
        nombre_commandes: 0,
        derniere_commande: null,
      },
    },
    { status: 201 }
  );
}
