/**
 * Étape 3 — Récapitulatif, remise et acompte (LOT 7.4)
 * -----------------------------------------------------
 *
 * Affiche le récapitulatif complet de la commande avant enregistrement :
 *
 *   1. Carte récap (client + articles + sous-total + remise + total)
 *   2. Section "Remise" (Collapsible) — 5 types :
 *      - Aucune           → pas de remise
 *      - Pourcentage      → input % + calcul live
 *      - Montant fixe     → input FCFA + plafonné au sous-total
 *      - Article gratuit  → select de l'article offert
 *      - Remise fidélité  → auto basée sur points_fidelite (50→3 %, 100→5 %)
 *   3. Section "Acompte" (Collapsible) — checkbox + montant + mode + référence
 *   4. Date de retrait prévue (Calendar + Popover, défaut J+2)
 *
 * Aucun enregistrement DB ici — le bouton "Suivant" passe simplement à
 * l'étape 4 (confirmation). L'enregistrement réel se fera au clic sur le
 * bouton final de l'étape 4 (Task 26-e).
 *
 * Calculs :
 *   - `sousTotal`        = computeSousTotal(state) = Σ(prix_unitaire × quantite)
 *   - `montantRemise`    = state.remise?.montant ?? 0 (snapshot, mis à jour
 *                          via useEffect quand les articles changent)
 *   - `montantTotal`     = sousTotal - montantRemise
 *   - `resteAPayer`      = montantTotal - acompte.montant
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronDown,
  Star,
  Tag,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type {
  CouleurVetement,
  MethodePaiement,
  RemiseType,
} from "@/lib/types/database.types";
import { formatFCFA } from "@/lib/utils/format";

import {
  COULEUR_LABELS,
  COULEUR_SWATCH,
  ETAT_ICONS,
  ETAT_LABELS,
} from "./article-labels";
import {
  computeFideliteRemisePercent,
  FIDELITE_SEUIL_MIN,
  METHODE_PAIEMENT_LABELS,
  METHODE_PAIEMENT_OPTIONS,
  REMISE_TYPE_LABELS,
  REMISE_TYPE_OPTIONS,
} from "./remise-labels";
import {
  computeSousTotal,
  type Acompte,
  type ArticleInfo,
  type StepProps,
} from "./state";

// ============================================================
// Helpers
// ============================================================

/** Libellé d'un article : "Nom Couleur" (LOT 15 — utilise catalogue_article_nom). */
function articleLabel(a: ArticleInfo): string {
  const typeLabel = a.catalogue_article_nom;
  if (a.couleur === "autre" && a.couleur_libre) {
    return `${typeLabel} ${a.couleur_libre}`;
  }
  return `${typeLabel} ${COULEUR_LABELS[a.couleur]}`;
}

/**
 * Calcule le montant de la remise (en FCFA) à partir du type, de la valeur
 * saisie, du sous-total et de la liste des articles.
 *
 * - `aucune`          → 0
 * - `pourcentage`     → round(sousTotal × valeur / 100)
 * - `montant_fixe`    → min(valeur, sousTotal)  (plafonné au sous-total)
 * - `article_gratuit` → prix_unitaire × quantite de l'article à l'index `valeur`
 * - `fidelite`        → round(sousTotal × valeur / 100)  (valeur = % auto)
 */
function computeRemiseMontant(
  type: RemiseType,
  valeur: number,
  sousTotal: number,
  articles: ArticleInfo[]
): number {
  switch (type) {
    case "aucune":
      return 0;
    case "pourcentage":
      return Math.round((sousTotal * valeur) / 100);
    case "montant_fixe":
      return Math.min(valeur, sousTotal);
    case "article_gratuit": {
      const article = articles[valeur];
      return article ? article.prix_unitaire * article.quantite : 0;
    }
    case "fidelite":
      return Math.round((sousTotal * valeur) / 100);
    default:
      return 0;
  }
}

// ============================================================
// Sous-composants
// ============================================================

