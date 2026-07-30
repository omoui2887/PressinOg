/**
 * OgPressing — /personnel/caissier/encaisser (CAIS-1)
 * ---------------------------------------------------
 * Page d'encaissement d'un paiement par le caissier.
 *
 * Flow utilisateur :
 *   1. Recherche d'une commande (par numéro OU nom du client), avec filtre
 *      par défaut sur les commandes non payées + partielles.
 *   2. Sélection d'une commande dans la liste → ouvre le formulaire
 *      d'encaissement (récup + champs montant / méthode / référence / notes).
 *   3. Soumission → POST /api/personnel/caissier/encaisser
 *   4. Succès : toast + récap du paiement + boutons "Nouvel encaissement"
 *      et "Voir la commande".
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (caissier). L'API GET /api/admin/commandes accepte n'importe
 *    quel personnel actif (RLS isole par pressing). L'API POST
 *    /api/personnel/caissier/encaisser exige role=caissier.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Receipt,
  Search,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared";
import {
  STATUT_LABELS,
  STATUT_PAIEMENT_LABELS,
  statutVariant,
  statutPaiementVariant,
  type CommandeListItem,
} from "@/components/ogpressing/admin/commandes/commandes-helpers";
import { formatFCFA, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { MethodePaiement } from "@/lib/types/database.types";

const BASE_PATH = "/personnel/caissier";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CommandesApiResponse {
  success: boolean;
  data: CommandeListItem[];
  total: number;
  error?: string;
}

interface EncaisserApiResponse {
  success: boolean;
  error?: string;
  data?: {
    paiement_id: string;
    commande_id: string;
    montant: number;
    methode: string;
    date_paiement: string;
    nouveau_montant_paye: number;
    nouveau_statut_paiement: string;
    reste_a_payer: number;
    montant_total: number;
  };
}

const METHODES: Array<{
  value: MethodePaiement;
  label: string;
  icon: typeof Banknote;
}> = [
  { value: "especes", label: "Espèces", icon: Banknote },
  { value: "mobile_money", label: "Mobile Money", icon: Smartphone },
  { value: "carte_bancaire", label: "Carte bancaire", icon: CreditCard },
];

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function CaissierEncaisserPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statutFilter, setStatutFilter] = useState<"impayees" | "toutes">(
    "impayes"
  );
  const [commandes, setCommandes] = useState<CommandeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CommandeListItem | null>(null);

  // --- Debounce recherche (300 ms) ---
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  // --- Fetch commandes ---
  const fetchCommandes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // On fetch un lot large (50) puis on filtre côté client sur le statut
      // paiement pour pouvoir basculer entre "impayées" et "toutes" sans
      // refetch. La recherche par query est faite côté serveur (param q).
      const params = new URLSearchParams({
        pageSize: "50",
      });
      if (debouncedQuery) {
        params.set("q", debouncedQuery);
      }
      const res = await fetch(`/api/admin/commandes?${params.toString()}`, {
        cache: "no-store",
      });
      const json: CommandesApiResponse = await res.json();
      if (!json.success) {
        throw new Error(
          json.error || "Erreur lors de la récupération des commandes"
        );
      }
      setCommandes(json.data ?? []);
    } catch (err) {
      console.error("[caissier/encaisser] Erreur fetch:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError(
          "Erreur réseau. Vérifiez votre connexion internet puis rechargez."
        );
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError("Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    fetchCommandes();
  }, [fetchCommandes]);

  // --- Filtre côté client : impayées (non_paye + partiel) OU toutes ---
  const filteredCommandes = useMemo(() => {
    if (statutFilter === "toutes") return commandes;
    return commandes.filter(
      (c) => c.statut_paiement === "non_paye" || c.statut_paiement === "partiel"
    );
  }, [commandes, statutFilter]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Encaisser un paiement
        </h1>
        <p className="text-muted-foreground">
          Recherchez une commande, puis enregistrez le règlement client.
        </p>
      </div>

      {/* Layout 2 colonnes : liste (gauche) + formulaire (droite) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Colonne gauche : recherche + liste */}
        <div className="space-y-4">
          {/* Barre de recherche + filtre */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher par n° commande ou nom client…"
                className="h-11 pl-9 pr-9"
                aria-label="Rechercher une commande"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={statutFilter === "impayes" ? "default" : "outline"}
                onClick={() => setStatutFilter("impayes")}
              >
                Impayées
              </Button>
              <Button
                type="button"
                size="sm"
                variant={statutFilter === "toutes" ? "default" : "outline"}
                onClick={() => setStatutFilter("toutes")}
              >
                Toutes
              </Button>
            </div>
          </div>

          {/* Liste */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                  <AlertCircle className="size-8 text-danger" />
                  <p className="text-sm font-medium text-foreground">
                    {error}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchCommandes()}
                  >
                    Réessayer
                  </Button>
                </div>
              ) : filteredCommandes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                  <Receipt className="size-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">
                    {statutFilter === "impayes"
                      ? "Aucune commande impayée"
                      : "Aucune commande trouvée"}
                  </p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    {debouncedQuery
                      ? "Modifiez votre recherche ou élargissez le filtre."
                      : statutFilter === "impayes"
                      ? "Toutes les commandes sont payées. Basculez sur « Toutes » pour voir l'historique."
                      : "Les nouvelles commandes apparaîtront ici."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {filteredCommandes.map((c) => {
                    const isSelected = selected?.id === c.id;
                    const reste = c.montant_total - c.montant_paye;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(c)}
                          className={cn(
                            "flex w-full flex-col gap-1 p-3 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                            isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/30"
                          )}
                          aria-pressed={isSelected}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-xs text-muted-foreground">
                              {c.numero_commande}
                            </span>
                            <StatusBadge
                              status={c.statut_paiement}
                              label={
                                STATUT_PAIEMENT_LABELS[c.statut_paiement] ??
                                c.statut_paiement
                              }
                              variant={statutPaiementVariant(c.statut_paiement)}
                              className="shrink-0"
                            />
                          </div>
                          <p className="truncate text-sm font-semibold text-foreground">
                            {c.client?.nom_complet ?? "Client inconnu"}
                          </p>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">
                              Total : {formatFCFA(c.montant_total)}
                            </span>
                            {reste > 0 && (
                              <span className="font-medium text-danger">
                                Reste : {formatFCFA(reste)}
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Colonne droite : formulaire d'encaissement */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {selected ? (
            <EncaissementForm
              key={selected.id}
              commande={selected}
              onClear={() => setSelected(null)}
              onEncaisseSuccess={() => {
                // Re-fetch la liste pour refléter le nouveau statut paiement
                fetchCommandes();
              }}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Banknote className="size-7" />
                </span>
                <p className="font-medium text-foreground">
                  Sélectionnez une commande
                </p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Choisissez une commande dans la liste de gauche pour
                  encaisser un paiement (espèces, Mobile Money ou carte).
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sous-composant : formulaire d'encaissement                         */
/* ------------------------------------------------------------------ */

interface EncaissementFormProps {
  commande: CommandeListItem;
  onClear: () => void;
  onEncaisseSuccess: () => void;
}

function EncaissementForm({
  commande,
  onClear,
  onEncaisseSuccess,
}: EncaissementFormProps) {
  const resteAPayer = Math.max(0, commande.montant_total - commande.montant_paye);

  const [montant, setMontant] = useState<string>(String(resteAPayer));
  const [methode, setMethode] = useState<MethodePaiement>("especes");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<EncaisserApiResponse["data"] | null>(
    null
  );

  // Quand la commande change, on reset le montant au reste à payer.
  // Le parent utilise `key={selected.id}` → le composant est remonté à
  // chaque changement de commande, donc cet effect ne s'exécute qu'une
  // fois au montage (init des champs du formulaire). `resteAPayer` est
  // dérivé de `commande` qui ne change pas au sein d'un même montage.
  useEffect(() => {
    setMontant(String(resteAPayer));
    setMethode("especes");
    setReference("");
    setNotes("");
    setSuccess(null);
  }, [commande.id]);

  const montantNum = parseInt(montant || "0", 10);
  const montantValid =
    Number.isFinite(montantNum) &&
    Number.isInteger(montantNum) &&
    montantNum > 0 &&
    montantNum <= resteAPayer + 1;

  // Référence obligatoire pour mobile_money et carte_bancaire (bonne pratique
  // pour le rapprochement bancaire). On l'impose côté UI (l'API ne l'exige pas).
  const referenceRequise =
    methode === "mobile_money" || methode === "carte_bancaire";
  const referenceValide = !referenceRequise || reference.trim().length >= 2;

  const canSubmit = montantValid && referenceValide && !submitting && !success;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/personnel/caissier/encaisser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commande_id: commande.id,
          montant: montantNum,
          methode,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json: EncaisserApiResponse = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "Erreur lors de l'encaissement");
      }
      setSuccess(json.data);
      toast.success("Paiement encaissé", {
        description: `${formatFCFA(json.data.montant)} — ${
          json.data.nouveau_statut_paiement === "paye"
            ? "Solde soldé"
            : `${formatFCFA(json.data.reste_a_payer)} restant`
        }`,
      });
      onEncaisseSuccess();
    } catch (err) {
      let message: string;
      if (err instanceof TypeError && err.message.includes("fetch")) {
        message = "Erreur réseau. Vérifiez votre connexion internet.";
      } else if (err instanceof Error && err.message) {
        message = err.message;
      } else {
        console.error("[caissier/encaisser] Erreur inattendue :", err);
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNouveauEncaissement() {
    onClear();
  }

  /* ----- État SUCCÈS : récapitulatif ----- */
  if (success) {
    const soldeSoldé = success.nouveau_statut_paiement === "paye";
    return (
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-secondary/15 text-secondary">
              <CheckCircle2 className="size-8" />
            </span>
            <h2 className="text-xl font-bold text-foreground">
              Paiement encaissé
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatFCFA(success.montant)} ·{" "}
              {METHODES.find((m) => m.value === success.methode)?.label ??
                success.methode}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Commande</span>
              <span className="font-mono font-medium text-foreground">
                {commande.numero_commande}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Client</span>
              <span className="font-medium text-foreground">
                {commande.client?.nom_complet ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant total</span>
              <span className="font-medium text-foreground">
                {formatFCFA(success.montant_total)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payé après encaissement</span>
              <span className="font-medium text-foreground">
                {formatFCFA(success.nouveau_montant_paye)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Reste à payer</span>
              <span
                className={cn(
                  "font-bold",
                  soldeSoldé ? "text-secondary" : "text-danger"
                )}
              >
                {soldeSoldé ? "Soldé" : formatFCFA(success.reste_a_payer)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleNouveauEncaissement}
            >
              Nouvel encaissement
            </Button>
            <Button asChild className="flex-1">
              <Link href={`${BASE_PATH}/clients`}>
                Voir les clients
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ----- État FORMULAIRE ----- */
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        {/* En-tête : commande sélectionnée + bouton fermer */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-xs text-muted-foreground">
              {commande.numero_commande}
            </p>
            <h2 className="truncate text-lg font-bold text-foreground">
              {commande.client?.nom_complet ?? "Client inconnu"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {commande.client?.telephone}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            aria-label="Fermer"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Récap financier */}
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Montant total</span>
            <span className="font-medium text-foreground">
              {formatFCFA(commande.montant_total)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Déjà payé</span>
            <span className="font-medium text-foreground">
              {formatFCFA(commande.montant_paye)}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium text-foreground">Reste à payer</span>
            <span className="text-lg font-bold text-danger">
              {formatFCFA(resteAPayer)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatusBadge
              status={commande.statut}
              label={STATUT_LABELS[commande.statut] ?? commande.statut}
              variant={statutVariant(commande.statut)}
            />
            <StatusBadge
              status={commande.statut_paiement}
              label={
                STATUT_PAIEMENT_LABELS[commande.statut_paiement] ??
                commande.statut_paiement
              }
              variant={statutPaiementVariant(commande.statut_paiement)}
            />
          </div>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Montant */}
          <div className="space-y-1.5">
            <Label htmlFor="enc-montant">Montant à encaisser (FCFA) *</Label>
            <Input
              id="enc-montant"
              type="number"
              min={1}
              max={resteAPayer + 1}
              step={100}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className="h-11"
              inputMode="numeric"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Entier ≥ 1. Max : {formatFCFA(resteAPayer)}.
              </p>
              {montantNum > 0 && montantNum < resteAPayer && (
                <span className="text-xs font-medium text-warning">
                  Acompte — reste {formatFCFA(resteAPayer - montantNum)}
                </span>
              )}
            </div>
          </div>

          {/* Méthode de paiement */}
          <div className="space-y-1.5">
            <Label>Méthode de paiement *</Label>
            <div className="grid grid-cols-3 gap-2">
              {METHODES.map((m) => {
                const Icon = m.icon;
                const isSelected = methode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethode(m.value)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      isSelected
                        ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/30"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    )}
                  >
                    <Icon className="size-5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Référence */}
          <div className="space-y-1.5">
            <Label htmlFor="enc-reference">
              Référence{" "}
              {referenceRequise ? (
                <span className="text-danger">*</span>
              ) : (
                <span className="text-muted-foreground">(optionnel)</span>
              )}
            </Label>
            <Input
              id="enc-reference"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={
                methode === "mobile_money"
                  ? "Ex : TX-MOMO-123456"
                  : methode === "carte_bancaire"
                  ? "Ex : 4 derniers chiffres de la carte"
                  : "Ex : Numéro de reçu"
              }
              maxLength={100}
              className="h-11"
            />
            {referenceRequise && (
              <p className="text-xs text-muted-foreground">
                Obligatoire pour {METHODES.find((m) => m.value === methode)?.label}{" "}
                (rapprochement bancaire).
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="enc-notes">
              Notes <span className="text-muted-foreground">(optionnel)</span>
            </Label>
            <Textarea
              id="enc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex : paiement partiel, client régulier…"
              rows={2}
              maxLength={300}
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="h-11 w-full"
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Encaissement…
              </>
            ) : (
              <>
                <Banknote className="size-4" />
                Encaisser {formatFCFA(montantValid ? montantNum : 0)}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
