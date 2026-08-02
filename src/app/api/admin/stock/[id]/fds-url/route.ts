/**
 * OgPressing — API /api/admin/stock/[id]/fds-url (GET)
 * -----------------------------------------------------
 * Génère une signed URL temporaire (1 heure) pour télécharger la Fiche
 * de Données de Sécurité (FDS) d'un produit_stock.
 *
 * Contexte sécurité (AUDIT_SECURITE.md — Conclusion #2) :
 *   Avant cette route, les FDS étaient servies via getPublicUrl() côté
 *   client, ce qui les rendait potentiellement accessibles à tout
 *   internet si le bucket `fds` était public. Désormais le bucket est
 *   PRIVÉ et l'accès se fait par signed URL générée côté serveur après
 *   vérification de l'identité et du rattachement au pressing.
 *
 * Logique :
 *   1. Authentification (getUser) + vérification personnel actif.
 *   2. SELECT du produit_stock (RLS isole par pressing — un manager
 *      ne peut pas récupérer la FDS d'un autre pressing).
 *   3. Si le produit n'existe pas ou n'a pas de fds_url → 404.
 *   4. Extraction du path Storage (gestion legacy : si fds_url est une
 *      URL publique historique, on extrait le path).
 *   5. Génération d'une signed URL valide 3600 secondes (1 heure) via
 *      le client authentifié (RLS Storage s'applique sur la policy
 *      `fds_select_isolation` définie dans la migration 016).
 *   6. Retour { success: true, data: { url, expires_at } }.
 *
 * 🔒 SÉCURITÉ :
 *   - Utilise getSupabaseServer() (clé anon + JWT utilisateur) afin
 *     que les policies RLS Storage s'appliquent. La policy
 *     `fds_select_isolation` vérifie que split_part(name, '/', 2)
 *     correspond au pressing_id du user authentifié (ou is_super_admin).
 *   - Si le path ne contient pas le bon pressing_id (ancien format
 *     sans isolation), la génération de signed URL échoue — erreur 403.
 *
 * Réponses :
 *   200 — { success: true, data: { url, expires_at } }
 *   401 — Non authentifié
 *   403 — Compte inactif / RLS a refusé l'accès au fichier
 *   404 — Produit introuvable ou sans FDS
 *   500 — Erreur interne (Supabase Storage indisponible, etc.)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Durée de validité de la signed URL (en secondes). */
const SIGNED_URL_EXPIRES_IN = 3600; // 1 heure

/** Bucket Storage contenant les FDS (cf. migration 016). */
const FDS_BUCKET = "fds";

/**
 * Extrait le path Storage (clé dans le bucket) à partir de la valeur
 * stockée en base. Gère deux formats :
 *   - Format moderne : un path simple (ex : "fds/{pressing_id}/{filename}")
 *   - Format legacy : une URL publique complète
 *     (ex : "https://xxx.supabase.co/storage/v1/object/public/fds/{path}")
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: produitId } = await params;
  if (!produitId) {
    return NextResponse.json(
      { success: false, error: "ID produit manquant" },
      { status: 400 }
    );
  }

  // ---- 1. Authentification + personnel actif ----
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
    .select("id, pressing_id, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!me || me.actif !== true || me.statut_compte !== "actif") {
    return NextResponse.json(
      { success: false, error: "Compte inactif ou désactivé" },
      { status: 403 }
    );
  }

  // ---- 2. SELECT du produit_stock (RLS isole par pressing) ----
  // La RLS sur produits_stock limite automatiquement la lecture au
  // pressing de l'utilisateur connecté. Si le produit appartient à un
  // autre pressing, la requête renvoie null.
  const { data: produit, error: produitErr } = await supabase
    .from("produits_stock")
    .select("id, pressing_id, fds_url")
    .eq("id", produitId)
    .maybeSingle();

  if (produitErr) {
    console.error(
      "[api/admin/stock/[id]/fds-url] Erreur SELECT produit:",
      produitErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du produit" },
      { status: 500 }
    );
  }

  if (!produit) {
    return NextResponse.json(
      { success: false, error: "Produit introuvable" },
      { status: 404 }
    );
  }

  if (!produit.fds_url) {
    return NextResponse.json(
      { success: false, error: "Aucune FDS associée à ce produit" },
      { status: 404 }
    );
  }

  // ---- 3. Extraction du path Storage ----
  const storagePath = extractStoragePath(produit.fds_url, FDS_BUCKET);
  if (!storagePath) {
    console.error(
      "[api/admin/stock/[id]/fds-url] Impossible d'extraire le path Storage depuis fds_url:",
      produit.fds_url
    );
    return NextResponse.json(
      { success: false, error: "Référence FDS invalide" },
      { status: 500 }
    );
  }

  // ---- 4. Génération de la signed URL (1 heure) ----
  // Le client supabase est authentifié (JWT utilisateur) → la policy
  // RLS `fds_select_isolation` sur storage.objects s'applique.
  // Si le path ne contient pas le pressing_id attendu, Supabase
  // refuse la génération de la signed URL.
  const { data: signed, error: signedErr } = await supabase.storage
    .from(FDS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN);

  if (signedErr || !signed?.signedUrl) {
    console.error(
      "[api/admin/stock/[id]/fds-url] Erreur createSignedUrl:",
      signedErr,
      "(path=" + storagePath + ")"
    );
    // Soit RLS refuse (fichier non autorisé pour ce pressing), soit
    // le fichier n'existe pas, soit Storage est indisponible.
    return NextResponse.json(
      {
        success: false,
        error:
          "Accès refusé à la FDS. Le fichier n'existe pas ou n'appartient pas à votre pressing.",
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
