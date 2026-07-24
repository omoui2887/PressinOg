/**
 * Étape 2 — Enregistrement des articles (placeholder)
 * ---------------------------------------------------
 * Contenu détaillé à venir dans un prompt suivant.
 *
 * Pour rendre le wizard navigable dès maintenant, un bouton mock permet
 * d'ajouter un article factice → débloque le bouton "Suivant".
 */
"use client";

import { Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArticleInfo, StepProps } from "./state";

const MOCK_ARTICLES = [
  { designation: "Chemise homme", service: "Lavage + Repassage", prix: 1500 },
  { designation: "Pantalon", service: "Repassage", prix: 1000 },
  { designation: "Robe", service: "Lavage à sec", prix: 3000 },
  { designation: "Completo costume", service: "Lavage à sec + Repassage", prix: 5000 },
];

let mockCounter = 0;

function createMockArticle(): ArticleInfo {
  const template = MOCK_ARTICLES[mockCounter % MOCK_ARTICLES.length];
  mockCounter += 1;
  return {
    id: `mock-art-${Date.now()}-${mockCounter}`,
    designation: template.designation,
    service: template.service,
    prix: template.prix,
    quantite: 1,
  };
}

export function StepArticles({ state, dispatch }: StepProps) {
  const hasArticles = state.articles.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Enregistrement des articles
        </h2>
        <p className="text-sm text-muted-foreground">
          Ajoutez les articles à nettoyer et leur service associé. Le contenu
          détaillé (sélection service, quantité, prix, notes) arrive dans un
          prompt suivant.
        </p>
      </div>

      {hasArticles ? (
        <ul className="space-y-2">
          {state.articles.map((article) => (
            <li
              key={article.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {article.designation}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {article.service} — {article.prix.toLocaleString("fr-FR")}{" "}
                  FCFA × {article.quantite}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Supprimer ${article.designation}`}
                onClick={() =>
                  dispatch({ type: "REMOVE_ARTICLE", id: article.id })
                }
              >
                <Trash2 className="size-4 text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Package className="size-6" />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">
            Aucun article enregistré
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Le bouton &quot;Suivant&quot; sera désactivé tant qu&apos;aucun
            article n&apos;est ajouté.
          </p>
        </div>
      )}

      <Button
        variant="outline"
        onClick={() => dispatch({ type: "ADD_ARTICLE", article: createMockArticle() })}
      >
        <Plus className="size-4" />
        Ajouter un article (mock)
      </Button>
    </div>
  );
}
