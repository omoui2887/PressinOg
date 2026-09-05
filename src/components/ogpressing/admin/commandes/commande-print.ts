/**
 * e-pressing — Helpers d'impression pour la fiche commande (LOT 7.6)
 * ------------------------------------------------------------------
 * Fonctions d'impression du ticket client et des étiquettes articles,
 * réutilisées depuis la page de détail commande (/admin/commandes/[id]).
 *
 * Approche : `window.open()` + `document.write()` (même pattern que
 * `step-confirmation.tsx` du wizard). Le HTML imprimé est isolé du style
 * principal de l'app, ce qui permet un format ticket (80mm) et étiquettes
 * thermiques (100mm) dédiés.
 *
 * Dépendances CDN (dans la fenêtre d'impression) :
 *   - qrcode@1.5.4  : rendu du QR Code sur `<canvas>`
 *   - jsbarcode@3.12.3 : rendu du code-barres CODE128 sur `<svg>`
 *
 * ⚠️ Ces fonctions utilisent `window` et `toast` (sonner) — à appeler
 *    uniquement depuis un Client Component.
 */
import { toast } from "sonner";
import { formatDate, formatDateOnly, formatFCFA } from "@/lib/utils/format";
import {
  COULEUR_LABELS,
  ETAT_LABELS,
  TYPE_VETEMENT_LABELS,
} from "@/components/ogpressing/admin/commande-wizard/article-labels";
import { METHODE_PAIEMENT_LABELS } from "@/components/ogpressing/admin/commande-wizard/remise-labels";
import {
  STATUT_PAIEMENT_LABELS,
  STATUT_LABELS,
} from "./commandes-helpers";

// ============================================================
// Types — shape du détail commande (GET /api/admin/commandes/[id])
// ============================================================

export interface CommandeDetailClient {
  id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
  adresse: string | null;
  points_fidelite: number;
}

export interface CommandeDetailService {
  id: string;
  nom: string;
  type: string | null;
}

export interface CommandeDetailLigne {
  id: string;
  service_id: string | null;
  /** Ancienne colonne ENUM (renommée par la migration LOT 15).
   *  Optionnel car non systématiquement sélectionné (la requête
   *  minimale ne l'inclut pas — voir src/lib/queries/commande-detail.ts). */
  type_vetement_legacy?: string | null;
  description: string | null;
  quantite: number;
  prix_unitaire: number;
  montant_ligne: number;
  created_at: string;
  service: CommandeDetailService | null;
}

export interface CommandeDetailCatalogueArticle {
  id: string;
  nom: string;
  slug: string;
  icone_url: string | null;
}

export interface CommandeDetailArticle {
  id: string;
  ligne_id: string | null;
  code_qr: string | null;
  /** FK vers catalogue_articles (LOT 15). */
  catalogue_article_id: string | null;
  /** Article catalogue joint (nom lisible pour l'utilisateur).
   *  Optionnel : absent si la requête minimale est utilisée (FK
   *  catalogue_articles non résolvable par PostgREST). */
  catalogue_article?: CommandeDetailCatalogueArticle | null;
  /** Ancien ENUM figé (renommé par LOT 15, conservé pour l'historique).
   *  Optionnel : absent si la colonne n'a pas été renommée. */
  type_vetement_legacy?: string | null;
  couleur: string | null;
  couleur_libre: string | null;
  etat: string | null;
  description_etat: string | null;
  statut: string;
  photo_url: string | null;
  assigne_a: string | null;
  /** Code du casier de stockage (ex: "A1") quand l'article est propre et rangé.
   *  Optionnel : absent si la migration 015 n'est pas appliquée. */
  zone_stockage?: string | null;
  /** Date à laquelle l'article a été rangé dans le casier.
   *  Optionnel : absent si la migration 015 n'est pas appliquée. */
  date_rangeement?: string | null;
  /** Personnel (FK personnel.id) qui a rangé l'article dans le casier.
   *  Optionnel : absent si la migration 015 n'est pas appliquée. */
  rangee_par?: string | null;
  /** Objet imbriqué du personnel qui a rangé l'article (nom lisible).
   *  Optionnel : absent si la migration 015 n'est pas appliquée. */
  range_par?: { id: string; nom_complet: string } | null;
  created_at: string;
  assigne: { id: string; nom_complet: string } | null;
}

export interface CommandeDetailPaiement {
  id: string;
  montant: number;
  methode: string;
  reference: string | null;
  date_paiement: string;
  est_acompte: boolean;
  enregistre_par: string | null;
  notes: string | null;
  /** 'actif' (valide) | 'annule' (annulé par reversal). Migration 035/043. */
  statut_row?: "actif" | "annule";
  created_at: string;
}

export interface CommandeDetail {
  id: string;
  pressing_id: string;
  numero_commande: string;
  statut: string;
  statut_paiement: string;
  montant_total: number;
  montant_paye: number;
  remise_type: string | null;
  remise_valeur: number | null;
  montant_total_avant_remise: number | null;
  montant_remise: number | null;
  date_reception: string | null;
  date_pret_prevue: string | null;
  date_pret_reel: string | null;
  date_livraison: string | null;
  date_retrait: string | null;
  livraison: boolean;
  adresse_livraison: string | null;
  frais_livraison: number | null;
  notes: string | null;
  cree_par: string | null;
  created_at: string;
  updated_at: string | null;
  priorite?: string | null;
  client: CommandeDetailClient | null;
  cree_par_personnel: { id: string; nom_complet: string } | null;
  lignes: CommandeDetailLigne[];
  articles: CommandeDetailArticle[];
  paiements: CommandeDetailPaiement[];
}

