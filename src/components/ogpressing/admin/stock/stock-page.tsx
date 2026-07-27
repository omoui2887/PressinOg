/**
 * OgPressing — StockPage (client orchestrator) — LOT 10.1
 * --------------------------------------------------------
 * Page /admin/stock : gestion du stock de biodétergents du pressing.
 *
 * Fonctionnalités :
 *   - Liste des produits (tri : alertes en premier)
 *   - Recherche par nom (debounce 300ms)
 *   - Bouton "+ Ajouter un produit" (dialog)
 *   - Par produit : enregistrer un mouvement, voir la FDS, modifier
 *   - Lien vers l'historique des mouvements
 *
 * Données via GET /api/admin/stock (RLS isole par pressing).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StockFilters } from "./stock-filters";
import { StockList } from "./stock-list";
import { AddProductDialog } from "./add-product-dialog";
import { EditProductDialog } from "./edit-product-dialog";
import { MouvementDialog } from "./mouvement-dialog";
import type { ProduitStock } from "./stock-helpers";

export function StockPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [produits, setProduits] = useState<ProduitStock[]>([]);
  const [loading, setLoading] = useState(true);

  // États dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editProduit, setEditProduit] = useState<ProduitStock | null>(null);
  const [mouvementProduit, setMouvementProduit] = useState<ProduitStock | null>(null);

  // Debounce recherche 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchProduits = useCallback(async () => {
    setLoading(true);
    try {
      const url = debouncedQuery
        ? `/api/admin/stock?q=${encodeURIComponent(debouncedQuery)}`
        : "/api/admin/stock";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setProduits(data.data);
      } else {
        setProduits([]);
      }
    } catch {
      setProduits([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    fetchProduits();
  }, [fetchProduits]);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Package className="size-6 text-primary" />
            Stock
          </h1>
          <p className="text-sm text-muted-foreground">
            Biodétergents et consommables — suivez vos entrées et sorties.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="h-11">
          <Plus className="mr-2 size-4" />
          Ajouter un produit
        </Button>
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <StockFilters query={query} onQueryChange={setQuery} />
      </Card>

      {/* Liste */}
      <StockList
        produits={produits}
        loading={loading}
        onMouvement={(p) => setMouvementProduit(p)}
        onEdit={(p) => setEditProduit(p)}
      />

      {/* Dialogs */}
      <AddProductDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onProductCreated={fetchProduits}
      />
      <EditProductDialog
        produit={editProduit}
        open={editProduit !== null}
        onOpenChange={(o) => !o && setEditProduit(null)}
        onProductUpdated={fetchProduits}
      />
      <MouvementDialog
        produit={mouvementProduit}
        open={mouvementProduit !== null}
        onOpenChange={(o) => !o && setMouvementProduit(null)}
        onMouvementCreated={fetchProduits}
      />
    </div>
  );
}
