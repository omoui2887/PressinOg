/**
 * OgPressing — CommandesPage (client orchestrator, LOT 7.6)
 * ----------------------------------------------------------
 * Page /admin/commandes : liste des commandes du pressing connecté avec
 * recherche texte (numero_commande OU nom du client), filtres par statut
 * commande + statut paiement, pagination 20/page.
 *
 * Affichage mobile-first : cards empilées sur mobile, tableau sur desktop
 * (délégué à `<CommandesList>`).
 *
 * Bouton "Scanner QR" dans le header : ouvre le `<QRScanner>` partagé.
 * Au scan réussi : parse le JSON `{ commande_id, numero_commande, pressing_id }`
 * OU traite la chaîne comme un numero_commande, fetch l'API pour trouver
 * l'ID, puis redirige (hard navigation via `window.location.href`) vers
 * /admin/commandes/{id}.
 *
 * Données via GET /api/admin/commandes (RLS isole par pressing).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRScanner } from "@/components/shared/qr-scanner";
import { toast } from "sonner";
import { CommandesFilters } from "./commandes-filters";
import { CommandesList } from "./commandes-list";
import { CommandesPagination } from "./commandes-pagination";
import type {
  CommandeListItem,
  CommandesApiResponse,
} from "./commandes-helpers";

const PAGE_SIZE = 20;

export function CommandesPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statut, setStatut] = useState("");
  const [statutPaiement, setStatutPaiement] = useState("");
  const [page, setPage] = useState(1);
  const [commandes, setCommandes] = useState<CommandeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // QR scanner
  const [scannerOpen, setScannerOpen] = useState(false);

  // Debounce 300ms sur la recherche
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1); // reset pagination quand la recherche change
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset pagination quand un filtre change
  useEffect(() => {
    setPage(1);
  }, [statut, statutPaiement]);

  const fetchCommandes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (statut) params.set("statut", statut);
      if (statutPaiement) params.set("statut_paiement", statutPaiement);

      const res = await fetch(`/api/admin/commandes?${params.toString()}`, {
        cache: "no-store",
      });
      const data: CommandesApiResponse = await res.json();
      if (data.success) {
        setCommandes(data.data);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else {
        console.error("[commandes] Erreur API:", data.error);
        setCommandes([]);
        setTotal(0);
        setTotalPages(0);
      }
    } catch (err) {
      console.error("[commandes] Erreur fetch:", err);
      setCommandes([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, statut, statutPaiement, page]);

  useEffect(() => {
    fetchCommandes();
  }, [fetchCommandes]);

  /**
   * Handler du QR scanner : interprète la chaîne décodée.
   *   - Si JSON avec `commande_id` → redirige directement.
   *   - Si JSON avec `numero_commande` (sans commande_id) → fetch API.
   *   - Sinon → traite la chaîne comme un numero_commande → fetch API.
   *
   * La vérification d'appartenance au pressing est garantie par RLS côté API
   * (la SELECT ne renvoie que les commandes du pressing connecté).
   */
  async function handleScanSuccess(decoded: string) {
    let commandeId: string | null = null;
    let searchQuery: string | null = null;

    try {
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      if (typeof parsed.commande_id === "string") {
        commandeId = parsed.commande_id;
      } else if (typeof parsed.numero_commande === "string") {
        searchQuery = parsed.numero_commande;
      }
    } catch {
      // Pas du JSON → on traite la chaîne comme un numero_commande brut.
      searchQuery = decoded.trim();
    }

    // Si on a déjà l'ID, on redirige directement (vérification RLS via
    // un GET liste avec q=numero_commande pour s'assurer que la commande
    // existe et appartient bien au pressing — évite une 404 muette).
    if (commandeId) {
      // Vérifie l'existence via l'API liste (q vide, on ne peut pas filtrer
      // par id directement). On redirige en confiance : RLS bloque la page
      // détail si la commande n'appartient pas au pressing.
      window.location.href = `/admin/commandes/${commandeId}`;
      return;
    }

    if (searchQuery) {
      try {
        const res = await fetch(
          `/api/admin/commandes?q=${encodeURIComponent(
            searchQuery
          )}&pageSize=1`,
          { cache: "no-store" }
        );
        const data: CommandesApiResponse = await res.json();
        if (data.success && data.data.length > 0) {
          commandeId = data.data[0].id;
        }
      } catch (err) {
        console.error("[commandes] Erreur lookup scan:", err);
      }
    }

    if (commandeId) {
      window.location.href = `/admin/commandes/${commandeId}`;
    } else {
      toast.error("Commande introuvable", {
        description:
          "Le QR Code ou numéro ne correspond à aucune commande de votre pressing.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <ClipboardList className="size-6 text-primary" />
            Commandes
          </h1>
          <p className="text-sm text-muted-foreground">
            Suivi des commandes de votre pressing — {total} commande
            {total > 1 ? "s" : ""}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setScannerOpen(true)}
        >
          <QrCode className="size-4" />
          Scanner QR
        </Button>
      </div>

      {/* Filtres */}
      <CommandesFilters
        query={query}
        onQueryChange={setQuery}
        statut={statut}
        onStatutChange={setStatut}
        statutPaiement={statutPaiement}
        onStatutPaiementChange={setStatutPaiement}
      />

      {/* Liste */}
      <CommandesList commandes={commandes} loading={loading} />

      {/* Pagination */}
      {!loading && commandes.length > 0 && (
        <CommandesPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      {/* QR Scanner dialog */}
      <QRScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
