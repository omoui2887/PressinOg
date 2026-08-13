/**
 * <ArticleActionsDialog /> — Boîte de dialogue de choix des actions.
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
 *   s'affichent « Non configuré » et ne sont pas sélectionnables.
 *
 * SÉLECTION MULTIPLE PAR CASES À COCHER :
 *   Chaque action configurée dispose d'une case à cocher. L'utilisateur
 *   peut cocher plusieurs actions d'un coup (ex : Repassage + Lavage
 *   pour un même article). Un bouton « Ajouter au panier » en bas
 *   affiche le nombre d'actions sélectionnées + le total, et ajoute
 *   toutes les variantes cochées au panier en une fois.
 */
"use client";
import { memo, useMemo, useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Droplets,
  Wind,
  Shirt,
  Sparkles,
  SprayCan,
  WashingMachine,
  Lock,
  ShoppingCart,
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
  /**
   * Appelé quand l'utilisateur confirme sa sélection (bouton
   * « Ajouter au panier »). Reçoit la liste des variantes cochées.
   */
  onConfirm: (variants: PosArticle[]) => void;
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
  onConfirm,
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

  /** Liste des type_services configurés (clés cochables). */
  const configuredTypes = useMemo(
    () => ACTIONS.filter((a) => variantByType.has(a.typeService)).map((a) => a.typeService),
    [variantByType]
  );

  /** Ensemble des type_services actuellement cochés. */
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Réinitialise la sélection à chaque ouverture du dialogue (transition
  // fermé → ouvert). On utilise le pattern « ajustement pendant le rendu »
  // recommandé par React (au lieu d'un useEffect) pour éviter les boucles
  // de rendu et satisfaire la règle react-hooks/set-state-in-effect.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChecked(new Set());
    }
  }

  const toggle = (typeService: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(typeService)) {
        next.delete(typeService);
      } else {
        next.add(typeService);
      }
      return next;
    });
  };

  /** Variants cochés (prêts à être ajoutés au panier). */
  const selectedVariants = useMemo<PosArticle[]>(() => {
    return Array.from(checked)
      .map((ts) => variantByType.get(ts))
      .filter((v): v is PosArticle => !!v);
  }, [checked, variantByType]);

  const totalAmount = useMemo(
    () => selectedVariants.reduce((sum, v) => sum + v.prix, 0),
    [selectedVariants]
  );

  const hasSelection = selectedVariants.length > 0;

  const handleConfirm = () => {
    if (!hasSelection) return;
    onConfirm(selectedVariants);
  };

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
                Cochez les actions à effectuer
              </DialogDescription>
            </div>
          </DialogHeader>
        )}

        {/* Liste des 6 actions fixes avec cases à cocher */}
        <div className="pos-scroll max-h-[55vh] overflow-y-auto p-2">
          <ul className="flex flex-col gap-1">
            {ACTIONS.map((action) => {
              const variant = variantByType.get(action.typeService);
              const configured = !!variant;
              const isChecked = configured && checked.has(action.typeService);
              const Icon = action.icon;

              if (!configured) {
                // Action sans tarif → affichée en grisé, non sélectionnable
                return (
                  <li key={action.id}>
                    <div
                      className="flex w-full cursor-not-allowed items-center gap-3 rounded-md border border-transparent bg-[var(--pos-surface)] px-3 py-2.5 opacity-50"
                      aria-label={`${action.label} — Non configuré`}
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

              // Action configurée → case à cocher cliquable, avec le prix
              const inputId = `action-${action.id}`;
              return (
                <li key={action.id}>
                  <label
                    htmlFor={inputId}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-[var(--pos-primary)] ${
                      isChecked
                        ? "border-[var(--pos-primary)] bg-[var(--pos-primary-light)]"
                        : "border-transparent bg-[var(--pos-surface)] hover:bg-[var(--pos-primary-light)]"
                    }`}
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
                    {/* Case à cocher */}
                    <Checkbox
                      id={inputId}
                      checked={isChecked}
                      onCheckedChange={() => toggle(action.typeService)}
                      className="h-5 w-5 shrink-0 border-2"
                      aria-label={`Sélectionner ${action.label} – ${formatFcfa(variant.prix)}`}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Pied : récap sélection + bouton d'ajout au panier + aide */}
        <DialogFooter className="flex-col gap-0 border-t border-[var(--pos-border)] bg-[var(--pos-bg)] p-3 sm:flex-col">
          {/* Ligne récap + bouton */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {hasSelection ? (
                <>
                  <p className="text-sm font-semibold text-[var(--pos-text)]">
                    {selectedVariants.length} action
                    {selectedVariants.length > 1 ? "s" : ""} sélectionnée
                    {selectedVariants.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-[var(--pos-text-muted)]">
                    Total :{" "}
                    <span className="font-bold text-[var(--pos-danger)] pos-mono">
                      {formatFcfa(totalAmount)}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--pos-text-muted)]">
                  Aucune action sélectionnée
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!hasSelection}
              className="shrink-0 gap-2"
            >
              <ShoppingCart className="h-4 w-4" aria-hidden />
              {hasSelection
                ? `Ajouter ${selectedVariants.length} au panier`
                : "Ajouter au panier"}
            </Button>
          </div>
          {/* Aide contextuelle */}
          <p className="mt-2 text-center text-[11px] text-[var(--pos-text-muted)]">
            Prix configurés par l&apos;administrateur dans{" "}
            <strong>Tarifs par article</strong>
          </p>
        </DialogFooter>
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
