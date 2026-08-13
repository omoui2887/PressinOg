/**
 * <CustomArticleDialog /> — Ajouter un linge / vêtement personnalisé.
 * ====================================================================
 *
 * Boîte de dialogue accessible depuis le POS (bouton « Ajouter un linge /
 * vêtement ») qui permet à l'opérateur d'ajouter au panier un article qui
 * n'est PAS dans le catalogue standard (ex : « Boubou traditionnel »,
 * « Voile de mariée », « Tissu pagne »).
 *
 * FONCTIONNEMENT :
 *   1. L'opérateur saisit le nom de l'article (champ texte libre).
 *   2. Le dialogue liste les 6 actions métier fixes (Lavage, Repassage,
 *      Laver-Repasser, Nettoyage à sec, Détachage, Blanchisserie) — chacune
 *      avec une case à cocher + un champ prix FCFA éditable.
 *   3. L'opérateur coche les actions souhaitées et ajuste les prix si besoin
 *      (pré-remplis avec le prix par défaut du service).
 *   4. Le footer affiche en temps réel le nombre d'actions cochées + le total.
 *   5. Au clic sur « Ajouter N au panier », on crée une PosArticle par
 *      action cochée (avec is_custom=true, catalogue_nom = nom saisi,
 *      prix = prix saisi) et on les ajoute au panier via onConfirm.
 *
 * SYNERGIE AVEC L'API :
 *   - `service_id` vient du service actif du pressing (chargé via
 *     getActiveServices).
 *   - `catalogue_article_id` pointe vers un article « fourre-tout » du
 *     catalogue (slug `houssse-vetement-perso`) pour satisfaire la FK NOT
 *     NULL côté articles_vetements.
 *   - `is_custom=true` + `prix_unitaire` sont envoyés à POST /api/admin/commandes
 *     qui utilise le nom saisi tel quel (sans écraser par le nom du catalogue)
 *     et le prix saisi (sans résoudre via tarifs/service.prix).
 *
 * ACTIONS NON CONFIGURÉES :
 *   Si le pressing n'offre pas un type de service (ex : pas de service
 *   « blanchisserie »), l'action s'affiche grisée + verrouillée, comme dans
 *   <ArticleActionsDialog />.
 */
"use client";
import { memo, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Droplets,
  Wind,
  Shirt,
  Sparkles,
  SprayCan,
  WashingMachine,
  Lock,
  ShoppingCart,
  Plus,
  type LucideIcon,
} from "lucide-react";
import type { PosArticle } from "@/lib/pos/types";
import type { PosService } from "@/lib/pos/data";
import type { CustomCatalogueAnchor } from "@/lib/pos/data";
import { formatFcfa } from "@/lib/pos/format";

interface CustomArticleDialogProps {
  open: boolean;
  /** Services actifs du pressing (pour récupérer service_id + prix par défaut). */
  services: PosService[];
  /** Article « fourre-tout » du catalogue (pour satisfaire la FK NOT NULL). */
  anchor: CustomCatalogueAnchor | null;
  /** Appelé quand l'utilisateur confirme (bouton « Ajouter au panier »). */
  onConfirm: (articles: PosArticle[]) => void;
  /** Ferme le dialogue (clic extérieur, Échap, bouton X). */
  onClose: () => void;
}

/**
 * Les 6 actions fixes affichées dans le dialogue, dans l'ordre métier.
 * Chaque action a : un id, un libellé, une icône Lucide, et le type_service
 * DB correspondant (pour retrouver le service actif du pressing).
 */
const ACTIONS: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
  typeService: string;
}> = [
  { id: "lavage", label: "Lavage", icon: Droplets, typeService: "lavage" },
  { id: "repassage", label: "Repassage", icon: Wind, typeService: "repassage" },
  { id: "laver_repasser", label: "Laver-Repasser", icon: Shirt, typeService: "laver_repasser" },
  { id: "nettoyage_sec", label: "Nettoyage à sec", icon: Sparkles, typeService: "nettoyage_sec" },
  { id: "detachage", label: "Détachage", icon: SprayCan, typeService: "detachage" },
  { id: "blanchisserie", label: "Blanchisserie", icon: WashingMachine, typeService: "blanchisserie" },
];

/**
 * État d'une action cochée : le type_service + le prix saisi (string pour
 * permettre la saisie partielle comme "500" ou vide pendant l'édition).
 */
