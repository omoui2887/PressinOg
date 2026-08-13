/**
 * e-pressing — Pied de page (LOT 17 — Section H)
 * ----------------------------------------------
 * Footer arrondi (rounded-t-[4rem]) sur fond Bleu Nuit Pressing.
 *
 * Layout en grille :
 *   - Colonne marque : logo + slogan + statut plateforme
 *   - Colonne Produit : Fonctionnalités, Tarifs, Témoignages
 *   - Colonne Compte : Se connecter (/login), Activer mon compte (/activation)
 *   - Colonne Contact : WhatsApp (lien wa.me), email
 *   - Colonne Légal : Politique de confidentialité, Mentions légales
 *
 * Indicateur de statut : point vert pulsant (.ogp-pulse-dot-success) +
 * label IBM Plex Mono "Disponibilité 99.5%".
 */
"use client";

import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#temoignages", label: "Témoignages" },
];

const ACCOUNT_LINKS = [
  { href: "/login", label: "Se connecter" },
  { href: "/activation", label: "Activer mon compte" },
];

const LEGAL_LINKS = [
  { href: "#", label: "Politique de confidentialité" },
  { href: "#", label: "Mentions légales" },
];

const WHATSAPP_URL = "https://wa.me/2250576103277";
const WHATSAPP_DISPLAY = "+225 05 76 10 32 77";
const EMAIL_DISPLAY = "ogouromain@gmail.com";

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-4 font-plex-mono text-[10px] uppercase tracking-[0.2em] text-landing-accent-soft/70">
        {title}
      </h3>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer
      className="relative overflow-hidden rounded-t-[2.5rem] bg-landing-primary-deep sm:rounded-t-[4rem]"
      aria-label="Pied de page e-pressing"
    >
      {/* Halo décoratif en haut */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-landing-accent/40 to-transparent"
        aria-hidden
      />

      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-20 lg:px-8">
        {/* Ligne supérieure : marque + statut */}
        <div className="grid gap-10 border-b border-white/10 pb-12 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          {/* Marque */}
          <div className="md:pr-6">
            <a
              href="/"
              className="flex items-center gap-2 font-jakarta text-lg font-extrabold tracking-tight text-white"
              aria-label="e-pressing — Accueil"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-landing-accent text-sm font-bold text-landing-primary">
                Og
              </span>
              e-<span className="text-landing-accent">pressing</span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
              La gestion moderne de votre pressing, pensée pour la Côte
              d&apos;Ivoire.
            </p>

            {/* Statut plateforme */}
            <div className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-landing-success/30 bg-landing-success/10 px-3 py-1.5">
              <span className="ogp-pulse-dot-success inline-block size-2 rounded-full bg-landing-success" />
              <span className="font-plex-mono text-[10px] uppercase tracking-wider text-landing-success">
                Disponibilité 99.5%
              </span>
            </div>
          </div>

          {/* Colonne Produit */}
          <FooterColumn title="Produit">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="landing-link landing-link-underline text-sm text-white/60 hover:text-white"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </FooterColumn>

          {/* Colonne Compte */}
          <FooterColumn title="Compte">
            {ACCOUNT_LINKS.map((link) => (
              <li key={link.label}>
                {/* <a> hard-nav pour /login et /activation (évite le fetch RSC
                    bloqué en cross-origin dans le preview iframe). */}
                <a
                  href={link.href}
                  className="landing-link landing-link-underline text-sm text-white/60 hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </FooterColumn>

          {/* Colonne Contact */}
          <FooterColumn title="Contact">
            <li>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="landing-link landing-link-underline flex flex-col text-sm text-white/60 hover:text-white"
              >
                <span className="font-plex-mono text-[10px] uppercase tracking-wider text-white/40">
                  WhatsApp
                </span>
                <span>{WHATSAPP_DISPLAY}</span>
              </a>
            </li>
            <li>
              <a
                href={`mailto:${EMAIL_DISPLAY}`}
                className="landing-link landing-link-underline flex flex-col text-sm text-white/60 hover:text-white"
              >
                <span className="font-plex-mono text-[10px] uppercase tracking-wider text-white/40">
                  Email
                </span>
                <span className="break-all">{EMAIL_DISPLAY}</span>
              </a>
            </li>
          </FooterColumn>

          {/* Colonne Légal */}
          <FooterColumn title="Légal">
            {LEGAL_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="landing-link landing-link-underline text-sm text-white/60 hover:text-white"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </FooterColumn>
        </div>

        {/* Ligne inférieure : copyright + rappel CTA */}
        <div className="flex flex-col items-center justify-between gap-6 pt-8 sm:flex-row sm:gap-4">
          <p className="font-plex-mono text-[11px] uppercase tracking-wider text-white/40">
            © {new Date().getFullYear()} e-pressing — Côte d&apos;Ivoire 🇨🇮
          </p>

          <a
            href="#inscription"
            className="landing-cta landing-cta-on-dark !px-5 !py-2 text-xs sm:text-sm"
          >
            <span className="landing-cta-bg" />
            <span className="landing-cta-label">Essayer gratuitement</span>
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
