/**
 * OgPressing — Landing page publique
 * ----------------------------------
 * Page d'accueil marketing : hero, fonctionnalités, étapes, tarifs,
 * formulaire d'inscription, FAQ.
 *
 * Server component (sections statiques) + InscriptionForm (client) embarqué.
 */
import Link from "next/link";
import {
  ShoppingBag,
  Factory,
  Users,
  UserCog,
  Package,
  BarChart3,
  Check,
  ArrowRight,
  ShieldCheck,
  Zap,
  Smartphone,
  QrCode,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { InscriptionForm } from "@/components/ogpressing";

/* ------------------------------------------------------------------ */
/*  Données                                                           */
/* ------------------------------------------------------------------ */

const FEATURES: {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
}[] = [
  {
    icon: ShoppingBag,
    title: "Point de Vente (POS)",
    description:
      "Encaissez vos commandes en quelques secondes. Tickets QR, étiquettes code-barres, reçus imprimables. Support mobile et desktop.",
    color: "text-primary bg-primary/10",
  },
  {
    icon: Factory,
    title: "Suivi de Production",
    description:
      "Suivez chaque vêtement du dépôt à la livraison : lavage, repassage, prêt, retrait. Anomalies signalées automatiquement.",
    color: "text-secondary bg-secondary/10",
  },
  {
    icon: Users,
    title: "CRM Clients",
    description:
      "Fichier clients par téléphone, points de fidélité, historique des commandes, remises personnalisées.",
    color: "text-primary bg-primary/10",
  },
  {
    icon: UserCog,
    title: "Gestion du Personnel",
    description:
      "7 rôles avec permissions différenciées : manager, réceptionniste, caissier, laveur, repassage, livreur, comptable.",
    color: "text-secondary bg-secondary/10",
  },
  {
    icon: Package,
    title: "Stock & Biodétergents",
    description:
      "Suivi des consommations, alertes de stock bas, mouvements traçables. Plus de rupture de produit en pleine journée.",
    color: "text-warning bg-warning/10",
  },
  {
    icon: BarChart3,
    title: "Rapports & Dépenses",
    description:
      "Tableaux de bord, exports Excel, suivi des impayés et des dépenses. Pilotez la rentabilité de votre pressing.",
    color: "text-primary bg-primary/10",
  },
];

const STEPS: { num: string; title: string; description: string }[] = [
  {
    num: "1",
    title: "Inscrivez-vous",
    description:
      "Remplissez le formulaire ci-dessous. Notre équipe vous contacte sous 24h via WhatsApp pour finaliser votre inscription.",
  },
  {
    num: "2",
    title: "Activez votre compte",
    description:
      "Après règlement physique (espèces, mobile money), recevez votre code d'activation PRS-XXXX-XXXX à usage unique, valide 7 jours.",
  },
  {
    num: "3",
    title: "Gérez votre pressing",
    description:
      "Connectez-vous et commencez à encaisser vos premières commandes. 7 jours d'essai inclus à l'activation.",
  },
];

const PLANS: {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
  cta: string;
}[] = [
  {
    name: "Starter",
    price: "9 900",
    description: "Pour les petits pressings qui démarrent.",
    features: [
      "Point de vente complet",
      "CRM clients (jusqu'à 500)",
      "3 utilisateurs",
      "Tickets QR & code-barres",
      "Support par WhatsApp",
    ],
    cta: "Choisir Starter",
  },
  {
    name: "Pro",
    price: "24 900",
    description: "Le plus populaire. Pour les pressings établis.",
    features: [
      "Tout Starter inclus",
      "Stock & biodétergents",
      "Rapports & exports Excel",
      "8 utilisateurs (tous rôles)",
      "Suivi des dépenses",
      "Support prioritaire",
    ],
    highlight: true,
    cta: "Choisir Pro",
  },
  {
    name: "Business",
    price: "49 900",
    description: "Pour les chaînes de pressings multi-boutiques.",
    features: [
      "Tout Pro inclus",
      "Multi-points de vente",
      "Utilisateurs illimités",
      "Tableaux de bord avancés",
      "Support dédié 7j/7",
      "Formation personnalisée",
    ],
    cta: "Choisir Business",
  },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Comment fonctionne l'activation ?",
    a: "Après votre inscription, notre équipe vous contacte pour le règlement. Vous recevez ensuite un code d'activation au format PRS-XXXX-XXXX, à usage unique et valide 7 jours. Saisissez-le sur la page d'activation avec vos informations de compte pour créer votre pressing.",
  },
  {
    q: "Y a-t-il un essai gratuit ?",
    a: "Oui. À l'activation, vous bénéficiez de 7 jours d'essai complet, sans engagement. À l'issue de l'essai, vous choisissez votre formule (Starter, Pro ou Business) et réglez physiquement la première échéance.",
  },
  {
    q: "Quels moyens de paiement acceptez-vous ?",
    a: "Le règlement de l'abonnement se fait physiquement, hors application : espèces, mobile money ou virement bancaire. OgPressing n'intègre AUCUN paiement en ligne — c'est un principe fondamental de notre service.",
  },
  {
    q: "Mes données sont-elles sécurisées ?",
    a: "Oui. Chaque pressing est strictement isolé grâce au Row Level Security (RLS) de PostgreSQL. Vos données (commandes, clients, stock) ne sont jamais visibles par les autres pressings. Seul le Super Admin OgPressing peut accéder à des données agrégées pour le support.",
  },
  {
    q: "Puis-je gérer plusieurs boutiques ?",
    a: "Le plan Business permet de gérer plusieurs points de vente. Chaque boutique reste isolée avec son propre personnel, ses tarifs et son CRM, mais vous disposez d'une vue consolidée.",
  },
  {
    q: "Quels matériels sont compatibles ?",
    a: "OgPressing fonctionne sur tout navigateur moderne (Chrome, Firefox, Safari). Côté matériel : un smartphone pour le POS mobile, une imprimante thermique pour les tickets (optionnel), un scanner QR/code-barres (optionnel). Aucune installation lourde requise.",
  },
];

