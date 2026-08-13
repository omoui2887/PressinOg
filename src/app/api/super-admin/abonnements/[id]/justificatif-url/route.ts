/**
 * e-pressing — API /api/super-admin/abonnements/[id]/justificatif-url (GET)
 * ----------------------------------------------------------------------
 * Génère une signed URL temporaire (1 heure) pour télécharger le
 * justificatif de paiement associé à un abonnement.
 *
 * Contexte sécurité (AUDIT_SECURITE.md — Conclusion #2) :
 *   Avant cette route, le composant `renouvellement-dialog.tsx`
 *   générait une signed URL valide 10 ANS (60*60*24*365*10) côté
 *   client et la stockait en base — équivalent à une URL publique
 *   permanente, ce qui annulait totalement la protection par signed
 *   URL. Désormais le bucket `justificatifs` est PRIVÉ et accessible
 *   uniquement au Super Admin ; la signed URL est générée à la
 *   demande côté serveur, valide 1 heure seulement.
 *
 * Logique :
 *   1. Authentification (getUser) + vérification is_super_admin actif.
 *   2. SELECT de l'abonnement (RLS limite aux SA) pour obtenir
 *      `justificatif_url`.
 *   3. Si l'abonnement n'existe pas ou n'a pas de justificatif → 404.
 *   4. Extraction du path Storage (gestion legacy URL publique).
 *   5. Génération d'une signed URL valide 3600 secondes (1 heure) via
 *      le client authentifié (RLS Storage policy `justificatifs_select_sa`
 *      vérifie is_super_admin()).
 *   6. Retour { success: true, data: { url, expires_at } }.
 *
 * 🔒 SÉCURITÉ :
 *   - Utilise getSupabaseServer() (clé anon + JWT utilisateur). La
 *     policy RLS `justificatifs_select_sa` refuse l'accès si
 *     is_super_admin() = false. Aucun pressing client ne peut donc
 *     générer de signed URL pour un justificatif.
 *   - La signed URL est valide 1 heure maximum (vs 10 ans avant).
 *
 * Réponses :
 *   200 — { success: true, data: { url, expires_at } }
 *   401 — Non authentifié
 *   403 — Pas super admin / RLS a refusé l'accès
 *   404 — Abonnement introuvable ou sans justificatif
 *   500 — Erreur interne (Supabase Storage indisponible, etc.)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Durée de validité de la signed URL (en secondes). */
const SIGNED_URL_EXPIRES_IN = 3600; // 1 heure

/** Bucket Storage contenant les justificatifs (cf. migration 016). */
const JUSTIFICATIFS_BUCKET = "justificatifs";

/**
 * Extrait le path Storage (clé dans le bucket) à partir de la valeur
 * stockée en base. Gère deux formats :
 *   - Format moderne : un path simple
 *     (ex : "abonnements/{abonnement_id}/{filename}")
 *   - Format legacy : une URL publique ou signée historique
 *     (ex : "https://xxx.supabase.co/storage/v1/object/public/justificatifs/{path}"
 *           "https://xxx.supabase.co/storage/v1/object/sign/justificatifs/{path}?token=...")
 *
 * Retourne null si la valeur n'est pas exploitable.
 */
function extractStoragePath(storedValue: string, bucketId: string): string | null {
  if (!storedValue) return null;

  // Format moderne : la valeur stockée est déjà le path dans le bucket.
  if (!storedValue.startsWith("http")) {
    return storedValue;
  }

  // Format legacy : on extrait le path après /object/public/{bucket}/
  // ou /object/sign/{bucket}/.
  try {
    const url = new URL(storedValue);
    const publicMarker = `/object/public/${bucketId}/`;
    const signMarker = `/object/sign/${bucketId}/`;
    const pubIdx = url.pathname.indexOf(publicMarker);
    if (pubIdx !== -1) {
      return decodeURIComponent(url.pathname.slice(pubIdx + publicMarker.length));
    }
    const signIdx = url.pathname.indexOf(signMarker);
    if (signIdx !== -1) {
      return decodeURIComponent(url.pathname.slice(signIdx + signMarker.length));
    }
    return null;
  } catch {
    return null;
  }
}

/** Vérifie que l'appelant est bien un super admin actif et renvoie sa ligne. */
async function ensureSuperAdmin(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>
) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("id, user_id, nom_complet, email")
    .eq("user_id", userData.user.id)
    .eq("actif", true)
    .maybeSingle();
  if (!superAdmin) {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — super admin requis" },
        { status: 403 }
      ),
    };
  }
  return { superAdmin };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: abonnementId } = await params;
  if (!abonnementId) {
    return NextResponse.json(
      { success: false, error: "ID abonnement manquant" },
      { status: 400 }
    );
  }

  // ---- 1. Authentification + super admin actif ----
  const supabase = await getSupabaseServer();
  const guard = await ensureSuperAdmin(supabase);
  if ("error" in guard) return guard.error;

  // ---- 2. SELECT de l'abonnement (RLS limite aux SA) ----
  const { data: abonnement, error: abErr } = await supabase
    .from("abonnements")
    .select("id, justificatif_url")
    .eq("id", abonnementId)
    .maybeSingle();

  if (abErr) {
    console.error(
      "[api/super-admin/abonnements/[id]/justificatif-url] Erreur SELECT abonnement:",
      abErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération de l'abonnement" },
      { status: 500 }
    );
  }

  if (!abonnement) {
    return NextResponse.json(
      { success: false, error: "Abonnement introuvable" },
      { status: 404 }
    );
  }

  if (!abonnement.justificatif_url) {
    return NextResponse.json(
      { success: false, error: "Aucun justificatif associé à cet abonnement" },
      { status: 404 }
    );
  }

  // ---- 3. Extraction du path Storage ----
  const storagePath = extractStoragePath(
    abonnement.justificatif_url,
    JUSTIFICATIFS_BUCKET
  );
  if (!storagePath) {
    console.error(
      "[api/super-admin/abonnements/[id]/justificatif-url] Impossible d'extraire le path Storage depuis justificatif_url:",
      abonnement.justificatif_url
    );
    return NextResponse.json(
      { success: false, error: "Référence justificatif invalide" },
      { status: 500 }
    );
  }

  // ---- 4. Génération de la signed URL (1 heure) ----
  // Le client supabase est authentifié (JWT utilisateur SA) → la
  // policy RLS `justificatifs_select_sa` autorise l'accès.
  const { data: signed, error: signedErr } = await supabase.storage
    .from(JUSTIFICATIFS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN);

  if (signedErr || !signed?.signedUrl) {
    console.error(
      "[api/super-admin/abonnements/[id]/justificatif-url] Erreur createSignedUrl:",
      signedErr,
      "(path=" + storagePath + ")"
    );
    return NextResponse.json(
      {
        success: false,
        error:
          "Accès refusé au justificatif. Le fichier n'existe pas ou n'est pas accessible.",
      },
      { status: 403 }
    );
  }

  // ---- 5. Réponse ----
  const expiresAt = new Date(
    Date.now() + SIGNED_URL_EXPIRES_IN * 1000
  ).toISOString();

  return NextResponse.json({
    success: true,
    data: {
      url: signed.signedUrl,
      expires_at: expiresAt,
    },
  });
}
