/**
 * <ArticleSearchBar /> — Recherche d'article (bleue) + mode + rafraîchissement.
 * Reçoit le focus auto à l'ouverture ; Échap vide le champ.
 */
"use client";
import { memo, useRef } from "react";
import { Search, RefreshCw } from "lucide-react";
import type { PosSearchMode } from "@/lib/pos/store";

interface ArticleSearchBarProps {
  query: string;
  mode: PosSearchMode;
  loading: boolean;
  onQueryChange: (q: string) => void;
  onModeChange: (m: PosSearchMode) => void;
  onRefresh: () => void;
  registerRef: (el: HTMLInputElement | null) => void;
}

function ArticleSearchBarImpl({
  query,
  mode,
  loading,
  onQueryChange,
  onModeChange,
  onRefresh,
  registerRef,
}: ArticleSearchBarProps) {
  const localRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="pos-search-bar flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1.5">
      {/* Sélecteur de mode compact (A / C) */}
      <button
        type="button"
        onClick={() =>
          onModeChange(mode === "article" ? "code" : "article")
        }
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded bg-white/90 text-sm font-bold text-[var(--pos-primary-dark)] hover:bg-white"
        title={
          mode === "article"
            ? "Recherche par nom d'article (cliquez pour rechercher par code)"
            : "Recherche par code (cliquez pour rechercher par nom)"
        }
        aria-label="Basculer le mode de recherche"
      >
        {mode === "article" ? "A" : "C"}
      </button>

      {/* Champ de recherche */}
      <div className="relative flex-1">
        <input
          ref={(el) => {
            localRef.current = el;
            registerRef(el);
          }}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onQueryChange("");
            }
          }}
          placeholder={
            mode === "article"
              ? "Rechercher un article..."
              : "Rechercher par code..."
          }
          className="pos-search-input h-[30px] w-full rounded px-2.5 pr-8 text-[13px]"
          aria-label="Rechercher un article"
        />
        <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pos-primary)]" />
      </div>

      {/* Bouton rafraîchir */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded bg-white/20 text-white hover:bg-white/30 disabled:opacity-50"
        title="Recharger le catalogue"
        aria-label="Recharger le catalogue"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}

export const ArticleSearchBar = memo(ArticleSearchBarImpl);
