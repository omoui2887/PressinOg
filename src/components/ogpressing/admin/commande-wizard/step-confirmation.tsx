/**
 * Étape 4 — Confirmation, création en base, QR Code et étiquettes (LOT 7.5)
 * ----------------------------------------------------------------------
 *
 * 4 phases :
 *   1. **initial**  — récap + bouton « Confirmer et créer la commande ».
 *                     Rien n'est inséré en DB avant le clic.
 *   2. **loading**  — spinner pendant le POST /api/admin/commandes.
 *   3. **success**  — ticket (numéro_commande), QR Code (qrcode.react),
 *                     étiquettes code-barres (jsbarcode) par article, boutons
 *                     d'impression + Nouvelle commande + Retour dashboard.
 *   4. **error**    — message d'erreur + bouton « Réessayer » (sans perte
 *                     de données : l'utilisateur peut aussi revenir en
 *                     arrière sur les étapes précédentes pour corriger).
 *
 * QR Code payload (JSON) :
 *   { commande_id, numero_commande, pressing_id }
 *   `pressing_id` est renvoyé par le POST /api/admin/commandes (route.ts
 *   modifié par Task 26-e) — permet au scanner de vérifier l'appartenance
 *   de la commande au pressing courant sans refetch.
 *
 * Étiquettes : un code-barres CODE128 par article, généré à partir du
 * champ `articles_vetements.code_qr` renvoyé par GET /api/admin/commandes/{id}.
 *
 * Impression : `window.open()` + `document.write()` (approche choisie pour
 * éviter la complexité de @media print et permettre un style print dédié
 * au ticket et aux étiquettes thermiques).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Home,
  Loader2,
  Package,
  Printer,
  QrCode,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDateOnly, formatFCFA } from "@/lib/utils/format";
import {
  COULEUR_LABELS,
  ETAT_LABELS,
} from "./article-labels";
import { METHODE_PAIEMENT_LABELS } from "./remise-labels";
import {
  computeSousTotal,
  computeTotal,
  type StepProps,
} from "./state";

// ============================================================
// Types — shapes des réponses API
// ============================================================

/** Article `articles_vetements` tel que renvoyé par GET /api/admin/commandes/{id}. */
interface ArticleVetementRow {
  id: string;
  ligne_id: string | null;
  code_qr: string | null;
  catalogue_article_id: string | null;
  type_vetement_legacy: string | null;
  couleur: string | null;
  couleur_libre: string | null;
  etat: string | null;
  description_etat: string | null;
  statut: string;
  photo_url: string | null;
  assigne_a: string | null;
  created_at: string;
  catalogue_article: {
    id: string;
    nom: string;
    slug: string;
    icone_url: string;
  } | null;
}

/** Ligne `commande_lignes` avec service imbriqué. */
interface CommandeLigneRow {
  id: string;
  service_id: string | null;
  type_vetement_legacy: string | null;
  description: string | null;
  quantite: number;
  prix_unitaire: number;
  montant_ligne: number;
  created_at: string;
  service: { id: string; nom: string; type: string | null } | null;
}

/** Détail commande renvoyé par GET /api/admin/commandes/{id}. */
interface CommandeDetail {
  id: string;
  numero_commande: string;
  statut: string;
  statut_paiement: string;
  montant_total: number;
  montant_paye: number;
  date_pret_prevue: string | null;
  date_reception: string | null;
  client: {
    id: string;
    nom_complet: string;
    telephone: string;
    email: string | null;
    adresse: string | null;
    points_fidelite: number;
  } | null;
  lignes: CommandeLigneRow[];
  articles: ArticleVetementRow[];
}

// ============================================================
// Libellés statut / statut_paiement
// ============================================================

const STATUT_PAIEMENT_LABELS: Record<string, string> = {
  non_paye: "Non payé",
  partiel: "Partiel",
  paye: "Payé",
};

const STATUT_LABELS: Record<string, string> = {
  recu: "Reçu",
  en_cours: "En cours",
  pret: "Prêt",
  livre: "Livré",
  retire: "Retiré",
  annule: "Annulé",
};

// ============================================================
// Helpers de libellé article
// ============================================================

function couleurLabel(c: string | null, libre: string | null): string {
  if (!c) return "";
  if (c === "autre" && libre) return libre;
  return COULEUR_LABELS[c as keyof typeof COULEUR_LABELS] ?? c;
}

function etatLabel(e: string | null): string {
  if (!e) return "—";
  return ETAT_LABELS[e as keyof typeof ETAT_LABELS] ?? e;
}

