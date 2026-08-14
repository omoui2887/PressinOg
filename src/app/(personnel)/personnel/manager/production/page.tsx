/**
 * e-pressing — /personnel/manager/production (12-PRODUCTION-FILE)
 * ----------------------------------------------------------------
 * Vue "File de production" du Manager — tableau de bord centralisé
 * pour assigner et suivre les tâches de production (lavage, repassage,
 * livraison) sur tous les articles non terminés du pressing.
 *
 * Fonctionnalités :
 *   1. Header (titre + sous-titre "Manager — assignez et suivez…")
 *   2. 4 StatCards : À assigner / Assignées / En cours / Terminées
 *      (compteurs servis par GET /api/admin/production-file)
 *   3. Onglets filtres : Tous / Non assignés / Assignés / En cours /
 *      Terminés / Par employé. Badge count sur "Non assignés".
 *   4. Recherche debouncée 300 ms (numero_commande ou nom client)
 *   5. Tableau desktop (8 colonnes) + cards mobile quand filtre ≠ par_employe
 *      Liste de cards employés quand filtre = par_employe
 *   6. Dialog d'assignation (Select employé → POST .../assign)
 *      + bouton Désassigner (DELETE .../assign)
 *   7. États loading (skeletons 5 lignes) / error (alerte + Réessayer)
 *      / empty (EmptyState contextuel)
 *   8. Conteneur scrollable max-h-[600px] avec scrollbar custom
 *
 * 🔒 SÉCURITÉ :
 *   - Le layout (personnel)/layout.tsx vérifie déjà l'auth + le rôle manager.
 *   - L'endpoint /api/admin/production-file est manager-only (CAN_ASSIGNER_ARTICLES).
 *   - Les endpoints /api/admin/commandes/[id]/articles/[articleId]/assign
 *     (POST + DELETE) sont eux aussi manager-only + RPC SQL atomique
 *     (SELECT FOR UPDATE, vérif same-pressing, rôle compatible, non terminal).
 *   - RLS isole par pressing_id.
 *
 * 🔁 WORKFLOW : le trigger DB `trg_commandes_statut_apres_article_update`
 *    (migration 005) recalcule automatiquement `commandes.statut` après chaque
 *    PATCH d'article. L'assignation ne change PAS le statut — l'employé
 *    assigné doit ensuite marquer l'article comme traité (cf. pages laveur /
 *    repassage) pour faire avancer le workflow.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  ClipboardList,
  Loader2,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ogpressing/stat-card";
import { StatusBadge, EmptyState } from "@/components/shared";
import {
  STATUT_LABELS,
  statutVariant,
} from "@/components/ogpressing/admin/commandes/commandes-helpers";
import { formatDateOnly } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const BASE_PATH = "/personnel/manager";

/* ------------------------------------------------------------------ */
/*  Types — shape de la réponse API                                    */
/* ------------------------------------------------------------------ */

interface ProductionFileItem {
  article_id: string;
  commande_id: string;
  pressing_id: string;
  numero_commande: string;
  commande_statut: string;
  date_reception: string | null;
  priorite: string | null;
  client_nom: string | null;
  client_telephone: string | null;
  article_statut: string;
  code_qr: string | null;
  assigne_a: string | null;
  assigne_nom: string | null;
  assigne_role: string | null;
  assigne_le: string | null;
  assigne_par: string | null;
  started_at: string | null;
  completed_at: string | null;
  zone_stockage: string | null;
  statut_assignation: string;
}

interface ProductionFileCounters {
  non_assignes: number;
  assignes: number;
  en_cours: number;
  termines: number;
  total: number;
}

interface ParEmployeItem {
  personnel_id: string;
  nom_complet: string;
  role: string;
  count: number;
}

interface ProductionFileApiResponse {
  success: boolean;
  data: ProductionFileItem[];
  counters: ProductionFileCounters;
  par_employe: ParEmployeItem[];
  error?: string;
}

interface PersonnelRow {
  id: string;
  nom_complet: string;
  email: string | null;
  telephone: string | null;
  role: string;
  statut_compte: string;
  actif: boolean | null;
}

interface PersonnelApiResponse {
  success: boolean;
  data: PersonnelRow[];
  total: number;
  error?: string;
}

