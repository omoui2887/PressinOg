"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

/**
 * OgPressing — Sonner Toaster (LOT 16.6 — embellissement)
 * =========================================================
 *
 * 4 variantes de toast distinctes visuellement, réutilisées de façon
 * cohérente dans toute l'application via toast.success/error/warning/info :
 *
 *   • Succès   (secondary/vert)  — check-circle, bordure gauche épaisse
 *   • Erreur   (danger/rouge)    — alert-circle, légère secousse à l'apparition
 *   • Avertissement (warning/ambre) — triangle, fond teinté orange
 *   • Information  (primary/bleu)  — info, fond teinté bleu
 *
 * Toutes les variantes ont :
 *   - Une bordure gauche colorée épaisse (4px) pour identification rapide
 *   - Un fond légèrement teinté de la couleur du type
 *   - Une icône lucide-react personnalisée (remplace les emojis par défaut)
 *   - Une fine barre de progression animée en bas (compte à rebours visuel)
 *   - Apparition en slide + fondu (250ms), sortie fluide
 *
 * La barre de progression utilise une animation CSS qui se vide de 100% à 0%
 * pendant la durée d'affichage (4s défaut, 6s erreurs).
 *
 * ⚠️ Les 124 appels toast() existants n'ont PAS besoin d'être modifiés —
 * sonner appelle toast.success/error/warning/info et le styling est appliqué
 * automatiquement via les CSS variables et classNames ci-dessous.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="ogp-toaster"
      position="top-right"
      richColors
      closeButton
      style={
        {
          // Variables CSS consommées par les règles [data-sonner-toast]
          // dans globals.css pour styler chaque variante.
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",

          // Succès — vert (secondary)
          "--success-bg": "var(--secondary-50)",
          "--success-text": "var(--secondary-700)",
          "--success-border": "var(--secondary)",

          // Erreur — rouge (danger)
          "--error-bg": "var(--danger-50)",
          "--error-text": "var(--danger-700)",
          "--error-border": "var(--danger)",

          // Avertissement — ambre (warning)
          "--warning-bg": "var(--warning-50)",
          "--warning-text": "var(--warning-700)",
          "--warning-border": "var(--warning)",

          // Information — bleu (primary)
          "--info-bg": "var(--primary-50)",
          "--info-text": "var(--primary-700)",
          "--info-border": "var(--primary)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group ogp-toast !border-l-4 !border-l-[var(--toast-border-color,var(--border))] !rounded-md !shadow-lg !transition-all !duration-fast !ease-smooth",
          title: "!font-semibold !text-sm",
          description: "!text-xs !opacity-80",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-muted !text-muted-foreground",
          closeButton:
            "!opacity-0 group-hover:!opacity-100 !transition-opacity !duration-fast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