// ============================================================
// Helpers de libellé article
// ============================================================

/** Libellé lisible d'un type d'article. Priorise le catalogue
 *  (LOT 15) et bascule sur l'ancien ENUM legacy si le catalogue
 *  n'est pas renseigné (vieilles commandes pré-migration). Tous
 *  les champs sont optionnels car la requête minimale (fallback)
 *  ne les inclut pas forcément. */
function typeLabel(a: {
  catalogue_article?: CommandeDetailCatalogueArticle | null;
  type_vetement_legacy?: string | null;
}): string {
  if (a.catalogue_article?.nom) return a.catalogue_article.nom;
  const t = a.type_vetement_legacy;
  if (!t) return "—";
  return TYPE_VETEMENT_LABELS[t as keyof typeof TYPE_VETEMENT_LABELS] ?? t;
}

function couleurLabel(c: string | null, libre: string | null): string {
  if (!c) return "";
  if (c === "autre" && libre) return libre;
  return COULEUR_LABELS[c as keyof typeof COULEUR_LABELS] ?? c;
}

function etatLabel(e: string | null): string {
  if (!e) return "—";
  return ETAT_LABELS[e as keyof typeof ETAT_LABELS] ?? e;
}

/** Description courte « Type Couleur » pour un article. */
export function articleDescription(a: CommandeDetailArticle): string {
  const t = typeLabel(a);
  const c = couleurLabel(a.couleur, a.couleur_libre);
  return c ? `${t} ${c}` : t;
}

// ============================================================
// Helpers d'impression
// ============================================================

function escapeHtml(s: string | null | undefined | number): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openPrintWindow(title: string, headHtml: string, bodyHtml: string) {
  const w = window.open("", "_blank", "width=480,height=720");
  if (!w) {
    toast.error(
      "Impossible d'ouvrir la fenêtre d'impression (vérifiez le bloqueur de pop-ups)."
    );
    return;
  }
  w.document.open();
  w.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${headHtml}
</head>
<body>
${bodyHtml}
</body>
</html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* No-op */
    }
  }, 250);
}

/**
 * Imprime le ticket client : en-tête e-pressing, numéro de ticket (mono),
 * QR Code (rendu via CDN `qrcode` sur `<canvas>`), récap articles, total,
 * statut paiement, date de retrait prévue.
 */
export function printCommandeTicket(detail: CommandeDetail) {
  // PRD §13.1 : le payload QR contient { commande_id, numero_ticket, pressing_id }.
  // `numero_ticket` correspond à `commandes.numero_commande` (champ DB, format
  // CMD-AAAA-NNNNN) — c'est le numéro lisible imprimé sur le ticket. On utilise
  // le nom de champ `numero_ticket` dans le payload JSON pour se conformer au
  // contrat PRD (un scanner externe qui s'attend à `numero_ticket` matchera).
  const qrPayload = JSON.stringify({
    commande_id: detail.id,
    numero_ticket: detail.numero_commande,
    pressing_id: detail.pressing_id,
  });

  const lignesHtml = (detail.lignes ?? [])
    .map((l) => {
      const svc = l.service?.nom ?? "—";
      // Pour une ligne, on n'a plus de type_vetement direct (colonne
      // renommée legacy). On privilégie la description libre si elle
      // existe, sinon on dérive le nom du catalogue via le 1er article
      // rattaché à cette ligne. Si rien n'est disponible, on affiche « — ».
      const firstArt = (detail.articles ?? []).find(
        (a) => a.ligne_id === l.id
      );
      const t =
        l.description?.trim() ||
        (firstArt ? typeLabel(firstArt) : "—");
      return `<tr>
        <td style="padding:2px 4px;border-bottom:1px solid #eee;">${escapeHtml(
          t
        )}</td>
        <td style="padding:2px 4px;border-bottom:1px solid #eee;">${escapeHtml(
          svc
        )}</td>
        <td style="padding:2px 4px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(
          String(l.quantite)
        )}</td>
        <td style="padding:2px 4px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(
          formatFCFA(l.prix_unitaire)
        )}</td>
      </tr>`;
    })
    .join("");

  const totalAvantRemise = (detail.lignes ?? []).reduce(
    (sum, l) => sum + l.prix_unitaire * l.quantite,
    0
  );
  const remiseMontant =
    detail.montant_remise ?? Math.max(0, totalAvantRemise - detail.montant_total);

  const headHtml = `
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, "Courier New", monospace;
      margin: 0;
      padding: 8px;
      color: #000;
      background: #fff;
      width: 80mm;
    }
    .center { text-align: center; }
    .header { border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
    .brand { font-size: 18px; font-weight: 700; letter-spacing: 1px; }
    .ticket-no { font-size: 16px; font-weight: 700; margin: 6px 0; }
    .label { font-size: 10px; color: #444; text-transform: uppercase; letter-spacing: 0.5px; }
    .value { font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 6px 0; }
    th { text-align: left; padding: 2px 4px; border-bottom: 1px solid #000; font-size: 10px; }
    .total { font-size: 14px; font-weight: 700; margin-top: 6px; }
    .footer { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #000; font-size: 10px; text-align: center; color: #444; }
    #qrcode-canvas { display: block; margin: 6px auto; }
    @media print {
      body { width: auto; padding: 0; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>`;

  const bodyHtml = `
  <div class="header center">
    <div class="brand">e-pressing</div>
    <div class="label">Ticket de dépôt</div>
  </div>

  <div class="center">
    <div class="label">Numéro de ticket</div>
    <div class="ticket-no">${escapeHtml(detail.numero_commande)}</div>
  </div>

  <div class="center">
    <canvas id="qrcode-canvas" width="160" height="160"></canvas>
  </div>

  <div style="margin-top:6px;">
    <div><span class="label">Client :</span> <span class="value">${escapeHtml(
      detail.client?.nom_complet ?? "—"
    )}</span></div>
    <div><span class="label">Articles :</span> <span class="value">${escapeHtml(
      String(detail.articles?.length ?? 0)
    )}</span></div>
    <div><span class="label">Date de retrait prévue :</span> <span class="value">${escapeHtml(
      formatDateOnly(detail.date_pret_prevue)
    )}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Type</th>
        <th>Service</th>
        <th style="text-align:right;">Qté</th>
        <th style="text-align:right;">P.U.</th>
      </tr>
    </thead>
    <tbody>
      ${lignesHtml || '<tr><td colspan="4" style="text-align:center;">—</td></tr>'}
    </tbody>
  </table>

  ${
    remiseMontant > 0
      ? `<div style="font-size:11px;text-align:right;">Remise : −${escapeHtml(
          formatFCFA(remiseMontant)
        )}</div>`
      : ""
  }
  <div class="total" style="text-align:right;">
    Total : ${escapeHtml(formatFCFA(detail.montant_total))}
  </div>
  <div style="font-size:11px;text-align:right;">
    Acompte : ${escapeHtml(formatFCFA(detail.montant_paye))}
  </div>
  <div style="font-size:11px;text-align:right;">
    Reste à payer : ${escapeHtml(
      formatFCFA(detail.montant_total - detail.montant_paye)
    )}
  </div>
  <div style="font-size:11px;text-align:right;margin-top:4px;">
    Statut paiement : <strong>${escapeHtml(
      STATUT_PAIEMENT_LABELS[detail.statut_paiement] ?? detail.statut_paiement
    )}</strong>
  </div>

  <div class="footer">
    Conservez ce ticket. Il sera demandé pour le retrait de vos articles.
    <br />Scannez le QR Code pour suivre l'état de votre commande.
  </div>

  <script>
    try {
      if (window.QRCode) {
        QRCode.toCanvas(
          document.getElementById("qrcode-canvas"),
          ${JSON.stringify(qrPayload)},
          { width: 160, margin: 1, color: { dark: "#000000", light: "#ffffff" } },
          function (err) {
            if (err) console.error(err);
          }
        );
      }
    } catch (e) {
      console.error("QR render error", e);
    }
  </script>`;

  openPrintWindow(`Ticket ${detail.numero_commande}`, headHtml, bodyHtml);
}

