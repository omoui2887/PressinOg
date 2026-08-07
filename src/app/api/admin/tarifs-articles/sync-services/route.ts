/**
 * OgPressing — API /api/admin/tarifs-articles/sync-services (POST)
 * ----------------------------------------------------------------
 * Synchronise les services avec les tarifs : pour chaque tarif actif dont
 * le type_service n'a pas de service correspondant dans le pressing, crée
 * automatiquement le service manquant.
 *
 * Cet endpoint répare les tarifs créés AVANT l'auto-provisionnement
 * (qui a été ajouté dans le POST /api/admin/tarifs-articles). Sans cette
 * réparation, ces tarifs ne peuvent pas être utilisés dans le POS car
 * commande_lignes.service_id est une FK vers services.id.
 *
 * Auth : manager actif du pressing. pressing_id forcé à celui du manager.
 *
 * Réponse : { success, created, skipped, errors }
 *   - created : nombre de services créés
 *   - skipped : nombre de tarifs qui avaient déjà un service
 *   - errors  : tableau des erreurs non fatales (type, message)
 *
 * 🔒 SÉCURITÉ : RLS isole par pressing. Seul le manager peut déclencher
 *    la synchro (écriture dans la table services).
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SERVICE_LABELS: Record<string, string> = {
  lavage: "Lavage",
  repassage: "Repassage",
  laver_repasser: "Laver-Repasser",
  nettoyage_sec: "Nettoyage à sec",
  detachage: "Détachage",
  blanchisserie: "Blanchisserie",
};

export async function POST() {
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

  if (!me || me.actif !== true || me.statut_compte !== "actif") {
    return NextResponse.json(
      { success: false, error: "Compte inactif ou désactivé" },
      { status: 403 }
    );
  }
  if (me.role !== "manager") {
    return NextResponse.json(
      { success: false, error: "Accès refusé — manager requis" },
      { status: 403 }
    );
  }

  const pressingId = me.pressing_id;

  // 1. Récupère tous les types_service distincts des tarifs actifs du pressing.
  const { data: tarifs, error: tarifsErr } = await supabase
    .from("tarifs_articles")
    .select("type_service, prix, duree_estimee")
    .eq("pressing_id", pressingId)
    .eq("actif", true);

  if (tarifsErr) {
    console.error("[sync-services] Erreur SELECT tarifs:", tarifsErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des tarifs" },
      { status: 500 }
    );
  }

  if (!tarifs || tarifs.length === 0) {
    return NextResponse.json({
      success: true,
      created: 0,
      skipped: 0,
      errors: [],
      message: "Aucun tarif actif à synchroniser.",
    });
  }

  // Pour chaque type_service, garde le premier tarif (prix + durée) trouvé.
  const typeMap = new Map<
    string,
    { prix: number; duree_estimee: string | null }
  >();
  for (const t of tarifs) {
    if (!typeMap.has(t.type_service)) {
      typeMap.set(t.type_service, {
        prix: t.prix,
        duree_estimee: t.duree_estimee,
      });
    }
  }

  // 2. Récupère tous les services existants du pressing (actifs + inactifs).
  const { data: services, error: svcErr } = await supabase
    .from("services")
    .select("id, type")
    .eq("pressing_id", pressingId);

  if (svcErr) {
    console.error("[sync-services] Erreur SELECT services:", svcErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des services" },
      { status: 500 }
    );
  }

  const existingTypes = new Set((services ?? []).map((s) => s.type));

  // 3. Crée les services manquants.
  let created = 0;
  let skipped = 0;
  const errors: Array<{ type: string; message: string }> = [];

  for (const [typeService, info] of typeMap) {
    if (existingTypes.has(typeService)) {
      skipped++;
      continue;
    }

    const label = SERVICE_LABELS[typeService] ?? typeService;
    const insertPayload: Record<string, unknown> = {
      pressing_id: pressingId,
      type: typeService,
      nom: label,
      prix: info.prix,
      actif: true,
    };
    if (info.duree_estimee) {
      insertPayload.duree_estimee = info.duree_estimee;
    }

    const { error: insertErr } = await supabase
      .from("services")
      .insert(insertPayload);

    if (insertErr) {
      // 23505 = violation unique → créé entre-temps (race), pas une erreur.
      if (insertErr.code === "23505") {
        skipped++;
      } else {
        errors.push({ type: typeService, message: insertErr.message });
        console.warn(
          `[sync-services] INSERT service ${typeService} failed:`,
          insertErr.message
        );
      }
    } else {
      created++;
    }
  }

  return NextResponse.json({
    success: true,
    created,
    skipped,
    errors,
    message:
      created > 0
        ? `${created} service(s) créé(s) automatiquement.`
        : "Tous les tarifs ont déjà un service correspondant.",
  });
}
