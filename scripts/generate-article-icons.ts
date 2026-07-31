/**
 * OgPressing — Génération des 33 illustrations d'articles du catalogue
 * ---------------------------------------------------------------
 * Génère une illustration PNG (1024x1024) par article du catalogue, dans
 * un style flat design vectoriel cohérent dérivé des 3 posters de référence
 * "PRESSING MODERNE" fournis par l'utilisateur.
 *
 * Style commun (STYLE_PREFIX) :
 *   - Flat design vectoriel avec contours fins bleu-gris foncé (#2C3E50)
 *   - Ombre portée douce sous l'objet
 *   - Palette pastel corporate : teal/sarcelle, navy, terracotta, crème,
 *     vert sauge
 *   - Fond beige/crème chaud (#F5F1E9)
 *   - Objet unique centré, sans texte, sans étiquette
 *   - Esthétique propre, professionnelle, moderne et amicale
 *
 * Sortie : public/images/articles/{slug}.png (33 fichiers)
 *
 * Concurrency : 3 générations en parallèle (évite le rate-limit tout en
 * restant rapide). Retry x2 par image en cas d'échec transitoire.
 *
 * Usage : bun run scripts/generate-article-icons.ts
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

// ----------------------------------------------------------------
// Style commun (préfixe de prompt) — dérivé des 3 images de référence
// ----------------------------------------------------------------

const STYLE_PREFIX =
  "Flat design vector illustration, single object centered, " +
  "thin dark blue-gray outlines (#2C3E50), soft drop shadow under object, " +
  "pastel corporate color palette (teal #4A90A4, navy, terracotta, cream, sage green), " +
  "warm beige background (#F5F1E9), clean professional modern friendly aesthetic, " +
  "no text, no labels, no words, no letters, high quality, 1024x1024 square format. ";

// ----------------------------------------------------------------
// Définition des 33 articles (slug → description visuelle)
// L'ordre suit le catalogue initial (catalogue-articles.ts).
// ----------------------------------------------------------------

interface ArticleDef {
  slug: string;
  /** Description du sujet, ajoutée après STYLE_PREFIX. */
  subject: string;
}