/**
 * Imprime une feuille d'étiquettes (une par article). Chaque étiquette
 * contient : numéro de ticket, description article (Type Couleur),
 * code-barres CODE128 du champ `code_qr`, texte du code-barres.
 */
export function printCommandeLabels(detail: CommandeDetail) {
  const articles = detail.articles ?? [];
  if (articles.length === 0) {
    toast.error("Aucun article à imprimer.");
    return;
  }

  const labelsHtml = articles
    .map((a, idx) => {
      const desc = articleDescription(a);
      const etat = etatLabel(a.etat);
      // PRD §13.2 : code-barres = article_id + commande_id concaténés
      // (avec séparateur `|` pour faciliter le parsing au scan). On n'utilise
      // plus `articles_vetements.code_qr` (champ interne court) — un scanner
      // externe peut désormais reconstruire les FK article + commande.
      const barcodeValue = `${a.id}|${detail.id}`;
      return `<div class="label-sticker">
        <div class="brand">e-pressing</div>
        <div class="ticket-no">${escapeHtml(detail.numero_commande)}</div>
        <div class="article-info">${escapeHtml(desc)} — ${escapeHtml(etat)}</div>
        <div class="article-index">Article ${idx + 1} / ${articles.length}</div>
        <svg class="barcode-svg" id="barcode-${idx}" data-code="${escapeHtml(
          barcodeValue
        )}"></svg>
        <div class="code-text">${escapeHtml(barcodeValue)}</div>
      </div>`;
    })
    .join("");

  const headHtml = `
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, "Courier New", monospace;
      margin: 0;
      padding: 0;
      color: #000;
      background: #fff;
    }
    .label-sticker {
      width: 100mm;
      max-width: 100%;
      padding: 4mm;
      text-align: center;
      page-break-after: always;
      border-bottom: 1px dashed #ccc;
    }
    .label-sticker:last-child { page-break-after: auto; }
    .brand { font-size: 12px; font-weight: 700; letter-spacing: 1px; }
    .ticket-no { font-size: 14px; font-weight: 700; margin: 2px 0; }
    .article-info { font-size: 10px; margin: 2px 0; }
    .article-index { font-size: 9px; color: #444; margin-bottom: 4px; }
    .barcode-svg { display: block; margin: 0 auto; }
    .code-text { font-size: 9px; color: #444; margin-top: 2px; word-break: break-all; }
    @media print {
      .label-sticker { border: none; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js"></script>`;

  const bodyHtml = `${labelsHtml}
  <script>
    (function () {
      try {
        var svgs = document.querySelectorAll("svg.barcode-svg");
        svgs.forEach(function (svg) {
          var code = svg.getAttribute("data-code");
          if (!code) return;
          try {
            window.JsBarcode(svg, code, {
              format: "CODE128",
              width: 2,
              height: 50,
              displayValue: true,
              fontSize: 12,
              margin: 4
            });
          } catch (e) {
            console.warn("JsBarcode error", e);
          }
        });
      } catch (e) {
        console.error("Barcode init error", e);
      }
    })();
  </script>`;

  openPrintWindow(`Étiquettes ${detail.numero_commande}`, headHtml, bodyHtml);
}

