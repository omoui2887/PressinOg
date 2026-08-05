/**
 * <ProductCard /> — Carte d'article du catalogue POS (vue article-centric).
 *
 * Affiche UNE carte par article du catalogue (dédupliquée par catalogue_article_id).
 * L'image + le nom de l'article + le prix correspondant au service actuellement
 * sélectionné dans la <CategoryBar /> du bas (ou le 1er service disponible en
 * mode « Tous »). Un petit badge indique le service associé au prix affiché,
 * pour que l'utilisateur sache toujours ce qu'il commande.
 *
 * Si aucun tarif n'existe pour cet article × le service sélectionné, la carte
 * est désactivée (grisée) et affiche « — » au lieu d'un prix.
 */
"use client";
import Image from "next/image";
import { memo } from "react";
import { Package } from "lucide-react";
import type { PosArticle } from "@/lib/pos/types";
import { formatFcfa } from "@/lib/pos/format";

interface ProductCardProps {
  article: PosArticle;
  /** Indique si un tarif existe pour cet article × le service sélectionné. */
  hasPrice: boolean;
  /** Libellé court du service associé au prix affiché (ex : « Lavage »). */
  serviceLabel?: string;
  quantiteDansPanier: number;
  flash: boolean;
  onAdd: () => void;
}

function ProductCardImpl({
  article,
  hasPrice,
  serviceLabel,
  quantiteDansPanier,
  flash,
  onAdd,
}: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={hasPrice ? onAdd : undefined}
      disabled={!hasPrice}
      data-active={quantiteDansPanier > 0}
      data-flash={flash}
      className="pos-product-card group relative flex flex-col overflow-hidden rounded-md text-left disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={
        hasPrice
          ? `Ajouter ${article.catalogue_nom} – ${formatFcfa(article.prix)}`
          : `${article.catalogue_nom} – aucun tarif pour ce service`
      }
      title={
        hasPrice
          ? `${article.catalogue_nom} – ${serviceLabel ?? "Service"} – ${formatFcfa(article.prix)}`
          : `${article.catalogue_nom} – aucun tarif configuré pour ce service. Définissez-le dans Tarifs par article.`
      }
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
        {/* Badge prix rouge en bas de l'image (ou « — » si pas de tarif) */}
        <span className="pos-price-badge absolute bottom-0 left-0 right-0 block py-0.5 text-center text-[11px] leading-tight">
          {hasPrice ? formatFcfa(article.prix) : "—"}
        </span>
        {/* Compteur discret si déjà au panier */}
        {quantiteDansPanier > 0 && (
          <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--pos-primary)] px-1 text-[11px] font-bold text-white shadow pos-mono">
            {quantiteDansPanier}
          </span>
        )}
      </div>
      {/* Nom de l'article (catalogue_nom) — la source de vérité visuelle */}
      <div className="flex items-center justify-center gap-1 px-1 py-1.5 text-center">
        <Package className="hidden h-3 w-3 shrink-0 text-[var(--pos-text-muted)]" />
        <span className="pos-product-name line-clamp-2 text-[11px] font-medium leading-tight">
          {article.catalogue_nom}
        </span>
      </div>
    </button>
  );
}

export const ProductCard = memo(ProductCardImpl);
