/**
 * <CustomerPanel /> — Zone client.
 * Avatar + recherche client (nom + téléphone) + contact (tel:/WhatsApp) +
 * bouton "Nouveau client" + badge impayé + option "client de passage".
 */
"use client";
import { memo, useState, useRef, useEffect, useCallback } from "react";
import {
  User,
  UserPlus,
  Eye,
  Phone,
  MessageCircle,
  AlertTriangle,
  Search,
} from "lucide-react";
import type { PosClient } from "@/lib/pos/types";
import { searchClients } from "@/lib/pos/data";
import { formatFcfa } from "@/lib/pos/format";

interface CustomerPanelProps {
  client: PosClient | null;
  clientPassage: boolean;
  passageTelephone: string;
  onPick: (c: PosClient) => void;
  onClear: () => void;
  onPassage: (v: boolean) => void;
  onPassageTelephone: (t: string) => void;
  onNewClient: () => void;
  onViewClient: () => void;
  registerSearchRef: (el: HTMLInputElement | null) => void;
}

function CustomerPanelImpl({
  client,
  clientPassage,
  passageTelephone,
  onPick,
  onClear,
  onPassage,
  onPassageTelephone,
  onNewClient,
  onViewClient,
  registerSearchRef,
}: CustomerPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosClient[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (q.trim().length < 1) {
        setResults([]);
        setOpen(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const r = await searchClients(q);
      setResults(r);
      setOpen(true);
      setLoading(false);
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Ferme le dropdown si clic en dehors.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const tel = client?.telephone ?? passageTelephone ?? "";
  const telDigits = tel.replace(/\D/g, "");

  return (
    <div className="pos-panel-blue p-2.5">
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--pos-border)] bg-[var(--pos-primary-light)]">
          {client ? (
            <span className="pos-mono text-[15px] font-bold text-[var(--pos-primary-dark)]">
              {client.nom
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
          ) : (
            <User className="h-6 w-6 text-[var(--pos-primary)]" />
          )}
        </div>

        {/* Droite : sélection + contact */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-[var(--pos-text-muted)]">
              Nom du Client
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onNewClient}
                className="flex items-center gap-1 rounded bg-[var(--pos-primary)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--pos-primary-dark)]"
                title="Créer un nouveau client sans perdre le panier"
              >
                <UserPlus className="h-3 w-3" />
                Nouveau
              </button>
              {client && (
                <button
                  type="button"
                  onClick={onViewClient}
                  className="flex items-center gap-1 rounded bg-[var(--pos-primary)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--pos-primary-dark)]"
                  title="Voir la fiche client"
                >
                  <Eye className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {clientPassage ? (
            <div className="mt-1">
              <input
                type="tel"
                value={passageTelephone}
                onChange={(e) => onPassageTelephone(e.target.value)}
                placeholder="Téléphone du client de passage (obligatoire)"
                className="h-8 w-full rounded border border-[var(--pos-border)] px-2 text-[12px] outline-none focus:border-[var(--pos-primary)]"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-[var(--pos-text-muted)]">
                  Client de passage — nom facultatif, téléphone obligatoire.
                </span>
                <button
                  type="button"
                  onClick={() => onPassage(false)}
                  className="text-[10px] text-[var(--pos-primary)] hover:underline"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : client ? (
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClear}
                className="flex min-w-0 flex-1 items-center justify-between rounded border border-[var(--pos-border)] bg-white px-2 py-1.5 text-left text-[12px] hover:border-[var(--pos-primary)]"
              >
                <span className="truncate font-medium text-[var(--pos-text)]">
                  {client.nom}
                </span>
                <span className="text-[10px] text-[var(--pos-text-muted)]">
                  changer
                </span>
              </button>
            </div>
          ) : (
            <div ref={boxRef} className="relative mt-1">
              <div className="relative">
                <input
                  ref={registerSearchRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    runSearch(e.target.value);
                  }}
                  onFocus={() => results.length > 0 && setOpen(true)}
                  placeholder="Rechercher par nom ou téléphone…"
                  className="h-8 w-full rounded border border-[var(--pos-border)] px-2 pr-7 text-[12px] outline-none focus:border-[var(--pos-primary)]"
                />
                <Search className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--pos-text-muted)]" />
              </div>
              {loading && (
                <p className="absolute left-0 top-9 text-[10px] text-[var(--pos-text-muted)]">
                  Recherche…
                </p>
              )}
              {open && !loading && (
                <div className="pos-scroll absolute left-0 right-0 top-8 z-20 max-h-48 overflow-y-auto rounded border border-[var(--pos-border)] bg-white shadow-lg">
                  {results.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onNewClient();
                      }}
                      className="flex w-full items-center gap-2 px-2 py-2 text-left text-[11px] text-[var(--pos-primary)] hover:bg-[var(--pos-primary-50)]"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Aucun client — créer « {query} »
                    </button>
                  ) : (
                    results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onPick(c);
                          setQuery("");
                          setResults([]);
                          setOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-[var(--pos-primary-50)]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[var(--pos-text)]">
                            {c.nom}
                          </span>
                          <span className="block text-[10px] text-[var(--pos-text-muted)]">
                            {c.telephone}
                            {c.commune ? ` · ${c.commune}` : ""}
                          </span>
                        </span>
                        {c.solde_impaye > 0 && (
                          <span className="shrink-0 rounded bg-[#FDECEC] px-1 py-0.5 text-[9px] font-semibold text-[var(--pos-danger)]">
                            impayé {formatFcfa(c.solde_impaye)}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Contact du client */}
          {tel && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-[var(--pos-text-muted)]">
                Contact du Client :
              </span>
              <a
                href={`tel:${telDigits}`}
                className="flex items-center gap-0.5 text-[11px] font-medium text-[var(--pos-primary)] hover:underline"
              >
                <Phone className="h-3 w-3" />
                {tel}
              </a>
              <a
                href={`https://wa.me/${telDigits}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-0.5 text-[11px] font-medium text-[var(--pos-green)] hover:underline"
              >
                <MessageCircle className="h-3 w-3" />
                WhatsApp
              </a>
            </div>
          )}

          {/* Badge impayé */}
          {client && client.solde_impaye > 0 && (
            <div className="mt-1.5 flex items-center gap-1 rounded bg-[#FDECEC] px-1.5 py-1 text-[10px] font-semibold text-[var(--pos-danger)]">
              <AlertTriangle className="h-3 w-3" />
              Impayé : {formatFcfa(client.solde_impaye)}
            </div>
          )}

          {/* Lien client de passage */}
          {!client && !clientPassage && (
            <button
              type="button"
              onClick={() => onPassage(true)}
              className="mt-1 text-[10px] text-[var(--pos-text-muted)] hover:text-[var(--pos-primary)] hover:underline"
            >
              Client de passage (sans nom)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const CustomerPanel = memo(CustomerPanelImpl);