/** Libellé FR d'une méthode de paiement (utilisé par la liste des paiements). */
export function methodePaiementLabel(m: string): string {
  return (
    METHODE_PAIEMENT_LABELS[m as keyof typeof METHODE_PAIEMENT_LABELS] ?? m
  );
}

// ============================================================
// Reçu de paiement imprimable — PRD §12.2
// ============================================================

/**
 * Shape minimal d'une commande pour l'impression du reçu de paiement.
 * `montant_paye` correspond au **cumul payé après** le paiement courant
 * (et non au montant de ce paiement seul).
 */
export interface PaiementReceiptCommande {
  numero_commande: string;
  client_nom: string;
  montant_total: number;
  /** Cumul déjà payé (après ce paiement). */
  montant_paye: number;
}

/** Shape minimal d'un paiement pour l'impression du reçu. */
export interface PaiementReceiptPaiement {
  montant: number;
  methode: string;
  reference: string | null;
  created_at: string;
}

/**
 * Imprime un reçu de paiement (PRD §12.2).
 *
 * Format A5 portrait — plus large qu'un ticket de dépôt (80 mm) car le
 * reçu de paiement est généralement remis au client sur papier A4/A5 et
 * non sur papier thermique. Inclut :
 *   - En-tête : nom du pressing + date du jour
 *   - Titre « REÇU DE PAIEMENT »
 *   - Numéro de commande + nom du client
 *   - Méthode de paiement (libellé FR)
 *   - Montant du paiement (FCFA)
 *   - Référence (si fournie — ex : TX-MOMO-123456)
 *   - Total payé à ce jour (cumul)
 *   - Reste à payer
 *   - Pied « Merci de votre confiance »
 *
 * @example
 *   printPaiementReceipt(
 *     { numero_commande: "PRS-2026-00123", client_nom: "Awa KONÉ",
 *       montant_total: 12500, montant_paye: 12500 },
 *     { montant: 5000, methode: "especes", reference: null,
 *       created_at: "2026-07-24T14:30:00Z" },
 *     "e-pressing Cocody"
 *   );
 */
export function printPaiementReceipt(
  commande: PaiementReceiptCommande,
  paiement: PaiementReceiptPaiement,
  pressingNom?: string
) {
  const resteAPayer = Math.max(
    0,
    commande.montant_total - commande.montant_paye
  );
  const methodeLabel = methodePaiementLabel(paiement.methode);
  const enTeteNom = pressingNom?.trim() || "e-pressing";

  const headHtml = `
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 16px;
      color: #000;
      background: #fff;
      max-width: 148mm; /* A5 largeur */
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .brand { font-size: 16px; font-weight: 700; }
    .date { font-size: 11px; color: #444; text-align: right; }
    .title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 1px;
      text-align: center;
      margin: 8px 0 16px;
    }
    .section { margin-bottom: 12px; }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 13px;
      border-bottom: 1px dotted #ccc;
    }
    .row .label { color: #444; }
    .row .value { font-weight: 600; text-align: right; }
    .highlight {
      background: #f5f5f5;
      padding: 8px 12px;
      border-radius: 4px;
      margin: 12px 0;
    }
    .highlight .row:last-child { border-bottom: none; }
    .amount-paid {
      font-size: 20px;
      font-weight: 700;
      text-align: center;
      padding: 12px;
      margin: 12px 0;
      border: 2px solid #000;
      border-radius: 4px;
    }
    .reference {
      font-family: ui-monospace, "Courier New", monospace;
      font-size: 12px;
    }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 2px solid #000;
      text-align: center;
      font-size: 12px;
      color: #444;
    }
    .footer .thanks { font-weight: 600; font-size: 14px; color: #000; margin-bottom: 4px; }
    @media print {
      body { max-width: none; padding: 0; }
      @page { margin: 10mm; }
    }
  </style>`;

  const bodyHtml = `
  <div class="header">
    <div class="brand">${escapeHtml(enTeteNom)}</div>
    <div class="date">Émis le ${escapeHtml(formatDate(paiement.created_at))}</div>
  </div>

  <div class="title">REÇU DE PAIEMENT</div>

  <div class="section">
    <div class="row">
      <span class="label">N° commande</span>
      <span class="value">${escapeHtml(commande.numero_commande)}</span>
    </div>
    <div class="row">
      <span class="label">Client</span>
      <span class="value">${escapeHtml(commande.client_nom || "—")}</span>
    </div>
    <div class="row">
      <span class="label">Mode de paiement</span>
      <span class="value">${escapeHtml(methodeLabel)}</span>
    </div>
    ${
      paiement.reference
        ? `<div class="row">
            <span class="label">Référence</span>
            <span class="value reference">${escapeHtml(paiement.reference)}</span>
          </div>`
        : ""
    }
  </div>

  <div class="amount-paid">
    Montant payé : ${escapeHtml(formatFCFA(paiement.montant))}
  </div>

  <div class="highlight">
    <div class="row">
      <span class="label">Total payé à ce jour</span>
      <span class="value">${escapeHtml(formatFCFA(commande.montant_paye))}</span>
    </div>
    <div class="row">
      <span class="label">Montant total commande</span>
      <span class="value">${escapeHtml(formatFCFA(commande.montant_total))}</span>
    </div>
    <div class="row">
      <span class="label">Reste à payer</span>
      <span class="value">${escapeHtml(formatFCFA(resteAPayer))}</span>
    </div>
  </div>

  <div class="footer">
    <div class="thanks">Merci de votre confiance</div>
    <div>Conservez ce reçu pour le suivi de votre commande.</div>
  </div>`;

  openPrintWindow(`Reçu ${commande.numero_commande}`, headHtml, bodyHtml);
}

