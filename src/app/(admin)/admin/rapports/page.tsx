/**
 * e-pressing — /admin/rapports (LOT 12.1)
 * ----------------------------------------
 * Vue d'ensemble des rapports du pressing : CA, commandes, panier moyen,
 * remises, graphiques (CA par jour, par mode de paiement, par type de
 * service), clients avec impayés et remises appliquées.
 *
 * Server Component — délègue tout le rendu interactif au client orchestrator
 * <RapportsPage /> qui gère la période, le fetch et les sous-composants.
 */
import { RapportsPage } from "@/components/ogpressing/admin/rapports/rapports-page";

export default function Page() {
  return <RapportsPage />;
}
