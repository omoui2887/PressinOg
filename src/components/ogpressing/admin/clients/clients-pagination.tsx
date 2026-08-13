/**
 * e-pressing — ClientsPagination
 * -------------------------------
 * Pagination simple pour la liste des clients : Précédent / page X / Suivant.
 * Affiche aussi le nombre total de clients.
 *
 * Client component : boutons cliquables qui déclenchent onPageChange.
 */
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClientsPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function ClientsPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: ClientsPaginationProps) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        Affichage de{" "}
        <span className="font-medium text-foreground">
          {start}–{end}
        </span>{" "}
        sur{" "}
        <span className="font-medium text-foreground">{total}</span>{" "}
        client{total > 1 ? "s" : ""}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
          Précédent
        </Button>
        <span className="text-sm text-muted-foreground">
          Page <span className="font-medium text-foreground">{page}</span> /{" "}
          {totalPages || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Suivant
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
