/**
 * e-pressing — StockActionsMenu (LOT 10.1)
 * -----------------------------------------
 * Menu d'actions par produit (DropdownMenu) :
 *   - Enregistrer un mouvement
 *   - Voir la FDS (si fds_url, ouvre nouvel onglet)
 *   - Modifier
 */
"use client";

import { MoreVertical, ArrowLeftRight, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProduitStock } from "./stock-helpers";

interface StockActionsMenuProps {
  produit: ProduitStock;
  onMouvement: () => void;
  onEdit: () => void;
}

export function StockActionsMenu({
  produit,
  onMouvement,
  onEdit,
}: StockActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={`Actions pour ${produit.nom}`}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onMouvement}>
          <ArrowLeftRight className="mr-2 size-4" />
          Enregistrer un mouvement
        </DropdownMenuItem>
        {produit.fds_url && (
          <DropdownMenuItem asChild>
            <a
              href={produit.fds_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center"
            >
              <FileText className="mr-2 size-4" />
              Voir la FDS
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 size-4" />
          Modifier
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