interface CheckedAction {
  typeService: string;
  prixStr: string;
}

function CustomArticleDialogImpl({
  open,
  services,
  anchor,
  onConfirm,
  onClose,
}: CustomArticleDialogProps) {
  /** Map d'accès rapide : type_service → service actif (PosService). */
  const serviceByType = useMemo<Map<string, PosService>>(() => {
    const m = new Map<string, PosService>();
    for (const svc of services) {
      if (!m.has(svc.type)) {
        m.set(svc.type, svc);
      }
    }
    return m;
  }, [services]);

  /** Nom de l'article personnalisé saisi par l'opérateur. */
  const [nom, setNom] = useState("");

  /**
   * Liste des actions cochées. Chaque entrée stocke le type_service + le
   * prix en chaîne (pour gérer la saisie en cours).
   */
  const [checkedActions, setCheckedActions] = useState<Map<string, CheckedAction>>(
    new Map()
  );

  // Réinitialise le formulaire à chaque ouverture (transition fermé → ouvert).
  // Pattern « ajustement pendant le rendu » recommandé par React (au lieu
  // d'un useEffect) pour éviter les boucles de rendu.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNom("");
      setCheckedActions(new Map());
    }
  }

  /** Bascule la coche d'une action configurée. */
  const toggle = (typeService: string) => {
    setCheckedActions((prev) => {
      const next = new Map(prev);
      if (next.has(typeService)) {
        next.delete(typeService);
      } else {
        const svc = serviceByType.get(typeService);
        next.set(typeService, {
          typeService,
          prixStr: svc ? String(svc.prix) : "",
        });
      }
      return next;
    });
  };

  /** Met à jour le prix d'une action cochée. */
  const setPrix = (typeService: string, prixStr: string) => {
    setCheckedActions((prev) => {
      const next = new Map(prev);
      const existing = next.get(typeService);
      if (existing) {
        next.set(typeService, { ...existing, prixStr });
      }
      return next;
    });
  };

  /** Variants prêts à être ajoutés au panier (un par action cochée valide). */
  const selectedVariants = useMemo<PosArticle[]>(() => {
    if (!anchor) return [];
    const out: PosArticle[] = [];
    for (const [, ca] of checkedActions) {
      const svc = serviceByType.get(ca.typeService);
      if (!svc) continue;
      const prix = Math.max(0, parseInt(ca.prixStr || "0", 10) || 0);
      // Catégorie POS dérivée du type_service.
      const categorie = typeServiceToCategorie(svc.type);
      out.push({
        id: `${svc.id}::custom::${nom.trim()}::${svc.type}`,
        service_id: svc.id,
        service_nom: svc.nom,
        categorie,
        catalogue_slug: anchor.slug,
        catalogue_article_id: anchor.id,
        catalogue_nom: nom.trim(),
        catalogue_categorie: "Articles spéciaux",
        icone_url: anchor.icone_url,
        prix,
        duree_estimee_h: svc.duree_estimee_h,
        tarifConfigure: false,
        is_custom: true,
      });
    }
    return out;
  }, [checkedActions, serviceByType, anchor, nom]);

  const totalAmount = useMemo(
    () => selectedVariants.reduce((sum, v) => sum + v.prix, 0),
    [selectedVariants]
  );

  const hasSelection = selectedVariants.length > 0;
  const nomValid = nom.trim().length >= 2;
  const canConfirm = hasSelection && nomValid && !!anchor;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(selectedVariants);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* En-tête */}
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-[var(--pos-border)] bg-[var(--pos-primary-light)] p-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-white">
            <Plus className="h-7 w-7 text-[var(--pos-primary)]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold">
              Ajouter un linge / vêtement
            </DialogTitle>
            <DialogDescription className="text-xs">
              Saisissez le nom + cochez les actions à effectuer
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Corps : nom + liste des actions */}
        <div className="pos-scroll max-h-[55vh] overflow-y-auto p-3">
          {/* Champ nom de l'article */}
          <div className="mb-3 space-y-1">
            <Label htmlFor="custom-article-nom" className="text-[12px] font-medium">
              Nom de l&apos;article *
            </Label>
            <Input
              id="custom-article-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Boubou traditionnel, Voile, Tissu pagne…"
              className="h-9 text-sm"
              maxLength={100}
              autoFocus
            />
            {!nomValid && nom.length > 0 && (
              <p className="text-[11px] text-[var(--pos-danger)]">
                Le nom doit comporter au moins 2 caractères.
              </p>
            )}
          </div>

          {/* Liste des 6 actions fixes avec cases à cocher + prix éditable */}
          <ul className="flex flex-col gap-1">
            {ACTIONS.map((action) => {
              const svc = serviceByType.get(action.typeService);
              const configured = !!svc && !!anchor;
              const isChecked = configured && checkedActions.has(action.typeService);
              const prixStr = checkedActions.get(action.typeService)?.prixStr ?? "";
              const Icon = action.icon;

              if (!configured) {
                // Action sans service actif → affichée en grisé, non sélectionnable
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
                          Service non configuré
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

              // Action configurée → case à cocher + champ prix éditable
              const inputId = `custom-action-${action.id}`;
              const prixId = `custom-prix-${action.id}`;
              return (
                <li key={action.id}>
                  <div
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                      isChecked
                        ? "border-[var(--pos-primary)] bg-[var(--pos-primary-light)]"
                        : "border-transparent bg-[var(--pos-surface)] hover:bg-[var(--pos-primary-light)]"
                    }`}
                  >
                    {/* Case à cocher + icône + libellé (label cliquable) */}
                    <label
                      htmlFor={inputId}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                    >
                      <Checkbox
                        id={inputId}
                        checked={isChecked}
                        onCheckedChange={() => toggle(action.typeService)}
                        className="h-5 w-5 shrink-0 border-2"
                        aria-label={`Sélectionner ${action.label}`}
                      />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--pos-primary-light)] text-[var(--pos-primary)]">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-tight text-[var(--pos-text)]">
                          {action.label}
                        </span>
                        <span className="block truncate text-[11px] leading-tight text-[var(--pos-text-muted)]">
                          {svc!.nom}
                        </span>
                      </span>
                    </label>
                    {/* Champ prix (éditable, activé seulement si coché) */}
                    <div
                      className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 ${
                        isChecked
                          ? "bg-[var(--pos-danger)]/10"
                          : "bg-[var(--pos-bg)]"
                      }`}
                    >
                      <Input
                        id={prixId}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={50}
                        value={prixStr}
                        onChange={(e) => setPrix(action.typeService, e.target.value)}
                        disabled={!isChecked}
                        placeholder={String(svc!.prix)}
                        className="pos-mono h-7 w-20 border-0 bg-transparent px-1 text-right text-sm font-bold text-[var(--pos-danger)] outline-none focus:ring-0 disabled:text-[var(--pos-text-muted)]"
                        aria-label={`Prix ${action.label} en FCFA`}
                      />
                      <span className="text-[10px] font-medium text-[var(--pos-text-muted)]">
                        FCFA
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {!anchor && (
            <p className="mt-3 rounded border border-[var(--pos-danger)] bg-[#FDECEC] px-2 py-1.5 text-[11px] text-[var(--pos-danger)]">
              Impossible de charger le catalogue. Réessayez dans un instant.
            </p>
          )}
        </div>

        {/* Pied : récap sélection + bouton d'ajout au panier */}
        <DialogFooter className="flex-col gap-0 border-t border-[var(--pos-border)] bg-[var(--pos-bg)] p-3 sm:flex-col">
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
                  Cochez au moins une action
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="shrink-0 gap-2"
            >
              <ShoppingCart className="h-4 w-4" aria-hidden />
              {hasSelection
                ? `Ajouter ${selectedVariants.length} au panier`
                : "Ajouter au panier"}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-[var(--pos-text-muted)]">
            Prix pré-remplis avec le tarif du service — modifiables librement.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Conversion type_service DB → catégorie PosArticle.categorie. */
function typeServiceToCategorie(type: string): PosArticle["categorie"] {
  switch (type) {
    case "lavage":
      return "lavage";
    case "repassage":
      return "repassage";
    case "laver_repasser":
      return "laver-repasser";
    case "nettoyage_sec":
      return "nettoyage_sec";
    case "detachage":
      return "detachage";
    case "blanchisserie":
      return "blanchisserie";
    default:
      return "lavage";
  }
}

export const CustomArticleDialog = memo(CustomArticleDialogImpl);
