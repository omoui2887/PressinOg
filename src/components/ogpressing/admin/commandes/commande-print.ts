/**
 * OgPressing — Helpers d'impression pour la fiche commande (LOT 7.6)
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
import { STATUT_PAIEMENT_LABELS } from "./commandes-helpers";

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
 * Imprime le ticket client : en-tête OgPressing, numéro de ticket (mono),
 * QR Code (rendu via CDN `qrcode` sur `<canvas>`), récap articles, total,
 * statut paiement, date de retrait prévue.
 */
export function printCommandeTicket(detail: CommandeDetail) {
  const qrPayload = JSON.stringify({
    commande_id: detail.id,
    numero_commande: detail.numero_commande,
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
    <div class="brand">OgPressing</div>
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
      return `<div class="label-sticker">
        <div class="brand">OgPressing</div>
        <div class="ticket-no">${escapeHtml(detail.numero_commande)}</div>
        <div class="article-info">${escapeHtml(desc)} — ${escapeHtml(etat)}</div>
        <div class="article-index">Article ${idx + 1} / ${articles.length}</div>
        <svg class="barcode-svg" id="barcode-${idx}" data-code="${escapeHtml(
          a.code_qr ?? ""
        )}"></svg>
        <div class="code-text">${escapeHtml(a.code_qr ?? "—")}</div>
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
 *     "OgPressing Cocody"
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
  const enTeteNom = pressingNom?.trim() || "OgPressing";

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
