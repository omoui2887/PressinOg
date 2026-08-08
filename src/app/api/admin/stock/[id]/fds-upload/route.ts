/**
 * OgPressing — API /api/admin/stock/[id]/fds-upload (POST)
 * --------------------------------------------------------
 * Upload serveur d'une Fiche de Données de Sécurité (FDS) pour un
 * produit_stock donné. Le client ne dispose PLUS de la clé anon pour
 * uploader directement dans le bucket privé `fds` — tout passe par
 * cette route qui applique une validation stricte côté serveur.
 *
 * Contexte sécurité (AUDIT_SECURITE.md — Conclusion #4) :
 *   Avant cette route, l'upload FDS se faisait côté client via
 *   `supabase.storage.from('fds').upload(path, file)` avec la clé anon.
 *   Un attaquant pouvait forger une requête avec un Content-Type
 *   `application/pdf` factice pour uploader un binaire quelconque
 *   (malware, exfiltration de données, etc.). Désormais :
 *     - Le serveur lit réellement le fichier (multipart/form-data).
 *     - Vérifie le Content-Type déclaré par le navigateur.
 *     - Vérifie la taille (≤ 5 MB).
 *     - Vérifie le MAGIC NUMBER (%PDF-) — un attaquant ne peut plus
 *      uploader un exécutable renommé en .pdf ou un Content-Type piégé.
 *     - Ré-upload via le client admin (service_role) après validation.
 *
 * Flow :
 *   1. Auth : getUser + personnel actif + rôle manager.
 *   2. SELECT produits_stock (RLS isole par pressing) → récupère
 *      `pressing_id`. Si introuvable → 404 (le produit n'appartient
 *      pas au pressing ou n'existe pas).
 *   3. Parse multipart/form-data, champ "file" requis.
 *   4. Validation stricte :
 *        - file.size > 0
 *        - file.size ≤ 5_000_000 (5 MB)
 *        - file.type === 'application/pdf' (strict, pas de fallback)
 *        - magic number : 5 premiers bytes = 0x25 0x50 0x44 0x46 0x2D
 *          (littéraux "%PDF-")
 *   5. Upload via getSupabaseAdmin() (service_role, bypass RLS) :
 *        - path = `fds/{pressing_id}/{Date.now()}-{random}.pdf`
 *        - contentType: 'application/pdf'
 *        - cacheControl: '3600'
 *        - upsert: false
 *   6. UPDATE produits_stock.fds_url = path (via client server, RLS).
 *   7. Génération d'une signed URL valide 1 heure via admin client.
 *   8. Retour { success: true, path, url }.
 *
 * 🔒 SÉCURITÉ (AUDIT_SECURITE.md — Conclusion #8) :
 *   - Aucun message d'erreur Supabase brut n'est renvoyé au client.
 *     Toutes les erreurs Storage sont loggées serveur (console.error)
 *     et le client reçoit un message générique "Erreur interne".
 *   - Les erreurs de VALIDATION (MIME, taille, magic number) sont
 *     explicites car elles ne révèlent aucune information système.
 *
 * Réponses :
 *   201 — { success: true, path: string, url: string }
 *   400 — FormData invalide / champ file manquant / fichier vide /
 *         MIME invalide / taille > 5 MB / magic number invalide
 *   401 — Non authentifié
 *   403 — Compte inactif / pas manager
 *   404 — Produit introuvable (n'appartient pas au pressing)
 *   500 — Erreur interne (Supabase Storage indisponible, etc.)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Bucket Storage contenant les FDS (cf. migration 016). */
const FDS_BUCKET = "fds";

/** Taille maximale du fichier FDS : 5 MB. */
const MAX_SIZE_BYTES = 5_000_000;

/** Durée de validité de la signed URL renvoyée (en secondes). */
const SIGNED_URL_EXPIRES_IN = 3600; // 1 heure

/** Magic number des fichiers PDF : 5 premiers bytes "%PDF-". */
const PDF_MAGIC_NUMBER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

/**
 * Vérifie que les 5 premiers bytes du fichier correspondent au magic
 * number PDF ("%PDF-"). Ceci empêche l'upload d'un binaire arbitraire
 * (exécutable, image, archive) renommé en .pdf ou servi avec un
 * Content-Type piégé `application/pdf`.
 *
 * @returns `true` si le fichier commence bien par `%PDF-`.
 */