// ============================================================
// Facture imprimable — design moderne inspiré du modèle client
// ============================================================

/**
 * Informations du pressing nécessaires pour l'en-tête de la facture.
 * Récupérées depuis la table `pressing` (migration 002 + 010).
 */
export interface PressingInfo {
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  ville: string | null;
  commune: string | null;
  logo_url: string | null;
}

/** Badge de statut paiement : libellé + couleur (vert si payé, sinon gris/jaune/rouge). */
function paiementBadge(statut: string): { label: string; bg: string; fg: string } {
  switch (statut) {
    case "paye":
      return { label: "Payée", bg: "#16a34a", fg: "#ffffff" };
    case "partiel":
      return { label: "Partiel", bg: "#d97706", fg: "#ffffff" };
    case "non_paye":
      return { label: "Impayée", bg: "#dc2626", fg: "#ffffff" };
    default:
      return { label: statut, bg: "#6b7280", fg: "#ffffff" };
  }
}

/** Badge d'état commande : « Terminée » si retirée/livrée, sinon « En cours ». */
function commandeEtatBadge(statut: string): { label: string; bg: string; fg: string } {
  const termine = statut === "retire" || statut === "livre";
  return termine
    ? { label: "Terminée", bg: "#16a34a", fg: "#ffffff" }
    : { label: "En cours", bg: "#6b7280", fg: "#ffffff" };
}

/**
 * Libellé FR d'une couleur de vêtement pour la facture.
 * Réutilise COULEUR_LABELS mais avec une majuscule initiale.
 */
