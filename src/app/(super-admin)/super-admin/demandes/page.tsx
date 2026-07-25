/**
 * OgPressing — /super-admin/demandes
 * -----------------------------------
 * Gestion des demandes d'inscription (LOT 5.2).
 *
 * Accès : Super Admin uniquement (vérifié côté middleware + layout du route
 * group `(super-admin)` qui re-vérifie l'appartenance à `super_admins`).
 *
 * Server Component minimal — la page cliente `DemandesPage` fetch elle-même
 * les données via GET /api/super-admin/demandes pour éviter les problèmes de
 * navigation RSC (cf. worklog Task 17/23) et permettre le filtre côté client
 * avec debounce sans navigation URL.
 *
 * Fonctionnalités (cf. spec LOT 5.2) :
 *   - Filtres : statut (Tous / En attente / Contactée / Validée / Refusée) +
 *     recherche texte libre (nom, nom du pressing, téléphone)
 *   - Liste en tableau (desktop) / cards (mobile) :
 *     Date, Nom + Prénom, Nom du pressing, Ville, Téléphone, Statut, Actions
 *   - Sheet de détails avec : bouton Appeler, bouton WhatsApp, Textarea
 *     "Notes internes" (auto-save), bouton "Marquer comme contactée",
 *     bouton "Valider et générer un code d'activation" (choix plan +
 *     génération code PRS-XXXX-XXXX + dialog avec "Copier" et "Envoyer par
 *     WhatsApp"), bouton "Refuser" (confirmation AlertDialog)
 *   - Pagination (20/page)
 */
import { DemandesPage } from "@/components/ogpressing/super-admin/demandes/demandes-page";

export const dynamic = "force-dynamic";

export default function DemandesSuperAdminPage() {
  return <DemandesPage />;
}