/** Description courte « Nom Couleur » pour un article de la DB (LOT 15). */
function articleDescription(a: ArticleVetementRow): string {
  const t = a.catalogue_article?.nom ?? "—";
  const c = couleurLabel(a.couleur, a.couleur_libre);
  return c ? `${t} ${c}` : t;
}

// ============================================================
// Composant — Étiquette article (carte + code-barres)
// ============================================================

interface ArticleLabelProps {
  article: ArticleVetementRow;
  index: number;
  total: number;
  numeroCommande: string;
}

function ArticleLabelCard({
  article,
  index,
  total,
  numeroCommande,
}: ArticleLabelProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (svgRef.current && article.code_qr) {
      try {
        JsBarcode(svgRef.current, article.code_qr, {
          format: "CODE128",
          width: 2,
          height: 50,
          displayValue: true,
          fontSize: 12,
          margin: 4,
        });
      } catch {
        // Si la valeur n'est pas valide pour CODE128, on ignore silencieusement.
        // L'utilisateur voit juste un SVG vide sous le header.
      }
    }
  }, [article.code_qr]);

  return (
    <div className="rounded-lg border bg-white p-3 text-center">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Article {index + 1} / {total}
      </div>
      <div className="font-mono text-xs font-semibold text-foreground">
        {numeroCommande}
      </div>
      <div className="my-1 text-[10px] text-muted-foreground">
        {articleDescription(article)}
      </div>
      <svg ref={svgRef} className="mx-auto block" />
      <div className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
        {article.code_qr ?? "—"}
      </div>
    </div>
  );
}

// ============================================================
// Helpers d'impression (window.open + document.write)
// ============================================================

/**
 * Échappe le HTML pour éviter toute injection dans la fenêtre d'impression
 * (les données proviennent de la DB qui peut contenir des caractères `<`, `&`…).
 */
function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Ouvre une nouvelle fenêtre, y écrit le HTML donné, puis déclenche l'impression.
 * Si le navigateur bloque les pop-ups, affiche un toast d'erreur.
 */
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
  // Petit délai pour laisser le navigateur peupler le DOM avant print().
  setTimeout(() => {
    try {
      w.print();
    } catch {
      // No-op : sur certains navigateurs, print() peut échouer silencieusement.
    }
  }, 250);
}

/**
 * Construit et imprime le ticket client. Inclut : en-tête e-pressing,
 * numéro de ticket (font-mono), QR Code (rendu en `<img>` depuis dataURL via
 * un canvas temporaire), récap articles, montant total, statut paiement,
 * date de retrait prévue.
 *
 * Le QR est dessiné sur un canvas hors-écran puis sérialisé en dataURL PNG
 * pour pouvoir l'injecter dans la fenêtre d'impression (pas d'accès direct
 * au QRCodeSVG hors React).
 */
