/**
 * <ArticleActionsDialog /> — Boîte de dialogue de choix de l'action.
 * ====================================================================
 *
 * S'ouvre automatiquement lorsque l'utilisateur clique sur un article du
 * catalogue POS. Liste les 6 actions possibles pour cet article, avec
 * le prix correspondant à chacune :
 *
 *   1. Lavage
 *   2. Repassage
 *   3. Laver-Repasser
 *   4. Nettoyage à sec
 *   5. Détachage
 *   6. Blanchisserie
 *
 * SYNERGIE AVEC « TARIFS PAR ARTICLE » :
 *   Les prix proviennent exclusivement des tarifs configurés par
 *   l'administrateur dans /admin/tarifs. Les actions SANS tarif
 *   s'affichent « Non configuré » et ne sont pas cliquables.
 *
 * L'utilisateur clique sur une action configurée → l'article (avec le
 * service sélectionné) est ajouté au panier et le dialogue se ferme.
 */
"use client";
import { memo, useMemo } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Droplets,
  Wind,
  Shirt,
  Sparkles,
  SprayCan,
  WashingMachine,
  ChevronRight,
  Lock,
  type LucideIcon,
} from "lucide-react";
import type { PosArticle, PosCategorieId } from "@/lib/pos/types";
import { formatFcfa } from "@/lib/pos/format";

interface ArticleActionsDialogProps {
  /** Article représentatif (pour l'image + le nom dans l'en-tête). */
  article: PosArticle | null;
  /** Toutes les variantes (une par service tarifé). */
  variants: PosArticle[];
  open: boolean;
  /** Appelé quand l'utilisateur choisit une action (variante spécifique). */
  onPick: (variant: PosArticle) => void;
  /** Ferme le dialogue (clic extérieur, Échap, bouton X). */
  onClose: () => void;
}

/**
 * Les 6 actions fixes affichées dans le dialogue, dans l'ordre métier.
 * Chaque action a : un id (PosCategorieId), un libellé, une icône Lucide,
 * et le type_service DB correspondant (pour retrouver la variante tarifée).
 */
const ACTIONS: Array<{
  id: Exclude<PosCategorieId, "tous">;
  label: string;
  icon: LucideIcon;
  typeService: string;
}> = [
  { id: "lavage", label: "Lavage", icon: Droplets, typeService: "lavage" },
  { id: "repassage", label: "Repassage", icon: Wind, typeService: "repassage" },
  { id: "laver-repasser", label: "Laver-Repasser", icon: Shirt, typeService: "laver_repasser" },
  { id: "nettoyage_sec", label: "Nettoyage à sec", icon: Sparkles, typeService: "nettoyage_sec" },
  { id: "detachage", label: "Détachage", icon: SprayCan, typeService: "detachage" },
  { id: "blanchisserie", label: "Blanchisserie", icon: WashingMachine, typeService: "blanchisserie" },
];

function ArticleActionsDialogImpl({
  article,
  variants,
  open,
  onPick,
  onClose,
}: ArticleActionsDialogProps) {
  /**
   * Map d'accès rapide : type_service → variante (PosArticle).
   * Permet de retrouver en O(1) la variante pour chaque action fixe.
   */
  const variantByType = useMemo<Map<string, PosArticle>>(() => {
    const m = new Map<string, PosArticle>();
    for (const v of variants) {
      // La clé est le type_service DB, reconstruit depuis la catégorie POS
      const typeService = categorieToTypeService(v.categorie);
      m.set(typeService, v);
    }
    return m;
  }, [variants]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* En-tête : image + nom de l'article */}
        {article && (
          <DialogHeader className="flex flex-row items-center gap-3 border-b border-[var(--pos-border)] bg-[var(--pos-primary-light)] p-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white">
              <Image
                src={article.icone_url}
                alt={article.catalogue_nom}
                fill
                sizes="56px"
                className="object-contain p-1"
              />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base font-semibold">
                {article.catalogue_nom}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Choisissez l&apos;action à effectuer
              </DialogDescription>
            </div>
          </DialogHeader>
        )}

        {/* Liste des 6 actions fixes */}
        <div className="pos-scroll max-h-[60vh] overflow-y-auto p-2">
          <ul className="flex flex-col gap-1">
            {ACTIONS.map((action) => {
              const variant = variantByType.get(action.typeService);
              const configured = !!variant;
              const Icon = action.icon;

              if (!configured) {
                // Action sans tarif → affichée en grisé, non cliquable
                return (
                  <li key={action.id}>
                    <div
                      className="flex w-full cursor-not-allowed items-center gap-3 rounded-md border border-transparent bg-[var(--pos-surface)] px-3 py-2.5 opacity-50"
                      aria-label={`${action.label} — Non configuré`}
                      role="button"
                      aria-disabled="true"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--pos-bg)] text-[var(--pos-text-muted)]">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-tight text-[var(--pos-text-muted)]">
                          {action.label}
                        </span>
                        <span className="block text-[11px] leading-tight text-[var(--pos-text-muted)]">
                          Non configuré
                        </span>
                      </span>
                      <span className="shrink-0 rounded-md bg-[var(--pos-bg)] px-2.5 py-1 text-xs font-medium text-[var(--pos-text-muted)]">
                        —
                      </span>
                      <Lock
                        className="h-4 w-4 shrink-0 text-[var(--pos-text-muted)]"
                        aria-hidden
                      />
                    </div>
                  </li>
                );
              }

              // Action configurée → cliquable, avec le prix
              return (
                <li key={action.id}>
                  <button
                    type="button"
                    onClick={() => onPick(variant)}
                    className="flex w-full items-center gap-3 rounded-md border border-transparent bg-[var(--pos-surface)] px-3 py-2.5 text-left transition-colors hover:border-[var(--pos-primary)] hover:bg-[var(--pos-primary-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pos-primary)]"
                    aria-label={`Ajouter ${action.label} – ${formatFcfa(variant.prix)}`}
                  >
                    {/* Icône action */}
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--pos-primary-light)] text-[var(--pos-primary)]">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    {/* Libellé action */}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-tight text-[var(--pos-text)]">
                        {action.label}
                      </span>
                      <span className="block truncate text-[11px] leading-tight text-[var(--pos-text-muted)]">
                        {variant.service_nom}
                      </span>
                    </span>
                    {/* Prix */}
                    <span className="shrink-0 rounded-md bg-[var(--pos-danger)] px-2.5 py-1 text-sm font-bold text-white pos-mono">
                      {formatFcfa(variant.prix)}
                    </span>
                    {/* Chevron */}
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-[var(--pos-text-muted)]"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Pied : aide contextuelle */}
        <div className="border-t border-[var(--pos-border)] bg-[var(--pos-bg)] px-3 py-2 text-center text-[11px] text-[var(--pos-text-muted)]">
          Prix configurés par l&apos;administrateur dans{" "}
          <strong>Tarifs par article</strong>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Conversion catégorie POS → type_service DB.
 * Utilisé pour retrouver la variante correspondant à chaque action fixe.
 */
function categorieToTypeService(cat: PosArticle["categorie"]): string {
  switch (cat) {
    case "laver-repasser":
      return "laver_repasser";
    case "nettoyage_sec":
      return "nettoyage_sec";
    case "lavage":
      return "lavage";
    case "repassage":
      return "repassage";
    case "detachage":
      return "detachage";
    case "blanchisserie":
      return "blanchisserie";
    default:
      return cat;
  }
}

export const ArticleActionsDialog = memo(ArticleActionsDialogImpl);
