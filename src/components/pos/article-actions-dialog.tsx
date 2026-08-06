/**
 * <ArticleActionsDialog /> — Boîte de dialogue de choix de l'action.
 * ====================================================================
 *
 * S'ouvre lorsque l'utilisateur clique sur un article du catalogue POS.
 * Liste toutes les actions (services) disponibles pour cet article, avec
 * le prix correspondant à chacune :
 *
 *   - Repassage
 *   - Laver-Repasser
 *   - Séchage
 *   - Nettoyage à sec
 *   - Détachage
 *   - (toute autre action configurée par le pressing)
 *
 * Les prix proviennent du module « Tarifs par articles » (/api/admin/tarifs-articles)
 * avec fallback sur le prix générique du service — résolus côté data.ts lors de
 * la construction du produit cartésien service × article.
 *
 * L'utilisateur clique sur une action → l'article (avec le service sélectionné)
 * est ajouté au panier et le dialogue se ferme.
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
  WashingMachine,
  Wind,
  Shirt,
  Sun,
  Sparkles,
  SprayCan,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import type { PosArticle, PosCategorieId } from "@/lib/pos/types";
import { formatFcfa } from "@/lib/pos/format";

interface ArticleActionsDialogProps {
  /** Article représentatif (pour l'image + le nom dans l'en-tête). */
  article: PosArticle | null;
  /** Toutes les variantes (une par service disponible). */
  variants: PosArticle[];
  open: boolean;
  /** Appelé quand l'utilisateur choisit une action (variante spécifique). */
  onPick: (variant: PosArticle) => void;
  /** Ferme le dialogue (clic extérieur, Échap, bouton X). */
  onClose: () => void;
}

/**
 * Ordre d'affichage préféré des actions dans le dialogue.
 * Les actions non listées ici apparaissent à la fin, dans leur ordre d'arrivée.
 *
 * Cet ordre correspond à la demande métier : Repassage en premier (le plus
 * courant), puis Laver-Repasser, Séchage, Nettoyage à sec, Détachage.
 */
const ACTION_PRIORITY: Exclude<PosCategorieId, "tous">[] = [
  "repassage",
  "laver-repasser",
  "sechage",
  "nettoyage_sec",
  "detachage",
  "lavage",
];

/** Icône lucide associée à chaque catégorie de service. */
const ACTION_ICON: Partial<Record<Exclude<PosCategorieId, "tous">, LucideIcon>> = {
  repassage: Wind,
  "laver-repasser": Shirt,
  sechage: Sun,
  nettoyage_sec: Sparkles,
  detachage: SprayCan,
  lavage: WashingMachine,
};

/** Libellé affichable pour chaque catégorie de service. */
const ACTION_LABEL: Record<Exclude<PosCategorieId, "tous">, string> = {
  lavage: "Lavage",
  repassage: "Repassage",
  "laver-repasser": "Laver-Repasser",
  sechage: "Séchage",
  nettoyage_sec: "Nettoyage à sec",
  detachage: "Détachage",
};

function ArticleActionsDialogImpl({
  article,
  variants,
  open,
  onPick,
  onClose,
}: ArticleActionsDialogProps) {
  /**
   * Trie les variantes selon l'ordre préféré (ACTION_PRIORITY).
   * Les catégories inconnues apparaissent à la fin.
   */
  const sortedVariants = useMemo<PosArticle[]>(() => {
    if (!variants.length) return [];
    const priorityIndex = (cat: PosArticle["categorie"]): number => {
      const idx = ACTION_PRIORITY.indexOf(cat);
      return idx === -1 ? ACTION_PRIORITY.length : idx;
    };
    return [...variants].sort((a, b) => {
      const pa = priorityIndex(a.categorie);
      const pb = priorityIndex(b.categorie);
      if (pa !== pb) return pa - pb;
      // Tri secondaire alphabétique sur le nom du service pour stabilité.
      return a.service_nom.localeCompare(b.service_nom, "fr");
    });
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

        {/* Liste des actions disponibles avec leur prix */}
        <div className="pos-scroll max-h-[60vh] overflow-y-auto p-2">
          {!sortedVariants.length ? (
            <div className="px-3 py-8 text-center text-sm text-[var(--pos-text-muted)]">
              Aucune action disponible pour cet article.
              <br />
              Configurez les services et tarifs dans{" "}
              <strong>Tarifs par article</strong>.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {sortedVariants.map((v) => {
                const Icon = ACTION_ICON[v.categorie] ?? WashingMachine;
                const label = ACTION_LABEL[v.categorie] ?? v.service_nom;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => onPick(v)}
                      className="flex w-full items-center gap-3 rounded-md border border-transparent bg-[var(--pos-surface)] px-3 py-2.5 text-left transition-colors hover:border-[var(--pos-primary)] hover:bg-[var(--pos-primary-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pos-primary)]"
                      aria-label={`Ajouter ${label} – ${formatFcfa(v.prix)}`}
                    >
                      {/* Icône action */}
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--pos-primary-light)] text-[var(--pos-primary)]">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      {/* Libellé action */}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-tight text-[var(--pos-text)]">
                          {label}
                        </span>
                        <span className="block truncate text-[11px] leading-tight text-[var(--pos-text-muted)]">
                          {v.service_nom}
                        </span>
                      </span>
                      {/* Prix */}
                      <span className="shrink-0 rounded-md bg-[var(--pos-danger)] px-2.5 py-1 text-sm font-bold text-white pos-mono">
                        {formatFcfa(v.prix)}
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
          )}
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

export const ArticleActionsDialog = memo(ArticleActionsDialogImpl);
