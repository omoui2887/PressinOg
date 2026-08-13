"use client";

/**
 * e-pressing — Error Boundary du route group (personnel)
 * -------------------------------------------------------
 * AUDIT-C-05 — Une error boundary par route group pour isoler les erreurs
 * de rendering côté /personnel/* (réceptionniste, caissier, laveur, etc.).
 *
 * Comportement identique aux autres error.tsx (admin, super-admin, public) :
 *   - Message FR friendly
 *   - Boutons Réessayer (reset) + Retour à l'accueil
 *   - Log dev-only du message (pas le stack)
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

interface PersonnelErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PersonnelError({
  error,
  reset,
}: PersonnelErrorBoundaryProps) {
  useEffect(() => {
    console.error(
      "[personnel-error] Erreur non gérée dans le route group (personnel) :",
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
            Une erreur inattendue s&rsquo;est produite dans votre espace
            personnel. Veuillez réessayer. Si le problème persiste, contactez
            votre manager ou le support e-pressing.
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
