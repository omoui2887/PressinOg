/**
 * OgPressing — POS / Caisse : formatage
 * =====================================
 * Formatage FCFA / dates adapté à l'écran POS. Le suffixe "Fcfa" (casse
 * mixte) correspond à l'interface de référence.
 */

/** Formate un entier en FCFA : 2000 → "2 000 Fcfa". */
export function formatFcfa(montant: number | null | undefined): string {
  if (montant === null || montant === undefined || Number.isNaN(montant)) {
    return "0 Fcfa";
  }
  const entier = Math.trunc(montant);
  const signe = entier < 0 ? "-" : "";
  const abs = Math.abs(entier)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  return `${signe}${abs}\u202FFcfa`;
}

/** Formate une date ISO en JJ/MM/AAAA (pour les inputs date). */
export function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Formate une date ISO en HH:mm (pour les inputs time). */
export function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00:00";
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${mi}`;
}

/** Construit un ISO à partir d'une date (JJ/MM/AAAA inversé) + heure HH:mm. */
export function isoFromDateTime(date: string, time: string): string {
  // date = "2024-07-25", time = "09:08"
  const [y, mo, da] = date.split("-").map((x) => parseInt(x, 10));
  const [h, mi] = time.split(":").map((x) => parseInt(x, 10));
  const d = new Date(y || 2024, (mo || 1) - 1, da || 1, h || 0, mi || 0, 0, 0);
  return d.toISOString();
}

/** Formate une date ISO en JJ/MM/AAAA HH:mm lisible. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const da = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${da}/${mo}/${y} ${h}:${mi}`;
}
