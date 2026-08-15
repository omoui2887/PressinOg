/**
 * e-pressing — API /api/super-admin/catalogue/upload-icon (POST)
 * --------------------------------------------------------------
 * LOT 15.4 — Upload d'une illustration d'article côté serveur.
 *
 * Le Super Admin upload une image (PNG/JPG/WebP/SVG, max 5 MB) qui est
 * stockée dans le bucket Supabase Storage `catalogue-articles` (public).
 * L'URL publique renvoyée peut alors être utilisée comme `icone_url`
 * lors de la création/édition d'un article du catalogue.
 *
 * Request : multipart/form-data avec un champ `file` (le fichier image)
 *           et un champ optionnel `slug` (utilisé pour nommer le fichier
 *           de façon stable : `catalogue-articles/{slug}-{timestamp}.{ext}`).
 *
 * Réponse :
 *   {
 *     success: true,
 *     data: { path: string, publicUrl: string }
 *   }
 *
 * 🔒 SÉCURITÉ : Super Admin uniquement. Le bucket `catalogue-articles`
 *    a été créé public (lecture publique sans auth) pour que les
 *    images soient accessibles depuis le picker côté client.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const BUCKET_NAME = "catalogue-articles";

interface EnsureSuperAdminOk {
  userId: string;
  forbidden: null;
}
interface EnsureSuperAdminForbidden {
  userId: null;
  forbidden: NextResponse;
}

async function ensureSuperAdmin(): Promise<
  EnsureSuperAdminOk | EnsureSuperAdminForbidden
> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      userId: null,
      forbidden: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
  const { data: superAdminRow } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", user.id)
    .eq("actif", true)
    .maybeSingle();
  if (!superAdminRow) {
    return {
      userId: null,
      forbidden: NextResponse.json(
        { success: false, error: "Accès refusé — super admin requis" },
        { status: 403 }
      ),
    };
  }
  return { userId: user.id, forbidden: null };
}

export async function POST(request: NextRequest) {
  const auth = await ensureSuperAdmin();
  if (auth.forbidden) return auth.forbidden;
  const { userId } = auth;

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
        error: `Le fichier dépasse la taille maximale (5 MB). Reçu: ${(file.size / 1024 / 1024).toFixed(2)} MB`,
      },
      { status: 413 }
    );
  }

  const mime = file.type;
  if (!ALLOWED_MIME.includes(mime)) {
    return NextResponse.json(
      {
        success: false,
        error: `Type MIME non supporté: ${mime}. Formats acceptés: PNG, JPG, WebP, SVG.`,
      },
      { status: 415 }
    );
  }

  // Slug optionnel pour nommer le fichier de façon stable
  const slugRaw = formData.get("slug");
  const slug =
    typeof slugRaw === "string" && /^[a-z0-9-]+$/.test(slugRaw)
      ? slugRaw
      : "article";

  const ext = MIME_TO_EXT[mime] ?? "png";
  const filename = `${slug}-${Date.now()}.${ext}`;
  const objectPath = filename; // stocké à la racine du bucket

  // Lecture du fichier en ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Upload via service_role (bypass RLS sur Storage)
  const supabaseAdmin = getSupabaseAdmin();
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(objectPath, bytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    console.error(
      "[api/super-admin/catalogue/upload-icon] Erreur upload:",
      uploadErr
    );
    // Sécurité (audit #8) : masque le message Supabase brut.
    return NextResponse.json(
      {
        success: false,
        error: "Erreur interne du serveur",
      },
      { status: 500 }
    );
  }

  // Récupère l'URL publique du fichier uploadé
  const { data: pubData } = supabaseAdmin.storage
    .from(BUCKET_NAME)
    .getPublicUrl(objectPath);

  // --- Audit logging (best-effort) ---
  await logAudit({
    pressing_id: null,
    user_id: userId,
    action: "upload_catalogue_icon",
    entity_type: "catalogue_article",
    entity_id: null,
    after_state: {
      bucket: BUCKET_NAME,
      path: objectPath,
      public_url: pubData.publicUrl,
      mime,
      size_bytes: file.size,
      original_filename: file.name,
    },
    req: request,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        path: objectPath,
        publicUrl: pubData.publicUrl,
      },
    },
    { status: 201 }
  );
}
