/**
 * e-pressing — Footer public (Stitch design)
 * ------------------------------------------
 * Footer sombre (`bg-foreground`) en 3 colonnes :
 *   1. Brand + tagline ("e-pressing")
 *   2. Liens Utiles (titre vert `text-secondary`)
 *   3. Nous contacter (titre vert `text-secondary`)
 *
 * Server component (pas d'interactivité).
 */
import { ShoppingBag, Mail, MessageCircle } from "lucide-react";

const WHATSAPP_URL = "https://wa.me/2250576103277";
const CONTACT_EMAIL = "ogouromain@gmail.com";
const WHATSAPP_DISPLAY = "+225 05 76 10 32 77";

const USEFUL_LINKS = [
  // Pages légales non encore créées — ancres "#" en attendant (placeholder).
  { href: "#", label: "Mentions légales" },
  { href: "#", label: "Politique de confidentialité" },
  { href: "#inscription", label: "Contact" },
];

export function PublicFooter() {
  return (
    <footer className="mt-auto bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          {/* ---------- Colonne 1 : Brand + tagline ---------- */}
          <div>
            <a href="/" className="flex items-center gap-2 font-bold text-lg">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShoppingBag className="size-5" aria-hidden />
              </span>
              <span className="text-background">
                e-<span className="text-primary">pressing</span>
              </span>
            </a>
            <p className="mt-4 max-w-sm text-sm text-background/70">
              Solution de gestion digitale pour les pressings et
              blanchisseries en Côte d&apos;Ivoire. Efficace, Transparente,
              Moderne.
            </p>
          </div>

          {/* ---------- Colonne 2 : Liens Utiles ---------- */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-secondary">
              Liens Utiles
            </h3>
            <ul className="mt-4 space-y-2.5">
              {USEFUL_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-background/70 transition-colors hover:text-background"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ---------- Colonne 3 : Nous contacter ---------- */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-secondary">
              Nous contacter
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="flex items-start gap-2 text-sm text-background/70 transition-colors hover:text-background"
                >
                  <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="break-all">{CONTACT_EMAIL}</span>
                </a>
              </li>
              <li>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 text-sm text-background/70 transition-colors hover:text-background"
                >
                  <MessageCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{WHATSAPP_DISPLAY}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* ---------- Copyright centré ---------- */}
        <div className="mt-10 border-t border-background/10 pt-6 text-center">
          <p className="text-xs text-background/60">
            © {new Date().getFullYear()} e-pressing — Côte d&apos;Ivoire. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