function printTicket(opts: {
  commandeCree: NonNullable<StepProps["state"]["commandeCree"]>;
  detail: CommandeDetail | null;
  clientNom: string | null;
  articlesCount: number;
  datePretPrevue: string;
}) {
  const { commandeCree, detail, clientNom, articlesCount, datePretPrevue } =
    opts;

  // Génération du QR Code en dataURL via un canvas temporaire.
  // qrcode.react n'expose pas de fonction `toString`, on utilise donc
  // `qrcode-generator` indirectly via la lib `qrcode.react` qui n'est pas
  // adaptée à un contexte non-React. À la place, on encode le payload via
  // une approche simple : on dessine le QR via QRCodeCanvas dans un canvas
  // temporaire qu'on n'attache pas au DOM.
  const qrPayload = JSON.stringify({
    commande_id: commandeCree.id,
    numero_commande: commandeCree.numero_commande,
    pressing_id: commandeCree.pressing_id,
  });

  // On utilise un canvas hors-écran + la lib `qrcode` (dépendance transitive
  // de qrcode.react) si disponible, sinon on fallback à un placeholder.
  // En pratique, qrcode.react exporte `QRCodeCanvas` qui peut être rendue
  // dans la fenêtre d'impression via un `<canvas>` + script.
  // Approche simple : on délègue le rendu du QR à la fenêtre d'impression
  // via le module npm `qrcode` (CDN). Pour éviter une dépendance runtime
  // supplémentaire, on inline plutôt un `<div>` contenant le payload et on
  // dessine le QR via l'API Canvas dans la fenêtre en utilisant le module
  // `qrcode` chargé depuis un CDN.
  const lignesHtml = (detail?.lignes ?? [])
    .map((l) => {
      const svc = l.service?.nom ?? "—";
      const t = l.description ?? svc;
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

  const totalAvantRemise = detail
    ? (detail.lignes ?? []).reduce(
        (sum, l) => sum + l.prix_unitaire * l.quantite,
        0
      )
    : 0;
  const remiseMontant = totalAvantRemise - commandeCree.montant_total;

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
    <div class="ticket-no">${escapeHtml(commandeCree.numero_commande)}</div>
  </div>

  <div class="center">
    <canvas id="qrcode-canvas" width="160" height="160"></canvas>
  </div>

  <div style="margin-top:6px;">
    <div><span class="label">Client :</span> <span class="value">${escapeHtml(
      clientNom ?? "—"
    )}</span></div>
    <div><span class="label">Articles :</span> <span class="value">${escapeHtml(
      String(articlesCount)
    )}</span></div>
    <div><span class="label">Date de retrait prévue :</span> <span class="value">${escapeHtml(
      formatDateOnly(datePretPrevue)
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
    Total : ${escapeHtml(formatFCFA(commandeCree.montant_total))}
  </div>
  <div style="font-size:11px;text-align:right;">
    Acompte : ${escapeHtml(formatFCFA(commandeCree.montant_paye))}
  </div>
  <div style="font-size:11px;text-align:right;">
    Reste à payer : ${escapeHtml(
      formatFCFA(commandeCree.montant_total - commandeCree.montant_paye)
    )}
  </div>
  <div style="font-size:11px;text-align:right;margin-top:4px;">
    Statut paiement : <strong>${escapeHtml(
      STATUT_PAIEMENT_LABELS[commandeCree.statut_paiement] ??
        commandeCree.statut_paiement
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

  openPrintWindow(
    `Ticket ${commandeCree.numero_commande}`,
    headHtml,
    bodyHtml
  );
}

/**
 * Construit et imprime une feuille d'étiquettes (une par article) pour
 * imprimante thermique d'étiquettes. Chaque étiquette contient :
 *   - numéro de ticket
 *   - description article (Type Couleur)
 *   - code-barres CODE128 du champ `code_qr`
 *   - texte du code-barres
 *
 * Les étiquettes sont séparées par des sauts de page CSS (`page-break-after`)
 * pour permettre à l'utilisateur de les imprimer une à une.
 */
function printLabels(opts: {
  commandeCree: NonNullable<StepProps["state"]["commandeCree"]>;
  detail: CommandeDetail | null;
}) {
  const { commandeCree, detail } = opts;
  const articles = detail?.articles ?? [];

  if (articles.length === 0) {
    toast.error("Aucun article à imprimer (détail commande indisponible).");
    return;
  }

  const labelsHtml = articles
    .map((a, idx) => {
      const desc = articleDescription(a);
      const etat = etatLabel(a.etat);
      return `<div class="label-sticker">
        <div class="brand">e-pressing</div>
        <div class="ticket-no">${escapeHtml(commandeCree.numero_commande)}</div>
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

  openPrintWindow(
    `Étiquettes ${commandeCree.numero_commande}`,
    headHtml,
    bodyHtml
  );
}

// ============================================================
// Composant principal
// ============================================================

type Phase = "initial" | "loading" | "success" | "error";

export function StepConfirmation({
  state,
  dispatch,
  basePath = "/admin",
}: StepProps & { basePath?: string }) {
  const [phase, setPhase] = useState<Phase>("initial");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [detail, setDetail] = useState<CommandeDetail | null>(null);

  const total = computeTotal(state);
  const sousTotal = computeSousTotal(state);
  const acompteMontant = state.acompte?.montant ?? 0;
  const resteAPayer = total - acompteMontant;
  const commandeCree = state.commandeCree;

  // -----------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------

  async function handleCreate() {
    if (!state.client) {
      setErrorMsg("Aucun client sélectionné.");
      setPhase("error");
      return;
    }
    if (state.articles.length === 0) {
      setErrorMsg("Aucun article dans la commande.");
      setPhase("error");
      return;
    }

    setPhase("loading");
    setErrorMsg("");

    try {
      const payload = {
        client_id: state.client.id,
        articles: state.articles.map((a) => ({
          service_id: a.service_id,
          catalogue_article_id: a.catalogue_article_id,
          catalogue_article_nom: a.catalogue_article_nom,
          couleur: a.couleur,
          couleur_libre: a.couleur_libre,
          etat: a.etat,
          description_etat: a.description_etat,
          quantite: a.quantite,
        })),
        remise: state.remise
          ? { type: state.remise.type, valeur: state.remise.valeur }
          : null,
        acompte: state.acompte
          ? {
              montant: state.acompte.montant,
              methode: state.acompte.methode,
              reference: state.acompte.reference,
            }
          : null,
        date_pret_prevue: state.date_pret_prevue,
        notes: state.notes || undefined,
        appliquer_preferences: state.appliquerPreferences,
      };

      const res = await fetch("/api/admin/commandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error ||
            `Erreur ${res.status} lors de la création de la commande`
        );
      }

      dispatch({ type: "SET_COMMANDE_CREE", commande: data.data });

      // Récupère le détail (articles + code_qr pour les étiquettes).
      // Non bloquant : si le fetch échoue, on affiche quand même l'écran de
      // succès sans étiquettes (l'utilisateur pourra réimprimer plus tard).
      try {
        const detailRes = await fetch(
          `/api/admin/commandes/${data.data.id}`
        );
        const detailJson = await detailRes.json().catch(() => null);
        if (detailRes.ok && detailJson?.success && detailJson.data) {
          setDetail(detailJson.data as CommandeDetail);
        }
      } catch {
        // No-op : détail non disponible.
      }

      setPhase("success");
      toast.success("✅ Commande créée avec succès");
    } catch (e) {
      // Pattern d'erreur : réseau vs métier (API FR) vs inconnu.
      // On n'expose JAMAIS error.stack, JSON.stringify(error) ou codes SQL/Supabase.
      let message: string;
      if (
        e instanceof TypeError &&
        e.message.includes("fetch")
      ) {
        message = "Erreur réseau. Vérifiez votre connexion internet.";
      } else if (
        e instanceof Error &&
        e.name === "NetworkError"
      ) {
        message = "Erreur réseau. Vérifiez votre connexion internet.";
      } else if (e instanceof Error && e.message) {
        // Message français renvoyé par l'API (erreur métier connue).
        message = e.message;
      } else {
        console.error("[step-confirmation] Erreur inattendue :", e);
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      setPhase("error");
      setErrorMsg(message);
      toast.error(message);
    }
  }

  function handleNouvelleCommande() {
    dispatch({ type: "RESET" });
  }

  function handlePrintTicket() {
    if (!commandeCree) return;
    printTicket({
      commandeCree,
      detail,
      clientNom: state.client?.nom ?? null,
      articlesCount: state.articles.length,
      datePretPrevue: state.date_pret_prevue,
    });
  }

  function handlePrintLabels() {
    if (!commandeCree) return;
    printLabels({ commandeCree, detail });
  }

  // -----------------------------------------------------------
  // Render — phase initial (avant clic)
  // -----------------------------------------------------------

  if (phase === "initial" || (phase === "loading" && !commandeCree)) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Confirmation de la commande
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vérifiez le récapitulatif puis confirmez la création de la
            commande. Le QR Code et les étiquettes seront générés après
            confirmation.
          </p>
        </div>

        {/* Récapitulatif compact */}
        <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Client</span>
            <span className="font-medium text-foreground">
              {state.client?.nom ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Téléphone</span>
            <span className="font-medium text-foreground">
              {state.client?.telephone ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Articles</span>
            <span className="font-medium text-foreground">
              {state.articles.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Sous-total</span>
            <span className="font-medium text-foreground">
              {formatFCFA(sousTotal)}
            </span>
          </div>
          {state.remise && state.remise.montant > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Remise ({state.remise.type === "pourcentage" ||
                state.remise.type === "fidelite"
                  ? `${state.remise.valeur} %`
                  : state.remise.type === "montant_fixe"
                    ? "montant fixe"
                    : state.remise.type === "article_gratuit"
                      ? "article gratuit"
                      : "—"}
                )
              </span>
              <span className="font-medium text-destructive">
                −{formatFCFA(state.remise.montant)}
              </span>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between font-bold">
            <span className="text-foreground">Total</span>
            <span className="text-foreground">{formatFCFA(total)}</span>
          </div>
          {state.acompte && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Acompte (
                  {METHODE_PAIEMENT_LABELS[state.acompte.methode] ?? "—"})
                </span>
                <span className="font-medium text-foreground">
                  {formatFCFA(state.acompte.montant)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reste à payer</span>
                <span className="font-semibold text-warning">
                  {formatFCFA(resteAPayer)}
                </span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Date de retrait prévue
            </span>
            <span className="font-medium text-foreground">
              {formatDateOnly(state.date_pret_prevue)}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          La commande sera enregistrée dans la base de données. Le QR Code et
          les étiquettes seront générés après confirmation.
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleCreate}
          disabled={phase === "loading"}
        >
          {phase === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Création de la commande en cours…
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Confirmer et créer la commande
            </>
          )}
        </Button>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Render — phase error
  // -----------------------------------------------------------

  if (phase === "error") {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-7" />
          </span>
          <h2 className="mt-3 text-lg font-bold text-foreground">
            Échec de la création
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            La commande n&apos;a pas pu être enregistrée. Vous pouvez
            réessayer ou revenir sur une étape précédente pour corriger les
            informations.
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <span className="font-semibold">Détail : </span>
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={handleCreate}>
            <RotateCcw className="size-4" />
            Réessayer
          </Button>
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "PREV_STEP" })}
          >
            Retour à l&apos;étape précédente
          </Button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Render — phase success
  // -----------------------------------------------------------

  // phase === "success" — commandeCree est forcément non null ici.

  const qrPayload = commandeCree
    ? JSON.stringify({
        commande_id: commandeCree.id,
        numero_commande: commandeCree.numero_commande,
        pressing_id: commandeCree.pressing_id,
      })
    : "";

  return (
    <div className="space-y-5">
      {/* En-tête succès */}
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-secondary/10 text-secondary">
          <CheckCircle2 className="size-8" />
        </span>
        <h2 className="mt-3 text-xl font-bold text-foreground">
          ✅ Commande créée avec succès
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Numéro de ticket :
        </p>
        <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
          {commandeCree?.numero_commande ?? "—"}
        </p>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center rounded-lg border bg-white p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <QrCode className="size-3.5" />
          QR Code de la commande
        </div>
        {commandeCree && (
          <div className="rounded-md bg-white p-2 ring-1 ring-border">
            <QRCodeSVG
              value={qrPayload}
              size={200}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
              includeMargin={false}
            />
          </div>
        )}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Scannez ce QR Code pour retrouver la commande
        </p>
      </div>

      {/* Récap compact */}
      <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Client</span>
          <span className="font-medium text-foreground">
            {state.client?.nom ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Articles</span>
          <span className="font-medium text-foreground">
            {state.articles.length}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium text-foreground">
            {formatFCFA(commandeCree?.montant_total ?? total)}
          </span>
        </div>
        {state.acompte && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Acompte versé</span>
            <span className="font-medium text-foreground">
              {formatFCFA(commandeCree?.montant_paye ?? state.acompte.montant)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Statut paiement</span>
          <span className="font-medium text-foreground">
            {commandeCree
              ? (STATUT_PAIEMENT_LABELS[commandeCree.statut_paiement] ??
                commandeCree.statut_paiement)
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Statut commande</span>
          <span className="font-medium text-foreground">
            {commandeCree
              ? (STATUT_LABELS[commandeCree.statut] ?? commandeCree.statut)
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Date de retrait prévue</span>
          <span className="font-medium text-foreground">
            {formatDateOnly(state.date_pret_prevue)}
          </span>
        </div>
      </div>

      {/* Bouton impression ticket */}
      <Button onClick={handlePrintTicket} variant="default" className="w-full">
        <Printer className="size-4" />
        Imprimer le ticket
      </Button>

      {/* Étiquettes articles (code-barres) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Package className="size-4" />
          Étiquettes articles ({detail?.articles.length ?? 0})
        </div>

        {detail && detail.articles.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {detail.articles.map((a, idx) => (
              <ArticleLabelCard
                key={a.id}
                article={a}
                index={idx}
                total={detail.articles.length}
                numeroCommande={commandeCree?.numero_commande ?? ""}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            {detail
              ? "Aucun article chargé."
              : "Chargement des étiquettes… (récupération du détail commande)"}
          </div>
        )}

        <Button
          onClick={handlePrintLabels}
          variant="outline"
          className="w-full"
          disabled={!detail || detail.articles.length === 0}
        >
          <Printer className="size-4" />
          Imprimer toutes les étiquettes
        </Button>
      </div>

      <Separator />

      {/* Actions finales */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button onClick={handleNouvelleCommande} variant="default">
          <RotateCcw className="size-4" />
          Nouvelle commande
        </Button>
        <Button asChild variant="outline">
          <a href={`${basePath}/dashboard`}>
            <Home className="size-4" />
            Retour au tableau de bord
          </a>
        </Button>
      </div>
    </div>
  );
}