const ARTICLES: ArticleDef[] = [
  // --- Vêtements traités (5) ---
  {
    slug: "costume-ceremonie",
    subject:
      "A complete formal suit (jacket and trousers) hanging on a wooden hanger, navy blue jacket buttoned with a green tie visible, white dress shirt collar, structured shoulders, rectangular white tag hanging from the sleeve.",
  },
  {
    slug: "chemise",
    subject:
      "A classic men's white dress shirt with long sleeves, hung on a hanger, open collar, chest pocket visible, neat fold lines, buttons visible, pure white with thin blue outlines.",
  },
  {
    slug: "robe-textile-delicat",
    subject:
      "An elegant woman's sleeveless dress with thin straps, cinched waist, flared trapeze skirt, soft salmon pink pastel color, fluid flowing line.",
  },
  {
    slug: "pull-maille",
    subject:
      "A round-neck long-sleeve knit sweater in soft teal/water green color, resting folded on a rectangular wooden shelf, knit texture suggested by horizontal wavy zigzag lines.",
  },
  {
    slug: "manteau-doudoune",
    subject:
      "A short quilted puffer jacket with fur-trimmed hood visible, central zipper, beige and light gray colors, quilted grid texture, white hood lining.",
  },
  // --- Linge de maison (4) ---
  {
    slug: "rideau-voilage",
    subject:
      "A double curtain hanging on a rod with rings, falling in symmetrical ruffles, off-white sheer fabric, brown wooden rod, soft blue-gray shadows in the folds.",
  },
  {
    slug: "nappe-chemin-table",
    subject:
      "A rectangular tablecloth draped over a table in three-quarter perspective, pale blue-gray silver color with subtle floral pattern, dark outline.",
  },
  {
    slug: "parure-lit",
    subject:
      "A bed set: pillow plus thick folded duvet, mattress suggested underneath, light turquoise duvet, white pillow, soft and fluffy appearance.",
  },
  {
    slug: "serviette-peignoir",
    subject:
      "A stack of three folded white terry towels next to an open white bathrobe with its belt, pure white with gray-blue outlines, soft fluffy texture.",
  },
  // --- Cuir et fourrure (3) ---
  {
    slug: "blouson-cuir",
    subject:
      "A brown leather motorcycle jacket (perfecto style), moto collar, asymmetric pockets, central zipper, brown leather color, black collar and cuffs, silver zippers.",
  },
  {
    slug: "manteau-fourrure",
    subject:
      "A loose fur coat with wide collar, fur texture suggested by short irregular lines, beige grayish fur color, visible dark lining.",
  },
  {
    slug: "bottes-accessoires-cuir",
    subject:
      "A pair of tall riding boots in cognac brown leather plus a small crossbody doctor bag, black soles, visible stitching on the leather.",
  },
  // --- Travail et uniformes (3) ---
  {
    slug: "costume-medical",
    subject:
      "Medical scrubs set: short-sleeve top with chest pocket plus drawstring jogger pants, medical turquoise sky blue color, clean and simple.",
  },
  {
    slug: "uniforme-hotellerie",
    subject:
      "A hospitality uniform: charcoal black crossed concierge vest jacket with white shirt and white tie visible, golden buttons, formal elegant style.",
  },
  {
    slug: "bleu-travail-securite",
    subject:
      "A thick work jacket in dark navy blue with horizontal hi-vis yellow reflective stripes on torso and sleeves, sturdy workwear style.",
  },
  // --- Textiles spéciaux (3) ---
  {
    slug: "costume-danse-sport",
    subject:
      "A sparkling one-piece dance leotard in night blue with white dots suggesting rhinestones, plus a pair of low light gray sneakers next to it.",
  },
  {
    slug: "sacs-bagages",
    subject:
      "A rigid gray anthracite trolley suitcase with black handles and wheels, plus a soft navy blue duffel bag placed in front of it.",
  },
  {
    slug: "jouet-peluche",
    subject:
      "A seated teddy bear with round head, caramel brown fur, lighter muzzle, blue bow tie at the neck, friendly expression.",
  },
  // --- Accessoires de mode (4) ---
  {
    slug: "cravate-foulard",
    subject:
      "A rolled necktie with blue gray white diagonal stripes on the left, and a knotted scarf with blue and orange paisley pattern on the right, fabric fold lines.",
  },
  {
    slug: "ceinture-tissu",
    subject:
      "Two intertwined belts: one wide woven brown belt and one thinner belt with rectangular golden bronze metal buckle, centered.",
  },
  {
    slug: "gants-cuir",
    subject:
      "A pair of brown orange leather gloves, palms facing the viewer, fingers closed, short wrists, smooth leather with stitching lines between fingers.",
  },
  {
    slug: "chapeau-casquette",
    subject:
      "A brown fedora hat with turned-up brim and black ribbon behind a teal blue baseball cap with curved visor and central button.",
  },
  // --- Petits textiles & linge de table (3) ---
  {
    slug: "mouchoir-tissu",
    subject:
      "A stack of four folded square handkerchiefs in a cool blue gradient (white, pale blue, turquoise, dark blue), horizontal lines showing thickness between each.",
  },
  {
    slug: "set-de-table",
    subject:
      "Two slightly offset rectangular placemats in cream beige color with golden ornamental border at the corners, simplified baroque style.",
  },
  {
    slug: "serviette-table",
    subject:
      "Three napkins folded into restaurant triangles standing against each other, in beige, terracotta, and teal colors.",
  },
  // --- Maison et décoration (4) ---
  {
    slug: "houssse-coussin",
    subject:
      "A square cushion seen from the front, blue-gray background with central mandala geometric pattern in cream and sage green, visible hem, damask fabric look.",
  },
  {
    slug: "chemin-de-table-deco",
    subject:
      "A long table runner seen in isometric three-quarter perspective, ethnic aztec pattern at the ends, cream background with turquoise bands and brown motifs, resting on a light wood surface.",
  },
  {
    slug: "tapis-bain",
    subject:
      "A horizontal rectangular bath rug in ecru off-white color, texture suggesting terry cotton or short fur with irregular lines, fluffy appearance.",
  },
  {
    slug: "decoration-murale-tissu",
    subject:
      "A rectangular wall hanging tapestry in macrame boho style with fringes at the bottom, large central blue-gray triangle on cream background framed by colored bands, suspended from a thin wooden dowel with string.",
  },
  // --- Articles spéciaux (4) ---
  {
    slug: "sac-main-tissu",
    subject:
      "A canvas tote bag in beige cream color with brown bottom, long handles, open top, minimalist reusable shopping bag style.",
  },
  {
    slug: "chaussettes-luxe",
    subject:
      "A pair of mid-calf luxury socks in slate blue gray color, crossed and overlapping, visible ribbing at the top edge, reinforced heel and toe suggested by a darker zone.",
  },
  {
    slug: "accessoire-animaux",
    subject:
      "A small knitted blue pet sweater with short sleeves and round neck next to a triangular knotted bandana with blue and white paisley pattern, small pet size.",
  },
  {
    slug: "houssse-vetement-perso",
    subject:
      "A garment protection bag (garment bag) in dark petrol blue, rectangular shape with triangular shoulders at the top, visible central vertical zipper with light line, small circular white logo printed at bottom right.",
  },
];