const STATS: { value: string; label: string }[] = [
  { value: "17", label: "Tables métier" },
  { value: "7", label: "Rôles personnel" },
  { value: "100%", label: "FCFA local" },
  { value: "0", label: "Paiement en ligne" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function PublicHomePage() {
  return (
    <>
      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden">
        {/* Décor gradient */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background"
        />
        <div
          aria-hidden
          className="absolute -top-24 left-1/2 -z-10 size-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-6 gap-1.5">
              <Zap className="size-3.5" /> Conçu pour la Côte d&apos;Ivoire
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Gérez votre pressing{" "}
              <span className="text-primary">comme un pro</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              OgPressing digitalise votre pressing : point de vente, suivi de production,
              CRM clients, personnel et stock — tout au même endroit, en français,
              en FCFA.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild className="w-full sm:w-auto">
                <Link href="#inscription">
                  Demander une démo <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <Link href="#fonctionnalites">Voir les fonctionnalités</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-secondary" /> Essai 7 jours inclus
              </span>
              <span className="flex items-center gap-1.5">
                <Smartphone className="size-4 text-secondary" /> Mobile-first
              </span>
              <span className="flex items-center gap-1.5">
                <QrCode className="size-4 text-secondary" /> QR & code-barres
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border bg-card p-4 text-center shadow-sm"
              >
                <div className="text-2xl font-bold text-primary sm:text-3xl">
                  {s.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== FONCTIONNALITÉS ===================== */}
      <section id="fonctionnalites" className="scroll-mt-16 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Tout ce qu&apos;il faut pour gérer votre pressing
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Six modules intégrés, pensés pour le quotidien des pressings ivoiriens.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div
                    className={`flex size-11 items-center justify-center rounded-lg ${f.color}`}
                  >
                    <f.icon className="size-6" />
                  </div>
                  <CardTitle className="mt-4 text-lg">{f.title}</CardTitle>
                  <CardDescription className="mt-2 leading-relaxed">
                    {f.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== ÉTAPES ===================== */}
      <section id="etapes" className="scroll-mt-16 bg-muted/30 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Comment ça marche ?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Trois étapes simples pour digitaliser votre pressing.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.num} className="relative">
                {i < STEPS.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute left-12 top-6 hidden h-px w-[calc(100%-3rem)] bg-border md:block"
                  />
                )}
                <div className="relative flex size-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-sm">
                  {step.num}
                </div>
                <h3 className="mt-4 text-xl font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== TARIFS ===================== */}
      <section id="tarifs" className="scroll-mt-16 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Des tarifs simples, en FCFA
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Choisissez votre formule. Règlement physique, hors application.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.highlight
                    ? "border-primary shadow-lg ring-1 ring-primary/20 relative"
                    : "relative"
                }
              >
                {plan.highlight && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Le plus populaire
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-lg text-muted-foreground"> FCFA/mois</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-secondary" />
                        <span className="text-foreground">{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-6 w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    asChild
                  >
                    <Link href="#inscription">{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== INSCRIPTION ===================== */}
      <section
        id="inscription"
        className="scroll-mt-16 bg-muted/30 py-16 sm:py-24"
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Demandez votre démo
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Remplissez ce formulaire. Notre équipe vous contacte sous 24h via WhatsApp.
            </p>
          </div>
          <Card className="mt-10">
            <CardContent className="pt-6">
              <InscriptionForm />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section id="faq" className="scroll-mt-16 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Questions fréquentes
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Tout ce qu&apos;il faut savoir avant de commencer.
            </p>
          </div>
          <Accordion type="single" collapsible className="mt-10">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-base font-medium">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ===================== CTA FINAL ===================== */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-center shadow-lg sm:px-12 sm:py-16">
            <div
              aria-hidden
              className="absolute -right-20 -top-20 size-64 rounded-full bg-white/10 blur-2xl"
            />
            <div
              aria-hidden
              className="absolute -bottom-20 -left-20 size-64 rounded-full bg-white/10 blur-2xl"
            />
            <div className="relative">
              <h2 className="text-3xl font-bold text-primary-foreground sm:text-4xl">
                Prêt à digitaliser votre pressing ?
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-primary-foreground/80">
                Rejoignez les pressings ivoiriens qui gagnent du temps et de l&apos;argent
                avec OgPressing.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  variant="secondary"
                  asChild
                  className="w-full sm:w-auto"
                >
                  <Link href="#inscription">
                    S&apos;inscrire maintenant <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="w-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
                >
                  <Link href="/activation">J&apos;ai un code d&apos;activation</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
