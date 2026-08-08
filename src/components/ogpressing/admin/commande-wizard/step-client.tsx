/**
 * Étape 1 — Sélection du client (LOT 7.2)
 * ----------------------------------------
 * Composant client complet pour la première étape du wizard Nouvelle
 * Commande. Fonctionnalités :
 *
 *   1. Recherche instantanée (debounce 300ms) parmi les clients du pressing
 *      par nom_complet OU téléphone (`GET /api/admin/clients?q=...`).
 *      Résultats cliquables avec avatar (initiale), nom, téléphone et badge
 *      orange "impayé" si `solde_impaye > 0`.
 *
 *   2. Bouton "+ Nouveau client" qui ouvre le `<NewClientDialog>` réutilisé
 *      de `clients/`. Après création, le nouveau client est automatiquement
 *      sélectionné (le dialog appelle `onCreated({ id, nom_complet,
 *      telephone, email })`).
 *
 *   3. Une fois un client sélectionné, affiche une carte récap (avatar,
 *      nom, téléphone, email, badge impayé) + bouton "Changer de client".
 *
 *   4. Si le client a des `preferences_lavage` sauvegardées, affiche un
 *      encart "Préférences habituelles" + une checkbox "Appliquer ces
 *      préférences à cette commande" (reliée à `state.appliquerPreferences`).
 *
 * Récupération des préférences : la liste de recherche ne renvoie pas
 * `preferences_lavage` (champ JSONB volumineux). Au clic sur un résultat,
 * on fetch le détail client via `GET /api/admin/clients/{id}` pour obtenir
 * le JSONB complet, puis on dispatch `SET_CLIENT`.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Phone,
  Mail,
  RefreshCw,
  Search,
  User,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NewClientDialog } from "@/components/ogpressing/admin/clients/new-client-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { formatFCFA } from "@/lib/utils/format";

import {
  hasPreferences,
  preferencesToList,
} from "./preferences-labels";
import type { ClientInfo, PreferencesLavage, StepProps } from "./state";

// ============================================================
// Types locaux
// ============================================================

/** Ligne renvoyée par `GET /api/admin/clients?q=...` (vue enrichie). */
interface ClientSearchResult {
  id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
  adresse: string | null;
  points_fidelite: number;
  notes: string | null;
  created_at: string;
  solde_impaye: number;
  total_depense: number;
  nombre_commandes: number;
  derniere_commande: string | null;
}

