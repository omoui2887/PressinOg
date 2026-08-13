import Link from "next/link";
import {
  Home,
  LayoutDashboard,
  Shirt,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * e-pressing — Page 404 (EMBELLISSEMENT §28)
 * ------------------------------------------
 * Affichée automatiquement par Next.js quand une route n'existe pas.
 * Server Component (pas de "use client").
 *
 * Style : illustration textile (chemise sur cintre) en SVG inline, palette
 * Bleu Nuit + Or Textile (cohérente avec /login), 3 CTAs :
 *   - Retour à l'accueil
 *   - Tableau de bord (admin)
 *   - Se connecter (si l'utilisateur n'est pas authentifié)
 *
 * Aucune logique métier — uniquement présentation.
 */
export default function NotFound() {
  return (
    <main
      role="main"
      className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground"
    >
      {/* Décor : halo doré + halo bleu + motif textile discret */}
      <div
        aria-hidden
        className="absolute -right-40 -top-40 size-[500px] rounded-full bg-landing-accent/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-40 size-[500px] rounded-full bg-landing-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #14235b 1.5px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative z-10 w-full max-w-lg text-center">
        {/* Illustration : chemise sur cintre (SVG inline, marque textile) */}
        <div className="mx-auto mb-8 flex size-28 items-center justify-center">
          <svg
            viewBox="0 0 120 120"
            className="size-28"
            role="img"
            aria-label="Illustration d'une chemise sur cintre"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Cintre */}
            <path
              d="M40 35 L60 25 L80 35"
              stroke="#d9a441"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M60 25 V20 a4 4 0 1 1 4 4"
              stroke="#d9a441"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            {/* Chemise */}
            <path
              d="M40 35 L25 50 L30 60 L35 55 L35 95 L85 95 L85 55 L90 60 L95 50 L80 35 L70 40 L60 50 L50 40 Z"
              fill="#14235b"
              fillOpacity="0.08"
              stroke="#14235b"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Col */}
            <path
              d="M55 35 L60 50 L65 35"
              stroke="#14235b"
              strokeWidth="2.5"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Bouton */}
            <circle cx="60" cy="65" r="1.8" fill="#d9a441" />
            <circle cx="60" cy="78" r="1.8" fill="#d9a441" />
          </svg>
        </div>

        {/* Chiffre 404 en Or Textile */}
        <p className="font-jakarta text-7xl font-bold tracking-tight text-landing-accent-deep sm:text-8xl">
          404
        </p>

        {/* Titre + message */}
        <h1 className="mt-4 font-jakarta text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Cette page est partie au repassage
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
          La page que vous cherchez n&apos;existe pas, a été déplacée, ou
          n&apos;est plus accessible à cette adresse. Vérifiez l&apos;URL
          ou utilisez les raccourcis ci-dessous.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild size="lg" ripple>
            <Link href="/">
              <Home className="size-4" />
              Retour à l&apos;accueil
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/admin/dashboard">
              <LayoutDashboard className="size-4" />
              Tableau de bord
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/login">
              <LogIn className="size-4" />
              Se connecter
            </Link>
          </Button>
        </div>

        {/* Pied : petite référence textile */}
        <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
          <Shirt className="size-3.5" />
          e-pressing — gestion professionnelle de pressings
        </p>
      </div>
    </main>
  );
}
