/**
 * OgPressing — Footer public
 * --------------------------
 * Footer avec liens, contact, mention "aucun paiement en ligne".
 * Server component (pas d'interactivité).
 */
import Link from "next/link";
import { ShoppingBag, Mail, Phone, MapPin, ShieldCheck } from "lucide-react";

const FOOTER_LINKS = [
  {
    title: "Produit",
    links: [
      { href: "#fonctionnalites", label: "Fonctionnalités" },
      { href: "#tarifs", label: "Tarifs" },
      { href: "#etapes", label: "Comment ça marche" },
      { href: "#inscription", label: "S'inscrire" },
    ],
  },
  {
    title: "Compte",
    links: [
      { href: "/login", label: "Se connecter" },
      { href: "/activation", label: "Activer un code" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    title: "Contact",
    links: [
      { href: "mailto:contact@ogpressing.ci", label: "Email" },
      { href: "tel:+2250700000000", label: "Téléphone" },
      { href: "#", label: "WhatsApp" },
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
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShoppingBag className="size-5" />
              </span>
              <span>
                Og<span className="text-primary">Pressing</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              SaaS de gestion professionnelle de pressings pour la Côte d&apos;Ivoire.
              Point de vente, suivi de production, CRM et personnel — tout au même endroit.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
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
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Contact bar */}
        <div className="mt-10 flex flex-col gap-3 border-t pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Mail className="size-4" /> contact@ogpressing.ci
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="size-4" /> +225 07 00 00 00 00
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" /> Abidjan, Côte d&apos;Ivoire
            </span>
          </div>
          <p>© {new Date().getFullYear()} OgPressing — Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}
