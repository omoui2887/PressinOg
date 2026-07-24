/**
 * OgPressing — Section Problème / Solution
 * ----------------------------------------
 * Deux colonnes : "Avant ❌" (cahiers, tickets perdus, pas de suivi)
 * vs "Après ✅" (digital, QR Code, suivi temps réel).
 */
import { X, Check, BookText, Ticket, EyeOff, Smartphone, QrCode, Activity } from "lucide-react";
import { Reveal } from "@/components/ogpressing/reveal";
import { cn } from "@/lib/utils";

const BEFORE = [
  { icon: BookText, text: "Cahiers et registres papier difficiles à consolider" },
  { icon: Ticket, text: "Tickets perdus ou illisibles, litiges clients" },
  { icon: EyeOff, text: "Aucun suivi en temps réel de la production" },
  { icon: X, text: "Calculs manuels, erreurs de caisse, oublis d'impayés" },
];

const AFTER = [
  { icon: Smartphone, text: "Tout est digital, accessible sur mobile et desktop" },
  { icon: QrCode, text: "Tickets QR Code scannables, étiquettes code-barres" },
  { icon: Activity, text: "Suivi en temps réel : lavage, repassage, prêt, retrait" },
  { icon: Check, text: "Caisse automatique, rapports et exports Excel fiables" },
];

export function ProblemSolutionSection() {
  return (
    <section id="probleme-solution" className="scroll-mt-16 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Le pressing d&apos;hier vs celui de demain
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Arrêtez de perdre du temps et des clients. Passez du papier au
            digital en une journée.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Avant */}
          <Reveal delay={80}>
            <div className="h-full rounded-2xl border border-danger/20 bg-danger/5 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-danger/15 text-danger">
                  <X className="size-5" />
                </span>
                <h3 className="text-xl font-bold text-foreground">
                  Avant&nbsp;❌
                </h3>
              </div>
              <ul className="mt-6 space-y-4">
                {BEFORE.map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                      <item.icon className="size-3.5" />
                    </span>
                    <span className="text-sm text-foreground/80">
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* Après */}
          <Reveal delay={160}>
            <div className="relative h-full overflow-hidden rounded-2xl border border-secondary/30 bg-secondary/5 p-6 sm:p-8">
              <div
                aria-hidden
                className="absolute -right-12 -top-12 size-40 rounded-full bg-secondary/10 blur-2xl"
              />
              <div className="relative flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary/15 text-secondary">
                  <Check className="size-5" />
                </span>
                <h3 className="text-xl font-bold text-foreground">
                  Après&nbsp;✅
                </h3>
              </div>
              <ul className="relative mt-6 space-y-4">
                {AFTER.map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                        "bg-secondary/15 text-secondary"
                      )}
                    >
                      <item.icon className="size-3.5" />
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