interface AssignApiResponse {
  success: boolean;
  error?: string;
  code?: string;
  message?: string;
  personnel_id?: string;
}

/* ------------------------------------------------------------------ */
/*  Types locaux (filtres)                                             */
/* ------------------------------------------------------------------ */

type FiltreAssignation =
  | "tous"
  | "non_assignes"
  | "assignes"
  | "en_cours"
  | "termines"
  | "par_employe";

const FILTRE_OPTIONS: {
  value: FiltreAssignation;
  label: string;
}[] = [
  { value: "tous", label: "Tous" },
  { value: "non_assignes", label: "Non assignés" },
  { value: "assignes", label: "Assignés" },
  { value: "en_cours", label: "En cours" },
  { value: "termines", label: "Terminés" },
  { value: "par_employe", label: "Par employé" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Rôles de production (filtrage du dropdown d'assignation). */
const PRODUCTION_ROLES = new Set(["laveur", "repassage", "livreur", "manager"]);

/** Libellé FR court d'un rôle personnel (pour badges). */
const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  receptionniste: "Réceptionniste",
  caissier: "Caissier",
  laveur: "Laveur",
  repassage: "Repassage",
  livreur: "Livreur",
  comptable: "Comptable",
};

/** Variante Badge shadcn/ui pour un rôle. */
function roleBadgeVariant(
  role: string | null
): "default" | "secondary" | "info" | "warning" | "outline" {
  switch (role) {
    case "laveur":
      return "info";
    case "repassage":
      return "secondary";
    case "livreur":
      return "warning";
    case "manager":
      return "default";
    default:
      return "outline";
  }
}

/** Construit l'URL de la production-file avec les filtres courants. */
function buildListUrl(opts: {
  filtre: FiltreAssignation;
  employeId: string;
  q: string;
}): string {
  const params = new URLSearchParams({ filtre: opts.filtre });
  if (opts.filtre === "par_employe" && opts.employeId) {
    params.set("employe_id", opts.employeId);
  }
  if (opts.q) {
    params.set("q", opts.q);
  }
  return `/api/admin/production-file?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */

export default function ManagerProductionPage() {
  // --- Filtres ---
  const [filtre, setFiltre] = useState<FiltreAssignation>("tous");
  const [employeId, setEmployeId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // --- Données ---
  const [items, setItems] = useState<ProductionFileItem[]>([]);
  const [counters, setCounters] = useState<ProductionFileCounters>({
    non_assignes: 0,
    assignes: 0,
    en_cours: 0,
    termines: 0,
    total: 0,
  });
  const [parEmploye, setParEmploye] = useState<ParEmployeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Dialog d'assignation ---
  const [assignTarget, setAssignTarget] =
    useState<ProductionFileItem | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [personnelList, setPersonnelList] = useState<PersonnelRow[]>([]);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);

  /* -------------------- Debounce recherche -------------------- */
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  /* -------------------- Reset employeId quand on quitte par_employe -------------------- */
  useEffect(() => {
    if (filtre !== "par_employe") {
      setEmployeId("");
    }
  }, [filtre]);

  /* -------------------- Fetch liste (production-file) -------------------- */
  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = buildListUrl({
        filtre,
        employeId,
        q: debouncedQuery,
      });
      const res = await fetch(url, { cache: "no-store" });
      const json: ProductionFileApiResponse = await res.json();
      if (!json.success) {
        throw new Error(
          json.error || "Erreur lors de la récupération de la file de production"
        );
      }
      setItems(json.data ?? []);
      setCounters(
        json.counters ?? {
          non_assignes: 0,
          assignes: 0,
          en_cours: 0,
          termines: 0,
          total: 0,
        }
      );
      setParEmploye(json.par_employe ?? []);
    } catch (err) {
      console.error("[manager/production] Erreur fetch:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError(
          "Erreur réseau. Vérifiez votre connexion internet puis rechargez la page."
        );
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(
          "Une erreur est survenue lors du chargement de la file de production. Veuillez réessayer."
        );
      }
    } finally {
      setLoading(false);
    }
  }, [filtre, employeId, debouncedQuery]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /* -------------------- Fetch personnel actif pour le dialog d'assignation -------------------- */
  const fetchPersonnel = useCallback(async () => {
    setPersonnelLoading(true);
    try {
      // pageSize=100 pour récupérer tout le personnel actif d'un coup
      // (limite plan business = illimité mais la plupart des pressings ont
      // moins de 100 employés).
      const res = await fetch(
        "/api/admin/personnel?statut=actif&pageSize=100",
        { cache: "no-store" }
      );
      const json: PersonnelApiResponse = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Erreur lors de la récupération du personnel");
      }
      // Filtre client-side : on ne garde que les rôles de production
      // (laveur, repassage, livreur, manager). Les caissiers / réceptionnistes
      // / comptables ne peuvent pas être assignés à un article de production.
      const filtered = (json.data ?? []).filter((p) =>
        PRODUCTION_ROLES.has(p.role)
      );
      setPersonnelList(filtered);
    } catch (err) {
      console.error("[manager/production] Erreur fetch personnel:", err);
      toast.error("Impossible de charger la liste du personnel", {
        description:
          err instanceof Error ? err.message : "Veuillez réessayer.",
      });
      setPersonnelList([]);
    } finally {
      setPersonnelLoading(false);
    }
  }, []);

  /* -------------------- Ouverture du dialog d'assignation -------------------- */
  function openAssignDialog(item: ProductionFileItem) {
    setAssignTarget(item);
    setSelectedPersonnelId(item.assigne_a ?? "");
    setAssignDialogOpen(true);
    // Rafraîchit la liste du personnel (pour rester à jour : nouveaux
    // employés ajoutés, désactivations, etc.).
    void fetchPersonnel();
  }

  function closeAssignDialog() {
    setAssignDialogOpen(false);
    setAssignTarget(null);
    setSelectedPersonnelId("");
    setAssignSubmitting(false);
  }

  /* -------------------- Submit : assigner / réassigner -------------------- */
  async function handleSubmitAssign() {
    if (!assignTarget) return;
    if (!selectedPersonnelId) {
      toast.error("Sélection requise", {
        description: "Veuillez choisir un employé à assigner à cet article.",
      });
      return;
    }
    setAssignSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/commandes/${assignTarget.commande_id}/articles/${assignTarget.article_id}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personnel_id: selectedPersonnelId }),
        }
      );
      const json: AssignApiResponse = await res.json();
      if (!res.ok || !json.success) {
        const msg =
          json.error ?? "Échec de l'assignation. Veuillez réessayer.";
        // Cas particulier : rôle incompatible — message plus clair
        if (json.code === "ROLE_INCOMPATIBLE") {
          toast.error("Rôle incompatible", {
            description:
              msg +
              " Le rôle de l'employé choisi ne correspond pas à l'étape de production de cet article.",
          });
        } else {
          toast.error("Échec de l'assignation", { description: msg });
        }
        return;
      }

      // Succès : retrouve le nom de l'employé sélectionné pour le toast
      const employe = personnelList.find(
        (p) => p.id === selectedPersonnelId
      );
      const nom = employe?.nom_complet ?? "l'employé sélectionné";
      toast.success("Article assigné", {
        description: `Article ${assignTarget.code_qr ?? assignTarget.article_id.slice(0, 8)} assigné à ${nom}.`,
      });
      closeAssignDialog();
      await fetchList();
    } catch (err) {
      console.error("[manager/production] Erreur submit assign:", err);
      const msg =
        err instanceof TypeError && err.message.includes("fetch")
          ? "Erreur réseau. Vérifiez votre connexion internet."
          : err instanceof Error
          ? err.message
          : "Erreur inconnue.";
      toast.error("Échec de l'assignation", { description: msg });
    } finally {
      setAssignSubmitting(false);
    }
  }

  /* -------------------- Désassigner -------------------- */
  async function handleUnassign(item: ProductionFileItem) {
    if (unassigningId) return;
    setUnassigningId(item.article_id);
    try {
      const res = await fetch(
        `/api/admin/commandes/${item.commande_id}/articles/${item.article_id}/assign`,
        { method: "DELETE" }
      );
      const json: AssignApiResponse = await res.json();
      if (!res.ok || !json.success) {
        const msg =
          json.error ?? "Échec de la désassignation. Veuillez réessayer.";
        toast.error("Échec de la désassignation", { description: msg });
        return;
      }
      toast.success("Article désassigné", {
        description: `L'article ${item.code_qr ?? item.article_id.slice(0, 8)} est de nouveau dans la file « à assigner ».`,
      });
      await fetchList();
    } catch (err) {
      console.error("[manager/production] Erreur unassign:", err);
      const msg =
        err instanceof TypeError && err.message.includes("fetch")
          ? "Erreur réseau. Vérifiez votre connexion internet."
          : err instanceof Error
          ? err.message
          : "Erreur inconnue.";
      toast.error("Échec de la désassignation", { description: msg });
    } finally {
      setUnassigningId(null);
    }
  }

  /* -------------------- Sous-composant : 4 StatCards -------------------- */
  function renderStatCards() {
    if (loading && items.length === 0) {
      return (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      );
    }
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="À assigner"
          value={counters.non_assignes}
          icon={ClipboardList}
          accent="warning"
          description="Articles non assignés"
          delay={0}
        />
        <StatCard
          label="Assignées"
          value={counters.assignes}
          icon={UserCheck}
          accent="primary"
          description="En attente de traitement"
          delay={60}
        />
        <StatCard
          label="En cours"
          value={counters.en_cours}
          icon={Loader2}
          accent="primary"
          description="Traitement en cours"
          delay={120}
        />
        <StatCard
          label="Terminées"
          value={counters.termines}
          icon={CheckCircle}
          accent="secondary"
          description="Articles terminés"
          delay={180}
        />
      </div>
    );
  }

  /* -------------------- Sous-composant : Onglets filtres -------------------- */
  function renderFilterTabs() {
    return (
      <div
        role="tablist"
        aria-label="Filtrer la file de production"
        className="flex flex-wrap items-center gap-2"
      >
        {FILTRE_OPTIONS.map((opt) => {
          const active = filtre === opt.value;
          const showBadge =
            opt.value === "non_assignes" && counters.non_assignes > 0;
          return (
            <Button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              variant={active ? "default" : "outline"}
              size="sm"
              className={cn("h-9 gap-2", active && "shadow-sm")}
              onClick={() => setFiltre(opt.value)}
            >
              {opt.label}
              {showBadge && (
                <Badge
                  variant={active ? "secondary" : "warning"}
                  className="ml-0.5 h-5 px-1.5 text-[10px] font-semibold leading-none"
                >
                  {counters.non_assignes}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>
    );
  }

  /* -------------------- Sous-composant : Barre de recherche -------------------- */
  function renderSearch() {
    return (
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par n° commande ou client…"
          className="h-11 pl-9 pr-9"
          aria-label="Rechercher dans la file de production"
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
    );
  }

  /* -------------------- Sous-composant : Ligne desktop -------------------- */
  function renderDesktopRow(item: ProductionFileItem) {
    const isExpress = item.priorite === "express";
    const isUnassigning = unassigningId === item.article_id;
    return (
      <tr
        key={item.article_id}
        className="group transition-colors hover:bg-accent/40"
      >
        <td className="px-3 py-3">
          <Link
            href={`${BASE_PATH}/commandes/${item.commande_id}`}
            className="font-mono text-xs font-medium text-foreground underline-offset-2 group-hover:text-primary group-hover:underline"
            title={`Ouvrir le détail de la commande ${item.numero_commande}`}
          >
            {item.numero_commande}
          </Link>
          {item.code_qr && (
            <p className="font-mono text-[10px] text-muted-foreground">
              {item.code_qr}
            </p>
          )}
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-col">
            <span className="font-medium text-foreground">
              {item.client_nom ?? "—"}
            </span>
            {item.client_telephone && (
              <span className="text-xs text-muted-foreground">
                {item.client_telephone}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-3">
          <StatusBadge
            status={item.article_statut}
            label={STATUT_LABELS[item.article_statut] ?? item.article_statut}
            variant={statutVariant(item.article_statut)}
          />
        </td>
        <td className="px-3 py-3">
          {item.assigne_a ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                {item.assigne_nom ?? "—"}
              </span>
              {item.assigne_role && (
                <Badge
                  variant={roleBadgeVariant(item.assigne_role)}
                  className="w-fit"
                >
                  {ROLE_LABELS[item.assigne_role] ?? item.assigne_role}
                </Badge>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UserMinus className="size-3.5" />
              Non assigné
            </span>
          )}
        </td>
        <td className="px-3 py-3 text-sm text-muted-foreground">
          {formatDateOnly(item.date_reception)}
        </td>
        <td className="px-3 py-3">
          {isExpress ? (
            <Badge variant="warning" className="font-semibold">
              Express
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Normal</span>
          )}
        </td>
        <td className="px-3 py-3 text-sm text-foreground">
          {item.zone_stockage ?? (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-end gap-1.5">
            {!item.assigne_a ? (
              <Button
                type="button"
                size="sm"
                onClick={() => openAssignDialog(item)}
                aria-label={`Assigner l'article ${item.code_qr ?? item.numero_commande} à un employé`}
              >
                <UserPlus className="size-4" />
                Assigner
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openAssignDialog(item)}
                  aria-label={`Réassigner l'article ${item.code_qr ?? item.numero_commande}`}
                >
                  <UserCheck className="size-4" />
                  Réassigner
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => handleUnassign(item)}
                  disabled={!!unassigningId}
                  aria-label={`Désassigner l'article ${item.code_qr ?? item.numero_commande}`}
                  title="Désassigner"
                >
                  {isUnassigning ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserMinus className="size-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  /* -------------------- Sous-composant : Card mobile -------------------- */
  function renderMobileCard(item: ProductionFileItem) {
    const isExpress = item.priorite === "express";
    const isUnassigning = unassigningId === item.article_id;
    return (
      <li key={item.article_id}>
        <Card className="bg-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`${BASE_PATH}/commandes/${item.commande_id}`}
                  className="font-mono text-xs font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
                >
                  {item.numero_commande}
                </Link>
                {item.code_qr && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {item.code_qr}
                  </p>
                )}
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {item.client_nom ?? "—"}
                </p>
                {item.client_telephone && (
                  <p className="truncate text-xs text-muted-foreground">
                    {item.client_telephone}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge
                  status={item.article_statut}
                  label={
                    STATUT_LABELS[item.article_statut] ?? item.article_statut
                  }
                  variant={statutVariant(item.article_statut)}
                  className="shrink-0"
                />
                {isExpress && (
                  <Badge variant="warning" className="shrink-0 text-[10px]">
                    Express
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Reçue le {formatDateOnly(item.date_reception)}</span>
              {item.zone_stockage && (
                <span className="inline-flex items-center gap-1">
                  · Casier {item.zone_stockage}
                </span>
              )}
            </div>

            {item.assigne_a ? (
              <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">
                    Assigné à
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {item.assigne_nom ?? "—"}
                  </span>
                </div>
                {item.assigne_role && (
                  <Badge variant={roleBadgeVariant(item.assigne_role)}>
                    {ROLE_LABELS[item.assigne_role] ?? item.assigne_role}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                <UserMinus className="size-3.5" />
                Non assigné
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {!item.assigne_a ? (
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  onClick={() => openAssignDialog(item)}
                >
                  <UserPlus className="size-4" />
                  Assigner
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => openAssignDialog(item)}
                  >
                    <UserCheck className="size-4" />
                    Réassigner
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    onClick={() => handleUnassign(item)}
                    disabled={!!unassigningId}
                    aria-label="Désassigner"
                  >
                    {isUnassigning ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <UserMinus className="size-4" />
                    )}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </li>
    );
  }

  /* -------------------- Sous-composant : Tableau d'articles -------------------- */
  function renderArticlesTable() {
    if (loading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-8 text-center"
        >
          <AlertCircle className="size-8 text-danger" />
          <p className="text-sm font-medium text-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchList()}>
            Réessayer
          </Button>
        </div>
      );
    }
    if (items.length === 0) {
      const emptyMap: Record<
        FiltreAssignation,
        { title: string; desc: string }
      > = {
        tous: {
          title: "File de production vide",
          desc: "Aucun article à traiter pour le moment. Les nouvelles commandes reçues apparaîtront automatiquement ici.",
        },
        non_assignes: {
          title: "Rien à assigner",
          desc: debouncedQuery
            ? "Aucun article non assigné ne correspond à votre recherche."
            : "Tous les articles ont été assignés. Les nouvelles commandes reçues génèrent de nouveaux articles à assigner.",
        },
        assignes: {
          title: "Aucune tâche assignée en attente",
          desc: "Aucun article n'est actuellement en attente de traitement par un employé.",
        },
        en_cours: {
          title: "Aucun traitement en cours",
          desc: "Aucun article n'est actuellement en cours de traitement.",
        },
        termines: {
          title: "Aucun article terminé",
          desc: "Les articles terminés (lavés / repassés / prêts / livrés) apparaîtront ici.",
        },
        par_employe: {
          title: "Aucun employé assigné",
          desc: "Aucun article n'est actuellement assigné à un employé de production.",
        },
      };
      const e = emptyMap[filtre];
      return (
        <EmptyState icon={ClipboardList} title={e.title} description={e.desc} />
      );
    }

    return (
      <>
        {/* Desktop : tableau */}
        <div className="hidden overflow-x-auto rounded-lg border md:block">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-3 font-semibold text-foreground">
                  N° ticket
                </th>
                <th className="px-3 py-3 font-semibold text-foreground">
                  Client
                </th>
                <th className="px-3 py-3 font-semibold text-foreground">
                  Article statut
                </th>
                <th className="px-3 py-3 font-semibold text-foreground">
                  Assigné à
                </th>
                <th className="px-3 py-3 font-semibold text-foreground">
                  Date réception
                </th>
                <th className="px-3 py-3 font-semibold text-foreground">
                  Priorité
                </th>
                <th className="px-3 py-3 font-semibold text-foreground">
                  Casier
                </th>
                <th className="px-3 py-3 text-right font-semibold text-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(renderDesktopRow)}
            </tbody>
          </table>
        </div>

        {/* Mobile : cards */}
        <ul className="space-y-3 md:hidden">{items.map(renderMobileCard)}</ul>
      </>
    );
  }

  /* -------------------- Sous-composant : Vue par employé -------------------- */
  function renderParEmploye() {
    if (loading) {
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-8 text-center"
        >
          <AlertCircle className="size-8 text-danger" />
          <p className="text-sm font-medium text-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchList()}>
            Réessayer
          </Button>
        </div>
      );
    }
    if (parEmploye.length === 0) {
      return (
        <EmptyState
          icon={Users}
          title="Aucun employé n'a d'article assigné"
          description="Tous les articles sont actuellement non assignés. Cliquez sur « À assigner » pour distribuer les tâches."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFiltre("non_assignes")}
            >
              Voir les articles à assigner
              <ArrowRight className="size-4" />
            </Button>
          }
        />
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {parEmploye.map((emp) => (
          <Card key={emp.personnel_id}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                    aria-hidden
                  >
                    <Users className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {emp.nom_complet}
                    </p>
                    <Badge
                      variant={roleBadgeVariant(emp.role)}
                      className="mt-1"
                    >
                      {ROLE_LABELS[emp.role] ?? emp.role}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Articles assignés
                  </p>
                  <p className="text-3xl font-bold tracking-tight text-foreground">
                    {emp.count}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEmployeId(emp.personnel_id);
                    setFiltre("par_employe");
                  }}
                  aria-label={`Voir les tâches de ${emp.nom_complet}`}
                >
                  Voir ses tâches
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  /* -------------------- Personnel trié alphabétiquement (pour le dialog d'assignation) -------------------- */
  const sortedPersonnel = useMemo(
    () =>
      [...personnelList].sort((a, b) =>
        a.nom_complet.localeCompare(b.nom_complet, "fr")
      ),
    [personnelList]
  );

  /* -------------------- Sous-composant : Dialog d'assignation -------------------- */
  function renderAssignDialog() {
    const target = assignTarget;
    if (!target) return null;
    const isReassign = !!target.assigne_a;
    const title = isReassign ? "Réassigner l'article" : "Assigner l'article";

    return (
      <Dialog
        open={assignDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeAssignDialog();
          else setAssignDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              {title}
            </DialogTitle>
            <DialogDescription>
              Article{" "}
              <span className="font-mono font-semibold text-foreground">
                {target.code_qr ?? target.article_id.slice(0, 8)}
              </span>{" "}
              de la commande{" "}
              <Link
                href={`${BASE_PATH}/commandes/${target.commande_id}`}
                className="font-mono font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
              >
                {target.numero_commande}
              </Link>{" "}
              — statut actuel :{" "}
              <span className="font-medium text-foreground">
                {STATUT_LABELS[target.article_statut] ?? target.article_statut}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label
              htmlFor="personnel-select"
              className="text-sm font-medium text-foreground"
            >
              Employé à assigner
            </label>
            {personnelLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Chargement du personnel…
              </div>
            ) : sortedPersonnel.length === 0 ? (
              <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Aucun personnel de production actif trouvé. Ajoutez d'abord un
                employé (laveur, repassage, livreur) dans la section Personnel.
              </p>
            ) : (
              <Select
                value={selectedPersonnelId}
                onValueChange={setSelectedPersonnelId}
              >
                <SelectTrigger
                  id="personnel-select"
                  className="h-11 w-full"
                  aria-label="Sélectionner un employé"
                >
                  <SelectValue placeholder="Choisir un employé…" />
                </SelectTrigger>
                <SelectContent>
                  {sortedPersonnel.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span>{p.nom_complet}</span>
                        <Badge
                          variant={roleBadgeVariant(p.role)}
                          className="ml-1"
                        >
                          {ROLE_LABELS[p.role] ?? p.role}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {target.assigne_nom && (
              <p className="text-xs text-muted-foreground">
                Actuellement assigné à :{" "}
                <span className="font-medium text-foreground">
                  {target.assigne_nom}
                </span>
                {target.assigne_role && (
                  <>
                    {" "}
                    (
                    {ROLE_LABELS[target.assigne_role] ?? target.assigne_role})
                  </>
                )}
                .
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              ℹ️ Le système vérifie automatiquement la compatibilité du rôle
              avec le statut de l'article (ex. un article « lavé » doit être
              assigné à un repassage). Un rôle incompatible sera refusé.
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={assignSubmitting}
              >
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSubmitAssign}
              disabled={
                assignSubmitting ||
                personnelLoading ||
                !selectedPersonnelId ||
                personnelList.length === 0
              }
            >
              {assignSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Assignation…
                </>
              ) : (
                <>
                  <UserCheck className="size-4" />
                  Confirmer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  /* -------------------- Rendu principal -------------------- */
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          File de production
        </h1>
        <p className="text-muted-foreground">
          Manager — assignez et suivez les tâches de production
        </p>
      </div>

      {/* 2. Erreur globale (si présenté hors du tableau) */}
      {error && !loading && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-foreground"
        >
          <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">
              Impossible de charger la file de production
            </p>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchList()}
          >
            Réessayer
          </Button>
        </div>
      )}

      {/* 3. StatCards (4) */}
      {renderStatCards()}

      {/* 4. Onglets filtres */}
      {renderFilterTabs()}

      {/* 5. Recherche (masquée en mode par_employe — la recherche filtre des articles, pas des employés) */}
      {filtre !== "par_employe" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {renderSearch()}
        </div>
      )}

      {/* 6. Contenu principal : table ou par_employe, dans conteneur scrollable */}
      <section
        className="space-y-3"
        aria-label={
          filtre === "par_employe"
            ? "Répartition par employé"
            : "Liste des articles"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            {filtre === "par_employe"
              ? "Répartition par employé"
              : FILTRE_OPTIONS.find((o) => o.value === filtre)?.label ??
                "Articles"}
          </h2>
          {(unassigningId || assignSubmitting) && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Mise à jour en cours…
            </span>
          )}
        </div>
        <div className="max-h-[600px] overflow-y-auto rounded-lg pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent">
          {filtre === "par_employe"
            ? renderParEmploye()
            : renderArticlesTable()}
        </div>
      </section>

      {/* 7. Dialog d'assignation */}
      {renderAssignDialog()}
    </div>
  );
}
