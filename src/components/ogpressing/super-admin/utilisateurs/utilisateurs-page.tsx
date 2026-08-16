/**
 * e-pressing — UtilisateursPage (Super Admin)
 * -------------------------------------------
 * Page client de gestion des utilisateurs Supabase Auth.
 *
 * Fonctionnalités :
 *   - Recherche debouncée par email
 *   - Liste paginée des users Auth (50/page)
 *   - Pour chaque user : avatar initiales, email, rôle (badge), nom complet,
 *     pressing (si lié), statut (badge), dernière connexion (relatif)
 *   - Bouton "Réinitialiser le mot de passe" par user
 *   - Dialog d'affichage des credentials après reset (réutilise
 *     ResetPasswordResultDialog du module personnel — cohérence UX)
 *
 * Flux de données :
 *   - GET /api/super-admin/users?q=...&page=...&perPage=50
 *   - POST /api/super-admin/users/[id]/reset-password (body vide)
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Search,
  KeyRound,
  ShieldCheck,
  Mail,
  Building2,
  Clock,
  RefreshCw,
  Users as UsersIcon,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ResetPasswordResultDialog,
  type ResetPasswordCredentials,
} from "@/components/ogpressing/admin/personnel/reset-password-result-dialog";

// ---- Types ----
interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  provider: string;
  role: string | null;
  nom_complet: string | null;
  is_super_admin: boolean;
  personnel: {
    pressing_nom: string | null;
    pressing_id: string | null;
    actif: boolean;
    statut_compte: string | null;
  } | null;
}

// ---- Helpers d'affichage ----
const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  receptionniste: "Réceptionniste",
  caissier: "Caissier",
  laveur: "Laveur",
  repassage: "Repassage",
  livreur: "Livreur",
  comptable: "Comptable",
};

const ROLE_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  super_admin: "default",
  manager: "secondary",
};

function formatDateRelative(iso: string | null): string {
  if (!iso) return "Jamais";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} sem.`;
  if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`;
  return `Il y a ${Math.floor(diffDays / 365)} an(s)`;
}

function getInitials(email: string, nom: string | null): string {
  if (nom) {
    const parts = nom.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nom.slice(0, 2).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

export function UtilisateursPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 50;

  // États pour le reset password
  const [confirmResetUser, setConfirmResetUser] = useState<UserRow | null>(null);
  const [pending, setPending] = useState(false);
  const [resetCredentials, setResetCredentials] =
    useState<ResetPasswordCredentials | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // ---- Debounce de la recherche ----
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // ---- Fetch users ----
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      });
      if (debouncedQuery) params.set("q", debouncedQuery);

      const res = await fetch(`/api/super-admin/users?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors du chargement");
      }
      setUsers(data.users);
      setTotal(data.total ?? data.users.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue";
      setError(msg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ---- Reset password ----
  async function executeResetPassword() {
    if (!confirmResetUser) return;
    const user = confirmResetUser;
    setConfirmResetUser(null);
    setPending(true);

    try {
      const res = await fetch(
        `/api/super-admin/users/${user.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Erreur lors de la réinitialisation"
        );
      }
      if (data.credentials) {
        setResetCredentials(data.credentials);
        setResetDialogOpen(true);
      }
      toast.success(`Mot de passe réinitialisé pour ${user.email}`);
      // Refresh la liste (le last_sign_in_at peut avoir changé)
      fetchUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue";
      toast.error(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ---- En-tête ---- */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <UsersIcon className="size-6 text-primary" />
            Utilisateurs
          </h1>
          <p className="text-sm text-muted-foreground">
            Gérez les comptes utilisateurs et réinitialisez les mots de passe.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* ---- Statut informatif ---- */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Super Admin — accès global aux utilisateurs
            </p>
            <p className="text-xs text-muted-foreground">
              Vous pouvez réinitialiser le mot de passe de n'importe quel
              utilisateur (manager, employé, ou super admin). Un mot de passe
              temporaire sera généré et affiché une seule fois. L'utilisateur
              devra le changer à sa prochaine connexion s'il s'agit d'un compte
              employé lié au personnel.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---- Recherche ---- */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Rechercher par email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* ---- Erreur ---- */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="size-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ---- Liste des utilisateurs ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {total} utilisateur{total > 1 ? "s" : ""}
            {debouncedQuery && ` pour "${debouncedQuery}"`}
          </CardTitle>
          <CardDescription>
            Page {page} — {users.length} affichés
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">Chargement des utilisateurs…</span>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <UsersIcon className="size-8 opacity-50" />
              <p className="text-sm">Aucun utilisateur trouvé.</p>
            </div>
          ) : (
            <>
              {/* ---- Tableau desktop ---- */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Utilisateur</th>
                      <th className="px-4 py-3">Rôle</th>
                      <th className="px-4 py-3">Pressing</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3">Dernière connexion</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b transition-colors hover:bg-muted/20"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold uppercase text-primary">
                              {getInitials(u.email, u.nom_complet)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {u.nom_complet ?? u.email}
                              </p>
                              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                <Mail className="size-3" />
                                {u.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {u.role ? (
                            <Badge
                              variant={
                                ROLE_BADGE_VARIANT[u.role] ?? "outline"
                              }
                              className="text-xs"
                            >
                              {ROLE_LABELS[u.role] ?? u.role}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.personnel?.pressing_nom ? (
                            <span className="flex items-center gap-1 text-xs">
                              <Building2 className="size-3 text-muted-foreground" />
                              {u.personnel.pressing_nom}
                            </span>
                          ) : u.is_super_admin ? (
                            <span className="text-xs italic text-muted-foreground">
                              Global
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.is_super_admin ? (
                            <Badge variant="default" className="text-xs">
                              Actif
                            </Badge>
                          ) : u.personnel ? (
                            <Badge
                              variant={
                                u.personnel.actif ? "default" : "destructive"
                              }
                              className="text-xs"
                            >
                              {u.personnel.statut_compte === "desactive"
                                ? "Désactivé"
                                : u.personnel.statut_compte ===
                                  "invite_en_attente"
                                ? "Invitation"
                                : "Actif"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              {u.email_confirmed_at ? "Confirmé" : "En attente"}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            {formatDateRelative(u.last_sign_in_at)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmResetUser(u)}
                            disabled={pending}
                            className="gap-1.5"
                          >
                            <KeyRound className="size-3.5" />
                            Réinitialiser
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ---- Cards mobile ---- */}
              <div className="divide-y md:hidden">
                {users.map((u) => (
                  <div key={u.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold uppercase text-primary">
                        {getInitials(u.email, u.nom_complet)}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div>
                          <p className="truncate text-sm font-medium">
                            {u.nom_complet ?? u.email}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {u.email}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {u.role && (
                            <Badge
                              variant={ROLE_BADGE_VARIANT[u.role] ?? "outline"}
                              className="text-xs"
                            >
                              {ROLE_LABELS[u.role] ?? u.role}
                            </Badge>
                          )}
                          {u.personnel?.pressing_nom && (
                            <Badge variant="outline" className="text-xs">
                              {u.personnel.pressing_nom}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-xs text-muted-foreground">
                            <Clock className="mr-1 inline size-3" />
                            {formatDateRelative(u.last_sign_in_at)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmResetUser(u)}
                            disabled={pending}
                            className="gap-1.5"
                          >
                            <KeyRound className="size-3.5" />
                            Réinitialiser
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ---- Pagination ---- */}
              {total > perPage && (
                <div className="flex items-center justify-between border-t p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                  >
                    Précédent
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={users.length < perPage || loading}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ---- Boîte de confirmation reset password ---- */}
      <AlertDialog
        open={confirmResetUser !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmResetUser(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-warning" />
              Réinitialiser le mot de passe ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmResetUser && (
                <>
                  Un nouveau mot de passe temporaire sera généré pour{" "}
                  <strong className="text-foreground">
                    {confirmResetUser.nom_complet ?? confirmResetUser.email}
                  </strong>
                  . L'ancien mot de passe ne fonctionnera plus. Le nouveau
                  mot de passe vous sera affiché une seule fois — communiquez-le
                  de façon sécurisée à l'utilisateur.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                executeResetPassword();
              }}
              disabled={pending}
              className="bg-gradient-warning text-warning-foreground hover:bg-warning/90"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Traitement…
                </>
              ) : (
                "Réinitialiser"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---- Dialog d'affichage des credentials après reset ---- */}
      <ResetPasswordResultDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        credentials={resetCredentials}
      />
    </div>
  );
}