function couleurLabelForFacture(couleur: string, couleurLibre?: string | null): string | null {
  if (!couleur) return null;
  if (couleur === "autre" && couleurLibre) {
    return couleurLibre.charAt(0).toUpperCase() + couleurLibre.slice(1);
  }
  const labels: Record<string, string> = {
    blanc: "Blanc",
    noir: "Noir",
    bleu: "Bleu",
    rouge: "Rouge",
    vert: "Vert",
    jaune: "Jaune",
    gris: "Gris",
    marron: "Marron",
    autre: "Autre",
  };
  const label = labels[couleur] || couleur;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Libellé FR d'un état de vêtement pour la facture.
 */
function etatLabelForFacture(etat: string): string | null {
  if (!etat) return null;
  const labels: Record<string, string> = {
    bon: "Bon",
    correct: "Correct",
    use: "Usé",
    tache: "Taché",
    abime: "Abîmé",
  };
  const label = labels[etat] || etat;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Imprime une facture au format A4 (portrait), design moderne et épuré.
 *
 * Structure (inspirée du modèle fourni par le client) :
 *   1. En-tête 3 colonnes :
 *      - Gauche  : logo + nom du pressing + adresse + téléphone + email
 *      - Centre  : « À » + nom du client + adresse + téléphone + email
 *      - Droite  : date de facturation, n° facture, badge statut paiement,
 *                  n° commande, badge état commande, date de retrait
 *   2. Tableau des prestations : Prestation | Prix unitaire | Qté | Total
 *   3. Zone totaux (alignée à droite) : sous-total, remise éventuelle, montant total
 *   4. Pied de page : remerciement + coordonnées du pressing
 */
export function printFacture(
  detail: CommandeDetail,
  pressing?: PressingInfo | null
) {
  const p = pressing ?? ({} as Partial<PressingInfo>);
  const nomPressing = p.nom?.trim() || "e-pressing";

  // Construction de l'adresse complète du pressing
  const adresseParts = [
    p.adresse,
    [p.commune, p.ville].filter(Boolean).join(" — "),
  ].filter(Boolean);
  const adressePressing = adresseParts.join(", ");

  // Coordonnées de contact du pressing
  const contactLines: string[] = [];
  if (adressePressing) contactLines.push(adressePressing);
  if (p.telephone) contactLines.push(`Tél : ${p.telephone}`);
  if (p.email) contactLines.push(p.email);

  // Infos client (section « À »)
  const client = detail.client;
  const clientAdresseParts = [
    client?.adresse,
    client?.telephone ? `Tél : ${client.telephone}` : null,
    client?.email,
  ].filter(Boolean);

  // Badge statut paiement
  const pmtBadge = paiementBadge(detail.statut_paiement);
  const etatBadge = commandeEtatBadge(detail.statut);

  // Numéro de facture : on réutilise le numero_commande (unique, traçable)
  const numeroFacture = detail.numero_commande;

  // Date de facturation = date de réception (début de la commande)
  const dateFacture = formatDateOnly(detail.date_reception) || formatDate(detail.created_at);
  const dateRetrait =
    formatDateOnly(detail.date_retrait) ||
    formatDateOnly(detail.date_pret_prevue) ||
    "—";

  // Lignes groupées par catégorie d'article (modèle de facture par cartes)
  // Chaque catégorie devient une "carte" avec son nom en titre, puis la
  // liste des services associés pour chaque vêtement. Alternance de fond
  // blanc / bleu-gris clair.
  // Chaque article est listé individuellement avec : nom + couleur, service,
  // état, prix unitaire, quantité, total.
  const categoriesMap = new Map<
    string, // nom de la catégorie (ex: "Costumes & Vêtements de Cérémonie")
    {
      vetementNom: string; // nom complet du vêtement (ex: "Costumes & Vêtements de Cérémonie Blanc")
      serviceName: string;
      prixUnitaire: number;
      quantite: number;
      total: number;
      isExpress: boolean;
      note: string | null;
      etat: string | null; // état du vêtement (ex: "Bon", "Correct")
      couleur: string | null; // couleur du vêtement (ex: "Blanc")
    }[]
  >();

  for (const l of detail.lignes ?? []) {
    // Détermine la catégorie : nom du catalogue de l'article rattaché,
    // sinon description de la ligne, sinon "Divers".
    const firstArt = (detail.articles ?? []).find(
      (a) => a.ligne_id === l.id
    );
    const categorie =
      firstArt?.catalogue_article?.nom ||
      l.description?.trim() ||
      "Divers";
    const serviceName = l.service?.nom || "Prestation";
    const pu = l.prix_unitaire;
    const qte = l.quantite;
    const total = l.montant_ligne ?? pu * qte;
    const isExpress = detail.priorite === "express";
    const note = l.description?.trim() || null;

    // Nom complet du vêtement : nom du catalogue + couleur si présente
    const catalogueNom = firstArt?.catalogue_article?.nom || l.description?.trim() || "Vêtement";
    const couleurLabel = firstArt?.couleur
      ? couleurLabelForFacture(firstArt.couleur, firstArt.couleur_libre)
      : null;
    const vetementNom = couleurLabel
      ? `${catalogueNom} ${couleurLabel}`
      : catalogueNom;

    // État du vêtement (libellé FR)
    const etat = firstArt?.etat ? etatLabelForFacture(firstArt.etat) : null;

    if (!categoriesMap.has(categorie)) {
      categoriesMap.set(categorie, []);
    }
    categoriesMap.get(categorie)!.push({
      vetementNom,
      serviceName,
      prixUnitaire: pu,
      quantite: qte,
      total,
      isExpress,
      note,
      etat,
      couleur: couleurLabel,
    });
  }

  // Génère le HTML des cartes par catégorie
  const lignesHtml = Array.from(categoriesMap.entries())
    .map(([categorieName, services], idx) => {
      const isAlt = idx % 2 === 1; // alternance de fond
      const servicesHtml = services
        .map(
          (s, sIdx) => `
          <div class="cat-service-row">
            <div class="cat-service-info">
              <div class="cat-vetement-nom">
                ${escapeHtml(s.vetementNom)}
              </div>
              <div class="cat-service-detail">
                <span class="cat-bullet">•</span>
                <span class="cat-service-label">Service :</span>
                <span class="cat-service-value">${escapeHtml(s.serviceName)}</span>
                ${s.etat ? `<span class="cat-etat-badge">État: ${escapeHtml(s.etat)}</span>` : ""}
              </div>
            </div>
            <div class="cat-service-price">${escapeHtml(formatFCFA(s.prixUnitaire))}</div>
            <div class="cat-service-qte">${escapeHtml(String(s.quantite))}</div>
            <div class="cat-service-total">${escapeHtml(formatFCFA(s.total))}</div>
          </div>`
        )
        .join("");
      // Badges EXPRESS + note (affichés si la commande est express ou si note)
      const badgesHtml =
        services.some((s) => s.isExpress) || services.some((s) => s.note)
          ? `<div class="cat-badges">
              ${
                services.some((s) => s.isExpress)
                  ? `<span class="cat-badge-express">⚡ EXPRESS</span>`
                  : ""
              }
              ${
                services.some((s) => s.note)
                  ? `<span class="cat-badge-note">✎ note</span>`
                  : ""
              }
            </div>`
          : "";
      return `
        <div class="category-card ${isAlt ? "category-card-alt" : ""}">
          <div class="category-title">${escapeHtml(categorieName)}</div>
          <div class="cat-header-row">
            <div class="cat-col-service">Vêtement & Service</div>
            <div class="cat-col-prix">Prix unitaire</div>
            <div class="cat-col-qte">Qté</div>
            <div class="cat-col-total">Total</div>
          </div>
          ${servicesHtml}
          ${badgesHtml}
        </div>`;
    })
    .join("");

  // Calculs totaux
  const sousTotal =
    detail.montant_total_avant_remise ??
    (detail.lignes ?? []).reduce(
      (sum, l) => sum + l.prix_unitaire * l.quantite,
      0
    );
  const remiseMontant = detail.montant_remise ?? Math.max(0, sousTotal - detail.montant_total);
  const fraisLivraison = detail.livraison ? (detail.frais_livraison ?? 0) : 0;
  const resteAPayer = Math.max(0, detail.montant_total - detail.montant_paye);

  // Bloc logo (si logo_url fournie)
  const logoHtml = p.logo_url
    ? `<img src="${escapeHtml(p.logo_url)}" alt="logo" class="logo" />`
    : `<div class="logo-placeholder">${escapeHtml(nomPressing.charAt(0).toUpperCase())}</div>`;

  // Construction des coordonnées pressing
  const contactHtml = contactLines
    .map((c) => `<div class="contact-line">${escapeHtml(c)}</div>`)
    .join("");

  // Construction des coordonnées client
  const clientContactHtml = clientAdresseParts
    .map((c) => `<div class="client-line">${escapeHtml(c)}</div>`)
    .join("");

  const headHtml = `
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #111827;
      background: #fff;
    }
    .page {
      max-width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 14mm 14mm 12mm;
    }
    /* ---------- En-tête ---------- */
    .header {
      display: grid;
      grid-template-columns: 1.3fr 1fr 1fr;
      gap: 18px;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 3px solid #0f172a;
      margin-bottom: 18px;
    }
    .brand-block { display: flex; flex-direction: column; gap: 6px; }
    .brand-top { display: flex; align-items: center; gap: 10px; }
    .logo {
      width: 44px; height: 44px; border-radius: 9999px;
      object-fit: cover; border: 2px solid #e5e7eb;
    }
    .logo-placeholder {
      width: 44px; height: 44px; border-radius: 9999px;
      background: #0f172a; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 700;
    }
    .brand-name {
      font-size: 17px; font-weight: 800; letter-spacing: 0.5px;
      color: #0f172a; text-transform: uppercase; line-height: 1.15;
    }
    .contact-line { font-size: 11px; color: #4b5563; line-height: 1.5; }
    .client-block .to-label {
      font-size: 11px; font-weight: 700; color: #6b7280;
      text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;
    }
    .client-name { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 3px; }
    .client-line { font-size: 11px; color: #4b5563; line-height: 1.5; }
    .meta-block { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
    .meta-row { display: flex; gap: 8px; align-items: center; font-size: 11px; }
    .meta-label { color: #6b7280; }
    .meta-value { font-weight: 600; color: #111827; }
    .badge {
      display: inline-flex; align-items: center; padding: 2px 10px;
      border-radius: 9999px; font-size: 11px; font-weight: 600;
      letter-spacing: 0.3px;
    }
    .facture-title {
      font-size: 13px; font-weight: 700; color: #0f172a;
      text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;
    }
    /* ---------- Cartes par catégorie (modèle de facture) ---------- */
    .categories-container {
      margin-top: 8px;
    }
    .category-card {
      padding: 18px 22px;
      background: #ffffff;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .category-card-alt {
      background: #f0f7ff; /* bleu très pâle comme dans l'image de référence */
    }
    .category-title {
      font-size: 17px;
      font-weight: 700;
      color: #1e3a5f;
      margin-bottom: 12px;
      letter-spacing: 0.2px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
    }
    .cat-header-row {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #9ca3af;
      padding: 4px 0 6px 0;
      border-bottom: 1px solid #e5e7eb;
      margin-bottom: 4px;
    }
    .cat-col-prix, .cat-col-qte, .cat-col-total {
      text-align: right;
      min-width: 70px;
    }
    .cat-service-row {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 12px;
      align-items: center;
      padding: 8px 0;
      font-size: 13px;
      color: #4b5563;
      border-bottom: 1px solid #f3f4f6;
    }
    .cat-service-row:last-child {
      border-bottom: none;
    }
    .cat-service-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cat-vetement-nom {
      font-weight: 600;
      color: #111827;
      font-size: 13px;
    }
    .cat-service-detail {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #6b7280;
    }
    .cat-service-label {
      color: #9ca3af;
    }
    .cat-service-value {
      font-weight: 500;
      color: #4b5563;
    }
    .cat-etat-badge {
      margin-left: 8px;
      display: inline-flex;
      align-items: center;
      background: #d1fae5;
      color: #065f46;
      padding: 1px 8px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 600;
    }
    .cat-bullet {
      color: #4a90e2; /* bleu moyen comme dans l'image de référence */
      font-size: 16px;
      line-height: 1;
    }
    .cat-service-price, .cat-service-qte, .cat-service-total {
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: #1f2937;
    }
    .cat-service-price {
      font-weight: 500;
    }
    .cat-service-total {
      font-weight: 600;
      color: #111827;
    }
    .cat-service-qte {
      color: #6b7280;
      min-width: 24px;
    }
    .cat-badges {
      display: flex;
      gap: 16px;
      margin-top: 10px;
      padding-top: 8px;
      font-size: 12px;
      color: #6b7280;
    }
    .cat-badge-express, .cat-badge-note {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 500;
      letter-spacing: 0.3px;
    }
    .cat-badge-express {
      text-transform: uppercase;
      color: #f59e0b; /* orange pour EXPRESS (plus visible) */
      font-weight: 600;
    }
    .cat-badge-note {
      color: #9ca3af;
      text-transform: lowercase;
      font-style: italic;
    }
    /* ---------- Totaux ---------- */
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
    .totals {
      width: 260px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;
    }
    .totals-head {
      background: #f3f4f6; padding: 8px 14px;
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.8px; color: #374151;
    }
    .totals .trow {
      display: flex; justify-content: space-between;
      padding: 7px 14px; font-size: 12px; border-top: 1px solid #f3f4f6;
    }
    .totals .trow:first-of-type { border-top: none; }
    .totals .trow .l { color: #4b5563; }
    .totals .trow .v { font-weight: 600; color: #111827; font-variant-numeric: tabular-nums; }
    .totals .trow.grand .l { font-weight: 700; color: #0f172a; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    .totals .trow.grand .v {
      font-size: 16px; font-weight: 800; color: #0f172a;
      background: #0f172a; color: #fff; padding: 4px 10px; border-radius: 4px;
      margin: -4px -10px;
    }
    .totals .trow.grand {
      background: #f9fafb; padding: 12px 14px; align-items: center;
    }
    /* ---------- Notes ---------- */
    .notes {
      margin-top: 18px; padding: 10px 14px; background: #fffbeb;
      border-left: 3px solid #f59e0b; border-radius: 4px;
      font-size: 11px; color: #92400e;
    }
    .notes-label { font-weight: 700; }
    /* ---------- Footer ---------- */
    .footer {
      margin-top: auto; padding-top: 18px;
      border-top: 2px solid #e5e7eb;
      display: flex; justify-content: space-between; align-items: flex-start;
      font-size: 10px; color: #6b7280;
      gap: 20px;
    }
    .footer .thanks { font-weight: 600; color: #374151; font-size: 12px; }
    .footer-left { flex: 1; }
    .footer-right { text-align: right; }
    .footer-conditions {
      margin-top: 6px;
      font-size: 9px;
      color: #9ca3af;
      line-height: 1.5;
      max-width: 300px;
    }
    @media print {
      body { background: #fff; }
      .page { max-width: none; min-height: 0; padding: 0; }
      @page { size: A4 portrait; margin: 12mm; }
    }
  </style>`;

  const bodyHtml = `
  <div class="page">
    <!-- En-tête -->
    <div class="header">
      <div class="brand-block">
        <div class="brand-top">
          ${logoHtml}
          <div class="brand-name">${escapeHtml(nomPressing)}</div>
        </div>
        ${contactHtml}
      </div>

      <div class="client-block">
        <div class="to-label">À</div>
        <div class="client-name">${escapeHtml(client?.nom_complet ?? "Client")}</div>
        ${clientContactHtml}
      </div>

      <div class="meta-block">
        <div class="facture-title">Facture</div>
        <div class="meta-row">
          <span class="meta-label">Date :</span>
          <span class="meta-value">${escapeHtml(dateFacture)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">N° :</span>
          <span class="meta-value">${escapeHtml(numeroFacture)}</span>
        </div>
        <div class="meta-row">
          <span class="badge" style="background:${pmtBadge.bg};color:${pmtBadge.fg};">${escapeHtml(pmtBadge.label)}</span>
        </div>
        <div class="meta-row" style="margin-top:6px;">
          <span class="meta-label">Commande :</span>
          <span class="meta-value">${escapeHtml(detail.numero_commande)}</span>
        </div>
        <div class="meta-row">
          <span class="badge" style="background:${etatBadge.bg};color:${etatBadge.fg};">${escapeHtml(etatBadge.label)}</span>
        </div>
        <div class="meta-row" style="margin-top:6px;">
          <span class="meta-label">Retrait :</span>
          <span class="meta-value">${escapeHtml(dateRetrait)}</span>
        </div>
      </div>
    </div>

    <!-- Cartes des prestations par catégorie -->
    <div class="categories-container">
      ${lignesHtml || '<div style="text-align:center;color:#9ca3af;padding:20px;">Aucune prestation</div>'}
    </div>

    <!-- Totaux -->
    <div class="totals-wrap">
      <div class="totals">
        <div class="totals-head">Totaux</div>
        <div class="trow">
          <span class="l">Sous-total</span>
          <span class="v">${escapeHtml(formatFCFA(sousTotal))}</span>
        </div>
        ${
          remiseMontant > 0
            ? `<div class="trow">
                <span class="l">Remise${detail.remise_type ? ` (${escapeHtml(detail.remise_type)})` : ""}</span>
                <span class="v">−${escapeHtml(formatFCFA(remiseMontant))}</span>
              </div>`
            : ""
        }
        ${
          fraisLivraison > 0
            ? `<div class="trow">
                <span class="l">Livraison</span>
                <span class="v">${escapeHtml(formatFCFA(fraisLivraison))}</span>
              </div>`
            : ""
        }
        <div class="trow grand">
          <span class="l">Montant total</span>
          <span class="v">${escapeHtml(formatFCFA(detail.montant_total))}</span>
        </div>
        <div class="trow">
          <span class="l">Payé</span>
          <span class="v">${escapeHtml(formatFCFA(detail.montant_paye))}</span>
        </div>
        ${
          resteAPayer > 0
            ? `<div class="trow">
                <span class="l">Reste à payer</span>
                <span class="v">${escapeHtml(formatFCFA(resteAPayer))}</span>
              </div>`
            : ""
        }
      </div>
    </div>

    ${
      detail.notes
        ? `<div class="notes"><span class="notes-label">Note : </span>${escapeHtml(detail.notes)}</div>`
        : ""
    }

    <!-- Pied de page -->
    <div class="footer">
      <div class="footer-left">
        <div class="thanks">Merci de votre confiance</div>
        <div>${escapeHtml(nomPressing)} — ${escapeHtml(p.ville || "Côte d'Ivoire")}</div>
        <div class="footer-conditions">
          En activant votre compte, vous acceptez les conditions d'utilisation d'e-pressing.
          Les articles non retirés dans un délai de 30 jours seront stockés à vos risques et périls.
          Conservez ce document pour le suivi de votre commande.
        </div>
      </div>
      <div class="footer-right">
        ${p.telephone ? `<div>${escapeHtml(p.telephone)}</div>` : ""}
        ${p.email ? `<div>${escapeHtml(p.email)}</div>` : ""}
        <div style="margin-top:4px;font-size:9px;color:#9ca3af;">Document généré le ${escapeHtml(new Date().toLocaleDateString("fr-FR"))}</div>
      </div>
    </div>
  </div>`;

  openPrintWindow(`Facture ${detail.numero_commande}`, headHtml, bodyHtml);
}
