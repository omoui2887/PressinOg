"use client";

/**
 * OgPressing — Error Boundary du route group (admin)
 * ---------------------------------------------------
 * AUDIT-C-05 — Une error boundary par route group pour isoler les erreurs
 * de rendering côté /admin/* (manager) sans crasher toute l'application.
 *
 * Comportement :
 *   - Capture les erreurs de rendering Server/Client dans le segment /admin/*.
 *   - Affiche un message d'erreur FR friendly avec actions (Réessayer / Accueil).
 *   - Ne JAMAIS afficher error.stack, error.message brut ou codes SQL à
 *     l'utilisateur final (fuite d'information + mauvaise UX).
 *   - Log dev-only du message (avec digest) pour le debug développeur.
 *
 * ⚠️ Next.js error.tsx est un Client Component obligatoire.
 *
 * Props Next.js :
 *   - error : l'instance Error déclenchée
 *   - reset  : fn() qui re-tente le rendu du segment de route concerné
 */
import { useEffect } from "react";
import Link from "next/link";
import { Home, RotateCcw, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AdminErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: AdminErrorBoundaryProps) {
  useEffect(() => {
    // Log dev-only : ne jamais remonter le détail côté UI. Le digest est
    // l'identifiant server-side de l'erreur (utile pour corréler avec les
    // logs serveur). On ne logue pas error.stack (contient des chemins
    // internes du serveur).
    console.error(
      "[admin-error] Erreur non gérée dans le route group (admin) :",
      error?.message ?? "erreur",
      { digest: error?.digest }
    );
  }, [error]);

  return (
    <main
      role="alert"
      className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10 text-foreground"
    >
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center text-center">
          <span
            aria-hidden
            className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          >
            <AlertTriangle className="size-8" />
          </span>
          <CardTitle className="mt-4 text-2xl font-semibold">
            Une erreur est survenue
          </CardTitle>
          <CardDescription className="mt-2 text-base text-muted-foreground">
            Une erreur inattendue s&rsquo;est produite dans l&rsquo;espace
            d&rsquo;administration. Veuillez réessayer. Si le problème persiste,
            contactez le support OgPressing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => reset()}>
            <RotateCcw className="size-4" />
            Réessayer
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="size-4" />
              Retour à l&rsquo;accueil
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
