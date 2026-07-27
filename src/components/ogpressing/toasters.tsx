/**
 * OgPressing — Toasters (wrapper client)
 * --------------------------------------
 * Wrapper client pour les deux systèmes de toast (shadcn/ui + Sonner).
 *
 * 🚀 PERF : Ce composant est un Client Component ('use client') qui lazy-load
 * les toasters via next/dynamic avec ssr:false. Les toasters sont des
 * composants lourds (Radix Portal + animations) qui ne sont utiles que si
 * un toast est affiché. En les différant, on évite qu'ils bloquent le
 * First Paint de la page.
 *
 * Placé dans layout.tsx (Server Component) via <Toasters />.
 */
"use client";

import dynamic from "next/dynamic";

const ShadcnToaster = dynamic(
  () => import("@/components/ui/toaster").then((m) => m.Toaster),
  { ssr: false, loading: () => null }
);

const SonnerToaster = dynamic(
  () => import("@/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false, loading: () => null }
);

export function Toasters() {
  return (
    <>
      <ShadcnToaster />
      <SonnerToaster richColors position="top-right" />
    </>
  );
}
