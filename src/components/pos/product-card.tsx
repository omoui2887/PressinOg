/**
 * <ProductCard /> — Carte d'article du catalogue POS.
 * Illustration + badge prix rouge + nom + compteur si déjà au panier.
 */
"use client";
import Image from "next/image";
import { memo } from "react";
import { Package } from "lucide-react";
import type { PosArticle } from "@/lib/pos/types";
import { formatFcfa } from "@/lib/pos/format";

interface ProductCardProps {
  article: PosArticle;
  quantiteDansPanier: number;
  flash: boolean;
  onAdd: () => void;
}

function ProductCardImpl({
  article,
  quantiteDansPanier,
  flash,
  onAdd,
}: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      data-active={quantiteDansPanier > 0}
      data-flash={flash}
      className="pos-product-card group relative flex flex-col overflow-hidden rounded-md text-left"
      aria-label={`Ajouter ${article.catalogue_nom} – ${formatFcfa(article.prix)}`}
    >
      {/* Illustration */}
      <div className="relative aspect-[4/3] w-full bg-[var(--pos-primary-light)]">
        <Image
          src={article.icone_url}
          alt={article.catalogue_nom}
          fill
          sizes="120px"
          className="object-contain p-1.5"
          loading="eager"
        />
        {/* Badge prix rouge en bas de l'image */}
        <span className="pos-price-badge absolute bottom-0 left-0 right-0 block py-0.5 text-center text-[11px] leading-tight">
          {formatFcfa(article.prix)}
        </span>
        {/* Compteur discret si déjà au panier */}
        {quantiteDansPanier > 0 && (
          <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--pos-primary)] px-1 text-[11px] font-bold text-white shadow pos-mono">
            {quantiteDansPanier}
          </span>
        )}
      </div>
      {/* Nom de la prestation */}
      <div className="flex items-center justify-center gap-1 px-1 py-1.5 text-center">
        <Package className="hidden h-3 w-3 shrink-0 text-[var(--pos-text-muted)]" />
        <span className="pos-product-name line-clamp-2 text-[11px] font-medium leading-tight">
          {article.service_nom}
        </span>
      </div>
    </button>
  );
}

export const ProductCard = memo(ProductCardImpl);