// ----------------------------------------------------------------
// Configuration d'exécution
// ----------------------------------------------------------------

const OUTPUT_DIR = path.join(process.cwd(), "public", "images", "articles");
const CONCURRENCY = 1;
const MAX_RETRIES = 4;
const SIZE = "1024x1024" as const;

// ----------------------------------------------------------------
// Utilitaires
// ----------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Génère une image avec retry. Renvoie true si succès. */
async function generateOne(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  article: ArticleDef
): Promise<{ slug: string; ok: boolean; error?: string; size?: number }> {
  const outPath = path.join(OUTPUT_DIR, `${article.slug}.png`);

  // Skip si déjà généré (reprise possible)
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
    return { slug: article.slug, ok: true, size: fs.statSync(outPath).size };
  }

  const prompt = STYLE_PREFIX + article.subject;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await zai.images.generations.create({
        prompt,
        size: SIZE,
      });
      const b64 = response.data?.[0]?.base64;
      if (!b64) throw new Error("Réponse sans base64");
      const buffer = Buffer.from(b64, "base64");
      fs.writeFileSync(outPath, buffer);
      return { slug: article.slug, ok: true, size: buffer.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        // Backoff exponentiel : 5s, 12s, 25s, 50s (évite le rate-limit 429)
        await sleep(5000 * (attempt + 1) * (attempt + 1));
        continue;
      }
      return { slug: article.slug, ok: false, error: msg };
    }
  }
  return { slug: article.slug, ok: false, error: "max retries" };
}

/** Map limitant la concurrence d'un async iterator. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) break;
        results[idx] = await fn(items[idx], idx);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

// ----------------------------------------------------------------
// Main
// ----------------------------------------------------------------

async function main() {
  console.log(
    `[generate-article-icons] Démarrage — ${ARTICLES.length} articles`
  );
  console.log(`[generate-article-icons] Output dir: ${OUTPUT_DIR}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const zai = await ZAI.create();
  const start = Date.now();
  let done = 0;
  let skipped = 0;
  let failed = 0;
  const failures: Array<{ slug: string; error?: string }> = [];

  const total = ARTICLES.length;
  await mapWithConcurrency(ARTICLES, CONCURRENCY, async (article) => {
    const existed = fs.existsSync(
      path.join(OUTPUT_DIR, `${article.slug}.png`)
    );
    const res = await generateOne(zai, article);
    done++;
    if (res.ok && existed && res.size && res.size > 1000) {
      skipped++;
      console.log(
        `[${done}/${total}] ⏭  ${article.slug} (déjà existant, ${Math.round(res.size / 1024)} KB)`
      );
    } else if (res.ok) {
      console.log(
        `[${done}/${total}] ✅ ${article.slug} (${res.size ? Math.round(res.size / 1024) : "?"} KB)`
      );
    } else {
      failed++;
      failures.push({ slug: article.slug, error: res.error });
      console.log(`[${done}/${total}] ❌ ${article.slug} — ${res.error}`);
    }
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log("");
  console.log(`[generate-article-icons] Terminé en ${elapsed}s`);
  console.log(`  ✅ Générés : ${done - failed - skipped}`);
  console.log(`  ⏭  Ignorés (déjà existants) : ${skipped}`);
  console.log(`  ❌ Échoués : ${failed}`);
  if (failures.length > 0) {
    console.log("  Détail des échecs :");
    for (const f of failures) {
      console.log(`    - ${f.slug}: ${f.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[generate-article-icons] Erreur fatale:", err);
  process.exit(1);
});