function hasPdfMagicNumber(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC_NUMBER.length) return false;
  for (let i = 0; i < PDF_MAGIC_NUMBER.length; i++) {
    if (bytes[i] !== PDF_MAGIC_NUMBER[i]) return false;
  }
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: produitId } = await params;
  if (!produitId) {
    return NextResponse.json(
      { success: false, error: "ID produit manquant" },
      { status: 400 }
    );
  }

  // ---- 1. Authentification + personnel actif + rôle manager ----
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

  // ---- 2. SELECT produit (RLS isole par pressing) ----
  // RLS limite automatiquement la lecture au pressing de l'utilisateur.
  // Si le produit appartient à un autre pressing, la requête renvoie null.
  const { data: produit, error: produitErr } = await supabase
    .from("produits_stock")
    .select("id, pressing_id")
    .eq("id", produitId)
    .maybeSingle();

  if (produitErr) {
    console.error(
      "[api/admin/stock/[id]/fds-upload] Erreur SELECT produit:",
      produitErr
    );
    // Audit #8 : masque l'erreur Supabase brute.
    return NextResponse.json(
      { success: false, error: "Erreur interne" },
      { status: 500 }
    );
  }
  if (!produit) {
    return NextResponse.json(
      { success: false, error: "Produit introuvable" },
      { status: 404 }
    );
  }

  // pressing_id du produit propriétaire — utilisé pour construire le path
  // Storage et garantir l'isolation RLS (fds/{pressing_id}/{filename}).
  const pressingId: string = produit.pressing_id;

  // ---- 3. Parse multipart/form-data ----
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "FormData invalide" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Champ 'file' manquant" },
      { status: 400 }
    );
  }

  // ---- 4. Validation stricte ----
  if (file.size === 0) {
    return NextResponse.json(
      { success: false, error: "Le fichier est vide" },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: `Le fichier dépasse la taille maximale (5 MB). Reçu : ${(file.size / 1024 / 1024).toFixed(2)} MB`,
      },
      { status: 413 }
    );
  }
  // MIME strict : uniquement application/pdf (pas de fallback sur l'extension).
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      {
        success: false,
        error: `Type MIME invalide. Reçu : "${file.type}". "application/pdf" attendu.`,
      },
      { status: 415 }
    );
  }

  // Lecture des 5 premiers bytes pour vérifier le magic number PDF.
  // On lit l'ArrayBuffer complet une fois (servira aussi pour l'upload).
  let fileBytes: Uint8Array;
  try {
    const arrayBuffer = await file.arrayBuffer();
    fileBytes = new Uint8Array(arrayBuffer);
  } catch (err) {
    console.error(
      "[api/admin/stock/[id]/fds-upload] Erreur lecture ArrayBuffer:",
      err
    );
    return NextResponse.json(
      { success: false, error: "Erreur interne" },
      { status: 500 }
    );
  }

  if (!hasPdfMagicNumber(fileBytes)) {
    // Audit #4 : magic number invalide → 415 (Unsupported Media Type).
    // On ne révèle pas le contenu des bytes lus (pas de fuite).
    console.warn(
      `[api/admin/stock/[id]/fds-upload] Magic number invalide pour produit ${produitId} (user ${userData.user.id}). Premier bytes: ${Array.from(fileBytes.slice(0, 5)).join(",")}`
    );
    return NextResponse.json(
      {
        success: false,
        error: "Le fichier n'est pas un PDF valide (magic number manquant).",
      },
      { status: 415 }
    );
  }

  // ---- 5. Upload via admin client (service_role, bypass RLS Storage) ----
  // On a déjà validé que l'utilisateur est manager du pressing propriétaire,
  // donc l'upload admin est légitime. Le path préfixe par pressing_id pour
  // que la policy RLS `fds_select_isolation` puisse isoler la lecture.
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const objectPath = `fds/${pressingId}/${Date.now()}-${randomSuffix}.pdf`;

  const supabaseAdmin = getSupabaseAdmin();
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(FDS_BUCKET)
    .upload(objectPath, fileBytes, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    console.error(
      "[api/admin/stock/[id]/fds-upload] Erreur upload Storage:",
      uploadErr
    );
    // Audit #8 : masque le message Supabase brut.
    return NextResponse.json(
      { success: false, error: "Erreur interne" },
      { status: 500 }
    );
  }

  // ---- 6. UPDATE produits_stock.fds_url = path ----
  // Utilisé via le client server (RLS s'applique). RLS autorise l'UPDATE
  // uniquement si le produit appartient au pressing du user (ce qu'on a
  // déjà vérifié via le SELECT ci-dessus).
  const { error: updateErr } = await supabase
    .from("produits_stock")
    .update({ fds_url: objectPath })
    .eq("id", produitId);

  if (updateErr) {
    console.error(
      "[api/admin/stock/[id]/fds-upload] Erreur UPDATE produits_stock.fds_url:",
      updateErr
    );
    // Audit #8 : masque l'erreur. Le fichier est uploadé mais la DB n'est
    // pas à jour — on log et on renvoie une erreur générique.
    return NextResponse.json(
      { success: false, error: "Erreur interne" },
      { status: 500 }
    );
  }

  // ---- 7. Génération d'une signed URL (1 heure) via admin ----
  // L'admin client bypass RLS — la signed URL fonctionnera quel que soit
  // le pressing. C'est acceptable ici car on a déjà authentifié le user
  // et validé qu'il est manager du pressing propriétaire.
  const { data: signed, error: signedErr } = await supabaseAdmin.storage
    .from(FDS_BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_EXPIRES_IN);

  if (signedErr || !signed?.signedUrl) {
    console.error(
      "[api/admin/stock/[id]/fds-upload] Erreur createSignedUrl:",
      signedErr
    );
    // L'upload a réussi mais la génération de signed URL a échoué. On
    // renvoie quand même le path (la DB est à jour) — le client pourra
    // re-demander une signed URL via /api/admin/stock/[id]/fds-url.
    return NextResponse.json(
      {
        success: true,
        path: objectPath,
        url: null,
      },
      { status: 201 }
    );
  }

  // ---- 8. Réponse ----
  return NextResponse.json(
    {
      success: true,
      path: objectPath,
      url: signed.signedUrl,
    },
    { status: 201 }
  );
}