/** Réponse du GET détail client (inclut `preferences_lavage` JSONB). */
interface ClientDetail {
  id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
  adresse: string | null;
  points_fidelite: number;
  notes: string | null;
  preferences_lavage: PreferencesLavage | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Helpers
// ============================================================

/** Renvoie l'initiale (majuscule) du nom complet, ou "?" si vide. */
function getInitial(nom: string): string {
  const trimmed = nom.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

/**
 * Fetch le détail d'un client (avec `preferences_lavage`) et le mappe en
 * `ClientInfo` pour le reducer. Renvoie null si le fetch échoue.
 */
async function fetchClientDetail(id: string): Promise<ClientInfo | null> {
  try {
    const res = await fetch(`/api/admin/clients/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !json.data) return null;
    const d: ClientDetail = json.data;
    return {
      id: d.id,
      nom: d.nom_complet,
      telephone: d.telephone,
      email: d.email,
      solde_impaye: 0, // le détail ne renvoie pas l'agrégat ; on garde 0
      preferences_lavage: d.preferences_lavage ?? null,
      points_fidelite: d.points_fidelite ?? 0,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Sous-composants
// ============================================================

/** Avatar circulaire avec l'initiale du nom. */
function ClientAvatar({ nom, size = "md" }: { nom: string; size?: "md" | "lg" }) {
  const sizing =
    size === "lg"
      ? "size-12 text-base"
      : "size-10 text-sm";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ${sizing}`}
      aria-hidden
    >
      {getInitial(nom)}
    </span>
  );
}

/** Badge orange "impayé" — affiché uniquement si `solde > 0`. */
function ImpayeBadge({ solde }: { solde: number }) {
  if (!(solde > 0)) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning whitespace-nowrap"
      title={`Solde impayé : ${formatFCFA(solde)}`}
    >
      <AlertCircle className="size-3" />
      Impayé : {formatFCFA(solde)}
    </span>
  );
}

// ============================================================
// Composant principal
// ============================================================

export function StepClient({ state, dispatch }: StepProps) {
  const hasClient = state.client !== null;

  // --- Recherche (debounce 300ms) ---
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  // Pour éviter d'écraser les résultats si l'utilisateur tape vite entre
  // deux frappes (race condition entre fetchs), on mémorise la requête
  // courante et on n'applique que la dernière.
  const [fetchingId, setFetchingId] = useState<string | null>(null);

  // Debounce 300ms sur la requête utilisateur
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  /**
   * Effectue la recherche clients et met à jour `results` + `loading`.
   * Encapsulé dans un `useCallback` pour éviter les setStates synchrones
   * directement dans le corps de l'effect (lint `react-hooks/set-state-in-effect`).
   */
  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/clients?q=${encodeURIComponent(q)}&page=1&pageSize=10`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data?.success && Array.isArray(data.data)) {
        setResults(data.data as ClientSearchResult[]);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
      toast.error("Impossible de rechercher les clients. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Lance la recherche à chaque changement de `debouncedQuery` (non vide).
  // Si la requête est vide, on ne fait rien : les résultats ne sont pas
  // affichés (gardé en `renderResults` ci-dessous).
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) return;
    doSearch(trimmed);
  }, [debouncedQuery, doSearch]);

  /** Sélection d'un client dans la liste de résultats. */
  async function handleSelect(c: ClientSearchResult) {
    setFetchingId(c.id);
    const detail = await fetchClientDetail(c.id);
    setFetchingId(null);
    if (!detail) {
      toast.error("Impossible de charger ce client. Réessayez.");
      return;
    }
    // Le détail API ne renvoie pas `solde_impaye` (agrégat coûteux) — on
    // se fie au solde renvoyé par la liste de recherche pour le badge.
    // `points_fidelite` est renvoyé par le détail (préféré) ET la liste —
    // on garde celui du détail (source de vérité).
    const client: ClientInfo = {
      ...detail,
      solde_impaye: c.solde_impaye,
    };
    dispatch({ type: "SET_CLIENT", client });
    // Reset de la recherche après sélection
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
  }

  /** Callback du NewClientDialog : présélectionne le nouveau client. */
  function handleCreated(c: {
    id: string;
    nom_complet: string;
    telephone: string;
    email: string | null;
  }) {
    const client: ClientInfo = {
      id: c.id,
      nom: c.nom_complet,
      telephone: c.telephone,
      email: c.email ?? null,
      solde_impaye: 0,
      preferences_lavage: null,
      points_fidelite: 0,
    };
    dispatch({ type: "SET_CLIENT", client });
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    toast.success(`Client « ${c.nom_complet} » sélectionné pour cette commande.`);
  }

  function handleClearClient() {
    dispatch({ type: "CLEAR_CLIENT" });
  }

  function handleClearQuery() {
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
  }

  // --- Affichage ---
  const client = state.client;
  const prefsItems = client ? preferencesToList(client.preferences_lavage) : [];
  const showPreferences = client ? hasPreferences(client.preferences_lavage) : false;

  return (
    <div className="space-y-4">
      {/* Header de l'étape */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Sélection du client
        </h2>
        <p className="text-sm text-muted-foreground">
          Recherchez un client existant par nom ou téléphone, ou créez un
          nouveau client pour cette commande.
        </p>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* CAS 1 — Pas de client sélectionné : recherche + nouveau     */}
      {/* ---------------------------------------------------------- */}
      {!hasClient && (
        <div className="space-y-4">
          {/* Barre de recherche + bouton nouveau client */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom ou téléphone…"
                className="pl-9"
                aria-label="Rechercher un client"
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClearQuery}
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <NewClientDialog
              onCreated={handleCreated}
              trigger={
                <Button variant="outline" className="shrink-0">
                  <UserPlus className="size-4" />
                  Nouveau client
                </Button>
              }
            />
          </div>

          {/* Résultats de recherche */}
          {debouncedQuery.trim() ? (
            loading && results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border bg-card py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Recherche en cours…
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                icon={UserX}
                compact
                title="Aucun client trouvé"
                description="Essayez un autre nom ou créez un nouveau client."
              />
            ) : (
              <ul className="space-y-2" role="listbox" aria-label="Résultats de recherche clients">
                {results.map((c) => (
                  <li key={c.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => handleSelect(c)}
                      disabled={fetchingId === c.id}
                      className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-60"
                    >
                      <ClientAvatar nom={c.nom_complet} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          {c.nom_complet}
                        </p>
                        <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                          <Phone className="size-3" />
                          {c.telephone}
                        </p>
                      </div>
                      {fetchingId === c.id ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <ImpayeBadge solde={c.solde_impaye} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="size-6" />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">
                Recherchez un client par nom ou téléphone
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                ou créez un nouveau client avec le bouton ci-dessus.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- */}
      {/* CAS 2 — Client sélectionné : récap + préférences            */}
      {/* ---------------------------------------------------------- */}
      {hasClient && client && (
        <div className="space-y-4">
          {/* Carte récap client */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <ClientAvatar nom={client.nom} size="lg" />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <UserCheck className="size-4 shrink-0 text-secondary" />
                      <p className="truncate font-semibold text-foreground">
                        {client.nom}
                      </p>
                    </div>
                    <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                      <Phone className="size-3" />
                      {client.telephone}
                    </p>
                    {client.email && (
                      <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                        <Mail className="size-3" />
                        {client.email}
                      </p>
                    )}
                    <div className="pt-1">
                      <ImpayeBadge solde={client.solde_impaye} />
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearClient}
                  className="shrink-0"
                >
                  <RefreshCw className="size-4" />
                  Changer de client
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Encart préférences habituelles (uniquement si prefs définies) */}
          {showPreferences && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="space-y-3 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Préférences habituelles de ce client
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Ces préférences sont enregistrées sur la fiche client et
                    peuvent être appliquées automatiquement à cette commande.
                  </p>
                </div>

                <ul className="grid gap-2 sm:grid-cols-2">
                  {prefsItems.map((p) => (
                    <li
                      key={p.key}
                      className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                    >
                      <span aria-hidden className="text-base leading-none">
                        {p.icon}
                      </span>
                      <span className="text-muted-foreground">{p.label}</span>
                      <span className="ml-auto font-medium text-foreground">
                        {p.value}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-card p-3">
                  <Checkbox
                    id="appliquer-prefs"
                    checked={state.appliquerPreferences}
                    onCheckedChange={(v) =>
                      dispatch({
                        type: "SET_APPLIQUER_PREFERENCES",
                        value: v === true,
                      })
                    }
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="appliquer-prefs"
                    className="cursor-pointer text-sm font-medium text-foreground"
                  >
                    Appliquer ces préférences à cette commande
                  </Label>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