/** Pastille ronde représentant la couleur dominante du vêtement. */
function CouleurSwatch({ couleur }: { couleur: CouleurVetement }) {
  return (
    <span
      className={`mt-1 inline-block size-3 shrink-0 rounded-full ${COULEUR_SWATCH[couleur]}`}
      aria-hidden
    />
  );
}

// ============================================================
// Composant principal
// ============================================================

export function StepRecap({ state, dispatch }: StepProps) {
  // --- Calculs dérivés ---
  const sousTotal = computeSousTotal(state);
  const montantRemise = state.remise?.montant ?? 0;
  const montantTotal = Math.max(0, sousTotal - montantRemise);
  const acompteMontant = state.acompte?.montant ?? 0;
  const resteAPayer = Math.max(0, montantTotal - acompteMontant);

  // --- État local formulaire remise (initialisé depuis state.remise
  // pour permettre l'aller-retour entre étapes sans perte de saisie) ---
  const [remiseOpen, setRemiseOpen] = useState(false);
  const [remiseType, setRemiseType] = useState<RemiseType>(
    state.remise?.type ?? "aucune"
  );
  const [remiseValeur, setRemiseValeur] = useState<string>(
    state.remise && state.remise.type !== "aucune"
      ? String(state.remise.valeur)
      : ""
  );

  // --- État local formulaire acompte ---
  const [acompteOpen, setAcompteOpen] = useState(false);
  const [acompteMethode, setAcompteMethode] = useState<MethodePaiement>(
    state.acompte?.methode ?? "especes"
  );
  const [acompteMontantInput, setAcompteMontantInput] = useState<string>(
    state.acompte ? String(state.acompte.montant) : ""
  );
  const [acompteReference, setAcompteReference] = useState<string>(
    state.acompte?.reference ?? ""
  );

  // --- Date de retrait prévue (Popover + Calendar) ---
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const selectedDate = useMemo(() => {
    const d = parseISO(state.date_pret_prevue);
    return isValid(d) ? d : undefined;
  }, [state.date_pret_prevue]);

  // --- Synchronisation : si les articles changent (aller-retour étape 2),
  // on recalcule le `montant` de la remise et on clampe l'acompte au
  // montantTotal. Sans cela, state.remise.montant serait stale. ---
  useEffect(() => {
    if (!state.remise) return;
    const newMontant = computeRemiseMontant(
      state.remise.type,
      state.remise.valeur,
      sousTotal,
      state.articles
    );
    if (newMontant !== state.remise.montant) {
      dispatch({
        type: "SET_REMISE",
        remise: { ...state.remise, montant: newMontant },
      });
    }
  }, [sousTotal, state.articles, state.remise, dispatch]);

  useEffect(() => {
    if (!state.acompte) return;
    const safeMontant = Math.min(state.acompte.montant, montantTotal);
    if (safeMontant !== state.acompte.montant) {
      dispatch({
        type: "SET_ACOMPTE",
        acompte: { ...state.acompte, montant: safeMontant },
      });
    }
  }, [montantTotal, state.acompte, dispatch]);

  // ============================================================
  // Handlers — Remise
  // ============================================================

  function handleRemiseTypeChange(type: RemiseType) {
    setRemiseType(type);
    if (type === "aucune") {
      dispatch({ type: "SET_REMISE", remise: null });
      setRemiseValeur("");
      return;
    }
    if (type === "fidelite") {
      const points = state.client?.points_fidelite ?? 0;
      const suggested = computeFideliteRemisePercent(points);
      setRemiseValeur(suggested > 0 ? String(suggested) : "");
      if (suggested === 0) {
        // Pas assez de points : on ne stocke pas de remise mais on garde
        // le type "fidelite" sélectionné dans le form pour afficher le
        // message informatif.
        dispatch({ type: "SET_REMISE", remise: null });
      } else {
        const montant = computeRemiseMontant(
          "fidelite",
          suggested,
          sousTotal,
          state.articles
        );
        dispatch({
          type: "SET_REMISE",
          remise: { type: "fidelite", valeur: suggested, montant },
        });
      }
      return;
    }
    if (type === "article_gratuit") {
      // Défaut = premier article (index 0)
      const idx = 0;
      setRemiseValeur(String(idx));
      const montant = computeRemiseMontant(
        "article_gratuit",
        idx,
        sousTotal,
        state.articles
      );
      dispatch({
        type: "SET_REMISE",
        remise: { type: "article_gratuit", valeur: idx, montant },
      });
      return;
    }
    // type === "pourcentage" | "montant_fixe" — conserve la valeur saisie
    const parsed = parseInt(remiseValeur, 10);
    const valeur = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const montant = computeRemiseMontant(
      type,
      valeur,
      sousTotal,
      state.articles
    );
    dispatch({ type: "SET_REMISE", remise: { type, valeur, montant } });
  }

  function handleRemiseValeurChange(input: string) {
    // Chiffres uniquement
    const cleaned = input.replace(/[^\d]/g, "");
    setRemiseValeur(cleaned);
    const parsed = parseInt(cleaned, 10);
    const valeur = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const montant = computeRemiseMontant(
      remiseType,
      valeur,
      sousTotal,
      state.articles
    );
    dispatch({
      type: "SET_REMISE",
      remise: { type: remiseType, valeur, montant },
    });
  }

  function handleArticleGratuitChange(value: string) {
    const idx = parseInt(value, 10);
    if (!Number.isFinite(idx)) return;
    setRemiseValeur(String(idx));
    const montant = computeRemiseMontant(
      "article_gratuit",
      idx,
      sousTotal,
      state.articles
    );
    dispatch({
      type: "SET_REMISE",
      remise: { type: "article_gratuit", valeur: idx, montant },
    });
  }

  function handleAnnulerRemise() {
    dispatch({ type: "SET_REMISE", remise: null });
    setRemiseType("aucune");
    setRemiseValeur("");
    setRemiseOpen(false);
    toast.info("Remise retirée.");
  }

  // ============================================================
  // Handlers — Acompte
  // ============================================================

  function handleAcompteToggle(checked: boolean) {
    if (checked) {
      const parsed = parseInt(acompteMontantInput, 10);
      const safeMontant =
        Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, montantTotal) : 0;
      const acompte: Acompte = {
        montant: safeMontant,
        methode: acompteMethode,
        reference: acompteReference.trim() || undefined,
      };
      dispatch({ type: "SET_ACOMPTE", acompte });
    } else {
      dispatch({ type: "SET_ACOMPTE", acompte: null });
    }
  }

  function handleAcompteMontantChange(input: string) {
    const cleaned = input.replace(/[^\d]/g, "");
    setAcompteMontantInput(cleaned);
    const parsed = parseInt(cleaned, 10);
    const valeur = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    // Plafonné au montant total (le reducer l'appliquera via useEffect si besoin)
    const safeValeur = Math.min(valeur, montantTotal);
    if (state.acompte) {
      dispatch({
        type: "SET_ACOMPTE",
        acompte: {
          ...state.acompte,
          montant: safeValeur,
        },
      });
    }
  }

  function handleAcompteMethodeChange(methode: MethodePaiement) {
    setAcompteMethode(methode);
    if (state.acompte) {
      dispatch({
        type: "SET_ACOMPTE",
        acompte: { ...state.acompte, methode },
      });
    }
  }

  function handleAcompteReferenceChange(input: string) {
    setAcompteReference(input);
    if (state.acompte) {
      dispatch({
        type: "SET_ACOMPTE",
        acompte: {
          ...state.acompte,
          reference: input.trim() || undefined,
        },
      });
    }
  }

  function handleAnnulerAcompte() {
    dispatch({ type: "SET_ACOMPTE", acompte: null });
    setAcompteMontantInput("");
    setAcompteReference("");
    setAcompteMethode("especes");
    setAcompteOpen(false);
    toast.info("Acompte retiré.");
  }

  // ============================================================
  // Handlers — Date
  // ============================================================

  function handleDateSelect(date: Date | undefined) {
    if (!date) return;
    // Stocke la date à midi (local) pour éviter les décalages de jour selon
    // le fuseau horaire lors du parseISO côté affichage.
    const iso = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      12,
      0,
      0
    ).toISOString();
    dispatch({ type: "SET_DATE_PRET_PREVUE", date: iso });
    setDatePopoverOpen(false);
  }

  // ============================================================
  // Rendu
  // ============================================================

  const pointsFidelite = state.client?.points_fidelite ?? 0;
  const suggestedFidelitePercent = computeFideliteRemisePercent(pointsFidelite);
  const client = state.client;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Récapitulatif, remise et acompte
        </h2>
        <p className="text-sm text-muted-foreground">
          Vérifiez la commande, appliquez une remise et un acompte si nécessaire,
          puis choisissez la date de retrait prévue.
        </p>
      </div>

      {/* === Carte récapitulatif === */}
      <div className="space-y-3 rounded-lg border bg-card p-4">
        {/* Client */}
        {client && (
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
              aria-hidden
            >
              {(client.nom.trim().charAt(0) || "?").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate font-medium text-foreground">{client.nom}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <AlertCircle className="size-3" />
                {client.telephone}
              </p>
              {client.solde_impaye > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                  <AlertCircle className="size-3" />
                  Impayé : {formatFCFA(client.solde_impaye)}
                </span>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Liste des articles */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Articles ({state.articles.length})
          </p>
          <ul className="space-y-1.5">
            {state.articles.map((a) => {
              const sousTotalArticle = a.prix_unitaire * a.quantite;
              return (
                <li
                  key={a.id}
                  className="flex items-start gap-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-sm"
                >
                  <CouleurSwatch couleur={a.couleur} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {articleLabel(a)}
                      <span className="ml-1.5 text-muted-foreground">
                        · {a.service_nom}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ETAT_ICONS[a.etat]} {ETAT_LABELS[a.etat]} · × {a.quantite}{" "}
                      · {formatFCFA(a.prix_unitaire)}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 font-semibold text-foreground">
                    {formatFCFA(sousTotalArticle)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <Separator />

        {/* Totaux */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Sous-total</span>
            <span className="text-foreground">{formatFCFA(sousTotal)}</span>
          </div>
          {montantRemise > 0 && state.remise && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-warning">
                <Tag className="size-3.5" />
                Remise
                {state.remise.type === "pourcentage" &&
                  ` (${state.remise.valeur} %)`}
                {state.remise.type === "fidelite" &&
                  ` fidélité (${state.remise.valeur} %)`}
                {state.remise.type === "montant_fixe" && " (montant fixe)"}
                {state.remise.type === "article_gratuit" &&
                  " (article offert)"}
              </span>
              <span className="font-medium text-warning">
                −{formatFCFA(montantRemise)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 text-base font-bold">
            <span className="text-foreground">Total</span>
            <span className="text-foreground">{formatFCFA(montantTotal)}</span>
          </div>
          {state.acompte && (
            <>
              <Separator className="my-1" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Acompte ({METHODE_PAIEMENT_LABELS[state.acompte.methode]})
                </span>
                <span className="font-medium text-foreground">
                  {formatFCFA(state.acompte.montant)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Reste à payer</span>
                <span className="font-semibold text-warning">
                  {formatFCFA(resteAPayer)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* === Section Remise (Collapsible) === */}
      <Collapsible open={remiseOpen} onOpenChange={setRemiseOpen}>
        <div className="rounded-lg border bg-card">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 p-3 text-left transition-colors hover:bg-accent/50"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Tag className="size-4 text-secondary" />
                {state.remise ? "Modifier la remise" : "Appliquer une remise"}
                {state.remise && (
                  <span className="rounded-md bg-secondary/10 px-1.5 py-0.5 text-xs font-normal text-secondary">
                    {REMISE_TYPE_LABELS[state.remise.type]}
                  </span>
                )}
              </span>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                  remiseOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 border-t p-4">
              {/* Type de remise */}
              <div className="space-y-1.5">
                <Label htmlFor="remise-type" className="text-sm">
                  Type de remise
                </Label>
                <Select
                  value={remiseType}
                  onValueChange={(v) =>
                    handleRemiseTypeChange(v as RemiseType)
                  }
                >
                  <SelectTrigger id="remise-type" className="w-full">
                    <SelectValue placeholder="Choisir un type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {REMISE_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Champs conditionnels selon le type */}
              {remiseType === "pourcentage" && (
                <div className="space-y-1.5">
                  <Label htmlFor="remise-pct" className="text-sm">
                    Pourcentage de remise (%)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="remise-pct"
                      type="text"
                      inputMode="numeric"
                      value={remiseValeur}
                      onChange={(e) =>
                        handleRemiseValeurChange(e.target.value)
                      }
                      placeholder="0"
                      className="w-24 text-right"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Montant de la remise :{" "}
                    <span className="font-medium text-warning">
                      {formatFCFA(
                        computeRemiseMontant(
                          "pourcentage",
                          parseInt(remiseValeur, 10) || 0,
                          sousTotal,
                          state.articles
                        )
                      )}
                    </span>
                  </p>
                </div>
              )}

              {remiseType === "montant_fixe" && (
                <div className="space-y-1.5">
                  <Label htmlFor="remise-montant" className="text-sm">
                    Montant de la remise (FCFA)
                  </Label>
                  <Input
                    id="remise-montant"
                    type="text"
                    inputMode="numeric"
                    value={remiseValeur}
                    onChange={(e) =>
                      handleRemiseValeurChange(e.target.value)
                    }
                    placeholder="0"
                    className="w-40 text-right"
                  />
                  <p className="text-xs text-muted-foreground">
                    Montant appliqué :{" "}
                    <span className="font-medium text-warning">
                      {formatFCFA(
                        Math.min(
                          parseInt(remiseValeur, 10) || 0,
                          sousTotal
                        )
                      )}
                    </span>
                    {parseInt(remiseValeur, 10) > sousTotal && (
                      <span className="ml-1 text-warning">
                        (plafonné au sous-total)
                      </span>
                    )}
                  </p>
                </div>
              )}

              {remiseType === "article_gratuit" && (
                <div className="space-y-1.5">
                  <Label htmlFor="remise-article" className="text-sm">
                    Article offert
                  </Label>
                  {state.articles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Aucun article dans la commande.
                    </p>
                  ) : (
                    <Select
                      value={remiseValeur || "0"}
                      onValueChange={handleArticleGratuitChange}
                    >
                      <SelectTrigger id="remise-article" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {state.articles.map((a, idx) => (
                          <SelectItem key={a.id} value={String(idx)}>
                            {articleLabel(a)} · {a.service_nom} ·{" "}
                            {formatFCFA(a.prix_unitaire * a.quantite)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Montant offert :{" "}
                    <span className="font-medium text-warning">
                      {formatFCFA(
                        computeRemiseMontant(
                          "article_gratuit",
                          parseInt(remiseValeur, 10) || 0,
                          sousTotal,
                          state.articles
                        )
                      )}
                    </span>
                  </p>
                </div>
              )}

              {remiseType === "fidelite" && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                    <Star className="mt-0.5 size-4 shrink-0 text-secondary" />
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">
                        Points fidélité du client : {pointsFidelite}
                      </p>
                      {suggestedFidelitePercent > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Remise fidélité applicable :{" "}
                          <span className="font-medium text-secondary">
                            {suggestedFidelitePercent} %
                          </span>{" "}
                          (non modifiable)
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Le client n&apos;a pas encore assez de points de
                          fidélité pour une remise (minimum {FIDELITE_SEUIL_MIN}{" "}
                          points).
                        </p>
                      )}
                    </div>
                  </div>
                  {suggestedFidelitePercent > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Montant de la remise :{" "}
                      <span className="font-medium text-warning">
                        {formatFCFA(
                          computeRemiseMontant(
                            "fidelite",
                            suggestedFidelitePercent,
                            sousTotal,
                            state.articles
                          )
                        )}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {remiseType === "aucune" && (
                <p className="text-xs text-muted-foreground">
                  Aucune remise appliquée.
                </p>
              )}

              {/* Annuler la remise */}
              {state.remise && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAnnulerRemise}
                  className="text-muted-foreground"
                >
                  <X className="size-4" />
                  Annuler la remise
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* === Section Acompte (Collapsible) === */}
      <Collapsible open={acompteOpen} onOpenChange={setAcompteOpen}>
        <div className="rounded-lg border bg-card">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 p-3 text-left transition-colors hover:bg-accent/50"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Wallet className="size-4 text-secondary" />
                {state.acompte
                  ? "Modifier l'acompte"
                  : "Encaisser un acompte"}
                {state.acompte && (
                  <span className="rounded-md bg-secondary/10 px-1.5 py-0.5 text-xs font-normal text-secondary">
                    {formatFCFA(state.acompte.montant)}
                  </span>
                )}
              </span>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                  acompteOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 border-t p-4">
              {/* Checkbox toggle */}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="acompte-toggle"
                  checked={state.acompte !== null}
                  onCheckedChange={(v) => handleAcompteToggle(v === true)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="acompte-toggle"
                  className="cursor-pointer text-sm font-medium text-foreground"
                >
                  Le client verse un acompte maintenant
                </Label>
              </div>

              {state.acompte && (
                <>
                  {/* Montant */}
                  <div className="space-y-1.5">
                    <Label htmlFor="acompte-montant" className="text-sm">
                      Montant de l&apos;acompte (FCFA)
                    </Label>
                    <Input
                      id="acompte-montant"
                      type="text"
                      inputMode="numeric"
                      value={acompteMontantInput}
                      onChange={(e) =>
                        handleAcompteMontantChange(e.target.value)
                      }
                      placeholder="0"
                      className="w-40 text-right"
                    />
                    <p className="text-xs text-muted-foreground">
                      Ne peut pas dépasser le total :{" "}
                      <span className="font-medium text-foreground">
                        {formatFCFA(montantTotal)}
                      </span>
                    </p>
                  </div>

                  {/* Méthode */}
                  <div className="space-y-1.5">
                    <Label htmlFor="acompte-methode" className="text-sm">
                      Mode de règlement
                    </Label>
                    <Select
                      value={acompteMethode}
                      onValueChange={(v) =>
                        handleAcompteMethodeChange(v as MethodePaiement)
                      }
                    >
                      <SelectTrigger id="acompte-methode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METHODE_PAIEMENT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Référence (optionnel) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="acompte-ref" className="text-sm">
                      Référence (optionnel)
                    </Label>
                    <Input
                      id="acompte-ref"
                      type="text"
                      value={acompteReference}
                      onChange={(e) =>
                        handleAcompteReferenceChange(e.target.value)
                      }
                      placeholder="Ex : TX-MOMO-1234, 4 derniers chiffres…"
                      maxLength={100}
                    />
                  </div>

                  {/* Reste à payer */}
                  <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      Reste à payer
                    </span>
                    <span className="font-semibold text-warning">
                      {formatFCFA(resteAPayer)}
                    </span>
                  </div>

                  {/* Annuler */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAnnulerAcompte}
                    className="text-muted-foreground"
                  >
                    <X className="size-4" />
                    Annuler l&apos;acompte
                  </Button>
                </>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* === Date de retrait prévue === */}
      <div className="space-y-1.5">
        <Label className="text-sm">Date de retrait prévue</Label>
        <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
              type="button"
            >
              <CalendarIcon className="size-4 text-muted-foreground" />
              {selectedDate
                ? format(selectedDate, "dd/MM/yyyy", { locale: fr })
                : "Choisir une date…"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              locale={fr}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">
          Par défaut, la date est fixée à J+2 (2 jours après aujourd&apos;hui).
        </p>
      </div>
    </div>
  );
}
