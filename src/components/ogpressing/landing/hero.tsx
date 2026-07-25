/**
 * OgPressing — Section Hero (landing page)
 * ----------------------------------------
 * Titre accrocheur, sous-titre valeur, CTA "Essayer gratuitement"
 * (scroll vers #inscription), badges de confiance, et mockup dashboard
 * illustratif construit avec lucide-react + Tailwind (pas d'image externe).
 */
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Smartphone,
  QrCode,
  ShoppingBag,
  TrendingUp,
  Users,
  Package,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ogpressing/reveal";

const TRUST_BADGES = [
  { icon: "🇨🇮", label: "Conçu pour la Côte d'Ivoire" },
  { icon: "💰", label: "FCFA & Mobile Money" },
  { icon: "🎁", label: "Essai 7 jours gratuit" },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Décor gradient + halo */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background"
      />
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 -z-10 size-[620px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute right-0 top-40 -z-10 size-72 rounded-full bg-secondary/10 blur-3xl"
      />

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-sm">
              <span aria-hidden>🇨🇮</span> Conçu pour la Côte d&apos;Ivoire
            </Badge>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              La gestion de votre pressing,{" "}
              <span className="text-primary">simplifiée</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              OgPressing digitalise entièrement votre pressing : point de vente,
              suivi par article, tickets QR Code, personnel, stock de biodétergents
              et rapports — tout au même endroit, en français, en FCFA.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild className="w-full sm:w-auto">
                <Link href="#inscription">
                  Essayer gratuitement <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="w-full sm:w-auto"
              >
                <Link href="#fonctionnalites">Découvrir les fonctionnalités</Link>
              </Button>
            </div>
          </Reveal>

          {/* Badges de confiance */}
          <Reveal delay={320}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {TRUST_BADGES.map((b) => (
                <span
                  key={b.label}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm sm:text-sm"
                >
                  <span aria-hidden className="text-base leading-none">
                    {b.icon}
                  </span>
                  {b.label}
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        {/* Mockup dashboard */}
        <Reveal delay={200} className="mx-auto mt-14 max-w-5xl">
          <HeroMockup />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup dashboard (purement décoratif, lucide + Tailwind)           */
/* ------------------------------------------------------------------ */

function HeroMockup() {
  return (
    <div className="relative rounded-2xl border bg-card p-2 shadow-2xl ring-1 ring-black/5 sm:p-3">
      {/* Barre de fenêtre */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="size-2.5 rounded-full bg-danger/70" />
        <span className="size-2.5 rounded-full bg-warning/70" />
        <span className="size-2.5 rounded-full bg-secondary/70" />
        <span className="ml-3 text-xs text-muted-foreground">
          app.ogpressing.ci — Tableau de bord
        </span>
      </div>

      <div className="grid gap-2 rounded-xl bg-muted/40 p-2 sm:grid-cols-3 sm:p-3">
        {/* Colonne KPIs */}
        <div className="space-y-2">
          <KpiCard
            icon={<ShoppingBag className="size-4" />}
            label="Commandes du jour"
            value="38"
            trend="+12%"
          />
          <KpiCard
            icon={<TrendingUp className="size-4" />}
            label="Recette du jour"
            value="142 500 FCFA"
            trend="+8%"
          />
          <KpiCard
            icon={<Clock className="size-4" />}
            label="En production"
            value="23"
            trend="2 en retard"
            trendTone="warning"
          />
        </div>

        {/* Colonne file de production */}
        <div className="rounded-lg border bg-background p-3 sm:col-span-1">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              File de production
            </span>
            <span className="text-[10px] text-muted-foreground">temps réel</span>
          </div>
          <ul className="space-y-1.5">
            {[
              { n: "CMD-1042", s: "Repassage", c: "bg-secondary" },
              { n: "CMD-1041", s: "Lavage", c: "bg-primary" },
              { n: "CMD-1040", s: "Prêt", c: "bg-secondary" },
              { n: "CMD-1039", s: "Livraison", c: "bg-warning" },
            ].map((row) => (
              <li
                key={row.n}
                className="flex items-center justify-between rounded-md bg-muted/60 px-2 py-1.5 text-[11px]"
              >
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <span className={`size-1.5 rounded-full ${row.c}`} />
                  {row.n}
                </span>
                <span className="text-muted-foreground">{row.s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Colonne raccourcis + alerte stock */}
        <div className="space-y-2">
          <div className="rounded-lg border bg-background p-3">
            <span className="text-xs font-semibold text-foreground">
              Raccourcis
            </span>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[
                <ShoppingBag key="s" className="size-4" />,
                <Users key="u" className="size-4" />,
                <Package key="p" className="size-4" />,
                <QrCode key="q" className="size-4" />,
                <TrendingUp key="t" className="size-4" />,
                <ShieldCheck key="sh" className="size-4" />,
              ].map((icon, i) => (
                <span
                  key={i}
                  className="flex aspect-square items-center justify-center rounded-md bg-primary/10 text-primary"
                >
                  {icon}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
            <div className="flex items-start gap-2">
              <Package className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Stock bas : Javel 5L
                </p>
                <p className="text-[11px] text-muted-foreground">
                  2 bidons restants — recommandez.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-secondary/30 bg-secondary/10 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-secondary" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  CMD-1038 livrée
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Payé 4 500 FCFA — espèces.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  trend,
  trendTone = "secondary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
  trendTone?: "secondary" | "warning";
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <span
          className={
            trendTone === "warning"
              ? "text-[10px] font-medium text-warning"
              : "text-[10px] font-medium text-secondary"
          }
        >
          {trend}
        </span>
      </div>
      <p className="mt-2 text-base font-bold text-foreground sm:text-lg">
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
