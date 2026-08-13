/**
 * e-pressing — /personnel/livreur/commandes (LIV-1)
 * -------------------------------------------------
 * Liste des commandes à livrer, avec 2 onglets :
 *
 *   - "À livrer"  : statut "pret" + livraison=true → bouton "Démarrer la livraison"
 *   - "En cours"  : statut "en_livraison"         → bouton "Marquer livré"
 *
 * Fonctionnalités :
 *   - Recherche debouncée (300 ms) par numéro de commande OU nom du client
 *   - Cards mobiles + Table desktop (responsive)
 *   - Actions POST /api/personnel/livreur/livrer { commande_id, action }
 *   - Spinner pendant l'opération, toast succès, recharge la liste
 *   - États loading (skeletons) + error (alerte + Réessayer) + empty
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (livreur). L'API GET /api/admin/commandes accepte n'importe
 *    quel personnel actif (RLS isole par pressing). L'API POST
 *    /api/personnel/livreur/livrer exige role=livreur.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  Package,
  Phone,
  Search,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, StatusBadge } from "@/components/shared";
import {
  STATUT_LABELS,
  statutVariant,
  type CommandeListItem,
} from "@/components/ogpressing/admin/commandes/commandes-helpers";
import { formatFCFA } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const BASE_PATH = "/personnel/livreur";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CommandesApiResponse {
  success: boolean;
  data: CommandeListItem[];
  total: number;
  error?: string;
}

interface LivrerApiResponse {
  success: boolean;
  error?: string;
  data?: {
    id: string;
    statut: string;
    date_livraison: string | null;
  };
}

type TabValue = "a_livrer" | "en_cours";

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function LivreurCommandesPage() {
  const [tab, setTab] = useState<TabValue>("a_livrer");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [commandes, setCommandes] = useState<CommandeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // IDs de commandes en cours d'opération (démarrer/livrer) → spinner sur le bouton
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // --- Debounce recherche (300 ms) ---
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  // --- Fetch commandes (dépend de l'onglet courant) ---
  const fetchCommandes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statut = tab === "a_livrer" ? "pret" : "en_livraison";
      const params = new URLSearchParams({
        statut,
        pageSize: "100",
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
      // Pour l'onglet "a_livrer", on filtre côté client sur livraison=true
      // (l'API ne supporte pas encore le filtre booléen). Pour "en_cours",
      // toutes les commandes "en_livraison" sont à livrer par définition.
      const list =
        tab === "a_livrer"
          ? (json.data ?? []).filter((c) => c.livraison === true)
          : (json.data ?? []);
      setCommandes(list);
    } catch (err) {
      console.error("[livreur/commandes] Erreur fetch:", err);
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
  }, [tab, debouncedQuery]);

  useEffect(() => {
    fetchCommandes();
  }, [fetchCommandes]);

  // --- Action démarrer/livrer ---
  const handleAction = useCallback(
    async (
      commande: CommandeListItem,
      action: "demarrer" | "livrer"
    ): Promise<void> => {
      // Optimistic lock : on marque la commande comme "pending" pour
      // désactiver son bouton + afficher un spinner.
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(commande.id);
        return next;
      });
      try {
        const res = await fetch("/api/personnel/livreur/livrer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commande_id: commande.id, action }),
        });
        const json: LivrerApiResponse = await res.json();
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "Erreur lors de l'opération");
        }
        toast.success(
          action === "demarrer"
            ? "Livraison démarrée"
            : "Commande marquée comme livrée",
          {
            description:
              action === "demarrer"
                ? `${commande.numero_commande} est maintenant en livraison.`
                : `${commande.numero_commande} a été livrée au client.`,
          }
        );
        // On retire la commande de la liste locale (elle va changer d'onglet).
        setCommandes((prev) => prev.filter((c) => c.id !== commande.id));
      } catch (err) {
        let message: string;
        if (err instanceof TypeError && err.message.includes("fetch")) {
          message = "Erreur réseau. Vérifiez votre connexion internet.";
        } else if (err instanceof Error && err.message) {
          message = err.message;
        } else {
          console.error("[livreur/commandes] Erreur inattendue :", err);
          message = "Une erreur est survenue. Veuillez réessayer.";
        }
        toast.error(message);
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(commande.id);
          return next;
        });
      }
    },
    []
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Commandes à livrer
        </h1>
        <p className="text-muted-foreground">
          Démarrez et terminez les livraisons des commandes prêtes.
        </p>
      </div>

      {/* Barre de recherche */}
      <div className="relative max-w-xl">
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

      {/* Onglets */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabValue)}
        className="w-full"
      >
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="a_livrer" className="flex-1">
            <Package className="size-4" />
            À livrer
          </TabsTrigger>
          <TabsTrigger value="en_cours" className="flex-1">
            <Truck className="size-4" />
            En cours
          </TabsTrigger>
        </TabsList>

        <TabsContent value="a_livrer" className="mt-4">
          <CommandesListPanel
            commandes={commandes}
            loading={loading}
            error={error}
            pendingIds={pendingIds}
            emptyTitle="Aucune commande à livrer"
            emptyDescription={
              debouncedQuery
                ? "Aucune commande ne correspond à votre recherche."
                : "Toutes les commandes à livrer ont été démarrées. Les nouvelles commandes prêtes apparaîtront ici."
            }
            actionLabel="Démarrer la livraison"
            actionIcon={Truck}
            onAction={(c) => handleAction(c, "demarrer")}
            onRetry={fetchCommandes}
          />
        </TabsContent>

        <TabsContent value="en_cours" className="mt-4">
          <CommandesListPanel
            commandes={commandes}
            loading={loading}
            error={error}
            pendingIds={pendingIds}
            emptyTitle="Aucune livraison en cours"
            emptyDescription={
              debouncedQuery
                ? "Aucune commande ne correspond à votre recherche."
                : "Aucune commande n'est actuellement en livraison. Démarrer une livraison depuis l'onglet « À livrer »."
            }
            actionLabel="Marquer livré"
            actionIcon={CheckCircle2}
            onAction={(c) => handleAction(c, "livrer")}
            onRetry={fetchCommandes}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sous-composant : panneau de liste (desktop table + mobile cards)  */
