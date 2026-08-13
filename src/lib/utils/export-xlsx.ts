/**
 * e-pressing — Export Excel (.xlsx) utilitaire générique (LOT 12.2)
 * -----------------------------------------------------------------
 * Génère un fichier .xlsx côté client (navigateur) à partir d'un jeu de
 * données + d'une définition de colonnes, puis déclenche le téléchargement.
 *
 * Bibliothèque : `xlsx` (SheetJS) v0.18.5 — déjà installée.
 *
 * Le fichier généré est nommé `{fileName}_{YYYY-MM-DD}.xlsx` (date du jour
 * au format ISO pour triabilité et compatibilité système de fichiers).
 *
 * ⚠️ Cette fonction DOIT être appelée côté client uniquement (elle accède à
 * `window`, `document`, `Blob`, `URL`). Elle n'est jamais exécutée côté
 * serveur. Un garde-fou lève une erreur explicite si appelée dans un SSR.
 *
 * Conventions de formatage (PROJECT_CONTEXT.md) :
 *   - Montants : nombre entier simple SANS suffixe "FCFA" dans le fichier
 *     Excel (pour permettre les calculs / sommes dans Excel).
 *   - Dates    : chaîne "JJ/MM/AAAA" (format français).
 *   - Enums    : libellés français lisibles (ex : "Espèces" et non "especes").
 *
 * L'appelant est responsable du formatage des valeurs AVANT de les passer
 * à cette fonction. Les valeurs `null` / `undefined` sont remplacées par
 * une chaîne vide "" dans la cellule Excel.
 */
import * as XLSX from "xlsx";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

/** Définition d'une colonne pour l'export Excel. */
export interface ExportColumn {
  /** Clé de la propriété dans les objets de `data`. */
  key: string;
  /** En-tête de colonne affiché dans la 1re ligne du fichier Excel. */
  header: string;
}

/* -------------------------------------------------------------------------- */
/*  FONCTION PRINCIPALE                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Génère et télécharge un fichier .xlsx à partir de données structurées.
 *
 * @param data     - Tableau d'objets (1 ligne = 1 objet). Les clés doivent
 *                   correspondre aux `key` des colonnes.
 * @param columns  - Liste ordonnée des colonnes (l'ordre définit l'ordre
 *                   des colonnes dans le fichier Excel).
 * @param fileName - Nom de base du fichier (sans extension). La date du jour
 *                   sera ajoutée automatiquement : `{fileName}_{YYYY-MM-DD}.xlsx`.
 *
 * @example
 *   exportToExcel(
 *     [
 *       { ticket: "CMD-001", client: "Awa", montant: 5000 },
 *       { ticket: "CMD-002", client: "Koffi", montant: 3000 },
 *     ],
 *     [
 *       { key: "ticket",  header: "Numéro ticket" },
 *       { key: "client",  header: "Client" },
 *       { key: "montant", header: "Montant total" },
 *     ],
 *     "rapport_journalier"
 *   );
 *   // → télécharge "rapport_journalier_2026-07-24.xlsx"
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  fileName: string
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(
      "[exportToExcel] Cette fonction doit être appelée côté client (navigateur) uniquement."
    );
  }

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("[exportToExcel] Aucune colonne définie pour l'export.");
  }

  /* -------- 1. Construction de la matrice (array of arrays) -------- */
  // 1re ligne = en-têtes de colonnes
  const aoa: unknown[][] = [];
  aoa.push(columns.map((c) => c.header));

  // Lignes suivantes = données (1 ligne par objet)
  for (const row of data) {
    aoa.push(columns.map((c) => formatCellValue(row[c.key])));
  }

  /* -------- 2. Création de la feuille de calcul -------- */
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Largeurs de colonnes adaptatives (basées sur la longueur de l'en-tête,
  // avec un minimum de 12 et un maximum de 40 caractères)
  ws["!cols"] = columns.map((c) => ({
    wch: Math.min(Math.max(c.header.length + 4, 12), 40),
  }));

  // Fige la 1re ligne (en-têtes) pour une meilleure lisibilité au scroll
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" } as unknown as XLSX.WorkSheet["!freeze"];

  /* -------- 3. Création du classeur -------- */
  const wb = XLSX.utils.book_new();
  // Nom de la feuille : 31 caractères max (limite Excel), sans caractères spéciaux
  const sheetName = sanitizeSheetName(fileName);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  /* -------- 4. Génération binaire + téléchargement -------- */
  const wbout = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;

  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const fullFileName = `${fileName}_${dateStr}.xlsx`;

  // Téléchargement via un <a> temporaire
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fullFileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Libère l'URL après un court délai (le téléchargement doit démarrer)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* -------------------------------------------------------------------------- */
/*  HELPERS INTERNES                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Formate une valeur de cellule pour Excel :
 *   - null / undefined → "" (cellule vide)
 *   - boolean → "Oui" / "Non" (lisibilité FR)
 *   - tout le reste → la valeur brute (string, number)
 *
 * Les montants et dates doivent déjà être formatés par l'appelant (nombre
 * entier pour les montants, chaîne "JJ/MM/AAAA" pour les dates).
 */
function formatCellValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "Oui" : "Non";
  }
  return value;
}

/**
 * Nettoie un nom de fichier pour en faire un nom de feuille Excel valide :
 *   - 31 caractères max (limite Excel)
 *   - sans caractères interdits : : \ / ? * [ ]
 */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "_").trim();
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned || "Rapport";
}
