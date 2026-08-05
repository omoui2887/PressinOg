/**
 * <ProductCard /> — Carte d'article du catalogue POS (vue article-centric, sans prix).
 *
 * Affiche UNE carte par article du catalogue (dédupliquée par catalogue_article_id).
 * La carte ne contient PLUS de prix : un simple clic ouvre une boîte de dialogue
 * (cf. <ArticleActionsDialog />) qui liste toutes les actions possibles pour cet
 * article (Repassage, Laver-Repasser, Séchage, Nettoyage à sec, Détachage…)
 * avec le prix correspondant à chacune. Les prix sont ceux configurés par
 * l'administrateur dans le module « Tarifs par articles » (avec fallback sur
 * le prix générique du service).
 *
 * Un compteur discret en haut à droite indique la quantité déjà au panier pour
 * cet article (toutes actions confondues).
 */
"use client";
import Image from "next/image";
import { memo } from "react";
import type { PosArticle } from "@/lib/pos/types";

interface ProductCardProps {
  /** Article représentatif (pour l'image et le nom — l'id n'est pas utilisé ici). */
  article: PosArticle;
  /** Nombre d'unités de cet article déjà au panier (toutes actions confondues). */
  quantiteDansPanier: number;
  /** Animation « flash » brève après ajout au panier. */
  flash: boolean;
  /** Ouvre la boîte de dialogue de choix de l'action. */
  onOpenActions: () => void;
}

function ProductCardImpl({
  article,
  quantiteDansPanier,
  flash,
  onOpenActions,
}: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenActions}
      data-active={quantiteDansPanier > 0}
      data-flash={flash}
      className="pos-product-card group relative flex flex-col overflow-hidden rounded-md text-left"
      aria-label={`Choisir une action pour ${article.catalogue_nom}`}
      title={`Cliquez pour choisir une action (Repassage, Lavage, etc.) pour ${article.catalogue_nom}`}
    >
      {/* Illustration — plus de bandeau prix en bas */}
      <div className="relative aspect-[4/3] w-full bg-[var(--pos-primary-light)]">
        <Image
          src={article.icone_url}
          alt={article.catalogue_nom}
          fill
          sizes="120px"
          className="object-contain p-1.5"
          loading="eager"
        />
        {/* Compteur discret si déjà au panier (toutes actions confondues) */}
        {quantiteDansPanier > 0 && (
          <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--pos-primary)] px-1 text-[11px] font-bold text-white shadow pos-mono">
            {quantiteDansPanier}
          </span>
        )}
      </div>
      {/* Nom de l'article (catalogue_nom) — la source de vérité visuelle */}
      <div className="flex items-center justify-center gap-1 px-1 py-1.5 text-center">
        <span className="pos-product-name line-clamp-2 text-[11px] font-medium leading-tight">
          {article.catalogue_nom}
        </span>
      </div>
    </button>
  );
}

export const ProductCard = memo(ProductCardImpl);
