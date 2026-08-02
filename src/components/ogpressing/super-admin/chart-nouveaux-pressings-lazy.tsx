/**
 * OgPressing — Wrapper lazy pour ChartNouveauxPressings
 * -----------------------------------------------------
 * Wrapper Client Component qui lazy-load le chart Recharts (~95KB gzippé)
 * via next/dynamic avec ssr:false. Le bundle Recharts n'est téléchargé
 * qu'au moment où le chart devient visible côté client.
 *
 * Pourquoi un wrapper séparé ?
 *   - Le parent (src/app/(super-admin)/super-admin/dashboard/page.tsx) est
 *     un Server Component (data fetching Supabase côté serveur).
 *   - Next.js 16 interdit `dynamic({ ssr: false })` dans un Server Component.
 *   - Ce wrapper est marqué "use client" → il peut utiliser dynamic + ssr:false.
 *
 * Le chart est affiché sous 4 StatCards sur le dashboard super-admin :
 *   - Sur mobile (1 colonne), il est sous la fold → bénéficie du lazy-load.
 *   - Sur desktop (4 colonnes), il est juste sous les cards → bénéficie quand
 *     même d'un différé léger (chart devient interactif après first paint).
 *
 * Pendant le chargement : un Skeleton h-[300px] occupe la place (anti-CLS).
 */
"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChartPoint } from "./chart-nouveaux-pressings";

const ChartNouveauxPressings = dynamic(
  () =>
    import("./chart-nouveaux-pressings").then((m) => m.ChartNouveauxPressings),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full rounded-lg" />,
  }
);

export function ChartNouveauxPressingsLazy({ data }: { data: ChartPoint[] }) {
  return <ChartNouveauxPressings data={data} />;
}

export type { ChartPoint };
