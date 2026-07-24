/**
 * OgPressing — AdminPagePlaceholder
 * ---------------------------------
 * Page placeholder simple pour les 9 routes /admin/* en attendant le
 * développement complet de chaque module (POS, commandes, clients,
 * personnel, stock, services, rapports, configuration pressing).
 *
 * Server-renderable (pas de "use client") — utilisé directement dans les
 * page.tsx sans frontière client. Le layout (sidebar + bottomNav) est déjà
 * rendu par `(admin)/layout.tsx` via `AdminShell`.
 */
import { type LucideIcon, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AdminPagePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Libellé du badge "bientôt". */
  badge?: string;
}

export function AdminPagePlaceholder({
  title,
  description,
  icon: Icon,
  badge = "Bientôt disponible",
}: AdminPagePlaceholderProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Sparkles className="size-6" />
          </span>
          <Badge variant="secondary" className="mt-4">
            {badge}
          </Badge>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Ce module est en cours de développement. La navigation et
            l&apos;authentification sont opérationnelles — les fonctionnalités
            métier arrivent dans les prochaines étapes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
