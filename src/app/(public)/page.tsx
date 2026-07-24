/**
 * Page placeholder — Section publique OgPressing.
 *
 * Sera remplacée par la landing page dans le prochain prompt.
 * Affiche un message minimal pour confirmer que la structure fonctionne.
 */
export default function PublicHomePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-5xl">🧺</div>
      <h1 className="text-3xl font-bold text-primary">OgPressing</h1>
      <p className="text-muted-foreground text-center max-w-md">
        SaaS de gestion professionnelle de pressings — Côte d&apos;Ivoire.
      </p>
      <div className="mt-6 text-xs text-muted-foreground border border-border rounded-lg px-4 py-2 bg-muted/30">
        Structure initialisée · En attente des prompts de développement
      </div>
    </main>
  );
}
