/**
 * e-pressing — Module client centralisé GSAP + ScrollTrigger
 * ----------------------------------------------------------
 * Centralise l'import de GSAP et du plugin ScrollTrigger pour tous
 * les composants de la landing cinématographique.
 *
 * ## Pourquoi ce module existe
 *
 * Next.js 16 (Turbopack) générait une erreur ChunkLoadError au runtime
 * lorsque les composants utilisaient `await import("gsap/ScrollTrigger")` :
 *
 *   ChunkLoadError: Failed to load chunk
 *   /_next/static/chunks/node_modules_gsap_1m6fnvi._.js
 *   from module gsap/ScrollTrigger [app-client] (ecmascript, async loader)
 *
 * Le chargeur asynchrone de Turbopack crée un chunk séparé pour
 * `gsap/ScrollTrigger` et échoue à le résoudre au runtime.
 *
 * ## Solution
 *
 * Remplacer les imports dynamiques (`await import(...)`) par des imports
 * **statiques** dans un module `'use client'`. Les imports statiques sont
 * résolus au build-time et bundlés directement dans le chunk client —
 * aucun chargeur asynchrone n'est impliqué, et l'erreur disparaît.
 *
 * GSAP core et ScrollTrigger sont SSR-safe : ils vérifient
 * `typeof window !== 'undefined'` avant d'accéder au DOM. Le module
 * `'use client'` est néanmoins évalué côté serveur pendant le SSR, donc
 * on garde un garde-fou explicite sur `registerPlugin`.
 *
 * ## Utilisation
 *
 * ```ts
 * import { gsap, ScrollTrigger } from "@/lib/gsap/client";
 *
 * useEffect(() => {
 *   const ctx = gsap.context(() => {
 *     gsap.from("[data-anim]", { y: 40, opacity: 0, scrollTrigger: { ... } });
 *   }, rootRef);
 *   return () => ctx.revert();
 * }, []);
 * ```
 */
"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Enregistrer le plugin ScrollTrigger une seule fois.
// On garde le garde-fou `typeof window` pour éviter tout effet de bord
// pendant l'évaluation du module côté serveur (SSR), même si GSAP est
// censé être SSR-safe.
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger };
