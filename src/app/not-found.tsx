import Link from "next/link";
import { Home, LayoutDashboard, Compass } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * OgPressing — Page 404
 * ----------------------
 * Affichée automatiquement par Next.js quand une route n'existe pas.
 * Server Component (pas de "use client").
 *
 * Style : carte centrée, palette OgPressing (bg-background / text-foreground,
 * dégradés primary) — aucun indigo/bleu générique, juste la marque existante.
 */
export default function NotFound() {
  return (
    <main
      role="main"
      className="bg-background text-foreground flex min-h-dvh w-full items-center justify-center px-4 py-10"
    >
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center text-center">
          <span
            aria-hidden
            className="bg-primary/10 text-primary mx-auto flex size-16 items-center justify-center rounded-full"
          >
            <Compass className="size-8" />
          </span>
          <CardTitle className="mt-4 text-6xl font-bold tracking-tight text-primary">
            404
          </CardTitle>
          <CardDescription className="mt-2 text-base text-muted-foreground">
            La page que vous recherchez n&rsquo;existe pas ou a été déplacée.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/">
              <Home className="size-4" />
              Retour à l&rsquo;accueil
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/dashboard">
              <LayoutDashboard className="size-4" />
              Aller au tableau de bord
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
