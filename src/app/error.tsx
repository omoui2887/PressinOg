"use client";

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

/**
 * OgPressing — Error Boundary globale
 * ------------------------------------
 * Client Component obligatoire (Next.js error boundary).
 *
 * Règles :
 *   - On ne JAMAIS afficher error.stack, error.message brut ou des codes SQL
 *     à l'utilisateur final (fuite d'information + mauvaise UX).
 *   - On log `error.message` en console pour le debug développeur.
 *   - On affiche un message générique français + actions (Réessayer / Accueil).
 *
 * Props Next.js :
 *   - error : l'instance Error déclenchée
 *   - reset  : fn() qui re-tente le rendu du segment de route concerné
 */
interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log dev-only : ne jamais remonter le détail côté UI.
    console.error("[OgPressing] Erreur non gérée :", error?.message ?? error, {
      digest: error?.digest,
    });
  }, [error]);

  return (
    <main
      role="alert"
      className="bg-background text-foreground flex min-h-dvh w-full items-center justify-center px-4 py-10"
    >
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center text-center">
          <span
            aria-hidden
            className="bg-destructive/10 text-destructive mx-auto flex size-16 items-center justify-center rounded-full"
          >
            <AlertTriangle className="size-8" />
          </span>
          <CardTitle className="mt-4 text-2xl font-semibold">
            Une erreur est survenue
          </CardTitle>
          <CardDescription className="mt-2 text-base text-muted-foreground">
            Veuillez réessayer. Si le problème persiste, contactez votre
            administrateur.
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