/* ------------------------------------------------------------------ */

interface CommandesListPanelProps {
  commandes: CommandeListItem[];
  loading: boolean;
  error: string | null;
  pendingIds: Set<string>;
  emptyTitle: string;
  emptyDescription: string;
  actionLabel: string;
  actionIcon: typeof Truck;
  onAction: (commande: CommandeListItem) => void;
  onRetry: () => void;
}

function CommandesListPanel({
  commandes,
  loading,
  error,
  pendingIds,
  emptyTitle,
  emptyDescription,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  onRetry,
}: CommandesListPanelProps) {
  // --- Loading ---
  if (loading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 p-8 text-center">
          <AlertCircle className="size-8 text-danger" />
          <p className="text-sm font-medium text-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  // --- Empty ---
  if (commandes.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  // --- Liste non-vide : table desktop + cards mobile ---
  return (
    <Card>
      <CardContent className="p-0">
        {/* Desktop : table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Numéro</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="w-[140px]">Téléphone</TableHead>
                <TableHead>Adresse livraison</TableHead>
                <TableHead className="w-[120px] text-right">Montant</TableHead>
                <TableHead className="w-[120px]">Statut</TableHead>
                <TableHead className="w-[180px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commandes.map((c) => {
                const isPending = pendingIds.has(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.numero_commande}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {c.client?.nom_complet ?? "Client inconnu"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.client?.telephone ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin
                          className="size-3.5 shrink-0"
                          aria-hidden
                        />
                        <span className="truncate">
                          {c.adresse_livraison || "Adresse non renseignée"}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-foreground">
                      {formatFCFA(c.montant_total)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={c.statut}
                        label={STATUT_LABELS[c.statut] ?? c.statut}
                        variant={statutVariant(c.statut)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => onAction(c)}
                        disabled={isPending}
                        className="gap-1.5"
                      >
                        {isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ActionIcon className="size-4" />
                        )}
                        <span className="hidden lg:inline">{actionLabel}</span>
                        <span className="lg:hidden">Action</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile : cards */}
        <ul className="divide-y md:hidden">
          {commandes.map((c) => {
            const isPending = pendingIds.has(c.id);
            return (
              <li key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-mono text-xs text-muted-foreground">
                      {c.numero_commande}
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {c.client?.nom_complet ?? "Client inconnu"}
                    </p>
                  </div>
                  <StatusBadge
                    status={c.statut}
                    label={STATUT_LABELS[c.statut] ?? c.statut}
                    variant={statutVariant(c.statut)}
                    className="shrink-0"
                  />
                </div>

                <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0" aria-hidden />
                    <span>{c.client?.telephone ?? "Téléphone non renseigné"}</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      {c.adresse_livraison || "Adresse non renseignée"}
                    </span>
                  </p>
                  <p className="font-semibold text-foreground">
                    {formatFCFA(c.montant_total)}
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={() => onAction(c)}
                  disabled={isPending}
                  className="mt-3 w-full gap-1.5"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ActionIcon className="size-4" />
                  )}
                  {actionLabel}
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
