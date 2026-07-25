/**
 * OgPressing — Section Fonctionnalités (8 cards)
 * ----------------------------------------------
 * Grille de 8 fonctionnalités clés avec icône lucide-react,
 * titre et courte description.
 */
import {
  ShoppingBag,
  Shirt,
  QrCode,
  UserCog,
  Users,
  Package,
  BarChart3,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Reveal } from "@/components/ogpressing/reveal";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: ShoppingBag,
    title: "Point de Vente",
    description:
      "Encaissez les commandes en quelques secondes. Tickets, reçus et caisse automatique sur mobile et desktop.",
  },
  {
    icon: Shirt,
    title: "Suivi par Article",
    description:
      "Suivez chaque vêtement du dépôt à la livraison : lavage, repassage, prêt, retrait. Anomalies signalées.",
  },
  {
    icon: QrCode,
    title: "Tickets QR Code",
    description:
      "Chaque commande reçoit un QR Code unique scannable. Étiquettes code-barres pour les articles.",
  },
  {
    icon: UserCog,
    title: "Gestion du Personnel",
    description:
      "7 rôles avec permissions différenciées : manager, réceptionniste, caissier, laveur, repassage, livreur, comptable.",
  },
  {
    icon: Users,
    title: "CRM Client",
    description:
      "Fichier clients par téléphone, points de fidélité, historique des commandes et remises personnalisées.",
  },
  {
    icon: Package,
    title: "Stock Biodétergents",
    description:
      "Suivi des consommations, alertes de stock bas, mouvements traçables. Plus de rupture en pleine journée.",
  },
  {
    icon: BarChart3,
    title: "Rapports & Statistiques",
    description:
      "Tableaux de bord, suivi des impayés et des dépenses. Pilotez la rentabilité de votre pressing.",
  },
  {
    icon: FileSpreadsheet,
    title: "Exports Excel",
    description:
      "Exportez vos commandes, clients, stock et rapports en un clic (.xlsx) pour votre comptabilité.",
  },
];

export function FeaturesSection() {
  return (
    <section id="fonctionnalites" className="scroll-mt-16 bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Tout ce qu&apos;il faut pour gérer votre pressing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Huit modules intégrés, pensés pour le quotidien des pressings
            ivoiriens.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 80}>
              <Card className="group h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                <CardHeader>
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <f.icon className="size-6" />
                  </div>
                  <CardTitle className="mt-4 text-base font-semibold">
                    {f.title}
                  </CardTitle>
                  <CardDescription className="mt-2 leading-relaxed">
                    {f.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
