/**
 * OgPressing — Footer public
 * --------------------------
 * Footer avec logo, liens de navigation internes, contact réel
 * (email + WhatsApp cliquable), et mentions légales simples.
 *
 * Server component (pas d'interactivité).
 */
import {
  ShoppingBag,
  Mail,
  MessageCircle,
  MapPin,
  ShieldCheck,
} from "lucide-react";

const WHATSAPP_URL = "https://wa.me/2250576103277";
const CONTACT_EMAIL = "ogouromain@gmail.com";
const WHATSAPP_DISPLAY = "+225 05 76 10 32 77";

const FOOTER_LINKS = [
  {
    title: "Produit",
    links: [
      { href: "#fonctionnalites", label: "Fonctionnalités" },
      { href: "#tarifs", label: "Tarifs" },
      { href: "#probleme-solution", label: "Avant / Après" },
      { href: "#temoignages", label: "Témoignages" },
    ],
  },
  {
    title: "Compte",
    links: [
      { href: "/login", label: "Se connecter" },
      { href: "#inscription", label: "S'inscrire" },
      { href: "/activation", label: "Activer un code" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            {/* <a> (hard nav) plutôt que <Link> — évite le fetch RSC bloqué en
                cross-origin dans le preview iframe (cf. Task 17/22). */}
            <a href="/" className="flex items-center gap-2 font-bold text-lg">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShoppingBag className="size-5" />
              </span>
              <span>
                Og<span className="text-primary">Pressing</span>
              </span>
            </a>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              SaaS de gestion professionnelle de pressings pour la Côte
              d&apos;Ivoire. Point de vente, suivi de production, CRM et personnel
              — tout au même endroit.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">
              <ShieldCheck className="size-4 shrink-0 text-warning" />
              <span>Aucun paiement en ligne. Règlement physique hors application.</span>
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {/* <a> pour tous les liens (ancres #... + routes /...).
                        Hard nav pour les routes, hash natif pour les ancres —
                        évite le fetch RSC bloqué en cross-origin (Task 22). */}
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact column */}
          <div className="col-span-2 md:col-span-2 lg:col-span-1">
            <h3 className="text-sm font-semibold text-foreground">Contact</h3>
            <ul className="mt-3 space-y-2.5">
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="flex items-start gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Mail className="mt-0.5 size-4 shrink-0" />
                  <span className="break-all">{CONTACT_EMAIL}</span>
                </a>
              </li>
              <li>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <MessageCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{WHATSAPP_DISPLAY}</span>
                </a>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span>Abidjan, Côte d&apos;Ivoire</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Legal bar */}
        <div className="mt-10 flex flex-col gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} OgPressing — Tous droits réservés.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Mentions légales</span>
            <span aria-hidden>·</span>
            <span>Confidentialité</span>
            <span aria-hidden>·</span>
            <span>CGU</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
